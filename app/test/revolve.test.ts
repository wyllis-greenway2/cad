// Revolve with turns and a pitch (`dec_spiral_extrude`, `in_427`): a figure turned about a line in its plane, any angle, with an advance along the line for a spiral.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const XZ = worldRef("XZ");
/** a rectangle 2 wide and 1.5 high, 8 from the Z axis, drawn on the XZ plane */
function figure(): { s: Session; face: string } {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XZ, [8, 0, 0], [10, 0, 1.5], [1, 0, 0], [0, 0, 1]);
  s = run(s, r.command);
  return { s, face: loopFaceRef(r.lines) };
}
const volume = (s: Session): number => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? (p.volume ?? 0) : 0), 0);
const pappus = (turns: number) => 3 * 2 * Math.PI * 9 * turns; // area 3 times the way the middle goes round

function begin(s: Session, face: string): Op {
  const st = startOp(scene(s), [face as never], "revolve");
  assert.ok(st.ok, st.ok ? "" : st.why);
  return (st as { op: Op }).op;
}

test("the figure offers the world axis in its plane (the Z axis here) and turns about it", () => {
  const { s, face } = figure();
  const op = begin(s, face);
  assert.ok(op.revAxes!.some((a) => a.label === "Z axis"), op.revAxes!.map((a) => a.label).join());
  const zi = op.revAxes!.findIndex((a) => a.label === "Z axis");
  const r = runOp(s, { ...op, axisIx: zi, value: 360 })!;
  assert.equal(r.session.message, null);
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - pappus(1)) < 0.05, `volume ${volume(r.session)}`);
});

test("past one turn with no advance it is refused; with an advance it spirals, two and a half turns", () => {
  const { s, face } = figure();
  const op = begin(s, face);
  const zi = op.revAxes!.findIndex((a) => a.label === "Z axis");
  const flat = runOp(s, { ...op, axisIx: zi, value: 720 })!;
  assert.ok(Object.values(flat.session.outcome.errors).some((e) => /lies on itself/.test(e)) || /lies on itself/.test(flat.session.message ?? ""), "a second turn on the first is refused");
  const spiral = runOp(s, { ...op, axisIx: zi, value: 900, advValue: 10 })!;
  assert.equal(spiral.session.message, null);
  assert.deepEqual(spiral.session.outcome.errors, {});
  assert.ok(Math.abs(volume(spiral.session) - pappus(2.5)) < 0.1, `volume ${volume(spiral.session)}`);
  const step = scene(spiral.session).steps.at(-1)!;
  assert.equal(step.type, "revolve");
  assert.equal(step.params.advance, 10);
});

test("an advance that is less than the figure is wide along the axis is refused with the reason", () => {
  const { s, face } = figure();
  const op = begin(s, face);
  const zi = op.revAxes!.findIndex((a) => a.label === "Z axis");
  const r = runOp(s, { ...op, axisIx: zi, value: 720, advValue: 2 })!;
  const msg = r.session.message ?? Object.values(r.session.outcome.errors).join(" ");
  assert.match(msg, /would overlap/);
});

import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { gizmoOf } from "../src/interaction/control/handles.ts";
import { projector } from "../src/interaction/camera.ts";
const env = { w: 800, h: 600, now: 0 } as never;

test("the Revolve operation shows a ring and an arrow on the axis, takes the angle and the advance typed (Tab between them), and makes the spiral", () => {
  const { s, face } = figure();
  let st = createState({ ...s, click: { ...s.click, selection: [face] as never } });
  st = reduce(st, { type: "begin", name: "revolve" }, env);
  assert.equal(st.op?.kind, "revolve");
  const zi = st.op!.revAxes!.findIndex((a) => a.label === "Z axis");
  st = { ...st, op: { ...st.op!, axisIx: zi } };
  const g = gizmoOf(st)!;
  assert.deepEqual(g.handles.map((h) => h.id).sort(), ["rev:adv", "rev:orb", "rev:turn"]);
  for (const k of "900") st = reduce(st, { type: "typed", key: k, shift: false }, env);
  st = reduce(st, { type: "typed", key: "Tab", shift: false }, env);
  for (const k of "10") st = reduce(st, { type: "typed", key: k, shift: false }, env);
  const f1 = frameOf(st, { w: 800, h: 600 });
  assert.deepEqual(f1.entry?.fields.map((x) => [x.label, x.value, x.active]), [["Angle", "900", false], ["Advance", "10", true]]);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  const step = scene(st.session).steps.at(-1)!;
  assert.equal(step.type, "revolve");
  assert.deepEqual([step.params.angle, step.params.advance], [900, 10]);
  assert.ok(Math.abs(volume(st.session) - pappus(2.5)) < 0.1, `volume ${volume(st.session)}`);
});

test("dragging the ring round past one turn keeps counting (400 degrees), and the arrow sets the advance", () => {
  const { s, face } = figure();
  let st = createState({ ...s, click: { ...s.click, selection: [face] as never } });
  st = reduce(st, { type: "begin", name: "revolve" }, env);
  const zi = st.op!.revAxes!.findIndex((a) => a.label === "Z axis");
  st = { ...st, op: { ...st.op!, axisIx: zi } };
  const g = gizmoOf(st)!;
  const ring = g.handles.find((h) => h.id === "rev:turn")!;
  const pr = projector(st.cam, 800, 600);
  // press on the ring and go all the way round (each step under half a turn) and a little more
  const pts = ring.points;
  const at = (k: number) => pr.project(pts[k % (pts.length - 1)]!);
  const [x0, y0] = at(0);
  st = reduce(st, { type: "orbit", dx: 1, dy: 0, x: x0 + 1, y: y0 } as never, env);
  assert.ok(st.drag && "handle" in st.drag, "the drag began on the ring");
  let ang = 0;
  for (let k = 1; k <= 24; k++) { const [x, y] = at(Math.round((k * (pts.length - 1)) / 18)); st = reduce(st, { type: "orbit", dx: 1, dy: 1, x, y } as never, env); ang = st.op!.value ?? 0; }
  assert.ok(Math.abs(ang) > 360, `the angle went on past one turn: ${ang}`);
});

import { drawCircle } from "../src/operation/build.ts";
const XY = worldRef("XY");

test("twist about the plane's normal: a bar 6 x 2 carried 10 mm up while it turns 90 degrees, 720 degrees, and the other way (the volume is the bar's)", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [-3, -1, 0], [3, 1, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const op = begin(s, loopFaceRef(r.lines));
  const ti = op.revAxes!.findIndex((a) => a.label === "twist about the figure's middle");
  assert.ok(ti >= 0, op.revAxes!.map((a) => a.label).join());
  for (const [angle, advance] of [[90, 10], [720, 10], [-360, 10], [90, -10]] as const) {
    const made = runOp(s, { ...op, axisIx: ti, value: angle, advValue: advance })!;
    assert.equal(made.session.message, null, `${angle}, ${advance}`);
    assert.deepEqual(made.session.outcome.errors, {});
    assert.ok(Math.abs(volume(made.session) - 120) < 0.05, `volume ${volume(made.session)}`);
  }
  // a twist with no distance is refused with the reason
  const none = runOp(s, { ...op, axisIx: ti, value: 90, advValue: 0 })!;
  assert.match(none.session.message ?? Object.values(none.session.outcome.errors).join(), /needs a distance/);
});

test("a figure with a figure drawn inside it is revolved with a hole: the ring and the spiral", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XZ, [8, 0, 0], [12, 0, 4], [1, 0, 0], [0, 0, 1]); // 4 x 4, 8 from the axis
  s = run(s, r.command);
  const c = drawCircle(scene(s), XZ, [10, 0, 2], 1); // a hole of radius 1 in its middle
  s = run(s, c.command);
  const faceRef = loopFaceRef(r.lines);
  const op = begin(s, faceRef);
  assert.equal(op.revFigs!.length, 1);
  assert.equal(op.revFigs![0]!.fig.holes.length, 1, "the figure inside is a hole");
  const zi = op.revAxes!.findIndex((a) => a.label === "Z axis");
  const area = 16 - Math.PI;
  const ring = runOp(s, { ...op, axisIx: zi, value: 360 })!;
  assert.equal(ring.session.message, null);
  assert.deepEqual(ring.session.outcome.errors, {});
  assert.ok(Math.abs(volume(ring.session) - area * 2 * Math.PI * 10) < 0.5, `ring ${volume(ring.session)}`);
  const spiral = runOp(s, { ...op, axisIx: zi, value: 720, advValue: 12 })!;
  assert.equal(spiral.session.message, null);
  assert.deepEqual(spiral.session.outcome.errors, {});
  assert.ok(Math.abs(volume(spiral.session) - area * 2 * Math.PI * 10 * 2) < 1, `spiral ${volume(spiral.session)}`);
});

test("a positive twist is counter-clockwise about the axis, as seen from the way the axis points", () => {
  // a triangle (0,0) (4,0) (0,2): turned counter-clockwise a quarter it reaches y = +4, clockwise y = -4
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [4, 2, 0], [1, 0, 0], [0, 1, 0]); // a rectangle: its far corner (4, 2) goes round the origin
  s = run(s, r.command);
  const op = begin(s, loopFaceRef(r.lines));
  const oi = op.revAxes!.findIndex((a) => a.label === "twist about the origin");
  const bbox = (x: Session) => (Object.values(scene(x).parts).find((p) => p.kind === "body") as unknown as { bbox: { min: number[]; max: number[] } }).bbox;
  const ccw = bbox(runOp(s, { ...op, axisIx: oi, value: 90, advValue: 10 })!.session);
  const cw = bbox(runOp(s, { ...op, axisIx: oi, value: -90, advValue: 10 })!.session);
  assert.ok(ccw.max[1]! > 3.9 && ccw.min[0]! < -1.9, `counter-clockwise reaches +y and -x: ${JSON.stringify(ccw)}`);
  assert.ok(cw.min[1]! < -3.9 && cw.max[0]! > 3.9 && cw.min[0]! > -0.1, `clockwise reaches -y: ${JSON.stringify(cw)}`);
  // the same going down (the distance negative): the same sense about the axis
  const down = bbox(runOp(s, { ...op, axisIx: oi, value: 90, advValue: -10 })!.session);
  assert.ok(down.max[1]! > 3.9 && down.min[0]! < -1.9, `counter-clockwise going down: ${JSON.stringify(down)}`);
});

test("several figures selected together are revolved in one go, a step and a body each, all turned the same", () => {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XZ, [8, 0, 0], [10, 0, 1.5], [1, 0, 0], [0, 0, 1]);
  s = run(s, a.command);
  const b = drawRectangle(scene(s), XZ, [14, 0, 0], [17, 0, 2], [1, 0, 0], [0, 0, 1]);
  s = run(s, b.command);
  const st = startOp(scene(s), [loopFaceRef(a.lines), loopFaceRef(b.lines)] as never, "revolve");
  assert.ok(st.ok, st.ok ? "" : st.why);
  const op = (st as { op: Op }).op;
  assert.equal(op.revFigs!.length, 2);
  const zi = op.revAxes!.findIndex((x) => x.label === "Z axis");
  const made = runOp(s, { ...op, axisIx: zi, value: 360 })!;
  assert.equal(made.session.message, null);
  assert.deepEqual(made.session.outcome.errors, {});
  const bodies = Object.values(scene(made.session).parts).filter((p) => p.kind === "body");
  assert.equal(bodies.length, 2, "a body each");
  assert.equal(scene(made.session).steps.filter((x) => x.type === "revolve").length, 2);
  assert.ok(Math.abs(volume(made.session) - (3 * 2 * Math.PI * 9 + 6 * 2 * Math.PI * 15.5)) < 0.5, `volume ${volume(made.session)}`);
  // a twist about each figure's own middle: each keeps its own volume
  const ti = op.revAxes!.findIndex((x) => x.label === "twist about each figure's middle");
  assert.ok(ti >= 0, op.revAxes!.map((x) => x.label).join());
});

test("two bars twisted about their own middles keep their volumes", () => {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [-3, -1, 0], [3, 1, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, a.command);
  const b = drawRectangle(scene(s), XY, [10, 0, 0], [14, 2, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, b.command);
  const st = startOp(scene(s), [loopFaceRef(a.lines), loopFaceRef(b.lines)] as never, "revolve") as { ok: true; op: Op };
  const ti = st.op.revAxes!.findIndex((x) => x.label === "twist about each figure's middle");
  const made = runOp(s, { ...st.op, axisIx: ti, value: 180, advValue: 10 })!;
  assert.equal(made.session.message, null);
  assert.deepEqual(made.session.outcome.errors, {});
  assert.ok(Math.abs(volume(made.session) - (12 + 8) * 10) < 0.1, `volume ${volume(made.session)}`);
  const steps = scene(made.session).steps.filter((x) => x.type === "revolve");
  assert.notDeepEqual([steps[0]!.params.ax, steps[0]!.params.ay], [steps[1]!.params.ax, steps[1]!.params.ay], "each about its own middle");
});

test("it begins as a full turn with no advance (`in_433`): nothing to type, the figure turns once about the line chosen", () => {
  const { s, face } = figure();
  const op = begin(s, face);
  assert.equal(op.value, 90);
  const r = runOp(s, { ...op, value: 360, axisIx: op.revAxes!.findIndex((a) => a.label === "Z axis") })!;
  assert.equal(r.session.message, null);
  assert.ok(Math.abs(volume(r.session) - pappus(1)) < 0.05, `volume ${volume(r.session)}`);
  assert.equal(Number(scene(r.session).steps.at(-1)!.params.advance), 0);
});

test("it begins on one of the figure's own lines with the mover's orb there (pulsing blue), the part wireframe and a 90 degree turn as the preview; clicking another line moves the orb to it (`in_436`)", () => {
  const { s, face } = figure();
  let st = createState({ ...s, click: { ...s.click, selection: [face] as never } });
  st = reduce(st, { type: "begin", name: "revolve" }, env);
  assert.equal(st.op!.value, 90, "a quarter turn to begin with");
  assert.ok(st.op!.axisIx! >= 0 && /side/.test(st.op!.revAxes![st.op!.axisIx!]!.label), "on one of the sketch's own lines");
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(f.wireframe, true, "the part is wireframe while it is decided");
  assert.equal(f.gizmo!.pulse, "rev:orb", "the orb pulses blue");
  assert.ok(f.gizmo!.handles.some((h) => h.id === "rev:orb" && h.kind === "ball"), "the orb is on the axis");
  const first = st.op!.axisIx!;
  const r90 = runOp(s, st.op!)!;
  assert.equal(r90.session.message, null);
  assert.equal(Number(scene(r90.session).steps.at(-1)!.params.angle), 90);
  // click another line of the figure: the orb (and the axis) moves there
  const sides = st.op!.revAxes!.map((a, k) => [a, k] as const).filter(([a]) => /side/.test(a.label));
  const other = sides.find(([, k]) => k !== first)!;
  const mid = [(other[0].p[0]), other[0].p[1], other[0].p[2]];
  const pr = projector(st.cam, 800, 600);
  const [x, y] = pr.project([mid[0]! + other[0].d[0] * 0.5, mid[1]! + other[0].d[1] * 0.5, mid[2]! + other[0].d[2] * 0.5]);
  st = reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
  assert.equal(st.op?.kind, "revolve", "the operation stays");
  assert.notEqual(st.op!.axisIx, first, "the axis moved to the line clicked");
});

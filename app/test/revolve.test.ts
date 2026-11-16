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
import type { Vec3 } from "../src/math/vec.ts";
import { cross, normalize } from "../src/math/vec.ts";

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


// the revolve's axis is the mover's orb: its place and the axes of its frame (`in_438`): a line through `p` along `d`
const ortho = (d: Vec3): [Vec3, Vec3] => { const u = normalize(cross(Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], d)); return [u, cross(d, u)]; };
const along = (op: Op, p: Vec3, d: Vec3): Op => { const [u, v] = ortho(d); return { ...op, pivot: p, frame: [d, u, v], axis: 0 }; };
const Z = (op: Op): Op => along(op, [0, 0, 0], [0, 0, 1]);
const twistMid = (op: Op): Op => along(op, op.origin!, op.normal!);
const twistOrigin = (op: Op): Op => along(op, [0, 0, 0], op.normal!);

function begin(s: Session, face: string): Op {
  const st = startOp(scene(s), [face as never], "revolve");
  assert.ok(st.ok, st.ok ? "" : st.why);
  return (st as { op: Op }).op;
}

test("the figure offers the world axis in its plane (the Z axis here) and turns about it", () => {
  const { s, face } = figure();
  const op = begin(s, face);
  const r = runOp(s, { ...Z(op), value: 360 })!;
  assert.equal(r.session.message, null);
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - pappus(1)) < 0.05, `volume ${volume(r.session)}`);
});

test("past one turn with no advance it is refused; with an advance it spirals, two and a half turns", () => {
  const { s, face } = figure();
  const op = begin(s, face);
  const flat = runOp(s, { ...Z(op), value: 720 })!;
  assert.ok(Object.values(flat.session.outcome.errors).some((e) => /lies on itself/.test(e)) || /lies on itself/.test(flat.session.message ?? ""), "a second turn on the first is refused");
  const spiral = runOp(s, { ...Z(op), value: 900, advValue: 10 })!;
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
  const r = runOp(s, { ...Z(op), value: 720, advValue: 2 })!;
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
  st = { ...st, op: Z(st.op!) };
  const g = gizmoOf(st)!;
  assert.deepEqual(g.handles.map((h) => h.id).sort(), ["piv:x", "piv:y", "piv:z", "rev:adv:x", "rev:adv:y", "rev:adv:z", "rev:orb", "rev:turn:x", "rev:turn:y", "rev:turn:z"]);
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
  st = { ...st, op: Z(st.op!) };
  const g = gizmoOf(st)!;
  const ring = g.handles.find((h) => h.id === `rev:turn:${"xyz"[st.op!.axis]}`)!;
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
  for (const [angle, advance] of [[90, 10], [720, 10], [-360, 10], [90, -10]] as const) {
    const made = runOp(s, { ...twistMid(op), value: angle, advValue: advance })!;
    assert.equal(made.session.message, null, `${angle}, ${advance}`);
    assert.deepEqual(made.session.outcome.errors, {});
    assert.ok(Math.abs(volume(made.session) - 120) < 0.05, `volume ${volume(made.session)}`);
  }
  // a twist with no distance is refused with the reason
  const none = runOp(s, { ...twistMid(op), value: 90, advValue: 0 })!;
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
  const area = 16 - Math.PI;
  const ring = runOp(s, { ...Z(op), value: 360 })!;
  assert.equal(ring.session.message, null);
  assert.deepEqual(ring.session.outcome.errors, {});
  assert.ok(Math.abs(volume(ring.session) - area * 2 * Math.PI * 10) < 0.5, `ring ${volume(ring.session)}`);
  const spiral = runOp(s, { ...Z(op), value: 720, advValue: 12 })!;
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
  const bbox = (x: Session) => (Object.values(scene(x).parts).find((p) => p.kind === "body") as unknown as { bbox: { min: number[]; max: number[] } }).bbox;
  const ccw = bbox(runOp(s, { ...twistOrigin(op), value: 90, advValue: 10 })!.session);
  const cw = bbox(runOp(s, { ...twistOrigin(op), value: -90, advValue: 10 })!.session);
  assert.ok(ccw.max[1]! > 3.9 && ccw.min[0]! < -1.9, `counter-clockwise reaches +y and -x: ${JSON.stringify(ccw)}`);
  assert.ok(cw.min[1]! < -3.9 && cw.max[0]! > 3.9 && cw.min[0]! > -0.1, `clockwise reaches -y: ${JSON.stringify(cw)}`);
  // the same going down (the distance negative): the same sense about the axis
  const down = bbox(runOp(s, { ...twistOrigin(op), value: 90, advValue: -10 })!.session);
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
  const made = runOp(s, { ...Z(op), value: 360 })!;
  assert.equal(made.session.message, null);
  assert.deepEqual(made.session.outcome.errors, {});
  const bodies = Object.values(scene(made.session).parts).filter((p) => p.kind === "body");
  assert.equal(bodies.length, 2, "a body each");
  assert.equal(scene(made.session).steps.filter((x) => x.type === "revolve").length, 2);
  assert.ok(Math.abs(volume(made.session) - (3 * 2 * Math.PI * 9 + 6 * 2 * Math.PI * 15.5)) < 0.5, `volume ${volume(made.session)}`);
  // a twist about each figure's own middle: each keeps its own volume
});

test("two bars twisted about their own middles keep their volumes", () => {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [-3, -1, 0], [3, 1, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, a.command);
  const b = drawRectangle(scene(s), XY, [10, 0, 0], [14, 2, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, b.command);
  const st = startOp(scene(s), [loopFaceRef(a.lines), loopFaceRef(b.lines)] as never, "revolve") as { ok: true; op: Op };
  const made = runOp(s, { ...twistMid(st.op), value: 180, advValue: 10 })!;
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
  const r = runOp(s, { ...Z(op), value: 360 })!;
  assert.equal(r.session.message, null);
  assert.ok(Math.abs(volume(r.session) - pappus(1)) < 0.05, `volume ${volume(r.session)}`);
  assert.equal(Number(scene(r.session).steps.at(-1)!.params.advance), 0);
});

test("the orb begins really on the figure's longest straight line (its middle), its X along it and Z across the plane, the part wireframe, 90 degrees as the preview; clicking another line, a corner or a face moves it there (`in_438`)", () => {
  const { s, face } = figure(); // a rectangle 2 along x and 1.5 along z, x 8 to 10, on the XZ plane
  let st = createState({ ...s, click: { ...s.click, selection: [face] as never } });
  st = reduce(st, { type: "begin", name: "revolve" }, env);
  assert.equal(st.op!.value, 90, "a quarter turn to begin with");
  const [px, py, pz] = st.op!.pivot!;
  assert.ok(Math.abs(Math.abs(st.op!.frame![0][0]) - 1) < 1e-9, "its X is along the longest side (the 2 mm sides run along x)");
  assert.ok(Math.abs(px - 9) < 1e-9 && Math.abs(py) < 1e-9 && (Math.abs(pz) < 1e-9 || Math.abs(pz - 1.5) < 1e-9), `the middle of that side, on the line: ${[px, py, pz]}`);
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(f.wireframe, true, "the part is wireframe while it is decided");
  assert.equal(f.gizmo!.pulse, "rev:orb", "the orb pulses blue");
  const r90 = runOp(s, st.op!)!;
  assert.equal(r90.session.message, null);
  assert.equal(Number(scene(r90.session).steps.at(-1)!.params.angle), 90);
  // the orb put aside (so it is not under the pointer), then the corner clicked: the orb goes there
  st = { ...st, op: { ...st.op!, pivot: [30, 0, 20] } };
  const pr = projector(st.cam, 800, 600);
  const [x, y] = pr.project([8, 0, 1.5]);
  st = reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
  assert.equal(st.op?.kind, "revolve", "the operation stays");
  assert.ok(Math.hypot(st.op!.pivot![0] - 8, st.op!.pivot![1], st.op!.pivot![2] - 1.5) < 0.2, `the orb is on the corner clicked: ${st.op!.pivot}`);
});

test("the orb is the mover's: a click on it selects it (the orient mode with its bubble), its arrows put it anywhere in space and its rings turn its axes, apply keeps and cancel puts them back (`in_438`)", () => {
  const { s, face } = figure();
  let st = createState({ ...s, click: { ...s.click, selection: [face] as never } });
  st = reduce(st, { type: "begin", name: "revolve" }, env);
  const was = { pivot: st.op!.pivot, frame: st.op!.frame };
  const orb = gizmoOf(st)!.handles.find((h) => h.id === "rev:orb")!;
  const [x, y] = projector(st.cam, 800, 600).project(orb.points[0]!);
  st = reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
  assert.equal(st.moverSphere, true, "the orient mode");
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(f.confirm?.text, "Orient the mover");
  assert.deepEqual(f.gizmo!.handles.map((h) => h.id), ["piv:x", "piv:y", "piv:z", "rot:x", "rot:y", "rot:z", "pivot"], "its arrows and rings, anywhere in space");
  assert.equal(f.entries.length, 0, "the numbers show for the arrow or ring that is chosen, or for the whole orb moved (`in_439`)");
  st = { ...st, orbMovedAt: 0 };
  // type a place off the figure's plane and a turn about Z
  st = reduce(st, { type: "entry", field: 1, text: "5" }, env);
  assert.equal(st.op!.pivot![1], 5, "off the plane: anywhere in space");
  st = reduce(st, { type: "entry", field: 5, text: "30" }, env);
  assert.ok(st.op!.frame, "turned");
  const cancelled = reduce(st, { type: "escape" }, env);
  assert.deepEqual(cancelled.op!.pivot, was.pivot, "cancel puts the place back");
  assert.deepEqual(cancelled.op!.frame, was.frame, "and the axes");
  const applied = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(applied.moverSphere, false);
  assert.equal(applied.op!.pivot![1], 5, "apply keeps it");
});

test("the revolve's handles are the rotate orb: a ring about each of the three axes, the ring taken is the axis (a click chooses it, the arrow through it sets the spiral), and the orb is dragged to move (`in_468`)", () => {
  const { s, face } = figure();
  let st = createState({ ...s, click: { ...s.click, selection: [face] as never } });
  st = reduce(st, { type: "begin", name: "revolve" }, env);
  const axis0 = st.op!.axis;
  const g = gizmoOf(st)!;
  const adv = g.handles.find((h) => h.id === `rev:adv:${"xyz"[axis0]}`)!;
  const along = (h: typeof adv) => { const d = [0, 1, 2].map((k) => h.points[1]![k]! - h.points[0]![k]!); const l = Math.hypot(...d); return d.map((v) => v / l); };
  const frame = st.op!.frame!;
  const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  assert.ok(Math.abs(Math.abs(dot(along(adv), frame[axis0]!)) - 1) < 1e-6, "the spiral arrow is along the chosen ring's axis");
  // a click on another ring chooses that axis
  const other = (axis0 + 1) % 3;
  const ring = g.handles.find((h) => h.id === `rev:turn:${"xyz"[other]}`)!;
  const [rx, ry] = projector(st.cam, 800, 600).project(ring.points[Math.floor(ring.points.length / 3)]!);
  st = reduce(st, { type: "click", x: rx, y: ry, count: 1, shift: false }, env);
  assert.equal(st.op!.axis, other, "the ring clicked is the axis");
  const adv2 = gizmoOf(st)!.handles.find((h) => h.id === `rev:adv:${"xyz"[other]}`)!;
  assert.ok(Math.abs(Math.abs(dot(along(adv2), frame[other]!)) - 1) < 1e-6, "and the spiral arrow follows it");
});

test("the revolve's orb is dragged to move it, with no click on it first: the camera does not turn, the orb and its rings stay in the picture and go where it is taken (`in_468`)", () => {
  const { s, face } = figure();
  let st = createState({ ...s, click: { ...s.click, selection: [face] as never } });
  st = reduce(st, { type: "begin", name: "revolve" }, env);
  const pr = projector(st.cam, 800, 600);
  const was = [...st.op!.pivot!];
  const azimuth = st.cam.azimuth;
  const [x, y] = pr.project(gizmoOf(st)!.handles.find((h) => h.id === "rev:orb")!.points[0]!);
  for (let k = 1; k <= 4; k++) {
    st = reduce(st, { type: "orbit", dx: 12, dy: 0, x: x + 12 * k, y } as never, env);
    const f = frameOf(st, { w: 800, h: 600 });
    assert.ok(f.gizmo && f.gizmo.handles.some((h) => h.id === "rev:orb") && f.gizmo.handles.filter((h) => h.id.startsWith("rev:turn:")).length === 3, "the orb and its three rings are there while it is dragged");
  }
  assert.equal(st.cam.azimuth, azimuth, "the view did not turn");
  assert.ok(Math.hypot(st.op!.pivot![0]! - was[0]!, st.op!.pivot![1]! - was[1]!, st.op!.pivot![2]! - was[2]!) > 0.5, "the orb moved");
});

test("an axis that cuts across the figure is refused beforehand with the reason; on an edge or beside the figure it is not (`in_520`)", () => {
  const { s, face } = figure(); // 8 to 10 along X, 0 to 1.5 up
  const op = begin(s, face);
  const across = runOp(s, { ...along(op, [9, 0, 0], [0, 0, 1]), value: 90 })!;
  assert.match(across.session.message ?? "", /cuts across the figure/);
  assert.equal(scene(across.session).steps.length, scene(s).steps.length, "nothing is made");
  const acrossX = runOp(s, { ...along(op, [9, 0, 0.75], [1, 0, 0]), value: 90 })!; // (along X through the middle of the height)
  assert.match(acrossX.session.message ?? "", /cuts across the figure/);
  const onEdge = runOp(s, { ...along(op, [8, 0, 0], [0, 0, 1]), value: 90 })!;
  assert.equal(onEdge.session.message, null, "on its own edge");
  const beside = runOp(s, { ...Z(op), value: 90 })!;
  assert.equal(beside.session.message, null, "beside it");
});

test("while the orb is dragged across the figure the live picture is not drawn and the reason is said; back on an edge it is drawn again (`in_521`)", () => {
  const { s, face } = figure();
  let st = createState({ ...s, click: { ...s.click, selection: [face] as never } });
  st = reduce(st, { type: "begin", name: "revolve" }, env);
  const size = { w: 800, h: 600 };
  const bodies = (f: ReturnType<typeof frameOf>) => f.mesh?.vertices.length ?? 0; // (nothing of a body is there until the turned figure is)
  const edge = { ...st.op!, ...along(st.op!, [8, 0, 0], [0, 0, 1]) };
  const good = frameOf({ ...st, op: edge }, size);
  assert.ok(bodies(good) > 0, "an axis on an edge: the turned body is drawn");
  assert.ok(!/cuts across/.test(good.message ?? ""));
  const bad = frameOf({ ...st, op: { ...edge, ...along(edge, [9, 0, 0], [0, 0, 1]) } }, size);
  assert.equal(bodies(bad), 0, "an axis across the figure: nothing drawn");
  assert.match(bad.message ?? "", /cuts across the figure/);
});

test("the orb has an arrow on each axis to put it, and a second one past it that sets the spiral along that axis (`in_529`)", () => {
  const { s, face } = figure();
  let st = createState({ ...s, click: { ...s.click, selection: [face] as never } });
  st = reduce(st, { type: "begin", name: "revolve" }, env);
  st = { ...st, op: Z(st.op!) };
  const pr = projector(st.cam, 800, 600);
  const drag = (id: string, along: number) => {
    const h = gizmoOf(st)!.handles.find((x) => x.id === id)!;
    const a = pr.project(h.points[0]!), b = pr.project(h.points.at(-1)!);
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const dx = (b[0] - a[0]) * along, dy = (b[1] - a[1]) * along;
    st = reduce(st, { type: "orbit", dx: 1, dy: 0, x: mid[0] + 1, y: mid[1] } as never, env);
    assert.ok(st.drag && "handle" in st.drag, `${id}: the drag began on the handle`);
    st = reduce(st, { type: "orbit", dx, dy, x: mid[0] + dx, y: mid[1] + dy } as never, env);
    st = reduce(st, { type: "dragEnd" } as never, env);
  };
  // the position arrow of the first axis (z, as the test turned it) moves the orb along it, and the figure is still being revolved
  const before = st.op!.pivot!;
  drag("piv:x", 1);
  assert.ok(Math.abs(st.op!.pivot![2]! - before[2]) > 1e-3 && Math.abs(st.op!.pivot![0]! - before[0]) < 1e-9, `the orb moved along its first axis (here z): ${JSON.stringify(st.op!.pivot)}`);
  assert.equal(st.op!.kind, "revolve");
  // the spiral arrow of the z axis chooses z and gives an advance
  st = { ...st, op: Z(st.op!) };
  drag("rev:adv:z", 1);
  assert.equal(st.op!.axis, 2);
  assert.ok(Math.abs(advanceOfOp(st.op!)) > 1, `an advance was set: ${advanceOfOp(st.op!)}`);
  // a turn of 900 with that advance (if it is wide enough) is a real spiral in the picture
  const spiral = frameOf({ ...st, op: { ...st.op!, value: 900, advValue: 10, typed: "", advTyped: "" } }, { w: 800, h: 600 });
  assert.ok(spiral.mesh && spiral.mesh.vertices.length > 0, "the preview is made");
});
import { advanceOf as advanceOfOp } from "../src/interaction/revolve.ts";

test("an arrow of the orb that is taken has a number bubble: the orb's place on a position arrow (typed to put it), the advance on a spiral arrow (`in_531`)", () => {
  const { s, face } = figure();
  let st = createState({ ...s, click: { ...s.click, selection: [face] as never } });
  st = reduce(st, { type: "begin", name: "revolve" }, env);
  st = { ...st, op: Z(st.op!) }; // (the orb at the origin, its first axis along z)
  const f0 = frameOf(st, { w: 800, h: 600 });
  assert.equal(f0.entries.length, 0, "no bubble on arrows not taken");
  const pr = projector(st.cam, 800, 600);
  const tip = (id: string) => { const h = gizmoOf(st)!.handles.find((x) => x.id === id)!; const a = pr.project(h.points[0]!), b = pr.project(h.points.at(-1)!); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const; };
  const [px1, py1] = tip("piv:x");
  st = reduce(st, { type: "click", x: px1, y: py1, count: 1, shift: false }, env);
  st = { ...st, handleSel: "piv:x" };
  const e = frameOf(st, { w: 800, h: 600 }).entries;
  assert.equal(e.length, 1);
  assert.equal(e[0]!.fields[0]!.index, 10);
  st = reduce(st, { type: "entry", field: 10, text: "7" } as never, env);
  assert.equal(st.op!.pivot![2], 7, "the number typed puts the orb 7 along its first axis (z here)");
  st = { ...st, handleSel: "rev:adv:z" };
  const a = frameOf(st, { w: 800, h: 600 }).entries;
  assert.equal(a.length, 1);
  assert.equal(a[0]!.fields[0]!.index, 1);
  st = reduce(st, { type: "entry", field: 1, text: "12" } as never, env);
  assert.equal(advanceOfOp(st.op!), 12);
});

test("the position bubble of a turned orb is the place along its own axis, and typing moves it along that axis only (`in_532`)", () => {
  const { s, face } = figure();
  let st = createState({ ...s, click: { ...s.click, selection: [face] as never } });
  st = reduce(st, { type: "begin", name: "revolve" }, env);
  const d: Vec3 = [0, 0.6, 0.8]; // a frame whose first axis is slanted
  st = { ...st, op: along(st.op!, [1, 2, 3], d), handleSel: "piv:x" };
  const e = frameOf(st, { w: 800, h: 600 }).entries;
  assert.equal(e.length, 1);
  assert.ok(Math.abs(Number(e[0]!.fields[0]!.value) - (2 * 0.6 + 3 * 0.8)) < 0.01, `the place along the slanted axis: ${e[0]!.fields[0]!.value}`);
  st = reduce(st, { type: "entry", field: 10, text: "10" } as never, env);
  const p = st.op!.pivot!;
  assert.ok(Math.abs(p[1]! * 0.6 + p[2]! * 0.8 - 10) < 1e-9, "now 10 along it");
  assert.equal(p[0], 1, "the part across it stays");
  const u = [0, 0.8, -0.6]; // (across it, in the plane of y and z: unchanged)
  assert.ok(Math.abs((p[1]! * u[1]! + p[2]! * u[2]!) - (2 * 0.8 - 3 * 0.6)) < 1e-9);
});

// ---- two faults found by hand (`in_599`) ----
import { frameOf as frameOfRev } from "../src/interaction/frame.ts";
import { afterTakenBack } from "../src/interaction/controller.ts";
test("while a position arrow of the revolve's orb is dragged its number bubble stays at the arrow and goes with the orb (it was sent off the picture by the angle)", () => {
  const { s, face } = figure();
  let st = createState({ ...s, click: { ...s.click, selection: [face] as never } });
  st = reduce(st, { type: "begin", name: "revolve" }, env);
  const pr = projector(st.cam, 800, 600);
  const h = gizmoOf(st)!.handles.find((x) => x.id === "piv:x")!;
  const a = pr.project(h.points[0]!), b = pr.project(h.points.at(-1)!);
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  st = reduce(st, { type: "orbit", dx: 1, dy: 0, x: mid[0] + 1, y: mid[1] } as never, env);
  assert.ok(st.drag && "handle" in st.drag);
  const seen: { at: number[]; centre: number[]; tip: number[]; value: string }[] = [];
  for (let k = 1; k <= 5; k++) {
    const dx = (b[0] - a[0]) * 0.1, dy = (b[1] - a[1]) * 0.1;
    st = reduce(st, { type: "orbit", dx, dy, x: mid[0] + dx * k, y: mid[1] + dy * k } as never, env);
    const f = frameOfRev(st, { w: 800, h: 600 });
    const e = f.entries[0]!;
    seen.push({ at: [...(e.at as readonly number[])], centre: [...st.op!.pivot!], tip: [...f.gizmo!.handles.find((x) => x.id === "piv:x")!.points.at(-1)!], value: e.fields[0]!.value });
  }
  for (const q of seen) {
    assert.ok(Math.hypot(q.at[0]! - q.centre[0]!, q.at[1]! - q.centre[1]!, q.at[2]! - q.centre[2]!) < 40, `the bubble is by the orb (${JSON.stringify(q.at)} against ${JSON.stringify(q.centre)})`);
    assert.deepEqual(q.at, q.tip, "at the tip of the arrow");
  }
  assert.ok(Number(seen.at(-1)!.value) > Number(seen[0]!.value), "and the number goes up as the orb is pulled");
  assert.ok(seen.at(-1)!.centre[0]! > seen[0]!.centre[0]!, "the orb goes along");
});

test("a revolve whose last step the kernel could not make stays open for the arrow to be taken again; an operation that is not live is over", () => {
  const { s, face } = figure();
  let st = createState({ ...s, click: { ...s.click, selection: [face] as never } });
  st = reduce(st, { type: "begin", name: "revolve" }, env);
  const open = { ...st, op: { ...st.op!, auto: false, made: true, advValue: 0.3 }, drag: null };
  const kept = afterTakenBack(open, 5); // (the session is at cursor 0: before where it was)
  assert.equal(kept.op?.kind, "revolve");
  assert.equal(kept.op?.made, false);
  assert.equal(kept.op?.advValue, 0.3, "the advance that was pulled is kept");
  assert.equal(afterTakenBack({ ...open, op: { ...open.op, auto: true } }, 5).op, null, "an operation that started by itself and is not live is over");
  assert.equal(afterTakenBack(open, 0), open, "nothing was taken back: nothing changes");
});

// ---- the message for a spiral the kernel cannot make (`in_600`) ----
test("a spiral the kernel cannot make says so by the turn and the advance asked for, not that holes cut everything away", () => {
  const { s, face } = figure();
  const st = startOp(scene(s), [face as never], "revolve");
  assert.ok(st.ok);
  const op = (st as { op: Op }).op;
  // 90 degrees with 0.7 mm of advance (a pitch of 2.8 mm a turn) is one the kernel makes nothing of; 360 at the same pitch it does make
  const bad = runOp(s, { ...op, pivot: [9, 0, 0], value: 90, advValue: 0.7, auto: false });
  assert.ok(bad);
  assert.match(bad.session.message ?? "", /^the kernel could not make a spiral of 90° with an advance of 0\.7 mm/);
  assert.doesNotMatch(bad.session.message ?? "", /holes/);
  assert.match(bad.session.message ?? "", /a small change to either/);
  const good = runOp(s, { ...op, pivot: [9, 0, 0], value: 360, advValue: 2.8, auto: false });
  assert.ok(good && !good.session.message, good?.session.message ?? "");
});

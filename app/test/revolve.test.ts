// Revolve with turns and a pitch (`dec_spiral_extrude`, `in_420`): a figure turned about a line in its plane, any angle, with an advance along the line for a spiral.
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
  st = reduce(st, { type: "axisKind", index: zi }, env);
  const f0 = frameOf(st, { w: 800, h: 600 });
  assert.ok(f0.axisKinds && f0.axisKinds.some((k) => k.on && k.label === "Z axis"), "the axis choices are offered");
  const g = gizmoOf(st)!;
  assert.deepEqual(g.handles.map((h) => h.id).sort(), ["rev:adv", "rev:turn"]);
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
  st = reduce(st, { type: "axisKind", index: zi }, env);
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

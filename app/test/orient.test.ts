// The orient mode on the repeats and the mirror (`in_440`): the orb can be put and turned, and the copies, turns and planes run along its axes.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run, selection } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { diskFaceRef } from "../src/operation/loops.ts";
import { nextId } from "../src/operation/scene.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera, projector } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { gizmoOf } from "../src/interaction/control/handles.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { patternCommand } from "../src/interaction/pattern.ts";
import { BODY_OBJECT } from "../src/compiler/body.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 } as never;
const turnedZ: [Vec3, Vec3, Vec3] = [[0, 1, 0], [-1, 0, 0], [0, 0, 1]]; // the mover turned a quarter about Z: its X is the world Y

function block(): Session { // 10 x 6 x 4 from (2, 1, 0)
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [2, 1, 0], [12, 7, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 4 } } });
}
const bbox = (s: Session) => s.outcome.kernel!.bbox!;
const sel = (st: AppState, refs: string[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs as never } } });

test("a linear copy of a body made with the mover turned runs along its axes: three copies 30 apart along the mover's X, which is the world Y", () => {
  const s = block();
  const r = startOp(scene(s), [BODY_OBJECT] as never, "linear");
  assert.ok(r.ok);
  const op: Op = { ...(r as { op: Op }).op, frame: turnedZ, pat: ["3", "30", "", "", "", ""] };
  const cmd = patternCommand(scene(s), op)!;
  const made = run(s, cmd);
  assert.equal(made.message, null);
  assert.deepEqual(made.outcome.errors, {});
  const b = bbox(made);
  assert.ok(Math.abs(b.max[1]! - (7 + 60)) < 1e-6 && Math.abs(b.min[1]! - 1) < 1e-6, `along Y: ${b.min} ${b.max}`);
  assert.ok(Math.abs(b.max[0]! - 12) < 1e-6 && Math.abs(b.min[0]! - 2) < 1e-6, "not along X");
});

test("a circular copy of a drawn figure turns about the mover's axis through its place: a quarter turn about a slanted axis puts the copy where the turn does", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [10, 0, 0], 2);
  s = run(s, c.command);
  const r = startOp(scene(s), [diskFaceRef(c.circle)] as never, "circular");
  assert.ok(r.ok);
  // the axis is the mover's Z, which the frame stands along the world Y (a turn about Y through the origin takes (10, 0, 0) to (0, 0, -10) for 90 degrees)
  const op: Op = { ...(r as { op: Op }).op, frame: [[1, 0, 0], [0, 0, 1], [0, 1, 0]], pat: ["2", "90", "2", "0", "0", "0"], axis: 2 };
  const out = run(s, patternCommand(scene(s), op)!);
  assert.equal(out.message, null);
  const centres = Object.values(scene(out).parts).filter((p) => p.kind === "corner").map((p) => (p as unknown as { at: number[] }).at);
  assert.ok(centres.some((a) => Math.hypot(a[0]!, a[1]!, a[2]! + 10) < 1e-6) || centres.some((a) => Math.hypot(a[0]!, a[1]!, a[2]! - 10) < 1e-6), `a copy at (0, 0, ±10): ${JSON.stringify(centres)}`);
});

test("a mirror with the mover turned: its plane is across the chosen axis of the frame at the orb's place", () => {
  const s = block();
  const r = startOp(scene(s), [BODY_OBJECT] as never, "mirror");
  assert.ok(r.ok);
  const op0 = (r as { op: Op }).op;
  // the mover's X is the world Y: the arrow of that axis (x) is across Y; the plane stands where the orb is moved to (y = 20), 0 from it
  const op: Op = { ...op0, frame: turnedZ, pivot: [7, 20, 2], mirrorAxis: 0, mirrorAt: [7, 0, 0] };
  const m = runOp(s, op)!;
  assert.equal(m.session.message, null);
  assert.deepEqual(m.session.outcome.errors, {});
  const b = bbox(m.session);
  assert.ok(Math.abs(b.max[1]! - 39) < 1e-6, `the copy across y = 20: ${b.max}`); // (the block is y 1 to 7; across 20 it is 33 to 39)
});

test("the orient mode on a mirror: the orb is clicked, the mover turned by a typed angle, the check keeps it, and the plane follows the turned axes", () => {
  const s = block();
  let st = { ...createState({ ...s, click: { ...s.click, selection: [BODY_OBJECT] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "mirror" }, env);
  const orb = gizmoOf(st)!.handles.find((h) => h.id === "mir:orb")!;
  const [x, y] = projector(st.cam, 800, 600).project(orb.points[0]!);
  st = reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
  assert.equal(st.moverSphere, true, "the orient mode");
  assert.deepEqual(gizmoOf(st)!.handles.map((h) => h.id), ["piv:x", "piv:y", "piv:z", "rot:x", "rot:y", "rot:z", "pivot"]);
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(f.confirm?.text, "Orient the mover");
  st = reduce(st, { type: "entry", field: 5, text: "45" }, env);
  assert.ok(st.op!.frame, "turned");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.moverSphere, false, "applied");
  assert.equal(st.op?.kind, "mirror", "back to the mirror");
  assert.ok(st.op!.frame, "which keeps the turned axes");
  const g = gizmoOf(st)!;
  const ax = g.handles.find((h) => h.id === "mir:x")!;
  const d = [0, 1, 2].map((i) => ax.points[1]![i]! - ax.points[0]![i]!);
  assert.ok(Math.abs(d[2]!) < 1e-9 && Math.abs(Math.abs(d[0]!) - Math.abs(d[1]!)) < 1e-6, `the arrow stands at 45 degrees now: ${d}`);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const step = scene(st.session).steps.at(-1)!;
  assert.equal(step.params.mode, "mirror");
  assert.ok(Math.abs(Math.abs(Number(step.params.nx)) - Math.SQRT1_2) < 1e-6, `the plane's normal is the turned axis: ${step.params.nx}, ${step.params.ny}`);
});

test("the orient mode on a linear repeat: the orb of its arrows is clicked, the mover turned, the arrows run along the turned axes, and the repeat made then copies along them", () => {
  const s = block();
  let st = { ...createState({ ...s, click: { ...s.click, selection: [BODY_OBJECT] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: "op:linear" }, env);
  assert.ok(st.repeat, "a repeat is open");
  const orb = gizmoOf(st)!.handles.find((h) => h.id === "lin:orb")!;
  const [x, y] = projector(st.cam, 800, 600).project(orb.points[0]!);
  st = reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
  assert.equal(st.moverSphere, true, "the orient mode on the repeat");
  assert.equal(st.op, null, "the repeat stays a repeat");
  st = reduce(st, { type: "entry", field: 5, text: "90" }, env); // a quarter about Z
  assert.ok(st.repeat!.op.frame, "the repeat's mover is turned");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env); // the check: applies the orient mode
  assert.equal(st.moverSphere, false);
  assert.ok(st.repeat, "the repeat goes on");
  const g = gizmoOf(st)!;
  const lx = g.handles.find((h) => h.id === "lin:x")!;
  const d = [0, 1, 2].map((i) => lx.points[1]![i]! - lx.points[0]![i]!);
  assert.ok(Math.abs(d[0]!) < 1e-6 && Math.abs(d[1]!) > 1, `the first arrow runs along the world Y now: ${d}`);
});

test("the orient mode on a circular repeat: its orb is the pivot point; a typed place moves the point, Esc (cancel) puts it back, and the rings about the turned axes are the axes it turns about", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [10, 0, 0], 2);
  s = run(s, c.command);
  let st = { ...createState({ ...s, click: { ...s.click, selection: [diskFaceRef(c.circle)] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: "op:circular" }, env);
  assert.ok(st.repeat?.pivot, "the pivot point is a part of the drawing");
  const at0 = () => (scene(st.session).parts[st.repeat!.pivot!.point] as unknown as { at: number[] }).at.slice();
  const before = at0();
  const orb = gizmoOf(st)!.handles.find((h) => h.id === "pivot")!;
  const [x, y] = projector(st.cam, 800, 600).project(orb.points[0]!);
  st = reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
  assert.equal(st.moverSphere, true);
  st = reduce(st, { type: "entry", field: 0, text: "3" }, env);
  assert.ok(Math.abs(at0()[0]! - 3) < 1e-6, `the pivot point moved: ${at0()}`);
  st = reduce(st, { type: "entry", field: 3, text: "90" }, env); // the axes turned a quarter about X
  assert.ok(st.repeat!.op.frame);
  st = reduce(st, { type: "escape" }, env); // cancel: back as it was
  assert.equal(st.moverSphere, false);
  assert.ok(Math.abs(at0()[0]! - before[0]!) < 1e-6, "the pivot point is back");
  assert.equal(st.repeat!.op.frame, undefined, "and the axes");
  assert.ok(st.repeat, "the repeat is still open");
});

test("a linear copy of a drawn figure made with the mover turned runs along its axes too (the repeat keeps the axes with its numbers)", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [4, 3, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const st0 = startOp(scene(s), [...r.corners, ...r.lines] as never, "linear");
  assert.ok(st0.ok);
  const op: Op = { ...(st0 as { op: Op }).op, frame: turnedZ, pat: ["2", "10", "", "", "", ""] };
  const made = run(s, patternCommand(scene(s), op)!);
  assert.equal(made.message, null);
  const ys = Object.values(scene(made).parts).filter((p) => p.kind === "corner").map((p) => (p as unknown as { at: number[] }).at[1]!);
  assert.ok(Math.max(...ys) > 12.9 && Math.min(...ys) < 0.1, `the copy is 10 along Y: ${Math.min(...ys)}..${Math.max(...ys)}`);
  assert.equal(scene(made).patterns![0]!.params.length, 15, "the six numbers and the three axes");
});

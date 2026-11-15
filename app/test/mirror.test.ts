// A mirror copy of a drawn figure or a body (`in_433`).
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle, drawChain } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { nextId } from "../src/operation/scene.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { BODY_OBJECT } from "../src/compiler/body.ts";

await kernel.init();
const XY = worldRef("XY");
const volume = (s: Session): number => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? (p.volume ?? 0) : 0), 0);
const corners = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as unknown as { at: number[] }).at);

/** a block 10 x 6 x 4 from (2, 1, 0) */
function block(): Session {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [2, 1, 0], [12, 7, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 4 } } });
}
const begin = (s: Session, sel: string[]): Op => { const r = startOp(scene(s), sel as never, "mirror"); assert.ok(r.ok, r.ok ? "" : r.why); return (r as { op: Op }).op; };

test("a body is copied as its reflection across the side of its box, joined to it where they touch: the volume doubles and the box is twice as long", () => {
  const s = block();
  const op = begin(s, [BODY_OBJECT]);
  const r = runOp(s, { ...op, mirrorAxis: 0 })!; // (it begins with the plane at the far side of the block: across x = 12)
  assert.equal(r.session.message, null);
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - 2 * 240) < 0.5, `volume ${volume(r.session)}`);
  const bb = r.session.outcome.kernel!.bbox!;
  assert.ok(Math.abs(bb.max[0]! - 22) < 1e-6 && Math.abs(bb.min[0]! - 2) < 1e-6, `${bb.min} ${bb.max}`);
});

test("across the world's plane through the origin the copy is on the other side and stands apart: two bodies", () => {
  const s = block();
  const op = begin(s, [BODY_OBJECT]);
  const r = runOp(s, { ...op, mirrorAxis: 0, mirrorAt: [0, 0, 0] })!; // (the plane moved to the world\'s YZ plane through the origin)
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - 480) < 0.5);
  const bb = r.session.outcome.kernel!.bbox!;
  assert.ok(Math.abs(bb.min[0]! + 12) < 1e-6 && Math.abs(bb.max[0]! - 12) < 1e-6, `${bb.min} ${bb.max}`);
});

test("a drawn figure is copied as its reflection: an L of three sides across the world's YZ plane; the copy is a repeat that follows the original", () => {
  let s = createSession(kernel);
  const r = drawChain(scene(s), XY, [[2, 1, 0], [6, 1, 0], [6, 4, 0]]);
  s = run(s, r.command);
  const before = corners(s).length;
  const op = begin(s, [...r.corners, ...r.lines] as string[]);
  assert.equal(op.target, "plane");
  const out = runOp(s, { ...op, mirrorAxis: 0, mirrorAt: [0, 0, 0] })!;
  assert.equal(out.session.message, null);
  const after = corners(out.session);
  assert.equal(after.length, before * 2, "a copy of each corner");
  for (const c of [[-2, 1], [-6, 1], [-6, 4]]) assert.ok(after.some((a) => Math.abs(a[0]! - c[0]!) < 1e-9 && Math.abs(a[1]! - c[1]!) < 1e-9), `a corner at ${c}`);
});

test("nothing to mirror is refused; it begins with the plane at the right-hand side of what is selected, the arrows of the mover standing in the middle", () => {
  const s = createSession(kernel);
  assert.equal(startOp(scene(s), [] as never, "mirror").ok, false);
  const op = begin(block(), [BODY_OBJECT]);
  assert.equal(op.mirrorAxis, 0);
  assert.deepEqual(op.mirrorAt, [12, 7, 4]);
});

import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { homeCamera, projector } from "../src/interaction/camera.ts";
import { gizmoOf } from "../src/interaction/control/handles.ts";
import type { Vec3 } from "../src/math/vec.ts";
const env = { w: 800, h: 600, now: 0 } as never;

test("the Mirror operation has no buttons: three arrows from the middle of the block and an orb, the chosen arrow's plane drawn, its number typed or pulled, Enter makes it (`in_437`)", () => {
  const s = block();
  let st = { ...createState({ ...s, click: { ...s.click, selection: [BODY_OBJECT] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "mirror" }, env);
  assert.equal(st.op?.kind, "mirror");
  const f = frameOf(st, { w: 800, h: 600 });
  assert.deepEqual(f.gizmo!.handles.map((h) => h.id), ["mir:orb", "mir:x", "mir:y", "mir:z"]);
  assert.equal(f.gizmo!.pulse, undefined, "the orb does not pulse: only the orient mode does (`in_439`)");
  assert.equal(f.wireframe, true, "the body is wireframe so the plane inside it shows");
  assert.equal(f.sectionPlanes.length, 1, "the plane of the chosen arrow is drawn");
  assert.equal(f.entries.length, 1, "only the chosen arrow's number");
  assert.equal(f.entries[0]!.fields[0]!.value, "12");
  // take the z arrow: its plane is the one now; type where it stands
  const g = gizmoOf(st)!;
  const arrow = g.handles.find((h) => h.id === "mir:z")!;
  const mid = [0, 1, 2].map((i) => (arrow.points[0]![i]! + arrow.points[1]![i]!) / 2) as unknown as Vec3;
  const [x, y] = projector(st.cam, 800, 600).project(mid);
  st = reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
  assert.equal(st.op!.mirrorAxis, 2, "taking the arrow chooses the plane across it");
  st = reduce(st, { type: "entry", field: 2, text: "6" }, env);
  assert.equal(st.op!.mirrorAt![2], 6);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const step = scene(st.session).steps.at(-1)!;
  assert.equal(step.params.mode, "mirror");
  assert.equal(step.params.nz, 1);
  assert.equal(step.params.pz, 6);
  assert.ok(Math.abs(volume(st.session) - 480) < 0.5, `the copy is the block reflected across z = 6: ${volume(st.session)}`);
});

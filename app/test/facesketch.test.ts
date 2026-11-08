// A sketch drawn on a face of the body belongs to it and goes with the whole body (`in_234`, `dec_sketch_on_face_follows_body`).
import test from "node:test";
import assert from "node:assert/strict";
import type { Vec3 } from "../src/math/vec.ts";
import { dot, sub } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, undoLast } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { worldRef } from "../src/shared/ref.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { BODY_OBJECT } from "../src/compiler/body.ts";
import { createState } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { normalOfPlane } from "../src/operation/part.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const XY = worldRef("XY");

/** A 40 x 20 x 20 block, and a free drawing on the ground beside it. */
function block(): Session {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  const free = drawSquaredRectangle(scene(s), XY, [60, 0, 0], [80, 10, 0], [1, 0, 0], [0, 1, 0]);
  return run(s, free.command);
}
const bodyFace = (s: Session, z: number) => Object.values(scene(s).parts).find((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !p.curved && !p.rounded && Math.abs(p.at[2] - z) < 1e-6 && Math.abs(normalOfPlane(p)[2]) > 0.99)!;
const drawnCorners = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "corner" && p.origin === "drawn" && !!p.plane && !p.derived);

function withInset(): { s: Session; inset: Ref[]; top: Extract<Part, { kind: "plane" }> } {
  let s = block();
  const top = bodyFace(s, 20);
  assert.ok(top, "the top face");
  const op = startOp(scene(s), [top.ref], "offset");
  assert.ok(op.ok, op.ok ? "" : op.why);
  s = runOp(s, { ...op.op, value: -3 })!.session;
  const insetPlane = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "drawn" && (p as { onBody?: boolean }).onBody);
  assert.ok(insetPlane, "the plane made from the face says it belongs to the body");
  const inset = Object.values(scene(s).parts).filter((p) => p.kind === "corner" && p.plane === insetPlane!.ref).map((p) => p.ref);
  assert.equal(inset.length, 4);
  return { s, inset, top };
}
type Ref = import("../src/shared/ref.ts").Ref;

test("a sketch drawn on a face goes with the body when it is turned; a free drawing that lies where a face is does not", () => {
  const { s, inset } = withInset();
  const before = new Map(drawnCorners(s).map((p) => [p.ref, (p as unknown as { at: Vec3 }).at]));
  const op = startOp(scene(s), [BODY_OBJECT], "rotate");
  assert.ok(op.ok);
  const turned = runOp(s, { ...op.op, axis: 1, value: 30, pivot: [20, 10, 10] })!.session;
  assert.equal(turned.message, null);
  const after = new Map(drawnCorners(turned).map((p) => [p.ref, (p as unknown as { at: Vec3 }).at]));
  for (const r of inset) assert.ok(Math.hypot(...sub(after.get(r)!, before.get(r)!)) > 1, `${r} moved with the body`);
  // and it is still on the face: every corner of the inset lies in the body's face plane
  const topNow = Object.values(scene(turned).parts).find((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !p.curved && !p.rounded && Math.abs(dot(normalOfPlane(p), [Math.sin(Math.PI / 6), 0, Math.cos(Math.PI / 6)])) > 0.999 && dot(normalOfPlane(p), [Math.sin(Math.PI / 6), 0, Math.cos(Math.PI / 6)]) > 0)!;
  assert.ok(topNow, "the face, turned");
  for (const r of inset) assert.ok(Math.abs(dot(normalOfPlane(topNow), sub(after.get(r)!, topNow.at))) < 1e-3, `${r} is on the face`);
  // the free rectangle beside it stayed
  const free = [...before.keys()].filter((r) => !inset.includes(r) && Math.abs(before.get(r)![0] - 60) < 1e-6 || Math.abs(before.get(r)![0] - 80) < 1e-6);
  assert.ok(free.length >= 2);
  for (const r of free) assert.ok(Math.hypot(...sub(after.get(r)!, before.get(r)!)) < 1e-9, `${r} (a free drawing) did not move`);
});

test("moved: the sketch on the face moves with the body, and undoing the turn puts both back", () => {
  const { s, inset } = withInset();
  const op = startOp(scene(s), [BODY_OBJECT], "move");
  assert.ok(op.ok);
  const moved = runOp(s, { ...op.op, axis: 0, value: 7 })!.session;
  const at = (x: Session, r: Ref) => (scene(x).parts[r] as unknown as { at: Vec3 }).at;
  for (const r of inset) assert.ok(Math.abs(at(moved, r)[0] - at(s, r)[0] - 7) < 1e-9, `${r} moved by 7`);
  const back = undoLast(moved);
  for (const r of inset) assert.ok(Math.hypot(...sub(at(back, r), at(s, r))) < 1e-9, `${r} is back`);
});

test("after the body is turned, the inset on its face can still be pushed into the part and cuts it", () => {
  const { s, inset } = withInset();
  const turn = startOp(scene(s), [BODY_OBJECT], "rotate");
  assert.ok(turn.ok);
  const turned = runOp(s, { ...turn.op, axis: 1, value: 30, pivot: [20, 10, 10] })!.session;
  const sc = scene(turned);
  const face = Object.values(sc.parts).find((p) => p.kind === "face" && p.origin === "drawn" && p.loop.length === 4 && p.corners.every((c) => inset.includes(c)))!;
  assert.ok(face, "the inset is a face (a closed figure)");
  const vol = turned.outcome.kernel!.volume!;
  const ex = startOp(sc, [face.ref], "extrude");
  assert.ok(ex.ok);
  const cut = runOp(turned, { ...ex.op, value: -4 })!.session;
  assert.equal(cut.message, null);
  assert.ok(cut.outcome.kernel!.volume! < vol - 1, `the pocket is cut (${vol} -> ${cut.outcome.kernel!.volume})`);
});

test("while the body is dragged round, the sketch on its face is drawn going with it (no kernel)", () => {
  const { s, inset } = withInset();
  const op = startOp(scene(s), [BODY_OBJECT], "rotate");
  assert.ok(op.ok);
  const st = { ...createState(s), op: { ...op.op, axis: 1 as const, value: 30, pivot: [20, 10, 10] as Vec3 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.bodyMatrix, "the body is drawn by a matrix");
  const was = (scene(s).parts[inset[0]!] as unknown as { at: Vec3 }).at;
  const now = (f.scene.parts[inset[0]!] as unknown as { at: Vec3 }).at;
  assert.ok(Math.hypot(...sub(now, was)) > 1, "the sketch is drawn turned");
});

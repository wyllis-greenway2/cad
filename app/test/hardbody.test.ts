// Hard bodies (`dec_hard_bodies`, `in_473`): a body made hard stops against another hard body while it is moved by hand.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run, saveText, openSession } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 } as never;
const A = "b/x_s_100/o", B = "b/x_s_101/o";

/** two blocks 10 x 10 x 10, one at x 0..10 and one at x 30..40, each a body of its own */
function two(): Session {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const b = drawRectangle(scene(s), XY, [30, 0, 0], [40, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  return run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: b.lines, params: { depth: 10, mode: "new" } } } as never);
}
const hardOf = (s: Session, refs: string[]): Session => {
  const st = reduce({ ...createState({ ...s, click: { ...s.click, selection: refs as never } }), cam: homeCamera() }, { type: "runAction", id: "body:hard" }, env);
  return st.session;
};
const box = (s: Session, ref: string) => (scene(s).parts[ref] as unknown as { bbox: { min: number[]; max: number[] } }).bbox;
const moveBy = (s: Session, free: [number, number, number], typed = ""): { session: Session } | null => {
  const st = startOp(scene(s), [A] as never, "move", null);
  assert.ok(st.ok);
  return runOp(s, { ...(st as { op: Op }).op, free, ...(typed ? { typed } : {}) });
};

test("two bodies are soft until made hard: a block moved through the other goes right through it", () => {
  const s = two();
  assert.equal(scene(s).hard, undefined);
  const r = moveBy(s, [40, 0, 0])!;
  assert.ok(Math.abs(box(r.session, A).min[0]! - 40) < 0.01, "moved the whole way");
});

test("hard bodies stop against each other: the block pushed at the other stops with its face on it", () => {
  const s = hardOf(two(), [A, B]);
  assert.deepEqual([...scene(s).hard!].sort(), ["x_s_100", "x_s_101"]);
  const r = moveBy(s, [40, 0, 0])!;
  assert.equal(r.session.message, null);
  const b = box(r.session, A);
  assert.ok(Math.abs(b.max[0]! - 30) < 0.05, `it stops against the other: ${b.max[0]}`);
  assert.ok(Math.abs(box(r.session, B).min[0]! - 30) < 1e-6, "the other did not move");
});

test("one hard and one soft do not collide; a number typed that would go into the other is refused with the reason", () => {
  const one = hardOf(two(), [A]);
  assert.ok(Math.abs(box(moveBy(one, [40, 0, 0])!.session, A).min[0]! - 40) < 0.01, "only one is hard: through");
  const s = hardOf(two(), [A, B]);
  const r = moveBy(s, [40, 0, 0], "40")!;
  assert.match(r.session.message ?? "", /would run into/);
  assert.ok(Math.abs(box(r.session, A).min[0]!) < 1e-6, "nothing was moved");
});

test("the clearance of the model keeps hard bodies apart by that much; the hard flags and the clearance are saved and opened again", () => {
  let s = hardOf(two(), [A, B]);
  s = run(s, { type: "setClearance", value: 0.5 });
  const r = moveBy(s, [40, 0, 0])!;
  assert.ok(Math.abs(box(r.session, A).max[0]! - 29.5) < 0.05, `a gap of the clearance is left: ${box(r.session, A).max[0]}`);
  const again = openSession(kernel, saveText(s));
  assert.ok(again.ok);
  assert.deepEqual([...scene(again.value).hard!].sort(), ["x_s_100", "x_s_101"]);
  assert.equal(scene(again.value).clearance, 0.5);
});

test("a turn that would swing a hard block into another is taken as far as it can go", () => {
  let s = two();
  s = hardOf(s, [A, B]);
  s = run(s, { type: "setClearance", value: 0 });
  // a long rod: the first block turned a quarter about the far corner of the second's side would sweep through it; here a turn about its own middle stays clear, so it is whole
  const st = startOp(scene(s), [A] as never, "rotate", null);
  assert.ok(st.ok);
  const r = runOp(s, { ...(st as { op: Op }).op, value: 90 })!;
  assert.equal(r.session.message, null, "clear of the other: turned whole");
});

import { frameOf } from "../src/interaction/frame.ts";
test("while a hard body is dragged at another the picture stops where it meets it and the other flashes", () => {
  const s = hardOf(two(), [A, B]);
  let st = { ...createState({ ...s, click: { ...s.click, selection: [A] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "move" }, env);
  st = { ...st, op: { ...st.op!, free: [40, 0, 0], grab: [5, 5, 5] } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.bodyMatrix, "a matrix on the graphics card");
  assert.ok(Math.abs(f.bodyMatrix![12]! - 20) < 0.05, `the body went 20, not 40: ${f.bodyMatrix![12]}`);
  assert.deepEqual(f.flash?.parts, [B], "the body it is against flashes");
});


test("a hard body pushed at the face of another slides along it: it goes the way the pointer went along the surface and no further into it (`in_474`)", () => {
  const s = hardOf(two(), [A, B]);
  const r = moveBy(s, [40, 5, 0])!;
  assert.equal(r.session.message, null);
  const b = box(r.session, A);
  assert.ok(Math.abs(b.max[0]! - 30) < 0.05, `against the face: ${b.max[0]}`);
  assert.ok(Math.abs(b.min[1]! - 5) < 0.05, `and along it, the 5 of the way across: ${b.min[1]}`);
});

test("a slide goes on round a corner and stops against the next hard body: a wall across its way along the face", () => {
  let s = two();
  const d = drawRectangle(scene(s), XY, [0, 12, 0], [30, 22, 0], [1, 0, 0], [0, 1, 0]); s = run(s, d.command);
  s = run(s, { type: "addStep", step: { id: "s_102", type: "extrude", parts: d.lines, params: { depth: 10, mode: "new" } } } as never);
  s = hardOf(s, [A, B, "b/x_s_102/o"]);
  const r = moveBy(s, [40, 5, 0])!;
  const b = box(r.session, A);
  assert.ok(Math.abs(b.max[0]! - 30) < 0.05, `against the first face: ${b.max[0]}`);
  assert.ok(Math.abs(b.max[1]! - 12) < 0.05, `and stopped by the second: ${b.max[1]}`);
});

test("with a clearance the slide keeps the gap: it runs along the face at the clearance from it", () => {
  let s = hardOf(two(), [A, B]);
  s = run(s, { type: "setClearance", value: 0.5 });
  const b = box(moveBy(s, [40, 5, 0])!.session, A);
  assert.ok(Math.abs(b.max[0]! - 29.5) < 0.05, `the gap: ${b.max[0]}`);
  assert.ok(Math.abs(b.min[1]! - 5) < 0.1, `and along: ${b.min[1]}`);
});

test("a turn (or a move along an arrow) only stops: it does not slide off its axis", () => {
  const s = hardOf(two(), [A, B]);
  const st = startOp(scene(s), [A] as never, "move", null);
  assert.ok(st.ok);
  const r = runOp(s, { ...(st as { op: Op }).op, axis: 0, value: 40 })!; // along X by the arrow
  assert.ok(Math.abs(box(r.session, A).max[0]! - 30) < 0.05);
  assert.ok(Math.abs(box(r.session, A).min[1]!) < 1e-6, "no sideways");
});

test("the dragged picture slides too: the matrix on the graphics card is the slid place, not the place the pointer is at", () => {
  const s = hardOf(two(), [A, B]);
  let st = { ...createState({ ...s, click: { ...s.click, selection: [A] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "move" }, env);
  st = { ...st, op: { ...st.op!, free: [40, 5, 0], grab: [5, 5, 5] } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(Math.abs(f.bodyMatrix![12]! - 20) < 0.05 && Math.abs(f.bodyMatrix![13]! - 5) < 0.05, `${f.bodyMatrix![12]}, ${f.bodyMatrix![13]}`);
});

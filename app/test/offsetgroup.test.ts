// Offset of several enclosed sketches at once (`in_1374`).
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { loopFaceRef, diskFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const XY = worldRef("XY");
function two(): { s: Session; a: string; b: string; c: string } {
  let s = createSession(kernel);
  const r1 = drawRectangle(scene(s), XY, [0, 0, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, r1.command);
  const r2 = drawRectangle(scene(s), XY, [40, 0, 0], [50, 30, 0], [1, 0, 0], [0, 1, 0]); s = run(s, r2.command);
  const c = drawCircle(scene(s), XY, [80, 20, 0], 8); s = run(s, c.command);
  return { s, a: loopFaceRef(r1.lines), b: loopFaceRef(r2.lines), c: diskFaceRef(c.circle) };
}
const corners = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "corner" && p.origin === "drawn" && !(p as { derived?: boolean }).derived).length;

test("two rectangles and a disk selected are offered the offset, and each is offset out by the same distance", () => {
  const { s, a, b, c } = two();
  const op = startOp(scene(s), [a, b, c] as never, "offset");
  assert.ok(op.ok, op.ok ? "" : op.why);
  const before = corners(s);
  const made = runOp(s, { ...op.op, value: 2 })!;
  assert.equal(made.session.message, null);
  assert.equal(corners(made.session), before + 4 + 4 + 1, "a copy of each: two of four corners, one centre");
  const pts = Object.values(scene(made.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as unknown as { at: number[] }).at);
  for (const w of [[-2, -2], [22, 12], [38, -2], [52, 32]]) assert.ok(pts.some((q) => Math.abs(q[0]! - w[0]!) < 1e-6 && Math.abs(q[1]! - w[1]!) < 1e-6), `a corner at ${w}`);
});

test("in, a figure too small for the distance is left out and the others are made", () => {
  const { s, a, b } = two();
  const op = startOp(scene(s), [a, b] as never, "offset");
  assert.ok(op.ok);
  const made = runOp(s, { ...op.op, value: -6 })!; // (the first is 10 high: nothing is left of it inside by 6; the second is 10 wide: nothing either)
  assert.ok(made === null || made.session.message !== null || corners(made.session) === corners(s), "nothing made or said");
  const some = runOp(s, { ...op.op, value: -4 })!;
  assert.equal(corners(some.session), corners(s) + 4 + 4, "both fit 4 inside");
});

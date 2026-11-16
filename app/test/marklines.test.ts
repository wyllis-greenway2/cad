// Lines marked Score or Engrave look different on the screen (`in_564`): they are in their own lists, which the view draws in blue dashes and thicker orange; cut is the usual charcoal list; a mark never changes what is drawn, only how.
// (The colours themselves are in `ui/view/content.ts`, which is not run by the tests: nothing here is browser-checked.)
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { consumed } from "../src/operation/ownership.ts";
import { linePairs } from "../src/interaction/linepairs.ts";
import { ringPoints } from "../src/math/ring.ts";

await kernel.init();
const XY = worldRef("XY");

function drawn() {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const c = drawCircle(scene(s), XY, [10, 10, 0], 4);
  s = run(s, c.command);
  return { s, r, c };
}

test("nothing marked: every line is in the one charcoal list, as before", () => {
  const { s } = drawn();
  const sc = scene(s);
  assert.ok(linePairs(sc, consumed(sc)).length > 24, "four sides and a circle");
  assert.equal(linePairs(sc, consumed(sc), "score").length, 0);
  assert.equal(linePairs(sc, consumed(sc), "engrave").length, 0);
});

test("a line marked score or engrave leaves the charcoal list and is in its own", () => {
  const { s, r, c } = drawn();
  const all = linePairs(scene(s), consumed(scene(s))).length;
  const marked = run(run(s, { type: "setUse", refs: r.lines, use: "score" }), { type: "setUse", refs: [c.circle], use: "engrave" });
  const sc = scene(marked);
  const [cut, score, engrave] = (["cut", "score", "engrave"] as const).map((u) => linePairs(sc, consumed(sc), u));
  assert.equal(cut!.length, 0, "everything is marked, nothing is left in the charcoal list");
  assert.equal(score!.length, 4 * 6, "four sides, two points of three numbers each");
  assert.equal(score!.length + engrave!.length, all, "the same lines, only sorted");
  assert.ok(engrave!.length > 24, "the circle's many small pieces");
});

test("marking cut again puts the line back in the charcoal list", () => {
  const { s, r } = drawn();
  const back = run(run(s, { type: "setUse", refs: r.lines, use: "score" }), { type: "setUse", refs: r.lines, use: "cut" });
  assert.equal(linePairs(scene(back), consumed(scene(back)), "score").length, 0);
  assert.equal(linePairs(scene(back), consumed(scene(back))).length, linePairs(scene(s), consumed(scene(s))).length);
});

test("a circle's points do not depend on how it is turned: the ring is closed and every point is a radius from the centre", () => {
  const ring = ringPoints([1, 2, 3], 5, [0, 0.6, 0.8]);
  assert.equal(ring.length, 97 * 3);
  assert.deepEqual(ring.slice(0, 3).map((v) => +v.toFixed(9)), ring.slice(-3).map((v) => +v.toFixed(9)));
  for (let i = 0; i < ring.length; i += 3) assert.ok(Math.abs(Math.hypot(ring[i]! - 1, ring[i + 1]! - 2, ring[i + 2]! - 3) - 5) < 1e-9);
});

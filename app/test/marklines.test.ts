// The lines the view draws from (`interaction/linepairs.ts`) and the circle's points (`math/ring.ts`). (Until `in_603` the lines marked score or engrave were drawn apart here; the modeler no longer knows what a line is for, `prin_manufacture_agnostic`.)
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

test("every drawn line and circle is in the one list: four sides and a circle's many small pieces", () => {
  let s = createSession(kernel);
  s = run(s, drawRectangle(scene(s), worldRef("XY"), [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]).command);
  const sides = linePairs(scene(s), consumed(scene(s)));
  assert.equal(sides.length, 4 * 6, "four sides, two points of three numbers each");
  s = run(s, drawCircle(scene(s), worldRef("XY"), [10, 10, 0], 4).command);
  assert.ok(linePairs(scene(s), consumed(scene(s))).length > sides.length + 24, "and the circle");
});

test("a circle's points do not depend on how it is turned: the ring is closed and every point is a radius from the centre", () => {
  const ring = ringPoints([1, 2, 3], 5, [0, 0.6, 0.8]);
  assert.equal(ring.length, 97 * 3);
  assert.deepEqual(ring.slice(0, 3).map((v) => +v.toFixed(9)), ring.slice(-3).map((v) => +v.toFixed(9)));
  for (let i = 0; i < ring.length; i += 3) assert.ok(Math.abs(Math.hypot(ring[i]! - 1, ring[i + 1]! - 2, ring[i + 2]! - 3) - 5) < 1e-9);
});

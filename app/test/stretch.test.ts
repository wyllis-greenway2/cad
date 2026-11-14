// The stretch maths and the summary a stretched picture is compared with the kernel's by (`in_325`).
import test from "node:test";
import assert from "node:assert/strict";
import { groupDelta, pointKey, stretched, summaryOf, stretchDiffers } from "../src/interaction/stretch.ts";

// a unit cube as a mesh: 8 points, 12 triangles
const V = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
const T = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];

test("a point of a prism stretches along its normal about the plane it stands on", () => {
  assert.deepEqual(groupDelta({ kind: "plane", point: [0, 0, 0], normal: [0, 0, 1] }, 3, 5, 5, 2), [0, 0, 4]);
});

test("a point near a straight rounding edge is scaled about the edge's line; at k = 1 nothing moves", () => {
  const line = { kind: "line" as const, point: [0, 0, 0], dir: [0, 0, 1], a: [0, 0, 0], b: [0, 0, 10], cornerA: false, cornerB: false };
  assert.deepEqual(groupDelta(line, 2, 3, 0, 5), [3, 0, 0]);
  assert.deepEqual(groupDelta(line, 1, 3, 0, 5), [0, 0, 0]);
});

test("the mesh summary of a unit cube: volume 1 and its box", () => {
  const s = summaryOf(V, T);
  assert.ok(Math.abs(s.volume - 1) < 1e-9);
  assert.deepEqual([s.min, s.max], [[0, 0, 0], [1, 1, 1]]);
});

test("stretching the top face of a cube by k = 2 makes a cube twice as tall, and the summary says so", () => {
  const keys = new Set<string>();
  for (let i = 0; i < V.length; i += 3) if (V[i + 2] === 1) keys.add(pointKey(V, i));
  const out = stretched(V, [{ keys, sharp: { kind: "plane", point: [0, 0, 0], normal: [0, 0, 1] } }], 2);
  const tall = summaryOf(out, T);
  assert.ok(Math.abs(tall.volume - 2) < 1e-6 && tall.max[2] === 2);
  assert.equal(stretchDiffers(tall, summaryOf(out, T)), null, "the same agrees");
  assert.match(stretchDiffers(tall, summaryOf(V, T)) ?? "", /volume/, "the stretched one is not the cube");
});

test("a facet's worth of volume is not a difference; a folded block is", () => {
  const made = { volume: 1000, min: [0, 0, 0] as [number, number, number], max: [10, 10, 10] as [number, number, number] };
  assert.equal(stretchDiffers({ ...made, volume: 997 }, made), null);
  assert.ok(stretchDiffers({ ...made, volume: 940 }, made));
  assert.ok(stretchDiffers({ ...made, max: [10, 10.2, 10] }, made));
});

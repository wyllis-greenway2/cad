// Runs the real geometry kernel (OCCT in WASM, in node) on small models and checks closed-form answers.
import test from "node:test";
import assert from "node:assert/strict";
import { loadOC } from "../src/oc.mjs";
import { compile, finalSolid, volume, bounds } from "../src/interpreter.mjs";
import { buildGraph } from "../src/features.mjs";
import { makeBox } from "replicad";

await loadOC();
const rect = { type: "rect", x0: -20, y0: -10, x1: 20, y1: 10 };
const base = { id: "f_001", plane: "XY", shape: rect, distance: 20 };
const top = { axis: 2, sign: 1, offset: 20, point: [0, 0, 20] };
const build = (features) => {
  const g = buildGraph(features);
  const r = compile(g);
  const f = finalSolid(g, r);
  return { shape: f?.shape, errors: g.ops.map((o) => r.get(o.id).error).filter(Boolean) };
};
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("box, and moving a face out and in (faceExtrude)", () => {
  near(volume(build([base]).shape), 16000);
  near(volume(build([base, { id: "f_2", kind: "face", ref: top, distance: 10 }]).shape), 24000);
  near(volume(build([base, { id: "f_2", kind: "face", ref: top, distance: -5 }]).shape), 12000);
  const missing = build([base, { id: "f_2", kind: "face", ref: { ...top, offset: 99, point: [0, 0, 99] }, distance: 5 }]);
  assert.match(missing.errors[0], /face not found/);
});

test("tilting a face: the surface height follows the plane, volume is kept", () => {
  const { shape, errors } = build([base, { id: "f_2", kind: "faceTilt", ref: top, axis: 1, distance: 10 }]);
  assert.deepEqual(errors, []);
  near(volume(shape), 16000);
  const t = Math.tan((10 * Math.PI) / 180);
  for (const [x0, x1] of [[-20, -10], [-10, 0], [0, 10], [10, 20]]) {
    const slice = volume(shape.intersect(makeBox([x0, -50, 0], [x1, 50, 60])));
    near(slice / (10 * 20), 20 - t * ((x0 + x1) / 2), 0.01); // mean height of this slice: left side up, right side down
  }
  const bad = build([base, { id: "f_2", kind: "faceTilt", ref: top, axis: 2, distance: 10 }]);
  assert.match(bad.errors[0], /axis lying in it/);
});

test("move, rotate and scale the whole body", () => {
  const bb = (extra) => bounds(build([base, { id: "f_2", kind: "transform", ...extra }]).shape);
  assert.deepEqual(bb({ mode: "move", axis: 0, distance: 10 }).min.map(Math.round), [-10, -10, 0]);
  const r = bb({ mode: "rotate", axis: 2, distance: 90 });
  assert.deepEqual([r.min[0], r.max[0], r.min[1], r.max[1]].map(Math.round), [-10, 10, -20, 20]);
  near(volume(build([base, { id: "f_2", kind: "transform", mode: "scale", axis: 0, distance: 2 }]).shape), 128000, 0.1);
});

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

test("fillet and chamfer one line (a straight edge and a round rim)", () => {
  const edge = { a: [-20, -10, 20], b: [20, -10, 20], mid: [0, -10, 20] }; // top front edge
  const vol = (mode, size) => volume(build([base, { id: "f_2", kind: "edge", ref: edge, mode, distance: size }]).shape);
  near(vol("fillet", 2), 16000 - (1 - Math.PI / 4) * 4 * 40, 0.05); // removes (1 - pi/4) r^2 per unit length
  near(vol("chamfer", 2), 16000 - 0.5 * 4 * 40, 0.05);
  const missing = build([base, { id: "f_2", kind: "edge", ref: { a: [0, 0, 0], b: [1, 1, 1], mid: [0.5, 0.5, 0.5] }, mode: "fillet", distance: 1 }]);
  assert.match(missing.errors[0], /line not found/);
});

test("radius and taper of a round post and a round hole", () => {
  const post = { id: "f_2", plane: "XY", shape: { type: "circle", cx: 5, cy: 0, r: 3 }, distance: 10, frame: { origin: [0, 0, 20], xDir: [1, 0, 0], normal: [0, 0, 1] } };
  const ref = { axis: 2, center: [5, 0, 0], radius: 3, lo: 20, hi: 30 };
  const run = (extra) => volume(build([base, post, { id: "f_3", ...extra }]).shape);
  const cyl = (r, h) => Math.PI * r * r * h;
  near(run({ kind: "cylRadius", ref, distance: 5 }), 16000 + cyl(5, 10), 0.1); // post grows
  near(run({ kind: "cylRadius", ref, distance: 2 }), 16000 + cyl(2, 10), 0.1); // post shrinks
  const taper = run({ kind: "cylDraft", ref, distance: 10 }); // a cone frustum: radius 3 at the foot, 3 + 10 tan 10 deg at the top
  const r2 = 3 + 10 * Math.tan((10 * Math.PI) / 180);
  near(taper, 16000 + (Math.PI * 10 * (9 + 3 * r2 + r2 * r2)) / 3, 0.1);
  assert.match(build([base, post, { id: "f_3", kind: "cylDraft", ref, distance: -60 }]).errors[0], /closes the shape/);
  // a hole: widening removes material, narrowing puts it back
  const hole = { id: "f_2", plane: "XY", shape: { type: "circle", cx: 5, cy: 0, r: 3 }, distance: -10, frame: { origin: [0, 0, 20], xDir: [1, 0, 0], normal: [0, 0, 1] } };
  const hRef = { axis: 2, center: [5, 0, 0], radius: 3, lo: 10, hi: 20 };
  const runHole = (r) => volume(build([base, hole, { id: "f_3", kind: "cylRadius", ref: hRef, distance: r }]).shape);
  near(runHole(5), 16000 - cyl(5, 10), 0.1);
  near(runHole(2), 16000 - cyl(2, 10), 0.1);
});

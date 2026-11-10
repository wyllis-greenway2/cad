// Kernel conformance suite (moved from the prototype, `dec_kernel_hybrid`): runs small models through whatever kernel src/compiler/kernel provides and checks closed-form answers.
// It only uses the kernel interface (an operation graph in, a plain-data result out), so a replacement kernel must pass it unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { init, evaluate, exportMesh, KERNEL_NAME } from "../src/compiler/kernel/occt/evaluate.mjs";
import { buildGraph } from "./helpers/features.mjs";

await init();
console.log(`kernel under test: ${KERNEL_NAME}`);
const volume = (r) => r.volume;
const rect = { type: "rect", x0: -20, y0: -10, x1: 20, y1: 10 };
const base = { id: "f_001", plane: "XY", shape: rect, distance: 20 };
const top = { axis: 2, sign: 1, offset: 20, point: [0, 0, 20] };
/** Run features through the kernel: { ...result, errors } */
const build = (features, extraOps = []) => {
  const g = buildGraph(features);
  const last = g.ops.at(-1)?.id;
  const r = evaluate({ ...g, ops: [...g.ops, ...extraOps.map((o) => ({ target: last, ...o }))] });
  return { ...r, errors: r.ops.map((o) => o.error).filter(Boolean) };
};
/** The volume of the part of the model inside a box (so a shape can be measured piece by piece). */
const inBox = (features, min, max) => build(features, [{ id: "crop", type: "cropBox", min, max }]).volume;
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("box, and moving a face out and in (faceExtrude)", () => {
  near(volume(build([base])), 16000);
  near(volume(build([base, { id: "f_2", kind: "face", ref: top, distance: 10 }])), 24000);
  near(volume(build([base, { id: "f_2", kind: "face", ref: top, distance: -5 }])), 12000);
  const missing = build([base, { id: "f_2", kind: "face", ref: { ...top, offset: 99, point: [0, 0, 99] }, distance: 5 }]);
  assert.match(missing.errors[0], /face not found/);
});

test("tilting a face: the surface height follows the plane, volume is kept", () => {
  const features = [base, { id: "f_2", kind: "faceTilt", ref: top, axis: 1, distance: 10 }];
  const { errors, ...tilted } = build(features);
  assert.deepEqual(errors, []);
  near(volume(tilted), 16000);
  const t = Math.tan((10 * Math.PI) / 180);
  for (const [x0, x1] of [[-20, -10], [-10, 0], [0, 10], [10, 20]]) {
    const slice = inBox(features, [x0, -50, 0], [x1, 50, 60]);
    near(slice / (10 * 20), 20 - t * ((x0 + x1) / 2), 0.01); // mean height of this slice: left side up, right side down
  }
  const bad = build([base, { id: "f_2", kind: "faceTilt", ref: top, axis: 2, distance: 10 }]);
  assert.match(bad.errors[0], /axis lying in it/);
});

test("move, rotate and scale the whole body", () => {
  const bb = (extra) => build([base, { id: "f_2", kind: "transform", ...extra }]).bbox;
  assert.deepEqual(bb({ mode: "move", axis: 0, distance: 10 }).min.map(Math.round), [-10, -10, 0]);
  const r = bb({ mode: "rotate", axis: 2, distance: 90 });
  assert.deepEqual([r.min[0], r.max[0], r.min[1], r.max[1]].map(Math.round), [-10, 10, -20, 20]);
  near(volume(build([base, { id: "f_2", kind: "transform", mode: "scale", axis: 0, distance: 2 }])), 128000, 0.1);
});

test("fillet and chamfer one line (a straight edge and a round rim)", () => {
  const edge = { a: [-20, -10, 20], b: [20, -10, 20], mid: [0, -10, 20] }; // top front edge
  const vol = (mode, size) => volume(build([base, { id: "f_2", kind: "edge", ref: edge, mode, distance: size }]));
  near(vol("fillet", 2), 16000 - (1 - Math.PI / 4) * 4 * 40, 0.05); // removes (1 - pi/4) r^2 per unit length
  near(vol("chamfer", 2), 16000 - 0.5 * 4 * 40, 0.05);
  const missing = build([base, { id: "f_2", kind: "edge", ref: { a: [0, 0, 0], b: [1, 1, 1], mid: [0.5, 0.5, 0.5] }, mode: "fillet", distance: 1 }]);
  assert.match(missing.errors[0], /line not found/);
});

test("fillet and chamfer several lines together as one step (`in_087`)", () => {
  const front = { a: [-20, -10, 20], b: [20, -10, 20], mid: [0, -10, 20] };
  const back = { a: [-20, 10, 20], b: [20, 10, 20], mid: [0, 10, 20] };
  const vol = (mode, size, ref) => volume(build([base, { id: "f_2", kind: "edge", ref, mode, distance: size }]));
  near(vol("chamfer", 2, [front, back]), 16000 - 2 * 0.5 * 4 * 40, 0.05); // two parallel lines, each removes 0.5 d^2 per unit length
  near(vol("fillet", 2, [front, back]), 16000 - 2 * (1 - Math.PI / 4) * 4 * 40, 0.05);
  near(vol("chamfer", 2, front), 16000 - 0.5 * 4 * 40, 0.05); // one line as before
  const missing = build([base, { id: "f_2", kind: "edge", ref: [front, { a: [0, 0, 0], b: [1, 1, 1], mid: [0.5, 0.5, 0.5] }], mode: "chamfer", distance: 1 }]);
  assert.match(missing.errors[0], /line not found/);
});

test("radius and taper of a round post and a round hole", () => {
  const post = { id: "f_2", plane: "XY", shape: { type: "circle", cx: 5, cy: 0, r: 3 }, distance: 10, frame: { origin: [0, 0, 20], xDir: [1, 0, 0], normal: [0, 0, 1] } };
  const ref = { axis: 2, center: [5, 0, 0], radius: 3, lo: 20, hi: 30 };
  const run = (extra) => volume(build([base, post, { id: "f_3", ...extra }]));
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
  const runHole = (r) => volume(build([base, hole, { id: "f_3", kind: "cylRadius", ref: hRef, distance: r }]));
  near(runHole(5), 16000 - cyl(5, 10), 0.1);
  near(runHole(2), 16000 - cyl(2, 10), 0.1);
});

test("a tilted face can be found again, moved along its own normal, and tilted further", () => {
  const rad = (10 * Math.PI) / 180;
  const n = [Math.sin(rad), 0, Math.cos(rad)]; // top face tilted 10 degrees about Y (its normal leans toward +x)
  const c = [0, 0, 20];
  const tilted = { id: "f_2", kind: "faceTilt", ref: top, axis: 1, distance: 10 };
  const ref = { n, d: n[0] * c[0] + n[1] * c[1] + n[2] * c[2], point: [0, 0, 20] };
  const moved = build([base, tilted, { id: "f_3", kind: "face", ref, distance: 5 }]);
  assert.deepEqual(moved.errors, []);
  // moving a sloped face out by 5 along its normal adds a prism of (face area) x 5 on the high side only: here the face area is 40/cos(10deg) x 20
  near(volume(moved), 16000 + (40 / Math.cos(rad)) * 20 * 5, 0.5);
  const missing = build([base, tilted, { id: "f_3", kind: "face", ref: { ...ref, d: ref.d + 60 }, distance: 5 }]); // (a face a little off is found as the nearest one facing the same way; one far off is not)
  assert.match(missing.errors[0], /face not found/);
  const nudged = build([base, tilted, { id: "f_3", kind: "face", ref: { ...ref, d: ref.d + 3 }, distance: 5 }]);
  assert.deepEqual(nudged.errors, [], "a face that moved by 3 is still found");
  const again = build([base, tilted, { id: "f_3", kind: "faceTilt", ref, axis: 0, distance: 5 }]);
  assert.deepEqual(again.errors, []);
});

test("delete the whole body: later steps start a new one", () => {
  const gone = build([base, { id: "f_2", kind: "clear" }]);
  assert.equal(gone.finalId, null);
  assert.equal(gone.volume, null);
  assert.equal(gone.mesh, null);
  near(volume(build([base, { id: "f_2", kind: "clear" }, { ...base, id: "f_3" }])), 16000);
});

test("the result is plain data: mesh arrays, faces with normals, lines and corners, no kernel objects", () => {
  const r = build([base]);
  assert.equal(r.mesh.vertices.length % 3, 0);
  assert.ok(r.mesh.triangles.length >= 36); // a box is at least 12 triangles
  assert.equal(r.faces.length, 6);
  for (const f of r.faces) {
    assert.ok(f.n.every(Number.isFinite) && Number.isFinite(f.d));
    assert.ok(f.start + f.count <= r.mesh.triangles.length);
  }
  assert.equal(r.edges.length, 12);
  assert.equal(r.vertices.length, 8);
  assert.doesNotThrow(() => structuredClone(r)); // it can cross a worker boundary
  near(r.bbox.max[2], 20);
});

test("exportMesh: a closed mesh of the final body at the quality asked for, as plain data; nothing to export is an answer, not a throw (`in_256`)", () => {
  const g = buildGraph([base, { id: "f_2", kind: "edge", ref: { a: [-20, -10, 20], b: [20, -10, 20], mid: [0, -10, 20] }, mode: "fillet", distance: 2 }]);
  const coarse = exportMesh(g, { tolerance: 0.5, angular: 0.5 });
  const fine = exportMesh(g, { tolerance: 0.01, angular: 0.1 });
  assert.ok(coarse.ok && fine.ok);
  assert.ok(fine.triangles.length > coarse.triangles.length);
  assert.ok(fine.vertices instanceof Float32Array && fine.triangles instanceof Uint32Array);
  near(fine.volume, 16000 - (1 - Math.PI / 4) * 4 * 40, 0.05);
  assert.deepEqual(fine.bbox.min.map(Math.round), [-20, -10, 0]);
  assert.equal(exportMesh({ params: {}, ops: [] }, { tolerance: 0.01, angular: 0.1 }).ok, false);
});

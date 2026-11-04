import test from "node:test";
import assert from "node:assert/strict";
import { PLANES, shortest, cameraOffset, cameraUp, isNormal, projectOnto, pickPlane } from "../src/viewmath.mjs";

const near = (a, b, tol = 1e-9) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= tol, `${a} vs ${b}`));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const neg = (v) => v.map((x) => -x);

test("standard views: camera side and screen-up per plane", () => {
  const cases = { XY: [[0, 0, 1], [0, 1, 0]], XZ: [[0, -1, 0], [0, 0, 1]], YZ: [[1, 0, 0], [0, 0, 1]] };
  for (const [name, [off, up]] of Object.entries(cases)) {
    const { a, e } = PLANES[name].view;
    near(cameraOffset(a, e), off);
    near(cameraUp(a, e), up);
  }
});

test("standard views are not mirrored: in-plane +u is screen right and +v is screen up", () => {
  for (const [name, def] of Object.entries(PLANES)) {
    const { a, e } = def.view;
    const forward = neg(cameraOffset(a, e)); // camera looks at the target
    const up = cameraUp(a, e);
    const right = cross(forward, up);
    const unit = (i) => [0, 1, 2].map((k) => (k === i ? 1 : 0));
    near(right, unit(def.u));
    near(up, unit(def.v));
    assert.ok(Math.abs(cameraOffset(a, e)[def.axis]) > 0.999, `${name}: camera is on the plane's normal axis`);
  }
});

test("camera offset and up are always perpendicular unit vectors, including straight above", () => {
  for (const a of [-3, -1.2, 0, 0.7, 2.5]) for (const e of [-Math.PI / 2, -0.4, 0, 0.9, Math.PI / 2]) {
    const o = cameraOffset(a, e);
    const u = cameraUp(a, e);
    assert.ok(Math.abs(Math.hypot(...o) - 1) < 1e-9 && Math.abs(Math.hypot(...u) - 1) < 1e-9);
    assert.ok(Math.abs(o[0] * u[0] + o[1] * u[1] + o[2] * u[2]) < 1e-9);
  }
});

test("shortest rotation wraps around", () => {
  assert.ok(Math.abs(shortest(3, -3) - (2 * Math.PI - 6)) < 1e-9);
  assert.ok(Math.abs(shortest(-3, 3) + (2 * Math.PI - 6)) < 1e-9);
  assert.equal(shortest(1, 1), 0);
  assert.ok(Math.abs(Math.abs(shortest(0, Math.PI)) - Math.PI) < 1e-9);
});

test("isNormal needs the plane's own normal view within tolerance", () => {
  const v = { ...PLANES.XY.view };
  assert.ok(isNormal(v, "XY", 0.02));
  assert.ok(!isNormal(v, "XZ", 0.02));
  assert.ok(!isNormal({ a: v.a, e: v.e - 0.05 }, "XY", 0.02));
  assert.ok(isNormal({ a: v.a + 2 * Math.PI, e: v.e }, "XY", 0.02), "azimuth wraps");
});

test("projectOnto zeroes only the normal coordinate", () => {
  assert.deepEqual(projectOnto("XY", [1, 2, 3]), [1, 2, 0]);
  assert.deepEqual(projectOnto("XZ", [1, 2, 3]), [1, 0, 3]);
  assert.deepEqual(projectOnto("YZ", [1, 2, 3]), [0, 2, 3]);
});

test("pickPlane: nearest plane along the ray, edge-on and far planes ignored", () => {
  assert.equal(pickPlane([0, 0, 10], [0, 0, -1]).plane, "XY");
  assert.ok(Math.abs(pickPlane([0, 0, 10], [0, 0, -1]).t - 10) < 1e-9);
  assert.equal(pickPlane([5, -20, 3], [0, 1, 0]).plane, "XZ");
  assert.equal(pickPlane([20, 4, 3], [-1, 0, 0]).plane, "YZ");
  // iso ray from (10,-10,10) aimed off-origin: hits all three, the nearest wins
  const d = [-0.5, 0.7, -0.6].map((x, _, a) => x / Math.hypot(...a));
  const hit = pickPlane([10, -10, 10], d);
  assert.ok(hit && ["XY", "XZ", "YZ"].includes(hit.plane));
  assert.equal(pickPlane([0, 0, 10], [0, 0, 1]), null, "pointing away");
  assert.equal(pickPlane([0, 0, 10], [0, 0, -1], { maxDist: 5 }), null, "too far");
  assert.equal(pickPlane([0, 0, 10], [1, 0, -0.01], { minCos: 0.03 }), null, "grazing");
});

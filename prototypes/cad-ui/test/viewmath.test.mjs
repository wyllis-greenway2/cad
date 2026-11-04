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

test("pickPlane `only` restricts picking to one plane (sketch mode)", () => {
  assert.equal(pickPlane([5, -20, 3], [0, 1, 0], { only: "XZ" }).plane, "XZ");
  assert.equal(pickPlane([5, -20, 3], [0, 1, 0], { only: "XY" }), null);
});

import { addFacePlane, planeDef, frameOf, basisOf, DATUMS } from "../src/viewmath.mjs";

test("face planes: base planes are reused, the same face gives the same plane, views are not mirrored", () => {
  assert.equal(addFacePlane({ axis: 2, sign: 1, offset: 0 }), "XY");
  assert.equal(addFacePlane({ axis: 1, sign: -1, offset: 0 }), "XZ");
  assert.equal(addFacePlane({ axis: 0, sign: 1, offset: 0 }), "YZ");
  const top = addFacePlane({ axis: 2, sign: 1, offset: 20 }, -Math.PI / 2);
  assert.notEqual(top, "XY");
  assert.equal(addFacePlane({ axis: 2, sign: 1, offset: 20 }, 1), top);
  const bottom = addFacePlane({ axis: 2, sign: -1, offset: 0 }, 0);
  assert.notEqual(bottom, "XY"); // the underside of the XY plane faces the other way
  for (const id of [top, bottom, addFacePlane({ axis: 1, sign: 1, offset: 10 }), addFacePlane({ axis: 0, sign: -1, offset: -20 })]) {
    const d = planeDef(id);
    const [u, v, n] = basisOf(id);
    near(cross(u, v), n); // right handed, so a sketch is not mirrored
    const forward = neg(cameraOffset(d.view.a, d.view.e));
    near(cross(forward, cameraUp(d.view.a, d.view.e)), u); // u is screen right when looking straight at the face
    near(cameraUp(d.view.a, d.view.e), v);
    assert.ok(isNormal(d.view, id, 1e-9));
  }
  near(frameOf(top).origin, [0, 0, 20]);
  near(frameOf(top).normal, [0, 0, 1]);
  assert.ok(Object.keys(DATUMS).length >= 4);
});

test("a face plane can be picked only when asked for, and projectOnto puts a point on it", () => {
  const id = addFacePlane({ axis: 2, sign: 1, offset: 20 });
  assert.equal(pickPlane([0, 0, 100], [0, 0, -1])?.plane, "XY"); // not the face plane
  const hit = pickPlane([5, 6, 100], [0, 0, -1], { only: id });
  assert.equal(hit.plane, id);
  near(hit.point, [5, 6, 20]);
  near(projectOnto(id, [1, 2, 3]), [1, 2, 20]);
});

test("a face plane at any angle: not mirrored, camera looks along its normal, points project onto it", () => {
  const t = (10 * Math.PI) / 180;
  const n = [Math.sin(t), 0, Math.cos(t)];
  const id = addFacePlane({ n, d: 20 * n[2] }, 0);
  const def = planeDef(id);
  const [u, v, nn] = basisOf(id);
  near(cross(u, v), nn);
  near(nn, n, 1e-9);
  near(cameraOffset(def.view.a, def.view.e), n, 1e-9);
  assert.ok(isNormal(def.view, id, 1e-9));
  const forward = neg(cameraOffset(def.view.a, def.view.e));
  near(cross(forward, cameraUp(def.view.a, def.view.e)), u, 1e-9); // u is screen right
  const q = projectOnto(id, [3, 4, 50]);
  assert.ok(Math.abs(q[0] * n[0] + q[1] * n[1] + q[2] * n[2] - def.d) < 1e-9);
  assert.equal(addFacePlane({ n, d: 20 * n[2] }, 2), id); // the same face again gives the same plane
  const hit = pickPlane([0, 0, 100], [0, 0, -1], { only: id });
  assert.equal(hit.plane, id);
  assert.ok(Math.abs(hit.point[0] * n[0] + hit.point[2] * n[2] - def.d) < 1e-9);
});

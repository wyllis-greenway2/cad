import test from "node:test";
import assert from "node:assert/strict";
import type { Vec3 } from "../src/math/vec.ts";
import { sub, dot, length, cross } from "../src/math/vec.ts";
import { homeCamera, orbit, pan, zoom, lookStraight, lookAlternating, sideOf, blend, basis, projector, frame, shortest } from "../src/interaction/camera.ts";

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const nearV = (a: readonly number[], b: readonly number[], tol = 1e-6) => a.forEach((x, i) => near(x, b[i]!, tol));
const W = 800;
const H = 600;

test("the camera looks at its target and the screen axes are orthonormal", () => {
  const c = homeCamera();
  const { forward, right, up } = basis(c);
  near(length(forward), 1); near(length(right), 1); near(length(up), 1);
  near(dot(forward, right), 0); near(dot(forward, up), 0); near(dot(right, up), 0);
  const pr = projector(c, W, H);
  nearV(pr.project(c.target), [W / 2, H / 2]);
});

test("a ray through the projection of a point passes through the point (perspective and straight-on)", () => {
  for (const straight of [false, true]) {
    const c = { ...homeCamera(), straight };
    const pr = projector(c, W, H);
    const p: Vec3 = [13, -7, 5];
    const [x, y] = pr.project(p);
    const r = pr.ray(x, y);
    const t = dot(sub(p, r.o), r.d);
    const hit: Vec3 = [r.o[0] + r.d[0] * t, r.o[1] + r.d[1] * t, r.o[2] + r.d[2] * t];
    nearV(hit, p, 1e-6);
  }
});

test("orbit about the model: the pivot stays exactly where it is on the screen, however far from the middle", () => {
  const c0 = pan(homeCamera(), 150, -80, H); // the model panned to the side
  const pivot: Vec3 = [20, 10, 5];
  const before = projector(c0, W, H).project(pivot);
  let c = c0;
  for (const [da, de] of [[0.4, 0.1], [-1.2, 0.3], [2, -0.5]] as const) c = orbit(c, da, de, pivot);
  nearV(projector(c, W, H).project(pivot), before, 1e-6);
  // and without a pivot the target stays put
  const free = orbit(c0, 0.7, 0.2);
  nearV(free.target, c0.target);
});

test("pan: the scene follows the pointer", () => {
  const c = homeCamera();
  const p: Vec3 = [0, 0, 0];
  const before = projector(c, W, H).project(p);
  const after = projector(pan(c, 40, -25, H), W, H).project(p);
  nearV(after, [before[0] + 40, before[1] - 25], 1e-6);
});

test("zoom is bounded", () => {
  assert.ok(zoom(homeCamera(), 1e-9).distance >= 3);
  assert.ok(zoom(homeCamera(), 1e9).distance <= 5000);
});

test("looking straight at a plane: forward along minus the normal, the plane's first axis to the right, orthographic; orbit leaves that", () => {
  const XY = lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]);
  assert.equal(XY.straight, true);
  const b = basis(XY);
  nearV(b.forward, [0, 0, -1]);
  nearV(b.right, [1, 0, 0]);
  nearV(b.up, [0, 1, 0]);
  const XZ = lookStraight(homeCamera(), [0, -1, 0], [1, 0, 0]);
  nearV(basis(XZ).forward, [0, 1, 0]);
  nearV(basis(XZ).right, [1, 0, 0]);
  nearV(basis(XZ).up, [0, 0, 1]);
  const YZ = lookStraight(homeCamera(), [1, 0, 0], [0, 1, 0]);
  nearV(basis(YZ).forward, [-1, 0, 0]);
  nearV(basis(YZ).right, [0, 1, 0]);
  assert.equal(orbit(XY, 0.1, 0).straight, false);
});

test("N / X / Y / Z alternate front and back", () => {
  let c = lookAlternating(homeCamera(), [0, 0, 1], [1, 0, 0]);
  assert.equal(sideOf(c, [0, 0, 1]), 1);
  c = lookAlternating(c, [0, 0, 1], [1, 0, 0]);
  assert.equal(sideOf(c, [0, 0, 1]), -1);
  nearV(basis(c).forward, [0, 0, 1]);
  c = lookAlternating(c, [0, 0, 1], [1, 0, 0]);
  assert.equal(sideOf(c, [0, 0, 1]), 1);
  assert.equal(sideOf(homeCamera(), [0, 0, 1]), 0);
});

test("a ray from a straight-on view is perpendicular to the plane and parallel for every pixel", () => {
  const pr = projector(lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), W, H);
  const a = pr.ray(10, 10);
  const b = pr.ray(700, 500);
  nearV(a.d, b.d);
  nearV(a.d, [0, 0, -1]);
  assert.ok(length(cross(sub(b.o, a.o), a.d)) > 1);
});

test("blend turns the short way round, and frame fits a model in view", () => {
  const a = { ...homeCamera(), azimuth: 3.0 };
  const b = { ...homeCamera(), azimuth: -3.0 };
  const mid = blend(a, b, 0.5);
  assert.ok(Math.abs(shortest(mid.azimuth, Math.PI)) < 1e-9, "halfway between 3 and -3 is PI, not 0");
  const f = frame(homeCamera(), [100, 0, 0], 50);
  nearV(f.target, [100, 0, 0]);
  assert.ok(f.distance > 50);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import * as cam from "../src/camera.ts";
import { createGame } from "../src/game.ts";
import { actionOf, wheelKind } from "../src/input.ts";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const dot = (a: cam.V3, b: cam.V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test("the camera's axes are unit and square to each other", () => {
  const { forward, right, up } = cam.basis({ ...cam.home(), azimuth: 1.1, elevation: -0.4 });
  for (const v of [forward, right, up]) near(dot(v, v), 1);
  near(dot(forward, right), 0); near(dot(forward, up), 0); near(dot(right, up), 0);
});

test("straight views look along the plane's normal, with its first axis to the right", () => {
  const planes: Array<[cam.V3, cam.V3]> = [[[0, 0, 1], [1, 0, 0]], [[1, 0, 0], [0, 1, 0]], [[0, -1, 0], [1, 0, 0]]];
  for (const [n, u] of planes) {
    const c = cam.lookStraight(cam.home(), n, u);
    const b = cam.basis(c);
    near(dot(cam.offset(c), n), 1);
    near(dot(b.right, u), 1);
    assert.ok(c.straight);
  }
});

test("asking again for the same straight view looks from the other side, and again from the first", () => {
  const n: cam.V3 = [0, 0, 1], u: cam.V3 = [1, 0, 0];
  const a = cam.lookAlternating(cam.home(), n, u), b = cam.lookAlternating(a, n, u), c = cam.lookAlternating(b, n, u);
  assert.equal(cam.sideOf(a, n), 1); assert.equal(cam.sideOf(b, n), -1); assert.equal(cam.sideOf(c, n), 1);
});

test("panning moves the scene with the pointer", () => {
  const c = cam.home();
  const p = cam.pan(c, 100, 0, 800);
  const moved = [p.target[0] - c.target[0], p.target[1] - c.target[1], p.target[2] - c.target[2]] as cam.V3;
  assert.ok(dot(moved, cam.basis(c).right) < 0); // dragging right takes the eye left, so the scene goes right
  near(dot(moved, cam.basis(c).up), 0);
});

test("zooming in keeps the point under the pointer where it is; zooming out is about the centre", () => {
  const c = cam.home(), nx = 0.6, ny = -0.3, aspect = 1.5;
  const at = (k: cam.Cam) => { const { right, up } = cam.basis(k); const h = k.distance * Math.tan((35 * Math.PI) / 360); return [nx * h * aspect, ny * h].map((v, i) => v) && [k.target, right, up, h] as const; };
  const world = (k: cam.Cam): cam.V3 => { const [t, r, u, h] = at(k); return [0, 1, 2].map((i) => t[i]! + r[i]! * nx * h * aspect + u[i]! * ny * h) as cam.V3; };
  const z = cam.zoom(c, 0.5, nx, ny, aspect);
  near(z.distance, c.distance * 0.5);
  for (let i = 0; i < 3; i++) near(world(z)[i]!, world(c)[i]!, 1e-9);
  const out = cam.zoom(c, 2, nx, ny, aspect);
  assert.deepEqual(out.target, c.target);
});

test("zoom stays inside its limits", () => {
  assert.ok(cam.zoom(cam.home(), 1e-9).distance >= 0.3);
  assert.ok(cam.zoom(cam.home(), 1e9).distance <= 5000);
});

test("orbiting leaves a straight view and keeps the elevation in range", () => {
  const s = cam.lookStraight(cam.home(), [0, 0, 1], [1, 0, 0]);
  const o = cam.orbit(s, 10, 1e6);
  assert.equal(o.straight, false);
  assert.ok(o.elevation <= Math.PI / 2);
});

test("blending turns the short way round and brings the perspective in and out", () => {
  const a = { ...cam.home(), azimuth: 3.0 }, b = { ...cam.home(), azimuth: -3.0, mix: 0.02, straight: true };
  const m = cam.blend(a, b, 0.5);
  assert.ok(Math.abs(cam.shortest(m.azimuth, Math.PI)) < 0.2); // went through PI, not through 0
  near(m.mix, 0.51);
  assert.equal(cam.blend(a, b, 1).straight, true);
});

test("a straight view is as large at the target as the perspective one (the lens narrows as the eye backs off)", () => {
  const c = cam.home(), s = { ...c, mix: 0.02 };
  near(cam.eyeDistance(s) * Math.tan(cam.fov(s) / 2), cam.eyeDistance(c) * Math.tan(cam.fov(c) / 2), 1e-6);
});

test("swivelling turns the view about the eye, which stays where it is", () => {
  const c = cam.home(), e0 = cam.eye(c), s = cam.swivel(c, 80, -30), e1 = cam.eye(s);
  for (let i = 0; i < 3; i++) near(e0[i]!, e1[i]!, 1e-9);
  assert.notEqual(s.azimuth, c.azimuth);
});

test("walking moves the eye along the view", () => {
  const c = cam.home(), w = cam.walk(c, 1, 0, 0.1);
  assert.ok(dot([w.target[0] - c.target[0], w.target[1] - c.target[1], w.target[2] - c.target[2]], cam.basis(c).forward) > 0);
});

test("game mode: a key turns it on, it eases to speed and stops a moment after the last key goes up", () => {
  const g = createGame();
  assert.equal(g.key("KeyQ", true), false);
  assert.equal(g.key("KeyW", true), true);
  let t = g.tick(0.05); assert.ok(t.on && t.ahead > 0 && t.ahead < 0.45);
  for (let i = 0; i < 10; i++) t = g.tick(0.05);
  near(t.ahead, 0.45);
  g.key("KeyW", false);
  for (let i = 0; i < 4; i++) t = g.tick(0.05);
  assert.ok(t.on); // easing down, not yet over
  for (let i = 0; i < 40; i++) t = g.tick(0.05);
  assert.equal(t.on, false);
});

test("mouse buttons: plain left is a click or orbit, right orbits, middle and Shift+right pan", () => {
  const no = { shift: false, alt: false };
  assert.equal(actionOf(0, no, false), "click");
  assert.equal(actionOf(2, no, false), "orbit");
  assert.equal(actionOf(1, no, false), "pan");
  assert.equal(actionOf(2, { shift: true, alt: false }, false), "pan");
  assert.equal(actionOf(0, no, true), "pan");
  assert.equal(actionOf(0, { shift: false, alt: true }, false), "orbit");
});

test("wheel events: ctrl is a pinch, whole big steps a wheel, small or sideways ones a trackpad scroll", () => {
  assert.equal(wheelKind({ ctrlKey: true, deltaMode: 0, deltaX: 0, deltaY: 3 }), "pinch");
  assert.equal(wheelKind({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 100 }), "wheel");
  assert.equal(wheelKind({ ctrlKey: false, deltaMode: 1, deltaX: 0, deltaY: 3 }), "wheel");
  assert.equal(wheelKind({ ctrlKey: false, deltaMode: 0, deltaX: 4, deltaY: 12.5 }), "scroll");
});

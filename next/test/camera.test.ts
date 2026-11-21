import { test } from "node:test";
import assert from "node:assert/strict";
import { cam, near, px, pointAt, W, H } from "./helpers.ts";
import type { V3 } from "../src/vec.ts";
import { ease } from "../src/vec.ts";

test("[C1] the start view is from the +X +Y corner, a little above, 120 mm from the origin", () => {
  const c = cam.home();
  near(Math.hypot(...c.eye), 120, 1e-9);
  assert.ok(c.eye[0] > 0 && c.eye[1] > 0 && c.eye[2] > 0);
  assert.equal(c.ortho, null);
  const f = cam.forward(c);
  assert.ok(f[0] < 0 && f[1] < 0 && f[2] < 0, "it looks toward the origin, down");
});

test("[C2] an orbit keeps its pivot where it is on the screen and never rolls", () => {
  const c0 = cam.home(), pivot: V3 = [-20, 15, 8];
  const before = px(c0, pivot);
  let c = c0;
  for (let i = 0; i < 40; i++) c = cam.turnAbout(c, pivot, -0.011, -0.004);
  const after = px(c, pivot);
  near(after[0], before[0], 1e-6, "x"); near(after[1], before[1], 1e-6, "y");
  const up = cam.upOf(c); assert.ok(up[2] > 0, "Z stays up");
  near(cam.rightOf(c)[2], 0, 1e-12, "the right side stays level");
});

test("[C2] the pitch stops straight up and down, and the eye stops with it", () => {
  const c0 = cam.home(), pivot: V3 = [0, 0, 0];
  let c = c0;
  for (let i = 0; i < 400; i++) c = cam.turnAbout(c, pivot, 0, 0.05);
  near(c.pitch, Math.PI / 2, 1e-12);
  const e = c.eye;
  const c2 = cam.turnAbout(c, pivot, 0, 0.5);
  assert.deepEqual(c2.eye.map((v) => +v.toFixed(9)), e.map((v) => +v.toFixed(9)));
});

test("[C11 C12] handing a view to the orthographic camera moves a point 20 mm off the plane by under a pixel, and handing it back restores it", () => {
  const c0 = cam.home(), f = cam.forward(c0), hold = [c0.eye[0] + f[0] * 120, c0.eye[1] + f[1] * 120, c0.eye[2] + f[2] * 120] as V3;
  const dir = cam.straightDirection(2, 1);
  const go: cam.Go = { t0: 0, ms: 450, from: c0, lens: 0.01, dir, hold };
  let c = c0;
  for (let i = 0; i <= 60; i++) c = cam.stepGo(go, ease(i / 60), c);
  const probe: V3 = [hold[0] + 30, hold[1] + 10, hold[2] + 20];
  const b = px(c, probe), o = cam.enterOrtho({ ...c, lens: 0.01 }, hold), a = px(o, probe);
  near(a[0], b[0], 1, "x"); near(a[1], b[1], 1, "y");
  const back = cam.leaveOrtho(o, hold), r = px(back, probe);
  near(r[0], b[0], 1e-6, "back x"); near(r[1], b[1], 1e-6, "back y");
});

test("[C12] the change to a straight view holds what it is about in place and ends in the plane's direction", () => {
  const c0 = cam.home(), f = cam.forward(c0), hold = [c0.eye[0] + f[0] * 120, c0.eye[1] + f[1] * 120, c0.eye[2] + f[2] * 120] as V3;
  const dir = cam.straightDirection(2, 1);
  const go: cam.Go = { t0: 0, ms: 450, from: c0, lens: 0.01, dir, hold };
  let c = c0; const start = px(c0, hold);
  for (let i = 0; i <= 60; i++) { c = cam.stepGo(go, ease(i / 60), c); const p = px(c, hold); near(p[0], start[0], 1e-6); near(p[1], start[1], 1e-6); }
  near(c.pitch, dir.pitch, 1e-9); near(c.lens, 0.01, 1e-12);
});

test("[C10] zooming an orthographic view keeps the point under the cursor where it is, and does not move the eye", () => {
  const d = cam.straightDirection(2, 1);
  const o: cam.Cam = { eye: [0, 0, 100], yaw: d.yaw, pitch: d.pitch, ortho: 200, lens: 1 };
  const x = 825, y = 468, P = pointAt(o, x, y, 5);
  let z = o;
  for (let i = 0; i < 20; i++) z = cam.zoomOrtho(z, 0.8, (x / W) * 2 - 1, -((y / H) * 2 - 1), W / H);
  const p = px(z, P); near(p[0], x, 1e-6); near(p[1], y, 1e-6);
  assert.ok(z.ortho! < o.ortho!, "it zoomed in");
  assert.equal(z.ortho! > 0, true);
});

test("[C11] in an orthographic view the picking ray for a pixel lands on that pixel and is parallel to the view", () => {
  const d = cam.straightDirection(0, 1);
  const o: cam.Cam = { eye: [50, 3, 4], yaw: d.yaw, pitch: d.pitch, ortho: 120, lens: 1 };
  const r = cam.rayFrom(o, 0.3, 0.2, W / H);
  assert.deepEqual(r.d, cam.forward(o));
  const p = px(o, [r.o[0] + r.d[0] * 7, r.o[1] + r.d[1] * 7, r.o[2] + r.d[2] * 7]);
  near(p[0], (0.3 + 1) / 2 * W, 1e-6); near(p[1], (1 - 0.2) / 2 * H, 1e-6);
});

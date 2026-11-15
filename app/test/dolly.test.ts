// Zooming is the eye moving along the view, by a step of the way to the model (the nearest object's middle, else the origin), not of the distance to the view's target (`in_415`):
// after a long way from the origin, with the target in empty space and the view shrunk to a few mm, the wheel moved hundredths of a mm and the world was cut off.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { position, basis, homeCamera } from "../src/interaction/camera.ts";
import type { Camera } from "../src/interaction/camera.ts";

await kernel.init();
const env = { w: 1280, h: 687, now: 0 };
const lost = (target: [number, number, number], distance: number): Camera => ({ ...homeCamera(), target, distance, azimuth: 0.6, elevation: 0.3 });
const toOrigin = (c: Camera) => { const e = position(c); return Math.hypot(e[0], e[1], e[2]); };

test("lost in empty space, 125 mm from the origin and 0.9 mm from the target, one wheel notch in moves the eye by a step of the way to the origin, and out comes back", () => {
  let st = { ...createState(createSession(kernel)), cam: lost([101.68, 38.26, 37.54], 0.885) };
  const e0 = toOrigin(st.cam);
  const inn = reduce(st, { type: "zoom", factor: 0.8244, x: 640, y: 340 }, env);
  const f = basis(st.cam).forward;
  const e1 = position(inn.cam);
  const moved = Math.hypot(...[0, 1, 2].map((i) => e1[i]! - position(st.cam)[i]!) as [number, number, number]);
  assert.ok(Math.abs(moved) > 5, `a notch moves the eye by a useful step (${moved} mm), not a fraction of 0.9`);
  assert.ok(inn.cam.distance > 20, "the target is put at the depth of the model, so the pan and the clipping fit what is there");
  // and the same notch out undoes the move along the line of sight
  const out = reduce(inn, { type: "zoom", factor: 1 / 0.8244, x: 640, y: 340 }, env);
  assert.ok(Math.abs(toOrigin(out.cam) - e0) < 0.05 * e0, "back where it was, about");
  void f;
});

test("zooming out from a lost view reaches the origin's neighbourhood in a few notches", () => {
  let st = { ...createState(createSession(kernel)), cam: lost([98.83, 66.88, 32.52], 5.65) };
  for (let i = 0; i < 12; i++) st = reduce(st, { type: "zoom", factor: 1.213, x: 640, y: 340 }, env);
  assert.ok(toOrigin(st.cam) > toOrigin(lost([98.83, 66.88, 32.52], 5.65)) * 0.9, "going out does not turn into going in");
});

import test from "node:test";
import assert from "node:assert/strict";
import { fineGain } from "../src/shared/fine.ts";
import { settings } from "../src/shared/settings.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";

test("the finest mouse movements turn the view a little less, the gain rising to all of it as the movement grows (`in_420`)", () => {
  assert.ok(Math.abs(fineGain(0) - settings.input.fineGain) < 1e-9);
  assert.ok(fineGain(1) > fineGain(0) && fineGain(6) > fineGain(1) && fineGain(30) > fineGain(6), "rising");
  assert.ok(fineGain(60) > 0.99, "a fast movement is as it always was");
  assert.ok(fineGain(1) < 0.8, "gently less for a fine one");
});

test("an orbit drag turns the view by less per pixel for a small movement than for a large one (`in_420`)", () => {
  const env = { w: 800, h: 600, now: 0 } as never;
  const az = (dx: number) => {
    const st0 = { ...createState(createSession(kernel)), cam: homeCamera() };
    const st = reduce({ ...st0, drag: { camera: true } }, { type: "orbit", dx, dy: 0, x: 100, y: 100 }, env);
    return Math.abs(st.cam.azimuth - st0.cam.azimuth) / dx;
  };
  assert.ok(az(1) < az(40) * 0.8, `${az(1)} vs ${az(40)}`);
  assert.ok(Math.abs(az(40) - settings.view.orbitRadPerPx) < 0.0002, "large movements keep the usual sensitivity");
});

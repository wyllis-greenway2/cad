// Going in and out of game mode and of the straight (orthographic) view leaves no half-made view (`in_471`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession } from "../src/interaction/session.ts";
import { createState, reduce, advance } from "../src/interaction/controller.ts";
import { homeCamera, mixOf } from "../src/interaction/camera.ts";
import { settings } from "../src/shared/settings.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;

test("a walk begun while the view is turning to a straight one gives that up and the perspective comes back, whole, from where it was: no narrowed lens is left", () => {
  let st = { ...createState(createSession(kernel)), cam: homeCamera() };
  const to = { ...homeCamera(), straight: true, azimuth: 0, elevation: 0 };
  st = { ...st, anim: { from: st.cam, to, t0: 0 } };
  st = advance(st, settings.view.transitionMs * 0.5);
  const mid = mixOf(st.cam);
  assert.ok(mid < 0.95 && !st.cam.straight, `part way: the lens is narrowing (${mid})`);
  st = reduce(st, { type: "walk", forward: 1, right: 0, dt: 0.016 }, env); // W pressed midway
  assert.equal(st.anim, null, "the turn is given up");
  assert.ok(st.mixT0 !== null, "and the perspective is on its way back");
  let now = settings.view.transitionMs * 0.5;
  for (let k = 0; k < 200 && (st.mixT0 !== null || st.anim); k++) { now += 20; st = advance(st, now); }
  assert.equal(mixOf(st.cam), 1, "the whole perspective is back");
  assert.equal(st.cam.straight, false);
  assert.equal(st.mixT0, null);
});

test("a turn that was not given up still arrives at the straight view", () => {
  let st = { ...createState(createSession(kernel)), cam: homeCamera() };
  st = { ...st, anim: { from: st.cam, to: { ...homeCamera(), straight: true }, t0: 0 } };
  st = advance(st, settings.view.transitionMs + 1);
  assert.equal(st.cam.straight, true);
  assert.equal(st.anim, null);
});

// The Geneva drive played from its crank (`dec_mechanism_motion`, stage 3b): the wheel steps one slot for each turn of the crank, the locking disc turns with the crank, and the pose is not kept.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { CamSpec } from "../src/operation/cams.ts";
import { genevaBodies, genevaTurn, followAmount, gearOfBody } from "../src/operation/gearcouple.ts";
import { startMotion, keepCommand } from "../src/interaction/motion.ts";
import { jointMatrix } from "../src/interaction/motion.ts";

await kernel.init();
const XY = worldRef("XY");
const sp: CamSpec = { kind: "geneva", teeth: 5, diameter: 40, crank: 20, pin: 5, clearance: 0.3, hole: -1, lift: 0, layout: "model", layer: 6, plate: 3 };
const make = () => {
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: XY, at: [0, 0, 0], spec: { teeth: 1, module: 1, cam: sp } });
  assert.ok(!s.message, s.message ?? "");
  return s;
};

test("the wheel turns a slot (360/n degrees) for each turn of the crank, stands still between the visits, and is half way at the middle of the visit", () => {
  const step = 360 / 5;
  for (const [deg, want] of [[0, 0], [30, 0], [180, -step / 2], [330, -step], [360, -step], [540, -step * 1.5], [720, -2 * step], [-30, 0]] as const) assert.ok(Math.abs(genevaTurn(5, 20, deg) - want) < 1e-6, `${deg}: ${genevaTurn(5, 20, deg)}`);
  let prev = genevaTurn(5, 20, 0); // (never goes back, and each step of a degree is small: the pin is in the slot)
  for (let d = 1; d <= 720; d++) { const t = genevaTurn(5, 20, d); assert.ok(t <= prev + 1e-9 && prev - t < 3, `${d}`); prev = t; }
});

test("playing the crank carries the disc about its shaft and the wheel by the law; the wheel cannot be played; the pose is not kept", () => {
  const s = make();
  const b = genevaBodies(scene(s), scene(s).gears![0]!);
  assert.ok(b.wheel && b.disc && b.crank, JSON.stringify(b));
  assert.equal(gearOfBody(scene(s), b.wheel!)?.id, "g_001");
  const r = startMotion(scene(s), b.crank!);
  assert.ok(r.ok, r.ok ? "" : r.why);
  if (!r.ok) return;
  const c = 20 / Math.sin(Math.PI / 5);
  assert.ok(Math.abs(r.motion.point[0] - c) < 1e-9 && Math.abs(r.motion.point[1]) < 1e-9, "the crank turns about the second shaft");
  assert.equal(r.motion.follows.length, 2);
  const [wheel, disc] = [r.motion.follows.find((f) => f.body === b.wheel)!, r.motion.follows.find((f) => f.body === b.disc)!];
  assert.ok(Math.abs(followAmount(wheel, 180) + 36) < 1e-9);
  assert.equal(followAmount(disc, 90), 90);
  assert.deepEqual(wheel.point, [0, 0, 0]);
  assert.equal(jointMatrix(wheel, followAmount(wheel, 360)).length, 16);
  const again = startMotion(scene(s), b.disc!);
  assert.ok(again.ok);
  const bad = startMotion(scene(s), b.wheel!);
  assert.ok(!bad.ok && /crank/.test(bad.why));
  assert.equal(keepCommand(scene(s), { ...r.motion, amount: 90 }), null);
});

test("a body hooked up to an animation has a play button: the crank, the disc and the wheel of a Geneva drive all play the crank; pressing it again pauses; a plain body has none", async () => {
  const { createState, reduce } = await import("../src/interaction/controller.ts");
  const { homeCamera } = await import("../src/interaction/camera.ts");
  const { frameOf } = await import("../src/interaction/frame.ts");
  const s = make();
  const b = genevaBodies(scene(s), scene(s).gears![0]!);
  const env = { w: 800, h: 600, now: 0 };
  let st = { ...createState(s), cam: homeCamera() };
  let f = frameOf(st, { w: 800, h: 600 });
  const plays = (ff: typeof f) => Object.fromEntries(ff.bodyEyes.map((e) => [e.ref, e.play ?? null]));
  assert.deepEqual([plays(f)[b.wheel!], plays(f)[b.disc!], plays(f)[b.crank!]], ["play", "play", "play"]);
  st = reduce(st, { type: "runAction", id: `body:play:${b.wheel}` }, env as never);
  assert.ok(st.motion?.playing && st.motion.body === b.crank, "the wheel's button plays its crank");
  f = frameOf(st, { w: 800, h: 600 });
  assert.equal(plays(f)[b.crank!], "pause");
  st = reduce(st, { type: "runAction", id: `body:play:${b.crank}` }, env as never);
  assert.equal(st.motion!.playing, false, "pressed again it pauses");
  st = reduce(st, { type: "runAction", id: `body:play:${b.crank}` }, env as never);
  assert.equal(st.motion!.playing, true, "and goes on");
  const none = reduce(st, { type: "runAction", id: "body:play:b/nope/o" }, env as never);
  assert.match(none.session.message ?? "", /not hooked up/);
});

test("the play button of an animated body is for the body that is selected (or has a face selected), not for the one the pointer is over; the pause button stays while it plays (`in_962`)", async () => {
  const { createState } = await import("../src/interaction/controller.ts");
  const { homeCamera } = await import("../src/interaction/camera.ts");
  const { frameOf } = await import("../src/interaction/frame.ts");
  const s = make();
  const b = genevaBodies(scene(s), scene(s).gears![0]!);
  const base = { ...createState(s), cam: homeCamera() };
  const eyes = (st: typeof base) => Object.fromEntries(frameOf(st, { w: 800, h: 600 }).bodyEyes.map((e) => [e.ref, e.selected ?? false]));
  assert.deepEqual([eyes(base)[b.wheel!], eyes(base)[b.crank!]], [false, false], "nothing selected: no button");
  const hovered = { ...base, session: { ...base.session, hover: b.crank } };
  assert.equal(eyes(hovered as typeof base)[b.crank!], false, "pointed at: still no button");
  const sel = { ...base, session: { ...base.session, click: { ...base.session.click, selection: [b.crank!] } } };
  assert.equal(eyes(sel as typeof base)[b.crank!], true, "selected: the button");
  assert.equal(eyes(sel as typeof base)[b.wheel!], false, "and only for that body");
});

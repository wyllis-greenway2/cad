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

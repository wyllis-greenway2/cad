// Hypoid pairs (`dec_hypoid_gears`, `in_915`): the pair's numbers and limits, and two pairs made by Mesh gear fit in the kernel.
import test from "node:test";
import assert from "node:assert/strict";
import { spiralPairOf } from "../src/operation/spiral.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { overlapOf } from "./helpers/spiralpair.ts";

await kernel.init();

test("a hypoid pair (`dec_hypoid_gears`): zero offset is the spiral pair, the pinion's cone grows and the ring's falls with the offset, the limits say why", () => {
  const a = spiralPairOf(20, 36, 3, 35, 0.05, 0, 0), b = spiralPairOf(20, 36, 3, 35, 0.05, 0, 12);
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.ok(Math.abs(a.value.pinion.gamma - Math.atan(20 / 36)) < 1e-12 && Math.abs(a.value.ring.gamma - (Math.PI / 2 - Math.atan(20 / 36))) < 1e-12);
  assert.ok(b.value.pinion.gamma > a.value.pinion.gamma && b.value.ring.gamma < a.value.ring.gamma, "the pinion's cone grows, the ring's falls");
  const big = spiralPairOf(20, 36, 3, 35, 0.05, 0, 40);
  assert.ok(!big.ok && /offset can be 0.15/.test(big.error), big.ok ? "" : big.error);
  const neg = spiralPairOf(20, 36, 3, 35, 0.05, 0, -3);
  assert.ok(!neg.ok && /offset must be 0 or more/.test(neg.error));
});
for (const [z1, z2, angle, offset] of [[20, 36, 35, 12], [24, 30, 35, 9], [20, 40, 35, 20]] as const) {
  test(`hypoid pair ${z1} / ${z2} at ${angle} degrees, offset ${offset} mm, made by Mesh gear fits at its place and not half a pitch round`, () => {
    const [fit, wrong] = [overlapOf(z1, z2, 3, 0, angle, offset), overlapOf(z1, z2, 3, Math.PI / z2, angle, offset)];
    console.log("HYPOID", z1, z2, fit, wrong);
    assert.ok(fit < 10, `${z1}/${z2} at its place: ${fit}`);
    assert.ok(wrong > 20 * Math.max(fit, 1), `${z1}/${z2} half a pitch round: ${wrong}`);
  });
}

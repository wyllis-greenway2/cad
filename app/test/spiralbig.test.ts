// The biggest spiral pairs the tool makes (`dec_spiral_bevel_gears`, "Limits opened", `in_927`): a ring of 2.5 times the pinion and a pair of 64 teeth.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { overlapOf } from "./helpers/spiralpair.ts";

await kernel.init();

for (const [z1, z2, angle] of [[17, 43, 30], [22, 42, 30]] as const) {
  test(`spiral pair ${z1} / ${z2} at ${angle} degrees made by Mesh gear fits at its place and not half a pitch round`, () => {
    const [fit, wrong] = [overlapOf(z1, z2, 3, 0, angle), overlapOf(z1, z2, 3, Math.PI / z2, angle)];
    console.log("SPIRAL", z1, z2, fit, wrong);
    assert.ok(fit < 10, `${z1}/${z2} at its place: ${fit}`);
    assert.ok(wrong > 20 * Math.max(fit, 1), `${z1}/${z2} half a pitch round: ${wrong}`);
  });
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { cam, near } from "./helpers.ts";
import { settings } from "../src/settings.ts";
import { createGame } from "../src/game.ts";

test("[C4] the smallest mouse movements turn the view a little less, rising to all of it", () => {
  assert.ok(Math.abs(cam.fineGain(0) - settings.input.fineGain) < 1e-12);
  assert.ok(cam.fineGain(1) > cam.fineGain(0) && cam.fineGain(6) > cam.fineGain(1));
  assert.ok(cam.fineGain(60) > 0.999);
  for (let m = 0; m < 80; m += 1) assert.ok(cam.fineGain(m + 1) >= cam.fineGain(m));
});

test("[B3] the button of the axis the view is nearest to takes the teal as the view comes round, with the side it is looked from", () => {
  for (const [axis, side] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]] as const) {
    const d = cam.straightDirection(axis, side);
    const f = cam.facing({ ...cam.home(), yaw: d.yaw, pitch: d.pitch });
    assert.equal(f.axis, axis); assert.equal(f.sign, side); near(f.strength, 1, 1e-9);
  }
  const diagonal = cam.facing({ ...cam.home(), yaw: -2.356, pitch: -0.6155 });
  assert.ok(diagonal.strength < 0.01, "at the diagonal no button is teal");
  const strengths = [50, 60, 70, 80, 90].map((deg) => cam.facing({ ...cam.home(), yaw: 0, pitch: -(deg * Math.PI) / 180 }).strength);
  for (let i = 1; i < strengths.length; i++) assert.ok(strengths[i]! > strengths[i - 1]!, "it grows as the view comes round to the top");
});

test("[B4] there are no letter keys for the views: no key handler names X, Y, Z or N, and the game takes only W A S D", () => {
  for (const f of readdirSync(new URL("../src", import.meta.url))) {
    const text = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
    assert.equal(/Key[XYZN]\b/.test(text), false, `${f} names a letter key for a view`);
  }
  const g = createGame();
  for (const k of ["KeyX", "KeyY", "KeyZ", "KeyN"]) assert.equal(g.moves(k), false);
});

test("[W16] the look's numbers are the prototype's hand-tuned values, in the one settings file", () => {
  assert.deepEqual(settings.theme.axis, [0.17, 0.17, 0.19]);
  assert.deepEqual(settings.theme.pane, [0.55, 0.58, 0.64]);
  assert.deepEqual(settings.theme.grid, [0.62, 0.63, 0.67]);
  assert.equal(settings.theme.minorAlpha, 0.35); assert.equal(settings.theme.majorAlpha, 0.7);
  assert.deepEqual(settings.orb.color, [0.1, 0.72, 0.7]);
  assert.equal(settings.world.axisLengthMm, 24); assert.equal(settings.world.paneGapMm, 3); assert.equal(settings.world.paneMm, 8);
  assert.equal(settings.world.paneRound, 0.18); assert.equal(settings.world.paneOpacity, 0.18); assert.equal(settings.world.paneActiveOpacity, 0.4);
  assert.equal(settings.buttons.marginPx, 18); assert.equal(settings.buttons.sizePx, 34);
  assert.equal(settings.view.fovDeg, 35); assert.equal(settings.view.homeElevation, 0.5); assert.equal(settings.view.homeDistance, 120);
  assert.equal(settings.theme.background, 0xffffff);
});

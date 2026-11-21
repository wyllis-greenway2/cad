import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/game.ts";
import { settings } from "../src/settings.ts";
import { near } from "./helpers.ts";

test("[C15] game mode is switched on by the game and stays on; the movement keys count only while it is on", () => {
  const g = createGame();
  assert.equal(g.on, false);
  assert.equal(g.moves("KeyW"), true); assert.equal(g.moves("KeyA"), true); assert.equal(g.moves("KeyX"), false); assert.equal(g.moves("Space"), false);
  assert.equal(g.key("KeyW", true), false, "off: a movement key is not the game's");
  g.start();
  assert.equal(g.on, true);
  assert.equal(g.key("KeyW", true), true); assert.equal(g.key("KeyQ", true), false);
  for (let i = 0; i < 200; i++) g.tick(0.05);
  assert.equal(g.on, true, "it does not end by itself");
  g.end();
  assert.equal(g.on, false);
});

test("[C15 C16] W eases up to flight speed and, let go, eases down to rest; S is the other way, A and D across", () => {
  const g = createGame(); g.start();
  g.key("KeyW", true);
  const first = g.tick(0.02);
  assert.ok(first.ahead > 0 && first.ahead < settings.input.flySpeed, "easing up");
  let t = first;
  for (let i = 0; i < 20; i++) t = g.tick(0.02);
  near(t.ahead, settings.input.flySpeed, 1e-12);
  assert.equal(t.side, 0);
  g.key("KeyW", false);
  for (let i = 0; i < 20; i++) t = g.tick(0.02);
  assert.equal(t.ahead, 0); assert.equal(g.on, true);
  g.key("KeyS", true); for (let i = 0; i < 20; i++) t = g.tick(0.02); near(t.ahead, -settings.input.flySpeed, 1e-12); g.key("KeyS", false);
  g.key("KeyD", true); for (let i = 0; i < 20; i++) t = g.tick(0.02); near(t.side, settings.input.flySpeed, 1e-12); g.key("KeyD", false);
  g.key("KeyA", true); for (let i = 0; i < 30; i++) t = g.tick(0.02); near(t.side, -settings.input.flySpeed, 1e-12);
});

test("[C15] the mouse's turning is let out over a few ticks, all of it, and none while game mode is off", () => {
  const g = createGame();
  g.look(10, 4);
  assert.deepEqual(g.tick(0.016), { on: false, ahead: 0, side: 0, dx: 0, dy: 0 }, "off: it is not kept");
  g.start();
  g.look(20, -8);
  let sx = 0, sy = 0, first = true;
  for (let i = 0; i < 40; i++) { const r = g.tick(0.016); if (first) { assert.ok(Math.abs(r.dx) < 20, "not all at once"); first = false; } sx += r.dx; sy += r.dy; }
  near(sx, 20, 0.01); near(sy, -8, 0.01);
});

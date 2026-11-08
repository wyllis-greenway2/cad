// The linear repeat in the kernel: copies that overlap are joined, copies that stand apart are one compound, and a big grid does not take the time it did (`in_236`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { worldRef } from "../src/shared/ref.ts";

await kernel.init();
const XY = worldRef("XY");

function grid(nx: number, ny: number, d: number) {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 5 } } });
  const t0 = performance.now();
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "pattern", parts: ["b/body/o" as never], params: { mode: "linear", nx, ny, nz: 1, dx: d, dy: d, dz: 0 } } });
  return { s, ms: performance.now() - t0 };
}

test("copies that overlap are joined into one body; copies that stand apart are all there", () => {
  const near = grid(3, 3, 6); // 10 wide, 6 apart: they overlap
  assert.deepEqual(near.s.outcome.errors, {});
  assert.ok(Math.abs(near.s.outcome.kernel!.volume! - 22 * 22 * 5) < 1e-3, `the union of the overlapping squares (${near.s.outcome.kernel!.volume})`);
  const apart = grid(3, 3, 15);
  assert.deepEqual(apart.s.outcome.errors, {});
  assert.ok(Math.abs(apart.s.outcome.kernel!.volume! - 9 * 500) < 1e-3, `nine copies (${apart.s.outcome.kernel!.volume})`);
  const touching = grid(3, 1, 10); // exactly touching: a real join
  assert.ok(Math.abs(touching.s.outcome.kernel!.volume! - 3 * 500) < 1e-3);
});

test("a grid of a hundred copies is made in a few seconds at most, not the half minute of joining them one after another", () => {
  const big = grid(10, 10, 15);
  assert.deepEqual(big.s.outcome.errors, {});
  assert.ok(Math.abs(big.s.outcome.kernel!.volume! - 100 * 500) < 1e-2);
  assert.ok(big.ms < 3000, `${Math.round(big.ms)} ms`);
});

test("a circular repeat joins its copies too (in pairs), and the result is the same as before", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [20, -5, 0], [30, 5, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 5 } } });
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "pattern", parts: ["b/body/o" as never], params: { mode: "circular", count: 6, angle: 360, axis: 2, px: 0, py: 0, pz: 0 } } });
  assert.deepEqual(s.outcome.errors, {});
  assert.ok(Math.abs(s.outcome.kernel!.volume! - 6 * 500) < 1e-2, `six copies (${s.outcome.kernel!.volume})`);
});

// Survey of the spiral / hypoid pairs the tool refuses (`dec_spiral_bevel_gears`, `dec_hypoid_gears`): with the limits lifted, does the kernel make each gear (with the cone retry) and does the pair fit?
// Env Z1 Z2 MN BETA OFFSET. One pair per process (a failed boolean can corrupt the kernel).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { SPIRAL } from "../../app/src/operation/spiral.ts";
import { meshWith } from "../../app/src/operation/mesh.ts";
import { createSession, run, scene } from "../../app/src/interaction/session.ts";
import type { GearSpec } from "../../app/src/operation/gear.ts";
import { worldRef } from "../../app/src/shared/ref.ts";

(SPIRAL as { maxTotal: number }).maxTotal = 400; (SPIRAL as { maxRatio: number }).maxRatio = 6; (SPIRAL as { maxOffset: number }).maxOffset = 1;
const bodies = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: string; volume: number }[];
test("pair", async () => {
  await kernel.init();
  const [z1, z2, mn, beta, off] = [Number(process.env.Z1), Number(process.env.Z2), Number(process.env.MN ?? 3), Number(process.env.BETA ?? 30), Number(process.env.OFFSET ?? 0)];
  const spec = { teeth: z1, module: mn, bevel: { mate: z2, spiral: beta, ...(off ? { offset: off } : {}) } } as GearSpec;
  const src = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec };
  const p = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: z2 }, 0.3);
  if (!p.ok) { console.log(`RESULT ${z1}/${z2} m${mn} b${beta} o${off}: no pair: ${p.error}`); return; }
  const t0 = Date.now();
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: src.at, spec });
  const t1 = Date.now();
  if (s.message) { console.log(`RESULT ${z1}/${z2} m${mn} b${beta} o${off}: pinion failed (${((t1 - t0) / 1000).toFixed(0)} s): ${s.message.slice(0, 120)}`); return; }
  s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: p.value.at, turn: p.value.turn, spec: p.value.spec });
  const t2 = Date.now();
  if (s.message) { console.log(`RESULT ${z1}/${z2} m${mn} b${beta} o${off}: ring failed (${((t2 - t1) / 1000).toFixed(0)} s): ${s.message.slice(0, 120)}`); return; }
  const b = bodies(s);
  assert.equal(b.length, 2);
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref), params: { mode: "intersect" } } } as never);
  const ov = /nothing in common/.test(done.message ?? "") ? 0 : bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
  console.log(`RESULT ${z1}/${z2} m${mn} b${beta} o${off}: ok, pinion ${((t1 - t0) / 1000).toFixed(0)} s, ring ${((t2 - t1) / 1000).toFixed(0)} s, overlap ${ov.toFixed(1)} mm3`);
});

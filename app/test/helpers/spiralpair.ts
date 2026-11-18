// The overlap of the two gears of a spiral or hypoid pair made by Mesh gear, in the kernel (shared by `spiral.test.ts`, `spiralbig.test.ts` and `hypoid.test.ts`: each file runs in its own process, a heavy pair can leave the kernel unable to go on).
import assert from "node:assert/strict";
import type { GearSpec } from "../../src/operation/gear.ts";
import { meshWith } from "../../src/operation/mesh.ts";
import { kernel } from "../../src/compiler/kernel/index.ts";
import { worldRef } from "../../src/shared/ref.ts";
import { createSession, run, scene } from "../../src/interaction/session.ts";
import type { Session } from "../../src/interaction/session.ts";

const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: string; volume: number }[];
export const overlapOf = (z1: number, z2: number, mod: number, turn: number, angle = 30, offset = 0): number => {
  const spec = { teeth: z1, module: mod, bevel: { mate: z2, spiral: angle, ...(offset ? { offset } : {}) } } as GearSpec;
  const src = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec };
  const p = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: z2 }, 0.3);
  assert.ok(p.ok, p.ok ? "" : p.error);
  const pv = p.ok ? p.value : null!;
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: src.at, spec });
  s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: pv.at, turn: pv.turn + turn, spec: pv.spec });
  assert.ok(!s.message, s.message ?? "");
  const b = bodies(s);
  assert.equal(b.length, 2);
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref), params: { mode: "intersect" } } } as never);
  if (/nothing in common/.test(done.message ?? "")) return 0;
  return bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
};

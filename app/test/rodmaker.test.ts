// The connecting rod maker (`dec_rod_maker`): the Rod model with its own box. A rod lies along +x with the big end at the origin; it has a cap, an optional sleeve, two shells and two bolts, each a body of its own that shares no volume with another; the engine builds its rod by the same code (with the new parts off).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { ROD_START, ROD_PRESETS, rodGeometry, rodProblem, rodSteps } from "../src/operation/modelrod.ts";
import { modelNumbers, modelFields, modelProblem, modelAbout } from "../src/operation/modelkinds.ts";
import { asCommand } from "../src/operation/modelparts.ts";
import type { Result } from "../src/shared/result.ts";
import type { ModelBuild } from "../src/operation/modelparts.ts";

await kernel.init();
type B = { ref: string; volume: number; bbox: { min: number[]; max: number[] } };
type Sess = ReturnType<typeof createSession>;
function made(r: Result<ModelBuild>): { s: Sess; bs: B[] } {
  if (!r.ok) throw new Error(r.error);
  const c = asCommand(scene(createSession(kernel)), r.value.steps);
  if (!c.ok) throw new Error(c.error);
  const s = run(createSession(kernel), c.value);
  assert.equal(s.message ?? null, null);
  return { s, bs: Object.values(scene(s).parts).filter((x) => x.kind === "body") as unknown as B[] };
}
const R = (o: Partial<typeof ROD_START> = {}): typeof ROD_START => ({ ...ROD_START, ...o });
const total = (o: Partial<typeof ROD_START>): number => made(rodSteps(R(o))).bs.reduce((a, b) => a + b.volume, 0);
const shared = (s: Sess, a: B, b: B): number => {
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: [a.ref, b.ref], params: { mode: "intersect" } } } as never);
  return /nothing in common/.test(done.message ?? "") ? 0 : (Object.values(scene(done).parts).filter((p) => p.kind === "body") as unknown as B[]).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
};

test("the whole rod: seven bodies (rod, cap, sleeve, two shells, two bolts), none sharing any volume with another", () => {
  const { s, bs } = made(rodSteps(R()));
  assert.equal(bs.length, 7);
  assert.ok(bs.every((b) => b.volume > 0));
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) assert.equal(shared(s, bs[i]!, bs[j]!), 0, `bodies ${i} and ${j} share volume`);
});

test("the rod lies along +x from the big end at the origin to the small end, resting on the ground, as thick as the numbers say", () => {
  const bare = R({ shells: 0, bush: 0, bolts: 0 }), g = rodGeometry(bare), { bs } = made(rodSteps(bare));
  assert.equal(bs.length, 2, "only the rod and the cap");
  const rod = [...bs].sort((a, b) => b.volume - a.volume)[0]!;
  assert.ok(Math.abs(rod.bbox.max[0]! - (g.l + g.rs)) < 0.05, `the small end outside: ${rod.bbox.max[0]} against ${g.l + g.rs}`);
  assert.ok(Math.abs(rod.bbox.min[2]!) < 0.01 && Math.abs(rod.bbox.max[2]! - g.w) < 0.01, `from the ground to the thickness: ${rod.bbox.min[2]} to ${rod.bbox.max[2]}`);
});

test("each option is a body or a change of the rod, not both: shells, sleeve and bolts add bodies; pockets and a thin small end take volume off the rod", () => {
  const n = (o: Partial<typeof ROD_START>): number => made(rodSteps(R(o))).bs.length;
  assert.equal(n({ shells: 0 }), 5);
  assert.equal(n({ bush: 0 }), 6);
  assert.equal(n({ bolts: 0 }), 5);
  const bare = { shells: 0, bush: 0, bolts: 0 };
  const none = total({ ...bare, pockets: 0 }), one = total({ ...bare, pockets: 1 }), two = total({ ...bare, pockets: 2 });
  assert.ok(one < none && two < none && two > one, `none ${none.toFixed(0)}, one ${one.toFixed(0)}, two ${two.toFixed(0)}: two pockets leave a rib`);
  assert.ok(total({ ...bare, smallThick: 6 }) < total({ ...bare }), "a narrower small end is lighter");
});

test("the shells fit between the crank pin and the big bore, the sleeve between the pin and the small bore: the walls are the numbers", () => {
  const g = rodGeometry(R()), { bs } = made(rodSteps(R()));
  assert.ok(g.shell > 0.8 && g.shell < 0.9, `the shell wall is 0.029 of the crank pin: ${g.shell}`);
  assert.ok(Math.abs(g.ri - (15 + 0.15 + g.shell)) < 1e-9 && Math.abs(g.eye - (9 + 0.15 + g.bush)) < 1e-9);
  const small = bs.find((b) => Math.abs(b.bbox.max[0]! - (g.l + g.eye + 0 - 0.02)) < 0.01);
  assert.ok(small, "the sleeve is found at the small end");
});

test("Honda's GX160 rod is a preset: its length, its pins, no shells and no sleeve (Honda's clearances are on the bare bore), two bolts", () => {
  const n = modelNumbers("rod", { preset: 1 });
  assert.equal(n.length, 84.1);
  assert.equal(n.pin, 18);
  assert.equal(n.shells, 0);
  assert.equal(n.bush, 0);
  assert.equal(ROD_PRESETS.length, 1);
  assert.ok(Math.abs(2 * rodGeometry(ROD_PRESETS[0]!.spec).ri - 30.3) < 1e-9, "the big bore is the crank pin and its room");
  assert.equal(made(rodSteps(ROD_PRESETS[0]!.spec)).bs.length, 4, "the rod, the cap and the two bolts");
});

test("numbers that make no rod are refused, with the reason", () => {
  assert.match(rodProblem(R({ length: 20 }))!, /too short/);
  assert.match(rodProblem(R({ shellWall: 9 }))!, /shells/);
  assert.match(rodProblem(R({ pin: 0 }))!, /more than 0/);
  assert.match(rodProblem(R({ pockets: 5 }))!, /choice/);
  assert.equal(rodProblem(R()), null);
  assert.equal(rodSteps(R({ length: 20 })).ok, false);
});

test("the model's box: every number is in a group, a typed number replaces the preset's, and the line under the numbers says what the rod is", () => {
  const keys = modelFields("rod").map((f) => f.key);
  for (const k of Object.keys(ROD_START)) assert.ok(keys.includes(k), `${k} is a field`);
  assert.deepEqual([...new Set(modelFields("rod").filter((f) => f.section).map((f) => f.section))], ["Size", "Beam", "Small end", "Big end"]);
  assert.equal(modelNumbers("rod", { preset: 1, length: 90 }).length, 90);
  assert.equal(modelProblem("rod", modelNumbers("rod", {})), null);
  assert.match(modelAbout("rod", modelNumbers("rod", { preset: 1 })), /Honda GX160/);
});

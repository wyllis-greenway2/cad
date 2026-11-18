// Spiral bevel gears (`dec_spiral_bevel_gears`, `in_836`): a bevel gear record with a spiral angle; its tooth from the gearing law (`spiral.ts`), the body a smooth loft of nine planes cut to the blank of two cones; the pair made by Mesh gear fits in the kernel.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { meshWith } from "../src/operation/mesh.ts";
import { spiralPairOf, spiralBody } from "../src/operation/spiral.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";

await kernel.init();
const pinion = (over: Partial<GearSpec> = {}): GearSpec => ({ teeth: 20, module: 3, ...over, bevel: { mate: 30, spiral: 30 } });
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: string; volume: number }[];
const err = (s: GearSpec) => { const r = gearOutline(s); return r.ok ? "" : r.error; };

test("the limits of a spiral pair say why: a small pinion, a big pair, a steep ring, the angle, the shafts", () => {
  assert.equal(err(pinion()), "");
  assert.match(err(pinion({ teeth: 12 })), /16 or more teeth/);
  assert.match(err({ ...pinion(), teeth: 30, bevel: { mate: 40, spiral: 30 } }), /more than 56 teeth in all/);
  assert.match(err({ ...pinion({ teeth: 16 }), bevel: { mate: 34, spiral: 30 } }), /2.05 to 1/);
  assert.match(err({ ...pinion(), bevel: { mate: 30, spiral: 5 } }), /spiral angle must be/);
  assert.match(err({ ...pinion(), bevel: { mate: 30, spiral: 30, shaft: 80 } }), /90 degrees only/);
  assert.match(err(pinion({ pressure: 25 })), /20 degrees only/);
  const p = spiralPairOf(20, 30, 3, 30, 0.05);
  assert.ok(p.ok);
  const [a, b] = [spiralBody(p.value, "pinion"), spiralBody(p.value, "ring")];
  assert.ok(a.ok && b.ok);
  assert.equal(a.value.sections.length, 9);
  assert.equal(a.value.sections[0]!.points.length, 20 * 10, "ten sides to each tooth: four arcs a flank, one across the tip and one across the root");
});

test("the gear command makes a spiral bevel gear: one body (the prism cut to the blank), a bore through it", () => {
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: pinion({ bore: 5 }) });
  assert.ok(!s.message, s.message ?? "");
  assert.deepEqual(scene(s).steps.map((x) => x.type), ["loft", "revolve", "combine"]);
  assert.deepEqual(s.outcome.errors, {});
  assert.equal(bodies(s).length, 1);
});

const overlapOf = (z1: number, z2: number, mod: number, turn: number, angle = 30): number => {
  const spec = { teeth: z1, module: mod, bevel: { mate: z2, spiral: angle } } as GearSpec;
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
test("a spiral pair made by Mesh gear fits at its place and not half a pitch round (20 / 30, module 3)", () => {
  const [fit, wrong] = [overlapOf(20, 30, 3, 0), overlapOf(20, 30, 3, Math.PI / 30)];
  console.log("SPIRAL overlap", fit, wrong);
  assert.ok(fit < 10, `at its place: ${fit}`);
  assert.ok(wrong > 20 * Math.max(fit, 1), `half a pitch round: ${wrong}`);
});

test("other pairs made by Mesh gear (24 / 24 and 16 / 32; 22 / 34 at 35 degrees) fit at their place, rolled, and not half a pitch round", () => {
  for (const [z1, z2, angle] of [[24, 24, 30], [16, 32, 30], [22, 34, 35]] as const) {
    const [fit, wrong] = [overlapOf(z1, z2, 3, 0, angle), overlapOf(z1, z2, 3, Math.PI / z2, angle)];
    console.log("SPIRAL", z1, z2, fit, wrong);
    assert.ok(fit < 10, `${z1}/${z2} at its place: ${fit}`);
    assert.ok(wrong > 20 * Math.max(fit, 1), `${z1}/${z2} half a pitch round: ${wrong}`);
  }
});

test("a spiral pair is linked: the partner's teeth changed in its box, the other gear's mate teeth follow and the partner is placed again so that the pair still fits", () => {
  const spec = { teeth: 20, module: 3, bevel: { mate: 30, spiral: 30 } } as GearSpec;
  const src = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec };
  const p = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 30 }, 0.3);
  assert.ok(p.ok);
  const pv = p.ok ? p.value : null!;
  assert.equal(pv.spec.bevel?.with, "g_001");
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: src.at, spec });
  s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: pv.at, turn: pv.turn, spec: pv.spec });
  assert.ok(!s.message, s.message ?? "");
  const rec2 = scene(s).gears!.find((g) => g.id === "g_002")!;
  const edited = run(s, { type: "setGear", id: "g_002", spec: { ...rec2.spec, teeth: 26 }, at: rec2.at, turn: rec2.turn } as never);
  assert.ok(!edited.message, edited.message ?? "");
  const [a, b] = ["g_001", "g_002"].map((id) => scene(edited).gears!.find((g) => g.id === id)!);
  assert.equal(a!.spec.bevel!.mate, 26, "the first gear's mate teeth follow");
  assert.equal(b!.spec.teeth, 26);
  assert.equal(b!.spec.bevel!.spiral, 30);
  assert.deepEqual(edited.outcome.errors, {});
  const bs = bodies(edited);
  assert.equal(bs.length, 2);
  const done = run(edited, { type: "addStep", step: { id: "s_900", type: "combine", parts: bs.map((x) => x.ref), params: { mode: "intersect" } } } as never);
  const over = /nothing in common/.test(done.message ?? "") ? 0 : bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
  console.log("SPIRAL linked", over);
  assert.ok(over < 10, `the pair still fits: ${over}`);
});

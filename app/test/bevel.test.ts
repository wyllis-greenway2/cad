// Straight bevel gears (`dec_bevel_gears`, `in_735`): an approximation of the standard tooth, made as a ruled loft of two sections.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { bevelOf, pitchAngle } from "../src/operation/bevel.ts";
import { meshWith } from "../src/operation/mesh.ts";
import { standIns } from "../src/interaction/standin.ts";
import type { GearRecord } from "../src/operation/gearscene.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";

await kernel.init();
const pinion: GearSpec = { teeth: 20, module: 2, bevel: { mate: 30 } };
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { ref: string; volume: number }[];
const err = (s: GearSpec) => { const r = gearOutline(s); return r.ok ? "" : r.error; };

test("the numbers of a bevel gear: pitch angles add to the shaft angle, the cone distance and the KHK proportions", () => {
  const [a, b] = [pitchAngle(20, 30, 90), pitchAngle(30, 20, 90)];
  assert.ok(Math.abs(a + b - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(Math.tan(a) - 20 / 30) < 1e-12, "tan delta = z1 / z2 at 90 degrees");
  const g = bevelOf(pinion);
  assert.ok(g.ok);
  const v = (g as { value: ReturnType<typeof bevelOf> extends infer T ? T extends { ok: true; value: infer V } ? V : never : never }).value;
  assert.ok(Math.abs(v.R - (2 * 20) / (2 * Math.sin(a))) < 1e-9);
  assert.ok(Math.abs(v.addendum + v.dedendum - 2.188 * 2) < 1e-9, "whole depth 2.188 m");
  assert.ok(Math.abs(v.face - v.R / 3) < 1e-9, "the face is a third of the cone distance");
  const mate = bevelOf({ teeth: 30, module: 2, bevel: { mate: 20 } });
  assert.ok(mate.ok && Math.abs((mate as { value: { addendum: number } }).value.addendum + v.addendum - 4) < 1e-9, "the addenda of the pair add to 2 m (long and short addendum)");
});

test("refusals say why", () => {
  assert.match(err({ ...pinion, teeth: 4 }), /6 to 200 teeth/);
  assert.match(err({ ...pinion, bevel: { mate: 3 } }), /meshes with needs/);
  assert.match(err({ ...pinion, bevel: { mate: 30, shaft: 10 } }), /shafts must be/);
  assert.match(err({ ...pinion, bevel: { mate: 30, face: 0.9 } }), /face width/);
  assert.equal(err(pinion), "");
  const o = gearOutline(pinion);
  assert.ok(o.ok && o.value.warnings.some((w) => /approximation/.test(w)), "the outline says it is an approximation");
});

test("the gear command makes a bevel gear: one body (the tooth prism cut to the blank of cone ends), with a bore through it, and the tooth no taller than a bevel tooth is (`in_763`)", () => {
  for (const [z, mate] of [[20, 30], [20, 20], [30, 20], [60, 15]] as const) {
    const sp: GearSpec = { teeth: z, module: 2, bevel: { mate }, bore: 5 };
    const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: sp });
    assert.ok(!s.message, s.message ?? "");
    assert.deepEqual(scene(s).steps.map((x) => x.type), ["loft", "revolve", "combine"], "the prism, the blank, and the two intersected");
    assert.equal(scene(s).steps[0]!.params.ruled, 1);
    assert.deepEqual(s.outcome.errors, {});
    const b = Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { volume: number; bbox: { min: number[]; max: number[] } }[];
    assert.equal(b.length, 1, `${z}/${mate}: one body`);
    const g = bevelOf(sp);
    assert.ok(g.ok);
    const v = (g as { value: { tipRadius: number; delta: number; big: number; k: number; addendum: number } }).value;
    const { min, max } = b[0]!.bbox;
    // the teeth do not reach beyond the tip circle of the back cone (a flat section of the tooth cones would, by 1 / cos delta and more)
    assert.ok(Math.max(max[0]!, max[1]!, -min[0]!, -min[1]!) < v.tipRadius * 1.015 + 0.05, `${z}/${mate}: reaches ${Math.max(max[0]!, max[1]!)} against the tip radius ${v.tipRadius}`);
    assert.ok(Math.max(max[0]!, max[1]!) > v.tipRadius * 0.95, `${z}/${mate}: and has teeth out to it`);
    // the body lies along the axis from the hub's back behind the pitch plane to the tips of the toe
    assert.ok(min[2]! < 1e-6 && max[2]! > 0, `${z}/${mate}: its z range ${min[2]} to ${max[2]}`);
  }
});

test("two bevel gears are two bodies, one for each gear", () => {
  // (how well a pair fits is measured in `prototypes/bevel-pair`; placing the mate at the shaft angle is not built yet: `q_bevel_gears`)
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: pinion });
  assert.ok(!s.message, s.message ?? "");
  s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: [0, 0, 40], spec: { teeth: 30, module: 2, bevel: { mate: 20 } } });
  assert.ok(!s.message, s.message ?? "");
  assert.equal(bodies(s).length, 2, "two bodies, one for each gear");
});

/** how much two bodies of a scene overlap (cubic mm) */
function overlap(s: Session): number {
  const b = bodies(s);
  assert.equal(b.length, 2);
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref) as never, params: { mode: "intersect" } } });
  if (/nothing in common/.test(done.message ?? "") || Object.values(done.outcome.errors).some((e) => /nothing in common/.test(e))) return 0;
  return bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
}

for (const [z1, z2, shaft, where] of [[20, 30, 90, 0], [24, 24, 60, 1]] as const) {
  test(`the partner that meshes with a bevel gear (${z1}/${z2} teeth, shafts ${shaft} degrees): its axis stands at the shaft angle, its cone has the same apex, and its teeth fit in the gaps (not when turned half a pitch)`, () => {
    const src: GearRecord = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], turn: 0.1, spec: { teeth: z1, module: 2, backlash: 0.1, bevel: { mate: z2, ...(shaft !== 90 ? { shaft } : {}) } } }; // (a little backlash, as a real pair has: with none the flanks touch along the line of contact and the kernel cannot tell touching from overlapping)
    const r = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: z2 }, where);
    assert.ok(r.ok, r.ok ? "" : r.error);
    const p = r.value as unknown as { at: [number, number, number]; turn: number; spec: GearSpec };
    const g1 = bevelOf(src.spec), g2 = bevelOf(p.spec);
    assert.ok(g1.ok && g2.ok);
    const [a, b] = [(g1 as { value: { big: number; delta: number } }).value, (g2 as { value: { big: number; delta: number } }).value];
    // the apexes agree: the source's along its normal, the partner's along its own (the cross product of its frame)
    const [f0, f1] = p.spec.bevel!.frame!;
    const n2 = [f0[1] * f1[2] - f0[2] * f1[1], f0[2] * f1[0] - f0[0] * f1[2], f0[0] * f1[1] - f0[1] * f1[0]];
    const apex2 = [0, 1, 2].map((k) => p.at[k]! + n2[k]! * b.big);
    assert.ok(Math.abs(apex2[0]!) < 1e-6 && Math.abs(apex2[1]!) < 1e-6 && Math.abs(apex2[2]! - a.big) < 1e-6, `apex ${apex2}`);
    assert.ok(Math.abs(n2[2]! - Math.cos((shaft * Math.PI) / 180)) < 1e-9, "the axes are the shaft angle apart");
    let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: src.at, turn: src.turn, spec: src.spec });
    assert.ok(!s.message, s.message ?? "");
    s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: p.at, turn: p.turn, spec: p.spec });
    assert.ok(!s.message, s.message ?? "");
    const fit = overlap(s);
    const wrong = overlap(run(run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: src.at, turn: src.turn, spec: src.spec }), { type: "gear", id: "g_002", plane: worldRef("XY"), at: p.at, turn: p.turn + Math.PI / z2, spec: p.spec }));
    assert.ok(fit < 0.5, `fits: ${fit}`);
    assert.ok(wrong > 20 * Math.max(fit, 0.1), `half a pitch off overlaps: ${wrong} against ${fit}`);
  });
}

test("changing the teeth of a bevel gear that was made to mesh with another puts the pair right again: the mate teeth follow, and the partner is placed again to fit (`in_763`)", () => {
  const spec: GearSpec = { teeth: 20, module: 2, backlash: 0.1, bevel: { mate: 30 } };
  const src: GearRecord = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], turn: 0.1, spec };
  const p = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 30 }, 0.5);
  assert.ok(p.ok);
  const pv = p.value as unknown as { at: [number, number, number]; turn: number; spec: GearSpec };
  assert.equal(pv.spec.bevel?.with, "g_001");
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: src.at, turn: src.turn, spec });
  s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: pv.at, turn: pv.turn, spec: pv.spec });
  assert.ok(!s.message, s.message ?? "");
  assert.equal(scene(s).gears!.find((g) => g.id === "g_001")!.spec.bevel!.with, "g_002", "the first gear learns of its partner");
  // the partner's teeth changed to 24 in its box
  const rec2 = scene(s).gears!.find((g) => g.id === "g_002")!;
  const edited = run(s, { type: "setGear", id: "g_002", spec: { ...rec2.spec, teeth: 24 }, at: rec2.at, turn: rec2.turn } as never);
  assert.ok(!edited.message, edited.message ?? "");
  const [a, b] = ["g_001", "g_002"].map((id) => scene(edited).gears!.find((g) => g.id === id)!);
  assert.equal(a!.spec.bevel!.mate, 24, "the first gear's mate teeth follow");
  assert.equal(b!.spec.teeth, 24);
  assert.equal(b!.spec.bevel!.mate, 20);
  assert.ok(Math.hypot(...[0, 1, 2].map((k) => b!.at[k]! - rec2.at[k]!)) > 0.5, "the partner moved to its new cone");
  assert.ok(overlap(edited) < 0.5, "and fits");
});

test("a bevel gear follows the speed rules of the other gears (`dec_gear_speed`, `dec_gear_feature`, `in_763`): a stand-in disc while the kernel works (one, for the prism, not for the blank or the combine) and a body of a few parts, not one for every arc of every tooth", () => {
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { ...pinion, bore: 5 } });
  assert.ok(!s.message, s.message ?? "");
  const discs = standIns(scene(s), { stale: true, ops: [] });
  assert.equal(discs.length, 1, "one stand-in");
  const g = bevelOf(pinion);
  assert.ok(g.ok);
  assert.ok(Math.abs(discs[0]!.radius - (g as { value: { tipRadius: number } }).value.tipRadius) < 1e-9, "as wide as the tips");
  assert.deepEqual(standIns(scene(s), { stale: true, ops: scene(s).steps.map((x) => ({ id: `x_${x.id}` })) }), [], "none once the kernel has made it");
  const bodyParts = Object.values(scene(s).parts).filter((p) => p.origin === "body");
  assert.ok(bodyParts.length <= 20, `the body keeps few parts: ${bodyParts.length}`);
});

// Face gears (`dec_crown_gear_set`, `in_879`): a face gear and its spur pinion at 90 degrees, bevel records with `bevel.facegear`; the face gear's tooth the envelope of the pinion's involute (`face.ts`), the body a smooth loft cut to a blank and joined to a plate; the pinion a spur gear along a radius of the face gear.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../src/operation/gear.ts";
import { meshWith } from "../src/operation/mesh.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";

await kernel.init();
const gear = (over: Partial<GearSpec> = {}): GearSpec => ({ teeth: 40, module: 2, ...over, bevel: { mate: 14, facegear: "gear" } });
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: string; volume: number; bbox: { min: number[]; max: number[] } }[];
const err = (s: GearSpec) => { const r = gearOutline(s); return r.ok ? "" : r.error; };

test("the limits of a face gear drive say why: the pinion's teeth, the ratio, the radii, the pressure angle, the shafts", () => {
  assert.equal(err(gear()), "");
  assert.equal(err({ teeth: 14, module: 2, bevel: { mate: 40, facegear: "pinion" } }), "");
  assert.match(err({ ...gear(), bevel: { mate: 10, facegear: "gear" } }), /12 or more teeth/);
  assert.match(err({ ...gear(), bevel: { mate: 25, facegear: "gear" } }), /2 to 3.1 times/);
  assert.match(err({ ...gear(), teeth: 70 }), /more than 64 teeth/);
  assert.match(err({ ...gear(), crown: { inner: 30 } }), /inner radius is at least/);
  assert.match(err({ ...gear(), crown: { outer: 60 } }), /outer radius is at most/);
  assert.match(err({ ...gear(), pressure: 25 }), /20 degrees only/);
  assert.match(err({ ...gear(), bevel: { mate: 14, facegear: "gear", shaft: 80 } }), /at 90 degrees/);
});

test("the gear command makes a face gear: one body (the loft cut to the blank, joined to the plate), the teeth on the +n side", () => {
  const t0 = Date.now();
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: gear({ bore: 5 }) });
  console.log("FACE time", ((Date.now() - t0) / 1000).toFixed(1), "s");
  assert.ok(!s.message, s.message ?? "");
  assert.deepEqual(scene(s).steps.map((x) => x.type), ["loft", "revolve", "combine", "extrude", "combine"]);
  assert.deepEqual(s.outcome.errors, {});
  const b = bodies(s);
  assert.equal(b.length, 1);
  const { min, max } = b[0]!.bbox;
  assert.ok(Math.abs(max[2]! - 2) < 0.05, `the tips stand a module above the pitch plane: ${max[2]}`);
  assert.ok(Math.abs(min[2]! + 6.5) < 0.05, `the plate's foot a root and a thickness under it: ${min[2]}`);
});

test("the spur pinion of a face gear drive: one body, its axis along a radius, the width of the face and a millimetre either end", () => {
  const sp: GearSpec = { teeth: 14, module: 2, bore: 5, bevel: { mate: 40, facegear: "pinion", frame: [[0, 1, 0], [0, 0, 1]] }, crown: {} };
  const s = run(createSession(kernel), { type: "gear", id: "g_002", plane: worldRef("XY"), at: [39, 0, 14], spec: sp });
  assert.ok(!s.message, s.message ?? "");
  assert.deepEqual(scene(s).steps.map((x) => x.type), ["extrude"]);
  const b = bodies(s);
  assert.equal(b.length, 1);
  const { min, max } = b[0]!.bbox;
  assert.ok(Math.abs(min[0]! - 39) < 0.05 && Math.abs(max[0]! - (39 + 8)) < 0.05, `along x from 39 over 8 mm (the face is 6): ${min[0]} .. ${max[0]}`);
});

const overlapOf = (turn: number, z1 = 14, z2 = 40): number => {
  const spec: GearSpec = { teeth: z2, module: 2, bevel: { mate: z1, facegear: "gear" } };
  const src = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec };
  const p = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: z1 }, 0.3);
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
test("a face gear and its spur pinion made by Mesh gear fit at their place and not half a pitch round (14 / 40, module 2)", () => {
  const [fit, wrong] = [overlapOf(0), overlapOf(Math.PI / 14)];
  console.log("FACE overlap", fit, wrong);
  assert.ok(fit < 10, `at its place: ${fit}`);
  assert.ok(wrong > 10 * Math.max(fit, 1), `half a pitch round: ${wrong}`);
});

test("Mesh gear on the pinion makes the face gear: where the pinion's own pair had it, and the pair fits (14 / 40, a turned pinion)", () => {
  const face: GearSpec = { teeth: 40, module: 2, bevel: { mate: 14, facegear: "gear" } };
  const rec = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec: face };
  const p = meshWith(rec, [1, 0, 0], [0, 1, 0], { teeth: 14 }, 0.3);
  assert.ok(p.ok);
  const pin = p.ok ? p.value : null!;
  const rec2 = { id: "g_002", plane: worldRef("XY"), at: pin.at, turn: pin.turn + 0.2, spec: pin.spec };
  // the direction from the pinion's axis towards the face gear: down in its frame (its frame is the tangent and the face gear's axis)
  const back = meshWith(rec2, [1, 0, 0], [0, 1, 0], { teeth: 40 }, -Math.PI / 2);
  assert.ok(back.ok, back.ok ? "" : back.error);
  const bv = back.ok ? back.value : null!;
  assert.ok(Math.hypot(bv.at[0], bv.at[1], bv.at[2]) < 1e-6, `the face gear's centre where it was: ${bv.at}`);
  assert.equal(bv.spec.bevel?.facegear, "gear");
  const over = (extra: number): number => {
    let s = run(createSession(kernel), { type: "gear", id: "g_002", plane: worldRef("XY"), at: rec2.at, turn: rec2.turn, spec: rec2.spec });
    s = run(s, { type: "gear", id: "g_003", plane: worldRef("XY"), at: bv.at, turn: bv.turn + extra, spec: bv.spec });
    assert.ok(!s.message, s.message ?? "");
    const b = bodies(s);
    const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref), params: { mode: "intersect" } } } as never);
    return /nothing in common/.test(done.message ?? "") ? 0 : bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
  };
  const [fit, wrong] = [over(0), over(Math.PI / 40)];
  console.log("FACE from pinion", fit, wrong);
  assert.ok(fit < 10, `at its place: ${fit}`);
  assert.ok(wrong > 5 * Math.max(fit, 1), `half a pitch round: ${wrong}`);
});

test("a face gear drive is linked: the pinion's teeth changed in its box, the face gear's pinion teeth follow and the pinion is placed again so that the pair still fits", () => {
  const spec: GearSpec = { teeth: 40, module: 2, bevel: { mate: 14, facegear: "gear" } };
  const src = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec };
  const p = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 14 }, 0.3);
  assert.ok(p.ok);
  const pv = p.ok ? p.value : null!;
  assert.equal(pv.spec.bevel?.with, "g_001");
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: src.at, spec });
  s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: pv.at, turn: pv.turn, spec: pv.spec });
  assert.ok(!s.message, s.message ?? "");
  const rec2 = scene(s).gears!.find((g) => g.id === "g_002")!;
  const edited = run(s, { type: "setGear", id: "g_002", spec: { ...rec2.spec, teeth: 16 }, at: rec2.at, turn: rec2.turn } as never);
  assert.ok(!edited.message, edited.message ?? "");
  const [a, b] = ["g_001", "g_002"].map((id) => scene(edited).gears!.find((g) => g.id === id)!);
  assert.equal(a!.spec.bevel!.mate, 16, "the face gear's pinion teeth follow");
  assert.equal(b!.spec.teeth, 16);
  assert.deepEqual(edited.outcome.errors, {});
  const bs = bodies(edited);
  assert.equal(bs.length, 2);
  const done = run(edited, { type: "addStep", step: { id: "s_900", type: "combine", parts: bs.map((x) => x.ref), params: { mode: "intersect" } } } as never);
  const ov = /nothing in common/.test(done.message ?? "") ? 0 : bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
  console.log("FACE linked", ov);
  assert.ok(ov < 10, `the pair still fits: ${ov}`);
});

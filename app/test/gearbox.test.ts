// The gear box (`in_685`): every number of the gear tool is named and explained, and it is a panel, not a bubble that follows the pointer.
import test from "node:test";
import assert from "node:assert/strict";
import { entryOf, inUnits } from "../src/interaction/entry.ts";
import { armTool, gearFields } from "../src/interaction/tools.ts";
import type { GearVariant } from "../src/interaction/tools.ts";
import { GEAR_HINTS, gearTitle } from "../src/interaction/gearhelp.ts";
import { units } from "../src/shared/units.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { isCrown } from "../src/operation/bevel.ts";

await kernel.init();

const VARIANTS: GearVariant[] = ["gear", "bevel", "crown", "spiral", "face", "facepinion", "ring", "rack", "gt2", "gt3", "htd5", "htd8", "sprocket", "isosprocket", "clock", "clockring", "clockrack"];

test("every number of every kind of gear has a hint, and each kind has a title", () => {
  for (const v of VARIANTS) {
    const t = armTool("gear", v);
    const fields = gearFields(t.gear!);
    assert.ok(fields.length >= 2, v);
    for (const f of fields) assert.ok(GEAR_HINTS[f.key] && GEAR_HINTS[f.key].length > 10, `${v}: ${f.key} says what it is`);
    assert.ok(gearTitle(t.gear!).length > 2, v);
  }
  for (const f of gearFields({ internal: false })) assert.ok(GEAR_HINTS[f.key].length > 10, `helical: ${f.key}`);
  assert.equal(gearTitle(armTool("gear", "gt2").gear!), "GT2 pulley");
});

test("the gear tool's entry is a panel with each number's label and hint, and the number system does not change its numbers", () => {
  const s = createSession(kernel);
  const sc = scene(s);
  const XY = worldRef("XY");
  const t = { ...armTool("gear"), plane: XY, points: [[0, 0, 0] as [number, number, number]], cursor: [10, 0, 0] as [number, number, number] };
  const e = entryOf(sc, t, null);
  assert.ok(e && e.panel === "Gear", "a panel");
  assert.ok(e!.fields.every((f) => !!f.hint && !!f.label));
  units.system = "in";
  try { assert.equal(inUnits(e), e, "left as it is in inches: gears follow their standards"); } finally { units.system = "mm"; }
});

import { meshGearTool, gearProblem, gearLive } from "../src/interaction/tools.ts";
import type { GearRecord } from "../src/operation/gearscene.ts";
test("a partner made with nothing typed is one that meshes: a gear in a ring has half the ring's teeth, a ring round a gear twice the gear's (`in_686`)", () => {
  const sc = scene(createSession(kernel));
  const rec = (spec: GearRecord["spec"]): GearRecord => ({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  const at = (t: ReturnType<typeof meshGearTool>) => ({ ...t, cursor: [12, 7, 0] as [number, number, number] });
  const ring = rec({ teeth: 40, module: 1, internal: true });
  assert.equal(gearProblem(sc, at(meshGearTool(ring, false))), null, "a gear in a ring: no problem with the defaults");
  assert.equal(gearLive(sc, at(meshGearTool(ring, false)))![0], 20, "half the ring's teeth");
  const gear = rec({ teeth: 20, module: 1 });
  assert.equal(gearProblem(sc, at(meshGearTool(gear, false, true))), null, "a ring round a gear: no problem with the defaults");
  assert.equal(gearLive(sc, at(meshGearTool(gear, false, true)))![0], 40, "twice the gear's teeth");
  assert.equal(gearProblem(sc, at(meshGearTool(gear, false))), null, "a gear beside a gear: the same number of teeth, as before");
  assert.equal(gearLive(sc, at(meshGearTool(gear, false)))![0], 20);
});

import { finish as finishTool, finish } from "../src/interaction/tools.ts";
test("the bevel gear tool: its numbers, its title that says it is an approximation, and the gear it makes with nothing typed (a pair-ready 20 tooth gear, module 2, a bore)", () => {
  const sc = scene(createSession(kernel));
  const t = { ...armTool("gear", "bevel"), plane: worldRef("XY"), points: [[0, 0, 0] as [number, number, number]], cursor: [10, 0, 0] as [number, number, number] };
  assert.deepEqual(gearFields(t.gear!).map((f) => f.key), ["teeth", "mate", "module", "pressure", "shaft", "face", "backlash", "bore", "flat", "key", "keydepth"]);
  assert.match(gearTitle(t.gear!), /approximation/);
  const cmd = finishTool(sc, t)?.command;
  assert.ok(cmd && cmd.type === "gear", "makes a gear");
  const spec = (cmd as { spec: { teeth: number; module: number; bevel?: { mate: number }; bore?: number } }).spec;
  assert.equal(spec.teeth, 20);
  assert.equal(spec.module, 2);
  assert.equal(spec.bevel?.mate, 20, "its mate has as many teeth unless typed");
  assert.ok((spec.bore ?? 0) > 0, "a bore, as any new gear has");
});

test("the crown gear tool (`dec_crown_gears`, `in_802`): its numbers, its title, the gear it makes with nothing typed (a bevel gear whose shaft angle makes its pitch angle a right angle), and Mesh gear on it makes the pinion", () => {
  const sc = scene(createSession(kernel));
  const t = { ...armTool("gear", "crown"), plane: worldRef("XY"), points: [[0, 0, 0] as [number, number, number]], cursor: [10, 0, 0] as [number, number, number] };
  assert.deepEqual(gearFields(t.gear!).map((f) => f.key), ["teeth", "mate", "module", "pressure", "inner", "outer", "width", "backlash", "bore", "flat", "key", "keydepth"]);
  assert.equal(gearTitle(t.gear!), "Crown gear");
  const cmd = finishTool(sc, t)?.command as { type: string; spec: GearRecord["spec"] } | undefined;
  assert.ok(cmd && cmd.type === "gear", "makes a gear");
  assert.equal(cmd.spec.teeth, 40);
  assert.equal(cmd.spec.bevel?.mate, 18, "a pinion of 18 teeth unless typed");
  assert.ok(Math.abs((cmd.spec.bevel?.shaft ?? 0) - (90 + (Math.asin(18 / 40) * 180) / Math.PI)) < 1e-9, "the shafts at 90 degrees plus the pinion's pitch angle");
  assert.ok(isCrown(cmd.spec));
  const rec = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec: cmd.spec };
  const mesh = finish(sc, { ...meshGearTool(rec, false), cursor: [30, 0, 0] })?.command as { type: string; spec: GearRecord["spec"] } | undefined;
  assert.ok(mesh && mesh.type === "gear", "the pinion");
  assert.equal(mesh.spec.teeth, 18, "the pinion's teeth are the crown's mate");
  assert.equal(mesh.spec.bevel?.mate, 40);
});

test("the spiral bevel gear tool (`dec_spiral_bevel_gears`, `in_836`): its numbers, its title, the gear it makes with nothing typed, and Mesh gear on it makes the other of the pair", () => {
  const sc = scene(createSession(kernel));
  const t = { ...armTool("gear", "spiral"), plane: worldRef("XY"), points: [[0, 0, 0] as [number, number, number]], cursor: [10, 0, 0] as [number, number, number] };
  assert.deepEqual(gearFields(t.gear!).map((f) => f.key), ["teeth", "mate", "module", "spiral", "backlash", "bore", "flat", "key", "keydepth"]);
  assert.equal(gearTitle(t.gear!), "Spiral bevel gear");
  const cmd = finishTool(sc, t)?.command as { type: string; spec: GearRecord["spec"] } | undefined;
  assert.ok(cmd && cmd.type === "gear", "makes a gear");
  assert.equal(cmd.spec.teeth, 24);
  assert.equal(cmd.spec.bevel?.mate, 24, "its mate has as many teeth unless typed");
  assert.equal(cmd.spec.bevel?.spiral, 30, "a 30 degree spiral");
  const rec = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec: cmd.spec };
  const mesh = finish(sc, { ...meshGearTool(rec, false), cursor: [30, 0, 0] })?.command as { type: string; spec: GearRecord["spec"] } | undefined;
  assert.ok(mesh && mesh.type === "gear", "the partner");
  assert.equal(mesh.spec.bevel?.spiral, 30, "with the same spiral");
  assert.equal(mesh.spec.bevel?.mate, 24);
});

test("the face gear tool (`dec_crown_gear_set`, `in_886`): its numbers, its title, the gear it makes with nothing typed, and Mesh gear on it makes the spur pinion at 90 degrees", () => {
  const sc = scene(createSession(kernel));
  const t = { ...armTool("gear", "face"), plane: worldRef("XY"), points: [[0, 0, 0] as [number, number, number]], cursor: [10, 0, 0] as [number, number, number] };
  assert.deepEqual(gearFields(t.gear!).map((f) => f.key), ["teeth", "mate", "module", "inner", "outer", "width", "backlash", "bore", "flat", "key", "keydepth"]);
  assert.equal(gearTitle(t.gear!), "Face gear");
  const cmd = finishTool(sc, t)?.command as { type: string; spec: GearRecord["spec"] } | undefined;
  assert.ok(cmd && cmd.type === "gear", "makes a gear");
  assert.equal(cmd.spec.teeth, 40);
  assert.equal(cmd.spec.bevel?.mate, 14, "a pinion of 14 teeth unless typed");
  assert.equal(cmd.spec.bevel?.facegear, "gear");
  const rec = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec: cmd.spec };
  const mesh = finish(sc, { ...meshGearTool(rec, false), cursor: [30, 0, 0] })?.command as { type: string; spec: GearRecord["spec"] } | undefined;
  assert.ok(mesh && mesh.type === "gear", "the pinion");
  assert.equal(mesh.spec.teeth, 14, "the pinion's teeth are the face gear's mate");
  assert.equal(mesh.spec.bevel?.facegear, "pinion");
  assert.equal(mesh.spec.bevel?.mate, 40);
  assert.ok(mesh.spec.bevel?.frame, "it stands across: its own frame");
});

test("Mesh gear on a bevel gear makes its partner: the same module, the source's tooth count, standing across at the shaft angle with its own frame (`in_755`)", () => {
  const sc = scene(createSession(kernel));
  const rec = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec: { teeth: 20, module: 2, bevel: { mate: 30 } } as GearRecord["spec"] };
  const t = meshGearTool(rec, false);
  const cmd = finish(sc, { ...t, cursor: [30, 0, 0] })?.command as { type: string; spec: { teeth: number; module: number; bevel?: { mate: number; frame?: unknown } }; at: number[] } | undefined;
  assert.ok(cmd && cmd.type === "gear", "makes a gear");
  assert.equal(cmd.spec.teeth, 30, "the teeth the source was made to mesh with (its mate teeth) unless typed (`in_919`)");
  assert.equal(cmd.spec.bevel?.mate, 20);
  assert.ok(cmd.spec.bevel?.frame, "it stands across: its own frame");
  assert.ok(Math.abs(cmd.at[0]! - 25.98) < 0.1 || cmd.at[0]! > 5, "its centre is out along the direction asked");
  assert.equal(gearProblem(sc, { ...meshGearTool(rec, true), cursor: [30, 0, 0] }), "a bevel gear meshes with a bevel gear: not with a rack or a ring");
});

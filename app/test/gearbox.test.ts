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

await kernel.init();

const VARIANTS: GearVariant[] = ["gear", "ring", "rack", "gt2", "gt3", "htd5", "htd8", "sprocket", "isosprocket", "clock", "clockring", "clockrack"];

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

// The gear box (`in_592`): every number of the gear tool is named and explained, and it is a panel, not a bubble that follows the pointer.
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

const VARIANTS: GearVariant[] = ["gear", "helical", "ring", "rack", "gt2", "gt3", "htd5", "htd8", "sprocket", "isosprocket", "clock", "clockring", "clockrack"];

test("every number of every kind of gear has a hint, and each kind has a title", () => {
  for (const v of VARIANTS) {
    const t = armTool("gear", v);
    const fields = gearFields(t.gear!);
    assert.ok(fields.length >= 2, v);
    for (const f of fields) assert.ok(GEAR_HINTS[f.key] && GEAR_HINTS[f.key].length > 10, `${v}: ${f.key} says what it is`);
    assert.ok(gearTitle(t.gear!).length > 2, v);
  }
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

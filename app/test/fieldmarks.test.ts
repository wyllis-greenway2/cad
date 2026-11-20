// The lines of the number being edited are lit in the preview of a gear and of the wheel (`in_1380`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene } from "../src/interaction/session.ts";
import { armTool, armModel, gearFields, previewOf } from "../src/interaction/tools.ts";
import { modelFields } from "../src/operation/modelkinds.ts";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const XY = worldRef("XY");
const radii = (m: [Vec3, Vec3][]) => [...new Set(m.map(([a]) => Math.round(Math.hypot(a[0], a[1]) * 100) / 100))];

test("a gear: the bore's circle is lit while the bore is edited, the pitch circle for the teeth, nothing for a number with no line", () => {
  const sc = scene(createSession(kernel));
  const base = { ...armTool("gear"), plane: XY, points: [[0, 0, 0] as Vec3], cursor: [10, 0, 0] as Vec3 };
  const keys = gearFields(base.gear!).map((f) => f.key);
  const at = (key: string) => ({ ...base, gear: { ...base.gear!, field: keys.indexOf(key as never), typed: base.gear!.typed.length ? base.gear!.typed : keys.map(() => "") } });
  const withTyped = (key: string, v: string) => { const t = at(key); const typed = keys.map((k) => (k === key ? v : (t.gear.typed[keys.indexOf(k as never)] ?? ""))); return { ...t, gear: { ...t.gear, typed } }; };
  const bore = previewOf(sc, withTyped("bore", "6"))!.marks ?? [];
  assert.deepEqual(radii(bore), [3], "the bore, 6 mm across");
  const teeth = previewOf(sc, withTyped("teeth", "20"))!.marks ?? [];
  assert.equal(teeth.length > 0 && radii(teeth).length, 1, "one circle: the pitch circle");
  assert.ok(radii(teeth)[0]! > 3);
  assert.equal(previewOf(sc, withTyped("chamfer", "0.5"))!.marks, undefined, "no line of its own");
});

test("the wheel: the bore, the rim and the spokes each light their own lines", () => {
  const sc = scene(createSession(kernel));
  const m = armModel("wheel").model!;
  const keys = ["outer", ...modelFields("wheel").map((f) => f.key)];
  const at = (key: string) => ({ ...armModel("wheel"), plane: XY, points: [[0, 0, 0] as Vec3], cursor: [40, 0, 0] as Vec3, model: { ...m, field: keys.indexOf(key) } });
  const r = (key: string) => previewOf(sc, at(key))!.marks ?? [];
  assert.deepEqual(radii(r("bore")), [4], "the bore (8 mm across)");
  assert.deepEqual(radii(r("outer")), [40], "the rim's outside");
  const spokes = r("spokeW");
  assert.ok(spokes.length > 20 && radii(spokes).every((x) => x > 11 && x < 35), "the outlines of the cutouts, between the hub and the rim");
  assert.equal(r("draft").length, 0, "a number with no line of its own lights none");
});

// The tooth chamfer of the bevel family (`dec_bevel_chamfer`, `in_967`): the facet geometry on the blank's corners, and a straight bevel, a spiral, a ring and a hypoid gear made with it in the kernel (one body, a little less volume than without).
import test from "node:test";
import assert from "node:assert/strict";
import { facetOf } from "../src/operation/blankchamfer.ts";
import { spiralPairOf, spiralBody } from "../src/operation/spiral.ts";
import { bevelLayout } from "../src/operation/bevel.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { GearSpec } from "../src/operation/gear.ts";

await kernel.init();
const area = (p: [number, number][]) => Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]!; return a + (q[0] * r[1] - r[0] * q[1]); }, 0)) / 2;

test("a facet cuts the same distance down the back cone and along the tip cone, for a cone under and over 45 degrees", () => {
  for (const g of [0.5, 0.9, 1.2]) { // (the gear's pitch angle, radians)
    const tip = { a: Math.tan(g), b: 3 / Math.cos(g) };
    const heelLow: [number, number] = [60, 4], heelHigh: [number, number] = [60 - Math.tan(g) * 80, 84]; // (the back cone: x = x0 - tan(g) r)
    const f = facetOf(heelLow, heelHigh, tip, 2, -1, 3);
    assert.ok(f, `pitch angle ${g}`);
    const near = Math.hypot(f!.corner[0] - f!.start[0], f!.corner[1] - f!.start[1]);
    assert.ok(Math.abs(near - 2) < 1e-9, `start ${near} from the corner`);
    assert.ok(f!.top[1] - tip.a * f!.top[0] - tip.b > 2.99, "the facet goes on above the tip cone");
  }
});
test("the spiral pair and the straight bevel gear carry the chamfer in their blanks", () => {
  const [a, b] = [spiralPairOf(20, 30, 3, 30, 0.05, 0, 0, 0), spiralPairOf(20, 30, 3, 30, 0.05, 0, 0, 1.5)];
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  for (const which of ["pinion", "ring"] as const) {
    const x = spiralBody(a.value, which), y = spiralBody(b.value, which);
    assert.ok(x.ok && y.ok);
    if (x.ok && y.ok) { assert.equal(y.value.blank.length, x.value.blank.length + 2, which); assert.ok(area(y.value.blank) < area(x.value.blank), `${which}: smaller`); }
  }
  const [l0, l1] = [bevelLayout({ teeth: 20, module: 3, bevel: { mate: 30 } }), bevelLayout({ teeth: 20, module: 3, chamfer: 0.5, bevel: { mate: 30 } })];
  assert.ok(l0.ok && l1.ok);
  if (l0.ok && l1.ok) assert.equal(l1.value.blank.length, l0.value.blank.length + 2);
  const bad = spiralPairOf(20, 30, 3, 30, 0.05, 0, 0, 4);
  assert.ok(!bad.ok && /chamfer is from 0 to 1 module/.test(bad.error));
});
const volumeOf = (spec: GearSpec): { n: number; v: number; message?: string } => {
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  const b = Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { volume: number }[];
  return { n: b.length, v: b[0]?.volume ?? 0, ...(s.message ? { message: s.message } : {}) };
};
for (const [name, spec] of [["straight bevel", { teeth: 20, module: 3, bevel: { mate: 30 } }], ["spiral pinion", { teeth: 20, module: 3, bevel: { mate: 30, spiral: 30 } }], ["spiral ring gear", { teeth: 30, module: 3, bevel: { mate: 20, spiral: 30 } }]] as [string, GearSpec][]) {
  test(`a ${name} with a chamfer of half a module is one body with less volume than without`, () => {
    const [plain, cut] = [volumeOf(spec), volumeOf({ ...spec, chamfer: 0.5 })];
    assert.ok(!plain.message && !cut.message, `${plain.message ?? ""} ${cut.message ?? ""}`);
    assert.equal(cut.n, 1);
    assert.ok(cut.v < plain.v && cut.v > 0.98 * plain.v, `${plain.v} -> ${cut.v}`);
  });
}

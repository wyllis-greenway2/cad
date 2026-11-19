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
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: string; volume: number }[];
const crownShaft = (z: number, p: number) => 90 + (Math.asin(p / z) * 180) / Math.PI;
const volumeOf = (spec: GearSpec): { n: number; v: number; message?: string } => {
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  const b = Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { volume: number }[];
  return { n: b.length, v: b[0]?.volume ?? 0, ...(s.message ? { message: s.message } : {}) };
};
for (const [name, spec] of [["straight bevel", { teeth: 20, module: 3, bevel: { mate: 30 } }], ["spiral pinion", { teeth: 20, module: 3, bevel: { mate: 30, spiral: 30 } }], ["spiral ring gear", { teeth: 30, module: 3, bevel: { mate: 20, spiral: 30 } }], ["crown gear", { teeth: 40, module: 2, bevel: { mate: 18, shaft: crownShaft(40, 18) }, bore: 5 }], ["face gear", { teeth: 40, module: 2, bevel: { mate: 14, facegear: "gear" }, bore: 5 }]] as [string, GearSpec][]) {
  test(`a ${name} with a chamfer of half a module is one body with less volume than without`, () => {
    const [plain, cut] = [volumeOf(spec), volumeOf({ ...spec, chamfer: 0.5 })];
    assert.ok(!plain.message && !cut.message, `${plain.message ?? ""} ${cut.message ?? ""}`);
    assert.equal(cut.n, 1);
    assert.ok(Math.abs(cut.v - plain.v) > 1, "a chamfer takes something off");
    assert.ok(cut.v < plain.v && cut.v > 0.95 * plain.v, `${plain.v} -> ${cut.v}`);
  });
}

import { meshWith } from "../src/operation/mesh.ts";
test("Mesh gear gives the partner the chamfer, and a chamfer changed on one gear of a bevel, spiral or crown pair is the other's too", () => {
  const spec = { teeth: 20, module: 3, chamfer: 0.4, bevel: { mate: 30 } } as GearSpec;
  const src = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec };
  const p = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 30 }, 0.3);
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.equal(p.value.spec.chamfer, 0.4, "the partner made by Mesh gear has the chamfer");
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: src.at, spec });
  s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: p.value.at, turn: p.value.turn, spec: p.value.spec });
  assert.ok(!s.message, s.message ?? "");
  const rec = scene(s).gears!.find((g) => g.id === "g_002")!;
  const more = run(s, { type: "setGear", id: "g_002", spec: { ...rec.spec, chamfer: 0.7 }, at: rec.at, turn: rec.turn } as never);
  assert.equal(scene(more).gears!.find((g) => g.id === "g_001")!.spec.chamfer, 0.7, "the other gear follows");
  const { chamfer: _c, ...bare } = rec.spec;
  const none = run(more, { type: "setGear", id: "g_002", spec: bare, at: rec.at, turn: rec.turn } as never);
  assert.equal(scene(none).gears!.find((g) => g.id === "g_001")!.spec.chamfer, undefined, "and loses it when it is taken off");
});

test("a face gear drive's spur pinion takes a tooth chamfer, alone and in its pair (the frame its pair gave it): less volume, still one body each and the pair still fits", () => {
  const pin: GearSpec = { teeth: 14, module: 2, bevel: { mate: 40, facegear: "pinion" }, bore: 5 };
  const [a, b] = [volumeOf(pin), volumeOf({ ...pin, chamfer: 0.4 })];
  assert.ok(!a.message && !b.message, `${a.message ?? ""} ${b.message ?? ""}`);
  assert.ok(b.v < a.v && b.v > 0.95 * a.v, `${a.v} -> ${b.v}`);
  const gear: GearSpec = { teeth: 40, module: 2, bevel: { mate: 14, facegear: "gear" }, bore: 5 };
  const src = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec: gear };
  const p = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 14 }, 0.3);
  assert.ok(p.ok);
  if (!p.ok) return;
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: src.at, spec: gear });
  s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: p.value.at, turn: p.value.turn, spec: { ...p.value.spec, chamfer: 0.4 } });
  assert.ok(!s.message, s.message ?? "");
  assert.deepEqual(s.outcome.errors, {});
  const bs = bodies(s);
  assert.equal(bs.length, 2);
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: bs.map((x) => x.ref), params: { mode: "intersect" } } } as never);
  const over = /nothing in common/.test(done.message ?? "") ? 0 : bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
  assert.ok(over < 10, `the pair fits: ${over}`);
  const plain = bodies(run(createSession(kernel), { type: "gear", id: "g_002", plane: worldRef("XY"), at: p.value.at, turn: p.value.turn, spec: p.value.spec }));
  assert.ok(Math.abs(plain[0]!.volume - bs[1]!.volume) > 1 || Math.abs(plain[0]!.volume - bs[0]!.volume) > 1, "the pinion in the pair lost its tooth tips");
});

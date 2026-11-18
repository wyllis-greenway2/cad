// The tooth chamfer on a worm wheel (`in_826`): the tips of its teeth broken at both faces, as a gear's are. The same field, the same kernel wedge, one boolean for all the teeth.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { armTool, gearFields } from "../src/interaction/tools.ts";

await kernel.init();
const wheel = (over: object = {}, land = 0): GearSpec => ({ teeth: 30, module: 2, wheel: { starts: 1, diameter: 20, width: 9.6, land }, bore: 5, ...over }) as GearSpec;
const make = (spec: GearSpec) => run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
const body = (s: ReturnType<typeof make>) => Object.values(scene(s).parts).find((p) => p.kind === "body") as unknown as { volume: number; bbox: { min: number[]; max: number[] } };

test("the worm wheel has the Chamfer field, then Edge chamfer", () => {
  const t = armTool("gear", "wormwheel");
  assert.deepEqual(gearFields(t.gear!).slice(-2).map((f) => f.label), ["Chamfer", "Edge chamfer"]);
});

for (const land of [0, 2]) {
  test(`a worm wheel (land ${land}) with a chamfer is one valid body that has lost a little at the tips of its teeth, at both faces`, () => {
    const [a, b] = [make(wheel({}, land)), make(wheel({ chamfer: 0.25 }, land))];
    assert.ok(!b.message, b.message ?? "");
    assert.deepEqual(b.outcome.errors, {});
    assert.equal(Object.values(scene(b).parts).filter((p) => p.kind === "body").length, 1);
    const [va, vb] = [body(a).volume, body(b).volume];
    assert.ok(vb < va && va - vb > 0.5 && va - vb < 0.02 * va, `${va} -> ${vb}: a few cubic mm of 30 tips at 2 faces`);
    const [ba, bb] = [body(a).bbox, body(b).bbox];
    assert.ok(Math.abs(ba.max[2]! - bb.max[2]!) < 0.01 && Math.abs(ba.min[2]! - bb.min[2]!) < 0.01, "as thick as before");
    const planes = Object.values(scene(b).parts).filter((p) => p.origin === "body" && p.kind === "plane").length;
    assert.ok(planes < 30, `still one feature: ${planes} planes`);
  });
}

test("a chamfer deeper than the wheel allows is said, and one of none changes nothing", () => {
  const bad = make(wheel({ chamfer: 1 }, 0));
  assert.ok(!bad.message ? Object.values(bad.outcome.errors).length === 0 : true);
  const none = make(wheel({ chamfer: 0 }));
  assert.ok(!none.message);
  assert.match(make(wheel({ chamfer: 2 })).message ?? "", /chamfer is from 0 to 1/);
});

import type { PlanetarySpec } from "../src/operation/planetary.ts";
test("a planetary set takes the tooth chamfer and the edge chamfer for all its gears (`in_826`)", () => {
  const spec: PlanetarySpec = { sun: 18, planet: 12, planets: 3, module: 1, width: 6, chamfer: 0.25, edge: 0.4 };
  const s = run(createSession(kernel), { type: "planetary", id: "q_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  assert.ok(!s.message, s.message ?? "");
  assert.deepEqual(s.outcome.errors, {});
  const plain = run(createSession(kernel), { type: "planetary", id: "q_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { ...spec, chamfer: undefined, edge: undefined } });
  const vol = (x: typeof s) => Object.values(scene(x).parts).filter((p) => p.kind === "body").reduce((a, p) => a + ((p as unknown as { volume: number }).volume ?? 0), 0);
  assert.ok(vol(plain) - vol(s) > 1, `the tips and edges are broken: ${vol(plain)} -> ${vol(s)}`);
  assert.equal(scene(s).gears!.filter((g) => g.spec.chamfer === 0.25 && g.spec.edge === 0.4).length, 5, "sun, three planets and ring");
});

test("a rack has Chamfer (the tips of its teeth at both faces) and Edge chamfer (the whole edge of both faces), by the kernel's chamfer, straight, turned and helical; one at a time (`in_827`)", () => {
  const t = armTool("gear", "rack");
  assert.deepEqual(gearFields(t.gear!).slice(-2).map((f) => f.label), ["Chamfer", "Edge chamfer"]);
  const rack = { teeth: 10, module: 2, width: 8, rack: true } as GearSpec;
  const vol = (spec: GearSpec, turn = 0) => { const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [3, 4, 0], spec, ...(turn ? { turn } : {}) }); assert.ok(!s.message, s.message ?? ""); assert.deepEqual(s.outcome.errors, {}); return body(s).volume; };
  const v0 = vol(rack);
  for (const [name, spec, turn] of [["tips", { ...rack, chamfer: 0.25 }, 0], ["tips, turned", { ...rack, chamfer: 0.25 }, 0.7], ["edge", { ...rack, edge: 0.6 }, 0], ["helical tips", { ...rack, helix: 15, chamfer: 0.25 }, 0], ["helical edge", { ...rack, helix: 15, edge: 0.6 }, 0]] as [string, GearSpec, number][]) {
    const v = vol(spec, turn), plain = vol({ ...spec, chamfer: undefined, edge: undefined }, turn);
    assert.ok(v < plain - 1 && v > 0.9 * plain, `${name}: ${plain} -> ${v}`);
  }
  assert.ok(v0 > 0);
  assert.match(run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { ...rack, chamfer: 0.25, edge: 0.6 } }).message ?? "", /not made together/);
});

test("an edge chamfer on a worm wheel is made in its land (`in_828`): the sections pulled in, a ruled loft and the rest straight, sewn to the throated part and cut by the worm's envelope; refused with why with no land, a land shorter than the chamfer, a chamfer that would take the teeth, and a bore with a flat", () => {
  assert.equal(gearFields(armTool("gear", "wormwheel").gear!).at(-1)!.label, "Edge chamfer");
  for (const land of [4, 2]) {
    const [a, b] = [make(wheel({}, land)), make(wheel({ edge: 0.5 }, land))];
    assert.ok(!b.message, b.message ?? "");
    assert.deepEqual(b.outcome.errors, {});
    assert.equal(Object.values(scene(b).parts).filter((p) => p.kind === "body").length, 1, "one body");
    const [va, vb] = [body(a).volume, body(b).volume];
    assert.ok(vb < va - 20 && vb > 0.98 * va, `land ${land}: ${va} -> ${vb}`);
    const [ba, bb] = [body(a).bbox, body(b).bbox];
    assert.ok(Math.abs(ba.max[2]! - bb.max[2]!) < 0.01 && Math.abs(ba.min[2]! - bb.min[2]!) < 0.01, "as thick as before");
    assert.ok(Object.values(scene(b).parts).filter((p) => p.origin === "body" && p.kind === "plane").length < 30, "still one feature");
  }
  assert.match(make(wheel({ edge: 0.5 }, 0)).message ?? "", /made in its land/);
  assert.match(make(wheel({ edge: 2 }, 1)).message ?? "", /made in its land/);
  assert.match(make(wheel({ edge: 1 }, 4)).message ?? "", /too big for these teeth/);
  assert.match(make(wheel({ edge: 0.5, chamfer: 0.25 }, 4)).message ?? "", /not made together/);
});

import { insetOutline } from "../src/operation/wheelinset.ts";
import { wheelSections } from "../src/operation/wheelsections.ts";
test("the wheel's end section pulled in: the same number of sides, its area a chamfer times its perimeter less, and every corner the chamfer from the full outline (`in_828`)", () => {
  const w = wheelSections(wheel({}, 4));
  assert.ok(w.ok);
  if (!w.ok) return;
  const sec = w.value[0]!;
  const o = insetOutline(sec, 0.4);
  assert.ok(o.ok, o.ok ? "" : o.error);
  if (!o.ok) return;
  assert.equal(o.value.points.length, sec.points.length);
  const area = (p: number[][]) => p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]!; return s + (q[0]! * r[1]! - r[0]! * q[1]!) / 2; }, 0);
  const perimeter = sec.points.reduce((s, q, i) => { const r = sec.points[(i + 1) % sec.points.length]!; return s + Math.hypot(r[0] - q[0], r[1] - q[1]); }, 0);
  const [a0, a1] = [area(sec.points), area(o.value.points)];
  assert.ok(Math.abs(a0 - a1 - 0.4 * perimeter) < 0.01 * a0 * 0.1 + 2, `${a0} - ${a1} against ${0.4 * perimeter}`);
  for (const q of o.value.points) { let d = Infinity; for (const p of sec.points) d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1])); assert.ok(d >= 0.4 - 0.02 && d < 0.4 * 1.6, `a corner ${d} from the outline`); }
  assert.ok(!insetOutline(sec, 1.2).ok, "a chamfer wider than a tooth's tip is refused");
});

// The tooth chamfer on a worm wheel (`in_923`): the tips of its teeth broken at both faces, as a gear's are. The same field, the same kernel wedge, one boolean for all the teeth.
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

test("the worm wheel has the Chamfer field, last", () => {
  const t = armTool("gear", "wormwheel");
  assert.equal(gearFields(t.gear!).at(-1)!.label, "Chamfer");
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
test("a planetary set takes the tooth chamfer and the edge chamfer for all its gears (`in_923`)", () => {
  const spec: PlanetarySpec = { sun: 18, planet: 12, planets: 3, module: 1, width: 6, chamfer: 0.25, edge: 0.4 };
  const s = run(createSession(kernel), { type: "planetary", id: "q_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  assert.ok(!s.message, s.message ?? "");
  assert.deepEqual(s.outcome.errors, {});
  const plain = run(createSession(kernel), { type: "planetary", id: "q_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { ...spec, chamfer: undefined, edge: undefined } });
  const vol = (x: typeof s) => Object.values(scene(x).parts).filter((p) => p.kind === "body").reduce((a, p) => a + ((p as unknown as { volume: number }).volume ?? 0), 0);
  assert.ok(vol(plain) - vol(s) > 1, `the tips and edges are broken: ${vol(plain)} -> ${vol(s)}`);
  assert.equal(scene(s).gears!.filter((g) => g.spec.chamfer === 0.25 && g.spec.edge === 0.4).length, 5, "sun, three planets and ring");
});

test("a rack has Chamfer (the tips of its teeth at both faces) and Edge chamfer (the whole edge of both faces), by the kernel's chamfer, straight, turned and helical; one at a time (`in_924`)", () => {
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

test("an edge chamfer on a worm wheel is refused with why: the kernel cannot chamfer the edges of its throated faces (`in_924`)", () => {
  assert.match(make(wheel({ edge: 0.5 })).message ?? "", /not made for a worm wheel yet/);
});

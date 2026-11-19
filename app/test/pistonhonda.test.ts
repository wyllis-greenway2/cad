// The builder against the real engines (`dec_engine_presets`): Honda's published piston numbers (the GX120K1 / GX160K1 / GX200 service manual, maintenance standards, section 10 and the GX160 tech procedure) are written out here, apart from the code, and the builder's
// defaults and presets must agree with them. A default outside Honda's range fails the test, and the number is changed, not the table.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { ENGINE_START, ENGINE_PRESETS, engineGeometry, engineProblem, engineSteps } from "../src/operation/modelengine.ts";
import { pistonFit, defaultPin } from "../src/operation/pistondesign.ts";
import { modelNumbers } from "../src/operation/modelkinds.ts";
import { asCommand } from "../src/operation/modelparts.ts";

await kernel.init();

/** Honda's published numbers (mm), standard values: the service manual's maintenance standards for the three engines */
const HONDA = {
  GX120: { sleeve: 60.0, stroke: 42, skirt: 59.985, pin: 13.0, pinBore: 13.002 },
  GX160: { sleeve: 68.0, stroke: 45, skirt: 67.985, pin: 18.0, pinBore: 18.002 },
  GX200: { sleeve: 68.0, stroke: 54, skirt: 67.985, pin: 18.0, pinBore: 18.002 },
};
const COMMON = {
  ringHeight: { top: 1.5, second: 1.5, oil: 2.5 },
  ringSide: [0.015, 0.045], // top, second and oil (the standard rings)
  endGapCompression: [0.2, 0.4], endGapOil: [0.15, 0.35],
  skirtClearance: [0.015, 0.050], pinFit: [0.002, 0.014],
  gx160Rod: [3.301 * 25.4, 3.3225 * 25.4], // between centres, from the tech procedure's pin-bore to big-end-bore length and the two bores (mm)
};
const um = (v: number): number => Math.round(v * 1000) / 1000; // (Honda's numbers are to the micrometre: a difference of two is rounded to one)
const within = (v: number, [lo, hi]: number[]): boolean => um(v) >= lo! && um(v) <= hi!;

test("Honda's own numbers agree with one another: skirt, sleeve and pin fit are inside Honda's ranges", () => {
  for (const [name, h] of Object.entries(HONDA)) {
    assert.ok(within(h.sleeve - h.skirt, COMMON.skirtClearance), `${name}: sleeve less skirt ${(h.sleeve - h.skirt).toFixed(3)}`);
    assert.ok(within(h.pinBore - h.pin, COMMON.pinFit), `${name}: pin bore less pin ${(h.pinBore - h.pin).toFixed(3)}`);
  }
});

test("the builder's piston fit at each Honda bore: Honda's ring heights, and every default inside Honda's range", () => {
  for (const [name, h] of Object.entries(HONDA)) {
    const f = pistonFit(h.sleeve);
    assert.equal(f.compressionRing, COMMON.ringHeight.top, `${name}: compression ring height`);
    assert.equal(f.compressionRing, COMMON.ringHeight.second);
    assert.equal(f.oilRing, COMMON.ringHeight.oil, `${name}: oil ring height`);
    assert.ok(within(f.ringSide, COMMON.ringSide), `${name}: ring side room ${f.ringSide}`);
    assert.ok(within(f.endGapCompression, COMMON.endGapCompression), `${name}: compression end gap ${f.endGapCompression}`);
    assert.ok(within(f.endGapOil, COMMON.endGapOil), `${name}: oil end gap ${f.endGapOil}`);
    assert.ok(within(f.skirtClearance, COMMON.skirtClearance), `${name}: skirt clearance ${f.skirtClearance}`);
    assert.ok(within(f.pinFit, COMMON.pinFit), `${name}: pin fit ${f.pinFit}`);
  }
  // a smaller bore takes the proportion down to the floors; a bigger one stays at Honda's heights
  assert.equal(pistonFit(30).compressionRing, 1.0);
  assert.equal(pistonFit(30).oilRing, 2.0);
  assert.equal(pistonFit(120).compressionRing, 1.5);
  assert.equal(pistonFit(120).oilRing, 2.5);
});

test("the pin: the default is Honda's 18 mm at 68 mm, and every Honda pin is inside the accepted 0.18 to 0.4 of the bore", () => {
  assert.equal(defaultPin(68), HONDA.GX160.pin);
  assert.equal(defaultPin(30), ENGINE_START.pin);
  for (const [name, h] of Object.entries(HONDA)) assert.ok(h.pin / h.sleeve >= 0.18 && h.pin / h.sleeve <= 0.4, `${name}: ${(h.pin / h.sleeve).toFixed(3)} of the bore`);
});

test("the presets are Honda's engines: bore, stroke and pin, the GX160's rod, and each can be made", () => {
  assert.deepEqual(ENGINE_PRESETS.map((p) => p.name), ["Honda GX120", "Honda GX160", "Honda GX200"]);
  const by = { GX120: ENGINE_PRESETS[0]!.spec, GX160: ENGINE_PRESETS[1]!.spec, GX200: ENGINE_PRESETS[2]!.spec };
  ENGINE_PRESETS.forEach((p, i) => assert.equal(p.spec.preset, i + 1, `${p.name} says which preset it is`));
  for (const [name, h] of Object.entries(HONDA)) {
    const s = by[name as keyof typeof by];
    assert.equal(s.bore, h.sleeve, `${name} bore`);
    assert.equal(s.stroke, h.stroke, `${name} stroke`);
    assert.equal(s.pin, h.pin, `${name} pin`);
    assert.equal(s.rings, 2, `${name}: the two compression grooves`);
    assert.equal(engineProblem(s), null, `${name} can be made`);
  }
  const rod = by.GX160.stroke / 2 / by.GX160.ratio; // (the rod's length between centres)
  assert.ok(within(rod, COMMON.gx160Rod), `the GX160's rod is ${rod.toFixed(1)} mm between centres`);
});

test("the engine's box: a preset is another start, a typed number replaces one and the others follow", () => {
  const n = modelNumbers("engine", { preset: 2 });
  assert.ok(n.bore === 68 && n.stroke === 45 && n.pin === 18 && n.preset === 2 && n.rings === 2, JSON.stringify(n));
  const half = modelNumbers("engine", { preset: 2, bore: 34 });
  assert.ok(half.bore === 34 && Math.abs(half.stroke! - 22.5) < 0.06 && Math.abs(half.pin! - 9) < 0.06, `a typed bore scales the rest: ${JSON.stringify(half)}`);
  const own = modelNumbers("engine", { preset: 0 });
  assert.ok(own.bore === ENGINE_START.bore && own.pin === ENGINE_START.pin, "your own is the usual start");
});

test("the ring grooves are Honda's ring height and its side room", () => {
  for (const p of ENGINE_PRESETS) assert.ok(Math.abs(engineGeometry(p.spec).gh - (1.5 + pistonFit(p.spec.bore).ringSide)) < 1e-9, `${p.name}`);
  assert.ok(Math.abs(engineGeometry(ENGINE_START).gh - (1.0 + 0.03)) < 1e-9, "and the small usual engine's");
});

type B = { ref: string; volume: number };
const shared = (s: ReturnType<typeof createSession>, a: B, b: B): number => {
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: [a.ref, b.ref], params: { mode: "intersect" } } } as never);
  return /nothing in common/.test(done.message ?? "") ? 0 : (Object.values(scene(done).parts).filter((p) => p.kind === "body") as unknown as B[]).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
};
for (const p of ENGINE_PRESETS) {
  test(`${p.name} is built at rest: six bodies and no two share any volume`, () => {
    const r = engineSteps(p.spec);
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (!r.ok) return;
    const c = asCommand(scene(createSession(kernel)), r.value.steps);
    assert.ok(c.ok);
    if (!c.ok) return;
    const s = run(createSession(kernel), c.value);
    assert.equal(s.message ?? null, null);
    const b = Object.values(scene(s).parts).filter((x) => x.kind === "body") as unknown as B[];
    assert.equal(b.length, 6);
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) assert.equal(shared(s, b[i]!, b[j]!), 0, `parts ${i} and ${j} share volume`);
  });
}

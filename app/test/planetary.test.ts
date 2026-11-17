// A planetary set that keeps its numbers (`dec_planetary_gears`, `in_736` to `in_762`): the maths (teeth to ratio and ratio to teeth, the checks), the set as a command (gears, carrier, edit, delete, save), and the bodies the kernel makes from it.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { ratios, problemsOf, fromRatio, layoutOf, defaultPin } from "../src/operation/planetary.ts";
import type { PlanetarySpec } from "../src/operation/planetary.ts";
import { toJSON, fromJSON } from "../src/operation/scene.ts";

await kernel.init();
const SPUR: PlanetarySpec = { sun: 16, planet: 12, planets: 4, module: 2, width: 6 };
const make = (spec: PlanetarySpec, at: [number, number, number] = [0, 0, 0], s: Session = createSession(kernel)) => run(s, { type: "planetary", id: "q_001", plane: worldRef("XY"), at, spec });
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { ref: string; volume?: number; id?: string }[];

test("ratios: sun 12, planet 18 (ring 48): ring held 5, carrier held -4, sun held 1.25", () => {
  const r = ratios({ sun: 12, planet: 18 });
  assert.equal(r.ring, 5); assert.equal(r.carrier, -4); assert.equal(r.sun, 1.25);
});

test("the checks: whole numbers, (sun + ring) / planets whole, planets apart, a width, undercut warned", () => {
  assert.deepEqual(problemsOf(SPUR).filter((p) => p.fatal), []);
  assert.ok(problemsOf({ ...SPUR, planets: 3 }).some((p) => p.fatal && /not whole/.test(p.text))); // 56 / 3
  assert.ok(problemsOf({ ...SPUR, sun: 12, planet: 30, planets: 6 }).some((p) => p.fatal && /touch/.test(p.text)));
  assert.ok(problemsOf({ ...SPUR, width: 0 }).some((p) => p.fatal && /width/.test(p.text)));
  assert.ok(problemsOf({ ...SPUR, sun: 12, planet: 18, planets: 3 }).some((p) => !p.fatal && /undercut/.test(p.text)));
});

test("from a ratio: exact ones are found and pass the checks; four planets cannot reach 7.3 and the nearest is said", () => {
  const base = { planets: 3, module: 2, width: 6 };
  const a = fromRatio(5, "ring", base);
  assert.ok(a[0]!.error < 1e-9);
  assert.deepEqual(problemsOf({ ...base, sun: a[0]!.sun, planet: a[0]!.planet }).filter((p) => p.fatal), []);
  const c = fromRatio(7.3, "ring", { ...base, planets: 4 });
  assert.ok(c[0]!.ratio < 7 && c[0]!.error > 0.05, JSON.stringify(c[0]));
  const carrierHeld = fromRatio(-3, "carrier", base);
  assert.ok(carrierHeld[0]!.error < 1e-9 && carrierHeld[0]!.ratio === -3);
});

test("the set as a command: a sun, four planets and a ring, each a gear record with its own body steps, the ring turned to mesh the planets", () => {
  const s = make(SPUR);
  assert.equal(s.message, null);
  const sc = scene(s);
  assert.deepEqual(sc.gears!.map((g) => g.id), ["q_001s", "q_001p1", "q_001p2", "q_001p3", "q_001p4", "q_001r"]);
  assert.equal(sc.gears!.find((g) => g.id === "q_001r")!.spec.teeth, 40);
  assert.equal(sc.steps.filter((st) => st.params.gear).length, 6);
  assert.equal(sc.planetaries!.length, 1);
  const lay = layoutOf(SPUR, { u: [1, 0, 0], v: [0, 1, 0] }, [0, 0, 0]);
  assert.ok(lay.ok);
  const a = (SPUR.module * (SPUR.sun + SPUR.planet)) / 2;
  for (const p of (lay as unknown as { value: { planets: { at: number[] }[] } }).value.planets) assert.ok(Math.abs(Math.hypot(p.at[0]!, p.at[1]!) - a) < 1e-9);
});

test("a set that cannot be made is refused with the reason and the scene is as it was", () => {
  const s = make({ ...SPUR, planets: 3 });
  assert.match(s.message ?? "", /not whole/);
  assert.equal(scene(s).planetaries, undefined);
});

test("the kernel makes the bodies: six for a set with no carrier, and the carrier as one body (plate and pins) with it", () => {
  const plain = make(SPUR);
  assert.equal(bodies(plain).length, 6, JSON.stringify(bodies(plain).map((b) => b.ref)));
  const withCarrier = make({ ...SPUR, carrier: 4 });
  assert.equal(withCarrier.message, null);
  const bs = bodies(withCarrier);
  assert.equal(bs.length, 7, JSON.stringify(bs.map((b) => [b.ref, b.volume])));
  const plate = Math.PI * (2 * 28 / 2) ** 2 * 4; // (a rough upper bound: plate radius is the ring's pitch radius, 40 mm... checked below against the pins)
  void plate;
  const carrier = bs.find((b) => b.id === `x_${scene(withCarrier).planetaries![0]!.carrierStep}`)!;
  assert.ok(carrier && carrier.volume! > 0);
  const [R, t, pin, W, hole] = [40, 4, defaultPin(SPUR), 6, 5.4];
  const expected = Math.PI * R * R * t - Math.PI * (hole / 2) ** 2 * t + 4 * Math.PI * (pin / 2) ** 2 * W;
  assert.ok(Math.abs(carrier.volume! - expected) / expected < 0.01, `${carrier.volume} against ${expected}`);
});

test("editing the set: new numbers change every gear; more planets add gears, fewer take them away; the carrier follows or goes", () => {
  let s = make({ ...SPUR, carrier: 4 });
  const stepsBefore = scene(s).steps.length;
  s = run(s, { type: "setPlanetary", id: "q_001", spec: { ...SPUR, planets: 2, carrier: 4 } });
  assert.equal(s.message, null);
  assert.equal(scene(s).gears!.length, 4);
  assert.equal(scene(s).planetaries![0]!.planetIds.length, 2);
  assert.equal(bodies(s).length, 5);
  s = run(s, { type: "setPlanetary", id: "q_001", spec: { ...SPUR, sun: 20, planet: 10, planets: 5, carrier: 4 } }); // 20 + 40 = 60 over 5: whole
  assert.equal(s.message, null);
  assert.equal(scene(s).gears!.find((g) => g.id === "q_001r")!.spec.teeth, 40);
  assert.equal(scene(s).gears!.length, 7);
  s = run(s, { type: "setPlanetary", id: "q_001", spec: { ...SPUR, carrier: 0 } });
  assert.equal(s.message, null);
  assert.equal(scene(s).planetaries![0]!.carrierStep, undefined);
  assert.equal(bodies(s).length, 6);
  assert.ok(scene(s).steps.length <= stepsBefore);
  const bad = run(s, { type: "setPlanetary", id: "q_001", spec: { ...SPUR, planets: 3 } });
  assert.match(bad.message ?? "", /not whole/);
  assert.equal(scene(bad).gears!.length, 6, "nothing changed");
});

test("a helical set: the sun one hand, the planets the other, the ring the planets' hand (an internal pair has the same hand), and the bodies are made", () => {
  const s = make({ ...SPUR, helix: 15, carrier: 4 });
  assert.equal(s.message, null);
  const g = (id: string) => scene(s).gears!.find((x) => x.id === id)!.spec.helix;
  assert.equal(g("q_001s"), 15);
  assert.equal(g("q_001p1"), -15);
  assert.equal(g("q_001r"), -15);
  assert.equal(bodies(s).length, 7);
});

test("deleting the set takes everything: gears, steps, carrier parts and the record", () => {
  const before = scene(createSession(kernel));
  const s = run(make({ ...SPUR, carrier: 4 }), { type: "deletePlanetary", id: "q_001" });
  assert.equal(s.message, null);
  const sc = scene(s);
  assert.equal(sc.gears, undefined); assert.equal(sc.planetaries, undefined);
  assert.equal(sc.steps.length, 0);
  assert.equal(Object.keys(sc.parts).filter((r) => r.startsWith("d/q_001")).length, 0);
  assert.equal(Object.keys(sc.parts).length, Object.keys(before.parts).length);
});

test("saved and opened again, the set is as it was", () => {
  const s = make({ ...SPUR, carrier: 4 });
  const j = JSON.parse(JSON.stringify(toJSON(scene(s))));
  assert.equal(j.planetaries.length, 1);
  const back = fromJSON(j);
  assert.deepEqual(back.planetaries, scene(s).planetaries);
});

/** how much two bodies of the set overlap, mm3 (the kernel's intersection of the two, `keep` so the others stay; 0 when it says they have nothing in common) */
function overlap(s: Session, a: string, b: string): number {
  const refs = bodies(s).filter((x) => x.id === `x_${a}` || x.id === `x_${b}`).map((x) => x.ref);
  assert.equal(refs.length, 2);
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: refs as never, params: { mode: "intersect", keep: 1 } } });
  if (Object.values(done.outcome.errors).some((e) => /nothing in common/.test(e))) return 0;
  return Math.max(0, ...bodies(done).filter((x) => x.id === "x_s_900").map((x) => x.volume ?? 0));
}
const stepOf = (s: Session, gear: string): string => scene(s).steps.find((st) => st.params.gear === gear)!.id;
for (const [name, spec] of [["spur", { ...SPUR, carrier: 4 }], ["helical", { ...SPUR, helix: 15, carrier: 4 }]] as const) {
  test(`the ${name} set fits: no body of it runs into another (the sun, the planets, the ring and the carrier with the planets' pins)`, () => {
    const s = make(spec);
    assert.equal(s.message, null);
    const sc = scene(s);
    const st = (g: string) => stepOf(s, g);
    const carrier = sc.planetaries![0]!.carrierStep!;
    const pairs: [string, string, string][] = [["sun and planet 1", st("q_001s"), st("q_001p1")], ["sun and planet 2", st("q_001s"), st("q_001p2")], ["planet 1 and ring", st("q_001p1"), st("q_001r")], ["planet 3 and ring", st("q_001p3"), st("q_001r")], ["planet 1 and planet 2", st("q_001p1"), st("q_001p2")], ["carrier and planet 4", carrier, st("q_001p4")], ["carrier and sun", carrier, st("q_001s")]];
    for (const [what, a, b] of pairs) { const v = overlap(s, a, b); console.log(name, what, v); assert.ok(v < 3, `${name}: ${what} overlap ${v} mm3`); }
  });
}

test("the overlap check can see a bad fit: a planet turned half a tooth runs into the sun", () => {
  let s = make(SPUR);
  const p1 = scene(s).gears!.find((g) => g.id === "q_001p1")!;
  s = run(s, { type: "setGear", id: "q_001p1", spec: p1.spec, turn: (p1.turn ?? 0) + Math.PI / 12 });
  assert.equal(s.message, null);
  const v = overlap(s, stepOf(s, "q_001s"), stepOf(s, "q_001p1"));
  assert.ok(v > 5, `${v}`);
});

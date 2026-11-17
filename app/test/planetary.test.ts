// A planetary set that keeps its numbers (`dec_planetary_gears`, `in_736` to `in_762`): the maths (teeth to ratio and ratio to teeth, the checks), the set as a command (gears, carrier, edit, delete, save), and the bodies the kernel makes from it.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { gearOutline } from "../src/operation/gear.ts";
import { ratios, problemsOf, fromRatio, layoutOf, defaultPin, planetSteps } from "../src/operation/planetary.ts";
import type { PlanetarySpec } from "../src/operation/planetary.ts";
import { toJSON, fromJSON } from "../src/operation/scene.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { undoLast } from "../src/interaction/session.ts";

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

test("a plate gap puts the carrier on a plane of its own below the gears: the pins are that much longer, nothing touches, and the gap can be changed or taken away", () => {
  const gap = 1.5;
  let s = make({ ...SPUR, carrier: 4, plateGap: gap });
  assert.equal(s.message, null);
  const sc = scene(s);
  assert.ok(sc.parts["d/q_001.pl" as never], "the carrier's own plane");
  assert.equal(bodies(s).length, 7);
  const carrier = bodies(s).find((b) => b.id === `x_${sc.planetaries![0]!.carrierStep}`)!;
  const [R, t, pin, W, hole] = [40, 4, defaultPin(SPUR), 6, 5.4];
  const expected = Math.PI * R * R * t - Math.PI * (hole / 2) ** 2 * t + 4 * Math.PI * (pin / 2) ** 2 * (W + gap);
  assert.ok(Math.abs(carrier.volume! - expected) / expected < 0.01, `${carrier.volume} against ${expected}`);
  const zs = (id: string) => { const b = bodies(s).find((x) => x.id === `x_${id}`) as unknown as { bbox: { min: number[]; max: number[] } }; return [b.bbox.min[2]!, b.bbox.max[2]!]; };
  const [cz, pz] = [zs(sc.planetaries!.at(0)!.carrierStep!), zs(stepOf(s, "q_001p1"))];
  assert.ok(Math.abs(cz[0]! + gap + 4) < 1e-6 && Math.abs(cz[1]! - 6) < 1e-6, `carrier z ${cz}`); // plate from -(gap + 4) to -gap, pins up to the planets' top, 6
  assert.ok(Math.abs(pz[0]!) < 1e-6 && cz[0]! + 4 < pz[0]! - gap + 1e-6, `planet z ${pz}`); // the planet starts at 0, the plate's top is gap below it
  for (const g of ["q_001p1", "q_001s", "q_001r"]) assert.equal(overlap(s, sc.planetaries![0]!.carrierStep!, stepOf(s, g)), 0, g);
  s = run(s, { type: "setPlanetary", id: "q_001", spec: { ...SPUR, carrier: 4 } }); // gap taken away: the plane goes
  assert.equal(s.message, null);
  assert.equal(scene(s).parts["d/q_001.pl" as never], undefined);
  assert.equal(bodies(s).length, 7);
  assert.match(run(make({ ...SPUR, carrier: 4 }), { type: "setPlanetary", id: "q_001", spec: { ...SPUR, carrier: 4, plateGap: -1 } }).message ?? "", /below zero/);
});

const faceOfGear = (s: Session, id: string) => loopFaceRef(gearRefs(scene(s).gears!.find((g) => g.id === id)!).lines);
function opOn(s: Session, id: string, kind: "move" | "rotate", axis: 0 | 1 | 2, value: number) {
  const o = startOp(scene(s), [faceOfGear(s, id) as never], kind);
  assert.ok(o.ok, o.ok ? "" : o.why);
  return opCommand(scene(s), { ...(o as { op: Op }).op, axis, value })!;
}

test("Move on a gear of the set moves the whole set: the record's centre, every gear and the carrier, as one command; undo puts it back", () => {
  const s = make({ ...SPUR, carrier: 4 });
  const cmd = opOn(s, "q_001p2", "move", 0, 30);
  assert.ok(cmd);
  const moved = run(s, cmd);
  assert.equal(moved.message, null);
  const sc = scene(moved);
  assert.deepEqual(sc.planetaries![0]!.at.map((x) => Math.round(x * 1e6) / 1e6), [30, 0, 0]);
  const before = scene(s).gears!;
  for (const g of sc.gears!) { const g0 = before.find((x) => x.id === g.id)!; assert.ok(Math.abs(g.at[0] - g0.at[0] - 30) < 1e-6 && Math.abs(g.at[1] - g0.at[1]) < 1e-6, g.id); }
  assert.equal(bodies(moved).length, 7);
  const bb = moved.outcome.kernel!.bbox!;
  assert.ok(Math.abs((bb.min[0] + bb.max[0]) / 2 - 30) < 1e-3, `${bb.min[0]} .. ${bb.max[0]}`);
  assert.deepEqual(scene(undoLast(moved)).planetaries![0]!.at, [0, 0, 0]);
  assert.equal(opOn(s, "q_001s", "move", 2, 10), null, "a move across the plane is not made");
});

test("Rotate on a gear of the set turns the whole set about that gear's centre: the planets go round the sun and every mesh still fits", () => {
  const s = make(SPUR);
  const turned = run(s, opOn(s, "q_001s", "rotate", 2, 90));
  assert.equal(turned.message, null);
  const sc = scene(turned);
  assert.ok(Math.abs((sc.planetaries![0]!.turn ?? 0) - Math.PI / 2) < 1e-9);
  const p1 = sc.gears!.find((g) => g.id === "q_001p1")!.at;
  assert.ok(Math.abs(p1[0]) < 1e-6 && Math.abs(p1[1] - (2 * 28) / 2) < 1e-6, `${p1}`); // the first planet was on +x at 28 mm, now on +y
  for (const g of ["q_001p1", "q_001p3"]) assert.ok(overlap(turned, stepOf(turned, "q_001s"), stepOf(turned, g)) < 0.01 && overlap(turned, stepOf(turned, g), stepOf(turned, "q_001r")) < 0.01, g);
  // turned about a planet: the set swings round it
  const about = run(s, opOn(s, "q_001p1", "rotate", 2, 180));
  assert.equal(about.message, null);
  const at = scene(about).planetaries![0]!.at;
  assert.ok(Math.abs(at[0] - 56) < 1e-6 && Math.abs(at[1]) < 1e-6, `${at}`); // the sun was 28 mm from planet 1 on its own side, now 28 mm past it
});

test("spacing 1: any number of planets at the nearest meshing positions (whole tooth steps from the first); equal spacing still needs the whole number", () => {
  const odd: PlanetarySpec = { ...SPUR, planets: 3 }; // 56 / 3 is not whole
  assert.ok(problemsOf(odd).some((x) => x.fatal && /Spacing to 1/.test(x.text)));
  const near: PlanetarySpec = { ...odd, spacing: 1 };
  assert.deepEqual(problemsOf(near).filter((x) => x.fatal), []);
  assert.ok(problemsOf(near).some((x) => !x.fatal && /not evenly spaced/.test(x.text)));
  assert.deepEqual(planetSteps(near), [0, 19, 37]); // 56 / 3 = 18.67: steps of 19, 18, 19
  assert.deepEqual(planetSteps({ ...SPUR }), [0, 14, 28, 42]); // equal: unchanged
  assert.ok(!problemsOf({ ...SPUR, spacing: 1 }).some((x) => /not evenly/.test(x.text)), "an even set has no warning");
  const [evenOnly, anyCount] = [fromRatio(6, "ring", { planets: 3, module: 2, width: 6 }), fromRatio(6, "ring", { planets: 3, module: 2, width: 6, spacing: 1 })];
  assert.ok(anyCount.length > evenOnly.length && anyCount[0]!.error <= evenOnly[0]!.error, `${anyCount.length} against ${evenOnly.length}`); // more sets reach a ratio when the spacing may be nearest
});

for (const [name, spec] of [["spur", { ...SPUR, planets: 3, spacing: 1 }], ["helical", { ...SPUR, planets: 3, spacing: 1, helix: 15 }], ["five planets on 24 / 18 teeth", { sun: 24, planet: 18, planets: 5, module: 2, width: 6, spacing: 1 }]] as const) {
  test(`unevenly spaced set (${name}): every planet meshes with the sun and the ring, and none touches another`, () => {
    const s = make(spec);
    assert.equal(s.message, null);
    const n = spec.planets;
    for (let k = 1; k <= n; k++) {
      const p = stepOf(s, `q_001p${k}`);
      for (const [what, v] of [["sun", overlap(s, stepOf(s, "q_001s"), p)], ["ring", overlap(s, p, stepOf(s, "q_001r"))], ...(k < n ? [["next planet", overlap(s, p, stepOf(s, `q_001p${k + 1}`))] as [string, number]] : [])] as [string, number][]) assert.ok(v < 0.1, `${name}: planet ${k} and ${what} overlap ${v} mm3`);
    }
    const angles = scene(s).gears!.filter((g) => g.id.startsWith("q_001p")).map((g) => Math.atan2(g.at[1], g.at[0]));
    assert.ok(Math.max(...angles) - Math.min(...angles) > 0);
  });
}

test("a housing: a tube round the ring and an end cap, each a body, with a fit all round the ring; the carrier, the gap and the housing together; edit and delete take them with the set", () => {
  const spec: PlanetarySpec = { ...SPUR, carrier: 4, plateGap: 1, housing: 3, housingCap: 2, housingFit: 0.3 };
  let s = make(spec);
  assert.equal(s.message, null);
  const sc = scene(s);
  const rec = sc.planetaries![0]!;
  assert.ok(rec.shellStep && rec.capStep && rec.carrierStep);
  assert.equal(bodies(s).length, 9); // sun, 4 planets, ring, carrier, tube, cap
  const ring = sc.gears!.find((g) => g.id === "q_001r")!;
  const ro = (gearOutline(ring.spec) as { value: { outerRadius: number } }).value.outerRadius;
  const shell = bodies(s).find((b) => b.id === `x_${rec.shellStep}`)!;
  const wantShell = Math.PI * ((ro + 0.3 + 3) ** 2 - (ro + 0.3) ** 2) * (6 + 1);
  assert.ok(Math.abs(shell.volume! - wantShell) / wantShell < 0.01, `${shell.volume} against ${wantShell}`);
  const cap = bodies(s).find((b) => b.id === `x_${rec.capStep}`)!;
  const wantCap = (Math.PI * (ro + 0.3 + 3) ** 2 - Math.PI * (5.4 / 2) ** 2) * 2;
  assert.ok(Math.abs(cap.volume! - wantCap) / wantCap < 0.01, `${cap.volume} against ${wantCap}`);
  const zs = (id: string) => { const b = bodies(s).find((x) => x.id === `x_${id}`) as unknown as { bbox: { min: number[]; max: number[] } }; return [b.bbox.min[2]!, b.bbox.max[2]!]; };
  assert.ok(Math.abs(zs(rec.shellStep!)[0]!) < 1e-6 && Math.abs(zs(rec.shellStep!)[1]! - 7) < 1e-6, `tube z ${zs(rec.shellStep!)}`); // from the gears' plane up past the gap
  assert.ok(Math.abs(zs(rec.capStep!)[0]! - 7) < 1e-6 && Math.abs(zs(rec.capStep!)[1]! - 9) < 1e-6, `cap z ${zs(rec.capStep!)}`);
  for (const [a, b] of [[rec.shellStep!, stepOf(s, "q_001r")], [rec.shellStep!, rec.carrierStep!], [rec.capStep!, stepOf(s, "q_001p1")], [rec.capStep!, stepOf(s, "q_001s")], [rec.capStep!, rec.shellStep!], [rec.shellStep!, stepOf(s, "q_001p2")]] as [string, string][]) assert.equal(overlap(s, a, b), 0, `${a} ${b}`);
  s = run(s, { type: "setPlanetary", id: "q_001", spec: { ...spec, housingCap: 0 } }); // the cap goes
  assert.equal(s.message, null);
  assert.equal(bodies(s).length, 8);
  assert.equal(scene(s).planetaries![0]!.capStep, undefined);
  assert.equal(scene(s).parts["d/q_001.hp" as never], undefined);
  s = run(s, { type: "setPlanetary", id: "q_001", spec: { ...spec, housing: 0, housingCap: 0 } });
  assert.equal(bodies(s).length, 7);
  assert.match(run(make(SPUR), { type: "setPlanetary", id: "q_001", spec: { ...SPUR, housingCap: 2 } }).message ?? "", /needs a housing/);
  s = run(make(spec), { type: "deletePlanetary", id: "q_001" });
  assert.equal(Object.keys(scene(s).parts).filter((r) => r.startsWith("d/q_001")).length, 0);
  assert.equal(scene(s).steps.length, 0);
});

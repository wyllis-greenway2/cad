// The piston maker (`dec_piston_maker`): the Piston model with its own box: its numbers (0 = auto) make the piston and its pin, stood crown up; the engine builds its piston by the same code, so with the same numbers the two are the same piston.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { ENGINE_START, ENGINE_PRESETS, engineSteps, engineGeometry, pistonOf } from "../src/operation/modelengine.ts";
import { PISTON_START, PISTON_PRESETS, pistonGeometry, pistonProblem, pistonSteps } from "../src/operation/modelpiston.ts";
import { modelNumbers, modelFields } from "../src/operation/modelkinds.ts";
import { asCommand } from "../src/operation/modelparts.ts";
import type { Result } from "../src/shared/result.ts";
import type { ModelBuild } from "../src/operation/modelparts.ts";

await kernel.init();
type Body = { volume: number; bbox: { min: number[]; max: number[] } };
function bodies(r: Result<ModelBuild>): Body[] {
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return [];
  const c = asCommand(scene(createSession(kernel)), r.value.steps);
  assert.ok(c.ok);
  if (!c.ok) return [];
  const s = run(createSession(kernel), c.value);
  assert.equal(s.message ?? null, null);
  return Object.values(scene(s).parts).filter((x) => x.kind === "body") as unknown as Body[];
}
const P = (o: Partial<typeof PISTON_START> = {}): typeof PISTON_START => ({ ...PISTON_START, ...o });
const volumes = (r: Result<ModelBuild>): number[] => bodies(r).map((b) => b.volume).sort((a, b) => b - a);

test("the piston stands crown up: four bodies, the piston, its pin and two circlips, the height and the width the numbers give", () => {
  for (const spec of [P(), ...PISTON_PRESETS.map((p) => p.spec)]) {
    const g = pistonGeometry(spec), bs = bodies(pistonSteps(spec));
    assert.equal(bs.length, 4, "the piston, the pin and the two circlips");
    const cup = bs.sort((a, b) => b.volume - a.volume)[0]!;
    assert.ok(Math.abs(cup.bbox.min[2]!) < 0.01 && Math.abs(cup.bbox.max[2]! - (g.sk + g.ch)) < 0.01, `from the foot (0) to the crown (${(g.sk + g.ch).toFixed(2)}): ${cup.bbox.min[2]} to ${cup.bbox.max[2]}`);
    assert.ok(Math.abs(cup.bbox.max[1]! - cup.bbox.min[1]! - 2 * g.rp) < 0.01 && Math.abs(cup.bbox.max[0]! - cup.bbox.min[0]! - (2 * g.rp - g.oval)) < 0.01 && Math.abs((cup.bbox.max[0]! + cup.bbox.min[0]!) / 2) < 0.01, "centred on the click, as wide across the thrust as the bore less the room, narrower along the pin by the oval");
  }
});

test("with the engine's numbers the piston maker's piston is the engine's piston (the same volume of the piston and of the pin)", () => {
  for (const eng of [ENGINE_START, ENGINE_PRESETS[1]!.spec, ENGINE_PRESETS[0]!.spec]) {
    const r = engineSteps(eng);
    const g = engineGeometry(eng);
    const inEngine = bodies(r).filter((b) => Math.abs(b.bbox.max[0]! - b.bbox.min[0]! - (g.sk + g.ch)) < 0.05 && Math.abs(b.bbox.max[1]! - b.bbox.min[1]! - 2 * g.rp) < 0.05 && b.bbox.max[2]! - b.bbox.min[2]! > 2 * g.rp - 0.5 || (Math.abs(b.bbox.max[2]! - b.bbox.min[2]! - 2 * g.pg.pinHalf) < 0.05 && Math.abs(b.bbox.max[1]! - b.bbox.min[1]! - eng.pin) < 0.05))
      .map((b) => b.volume).sort((a, b) => b - a);
    const alone = volumes(pistonSteps(pistonOf(eng)));
    assert.equal(inEngine.length, 2, "the engine's piston and pin are found");
    assert.ok(Math.abs(inEngine[0]! - alone[0]!) / alone[0]! < 1e-6 && Math.abs(inEngine[1]! - alone[1]!) / alone[1]! < 1e-6, `bore ${eng.bore}: ${inEngine.map((v) => v.toFixed(2))} against ${alone.map((v) => v.toFixed(2))}`);
  }
});

test("a number typed as what auto works out is the same piston as auto; a different one moves just that thing", () => {
  const g = pistonGeometry(P({ bore: 68, pin: 18 })), base = P({ bore: 68, pin: 18 }), v0 = volumes(pistonSteps(base));
  const same = (o: Partial<typeof PISTON_START>): void => { const v = volumes(pistonSteps({ ...base, ...o })); assert.ok(Math.abs(v[0]! - v0[0]!) < 1e-6 && Math.abs(v[1]! - v0[1]!) < 1e-6, `${JSON.stringify(o)} should change nothing`); };
  same({ pinHeight: g.ch });
  same({ skirtLen: g.sk });
  same({ pinLen: 2 * g.pinHalf });
  same({ ringHeight: 1.5 });
  same({ oilRingHeight: 2.5 });
  same({ ringRadial: 68 / 22 });
  same({ land: 1.6 * 1.5 });
  same({ backRoom: 0.45 });
  same({ drainDia: 0.03 * 68 });
  same({ bossGap: 2 * g.zoff });
  same({ bossReach: g.shell.wall });
  // and a different one: the geometry follows
  assert.ok(Math.abs(pistonGeometry({ ...base, pinHeight: 40 }).ch - 40) < 1e-9 && pistonGeometry({ ...base, pinHeight: 40 }).ch !== g.ch, "the pin height typed");
  assert.equal(pistonGeometry({ ...base, skirtLen: 30 }).sk, 30);
  assert.equal(pistonGeometry({ ...base, ringHeight: 2 }).belt.grooves[0]!.height, 2 + base.ringSide);
  assert.equal(pistonGeometry({ ...base, oilRingHeight: 3 }).belt.grooves[2]!.height, 3 + base.ringSide);
  assert.ok(Math.abs(pistonGeometry({ ...base, ringRadial: 3, backRoom: 1 }).belt.depth - 4) < 1e-9, "the depth is the radial width and the back room");
  assert.ok(Math.abs(pistonGeometry({ ...base, land: 4 }).belt.grooves[1]!.top - pistonGeometry({ ...base, land: 4 }).belt.grooves[0]!.top - (1.5 + base.ringSide) - 4) < 1e-9, "the land between rings");
  assert.equal(pistonGeometry({ ...base, bossGap: 20 }).zoff, 10);
  assert.ok(Math.abs(pistonGeometry({ ...base, bossReach: 5 }).shell.boss - (9 + base.pinFit / 2 + 5)) < 1e-9, "the boss reach");
  assert.ok(Math.abs(pistonGeometry({ ...base, drainDia: 1.2 }).drainR - 0.6) < 1e-9, "the drain hole diameter");
  assert.equal(pistonGeometry({ ...base, pinLen: 40 }).pinHalf, 20);
  // a typed ring height takes room: the volume of the piston changes (a different groove)
  assert.ok(Math.abs(volumes(pistonSteps({ ...base, ringHeight: 2 }))[0]! - v0[0]!) > 1, "a taller ring groove removes more metal");
});

test("numbers that make no piston are said, and a negative number is not auto", () => {
  assert.equal(pistonProblem(P()), null);
  assert.match(pistonProblem(P({ pinHeight: -1 })) ?? "", /pin height is 0 \(auto\) or more/);
  assert.match(pistonProblem(P({ ringHeight: -0.1 })) ?? "", /compression ring's height/);
  assert.match(pistonProblem(P({ pinHeight: 6 })) ?? "", /pin height is too small for the ring belt/);
  assert.match(pistonProblem(P({ skirtLen: 2 })) ?? "", /skirt below the pin is too short/);
  assert.match(pistonProblem(P({ bossGap: 1 })) ?? "", /gap between the pin bosses/);
  assert.match(pistonProblem(P({ pinLen: 5 })) ?? "", /long \(through both bosses/);
  assert.match(pistonProblem(P({ pinLen: 80 })) ?? "", /long \(through both bosses/);
  assert.match(pistonProblem(P({ bore: 8, pin: 2 })) ?? "", /bore must be 12|pin is/);
  assert.match(pistonProblem(P({ rings: 5 })) ?? "", /rings are 0 to 3/);
  assert.ok(!pistonSteps(P({ pinHeight: 6 })).ok, "and no piston is made of them");
});

test("the Piston model's box: the Honda presets, a typed number stays, the others are auto", () => {
  const n = modelNumbers("piston", { preset: 2 });
  assert.ok(n.bore === 68 && n.pin === 18 && n.rings === 2 && n.oil === 1 && n.preset === 2 && n.pinHeight === 0, JSON.stringify(n));
  assert.deepEqual(PISTON_PRESETS.map((p) => p.name), ["Honda GX120", "Honda GX160", "Honda GX200"]);
  const t = modelNumbers("piston", { pinHeight: 22 });
  assert.equal(t.pinHeight, 22, "a number typed stays");
  assert.ok(t.skirtLen === 0 && t.land === 0 && t.drainDia === 0, "the rest stay auto");
  const keys = modelFields("piston").map((f) => f.key);
  for (const k of Object.keys(PISTON_START)) assert.ok(keys.includes(k), `the box has a field for ${k}`);
});

import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { worldRef } from "../src/shared/ref.ts";
test("the Piston model is made from the Models menu: the action, a click and Enter make the piston, its pin and two circlips", () => {
  const env = { w: 800, h: 600, now: 0 };
  let st = { ...createState(createSession(kernel)), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: "model:piston" }, env as never);
  assert.ok(st.tool?.model, "the model tool is armed");
  st = { ...st, tool: { ...st.tool!, plane: worldRef("XY"), points: [[0, 0, 0]], cursor: [0, 0, 0] } };
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env as never);
  let n = 0;
  while (st.building && n++ < 60) st = reduce(st, { type: "buildNext" }, env as never);
  assert.equal(st.building, null);
  assert.equal(st.session.message ?? null, null);
  const sc = scene(st.session);
  assert.equal(Object.values(sc.parts).filter((p) => p.kind === "body").length, 4, "the piston, the pin and the two circlips");
  assert.equal(sc.models?.length, 1);
});

// Land relief and circlips (`dec_piston_lands_clips`).
test("the lands are cut smaller than the skirt: the top land 0.003 and the others 0.002 of the bore across, and a typed relief changes the volume by the ring it takes", () => {
  const base = P({ bore: 68, pin: 18 }), g = pistonGeometry(base);
  assert.equal(g.lands.length, 3, "the top land and the two lands between the three grooves");
  assert.ok(Math.abs(g.lands[0]!.radius - (g.rt - 0.003 * 68 / 2)) < 1e-9 && Math.abs(g.lands[1]!.radius - (g.rt - 0.002 * 68 / 2)) < 1e-9 && Math.abs(g.lands[2]!.radius - (g.rt - 0.002 * 68 / 2)) < 1e-9, "auto: smaller than the skirt's top radius");
  assert.ok(g.lands[0]!.top === 0 && Math.abs(g.lands[0]!.bottom - g.belt.grooves[0]!.top) < 1e-9 && Math.abs(g.lands[1]!.top - (g.belt.grooves[0]!.top + g.belt.grooves[0]!.height)) < 1e-9 && Math.abs(g.lands[1]!.bottom - g.belt.grooves[1]!.top) < 1e-9, "each land runs from the groove above to the groove below");
  const cup = (o: Partial<typeof PISTON_START>): number => volumes(pistonSteps({ ...base, ...o }))[0]!;
  const v0 = cup({}), big = cup({ topLandRelief: 1.0 }), gg = pistonGeometry({ ...base, topLandRelief: 1.0 });
  const expect = Math.PI * ((g.lands[0]!.radius) ** 2 - gg.lands[0]!.radius ** 2) * (g.lands[0]!.bottom - g.lands[0]!.top);
  assert.ok(Math.abs((v0 - big) - expect) / expect < 0.02, `the kernel took ${(v0 - big).toFixed(2)} mm3 more, the ring is ${expect.toFixed(2)} mm3`);
  const same = cup({ topLandRelief: 0.003 * 68, landRelief: 0.002 * 68 });
  assert.ok(Math.abs(same - v0) < 1e-6, "the auto value typed is auto");
  assert.match(pistonProblem(P({ bore: 68, pin: 18, topLandRelief: 8 })) ?? "", /cut too far below the skirt/);
  assert.match(pistonProblem(P({ landRelief: -1 })) ?? "", /relief is 0/);
});
test("the pin is held by circlips: a groove in the pin bore near each face, a ring in each, the pin ends short of them", () => {
  const base = P({ bore: 68, pin: 18 }), g = pistonGeometry(base), c = g.clip!;
  assert.ok(c, "circlips are the default");
  assert.ok(Math.abs(c.width - 1.08) < 1e-9 && Math.abs(c.depth - 0.504) < 1e-9 && Math.abs(c.z - (g.outerZ(c.bore + c.depth) - 1 - 1.08)) < 1e-9, "the groove: 0.06 and 0.028 of the pin, 1 mm from the face where the groove is widest");
  assert.ok(Math.abs(g.pinHalf - (c.z - 0.1)) < 1e-9, "the pin ends 0.1 mm short of the groove");
  for (const y of [0, 3, 6, c.bore + c.depth]) assert.ok(c.z + c.width + 1 <= g.outerZ(y) + 1e-9 || y < c.bore + c.depth - 1e-9 && c.z + c.width + 1 <= g.outerZ(c.bore + c.depth) + 1e-9, `the groove stays inside the skirt's face at y = ${y}: it was breaking out at its sides`);
  assert.ok(c.z + c.width + 1 <= g.outerZ(c.bore + c.depth) + 1e-9, "the groove's outer face is 1 mm inside the skirt where the groove is widest");
  assert.ok(c.inner < 9 && c.outer < c.bore + c.depth, "the circlip reaches in over the pin's end and stays inside its groove");
  const bs = bodies(pistonSteps(base)).sort((a, b) => b.volume - a.volume);
  assert.equal(bs.length, 4);
  const clipVol = Math.PI * (c.outer ** 2 - c.inner ** 2) * c.thick;
  assert.ok(Math.abs(bs[2]!.volume - clipVol) / clipVol < 0.001 && Math.abs(bs[3]!.volume - clipVol) / clipVol < 0.001, `each circlip is ${clipVol.toFixed(2)} mm3: ${bs[2]!.volume.toFixed(2)}, ${bs[3]!.volume.toFixed(2)}`);
  const pin = bs[1]!;
  assert.ok(Math.abs(pin.bbox.max[0]! - pin.bbox.min[0]! - 2 * g.pinHalf) < 0.01, "the pin's length is the shorter one (the pin lies along the model's x here)");
  // without circlips: two bodies, the longer pin, and more metal in the piston (no grooves)
  const none = pistonGeometry({ ...base, retention: 0 });
  assert.equal(none.clip, null);
  assert.ok(none.pinHalf > g.pinHalf, "no circlips: the pin runs the whole way");
  const bn = bodies(pistonSteps({ ...base, retention: 0 })).sort((a, b) => b.volume - a.volume);
  assert.equal(bn.length, 2, "no circlips, no ring bodies");
  const grooves = 2 * Math.PI * ((c.bore + c.depth) ** 2 - c.bore ** 2) * c.width;
  assert.ok(Math.abs((bn[0]!.volume - bs[0]!.volume) - grooves) / grooves < 0.01, `the grooves take ${grooves.toFixed(2)} mm3 out of the piston: ${(bn[0]!.volume - bs[0]!.volume).toFixed(2)}`);
  assert.match(pistonProblem(P({ retention: 2 })) ?? "", /retention is 0/);
  assert.match(pistonProblem({ ...base, pinLen: 2 * c.z + 4 }) ?? "", /too long for the circlips/);
  assert.match(pistonProblem({ ...base, clipEdge: 0.2 }) ?? "", /0.5 mm or more/);
  assert.match(pistonProblem({ ...base, clipWidth: 26 }) ?? "", /no room for the pin between the bosses/);
});

// The material and the hollow pin (`dec_piston_material`).
import { MATERIALS, pistonVolumes, pistonWeight } from "../src/operation/modelpiston.ts";
test("the material gives the room in the bore (0 = auto): cast aluminium Honda's 0.03, forged 0.05, cast iron 0.13; a typed room replaces it", () => {
  const fit = (o: Partial<typeof PISTON_START>): number => pistonGeometry(P({ bore: 68, pin: 18, ...o })).fit;
  assert.equal(fit({}), 0.03);
  assert.equal(fit({ material: 1 }), 0.03);
  assert.equal(fit({ material: 2 }), 0.05);
  assert.equal(fit({ material: 3 }), 0.13);
  assert.equal(fit({ material: 4 }), 0.13);
  assert.equal(fit({ material: 3, skirtFit: 0.07 }), 0.07, "a number typed replaces the material's");
  const r = (m: number): number => pistonGeometry(P({ bore: 68, pin: 18, material: m })).rp;
  assert.ok(r(3) < r(2) && r(2) < r(0), "more room, a smaller piston");
  assert.ok(Math.abs(r(2) - (34 - 0.025)) < 1e-9 && Math.abs(r(3) - (34 - 0.065)) < 1e-9);
  assert.deepEqual(MATERIALS.map((m) => m.name), ["Cast aluminium", "Hypereutectic aluminium", "Forged aluminium", "Cast iron", "Steel"]);
  assert.match(pistonProblem(P({ material: 5 })) ?? "", /the material is 0 to 4/);
  assert.match(pistonProblem(P({ material: 1.5 })) ?? "", /the material is 0 to 4/);
});
test("the weight: the piston's, the pin's and the circlips' worked-out volumes agree with the kernel's, and the material scales it", () => {
  for (const spec of [P(), P({ bore: 68, pin: 18 }), P({ bore: 60, pin: 13 })]) {
    const g = pistonGeometry(spec), v = pistonVolumes(spec, g), bs = bodies(pistonSteps(spec)).sort((a, b) => b.volume - a.volume);
    assert.equal(bs.length, 4);
    assert.ok(Math.abs(bs[0]!.volume - v.cup) / v.cup < 0.003, `the cup: kernel ${bs[0]!.volume.toFixed(1)}, worked out ${v.cup.toFixed(1)}`);
    assert.ok(Math.abs(bs[1]!.volume - v.pin) / v.pin < 0.001, `the pin: kernel ${bs[1]!.volume.toFixed(1)}, worked out ${v.pin.toFixed(1)}`);
    assert.ok(Math.abs(bs[2]!.volume + bs[3]!.volume - v.clips) / v.clips < 0.001, "the circlips");
    const w = pistonWeight(spec, g);
    assert.ok(Math.abs(w.total - (w.piston + w.pin + w.clips)) < 1e-9 && Math.abs(w.piston - (v.cup * 2.7) / 1000) < 1e-9 && Math.abs(w.pin - (v.pin * 7.85) / 1000) < 1e-9, "the piston in its material, the pin and circlips in steel");
  }
  const al = pistonWeight(P({ bore: 68, pin: 18 })), iron = pistonWeight(P({ bore: 68, pin: 18, material: 3 }));
  assert.ok(iron.piston > 2.5 * al.piston, `cast iron is heavier: ${iron.piston.toFixed(1)} g against ${al.piston.toFixed(1)} g`);
  assert.ok(al.total > 40 && al.total < 400, `a GX160-sized piston weighs ${al.total.toFixed(1)} g in this model (no source gives a real one)`);
});
test("the pin is hollow by default (0.55 of the pin), solid when asked; a typed bore is used; too thin a wall is refused", () => {
  const base = P({ bore: 68, pin: 18 }), g = pistonGeometry(base);
  assert.ok(Math.abs(g.pinBore - 0.55 * 18) < 1e-9, "auto: 0.55 of the pin");
  assert.equal(pistonGeometry({ ...base, pinKind: 0 }).pinBore, 0, "solid");
  assert.equal(pistonGeometry({ ...base, pinBore: 8 }).pinBore, 8, "typed");
  const solid = pistonVolumes({ ...base, pinKind: 0 }).pin, hollow = pistonVolumes(base).pin;
  assert.ok(Math.abs(hollow / solid - (1 - 0.55 * 0.55)) < 1e-9, "the pin's volume is the ring's");
  const bs = bodies(pistonSteps({ ...base, pinKind: 0 })).sort((a, b) => b.volume - a.volume), bh = bodies(pistonSteps(base)).sort((a, b) => b.volume - a.volume);
  assert.ok(Math.abs(bs[1]!.volume - solid) / solid < 0.001 && Math.abs(bh[1]!.volume - hollow) / hollow < 0.001, "the kernel's pins");
  assert.match(pistonProblem({ ...base, pinBore: 17 }) ?? "", /leaves too thin a wall/);
  assert.match(pistonProblem({ ...base, pinKind: 2 }) ?? "", /solid \(0\) or hollow \(1\)/);
  assert.match(pistonProblem({ ...base, pinBore: -1 }) ?? "", /bore is 0 \(auto\) or more/);
});

// The skirt (`dec_piston_skirt`): oval, taper, foot chamfer, two pads.
test("the skirt is oval and tapered by default: narrower along the pin and at the top, the foot's radius is the sized one, and Round is the plain cylinder", () => {
  const base = P({ bore: 68, pin: 18 }), g = pistonGeometry(base);
  assert.ok(Math.abs(g.oval - 0.068) < 1e-9 && Math.abs(g.taper - 0.0007 * 68) < 1e-9 && Math.abs(g.chamfer - 0.272) < 1e-9, "auto: 0.001, 0.0007 and 0.004 of the bore");
  assert.ok(Math.abs(g.rt - (g.rp - g.taper / 2)) < 1e-9 && g.rt < g.rp, "the top of the skirt is narrower than the foot, whose radius is the bore less the room");
  assert.ok(g.radiusAt(-g.sk) === g.rp && Math.abs(g.radiusAt(g.ch - g.belt.length) - g.rt) < 1e-9, "the radius runs from the foot's to the top's");
  assert.ok(g.rzPin <= g.rp - g.oval / 2 + 1e-12 && g.rzPin > g.rt - 1e-9 - g.oval, "the skirt's outer face at the pin");
  const round = pistonGeometry({ ...base, skirtShape: 0 });
  assert.ok(round.oval === 0 && round.taper === 0 && round.rt === round.rp && round.rzPin === round.rp, "Round: no oval, no taper");
  // the kernel: the piston is narrower along the pin by the oval and as wide as the bore across the thrust
  const b1 = bodies(pistonSteps(base)).sort((a, b) => b.volume - a.volume)[0]!, b0 = bodies(pistonSteps({ ...base, skirtShape: 0 })).sort((a, b) => b.volume - a.volume)[0]!;
  assert.ok(Math.abs(b1.bbox.max[1]! - b1.bbox.min[1]! - 2 * g.rp) < 0.005 && Math.abs(b0.bbox.max[1]! - b0.bbox.min[1]! - 2 * g.rp) < 0.005, "across the thrust: the bore less the room, both");
  assert.ok(Math.abs(b1.bbox.max[0]! - b1.bbox.min[0]! - (2 * g.rp - g.oval)) < 0.005 && Math.abs(b0.bbox.max[0]! - b0.bbox.min[0]! - 2 * g.rp) < 0.005, "along the pin: narrower by the oval (the pin lies along the model's z, the world's x here)");
  assert.ok(b1.volume < b0.volume, "less metal");
  const v = pistonVolumes(base, g).cup, v0 = pistonVolumes({ ...base, skirtShape: 0 }).cup;
  assert.ok(Math.abs(b1.volume - v) / v < 0.0015 && Math.abs(b0.volume - v0) / v0 < 0.0015, `the worked-out volumes: ${b1.volume.toFixed(1)} against ${v.toFixed(1)}, round ${b0.volume.toFixed(1)} against ${v0.toFixed(1)}`);
  assert.ok(Math.abs((v0 - v) - (b0.volume - b1.volume)) < 6, `what oval and taper take off: ${(v0 - v).toFixed(2)} worked out, ${(b0.volume - b1.volume).toFixed(2)} in the kernel (mm3)`);
});
test("typed oval, taper and chamfer are used; the foot chamfer takes metal off the foot; they are refused when absurd", () => {
  const base = P({ bore: 68, pin: 18 });
  assert.equal(pistonGeometry({ ...base, oval: 0.2 }).oval, 0.2);
  assert.equal(pistonGeometry({ ...base, taper: 0.1 }).taper, 0.1);
  assert.equal(pistonGeometry({ ...base, footChamfer: 1 }).chamfer, 1);
  const c1 = bodies(pistonSteps({ ...base, footChamfer: 0.2 })).sort((a, b) => b.volume - a.volume)[0]!.volume, c2 = bodies(pistonSteps({ ...base, footChamfer: 2 })).sort((a, b) => b.volume - a.volume)[0]!.volume;
  const rp = pistonGeometry(base).rp, ring = (c: number): number => Math.PI * (rp - c / 3) * c * c; // (a chamfer's triangle turned about the axis: its area c^2/2 times 2 pi times its centroid's radius)
  assert.ok(Math.abs((c1 - c2) - (ring(2) - ring(0.2))) / (ring(2) - ring(0.2)) < 0.03, `a 2 mm chamfer takes ${(ring(2) - ring(0.2)).toFixed(1)} mm3 more than a 0.2 mm one: the kernel's ${(c1 - c2).toFixed(1)}`);
  assert.match(pistonProblem({ ...base, oval: 2 }) ?? "", /oval and taper are 0.68 mm across or less/);
  assert.match(pistonProblem({ ...base, footChamfer: 40 }) ?? "", /chamfer is .* mm or less/);
  assert.match(pistonProblem({ ...base, skirtShape: 2 }) ?? "", /skirt shape is 0/);
  assert.match(pistonProblem({ ...base, oval: -1 }) ?? "", /oval is 0 \(auto\)/);
});
test("two pads: the skirt is cut away at the sides of the pin below the bosses, each pad spanning the typed angle (80 degrees by default)", () => {
  const base = P({ bore: 68, pin: 18, skirtShape: 0, skirtLen: 40 }), g = pistonGeometry({ ...base, skirtStyle: 1 });
  assert.ok(Math.abs(g.wedge - (50 * Math.PI) / 180) < 1e-9, "90 - 40 degrees from the pin axis");
  assert.ok(Math.abs(pistonGeometry({ ...base, skirtStyle: 1, padAngle: 70 }).wedge - (55 * Math.PI) / 180) < 1e-9, "typed 70");
  const full = bodies(pistonSteps(base)).sort((a, b) => b.volume - a.volume)[0]!.volume, pads = bodies(pistonSteps({ ...base, skirtStyle: 1 })).sort((a, b) => b.volume - a.volume)[0]!.volume;
  const expect = pistonVolumes(pistonGeometry({ ...base }) && base).cup - pistonVolumes({ ...base, skirtStyle: 1 }).cup;
  assert.ok(Math.abs((full - pads) - expect) / expect < 0.03, `the wedges take ${(full - pads).toFixed(1)} mm3 in the kernel, ${expect.toFixed(1)} worked out`);
  assert.ok(full - pads > 1000, "a real cut");
  const g1 = pistonGeometry(base);
  assert.equal(g1.wedge, 0, "full: no wedge");
  assert.match(pistonProblem({ ...base, skirtStyle: 1, skirtLen: 10 }) ?? "", /two pads needs the skirt to reach/);
  assert.match(pistonProblem({ ...base, skirtStyle: 1, padAngle: 10 }) ?? "", /a pad spans 30 to 150 degrees/);
  assert.match(pistonProblem({ ...base, skirtStyle: 2 }) ?? "", /full \(0\) or two pads \(1\)/);
});

// A section through a ring groove: the wall under its floor is there (the grooves do not cut through the piston).
test("a section through each ring groove at the thrust sides: the cavity's wall and the groove's floor, the wall between them as thick as the wall asked for", () => {
  const spec = P({ bore: 68, pin: 18 }), g = pistonGeometry(spec);
  const r = pistonSteps(spec), c = asCommand(scene(createSession(kernel)), r.ok ? r.value.steps : []);
  assert.ok(r.ok && c.ok);
  if (!r.ok || !c.ok) return;
  const s = run(createSession(kernel), c.value);
  const mesh = (s.outcome.kernel as unknown as { mesh: { vertices: Float32Array; triangles: Uint32Array } }).mesh, V = mesh.vertices, T = mesh.triangles;
  const hits = (zq: number, th: number): number[] => { // (the distances from the axis at which a ray in the plane z = zq crosses the surfaces)
    const dx = Math.cos(th), dy = Math.sin(th), out: number[] = [];
    for (let i = 0; i < T.length; i += 3) {
      const p = [0, 1, 2].map((k) => [V[3 * T[i + k]!]!, V[3 * T[i + k]! + 1]!, V[3 * T[i + k]! + 2]!]);
      const lo = p.filter((q) => q[2]! < zq), hi = p.filter((q) => q[2]! >= zq);
      if (!lo.length || !hi.length) continue;
      const pts: number[][] = [];
      for (const a of lo) for (const b of hi) { const t = (zq - a[2]!) / (b[2]! - a[2]!); pts.push([a[0]! + t * (b[0]! - a[0]!), a[1]! + t * (b[1]! - a[1]!)]); }
      if (pts.length < 2) continue;
      const [P0, Q] = [pts[0]!, pts[1]!], ex = Q[0]! - P0[0]!, ey = Q[1]! - P0[1]!, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const tt = (P0[0]! * ey - P0[1]! * ex) / den, uu = (P0[0]! * dy - P0[1]! * dx) / den;
      if (tt > 0 && uu >= 0 && uu <= 1) out.push(tt);
    }
    return out.sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1]! > 1e-3);
  };
  for (const gr of g.belt.grooves) for (const deg of [60, 90, 120]) {
    const h = hits(g.sk + g.ch - gr.top - gr.height / 2, (deg * Math.PI) / 180);
    assert.equal(h.length, 2, `groove at ${gr.top.toFixed(1)}, ${deg} degrees: the cavity's wall and the groove's floor: ${h.map((v) => v.toFixed(2))}`);
    assert.ok(Math.abs(h[0]! - g.shell.innerBelt) < 0.05 && Math.abs(h[1]! - (g.rp - g.belt.depth)) < 0.05, `the wall runs from ${g.shell.innerBelt.toFixed(2)} to the floor at ${(g.rp - g.belt.depth).toFixed(2)}: ${h.map((v) => v.toFixed(2))}`);
    assert.ok(Math.abs(h[1]! - h[0]! - g.shell.wall) < 0.1, "the wall under the floor is the wall asked for");
  }
});

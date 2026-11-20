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

test("the piston stands crown up: two bodies, the piston and its pin, the height and the width the numbers give", () => {
  for (const spec of [P(), ...PISTON_PRESETS.map((p) => p.spec)]) {
    const g = pistonGeometry(spec), bs = bodies(pistonSteps(spec));
    assert.equal(bs.length, 2, "the piston and the pin");
    const cup = bs.sort((a, b) => b.volume - a.volume)[0]!;
    assert.ok(Math.abs(cup.bbox.min[2]!) < 0.01 && Math.abs(cup.bbox.max[2]! - (g.sk + g.ch)) < 0.01, `from the foot (0) to the crown (${(g.sk + g.ch).toFixed(2)}): ${cup.bbox.min[2]} to ${cup.bbox.max[2]}`);
    assert.ok(Math.abs(cup.bbox.max[0]! - cup.bbox.min[0]! - 2 * g.rp) < 0.01 && Math.abs((cup.bbox.max[0]! + cup.bbox.min[0]!) / 2) < 0.01, "centred on the click, as wide as the bore less the room");
  }
});

test("with the engine's numbers the piston maker's piston is the engine's piston (the same volume of the piston and of the pin)", () => {
  for (const eng of [ENGINE_START, ENGINE_PRESETS[1]!.spec, ENGINE_PRESETS[0]!.spec]) {
    const r = engineSteps(eng);
    const g = engineGeometry(eng);
    const inEngine = bodies(r).filter((b) => Math.abs(b.bbox.max[0]! - b.bbox.min[0]! - (g.sk + g.ch)) < 0.05 && Math.abs(b.bbox.max[2]! - b.bbox.min[2]! - 2 * g.rp) < 0.05 || (Math.abs(b.bbox.max[2]! - b.bbox.min[2]! - 2 * g.pg.pinHalf) < 0.05 && Math.abs(b.bbox.max[1]! - b.bbox.min[1]! - eng.pin) < 0.05))
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
test("the Piston model is made from the Models menu: the action, a click and Enter make the piston and its pin", () => {
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
  assert.equal(Object.values(sc.parts).filter((p) => p.kind === "body").length, 2, "the piston and the pin");
  assert.equal(sc.models?.length, 1);
});

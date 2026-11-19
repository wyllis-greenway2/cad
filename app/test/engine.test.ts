// The piston engine model (`dec_engine_model`): the slider crank is exact, the parts are made and fit one another (six bodies, none merged, the pin's and the rod's eyes where the crank pin and the piston pin are), and Play puts the rod and the piston where the formula says.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { worldRef } from "../src/shared/ref.ts";
import { ENGINE_START, engineFootprint, engineProblem, engineGeometry, pistonX, rodAngle, engineDisplacement } from "../src/operation/modelengine.ts";
import type { EngineSpec } from "../src/operation/modelengine.ts";
import { followMatrix } from "../src/interaction/motion.ts";
import { modelBody } from "../src/operation/gearcouple.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 };
type B = { ref: string; id: string; volume: number; bbox: { min: number[]; max: number[] } };
const S = (o: Partial<EngineSpec> = {}): EngineSpec => ({ ...ENGINE_START, ...o });

test("the slider crank: the piston is at r + l at the top and l - r at the bottom, and the rod leans by asin(r sin a / l)", () => {
  const g = engineGeometry(S());
  assert.ok(Math.abs(pistonX(g.r, g.l, 0) - (g.r + g.l)) < 1e-9 && Math.abs(pistonX(g.r, g.l, 180) - (g.l - g.r)) < 1e-9);
  // the rod's length is the distance from the crank pin to the piston pin, at every angle
  for (const a of [0, 37, 90, 133, 180, 250, 301]) {
    const cx = g.r * Math.cos((a * Math.PI) / 180), cy = g.r * Math.sin((a * Math.PI) / 180);
    assert.ok(Math.abs(Math.hypot(pistonX(g.r, g.l, a) - cx, cy) - g.l) < 1e-9, `the rod keeps its length at ${a}`);
    const phi = (rodAngle(g.r, g.l, a) * Math.PI) / 180;
    assert.ok(Math.abs(Math.atan2(-cy, pistonX(g.r, g.l, a) - cx) - phi) < 1e-9, `and leans by the angle at ${a}`);
  }
  assert.ok(Math.abs(engineDisplacement({ bore: 30, stroke: 30 }) - 21.206) < 0.01);
});
test("numbers that make no engine are said", () => {
  assert.equal(engineProblem(S()), null);
  assert.match(engineProblem(S({ ratio: 0.6 })) ?? "", /rod ratio/);
  assert.match(engineProblem(S({ pin: 2 })) ?? "", /the pin is/);
  assert.match(engineProblem(S({ stroke: 8 })) ?? "", /stroke is too short/);
  assert.match(engineProblem(S({ rings: 5 })) ?? "", /rings/);
  assert.match(engineProblem(S({ flywheel: 20 })) ?? "", /flywheel/);
  for (const bore of [24, 40, 60]) assert.equal(engineProblem(S({ rings: 1, bore, stroke: bore, pin: bore * 0.27, shaft: bore * 0.27, wall: bore / 7.5, flywheel: bore * 1.7 })), null, `bore ${bore}`);
});

function made(): ReturnType<typeof createState> {
  let st = { ...createState(createSession(kernel)), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: "model:engine" }, env as never);
  st = { ...st, tool: { ...st.tool!, plane: worldRef("XY"), points: [[0, 0, 0]], cursor: [0, 0, 0] } };
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env as never);
  let n = 0;
  while (st.building && n++ < 60) st = reduce(st, { type: "buildNext" }, env as never);
  assert.equal(st.building, null);
  assert.equal(st.session.message ?? null, null);
  return st;
}
test("the engine is made: six bodies, each where the numbers put it, and Play puts the rod's eyes on the pins", () => {
  const st = made(), sc = scene(st.session), g = engineGeometry(S()), rec = sc.models![0]!;
  const body = (p: string): B => Object.values(sc.parts).find((x) => x.kind === "body" && x.ref === modelBody(sc, rec, p)) as unknown as B;
  const bs = Object.values(sc.parts).filter((p) => p.kind === "body");
  assert.equal(bs.length, 6, "six bodies: none merged");
  const piston = body("Piston"), rod = body("Connecting rod"), crank = body("Crankshaft"), block = body("Block");
  assert.ok(piston.volume > 0 && rod.volume > 0 && block.volume > 0 && crank.volume > 0);
  const f = engineFootprint(S()), ox = -(f.x0 + f.x1) / 2; // (the model stands with the middle of its footprint on the click)
  const xp0 = g.r + g.l + ox;
  assert.ok(Math.abs(piston.bbox.max[0]! - (xp0 + g.ch)) < 0.05 && Math.abs(piston.bbox.min[0]! - (xp0 - g.sk)) < 0.05, `the piston stands from ${piston.bbox.min[0]} to ${piston.bbox.max[0]}`);
  assert.ok(Math.abs(piston.bbox.max[2]! - piston.bbox.min[2]! - 2 * g.rp) < 0.05 && Math.abs((piston.bbox.max[2]! + piston.bbox.min[2]!) / 2 - g.zc) < 0.05, "centred on the cylinder's axis");
  assert.ok(Math.abs(rod.bbox.max[0]! - (xp0 + g.rs)) < 0.05 && Math.abs(rod.bbox.min[0]! - (g.r + ox - g.rb)) < 0.05, "the rod's eyes at the pins");
  // the followers carry the rod and piston: at each angle the rod's two eyes are on the crank pin and on the cylinder's axis
  const rodF = rec.followers.find((f) => f.part === "Connecting rod")!, pistonF = rec.followers.find((f) => f.part === "Piston")!;
  for (const a of [0, 50, 90, 140, 180, 220, 300]) {
    const m = followMatrix({ gear: "", body: "" as never, kind: "turn", ...rodF }, a), mp = followMatrix({ gear: "", body: "" as never, kind: "slide", ...pistonF }, a);
    const at = (M: number[], p: number[]): number[] => [M[0]! * p[0]! + M[4]! * p[1]! + M[8]! * p[2]! + M[12]!, M[1]! * p[0]! + M[5]! * p[1]! + M[9]! * p[2]! + M[13]!];
    const big = at(m, [g.r + ox, 0, g.zc]), small = at(m, [xp0, 0, g.zc]), pin = at(mp, [xp0, 0, g.zc]), th = (a * Math.PI) / 180;
    assert.ok(Math.hypot(big[0]! - (ox + g.r * Math.cos(th)), big[1]! - g.r * Math.sin(th)) < 1e-3, `the big eye is on the crank pin at ${a}`);
    assert.ok(Math.hypot(small[0]! - (ox + pistonX(g.r, g.l, a)), small[1]!) < 2e-3, `the small eye is on the cylinder's axis at ${a}: ${small}`);
    assert.ok(Math.abs(pin[0]! - small[0]!) < 2e-3 && Math.abs(pin[1]!) < 1e-6, `and the piston's pin is with it at ${a}`);
  }
});
import { engineSteps } from "../src/operation/modelengine.ts";
import { asCommand } from "../src/operation/modelparts.ts";
import { run } from "../src/interaction/session.ts";
type Sess = ReturnType<typeof createSession>;
const shared = (s: Sess, a: B, b: B): number => {
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: [a.ref, b.ref], params: { mode: "intersect" } } } as never);
  return /nothing in common/.test(done.message ?? "") ? 0 : (Object.values(scene(done).parts).filter((p) => p.kind === "body") as unknown as B[]).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
};
test("at rest no two parts share any volume (the piston in the bore, the pin in its eyes, the rod in the slot, the crank clear of the piston)", () => {
  const r = engineSteps(S());
  assert.ok(r.ok);
  if (!r.ok) return;
  const c = asCommand(scene(createSession(kernel)), r.value.steps);
  assert.ok(c.ok);
  if (!c.ok) return;
  const s = run(createSession(kernel), c.value);
  assert.equal(s.message ?? null, null);
  const b = (Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as B[]);
  assert.equal(b.length, 6);
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) assert.equal(shared(s, b[i]!, b[j]!), 0, `parts ${i} and ${j} share volume`);
});

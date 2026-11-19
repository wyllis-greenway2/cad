// The gear assemblies that come as models (`dec_gear_models`): each is made in one step, with the bodies it should have, and the pieces that must not touch do not.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { asCommand } from "../src/operation/modelparts.ts";
import type { PartSteps } from "../src/operation/fasteners.ts";
import type { Result } from "../src/shared/result.ts";
import { gearboxSteps, GEARBOX_START, gearboxRatio, gearboxProblem } from "../src/operation/modelgearbox.ts";
import { bearingSteps, BEARING_START, bearingProblem } from "../src/operation/modelbearing.ts";
await kernel.init();
type B = { ref: string; id: string; volume: number; bbox: { min: number[]; max: number[] } };
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as B[];
function make(st: Result<PartSteps>): Session {
  assert.ok(st.ok, st.ok ? "" : st.error);
  if (!st.ok) throw new Error(st.error);
  const c = asCommand(scene(createSession(kernel)), st.value);
  assert.ok(c.ok, c.ok ? "" : c.error);
  if (!c.ok) throw new Error(c.error);
  const s = run(createSession(kernel), c.value);
  assert.equal(s.message ?? null, null);
  return s;
}
/** the volume two bodies share (0 when nothing is shared) */
function shared(s: Session, a: B, b: B): number {
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: [a.ref, b.ref], params: { mode: "intersect" } } } as never);
  return /nothing in common/.test(done.message ?? "") ? 0 : bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
}
const byVolume = (s: Session) => bodies(s).sort((a, b) => a.volume - b.volume);

test("a gearbox: four gears, three rods, a base plate and a top plate, in one step", () => {
  const s = make(gearboxSteps(GEARBOX_START));
  const b = bodies(s);
  assert.equal(b.length, 9);
  assert.equal(gearboxRatio(GEARBOX_START), 9);
  // the rods (the three smallest) are in the gears' bores and the plates' holes without touching them
  const rods = byVolume(s).slice(0, 3), others = byVolume(s).slice(3);
  for (const r of rods) for (const o of others) assert.equal(shared(s, r, o), 0, `a rod and ${o.id} share volume`);
});
test("a gearbox's refusals say why", () => {
  assert.match(gearboxProblem({ ...GEARBOX_START, stages: 5 }) ?? "", /stages are from 1 to 4/);
  assert.match(gearboxProblem({ ...GEARBOX_START, pinion: 6 }) ?? "", /10 or more teeth/);
  assert.match(gearboxProblem({ ...GEARBOX_START, gear: 14 }) ?? "", /reduces/);
  assert.match(gearboxProblem({ ...GEARBOX_START, rod: 20 }) ?? "", /too wide for the pinion/);
  assert.equal(gearboxProblem(GEARBOX_START), null);
});
test("a ball bearing: two races and seven balls, the balls free in their grooves", () => {
  const s = make(bearingSteps(BEARING_START));
  const b = byVolume(s);
  assert.equal(b.length, 9);
  const balls = b.slice(0, 7), races = b.slice(7);
  for (const x of balls) assert.ok(Math.abs(x.volume - (4 / 3) * Math.PI * 2 ** 3) < 2, `a ball's volume ${x.volume}`);
  for (const x of balls) for (const r of races) assert.equal(shared(s, x, r), 0, "a ball touches a race");
  assert.equal(shared(s, races[0]!, races[1]!), 0);
});
test("a ball bearing's refusals say why", () => {
  assert.match(bearingProblem({ ...BEARING_START, balls: 2 }) ?? "", /3 or more balls/);
  assert.match(bearingProblem({ ...BEARING_START, ball: 9 }) ?? "", /too thin/);
  assert.match(bearingProblem({ ...BEARING_START, balls: 20 }) ?? "", /do not fit/);
  assert.equal(bearingProblem(BEARING_START), null);
});

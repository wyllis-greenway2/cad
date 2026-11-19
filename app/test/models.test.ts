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
import { differentialSteps, DIFFERENTIAL_START, differentialProblem } from "../src/operation/modeldifferential.ts";
import { cycloidalSteps, CYCLOIDAL_START, cycloidalProblem, cycloidalRatio, discOutline } from "../src/operation/modelcycloidal.ts";
import { bearingSteps, BEARING_START, bearingProblem } from "../src/operation/modelbearing.ts";
await kernel.init();
type B = { ref: string; id: string; volume: number; bbox: { min: number[]; max: number[] } };
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as B[];
function make(st: Result<PartSteps>): Session {
  if (!st.ok) throw new Error(st.error);
  const c = asCommand(scene(createSession(kernel)), st.value);
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

test("a differential: four bevel gears that mesh, a cage, two caps, two axles, a pin and a drive gear, the rest apart", () => {
  const s = make(differentialSteps(DIFFERENTIAL_START));
  const b = bodies(s);
  assert.equal(b.length, 11);
  const span = (x: B, k: number) => x.bbox.max[k]! - x.bbox.min[k]!;
  const side = b.filter((x) => Math.abs(x.volume - 3415) < 60), spider = b.filter((x) => Math.abs(x.volume - 1523) < 60);
  assert.equal(side.length, 2);
  assert.equal(spider.length, 2);
  const pin = b.find((x) => span(x, 1) > 40 && span(x, 0) < 5 && x.volume < 700)!;
  const axles = b.filter((x) => span(x, 0) > 20 && span(x, 1) < 6);
  assert.equal(axles.length, 2);
  const cage = b.find((x) => x.volume > 13000)!;
  // each spider meshes with each side gear: they share a little (the pair's overlap, a few mm3) and no more
  for (const a of side) for (const c of spider) { const v = shared(s, a, c); assert.ok(v < 8, `a side gear and a spider share ${v} mm3`); }
  // the rest do not touch
  for (const g of [...side, ...spider]) { assert.equal(shared(s, g, cage), 0, "a gear touches the cage"); for (const r of [pin, ...axles]) assert.equal(shared(s, g, r), 0, "a gear touches an axle or the pin"); }
  assert.equal(shared(s, cage, pin), 0);
  assert.equal(shared(s, side[0]!, side[1]!), 0);
  assert.equal(shared(s, spider[0]!, spider[1]!), 0);
});
test("a differential's refusals say why", () => {
  assert.match(differentialProblem({ ...DIFFERENTIAL_START, side: 15 }) ?? "", /even number/);
  assert.match(differentialProblem({ ...DIFFERENTIAL_START, spider: 20 }) ?? "", /bigger ones/);
  assert.match(differentialProblem({ ...DIFFERENTIAL_START, axle: 20 }) ?? "", /too wide/); assert.match(differentialProblem({ ...DIFFERENTIAL_START, pin: 10 }) ?? "", /too wide/);
  assert.match(differentialProblem({ ...DIFFERENTIAL_START, drive: 20 }) ?? "", /too small/);
  assert.equal(differentialProblem(DIFFERENTIAL_START), null);
});

test("a cycloidal drive: a base plate with the ring pins, the disc, the shaft with its eccentric, the output plate with its pins, all apart", () => {
  const s = make(cycloidalSteps(CYCLOIDAL_START));
  const b = bodies(s);
  assert.equal(b.length, 4);
  assert.equal(cycloidalRatio(CYCLOIDAL_START), 9);
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) assert.equal(shared(s, b[i]!, b[j]!), 0, `${b[i]!.id} and ${b[j]!.id} share volume`);
});
test("a cycloidal drive's disc clears every ring pin at every turn of the input (the disc rolls: its middle goes round the shaft, the disc turns the other way 1 / (pins - 1) as fast)", () => {
  const d = CYCLOIDAL_START, N = d.pins, n = 20 * (N - 1);
  const out = discOutline(d, n); // (the disc's own frame, its middle at the origin)
  const dist = (q: [number, number]): number => { // (the distance from a point to the outline, negative inside)
    let best = Infinity, inside = false;
    for (let i = 0; i < n; i++) {
      const [a, c] = [out[i]!, out[(i + 1) % n]!];
      const [dx, dy] = [c[0] - a[0], c[1] - a[1]], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy));
      if ((a[1] > q[1]) !== (c[1] > q[1]) && q[0] < a[0] + ((q[1] - a[1]) / (c[1] - a[1])) * dx) inside = !inside;
    }
    return inside ? -best : best;
  };
  let least = Infinity;
  for (let step = 0; step < 90; step++) {
    const phi = (2 * Math.PI * step) / 90, alpha = -phi / (N - 1);
    const [cx, cy] = [d.ecc * Math.cos(phi), d.ecc * Math.sin(phi)];
    for (let k = 0; k < N; k++) {
      const [px, py] = [d.circle * Math.cos((2 * Math.PI * k) / N) - cx, d.circle * Math.sin((2 * Math.PI * k) / N) - cy];
      const q: [number, number] = [px * Math.cos(-alpha) - py * Math.sin(-alpha), px * Math.sin(-alpha) + py * Math.cos(-alpha)]; // (the pin's middle in the disc's frame)
      least = Math.min(least, dist(q) - d.pin / 2);
    }
  }
  assert.ok(least > 0, `a pin goes into the disc by ${-least} mm`);
  assert.ok(least < d.play + 0.05, `the disc never comes near a pin: the least room is ${least} mm`); // (the pins do touch the disc's outline, less the room, as it rolls)
});
test("a cycloidal drive's refusals say why", () => {
  assert.match(cycloidalProblem({ ...CYCLOIDAL_START, ecc: 3 }) ?? "", /eccentricity is too big/);
  assert.match(cycloidalProblem({ ...CYCLOIDAL_START, ecc: 2.45 }) ?? "", /too big for the disc's lobes/);
  assert.match(cycloidalProblem({ ...CYCLOIDAL_START, pins: 3 }) ?? "", /5 to 60/);
  assert.match(cycloidalProblem({ ...CYCLOIDAL_START, outCircle: 20 }) ?? "", /edge/);
  assert.match(cycloidalProblem({ ...CYCLOIDAL_START, cam: 3 }) ?? "", /too small for the shaft/);
  assert.equal(cycloidalProblem(CYCLOIDAL_START), null);
});

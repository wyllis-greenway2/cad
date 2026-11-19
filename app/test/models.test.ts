// The gear assemblies that come as models (`dec_gear_models`): each is made in one step, with the bodies it should have, and the pieces that must not touch do not.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { asCommand } from "../src/operation/modelparts.ts";
import type { ModelBuild } from "../src/operation/modelparts.ts";
import type { Result } from "../src/shared/result.ts";
import { gearboxSteps, GEARBOX_START, gearboxRatio, gearboxProblem } from "../src/operation/modelgearbox.ts";
import { differentialSteps, DIFFERENTIAL_START, differentialProblem } from "../src/operation/modeldifferential.ts";
import { cycloidalRim } from "../src/operation/modelcycloidal.ts";
import { cycloidalSteps, CYCLOIDAL_START, cycloidalProblem, cycloidalRatio, discOutline } from "../src/operation/modelcycloidal.ts";
import { BEARINGS, bearingRow, bearingShape, ballsOf } from "../src/operation/bearingdata.ts";
import { modelBuild, modelProblem, modelNumbers } from "../src/operation/modelkinds.ts";
await kernel.init();
type B = { ref: string; id: string; volume: number; bbox: { min: number[]; max: number[] } };
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as B[];
function make(st: Result<ModelBuild>): Session {
  if (!st.ok) throw new Error(st.error);
  const c = asCommand(scene(createSession(kernel)), st.value.steps);
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

test("the catalogue bearings: every number in the list makes a bearing; the dimensions are the two sources' (spot checks), the balls NSK's where it gives them", () => {
  assert.equal(BEARINGS.length, 22);
  for (const n of [623, 608, 6000, 6203, 6206]) assert.ok(bearingRow(n), `${n} is listed`);
  assert.deepEqual([bearingRow(608)!.d, bearingRow(608)!.D, bearingRow(608)!.B], [8, 22, 7]);
  assert.deepEqual([bearingRow(6203)!.d, bearingRow(6203)!.D, bearingRow(6203)!.B, ballsOf(bearingRow(6203)!).balls, ballsOf(bearingRow(6203)!).ball], [17, 40, 12, 8, 6.747]);
  assert.equal(ballsOf(bearingRow(608)!).typical, true, "no catalogue read gives the 608's balls");
  assert.equal(bearingRow(6007), undefined, "6007 is in one source only");
  for (const b of BEARINGS) { const sh = bearingShape(b, 0.02); assert.ok(sh.ok, `${b.number}: ${sh.ok ? "" : sh.error}`); }
  assert.match(modelProblem("ballbearing", modelNumbers("ballbearing", { number: 6007 })) ?? "", /not a bearing in the list/);
});
test("a catalogue bearing is made to its dimensions, with the rings held apart by their balls and the balls apart from the rings", () => {
  for (const [n, d, D, B] of [[608, 8, 22, 7], [6203, 17, 40, 12]] as const) {
    const st = modelBuild("ballbearing", { ...modelNumbers("ballbearing", { number: n }), detail: 1 }, { at: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] });
    const s = make(st);
    const b = byVolume(s), balls = b.filter((x) => x.volume < 400 && Math.abs(x.bbox.max[2]! - x.bbox.min[2]!) < B * 0.9), rings = b.filter((x) => !balls.includes(x));
    assert.equal(rings.length, 2, `${n}: two rings`);
    assert.ok(balls.length >= 7, `${n}: ${balls.length} balls`);
    const box = (k: number) => Math.max(...rings.map((x) => x.bbox.max[k]!)) - Math.min(...rings.map((x) => x.bbox.min[k]!));
    assert.ok(Math.abs(box(0) - D) < 0.05 && Math.abs(box(2) - B) < 0.05, `${n}: ${D} across and ${B} wide: ${box(0)} ${box(2)}`);
    for (const x of balls.slice(0, 3)) for (const r of rings) assert.equal(shared(s, x, r), 0, `${n}: a ball touches a ring`);
    assert.equal(shared(s, rings[0]!, rings[1]!), 0);
    void d;
  }
});

const π = Math.PI;
type Body = ReturnType<typeof bodies>[number];
test("a simple bearing is two plain rings (the outer ring's hole is wider than the inner ring), a custom one takes its bore, outside diameter, width and inner ring's diameter from the numbers", () => {
  const r = (b: Body) => [b.bbox.max[0]! - b.bbox.min[0]!, b.bbox.max[2]! - b.bbox.min[2]!];
  const at = { at: [0, 0, 0] as [number, number, number], ex: [1, 0, 0] as [number, number, number], ey: [0, 1, 0] as [number, number, number], ez: [0, 0, 1] as [number, number, number] };
  const simple = make(modelBuild("ballbearing", modelNumbers("ballbearing", { number: 6203 }), at));
  const b = byVolume(simple);
  assert.equal(b.length, 2, "an inner ring and an outer ring");
  const [inner, outer] = [b[0]!, b[1]!];
  assert.ok(Math.abs(r(outer)[0]! - 40) < 0.05 && Math.abs(r(outer)[1]! - 12) < 0.05, `outer ${r(outer)}`);
  assert.ok(r(inner)[0]! < 40 && r(inner)[0]! > 17 && Math.abs(r(inner)[1]! - 12) < 0.05, `inner ${r(inner)}`);
  assert.equal(shared(simple, inner, outer), 0);
  // a bearing of your own: 10 x 30 x 9 with the inner ring 18 across
  const mine = modelNumbers("ballbearing", { own: 1, bore: 10, outer: 30, width: 9, ring: 18 });
  assert.equal(modelProblem("ballbearing", mine), null);
  const m = byVolume(make(modelBuild("ballbearing", mine, at)));
  assert.equal(m.length, 2);
  assert.ok(Math.abs(r(m[0]!)[0]! - 18) < 0.05 && Math.abs(r(m[1]!)[0]! - 30) < 0.05 && Math.abs(r(m[1]!)[1]! - 9) < 0.05, `${r(m[0]!)} ${r(m[1]!)}`);
  // the same in detail: two rings and the balls
  const det = byVolume(make(modelBuild("ballbearing", { ...mine, detail: 1 }, at)));
  assert.ok(det.length > 5, `${det.length} bodies`);
  assert.match(modelProblem("ballbearing", modelNumbers("ballbearing", { own: 1, bore: 10, outer: 8, width: 9 })) ?? "", /more than the bore/);
  assert.match(modelProblem("ballbearing", modelNumbers("ballbearing", { own: 1, bore: 10, outer: 30, width: 9, ring: 9 })) ?? "", /more than the bore/);
});
test("a cycloidal drive has no markers: its plates have four mounting holes each and the shaft a flat above the output plate", () => {
  const s = make(cycloidalSteps(CYCLOIDAL_START));
  const b = bodies(s);
  assert.equal(b.length, 4);
  const q = CYCLOIDAL_START, rim = cycloidalRim(q), sh = q.shaft / 2 + q.room, T = q.plate;
  const plate = π * (rim * rim - sh * sh) * T - 4 * π * 1.6 * 1.6 * T + q.pins * π * (q.pin / 2) ** 2 * (q.plate + q.gap + q.disc - T);
  const base = b.find((x) => Math.abs(x.volume - plate) < 0.01 * plate);
  assert.ok(base, `the base plate with its holes and pins has the volume ${plate.toFixed(0)}: ${b.map((x) => x.volume.toFixed(0))}`);
  const out = b.find((x) => x !== base && Math.abs(x.volume - (π * (rim * rim - sh * sh) * T - 4 * π * 1.6 * 1.6 * T + q.outPins * π * (q.outPin / 2) ** 2 * (q.disc + q.gap))) < 0.01 * plate);
  assert.ok(out, "the output plate has its four holes");
  const shaft = b.find((x) => x.bbox.max[2]! > rim * 0 + 20 && x !== out && x !== base && x.volume < 4000)!;
  assert.ok(shaft, "the shaft");
  assert.ok(shaft.bbox.max[2]! - shaft.bbox.min[2]! > 20);
});

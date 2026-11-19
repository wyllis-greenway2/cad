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
  assert.ok(half.bore === 34 && Math.abs(half.pin! - 9) < 0.06, `a typed bore scales the rest: ${JSON.stringify(half)}`);
  assert.equal(engineProblem(half as never), null, "and the numbers not typed are moved only as far as the engine needs to be made");
  assert.ok(half.stroke! >= 22.5 - 0.06, `(half the stroke, 22.5 mm, is too short for the shaft and crank pin at that size, so the box lengthens it: ${half.stroke})`);
  const own = modelNumbers("engine", { preset: 0 });
  assert.ok(own.bore === ENGINE_START.bore && own.pin === ENGINE_START.pin, "your own is the usual start");
});

test("the ring belt (`dec_piston_belt`): Honda's ring heights and the typed side room, the assumed lands, top land and depth", () => {
  const eg = (s: typeof ENGINE_START) => engineGeometry(s).belt;
  for (const p of ENGINE_PRESETS) {
    const bb = eg(p.spec), gs = bb.grooves;
    assert.equal(gs.length, 3, `${p.name}: two compression grooves and an oil ring groove`);
    assert.ok(Math.abs(gs[0]!.height - (1.5 + p.spec.ringSide)) < 1e-9 && Math.abs(gs[1]!.height - (1.5 + p.spec.ringSide)) < 1e-9, `${p.name}: the compression grooves are Honda's 1.5 mm ring and its side room`);
    assert.ok(Math.abs(gs[2]!.height - (2.5 + p.spec.ringSide)) < 1e-9 && gs[2]!.oil, `${p.name}: and the oil groove Honda's 2.5 mm`);
    assert.ok(Math.abs(gs[0]!.top - 0.07 * p.spec.bore) < 1e-9, `${p.name}: the top land is 0.07 of the bore`);
    for (let k = 1; k < gs.length; k++) assert.ok(Math.abs(gs[k]!.top - (gs[k - 1]!.top + gs[k - 1]!.height) - 1.6 * 1.5) < 1e-9, `${p.name}: the land between rings is 1.6 times a compression ring's height`);
    assert.ok(Math.abs(bb.depth - (p.spec.bore / 22 + 0.45)) < 1e-9 && Math.abs(bb.length - (gs[2]!.top + gs[2]!.height)) < 1e-9, `${p.name}: the depth and the belt's length`);
  }
  const small = eg(ENGINE_START);
  assert.ok(Math.abs(small.grooves[0]!.height - (1.0 + ENGINE_START.ringSide)) < 1e-9 && Math.abs(small.grooves[2]!.height - (2.0 + ENGINE_START.ringSide)) < 1e-9, "the small usual engine takes the floors");
  assert.ok(Math.abs(eg({ ...ENGINE_START, ringSide: 0.04 }).grooves[0]!.height - 1.04) < 1e-9, "a side room typed is used");
  const bare = eg({ ...ENGINE_START, rings: 0, oil: 0 });
  assert.ok(bare.grooves.length === 0 && Math.abs(bare.length - 0.07 * 30) < 1e-9, "no grooves: the belt is the top land");
  assert.equal(eg({ ...ENGINE_START, rings: 3, oil: 0 }).grooves.length, 3);
});

test("the pin height is the stack: the belt, then the larger of the pin's radius and 0.05 of the bore, and what the rod's small eye and its slot need", () => {
  for (const s of [ENGINE_START, ...ENGINE_PRESETS.map((p) => p.spec)]) {
    const g = engineGeometry(s);
    assert.ok(Math.abs(g.ch - (g.belt.length + Math.max(s.pin / 2 + 0.05 * s.bore, g.rs + 2.5))) < 1e-9, `bore ${s.bore}`);
    assert.ok(g.ch - g.belt.length >= g.rs + 2.5 - 1e-9, "the web above the rod's slot is always there");
  }
  const gx = engineGeometry(ENGINE_PRESETS[1]!.spec);
  assert.ok(gx.ch / 68 > 0.3 && gx.ch / 68 < 0.44, `the GX160's pin height ${gx.ch.toFixed(1)} mm = ${(gx.ch / 68).toFixed(3)} of the bore stays between a motorcycle catalogue's 0.30 and NACA 817's 0.44`);
  assert.equal(engineProblem({ ...ENGINE_START, rings: 0, oil: 0 }), null, "no rings is an engine");
  assert.match(engineProblem({ ...ENGINE_START, oil: 2 }) ?? "", /oil ring groove/);
  assert.match(engineProblem({ ...ENGINE_START, topLand: 0.5 }) ?? "", /land above the top ring groove/);
});

test("two kinds of typed room (`dec_clearance_defaults`): the piston's fits default to Honda's nominal middles, and `room` is the moving parts' only", () => {
  const f = pistonFit(30);
  assert.ok(ENGINE_START.skirtFit === f.skirtClearance && ENGINE_START.pinFit === f.pinFit && ENGINE_START.ringSide === f.ringSide && ENGINE_START.room === 0.15, "the defaults");
  assert.ok(within(ENGINE_START.skirtFit, COMMON.skirtClearance) && within(ENGINE_START.pinFit, COMMON.pinFit) && within(ENGINE_START.ringSide, COMMON.ringSide), "inside Honda's ranges");
  for (const p of ENGINE_PRESETS) assert.ok(p.spec.skirtFit === f.skirtClearance && p.spec.pinFit === f.pinFit && p.spec.ringSide === f.ringSide, `${p.name} has the same fits`);
  const g0 = engineGeometry(ENGINE_START);
  assert.ok(Math.abs(g0.rp - (ENGINE_START.bore / 2 - ENGINE_START.skirtFit / 2)) < 1e-12, "the piston stands half the fit inside the bore");
  assert.equal(engineGeometry({ ...ENGINE_START, room: 0.4 }).rp, g0.rp, "the room of the moving parts does not move the piston's radius");
  assert.ok(Math.abs(engineGeometry({ ...ENGINE_START, skirtFit: 0.05 }).rp - (15 - 0.025)) < 1e-12, "the piston's fit does");
  assert.match(engineProblem({ ...ENGINE_START, skirtFit: 0 }) ?? "", /piston's room in the bore/);
  assert.match(engineProblem({ ...ENGINE_START, pinFit: 0 }) ?? "", /pin's room/);
  assert.match(engineProblem({ ...ENGINE_START, ringSide: 2 }) ?? "", /ring's room/);
  const typed = modelNumbers("engine", { skirtFit: 0.05 });
  assert.ok(typed.skirtFit === 0.05 && typed.bore === ENGINE_START.bore && typed.room === 0.15, "a fit typed moves nothing else: the fits are not lengths of the engine");
});

type B = { ref: string; volume: number };
const shared = (s: ReturnType<typeof createSession>, a: B, b: B): number => {
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: [a.ref, b.ref], params: { mode: "intersect" } } } as never);
  return /nothing in common/.test(done.message ?? "") ? 0 : (Object.values(scene(done).parts).filter((p) => p.kind === "body") as unknown as B[]).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
};
for (const p of ENGINE_PRESETS) {
  test(`${p.name} is built at rest: seven bodies and no two share any volume`, () => {
    const r = engineSteps(p.spec);
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (!r.ok) return;
    const c = asCommand(scene(createSession(kernel)), r.value.steps);
    assert.ok(c.ok);
    if (!c.ok) return;
    const s = run(createSession(kernel), c.value);
    assert.equal(s.message ?? null, null);
    const b = Object.values(scene(s).parts).filter((x) => x.kind === "body") as unknown as B[];
    assert.equal(b.length, 7);
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) assert.equal(shared(s, b[i]!, b[j]!), 0, `parts ${i} and ${j} share volume`);
  });
}

// The hollow piston (`dec_piston_hollow`): the kernel's volume of the piston against one worked out here from the numbers (the outer cylinder, less the grooves and the cavity, plus the two bosses, less the pin's hole).
const simpson = (f: (x: number) => number, a: number, b: number, n = 2000): number => { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return (s * h) / 3; };
function pistonVolume(s: typeof ENGINE_START, rm = s.room): number {
  const g = engineGeometry(s), sh = g.shell, H = g.sk + g.ch, rp = g.rp, bt = g.belt;
  const wideL = H - Math.max(bt.length, sh.crown), topL = H - sh.crown, zoff = g.w / 2 + rm, rho = s.pin / 2 + s.pinFit / 2;
  let v = Math.PI * rp * rp * H;
  for (const gr of bt.grooves) v -= Math.PI * (rp * rp - (rp - bt.depth) ** 2) * gr.height;
  v -= Math.PI * sh.inner ** 2 * wideL + Math.PI * sh.innerBelt ** 2 * (topL - wideL);
  const reach = (outer: number, inside: number): number => Math.min(sh.boss, 0.95 * Math.sqrt(Math.max(0, outer * outer - inside * inside))), footB = g.sk - sh.boss;
  const yw = reach(rp, sh.inner), yn = reach(rp - bt.depth, sh.innerBelt);
  const area = (R: number, yb: number): number => simpson((y) => Math.max(0, Math.sqrt(Math.max(0, R * R - y * y)) - zoff), -yb, yb); // (a boss's cross section inside a cavity of radius R, as wide as yb)
  v += 2 * (area(sh.inner, yw) * (wideL - footB) + area(sh.innerBelt, yn) * Math.max(0, topL - wideL));
  v -= 2 * simpson((y) => 2 * Math.sqrt(Math.max(0, rho * rho - y * y)) * Math.max(0, Math.sqrt(Math.max(0, sh.inner * sh.inner - y * y)) - zoff), -rho, rho); // (the pin's hole through the two bosses, whose far face is the cavity's curved wall)
  v -= 2 * simpson((y) => 2 * Math.sqrt(Math.max(0, rho * rho - y * y)) * (Math.sqrt(rp * rp - y * y) - Math.sqrt(Math.max(0, sh.inner * sh.inner - y * y))), -rho, rho); // (and through the two walls)
  return v;
}
for (const [name, spec] of [["the usual engine", ENGINE_START], ["Honda GX160", ENGINE_PRESETS[1]!.spec], ["Honda GX120", ENGINE_PRESETS[0]!.spec]] as const) {
  test(`${name}: the piston is hollow, with a crown and a wall of the numbers' thickness (its volume is the worked-out one)`, () => {
    const r = engineSteps(spec);
    assert.ok(r.ok);
    if (!r.ok) return;
    const c = asCommand(scene(createSession(kernel)), r.value.steps);
    assert.ok(c.ok);
    if (!c.ok) return;
    const s = run(createSession(kernel), c.value);
    assert.equal(s.message ?? null, null);
    const g = engineGeometry(spec), bodies = Object.values(scene(s).parts).filter((x) => x.kind === "body") as unknown as { volume: number; bbox: { min: number[]; max: number[] } }[];
    const piston = bodies.find((b) => Math.abs(b.bbox.max[0]! - b.bbox.min[0]! - (g.sk + g.ch)) < 0.05 && Math.abs(b.bbox.max[2]! - b.bbox.min[2]! - 2 * g.rp) < 0.05)!;
    assert.ok(piston, "the piston is found by its size");
    const solid = Math.PI * g.rp * g.rp * (g.sk + g.ch), expected = pistonVolume(spec);
    assert.ok(piston.volume < 0.6 * solid, `hollow: ${(piston.volume / solid).toFixed(3)} of a solid cylinder`);
    assert.ok(Math.abs(piston.volume - expected) / expected < 0.003, `the kernel's ${piston.volume.toFixed(1)} mm3 against the worked out ${expected.toFixed(1)} mm3`);
  });
}
test("the shell: the wall is half the crown, the cavity is narrower under the grooves, and a too thick wall or crown is refused", () => {
  const g = engineGeometry(ENGINE_START), sh = g.shell;
  assert.ok(Math.abs(sh.wall - 0.5 * sh.crown) < 1e-9 && Math.abs(sh.crown - 0.08 * 30) < 1e-9, "a wall half the crown, the crown 0.08 of the bore");
  assert.ok(Math.abs(sh.inner - (g.rp - sh.wall)) < 1e-9 && Math.abs(sh.innerBelt - (g.rp - g.belt.depth - sh.wall)) < 1e-9 && sh.innerBelt < sh.inner, "the cavity's radii");
  assert.ok(g.ch >= sh.crown + g.rs + 2.5 - 1e-9, "the cavity under the crown holds the rod's eye");
  assert.match(engineProblem({ ...ENGINE_START, pin: 12, ratio: 0.45, skirtWall: 0.15, flywheel: 90, stroke: 40 }) ?? "", /swings too far for the inside of the piston/, "a thick wall and a big pin leave the rod no room");
  assert.match(engineProblem({ ...ENGINE_START, crown: 0.5 }) ?? "", /crown/);
  assert.match(engineProblem({ ...ENGINE_START, skirtWall: 0 }) ?? "", /wall/);
});

// The oil drain holes (`dec_piston_drain`): each hole takes out about pi r^2 times the wall between the groove's floor and the cavity.
function pistonKernelVolume(spec: typeof ENGINE_START): number {
  const r = engineSteps(spec);
  assert.ok(r.ok);
  if (!r.ok) return 0;
  const c = asCommand(scene(createSession(kernel)), r.value.steps);
  assert.ok(c.ok);
  if (!c.ok) return 0;
  const s = run(createSession(kernel), c.value);
  assert.equal(s.message ?? null, null);
  const g = engineGeometry(spec), bodies = Object.values(scene(s).parts).filter((x) => x.kind === "body") as unknown as { volume: number; bbox: { min: number[]; max: number[] } }[];
  return bodies.find((b) => Math.abs(b.bbox.max[0]! - b.bbox.min[0]! - (g.sk + g.ch)) < 0.05 && Math.abs(b.bbox.max[2]! - b.bbox.min[2]! - 2 * g.rp) < 0.05)!.volume;
}
for (const [name, spec] of [["the usual engine", ENGINE_START], ["Honda GX160", ENGINE_PRESETS[1]!.spec]] as const) {
  test(`${name}: the oil drain holes take out their own volume, two sides of 0 to 4 holes, none without an oil ring groove`, () => {
    const g = engineGeometry(spec), gr = g.belt.grooves.find((x) => x.oil)!, rh = Math.min(0.03 * spec.bore, 0.8 * gr.height) / 2, wall = g.rp - g.belt.depth - g.shell.innerBelt;
    const v0 = pistonKernelVolume({ ...spec, drain: 0 });
    for (const n of [1, 2, 4]) {
      const taken = v0 - pistonKernelVolume({ ...spec, drain: n }), expect = 2 * n * Math.PI * rh * rh * wall;
      assert.ok(Math.abs(taken - expect) / expect < 0.15, `${n} a side: the kernel took out ${taken.toFixed(2)} mm3, the holes' ${expect.toFixed(2)} mm3`);
    }
    assert.equal(pistonKernelVolume({ ...spec, oil: 0, drain: 0 }), pistonKernelVolume({ ...spec, oil: 0, drain: 3 }), "no oil ring groove: no holes");
  });
}
test("the oil drain holes are 0 to 4 a side, whole", () => {
  assert.equal(engineProblem({ ...ENGINE_START, drain: 0 }), null);
  assert.match(engineProblem({ ...ENGINE_START, drain: 5 }) ?? "", /drain holes/);
  assert.match(engineProblem({ ...ENGINE_START, drain: 1.5 }) ?? "", /drain holes/);
});

// The connecting rod (`dec_rod_design`): the kernel's volume of the rod and of the cap against volumes worked out from the numbers (areas by integration), the cap a body of its own, and the glue.
type Iv = [number, number];
const measure = (iv: Iv[]): number => { const s = iv.filter((v) => v[1] > v[0]).sort((a, b) => a[0] - b[0]); let m = 0, end = -Infinity; for (const [a, b] of s) { if (a > end) { m += b - a; end = b; } else if (b > end) { m += b - end; end = b; } } return m; };
const annulusAt = (dx: number, ri: number, ro: number): Iv[] => { const o = ro * ro - dx * dx, i = ri * ri - dx * dx; if (o <= 0) return []; const yo = Math.sqrt(o); return i <= 0 ? [[-yo, yo]] : [[-yo, -Math.sqrt(i)], [Math.sqrt(i), yo]]; };
function rodVolumes(s: typeof ENGINE_START): { rod: number; cap: number } {
  const g = engineGeometry(s), rd = g.rod, rm = s.room, e = rm / 2, ri = g.cp / 2 + rm, xp0 = g.r + g.l;
  const hb = 0.6 * g.rb, hs = 0.6 * g.rs, xa = g.r + g.rb - 1, xb = xp0 - g.rs + 1, at = (x: number): number => hb + ((hs - hb) * (x - g.r)) / g.l;
  const lugY0 = ri + 0.3, lugY1 = g.rb + rd.bolt + 0.6, rin = s.pin / 2 + rm;
  const area = (sign: 1 | -1): number => {
    const x0 = sign > 0 ? g.r + e : g.r - Math.max(g.rb, rd.lug), x1 = sign > 0 ? xp0 + g.rs : g.r - e;
    return simpson((x) => {
      const iv: Iv[] = [];
      const d = x - g.r;
      if (sign * d >= e) iv.push(...annulusAt(d, ri, g.rb)); // (the half ring: beyond its parting face)
      if (sign * d >= e && sign * d <= rd.lug) iv.push([lugY0, lugY1], [-lugY1, -lugY0]);
      if (sign > 0 && x >= xa && x <= xb) iv.push([-at(x), at(x)]);
      if (sign > 0) iv.push(...annulusAt(x - xp0, rin, g.rs));
      return measure(iv);
    }, x0, x1, 40000);
  };
  const pocket = simpson((x) => 2 * (at(x) - rd.flange), g.r + g.rb + 1.5, xp0 - g.rs - 1.5, 4000), deep = (g.w - rd.web) / 2;
  const bolts = 2 * Math.PI * (rd.bolt / 2) ** 2 * (rd.lug - e);
  return { rod: g.w * area(1) - 2 * deep * pocket - bolts, cap: g.w * area(-1) - bolts };
}
for (const [name, spec] of [["the usual engine", ENGINE_START], ["Honda GX160", ENGINE_PRESETS[1]!.spec]] as const) {
  test(`${name}: the rod is an I-beam with a split big end: its volume and its cap's are the worked-out ones, and the cap is a body of its own`, () => {
    const r = engineSteps(spec);
    assert.ok(r.ok);
    if (!r.ok) return;
    const c = asCommand(scene(createSession(kernel)), r.value.steps);
    assert.ok(c.ok);
    if (!c.ok) return;
    const s = run(createSession(kernel), c.value);
    assert.equal(s.message ?? null, null);
    const bodies = Object.values(scene(s).parts).filter((x) => x.kind === "body") as unknown as { volume: number; bbox: { min: number[]; max: number[] } }[];
    const g = engineGeometry(spec), want = rodVolumes(spec);
    const thick = (b: { bbox: { min: number[]; max: number[] } }): number => b.bbox.max[2]! - b.bbox.min[2]!;
    const mine = bodies.filter((b) => Math.abs(thick(b) - g.w) < 0.05 && Math.abs(b.bbox.min[2]! - (g.zc - g.w / 2)) < 0.05).sort((a, b) => b.volume - a.volume); // (the flywheel is as thick but not at the rod's height)
    const rodBody = mine.find((b) => b.bbox.max[0]! - b.bbox.min[0]! > g.l * 0.9)!, capBody = mine.find((b) => b !== rodBody && b.bbox.max[0]! - b.bbox.min[0]! < g.rb + 1)!;
    assert.ok(rodBody && capBody, "the rod and the cap are two bodies of the rod's thickness");
    assert.ok(Math.abs(rodBody.volume - want.rod) / want.rod < 0.005, `the rod: kernel ${rodBody.volume.toFixed(1)} mm3, worked out ${want.rod.toFixed(1)} mm3`);
    assert.ok(Math.abs(capBody.volume - want.cap) / want.cap < 0.005, `the cap: kernel ${capBody.volume.toFixed(1)} mm3, worked out ${want.cap.toFixed(1)} mm3`);
    const rd = g.rod;
    assert.ok(rd.web === 0.3 * g.w && rd.flange >= 0.8 && rd.bolt >= 2 && rd.lug === 1.5 * rd.bolt, "the assumed rod numbers");
  });
}
test("the cap goes with the rod in Play", async () => {
  const { playPlan } = await import("../src/operation/modelplay.ts");
  const plan = playPlan("engine", ENGINE_START as never, { at: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] });
  assert.ok(plan.glue.some((gl: string[]) => gl.includes("Connecting rod") && gl.includes("Rod cap")), "glued");
});

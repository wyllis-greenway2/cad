// The root of an involute gear as a rack cutter makes it: fillet and undercut (`in_592`).
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearOutline, GearSpec } from "../src/operation/gear.ts";
import { gearRoot } from "../src/operation/gearroot.ts";

type P = [number, number];
const must = (s: GearSpec): GearOutline => { const r = gearOutline(s); assert.ok(r.ok, r.ok ? "" : r.error); return (r as { value: GearOutline }).value; };
/** the outline's sides as polylines (each arc sampled) */
function sample(g: GearOutline, per = 24): P[] {
  const out: P[] = [];
  const n = g.points.length;
  for (let i = 0; i < n; i++) {
    const [a, b] = [g.points[i]!, g.points[(i + 1) % n]!], bu = g.bulges[i] ?? 0;
    out.push(a);
    if (!bu) continue;
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]], ch = Math.hypot(dx, dy);
    const theta = 4 * Math.atan(2 * Math.abs(bu)), R = ch / (2 * Math.sin(theta / 2));
    const sgn = bu > 0 ? 1 : -1;
    const mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const h = R * Math.cos(theta / 2) * (Math.abs(theta) > Math.PI ? -1 : 1);
    const c: P = [mid[0] - (sgn * dy / ch) * h, mid[1] + (sgn * dx / ch) * h];
    const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
    for (let k = 1; k < per; k++) { const t = a0 + sgn * theta * (k / per); out.push([c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)]); }
  }
  return out;
}
const area = (p: P[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]!; return s + (a[0] * b[1] - b[0] * a[1]) / 2; }, 0);
function selfCrossings(p: P[]): number {
  let n = 0;
  const seg = (i: number): [P, P] => [p[i]!, p[(i + 1) % p.length]!];
  const ccw = (a: P, b: P, c: P) => (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < p.length; i++) for (let j = i + 2; j < p.length; j++) {
    if (i === 0 && j === p.length - 1) continue;
    const [a, b] = seg(i), [c, d] = seg(j);
    if (ccw(a, b, c) * ccw(a, b, d) < 0 && ccw(c, d, a) * ccw(c, d, b) < 0) n++;
  }
  return n;
}

test("with a fillet the root is the cutter's: the outline is one simple loop, the root circle is still the one cut by the dedendum, the flank is the same involute", () => {
  for (const [z, f] of [[30, 0.38], [20, 0.3], [14, 0.38], [10, 0.38], [8, 0.2], [12, 0.01]] as [number, number][]) {
    const g = must({ teeth: z, module: 2, fillet: f });
    const p = sample(g);
    assert.ok(area(p) > 0, `z ${z} counter-clockwise`);
    assert.equal(selfCrossings(p), 0, `z ${z}: no loops`);
    const rs = p.map((q) => Math.hypot(q[0], q[1]));
    assert.ok(Math.abs(Math.min(...rs) - g.rootRadius) < 0.05, `z ${z}: lowest ${Math.min(...rs)} against ${g.rootRadius}`);
    assert.ok(Math.abs(Math.max(...rs) - g.tipRadius) < 1e-6);
  }
});

test("a fillet gives the tooth more root than the plain circle: more material, and it grows with the fillet", () => {
  const plain = area(sample(must({ teeth: 24, module: 2 })));
  const a = area(sample(must({ teeth: 24, module: 2, fillet: 0.2 })));
  const b = area(sample(must({ teeth: 24, module: 2, fillet: 0.4 })));
  assert.ok(plain < a && a < b, `${plain} ${a} ${b}`);
  assert.ok((b - plain) / plain < 0.05, "a few percent at most");
});

test("without undercut the flank is the same involute with or without the fillet: the tooth is as thick at the pitch circle, and at the base circle's neighbourhood", () => {
  const [a, b] = [must({ teeth: 40, module: 2 }), must({ teeth: 40, module: 2, fillet: 0.38 })];
  /** the angles at which the outline crosses this radius, for the tooth on the x axis */
  const crossings = (g: GearOutline, r: number) => { const p = sample(g, 12), out: number[] = []; for (let i = 0; i < p.length; i++) { const [u, v] = [p[i]!, p[(i + 1) % p.length]!], [ru, rv] = [Math.hypot(u[0], u[1]), Math.hypot(v[0], v[1])]; if ((ru - r) * (rv - r) < 0) { const f = (r - ru) / (rv - ru); const ang = Math.atan2(u[1] + f * (v[1] - u[1]), u[0] + f * (v[0] - u[0])); if (Math.abs(ang) < Math.PI / 40) out.push(ang); } } return out.sort((x, y) => x - y); };
  for (const r of [a.pitchRadius, a.pitchRadius + 1, a.pitchRadius - 1.5]) {
    const [ca, cb] = [crossings(a, r), crossings(b, r)];
    assert.equal(ca.length, 2);
    cb.forEach((x, i) => assert.ok(Math.abs(x - ca[i]!) < 2e-3, `at radius ${r}: ${x} against ${ca[i]}`)); // (the arcs are within a few thousandths of a millimetre of the involute)
  }
});

test("few teeth are undercut: the fillet of the cutter cuts into the involute, with a note, and the tooth is thinner at the root than without cutting", () => {
  const g = must({ teeth: 9, module: 2, fillet: 0.2 });
  assert.ok(g.warnings.some((w) => /undercut/.test(w)), g.warnings.join("|"));
  const roomy = must({ teeth: 40, module: 2, fillet: 0.2 });
  assert.ok(!roomy.warnings.some((w) => /undercut/.test(w)));
  const r = gearRoot({ m: 2, z: 9, alpha: Math.PI / 9, x: 0, c: 0.25, backlash: 0, rho: 0.4 });
  assert.ok(r.ok && r.value.undercut && r.value.rLo > 8 * Math.cos(Math.PI / 9) * 0.99);
});

test("fillet limits: below zero, as big as the cutter's tip, or so big the teeth meet are refused with the reason", () => {
  const err = (s: GearSpec) => { const r = gearOutline(s); return r.ok ? "" : r.error; };
  assert.match(err({ teeth: 20, module: 2, fillet: -1 }), /below zero/);
  assert.match(err({ teeth: 20, module: 2, fillet: 1.25 }), /fillet must be from 0 to/);
  assert.equal(err({ teeth: 20, module: 2, fillet: 0.38 }), "");
  assert.equal(err({ teeth: 20, module: 2, fillet: 0 }), "");
});

import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
await kernel.init();

test("a filleted gear extrudes to its outline's area times the thickness; adding the fillet to an extruded gear changes the body (the sides it has now are not the ones it had)", () => {
  const spec: GearSpec = { teeth: 16, module: 2, fillet: 0.38 };
  const g = must(spec);
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  assert.ok(!s.message, s.message ?? "");
  const lines = gearRefs({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec }).lines;
  const op = startOp(scene(s), [loopFaceRef(lines) as never], "extrude");
  assert.ok(op.ok);
  s = runOp(s, { ...(op as { op: Op }).op, value: 5 })!.session;
  const vol = (x: typeof s) => Object.values(scene(x).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
  const want = area(sample(g, 64)) * 5;
  assert.ok(Math.abs(vol(s) - want) < 0.003 * want, `${vol(s)} against ${want}`);
  const plain = run(s, { type: "setGear", id: "g_001", spec: { teeth: 16, module: 2 } });
  assert.ok(!plain.message, plain.message ?? "");
  assert.ok(vol(plain) < vol(s), "the fillet adds material at the root");
  const back = run(plain, { type: "setGear", id: "g_001", spec });
  assert.ok(Math.abs(vol(back) - vol(s)) < 1e-6 * vol(s), "and back");
});

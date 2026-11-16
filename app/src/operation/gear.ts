// Gear outlines (`dec_gear_tool`): the closed outline of a spur gear with involute teeth, as points on a plane and, for each side from one point to the next, how far its middle stands out
// (a bulge, the same number a drawn arc keeps, `Line.bulge`), so the outline is drawn as ordinary lines and arcs. Pure maths in the plane's own x and y, centred on the origin, tooth 0 pointing along +x
// (for an internal gear: tooth 0 is centred on +x as well). Nothing here knows how the part will be made (`prin_manufacture_agnostic`).
//
// The numbers (ISO 53, DIN 867): module m (mm per tooth of pitch diameter), tooth count z, pressure angle a. Pitch radius rp = m z / 2, base radius rb = rp cos a; the flank of a tooth is the
// involute of the base circle: at radius r its half-thickness, as an angle, is  half(r) = half(rp) + inv(a_p) - inv(a_r)  with inv(a) = tan a - a and cos a_r = rb / r.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { pulleyOutline } from "./pulley.ts";
import { sprocketOutline } from "./sprocket.ts";

export interface GearSpec {
  teeth: number;
  /** mm of pitch diameter per tooth */
  module: number;
  /** degrees; 20 by default */
  pressure?: number;
  /** profile shift as a fraction of the module (external gears; 0 by default): pushes the cutter out, thickening the root, which avoids undercut with few teeth */
  shift?: number;
  /** mm of tooth thickness taken off along the pitch circle (0 by default) */
  backlash?: number;
  /** root clearance as a fraction of the module (0.25 by default) */
  clearance?: number;
  /** a ring: the outline is the hole whose teeth point in (a wall of `rim` modules round it, 2 by default, is drawn as a circle by the caller) */
  internal?: boolean;
  rim?: number;
  /** diameter of a round hole through the middle of an external gear, mm (0 or absent: none) */
  bore?: number;
  /** a rack: a gear of endless radius, a straight bar with straight-sided teeth (`teeth` of them, `rim` modules of bar under the roots, 2 by default); its outline lies along x from the middle of its pitch line, teeth up */
  rack?: boolean;
  /** a timing pulley for this belt (`pulley.ts`): `teeth` grooves, `clearance` (mm, bigger all round than the belt tooth) in place of the root clearance of a gear; the module is the belt's pitch */
  pulley?: "2GT" | "3GT";
  /** a roller chain sprocket (`sprocket.ts`): `teeth` teeth for the ANSI chain number `chain` (40 if none), or for the `pitch` and `roller` diameter given (mm); a bore as for a gear */
  sprocket?: { chain?: number; pitch?: number; roller?: number };
}
export interface GearOutline {
  /** the corners of the outline in order, counter-clockwise */
  points: [number, number][];
  /** for the side from points[i] to the next (the last goes back to the first): how far its middle is out from the chord as a fraction of the chord's length, positive to the left of the way it goes (0: a straight side) */
  bulges: number[];
  pitchRadius: number;
  baseRadius: number;
  /** the outside of an external gear's teeth; the inside of an internal gear's teeth */
  tipRadius: number;
  /** the bottom of the gaps (the top of the gaps for an internal gear) */
  rootRadius: number;
  /** an internal gear: the radius of the wall round the hole (the outer circle) */
  outerRadius?: number;
  /** a rack: how long it is along its pitch line, mm */
  length?: number;
  /** things worth saying that did not stop the outline (few teeth: undercut not shaped; teeth pointed; tip inside the base circle) */
  warnings: string[];
}

/** per side of a tooth: how many arcs make up the involute (each is an arc through two points of it and the point between; checked in the tests) */
const ARCS = 4;
const inv = (a: number) => Math.tan(a) - a;
const polar = (r: number, a: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];

/** How far the middle `m` of a side from `a` to `b` stands out from the chord, as a fraction of its length, positive to the left of the way it goes (the bulge of `Line`). */
export function bulgeOf(a: readonly [number, number], m: readonly [number, number], b: readonly [number, number]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return 0;
  const off = ((m[0] - (a[0] + b[0]) / 2) * -dy + (m[1] - (a[1] + b[1]) / 2) * dx) / len;
  return Math.abs(off) < 1e-12 ? 0 : off / len;
}

/** The outline of a rack: straight sides at the pressure angle, the pitch line along the x axis, the middle of it at the origin, teeth up. */
function rackOutline(spec: GearSpec): Result<GearOutline> {
  const n = Math.round(spec.teeth);
  const m = spec.module;
  if (!Number.isFinite(n) || n < 1 || n > 500) return err("a rack needs 1 to 500 teeth");
  if (!Number.isFinite(m) || m <= 0) return err("the module must be above zero");
  const alpha = ((spec.pressure ?? 20) * Math.PI) / 180;
  if (!(alpha > 0 && alpha < (35 * Math.PI) / 180)) return err("the pressure angle must be between 0 and 35 degrees");
  const [c, t] = [spec.clearance ?? 0.25, Math.tan(alpha)];
  const p = Math.PI * m;
  const s = p / 2 - (spec.backlash ?? 0); // (the tooth's thickness on the pitch line)
  const [tip, root] = [m, -(1 + c) * m];
  const [ht, hr] = [s / 2 - m * t, s / 2 + (1 + c) * m * t]; // (half the tooth at its tip and at its root)
  if (s <= 0 || ht <= 1e-6) return err("the teeth would be pointed: less backlash is needed");
  if (p - 2 * hr <= 1e-6) return err("the teeth meet at the root");
  const bottom = root - (spec.rim ?? 2) * m;
  const L = n * p;
  const top: [number, number][] = [[0, root]]; // (the top edge from the left end to the right, a half gap at each end)
  for (let k = 0; k < n; k++) { const xc = (k + 0.5) * p; top.push([xc - hr, root], [xc - ht, tip], [xc + ht, tip], [xc + hr, root]); }
  top.push([L, root]);
  const points = [[0, bottom], [L, bottom], ...top.slice().reverse()].map((q): [number, number] => [q[0]! - L / 2, q[1]!]); // (counter-clockwise: along the bottom, up the right end, back along the top)
  return ok({ points, bulges: points.map(() => 0), pitchRadius: 0, baseRadius: 0, tipRadius: tip, rootRadius: root, length: L, warnings: [] });
}

/** The outline of a gear, or why there is none. */
export function gearOutline(spec: GearSpec): Result<GearOutline> {
  if (spec.rack) return rackOutline(spec);
  if (spec.pulley) return pulleyOutline(spec);
  if (spec.sprocket) return sprocketOutline(spec);
  const z = Math.round(spec.teeth);
  const m = spec.module;
  if (!Number.isFinite(z) || z < 3 || z > 500) return err("a gear needs 3 to 500 teeth");
  if (!Number.isFinite(m) || m <= 0) return err("the module must be above zero");
  const alpha = ((spec.pressure ?? 20) * Math.PI) / 180;
  if (!(alpha > 0 && alpha < (35 * Math.PI) / 180)) return err("the pressure angle must be between 0 and 35 degrees");
  const x = spec.internal ? 0 : spec.shift ?? 0;
  const c = spec.clearance ?? 0.25;
  const backlash = spec.backlash ?? 0;
  const [rp, warnings] = [(m * z) / 2, [] as string[]];
  const rb = rp * Math.cos(alpha);
  const invP = inv(alpha);
  const invAt = (r: number) => inv(Math.acos(Math.min(1, rb / r)));
  // the half thickness of a tooth (an external gear) or of the material between two gaps (an internal gear), as an angle, at radius r
  const thickness = Math.max(1e-6, (Math.PI / 2 + 2 * x * Math.tan(alpha)) * m - backlash);
  const half0 = thickness / (2 * rp);
  const half = spec.internal ? (r: number) => half0 + invAt(r) - invP : (r: number) => half0 + invP - invAt(r);
  const pitch = (2 * Math.PI) / z;
  const tooth = (k: number) => k * pitch;
  const points: [number, number][] = [];
  const bulges: number[] = [];
  const add = (p: [number, number]) => points.push(p);
  const edge = (a: [number, number], m2: [number, number], b: [number, number]) => bulges.push(bulgeOf(a, m2, b));

  // the flank between two radii, as points with the middle point of each arc: radii spaced evenly along the roll of the involute (tan of its angle), so the arcs are about equal
  const flank = (lo: number, hi: number, centre: number, side: 1 | -1): { p: [number, number][]; mid: [number, number][] } => {
    const [t0, t1] = [Math.sqrt(Math.max(0, (lo / rb) ** 2 - 1)), Math.sqrt(Math.max(0, (hi / rb) ** 2 - 1))];
    const at = (t: number): [number, number] => { const r = rb * Math.sqrt(1 + t * t); return polar(r, centre + side * half(r)); };
    const p: [number, number][] = [], mid: [number, number][] = [];
    for (let j = 0; j <= ARCS; j++) p.push(at(t0 + ((t1 - t0) * j) / ARCS));
    for (let j = 0; j < ARCS; j++) mid.push(at(t0 + ((t1 - t0) * (j + 0.5)) / ARCS));
    return { p, mid };
  };

  if (!spec.internal) {
    const rf = rp - m * (1 + c - x);
    let ra = rp + m * (1 + x);
    if (rf <= 0.2 * rp) return err("the teeth are too deep for this few: raise the tooth count or lower the module");
    const smallest = 0.02 * pitch; // a tip narrower than this (half angle) is a point
    if (half(ra) < smallest) {
      let [lo, hi] = [rp, ra]; // half(rp) > smallest unless the tooth is already pointed at the pitch circle
      if (half(lo) < smallest) return err("the teeth would be pointed at the pitch circle: less shift or more backlash-free thickness is needed");
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (half(mid) < smallest) hi = mid; else lo = mid; }
      ra = lo;
      warnings.push("the tips are pointed, so they are cut short");
    }
    if (z < (2 * (1 - x)) / Math.sin(alpha) ** 2 - 1e-9) warnings.push("few teeth: the root is not undercut, so this gear will bind against a gear that reaches it");
    if ((spec.bore ?? 0) < 0 || (spec.bore ?? 0) >= 2 * rf * 0.95) return err("the bore must be smaller than the gear's root circle");
    const r0 = Math.max(rb, rf);
    if (half(r0) >= pitch / 2 - 1e-4) return err("the teeth meet at the root: raise the tooth count or lower the shift");
    for (let k = 0; k < z; k++) {
      const phi = tooth(k);
      const cw = flank(r0, ra, phi, -1), ccw = flank(r0, ra, phi, 1);
      const sunk = rf < rb - 1e-9; // the involute begins at the base circle; below it a straight radial side runs down to the root circle
      if (sunk) { add(polar(rf, phi - half(rb))); bulges.push(0); }
      for (let j = 0; j <= ARCS; j++) { add(cw.p[j]!); if (j < ARCS) edge(cw.p[j]!, cw.mid[j]!, cw.p[j + 1]!); }
      edge(cw.p[ARCS]!, polar(ra, phi), ccw.p[ARCS]!); // the tip: an arc about the centre
      for (let j = ARCS; j >= 0; j--) { add(ccw.p[j]!); if (j > 0) edge(ccw.p[j]!, ccw.mid[j - 1]!, ccw.p[j - 1]!); }
      if (sunk) { add(polar(rf, phi + half(rb))); }
      const from = sunk ? polar(rf, phi + half(rb)) : ccw.p[0]!;
      if (sunk) bulges.push(0); // (a radial side: straight)
      const nextStart = sunk ? polar(rf, tooth(k + 1) - half(rb)) : flank(r0, ra, tooth(k + 1), -1).p[0]!;
      edge(from, polar(rf, phi + pitch / 2), nextStart); // the root: an arc about the centre
    }
    return ok({ points, bulges, pitchRadius: rp, baseRadius: rb, tipRadius: ra, rootRadius: rf, warnings });
  }

  // an internal gear: the hole, going round counter-clockwise; at each tooth of the ring the side comes in from the gap's root circle to the tip circle, round the tip, and out again
  const rr = rp + m * (1 + c);
  let rt = rp - m;
  if (rt <= rb) { rt = rb * 1.0005; warnings.push("few teeth for a ring: the tip circle is inside the base circle, so the tips are cut at it"); }
  if (rt >= rp) return err("the tip circle would be outside the pitch circle: raise the tooth count");
  if (half(rr) >= pitch / 2 - 1e-4) return err("the teeth meet at the root: raise the tooth count");
  for (let k = 0; k < z; k++) {
    const phi = tooth(k);
    const cw = flank(rt, rr, phi, -1), ccw = flank(rt, rr, phi, 1);
    for (let j = ARCS; j >= 0; j--) { add(cw.p[j]!); if (j > 0) edge(cw.p[j]!, cw.mid[j - 1]!, cw.p[j - 1]!); }
    edge(cw.p[0]!, polar(rt, phi), ccw.p[0]!); // the tip: an arc about the centre
    for (let j = 0; j <= ARCS; j++) { add(ccw.p[j]!); if (j < ARCS) edge(ccw.p[j]!, ccw.mid[j]!, ccw.p[j + 1]!); }
    edge(ccw.p[ARCS]!, polar(rr, phi + pitch / 2), flank(rt, rr, tooth(k + 1), -1).p[ARCS]!);
  }
  return ok({ points, bulges, pitchRadius: rp, baseRadius: rb, tipRadius: rt, rootRadius: rr, outerRadius: rr + m * (spec.rim ?? 2), warnings });
}

/** The module that makes the gear's outside diameter this wide (external, no shift): the outside diameter is m (z + 2). */
export const moduleForOutside = (teeth: number, outside: number, shift = 0): number => outside / (Math.round(teeth) + 2 * (1 + shift));

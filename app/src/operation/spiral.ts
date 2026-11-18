// A spiral bevel gear's tooth (`dec_spiral_bevel_gears`, `in_829`): the maths of `prototypes/bevel-spiral-generated`, reviewed and rewritten, with its tests in `test/spiral.test.ts`. The tooth surfaces come from the gearing law (H. J. Stadtfeld,
// "Gear Mathematics for Bevel & Hypoid Gears", chapter 2, Gear Technology, Aug 2015; Huston and Coy, NASA TM 82622): a crown gear with circular-arc teeth (the band between two cones about a cutter axis) is the generating gear; the pinion's flank
// is the envelope of the crown's as the two roll about axes through a common apex (the ratio of roll the sine of the pinion's pitch angle), the ring gear's the envelope of the pinion's, so the pair is conjugate by construction.
// A gear's body is a prism of its tooth sections (the outline in planes across its axis, `outlineAt`) cut by the blank of its two back cones (`blankFor`), as the straight bevel gear's is (`bevelscene.ts`).
// All in one frame, the pair's at its place: the apex the origin, the contact line the z axis, the pinion's axis (0, -sin g1, cos g1), the ring's (0, sin g2, cos g2), each axis pointing from the apex into its gear; a gear's azimuth is measured
// from x round its axis (CCW seen from the axis' tip); the pinion's contact line is at azimuth pi/2, the ring's at -pi/2.
// Limits (measured by the prototype, `dec_spiral_bevel_gears`): shafts at 90 degrees, a 20 degree pressure angle, the face 0.3 of the mean cone distance, the cutter 0.88 of it; seven pairs of 16 to 56 teeth in all mesh to within 4 mm3; a ring cone steeper than
// about 65 degrees and more than about 56 teeth in all failed in the kernel.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { bulgeOf } from "./arcs.ts";
import type { P } from "./arcs.ts";
import type { GearSpec } from "./gear.ts";

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rot = (p: V3, ax: V3, a: number): V3 => { const [c, s] = [Math.cos(a), Math.sin(a)], d = dot(ax, p), cr = cross(ax, p); return [p[0] * c + cr[0] * s + ax[0] * d * (1 - c), p[1] * c + cr[1] * s + ax[1] * d * (1 - c), p[2] * c + cr[2] * s + ax[2] * d * (1 - c)]; };

/** the limits of a spiral bevel pair */
export const SPIRAL = { minPinion: 16, maxTotal: 56, maxRatio: 2.05, minAngle: 15, maxAngle: 45, defaultAngle: 30, face: 0.3, cutter: 0.88, backlash: 0.05, shifts: [-0.67, -0.9, -1.3, 0.9, 1.3, -0.4] } as const;
/** (the cones' positions, in modules along the axis: the kernel cannot always cut where the cones pass through the corners of the teeth, and where it can depends on the gear's place: each is tried in turn, `spiralretry.ts`) */

export interface SpiralGear { axis: V3; /** its pitch angle */ gamma: number; z: number; /** the addendum and dedendum of the crown's tooth that generates it, mm */ hK: number; hF: number }
export interface SpiralPair {
  pinion: SpiralGear; ring: SpiralGear;
  z1: number; z2: number; mn: number; alpha: number;
  /** the mean cone distance, the cutter radius, the mean spiral angle (radians), the face width along the cone (all mm but the angle) */ RM: number; RW: number; beta: number; b: number;
  /** half the pinion's slot widening, mm (backlash) */ bl: number;
  /** which cone position (`SPIRAL.shifts`) */ cone: number;
}
/** The pair for a pinion of `z1` teeth and a ring gear of `z2` (z2 at least z1), the normal module, the mean spiral angle (degrees) and the backlash (mm), or why there is none. */
export function spiralPairOf(z1: number, z2: number, mn: number, betaDeg: number, backlash: number, cone = 0): Result<SpiralPair> {
  if (!(Number.isInteger(z1) && Number.isInteger(z2))) return err("the tooth counts must be whole numbers");
  if (z1 < SPIRAL.minPinion) return err(`a spiral bevel pinion needs ${SPIRAL.minPinion} or more teeth`);
  if (z2 < z1) return err("the ring gear has at least as many teeth as the pinion");
  if (z1 + z2 > SPIRAL.maxTotal) return err(`a spiral bevel pair of more than ${SPIRAL.maxTotal} teeth in all is not made yet (the kernel runs out of memory cutting it)`);
  if (z2 / z1 > SPIRAL.maxRatio) return err(`a spiral bevel pair of more than ${SPIRAL.maxRatio} to 1 is not made yet (the ring's cone is too steep for the kernel to cut): the pinion needs at least ${Math.ceil(z2 / SPIRAL.maxRatio)} teeth for this ring gear`);
  if (!(mn > 0)) return err("the module must be above zero");
  if (!(betaDeg >= SPIRAL.minAngle && betaDeg <= SPIRAL.maxAngle)) return err(`the spiral angle must be from ${SPIRAL.minAngle} to ${SPIRAL.maxAngle} degrees`);
  if (!(backlash >= 0 && backlash <= 0.5 * mn)) return err("the backlash must be from 0 to half a module");
  const g1 = Math.atan(z1 / z2), g2 = Math.PI / 2 - g1, beta = (betaDeg * Math.PI) / 180;
  const RM = (mn / Math.cos(beta) * z2) / (2 * Math.sin(g2));
  const [hK, hF] = [mn, 1.2 * mn];
  return ok({ pinion: { axis: [0, -Math.sin(g1), Math.cos(g1)], gamma: g1, z: z1, hK, hF }, ring: { axis: [0, Math.sin(g2), Math.cos(g2)], gamma: g2, z: z2, hK, hF }, z1, z2, mn, alpha: (20 * Math.PI) / 180, RM, RW: SPIRAL.cutter * RM, beta, b: SPIRAL.face * RM, bl: backlash, cone });
}

/** A point of the pinion's flank `f` (A the inside flank of the crown's tooth, B the outside), at the angle `th` round the cutter axis and the height `y` above the crown's pitch plane, with its normal, in the pair's frame; `widen` makes the pinion's slot wider by this much on each side */
function pinionPoint(pr: SpiralPair, f: "A" | "B", th: number, y: number, widen: number): { p: V3; n: V3 } {
  const t = Math.tan(pr.alpha), dr = f === "A" ? -t : t;
  const C: V3 = [pr.RW * Math.cos(pr.beta), 0, pr.RM - pr.RW * Math.sin(pr.beta)]; // (the cutter's centre: a right hand crown)
  const r = (f === "A" ? pr.RW - (Math.PI * pr.mn) / 4 - y * t : pr.RW + (Math.PI * pr.mn) / 4 + y * t) + (f === "A" ? -widen : widen);
  const [ct, st] = [Math.cos(th), Math.sin(th)];
  const p: V3 = [C[0] + r * ct, y, C[2] + r * st], n: V3 = [ct, -dr, st];
  // the gearing law: the crown's point is in contact when the crown is turned by psi, tan psi = -(x ny - y nx) / (z ny - y nz); the pinion's point is that one turned back by the pinion's own turn, psi / sin(g1)
  const psi = Math.atan(-(p[0] * n[1] - p[1] * n[0]) / (p[2] * n[1] - p[1] * n[2]));
  const rotY = (v: V3): V3 => [v[0] * Math.cos(psi) + v[2] * Math.sin(psi), v[1], -v[0] * Math.sin(psi) + v[2] * Math.cos(psi)];
  const back = (v: V3): V3 => rot(rotY(v), pr.pinion.axis, psi / Math.sin(pr.pinion.gamma));
  return { p: back(p), n: back(n) };
}
/** The point of the ring gear's flank that the pinion's point `q` with normal `n` generates: the pinion turned by t, the ring by kk t about its axis (kk the ratio of the sines of the pitch angles), the contact where the relative motion has no part along the normal: P0 + P1 cos t + P2 sin t = 0 */
function ringPoint(pr: SpiralPair, q: V3, n: V3): V3 {
  const [a1, a2] = [pr.pinion.axis, pr.ring.axis];
  const kk = Math.sin(pr.pinion.gamma) / Math.sin(pr.ring.gamma);
  const c12 = cross(a1, a2), d12 = dot(a1, a2);
  const P0 = dot(n, cross(a1, q)) + kk * d12 * dot(n, cross(a1, q));
  const P1 = kk * (dot(n, cross(a2, q)) - d12 * dot(n, cross(a1, q)));
  const P2 = -kk * dot(n, cross(c12, q));
  const R = Math.hypot(P1, P2), ratio = -P0 / R;
  if (!(Math.abs(ratio) <= 1)) return [NaN, NaN, NaN]; // (no contact for this point)
  const [t0, d] = [Math.atan2(P2, P1), Math.acos(ratio)];
  const cand = [t0 + d, t0 - d].map((t) => ((((t + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI);
  const t = Math.abs(cand[0]!) < Math.abs(cand[1]!) ? cand[0]! : cand[1]!;
  return rot(rot(q, a1, t), a2, kk * t);
}
type Grid = V3[][];
/** The surface of one flank of a gear on a grid over the angle round the cutter axis and the height above the crown's pitch plane. */
function flankGrid(pr: SpiralPair, which: "pinion" | "ring", f: "A" | "B", nth = 160, ny = 80): Grid {
  const thM = Math.atan2(Math.sin(pr.beta), -Math.cos(pr.beta));
  const span = (1.2 * (pr.b + 16)) / pr.RW + 0.25; // (the face and a margin each side, for the planes beyond the toe and the heel that the cone ends need)
  const g = which === "pinion" ? pr.pinion : pr.ring;
  const [y0, y1] = [-g.hF - 3, g.hK + 3];
  const P: Grid = [];
  for (let i = 0; i <= nth; i++) {
    const th = thM - span + (2 * span * i) / nth;
    const row: V3[] = [];
    for (let j = 0; j <= ny; j++) {
      const pp = pinionPoint(pr, f, th, y0 + ((y1 - y0) * j) / ny, which === "pinion" ? pr.bl : 0);
      row.push(which === "pinion" ? pp.p : ringPoint(pr, pp.p, pp.n));
    }
    P.push(row);
  }
  return P;
}
const basis = (axis: V3): [V3, V3] => [[1, 0, 0], cross(axis, [1, 0, 0])];
/** the points of the surface in the plane across the axis at the distance X from the apex, as (radius, azimuth) */
function contourAt(grid: Grid, axis: V3, X: number): [number, number][] {
  const [e1, e2] = basis(axis);
  const out: [number, number][] = [];
  const s = (p: V3) => dot(p, axis) - X;
  const add = (a: V3, b: V3) => {
    const [sa, sb] = [s(a), s(b)];
    if (!Number.isFinite(sa) || !Number.isFinite(sb) || sa * sb > 0 || sa === sb) return;
    const u = sa / (sa - sb);
    const p: V3 = [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2])];
    out.push([Math.hypot(dot(p, e1), dot(p, e2)), Math.atan2(dot(p, e2), dot(p, e1))]);
  };
  for (let i = 0; i < grid.length; i++) for (let j = 0; j < grid[i]!.length; j++) { if (i + 1 < grid.length) add(grid[i]![j]!, grid[i + 1]![j]!); if (j + 1 < grid[i]!.length) add(grid[i]![j]!, grid[i]![j + 1]!); }
  return out;
}
/** the tip and root radii in the plane at X: the cones of the pitch angle with their apexes moved along the axis by the addendum and dedendum over sin(gamma) */
const tipRadius = (g: SpiralGear, X: number): number => (X + g.hK / Math.sin(g.gamma)) * Math.tan(g.gamma);
const rootRadius = (g: SpiralGear, X: number): number => (X - g.hF / Math.sin(g.gamma)) * Math.tan(g.gamma);
/**
 * A flank curve as the azimuth at each of the radii: the points inside the radii (a little beyond), the branch of the contour that is the flank (from the point at the middle radius outward each way, a point is taken if its azimuth is within a quarter
 * of a pitch of the last one taken: the contour of the whole surface has other branches), linear between them; below the lowest radius straight down to the root; null if the curve does not reach the tip.
 */
function curveOf(pts: [number, number][], radii: number[], pitch: number): number[] | null {
  const [lo, hi] = [radii[0]! - 1.5, radii[radii.length - 1]! + 1.5];
  const inside = pts.filter(([r]) => r >= lo && r <= hi);
  if (inside.length < 4) return null;
  const ref0 = inside[0]![1];
  const unw = inside.map(([r, f]): [number, number] => [r, f - ref0 - 2 * Math.PI * Math.round((f - ref0) / (2 * Math.PI))]);
  const sorted = unw.slice().sort((a, b) => a[0] - b[0]);
  const rMid = (radii[0]! + radii[radii.length - 1]!) / 2;
  let seed = 0;
  for (let i = 1; i < sorted.length; i++) if (Math.abs(sorted[i]![0] - rMid) < Math.abs(sorted[seed]![0] - rMid)) seed = i;
  const taken: [number, number][] = [sorted[seed]!];
  for (const dir of [1, -1]) { let last = sorted[seed]![1]; for (let i = seed + dir; i >= 0 && i < sorted.length; i += dir) if (Math.abs(sorted[i]![1] - last) < 0.25 * pitch) { taken.push(sorted[i]!); last = sorted[i]![1]; } }
  const q = taken.sort((a, b) => a[0] - b[0]);
  if (q.length < 4 || q[q.length - 1]![0] < radii[radii.length - 1]! - 0.3) return null;
  return radii.map((r) => {
    if (r <= q[0]![0]) return q[0]![1] + ref0;
    let i = 1;
    while (i < q.length - 1 && q[i]![0] < r) i++;
    const [a, b] = [q[i - 1]!, q[i]!];
    const u = b[0] === a[0] ? 0 : (r - a[0]) / (b[0] - a[0]);
    return a[1] + u * (b[1] - a[1]) + ref0;
  });
}
/** a tooth's thickness and a gap's width under this are not made (the tip is lowered, the root raised to where there is that much), mm */
const THIN = 0.15;
const NF = 8; // (radii of a flank curve: eight steps)
/** The outline of a gear in the plane at X: z teeth, each two flank curves, a tip arc and a root arc; polar points (radius, azimuth), `NF + 1 + 2 + NF + 1 + 2` for each tooth; null if the surfaces do not make one here. */
function outlineAt(g: SpiralGear, which: "pinion" | "ring", A: [number, number][], B: [number, number][], X: number): [number, number][] | null {
  const [rt0, rr] = [tipRadius(g, X), rootRadius(g, X)];
  const pitch = (2 * Math.PI) / g.z;
  const fine = Array.from({ length: 41 }, (_, i) => rr + ((rt0 - rr) * i) / 40);
  const [fa, fb] = [curveOf(A, fine, pitch), curveOf(B, fine, pitch)];
  if (!fa || !fb) return null;
  const mid0 = 20;
  const swap = fa[mid0]! > fb[mid0]!;
  const [fl, fh] = swap ? [fb, fa] : [fa, fb];
  const fh2 = fh[mid0]! - fl[mid0]! > Math.PI ? fh.map((v) => v - 2 * Math.PI) : fh;
  // the tooth's thickness along the arc at each radius: where it falls under THIN the tip is lowered to that radius (a pointed tooth is what the surfaces make; the toe's cone cuts it off)
  const thick = (i: number) => (which === "ring" ? fh2[i]! - fl[i]! : fl[i]! + pitch - fh2[i]!) * fine[i]!;
  let top = 40;
  while (top > 4 && thick(top) < THIN) top--;
  // and the gap at the root (the ring gear's flare can close it before the root): the root is raised to where it is wide enough
  const gapAt = (i: number) => (which === "ring" ? fl[i]! + pitch - fh2[i]! : fh2[i]! - fl[i]!) * fine[i]!;
  let bot = 0;
  while (bot < top - 6 && gapAt(bot) < THIN) bot++;
  if (top - bot < 6) return null;
  const [rt, rrr] = [fine[top]!, fine[bot]!];
  const radii = Array.from({ length: NF + 1 }, (_, i) => rrr + ((rt - rrr) * i) / NF);
  const [ca, cb] = [curveOf(A, radii, pitch), curveOf(B, radii, pitch)];
  if (!ca || !cb) return null;
  let [lo, hi] = ca[NF >> 1]! < cb[NF >> 1]! ? [ca, cb] : [cb, ca];
  if (hi[NF >> 1]! - lo[NF >> 1]! > Math.PI) [lo, hi] = [hi, lo.map((v) => v + 2 * Math.PI)]; // (the pair straddles the branch cut)
  // ring gear: the tooth is between the curves; pinion: the slot is, the tooth between this slot's high curve and the next slot's low curve
  const [up, down] = which === "ring" ? [lo, hi] : [hi, lo.map((v) => v + pitch)];
  const pts: [number, number][] = [];
  for (let j = 0; j < g.z; j++) {
    const off = j * pitch;
    for (let i = 0; i <= NF; i++) pts.push([radii[i]!, up[i]! + off]);
    for (let k = 1; k <= 2; k++) pts.push([rt, up[NF]! + off + ((down[NF]! - up[NF]!) * k) / 3]);
    for (let i = NF; i >= 0; i--) pts.push([radii[i]!, down[i]! + off]);
    for (let k = 1; k <= 2; k++) pts.push([rrr, down[0]! + off + ((up[0]! + pitch - down[0]!) * k) / 3]);
  }
  return pts;
}

/** What the gear's body is made from: the planes across its axis (the distance from the apex, the outline there as corners and the bulge of each side), the blank of the two cones, and the geometry the placing needs. */
export interface SpiralBody {
  /** the pitch angle of the gear, radians */ delta: number;
  /** the cone distance of the heel's pitch point and its distance from the apex along the axis */ R: number; big: number;
  /** the planes: `x` the distance from the apex along the axis; the outline in the gear's own frame (x, y) with the azimuth the mirror of the pair frame's (so that the axis points to the apex, as the straight bevel gear's frame has it) */
  sections: { x: number; points: P[]; bulges: number[] }[];
  /** the blank's section: (radius, height along the axis towards the apex from the plane of the heel's pitch point), counter-clockwise */ blank: [number, number][];
  pitchRadius: number; tipRadius: number; rootRadius: number; addendum: number; dedendum: number;
}
const SECTIONS = 9;
const cache = new Map<string, Result<SpiralBody>>();
/**
 * The body of the pinion (`which` = "pinion") or the ring gear of a pair. The sections' corners are taken from the outline at every second sample of a flank (four arcs through nine points) and one arc across each tip and root.
 */
export function spiralBody(pr: SpiralPair, which: "pinion" | "ring"): Result<SpiralBody> {
  const key = JSON.stringify([pr.z1, pr.z2, pr.mn, pr.beta, pr.bl, pr.cone, which]);
  const hit = cache.get(key);
  if (hit) return hit;
  const r = spiralBodyMade(pr, which);
  if (cache.size > 32) cache.clear();
  cache.set(key, r);
  return r;
}
function spiralBodyMade(pr: SpiralPair, which: "pinion" | "ring"): Result<SpiralBody> {
  const g = which === "pinion" ? pr.pinion : pr.ring;
  const m = pr.mn, dx = (SPIRAL.shifts[pr.cone] ?? SPIRAL.shifts[0]) * m;
  const bl = blankFor(g, pr.RM - pr.b / 2, pr.RM + pr.b / 2, m, dx);
  if (typeof bl === "string") return err(bl);
  const [A, B] = [flankGrid(pr, which, "A"), flankGrid(pr, which, "B")];
  const sections: SpiralBody["sections"] = [];
  const mirror = ([r, th]: [number, number]): P => [r * Math.cos(th), -r * Math.sin(th)]; // (the axis towards the apex: the azimuth turns the other way)
  for (let i = 0; i < SECTIONS; i++) {
    const X = bl.xS + ((bl.xB - bl.xS) * i) / (SECTIONS - 1);
    const o = outlineAt(g, which, contourAt(A, g.axis, X), contourAt(B, g.axis, X), X);
    if (!o) return err(`the tooth surfaces make no outline at ${X.toFixed(1)} mm from the apex: other tooth counts or a smaller module`);
    const per = 2 * NF + 6;
    const points: P[] = [], bulges: number[] = [];
    const at = (j: number, k: number): [number, number] => o[(j * per + k) % o.length]!;
    const mid = (p: [number, number], q: [number, number]): [number, number] => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    for (let j = 0; j < g.z; j++) {
      // the corners: every second sample of the flank going up, the tip's two ends, every second sample coming down; each side an arc through the next three samples or through the middle of the tip or root arc
      const corners = [0, 2, 4, 6, 8, NF + 3, NF + 5, NF + 7, NF + 9, NF + 11].map((k) => ({ k, p: mirror(at(j, k)) }));
      const through: ([number, number] | null)[] = [at(j, 1), at(j, 3), at(j, 5), at(j, 7), mid(at(j, NF + 1), at(j, NF + 2)), at(j, NF + 4), at(j, NF + 6), at(j, NF + 8), at(j, NF + 10), mid(at(j, NF + 12), at(j, NF + 13))];
      corners.forEach((c, i) => {
        const nextP = i + 1 < corners.length ? corners[i + 1]!.p : mirror(at(j + 1, 0));
        points.push(c.p);
        const via = through[i]!;
        bulges.push(bulgeOf(c.p, mirror(via), nextP));
      });
    }
    sections.push({ x: X, points, bulges });
  }
  const { delta, R, big, pitchRadius, tip, root } = geometryOf(pr, g);
  let blank = bl.polygon.map(([x, r]): [number, number] => [r, big - x]);
  const area = blank.reduce((acc, p, i) => { const q = blank[(i + 1) % blank.length]!; return acc + (p[0] * q[1] - q[0] * p[1]); }, 0);
  if (area < 0) blank = blank.slice().reverse();
  return ok({ delta, R, big, sections, blank, pitchRadius, tipRadius: tip, rootRadius: root, addendum: g.hK, dedendum: g.hF });
}
/** the heel's cone distance and what follows from it for the gear: the pitch radius there and the tip and root radii on the back cone (the pitch radius plus the addendum, less the dedendum, each times cos delta) */
function geometryOf(pr: SpiralPair, g: SpiralGear): { delta: number; R: number; big: number; pitchRadius: number; tip: number; root: number } {
  const R = pr.RM + pr.b / 2, pitchRadius = R * Math.sin(g.gamma), c = Math.cos(g.gamma);
  return { delta: g.gamma, R, big: R * c, pitchRadius, tip: pitchRadius + g.hK * c, root: pitchRadius - g.hF * c };
}

export interface Blank { xS: number; xB: number; polygon: [number, number][] }
/**
 * The blank of a gear whose ends are cones (the back cones, square to the pitch cone, at the toe and the heel; as the straight gear's, `bevel.ts` `bevelLayout`): a revolved shape between the toe's cone and the heel's, with a flat hub disc inside the roots at
 * each end, and the range of planes across the axis the prism of the teeth must cover to hold every tooth up to the cones. Coordinates (x along the axis from the apex, radius r). `dx` moves both cones along the axis: the kernel cannot always cut
 * where the cones pass through the corners of the teeth (`SPIRAL.shift`).
 */
function blankFor(g: SpiralGear, rhoToe: number, rhoHeel: number, m: number, dx: number): Blank | string {
  const [sg, cg, tg] = [Math.sin(g.gamma), Math.cos(g.gamma), Math.tan(g.gamma)];
  const [x0t, x0h] = [rhoToe / cg + dx, rhoHeel / cg + dx];
  const rRootH = (x0h - g.hF / sg) * sg * cg, xRootH = x0h - rRootH * tg;
  const rTipT = (x0t + g.hK / sg) * sg * cg, xTipT = x0t - rTipT * tg;
  const xB = xRootH + 0.5 * m, xS = xTipT - 0.5 * m;
  const xFar = xB + 0.25 * m;
  const Lt = (r: number) => x0t - tg * r;
  const rA = (x0h - xFar) / tg;
  if (!(rA > 0.5)) return "the heel cone is too flat for this gear";
  const rootT = rootRadius(g, rhoToe * cg), rFor = (x: number) => (x0t - x) / tg;
  const rT = Math.min(1.2 * rootT, Math.max(0.8 * rootT, rFor(xFar - 2 * m)));
  if (!(Lt(rT) < xFar - 0.3 * m && Lt(rT) > xS)) return "the hub does not fit between the cones";
  const xLow = xS - 1; // (below the prism's first plane nothing is left to cut: the blank is closed by a flat end a little below it)
  if (!(xLow > 0.5)) return "the toe is too near the apex for this gear";
  const [rmaxH, rT1] = [(x0h - xLow) / tg, (x0t - xLow) / tg];
  if (!(rmaxH > rT1 + 1)) return "the heel cone is too steep for this gear";
  return { xS, xB, polygon: [[xFar, 0], [xFar, rA], [xLow, rmaxH], [xLow, rT1], [Lt(rT), rT], [Lt(rT), 0]] };
}

/** the azimuth of the pair's contact line in a gear's own frame at the pair's place (the frame of `spiralBody`, mirrored): the pinion's -pi/2, the ring gear's +pi/2 */
export const CONTACT = { pinion: -Math.PI / 2, ring: Math.PI / 2 } as const;

/** Which of the pair a spiral bevel gear is: the one with fewer teeth is the pinion; with equal teeth the partner made for the other (it has a direction) is the ring gear. */
export const spiralRole = (spec: GearSpec): "pinion" | "ring" => (spec.teeth < spec.bevel!.mate ? "pinion" : spec.teeth > spec.bevel!.mate ? "ring" : spec.bevel!.dir !== undefined ? "ring" : "pinion");
/** The pair a spiral bevel gear (`BevelSpec.spiral`: its mean spiral angle, degrees) is one of, and which one it is; or why there is none. */
export function spiralFor(spec: GearSpec): Result<{ pair: SpiralPair; which: "pinion" | "ring" }> {
  const b = spec.bevel;
  if (!b || b.spiral === undefined) return err("not a spiral bevel gear");
  if ((b.shaft ?? 90) !== 90) return err("a spiral bevel pair is made for shafts at 90 degrees only");
  if ((spec.pressure ?? 20) !== 20) return err("a spiral bevel pair is made for a pressure angle of 20 degrees only");
  const [z, mate] = [Math.round(spec.teeth), Math.round(b.mate)];
  const which = spiralRole({ ...spec, teeth: z, bevel: { ...b, mate } });
  const pair = which === "pinion" ? spiralPairOf(z, mate, spec.module, b.spiral, spec.backlash ?? SPIRAL.backlash, b.cone ?? 0) : spiralPairOf(mate, z, spec.module, b.spiral, spec.backlash ?? SPIRAL.backlash, b.cone ?? 0);
  return pair.ok ? ok({ pair: pair.value, which }) : pair;
}
/** The numbers of the gear that the placing, the preview and the checks need, without making its sections. */
export function spiralGeometry(pr: SpiralPair, which: "pinion" | "ring") {
  const g = which === "pinion" ? pr.pinion : pr.ring;
  const geo = geometryOf(pr, g);
  const toe = (pr.RM - pr.b / 2) * Math.cos(g.gamma);
  return { ...geo, face: pr.b, small: toe, k: toe / geo.big, addendum: g.hK, dedendum: g.hF, zv: g.z / Math.cos(g.gamma) };
}

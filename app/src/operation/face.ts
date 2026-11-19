// A face gear and its spur pinion (`dec_crown_gear_set`, `in_886`): the crown gear for a SPUR pinion, the axes crossing at exactly 90 degrees. The maths of `prototypes/face-gear` (rewritten; tests in `test/face.test.ts`): the face gear's tooth is not a plane but the envelope
// of the pinion's involute flank (the gearing law, as `spiral.ts`'s). Frame: the origin where the axes cross, the pinion's axis x, the face gear's axis z (its pitch plane is z = -r1, the teeth stand up from it towards the pinion), the contact line the x axis at height -r1; the face gear's
// azimuth is measured from x about z, its slot 0 centred on x at the pair's place; the pinion's tooth 0 points down (-z) there. A face gear and its pinion are bevel records (`BevelSpec.facegear`, `"gear"` or `"pinion"`) so that the pair's linking and placing are the bevel gear's.
// Limits (measured by the prototype): a 20 degree pressure angle, 12 or more pinion teeth, the face gear 2 to 3.1 times the pinion's, up to 64 teeth, the teeth from the pitch radius less a module to the pitch radius plus 4 modules.
import { END_REACH, shortestFor } from "./blankchamfer.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { bulgeOf } from "./arcs.ts";
import type { P } from "./arcs.ts";
import type { GearSpec } from "./gear.ts";

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rot = (p: V3, ax: V3, a: number): V3 => { const [c, s] = [Math.cos(a), Math.sin(a)], d = dot(ax, p), cr = cross(ax, p); return [p[0] * c + cr[0] * s + ax[0] * d * (1 - c), p[1] * c + cr[1] * s + ax[1] * d * (1 - c), p[2] * c + cr[2] * s + ax[2] * d * (1 - c)]; };
const A1: V3 = [1, 0, 0], A2: V3 = [0, 0, 1];

/** how far the pinion's plane is out from where the axes cross, in front of the teeth's inner end (mm): the pinion is a millimetre longer than the face at each end */
export const PINION_OVERHANG = 1;
export const FACE = { minPinion: 12, maxFace: 64, minRatio: 2, maxRatio: 3.1, outer: 3, innerBelow: 1, outerLimit: 4, plate: 2, backlash: 0.05 } as const;
export interface FacePair { z1: number; z2: number; m: number; alpha: number; bl: number; inner: number; outer: number; r1: number; R2: number; rb: number; hK: number; hF: number; /** the plate's thickness under the root, mm */ thick: number; /** the tooth chamfer at the two ends, mm (`dec_bevel_chamfer`) */ cham: number }
/** The pair for a pinion of `z1` teeth and a face gear of `z2`, or why there is none. */
function facePairOf(z1: number, z2: number, m: number, bl: number, inner?: number, outer?: number, thick?: number, cham = 0): Result<FacePair> {
  if (!(Number.isInteger(z1) && Number.isInteger(z2))) return err("the tooth counts must be whole numbers");
  if (z1 < FACE.minPinion) return err(`a face gear's pinion needs ${FACE.minPinion} or more teeth`);
  if (z2 > FACE.maxFace) return err(`a face gear of more than ${FACE.maxFace} teeth is not made yet`);
  if (z2 / z1 < FACE.minRatio || z2 / z1 > FACE.maxRatio) return err(`a face gear is made for ${FACE.minRatio} to ${FACE.maxRatio} times its pinion's teeth (${Math.ceil(z2 / FACE.maxRatio)} to ${Math.floor(z2 / FACE.minRatio)} pinion teeth for ${z2})`);
  if (!(m > 0)) return err("the module must be above zero");
  if (!(bl >= 0 && bl <= 0.5 * m)) return err("the backlash must be from 0 to half a module");
  const R2 = (m * z2) / 2;
  const [i, o] = [inner ?? R2, outer ?? R2 + FACE.outer * m];
  if (!(i >= R2 - FACE.innerBelow * m)) return err(`the inner radius is at least ${(R2 - FACE.innerBelow * m).toFixed(1)} mm (the pitch radius less a module): inside it the pinion cannot generate the tooth`);
  if (!(o <= R2 + FACE.outerLimit * m)) return err(`the outer radius is at most ${(R2 + FACE.outerLimit * m).toFixed(1)} mm (the pitch radius and ${FACE.outerLimit} modules): beyond it the teeth are pointed`);
  if (!(o >= i + 2 * m)) return err("the teeth are at least two modules long");
  const t = thick ?? FACE.plate * m;
  if (!(t >= 0.5 * m)) return err("the plate must be at least half a module thick");
  const r1 = (m * z1) / 2;
  return ok({ z1, z2, m, alpha: (20 * Math.PI) / 180, bl, inner: i, outer: o, r1, R2, rb: r1 * Math.cos((20 * Math.PI) / 180), hK: m, hF: 1.25 * m, thick: t, cham });
}
/** Which of the pair a face gear record is and its pair, or why there is none: `bevel.facegear` is "gear" (the record has the face gear's teeth) or "pinion"; `crown` has the radii and `width` the plate's thickness. */
export function faceFor(spec: GearSpec): Result<{ pair: FacePair; role: "gear" | "pinion" }> {
  const b = spec.bevel;
  if (!b || b.facegear === undefined) return err("not a face gear");
  if ((b.shaft ?? 90) !== 90) return err("a face gear drive is at 90 degrees");
  if ((spec.pressure ?? 20) !== 20) return err("a face gear is made for a pressure angle of 20 degrees only");
  const [z, mate] = [Math.round(spec.teeth), Math.round(b.mate)];
  const [z1, z2] = b.facegear === "gear" ? [mate, z] : [z, mate];
  const bl = spec.backlash ?? FACE.backlash, thick = b.facegear === "gear" ? spec.width : undefined;
  const chAll = spec.chamfer ?? 0; // (the tooth chamfer, in modules, `dec_bevel_chamfer`: a face gear's by its blank, its spur pinion's by the kernel's tooth chamfer, as a spur gear's)
  if (!(chAll >= 0 && chAll <= 1)) return err("the chamfer is from 0 to 1 module deep");
  const ch = b.facegear === "gear" ? chAll : 0;
  if (spec.crown?.outer === undefined) { // no outer radius given: the longest tooth the pair can have, the usual three modules out less a quarter module at a time (the tooth is thinnest at its outer end and more so for a bigger pinion)
    let last: Result<FacePair> = err("no outer radius");
    for (const k of [3, 2.75, 2.5, 2.25, 2, 1.75, 1.5]) {
      last = facePairOf(z1, z2, spec.module, bl, spec.crown?.inner, (spec.module * z2) / 2 + k * spec.module, thick, ch * spec.module);
      if (!last.ok) return last;
      if (faceBody(last.value).ok) return ok({ pair: last.value, role: b.facegear });
    }
    const why = faceBody((last as { value: FacePair }).value);
    return why.ok ? err("no face gear tooth for these numbers") : why;
  }
  const p = facePairOf(z1, z2, spec.module, bl, spec.crown?.inner, spec.crown?.outer, thick, ch * spec.module);
  if (p.ok && b.facegear === "pinion" && chAll > 0 && !(chAll * spec.module * 2 < pinionWidth(p.value))) return err("the chamfer is deeper than half the thickness of the pinion");
  if (p.ok && ch > 0 && !(p.value.outer - p.value.inner >= shortestFor(ch * spec.module, spec.module))) return err(`the chamfer is too deep for teeth ${(p.value.outer - p.value.inner).toFixed(1)} mm long: at most ${Math.max(0, (p.value.outer - p.value.inner - 0.1 * spec.module) / 2 - 0.25 * spec.module).toFixed(1)} mm`);
  return p.ok ? ok({ pair: p.value, role: b.facegear }) : p;
}

const inv = (a: number) => Math.tan(a) - a;
const halfAt = (pr: FacePair, rho: number) => (Math.PI * pr.m / 2 - pr.bl) / 2 / pr.r1 + inv(pr.alpha) - inv(Math.acos(Math.min(1, pr.rb / rho)));
function pinionFlank(pr: FacePair, side: 1 | -1, s: number, rho: number): { q: V3; n: V3 } {
  const psi = -Math.PI / 2 + side * halfAt(pr, rho), d = 1e-4, psi2 = -Math.PI / 2 + side * halfAt(pr, rho + d);
  const [p0, p1] = [[rho * Math.cos(psi), rho * Math.sin(psi)], [(rho + d) * Math.cos(psi2), (rho + d) * Math.sin(psi2)]];
  const [ty, tz] = [p1[0]! - p0[0]!, p1[1]! - p0[1]!], l = Math.hypot(ty, tz);
  return { q: [s, p0[0]!, p0[1]!], n: [0, -tz / l, ty / l] };
}
/** The point of the face gear's flank that the pinion's point generates: the pinion turned t about x, the face gear (z1 / z2) t about z, in contact where the relative motion has no part along the normal: P0 + P1 cos t + P2 sin t = 0 */
function envelope(pr: FacePair, q: V3, n: V3): V3 {
  const kk = pr.z1 / pr.z2, c12 = cross(A1, A2);
  const P0 = dot(n, cross(A1, q)), P1 = -kk * dot(n, cross(A2, q)), P2 = kk * dot(n, cross(c12, q));
  const R = Math.hypot(P1, P2), ratio = -P0 / R;
  if (!(Math.abs(ratio) <= 1)) return [NaN, NaN, NaN];
  const [t0, d] = [Math.atan2(P2, P1), Math.acos(ratio)];
  const cand = [t0 + d, t0 - d].map((t) => ((((t + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI);
  const t = Math.abs(cand[0]!) < Math.abs(cand[1]!) ? cand[0]! : cand[1]!;
  return rot(rot(q, A1, t), A2, -kk * t);
}
type Grid = V3[][];
function faceGrid(pr: FacePair, side: 1 | -1, ns = 120, nr = 60): Grid {
  const [s0, s1] = [pr.inner - 6, pr.outer + 6], [rho0, rho1] = [pr.r1 - pr.hF - 0.6, pr.r1 + pr.hK + 1];
  const P: Grid = [];
  for (let i = 0; i <= ns; i++) {
    const row: V3[] = [];
    for (let j = 0; j <= nr; j++) { const { q, n } = pinionFlank(pr, side, s0 + ((s1 - s0) * i) / ns, rho0 + ((rho1 - rho0) * j) / nr); row.push(envelope(pr, q, n)); }
    P.push(row);
  }
  return P;
}
/** the points of a flank's surface in the plane at height h above the face gear's pitch plane, as (radius, azimuth) */
function contourAt(pr: FacePair, grid: Grid, h: number): [number, number][] {
  const out: [number, number][] = [];
  const zc = h - pr.r1, s = (p: V3) => p[2] - zc;
  const add = (a: V3, b: V3) => {
    const [sa, sb] = [s(a), s(b)];
    if (!Number.isFinite(sa) || !Number.isFinite(sb) || sa * sb > 0 || sa === sb) return;
    const u = sa / (sa - sb), p: V3 = [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2])];
    out.push([Math.hypot(p[0], p[1]), Math.atan2(p[1], p[0])]);
  };
  for (let i = 0; i < grid.length; i++) for (let j = 0; j < grid[i]!.length; j++) { if (i + 1 < grid.length) add(grid[i]![j]!, grid[i + 1]![j]!); if (j + 1 < grid[i]!.length) add(grid[i]![j]!, grid[i]![j + 1]!); }
  return out;
}
/** a flank curve as the azimuth at each radius; null if the surface does not cover the radii */
function curveAt(pts: [number, number][], radii: number[]): number[] | null {
  const q = pts.filter(([r]) => r >= radii[0]! - 1 && r <= radii[radii.length - 1]! + 1).sort((a, b) => a[0] - b[0]);
  if (q.length < 4 || q[0]![0] > radii[0]! + 0.3 || q[q.length - 1]![0] < radii[radii.length - 1]! - 0.3) return null;
  return radii.map((r) => {
    let i = 1;
    while (i < q.length - 1 && q[i]![0] < r) i++;
    const [a, b] = [q[i - 1]!, q[i]!], u = b[0] === a[0] ? 0 : (r - a[0]) / (b[0] - a[0]);
    return a[1] + u * (b[1] - a[1]);
  });
}
/** how far inside the inner radius the loft's outline goes (mm): the blank cuts it there (surfaces that coincide are not cut cleanly) */
const FACE_INSET = 0.4;
export interface FaceBody {
  /** the heights above the pitch plane of the loft's sections (the tip, down past the pinion's tip, then straight to a little under the root: five) and the outline at each: corners (x, y) and the bulge of each side, slot 0 centred on +x */
  sections: { h: number; points: P[]; bulges: number[] }[];
  /** the heights: the tip, the root, the plate's top is the root */ tip: number; root: number;
}
const NR = 8;
const cache = new Map<string, Result<FaceBody>>();
/** The sections of the face gear of a pair, or why the pinion cannot generate its tooth there. */
export function faceBody(pr: FacePair): Result<FaceBody> {
  const key = JSON.stringify(pr);
  const hit = cache.get(key);
  if (hit) return hit;
  const r = faceBodyMade(pr);
  if (cache.size > 32) cache.clear();
  cache.set(key, r);
  return r;
}
function faceBodyMade(pr: FacePair): Result<FaceBody> {
  const { m, z2 } = pr, pitch = (2 * Math.PI) / z2, ri = pr.inner - FACE_INSET;
  const outer = pr.outer + (pr.cham > 0 ? END_REACH : 0); // (with a chamfer the loft goes a little past the outer radius, where the blank's wall cuts the ends: `blankchamfer.ts`)
  const [A, B] = [faceGrid(pr, 1), faceGrid(pr, -1)];
  const radii = Array.from({ length: NR + 1 }, (_, i) => ri + ((outer - ri) * i) / NR);
  // the heights (modules above the pitch plane): the pinion's involute flank makes the tooth exactly from the pinion's tip (a module below the plane) up to its base circle (0.42 module up on a 14 tooth pinion); there the tooth is as the envelope has it, widening
  // steadily downwards. Above the base circle the pinion's flank is the radial line of its root, which the envelope turns into a flare (`in_1015`), and below its tip it does not reach: in those two parts of the tooth, which nothing touches, it is a smooth
  // continuation: above, a taper to 0.6 of the width at the base circle's height (never pointed); below, the walls straight down to the root. (Five sections with straight necks above and below made an S: the human asked if real face gears look like that, `in_1030`.)
  const hs = [1, 0.4, 0, -0.4, -0.7, -1, -1.55].map((k) => k * m);
  const xy = (r: number, th: number): P => [r * Math.cos(th), r * Math.sin(th)];
  const sections: FaceBody["sections"] = [];
  let last: [number[], number[]] | null = null;
  const curves: [number[], number[]][] = [];
  for (const [q, h] of hs.entries()) {
    if (q === 0) { curves.push([[], []]); continue; } // (the tip: made below from the section under it)
    let fa = curveAt(contourAt(pr, A, h), radii), fb = curveAt(contourAt(pr, B, h), radii);
    if (!fa || !fb) {
      if (!last || h > -0.69 * m) return err("the pinion cannot generate this face gear's tooth between these radii (inside about the pitch radius less a module there is none): a larger inner radius");
      [fa, fb] = last; // (below the pinion's tip: the slot's walls stand straight down to the root)
    } else last = [fa, fb];
    curves.push([fa, fb]);
  }
  { // the tip: the section under it with the tooth 0.45 as wide (the same middle), so that the tooth tapers on up to its top
    const [fa, fb] = curves[1]!;
    const narrow = (a: number, i: number): [number, number] => { const [w, c] = [pitch + fb[i]! - a, (a + pitch + fb[i]!) / 2]; return [c - (0.45 * w) / 2, c + (0.45 * w) / 2 - pitch]; };
    curves[0] = [fa.map((a, i) => narrow(a, i)[0]), fa.map((a, i) => narrow(a, i)[1])];
  }
  // the tooth gets no wider as it goes up (`in_1015`): where the pinion's flank is below its base circle (the tooth's top, a module up on a 14 tooth pinion) the involute formula, carried on, flares the tooth out, wider at the tip than a little under it; the tooth keeps its middle and the width of the
  // height below it there (the pinion does not touch that part of the tooth: a pair still fits)
  for (let k = curves.length - 2; k >= 0; k--) {
    const [fa, fb] = curves[k]!, [ga, gb] = curves[k + 1]!;
    curves[k] = [fa.map((a, i) => { const [w, wb, c] = [pitch + fb[i]! - a, pitch + gb[i]! - ga[i]!, (a + pitch + fb[i]!) / 2]; return c - Math.min(w, wb) / 2; }), fa.map((a, i) => { const [w, wb, c] = [pitch + fb[i]! - a, pitch + gb[i]! - ga[i]!, (a + pitch + fb[i]!) / 2]; return c + Math.min(w, wb) / 2 - pitch; })];
  }
  for (const [q, h] of hs.entries()) {
    const [fa, fb] = curves[q]!;
    if (h === pr.hK && (pitch - (fa[NR]! - fb[NR]!)) * outer < 0.25 * m) return err("the teeth come to a point at the outer radius: a smaller outer radius");
    const points: P[] = [], bulges: number[] = [];
    const side = (a: P, via: P, b: P) => { points.push(a); bulges.push(bulgeOf(a, via, b)); };
    for (let j = 0; j < z2; j++) {
      const [c0, c1] = [j * pitch, (j + 1) * pitch];
      const up = (i: number) => xy(radii[i]!, c0 + fa![i]!), down = (i: number) => xy(radii[i]!, c1 + fb![i]!);
      side(up(0), up(2), up(4)); side(up(4), up(6), up(8));
      side(up(8), xy(outer, (c0 + fa![NR]! + c1 + fb![NR]!) / 2), down(8)); // across the tip
      side(down(8), down(6), down(4)); side(down(4), down(2), down(0));
      side(down(0), xy(ri, c1 + (fb![0]! + fa![0]!) / 2), xy(radii[0]!, c1 + fa![0]!)); // across the slot at the inner end
    }
    sections.push({ h, points, bulges });
  }
  return ok({ sections, tip: pr.hK, root: pr.hF });
}
/** the pinion's width: the face and the overhang at each end */
export const pinionWidth = (pr: FacePair): number => pr.outer - pr.inner + 2 * PINION_OVERHANG;

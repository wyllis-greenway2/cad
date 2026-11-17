// A spline side (`dec_spline_and_cams`): a smooth curve through points (centripetal Catmull-Rom, which does not loop or overshoot on uneven spacing). Pure maths on points; nothing here knows the plane or the scene.
// The kernel draws only lines and arcs, so a spline is turned into a chain of arcs (`splinePieces`) only where a shape is made from it, each arc through three points of the curve, split until the arcs are within a tolerance of it.
import type { Vec3 } from "../math/vec.ts";
import { add, sub, scale, dot } from "../math/vec.ts";

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** the points without a point on top of the one before it (the curve has no direction there) */
export const distinctPoints = (pts: readonly Vec3[]): Vec3[] => pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]!) > 1e-9);
/** the points just outside the two ends, where the curve is part of a closed one (the points of the curve either side of where it was split): the curve then leaves and arrives as the closed curve does, not as if its end points had mirror images */
export interface Ends { before?: Vec3; after?: Vec3 }
/** the same ends, for the curve walked the other way */
export const reversedEnds = (e: Ends | undefined): Ends | undefined => (e ? { ...(e.after ? { before: e.after } : {}), ...(e.before ? { after: e.before } : {}) } : undefined);
/** the point of the curve through `pts` at `t`, from 0 (the first point) to n - 1 (the last): span i is t from i to i + 1 */
export function splineAt(pts: readonly Vec3[], t: number, ends?: Ends): Vec3 {
  const n = pts.length;
  if (n === 0) return [0, 0, 0];
  if (n === 1) return pts[0]!;
  const i = Math.min(n - 2, Math.max(0, Math.floor(t)));
  const u = Math.min(1, Math.max(0, t - i));
  const p1 = pts[i]!, p2 = pts[i + 1]!;
  const p0 = i > 0 ? pts[i - 1]! : ends?.before ?? sub(scale(p1, 2), p2); // (the ends: the curve goes on as if the next point were the mirror of the one inside, or the point of the closed curve that is there)
  const p3 = i + 2 < n ? pts[i + 2]! : ends?.after ?? sub(scale(p2, 2), p1);
  const k0 = 0, k1 = k0 + Math.sqrt(dist(p0, p1)), k2 = k1 + Math.sqrt(dist(p1, p2)), k3 = k2 + Math.sqrt(dist(p2, p3));
  const s = k1 + (k2 - k1) * u;
  const mix = (a: Vec3, b: Vec3, ka: number, kb: number): Vec3 => (kb - ka < 1e-12 ? a : add(scale(a, (kb - s) / (kb - ka)), scale(b, (s - ka) / (kb - ka))));
  const a1 = mix(p0, p1, k0, k1), a2 = mix(p1, p2, k1, k2), a3 = mix(p2, p3, k2, k3);
  const b1 = mix(a1, a2, k0, k2), b2 = mix(a2, a3, k1, k3);
  return mix(b1, b2, k1, k2);
}
/** the curve as points along it, `perSpan` to each stretch between two of the given points: for drawing and picking */
export function splinePoints(pts: readonly Vec3[], perSpan = 16, ends?: Ends): Vec3[] {
  const p = distinctPoints(pts);
  if (p.length < 3 && !(p.length === 2 && ends)) return [...p];
  const out: Vec3[] = [];
  for (let i = 0; i < p.length - 1; i++) for (let k = 0; k < perSpan; k++) out.push(splineAt(p, i + k / perSpan, ends));
  out.push(p[p.length - 1]!);
  return out;
}
/** how long the curve is (a polyline along it) */
const splineLength = (pts: readonly Vec3[], ends?: Ends): number => splinePoints(pts, 8, ends).reduce((s, q, i, all) => (i ? s + dist(q, all[i - 1]!) : 0), 0);
/** how far a spline is let stray from the arcs that stand for it, mm: a few parts in ten thousand of its length (0.02 mm for a hundred), and never less than a thousandth */
export const splineTolerance = (pts: readonly Vec3[], ends?: Ends): number => Math.max(1e-3, splineLength(pts, ends) * 2e-4);
export interface Piece { a: Vec3; /** the middle of the arc from `a` to `b`; null when the piece is a straight line */ mid: Vec3 | null; b: Vec3 }
/** how far `q` is from the arc through a, m, b (or from the line a b when they are in line) */
function offArc(a: Vec3, m: Vec3, b: Vec3, q: Vec3): { off: number; line: boolean } {
  const ab = sub(b, a), ac = sub(m, a);
  const n: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const nn = dot(n, n);
  if (nn < 1e-14 * dot(ab, ab) * dot(ac, ac) + 1e-18) { // (in line)
    const len = Math.hypot(...ab) || 1;
    const t = dot(sub(q, a), ab) / (len * len);
    return { off: dist(q, add(a, scale(ab, t))), line: true };
  }
  const x = (v: Vec3, w: Vec3): Vec3 => [v[1] * w[2] - v[2] * w[1], v[2] * w[0] - v[0] * w[2], v[0] * w[1] - v[1] * w[0]];
  const c = add(a, scale(add(scale(x(n, ab), dot(ac, ac)), scale(x(ac, n), dot(ab, ab))), 1 / (2 * nn)));
  return { off: Math.abs(dist(q, c) - dist(a, c)), line: false };
}
/** the curve as pieces: straight lines and arcs each through three points of it, no piece straying from the curve by more than `tol` */
export function splinePieces(pts: readonly Vec3[], tolerance?: number, ends?: Ends): Piece[] {
  const p = distinctPoints(pts);
  const tol = tolerance ?? splineTolerance(p, ends);
  if (p.length < 2) return [];
  if (p.length === 2 && !ends) return [{ a: p[0]!, mid: null, b: p[1]! }];
  const out: Piece[] = [];
  const fit = (t0: number, t1: number, depth: number): void => {
    const [a, b, m] = [splineAt(p, t0, ends), splineAt(p, t1, ends), splineAt(p, (t0 + t1) / 2, ends)];
    const worst = [0.25, 0.75, 0.125, 0.375, 0.625, 0.875].reduce((w, f) => Math.max(w, offArc(a, m, b, splineAt(p, t0 + (t1 - t0) * f, ends)).off), offArc(a, m, b, m).off);
    if (worst > tol && depth < 10) { fit(t0, (t0 + t1) / 2, depth + 1); fit((t0 + t1) / 2, t1, depth + 1); return; }
    out.push({ a, mid: offArc(a, m, b, m).line ? null : m, b });
  };
  for (let i = 0; i < p.length - 1; i++) fit(i, i + 1, 0);
  return out;
}

// A face gear (a crown gear for a SPUR pinion, axes crossing at 90 degrees) by the gearing law (a prototype, `in_878`, `dec_crown_gear_set`; nothing in `app/src` imports it). The face gear's tooth is not a plane: it is the
// envelope of the pinion's involute flank as the pinion (about x) and the face gear (about z) roll with the ratio z1 / z2. Frame: the origin where the axes cross, the pinion's axis x, the face gear's axis z (its pitch plane is z = -r1,
// the teeth stand up from it towards the pinion), the contact line the x axis at height -r1. The slot of the face gear is what one pinion tooth cuts; its two flanks are the envelopes of the pinion tooth's two flanks.
export type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rot = (p: V3, ax: V3, a: number): V3 => { const [c, s] = [Math.cos(a), Math.sin(a)], d = dot(ax, p), cr = cross(ax, p); return [p[0] * c + cr[0] * s + ax[0] * d * (1 - c), p[1] * c + cr[1] * s + ax[1] * d * (1 - c), p[2] * c + cr[2] * s + ax[2] * d * (1 - c)]; };
export interface FaceSpec { z1: number; z2: number; m: number; alpha: number; /** backlash, mm of tooth thickness off the pinion's pitch circle */ bl: number; rIn: number; rOut: number; /** the pinion's addendum and dedendum as multiples of the module */ kK?: number; kF?: number }
export interface FacePair { spec: FaceSpec; r1: number; R2: number; rb: number; hK: number; hF: number }
export const A1: V3 = [1, 0, 0], A2: V3 = [0, 0, 1];
export function facePair(sp: FaceSpec): FacePair {
  const [kK, kF] = [sp.kK ?? 1, sp.kF ?? 1.25];
  const r1 = (sp.m * sp.z1) / 2;
  return { spec: sp, r1, R2: (sp.m * sp.z2) / 2, rb: r1 * Math.cos(sp.alpha), hK: kK * sp.m, hF: kF * sp.m };
}
const inv = (a: number) => Math.tan(a) - a;
/** the azimuth of the flank of the pinion's tooth at the radius rho, from the tooth's middle (side +1 the upper, -1 the lower) */
const halfAt = (pr: FacePair, rho: number) => (Math.PI * pr.spec.m / 2 - pr.spec.bl) / 2 / pr.r1 + inv(pr.spec.alpha) - inv(Math.acos(Math.min(1, pr.rb / rho)));
/** a point of the pinion's flank (axial position s, radius rho) in the frame (the tooth in the middle pointing at the face gear, down: -z) and its normal */
function pinionFlank(pr: FacePair, side: 1 | -1, s: number, rho: number): { q: V3; n: V3 } {
  const psi = -Math.PI / 2 + side * halfAt(pr, rho);
  const d = 1e-4;
  const psi2 = -Math.PI / 2 + side * halfAt(pr, rho + d);
  const [p0, p1] = [[rho * Math.cos(psi), rho * Math.sin(psi)], [(rho + d) * Math.cos(psi2), (rho + d) * Math.sin(psi2)]];
  const [ty, tz] = [p1[0]! - p0[0]!, p1[1]! - p0[1]!], l = Math.hypot(ty, tz);
  return { q: [s, p0[0]!, p0[1]!], n: [0, -tz / l, ty / l] };
}
/** The point of the face gear's flank that the pinion's point generates: the pinion turned t about x, the face gear (z1 / z2) t about z, in contact where the relative motion has no part along the normal: P0 + P1 cos t + P2 sin t = 0 */
function envelope(pr: FacePair, q: V3, n: V3): V3 {
  const kk = pr.spec.z1 / pr.spec.z2;
  const c12 = cross(A1, A2);
  const P0 = dot(n, cross(A1, q)), P1 = -kk * dot(n, cross(A2, q)), P2 = kk * dot(n, cross(c12, q));
  const R = Math.hypot(P1, P2), ratio = -P0 / R;
  if (!(Math.abs(ratio) <= 1)) return [NaN, NaN, NaN];
  const [t0, d] = [Math.atan2(P2, P1), Math.acos(ratio)];
  const cand = [t0 + d, t0 - d].map((t) => ((((t + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI);
  const t = Math.abs(cand[0]!) < Math.abs(cand[1]!) ? cand[0]! : cand[1]!;
  return rot(rot(q, A1, t), A2, -kk * t);
}
export type Grid = V3[][];
/** one flank of the face gear's slot as a surface on a grid over the pinion's radius (from the base circle to its tip) and the axial position */
export function faceGrid(pr: FacePair, side: 1 | -1, ns = 120, nr = 60): Grid {
  const [s0, s1] = [pr.spec.rIn - 6, pr.spec.rOut + 6];
  const [rho0, rho1] = [pr.r1 - pr.hF - 0.6, pr.r1 + pr.hK + 1];
  const P: Grid = [];
  for (let i = 0; i <= ns; i++) {
    const row: V3[] = [];
    for (let j = 0; j <= nr; j++) { const { q, n } = pinionFlank(pr, side, s0 + ((s1 - s0) * i) / ns, rho0 + ((rho1 - rho0) * j) / nr); row.push(envelope(pr, q, n)); }
    P.push(row);
  }
  return P;
}
/** the points of the surface in the plane at height h above the face gear's pitch plane, as (radius, azimuth) */
export function contourAt(pr: FacePair, grid: Grid, h: number): [number, number][] {
  const out: [number, number][] = [];
  const zc = h - pr.r1;
  const s = (p: V3) => p[2] - zc;
  const add = (a: V3, b: V3) => {
    const [sa, sb] = [s(a), s(b)];
    if (!Number.isFinite(sa) || !Number.isFinite(sb) || sa * sb > 0 || sa === sb) return;
    const u = sa / (sa - sb);
    const p: V3 = [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2])];
    out.push([Math.hypot(p[0], p[1]), Math.atan2(p[1], p[0])]);
  };
  for (let i = 0; i < grid.length; i++) for (let j = 0; j < grid[i]!.length; j++) { if (i + 1 < grid.length) add(grid[i]![j]!, grid[i + 1]![j]!); if (j + 1 < grid[i]!.length) add(grid[i]![j]!, grid[i]![j + 1]!); }
  return out;
}
/** a flank curve as the azimuth at each radius: the points of the contour sorted by radius (the surface has one branch here), linear between them; null if it does not cover the radii */
export function curveAt(pts: [number, number][], radii: number[]): number[] | null {
  const q = pts.filter(([r]) => r >= radii[0]! - 1 && r <= radii[radii.length - 1]! + 1).sort((a, b) => a[0] - b[0]);
  if (q.length < 4 || q[0]![0] > radii[0]! + 0.3 || q[q.length - 1]![0] < radii[radii.length - 1]! - 0.3) return null;
  return radii.map((r) => {
    let i = 1; while (i < q.length - 1 && q[i]![0] < r) i++;
    const [a, b] = [q[i - 1]!, q[i]!]; const u = b[0] === a[0] ? 0 : (r - a[0]) / (b[0] - a[0]);
    return a[1] + u * (b[1] - a[1]);
  });
}

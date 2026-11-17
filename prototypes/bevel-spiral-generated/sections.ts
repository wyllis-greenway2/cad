// The flank sections of a spiral bevel pair made by the gearing law (`in_794`, building on `generate.ts`): the pinion's tooth surfaces are the envelope of the crown tooth's flanks (`generate.ts`), the ring gear's the envelope of the pinion's
// (the two gears' axes at the shaft angle, the ratio of roll the ratio of the sines of the pitch angles), so the pair is conjugate by construction. Both are given in one frame (the crown's at its zero position: the pinion's axis a1 =
// (0, -sin g1, cos g1), the ring gear's a2 = (0, sin g2, cos g2), the contact line z, the apex the origin), the gears at their meshing places: the pinion's slot 0 holds the ring gear's tooth 0.
// A section is the curve of a flank in the plane across a gear's axis at the distance X from the apex; a gear's outline in that plane is z teeth of two such flank curves, a tip arc and a root arc (the tip and root cones are Stadtfeld's, the
// same angle as the pitch cone with their apexes moved along the axis by the addendum and dedendum over sin(g): "tooth depth along face width parallel").
import { cutterCentre, flankRadius } from "./generate.ts";
import type { CrownSpec, V3 } from "./generate.ts";

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rot = (p: V3, ax: V3, a: number): V3 => { const [c, s] = [Math.cos(a), Math.sin(a)], d = dot(ax, p), cr = cross(ax, p); return [p[0] * c + cr[0] * s + ax[0] * d * (1 - c), p[1] * c + cr[1] * s + ax[1] * d * (1 - c), p[2] * c + cr[2] * s + ax[2] * d * (1 - c)]; };

export interface PairSpec { crown: CrownSpec; z1: number; z2: number; /** the normal module and the addendum and dedendum factors (1.0 and 1.2 in the example) */ mn: number; kK?: number; kF?: number; /** half the extra width of the pinion's slot, mm in the cutter radius (backlash) */ bl?: number; /** face width, mm along the cone */ b: number }
export interface Gear { axis: V3; /** its pitch angle */ gamma: number; z: number; hK: number; hF: number }
export interface Pair { pinion: Gear; ring: Gear; spec: PairSpec }
export function pairOf(sp: PairSpec): Pair {
  const g1 = Math.atan(sp.z1 / sp.z2), g2 = Math.PI / 2 - g1;
  const [kK, kF] = [sp.kK ?? 1, sp.kF ?? 1.2];
  return { pinion: { axis: [0, -Math.sin(g1), Math.cos(g1)], gamma: g1, z: sp.z1, hK: kK * sp.mn, hF: kF * sp.mn }, ring: { axis: [0, Math.sin(g2), Math.cos(g2)], gamma: g2, z: sp.z2, hK: kK * sp.mn, hF: kF * sp.mn }, spec: sp };
}
/** A point of the pinion's flank, in the pair's frame at the meshing place, with its normal; `widen` makes the pinion's slot wider by this much on each side (the cutter centre stays) */
export function pinionPoint(pr: Pair, f: "A" | "B", th: number, y: number, widen = 0): { p: V3; n: V3 } {
  const c: CrownSpec = { ...pr.spec.crown, gamma: pr.pinion.gamma };
  const C = cutterCentre(c), r = flankRadius(c, f, y) + (f === "A" ? -widen : widen), t = Math.tan(c.alpha), dr = f === "A" ? -t : t;
  const [ct, st] = [Math.cos(th), Math.sin(th)];
  const p: V3 = [C[0] + r * ct, y, C[2] + r * st], n: V3 = [ct, -dr, st];
  const [x, yy, z] = p, [nx, ny, nz] = n;
  const psi = Math.atan(-(x * ny - yy * nx) / (z * ny - yy * nz));
  const rotY = (v: V3): V3 => [v[0] * Math.cos(psi) + v[2] * Math.sin(psi), v[1], -v[0] * Math.sin(psi) + v[2] * Math.cos(psi)];
  const back = (v: V3): V3 => rot(rotY(v), pr.pinion.axis, psi / Math.sin(pr.pinion.gamma)); // (turned back by the pinion's own turn)
  return { p: back(p), n: back(n) };
}
/** The point of the ring gear's flank that the pinion's point generates (the ring gear in its place), by the gearing law between the two gears */
export function ringPoint(pr: Pair, q: V3, n: V3): { p: V3; n: V3 } {
  const [a1, a2] = [pr.pinion.axis, pr.ring.axis];
  const kk = Math.sin(pr.pinion.gamma) / Math.sin(pr.ring.gamma);
  // g(t) = n . ((a1 + kk R(-t) a2) x q) = P0 + P1 cos t + P2 sin t, R(-t) a2 = a2 cos t - (a1 x a2) sin t + a1 (a1 . a2)(1 - cos t)
  const c12 = cross(a1, a2), d12 = dot(a1, a2);
  const P0 = dot(n, cross(a1, q)) + kk * d12 * dot(n, cross(a1, q));
  const P1 = kk * (dot(n, cross(a2, q)) - d12 * dot(n, cross(a1, q)));
  const P2 = -kk * dot(n, cross(c12, q));
  const R = Math.hypot(P1, P2);
  const ratio = -P0 / R;
  if (!(Math.abs(ratio) <= 1)) return { p: [NaN, NaN, NaN], n: [NaN, NaN, NaN] }; // (no contact for this point)
  const [t0, d] = [Math.atan2(P2, P1), Math.acos(ratio)];
  const cand = [t0 + d, t0 - d].map((t) => ((t + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
  const t = Math.abs(cand[0]!) < Math.abs(cand[1]!) ? cand[0]! : cand[1]!;
  const qt = rot(q, a1, t), nt = rot(n, a1, t);
  return { p: rot(qt, a2, kk * t), n: rot(nt, a2, kk * t) };
}

// ---- sections ----
export interface Grid { P: V3[][] }
/** The surface of one flank of a gear on a grid over the angle round the cutter axis and the height above the crown's pitch plane */
export function flankGrid(pr: Pair, which: "pinion" | "ring", f: "A" | "B", nth = 160, ny = 80): Grid {
  const c = pr.spec.crown, sp = pr.spec;
  const thM = Math.atan2(Math.sin(c.beta), -Math.cos(c.beta) * (c.hand ?? 1));
  const span = (1.2 * (sp.b + 16)) / c.RW + 0.25; // (the face and a margin each side, for the planes beyond the toe and the heel that the cone ends need)
  const g = which === "pinion" ? pr.pinion : pr.ring;
  const [y0, y1] = [-g.hF - 3, g.hK + 3];
  const P: V3[][] = [];
  for (let i = 0; i <= nth; i++) {
    const th = thM - span + (2 * span * i) / nth;
    const row: V3[] = [];
    for (let j = 0; j <= ny; j++) {
      const y = y0 + ((y1 - y0) * j) / ny;
      const pp = pinionPoint(pr, f, th, y, which === "pinion" ? (sp.bl ?? 0) : 0);
      row.push(which === "pinion" ? pp.p : ringPoint(pr, pp.p, pp.n).p);
    }
    P.push(row);
  }
  return { P };
}
const basis = (axis: V3): [V3, V3] => [[1, 0, 0], cross(axis, [1, 0, 0])];
/** the points of the surface in the plane across the axis at the distance X from the apex, as (radius, azimuth) */
export function contourAt(grid: Grid, axis: V3, X: number): [number, number][] {
  const [e1, e2] = basis(axis);
  const out: [number, number][] = [];
  const s = (p: V3) => dot(p, axis) - X;
  const add = (a: V3, b: V3) => { const [sa, sb] = [s(a), s(b)]; if (!Number.isFinite(sa) || !Number.isFinite(sb) || sa * sb > 0 || sa === sb) return; const u = sa / (sa - sb); const p: V3 = [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2])]; out.push([Math.hypot(dot(p, e1), dot(p, e2)), Math.atan2(dot(p, e2), dot(p, e1))]); };
  const P = grid.P;
  for (let i = 0; i < P.length; i++) for (let j = 0; j < P[i]!.length; j++) { if (i + 1 < P.length) add(P[i]![j]!, P[i + 1]![j]!); if (j + 1 < P[i]!.length) add(P[i]![j]!, P[i]![j + 1]!); }
  return out;
}
/** the tip and root radii in the plane at X: the cones of the pitch angle with their apexes moved along the axis by the addendum and dedendum over sin(gamma) */
export const tipRadius = (g: Gear, X: number): number => (X + g.hK / Math.sin(g.gamma)) * Math.tan(g.gamma);
export const rootRadius = (g: Gear, X: number): number => (X - g.hF / Math.sin(g.gamma)) * Math.tan(g.gamma);
/**
 * A flank curve as the azimuth at each of the radii: the points found inside the radii (a little beyond), the ones near the median azimuth only (the contour of the whole surface has other branches), linear between them. Below the lowest radius the
 * flank is the involute-like part's end: the curve goes straight down (constant azimuth) to the root, as the straight gear's does where the root is inside the base cone (an undercut region that the root fillet would shape); null if the curve
 * does not reach the tip.
 */
export function curveOf(pts: [number, number][], radii: number[], pitch: number): number[] | null {
  const [lo, hi] = [radii[0]! - 1.5, radii[radii.length - 1]! + 1.5];
  const inside = pts.filter(([r]) => r >= lo && r <= hi);
  if (inside.length < 4) return null;
  const ref0 = inside[0]![1];
  const unw = inside.map(([r, f]): [number, number] => [r, f - ref0 - 2 * Math.PI * Math.round((f - ref0) / (2 * Math.PI))]);
  const med = unw.map((q) => q[1]).sort((a, b) => a - b)[unw.length >> 1]!;
  const q = unw.filter((p) => Math.abs(p[1] - med) < 0.6 * pitch).sort((a, b) => a[0] - b[0]);
  if (q.length < 4 || q[q.length - 1]![0] < radii[radii.length - 1]! - 0.3) return null;
  return radii.map((r) => {
    if (r <= q[0]![0]) return q[0]![1] + ref0;
    let i = 1; while (i < q.length - 1 && q[i]![0] < r) i++;
    const [a, b] = [q[i - 1]!, q[i]!]; const u = b[0] === a[0] ? 0 : (r - a[0]) / (b[0] - a[0]);
    return a[1] + u * (b[1] - a[1]) + ref0;
  });
}
/** The outline of a gear in the plane at X: z teeth, each as the two flank curves, a tip arc and a root arc; polar points (radius, azimuth), counter-clockwise */
export function outlineAt(g: Gear, which: "pinion" | "ring", A: [number, number][], B: [number, number][], X: number, nf = 8): [number, number][] | null {
  const [rt0, rr] = [tipRadius(g, X), rootRadius(g, X)];
  const pitch = (2 * Math.PI) / g.z;
  const fine = Array.from({ length: 41 }, (_, i) => rr + ((rt0 - rr) * i) / 40);
  const [fa, fb] = [curveOf(A, fine, pitch), curveOf(B, fine, pitch)];
  if (!fa || !fb) return null;
  const mid0 = 20;
  let swap = fa[mid0]! > fb[mid0]!;
  const [fl, fh] = swap ? [fb, fa] : [fa, fb];
  const adj = (hi: number[], lo: number[]) => (hi[mid0]! - lo[mid0]! > Math.PI ? hi.map((v) => v - 2 * Math.PI) : hi);
  const fh2 = adj(fh, fl);
  // the tooth's thickness along the arc at each radius: where it falls under the least (the flanks cross, the tooth is pointed there) the tip is lowered to that radius, a pointed tooth being what the surfaces make (the cone end of the toe cuts it off)
  const thick = (i: number) => (which === "ring" ? fh2[i]! - fl[i]! : fl[i]! + pitch - fh2[i]!) * fine[i]!;
  let top = 40;
  while (top > 4 && thick(top) < 0.15) top--;
  const rt = fine[top]!;
  const radii = Array.from({ length: nf + 1 }, (_, i) => rr + ((rt - rr) * i) / nf);
  const [ca, cb] = [curveOf(A, radii, pitch), curveOf(B, radii, pitch)];
  if (!ca || !cb) return null;
  let [lo, hi] = ca[nf >> 1]! < cb[nf >> 1]! ? [ca, cb] : [cb, ca];
  if (hi[nf >> 1]! - lo[nf >> 1]! > Math.PI) [lo, hi] = [hi, lo.map((v) => v + 2 * Math.PI)]; // (the pair straddles the branch cut)
  // ring gear: the tooth is between the curves; pinion: the slot is, the tooth between this slot's high curve and the next slot's low curve
  const [up, down] = which === "ring" ? [lo, hi] : [hi, lo.map((v) => v + pitch)];
  const pts: [number, number][] = [];
  for (let j = 0; j < g.z; j++) {
    const off = j * pitch;
    for (let i = 0; i <= nf; i++) pts.push([radii[i]!, up[i]! + off]);
    for (let k = 1; k <= 2; k++) pts.push([rt, up[nf]! + off + ((down[nf]! - up[nf]!) * k) / 3]); // (the tip arc)
    for (let i = nf; i >= 0; i--) pts.push([radii[i]!, down[i]! + off]);
    for (let k = 1; k <= 2; k++) pts.push([rr, down[0]! + off + ((up[0]! + pitch - down[0]!) * k) / 3]); // (the root arc to the next tooth)
  }
  return pts;
}

// ---- the cone ends ----
/**
 * The blank of a gear whose ends are cones (the back cones, square to the pitch cone, at the toe and the heel; as the straight gear's, `app/src/operation/bevel.ts` `bevelLayout`): a revolved shape between the toe's cone and the heel's, with a flat hub disc
 * inside the roots at each end, and the range of planes across the axis the prism of the teeth must cover to hold every tooth up to the cones. Coordinates (x along the axis from the apex, radius r).
 */
export interface Blank { xS: number; xB: number; polygon: [number, number][] }
export function blankFor(g: Gear, rhoToe: number, rhoHeel: number, m: number, dx = 0): Blank | string {
  const [sg, cg, tg] = [Math.sin(g.gamma), Math.cos(g.gamma), Math.tan(g.gamma)];
  const [x0t, x0h] = [rhoToe / cg + dx, rhoHeel / cg + dx]; // (dx: both cones moved along the axis, for a kernel that cannot cut at the very place the corners of the teeth are: see `cones.ts`)
  // where the heel cone meets the root cone, the toe cone the tip cone: the planes beyond which no tooth is left
  const rRootH = (x0h - g.hF / sg) * sg * cg, xRootH = x0h - rRootH * tg;
  const rTipT = (x0t + g.hK / sg) * sg * cg, xTipT = x0t - rTipT * tg;
  const xB = xRootH + 0.5 * m, xS = xTipT - 0.5 * m;
  const xFar = xB + 0.25 * m;
  const Lh = (r: number) => x0h - tg * r, Lt = (r: number) => x0t - tg * r;
  const rA = (x0h - xFar) / tg;
  if (!(rA > 0.5)) return "the heel cone is too flat for this gear";
  const rootT = rootRadius(g, rhoToe * cg), rFor = (x: number) => (x0t - x) / tg;
  const rT = Math.min(1.2 * rootT, Math.max(0.8 * rootT, rFor(xFar - 2 * m))); // (the hub two modules thick where the toe cone allows it; a steep ring gear needs the hub out to just past the roots at the toe)
  if (!(Lt(rT) < xFar - 0.3 * m && Lt(rT) > xS)) return "the hub does not fit between the cones";
  // below the prism's first plane nothing is left to cut, and the cones run on past the apex for a steep gear: the blank is closed by a flat end a little below that plane
  const xLow = xS - 1;
  if (!(xLow > 0.5)) return "the toe is too near the apex for this gear";
  const [rmaxH, rT1] = [(x0h - xLow) / tg, (x0t - xLow) / tg];
  if (!(rmaxH > rT1 + 1)) return "the heel cone is too steep for this gear"; // (what lies beyond rmaxH is outside the heel cone, cut off anyway)
  const xr: [number, number][] = [[xFar, 0], [xFar, rA], [xLow, rmaxH], [xLow, rT1], [Lt(rT), rT], [Lt(rT), 0]];
  return { xS, xB, polygon: xr };
}

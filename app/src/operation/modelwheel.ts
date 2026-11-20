// A wheel as a model (`dec_hub_spoke`): a rim, a web and a hub as ONE body, the way a cast or machined wheel is made. The human's own recipe (`in_1236`, named and ordered in `in_1245`, loosened in `in_1249`): the plainest form is a web joining
// the rim and the hub, with a fillet or a chamfer of a set size where the web meets each; the spokes are cutouts in that web (their number, how far they stop short of the hub and the rim, the radius where each cutout's corner meets the hub and the rim,
// the width of a spoke and how much it tapers, and a spiral). Modelling is manufacturing agnostic: nothing here fails over a size that is hard to make (a radius may be 0, spokes may merge); a number too big for the room is made as big as the room
// allows. The wheel stands along z with its middle at z = 0. Pure: numbers in, steps out.
import { Builder, outline, disc as disc0 } from "./modelparts.ts";
import type { Place, ModelBuild, Shape } from "./modelparts.ts";
import type { Scene } from "./scene.ts";
import type { Vec3 } from "../math/vec.ts";
import { bulgeOf, arcMid, flatten } from "./arcs.ts";
import type { P } from "./arcs.ts";
import type { Ref } from "../shared/ref.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";

/**
 * The numbers of a wheel (mm), in the order of the box. The diameters: `outer` (the Size), `rimD` (the rim's inside diameter: the rim is `(outer - rimD) / 2` thick across), `hub`, `bore`. The thicknesses, all along the axis: `rimT`, `web` (the
 * spokes are this thick too) and `hubT`. The spokes are cutouts in the web: `spokes` (0: a plain web), `spokeW` the width of a spoke at the hub end, `taper` how much narrower it is at the rim end (a share, negative: wider), `spiral` the degrees a spoke
 * turns from hub to rim, `rimOff` and `hubOff` how far a cutout stops short of the rim's and the hub's walls. Each radius has a kind, 0 a fillet and 1 a chamfer: `edge` (0: none) the spoke's radius, the round on the edges where the cutouts meet the
 * web's faces; `corner` the spoke join radius, where a cutout's sides meet the hub and the rim; `obtuse` the same where the corner is the blunter one, used while there is a spiral; `rimJoin` and `hubJoin` where the web meets the rim and the hub.
 * The bore is a smooth hole (its keyway, flat or splines are the keyway maker's, `in_1298`); `boreOwned` is 1 for a wheel cut into a body that has a bore of its own (the bore is the body's).
 * `draft`: degrees the walls of the rim and the hub lean away from the middle (0 for a machined wheel). `rimMax`: the biggest rim diameter (0: no limit), a wheel cut into a gear keeps its rim inside the roots of the teeth.
 */
export interface WheelSpec { outer: number; rimD: number; hub: number; bore: number; rimT: number; web: number; hubT: number; spokes: number; spokeW: number; taper: number; spiral: number; rimOff: number; hubOff: number; edge: number; edgeKind: number; corner: number; cornerKind: number; obtuse: number; rimJoin: number; rimJoinKind: number; hubJoin: number; hubJoinKind: number; draft: number; rimMax: number; boreOwned: number }
export const WHEEL_START: WheelSpec = { outer: 80, rimD: 70, hub: 22, bore: 8, rimT: 14, web: 4, hubT: 18, spokes: 5, spokeW: 10, taper: 0.3, spiral: 0, rimOff: 6, hubOff: 6, edge: 1, edgeKind: 0, corner: 3, cornerKind: 0, obtuse: 3, rimJoin: 3, rimJoinKind: 0, hubJoin: 3, hubJoinKind: 0, draft: 2, rimMax: 0, boreOwned: 0 };
/** the least a part is thick (mm): only so that it is a solid at all */
const THIN = 0.2;
/** a cutout that runs right into the hub or the rim (an offset of 0) reaches this far into it: a cut that ends exactly on the wall's own face is not a solid the kernel will make */
const RUN_IN = 0.05;
/** the least edge round on the cutouts (mm) that is made (a smaller one is none) */
const EDGE_LEAST = 0.05;
/** a cutout is open where it is wider than this (mm): narrower is a sliver the kernel cannot make, and the spokes there are one */
const OPEN_LEAST = 0.4;

/** The radii: the rim's outside and inside, the hub's, and the circles the cutouts lie between (each offset is measured from the rim's or the hub's wall: 0 and the spokes run into it, less than the join and the cutout cuts into the fillet) */
export function wheelGeometry(s: WheelSpec): { R: number; Rin: number; hubR: number; rim: number; rIn: number; rOut: number } {
  const R = s.outer / 2, Rin = s.rimD / 2, hubR = s.hub / 2;
  return { R, Rin, hubR, rim: R - Rin, rIn: hubR + Math.max(s.hubOff, 0) - (s.hubOff <= 0 ? RUN_IN : 0), rOut: Rin - Math.max(s.rimOff, 0) + (s.rimOff <= 0 ? RUN_IN : 0) };
}

/**
 * The numbers the wheel is made with: the ones that are too big for the room made as big as the room allows, none refused (`in_1249`). The joins no bigger than the rim and the hub stand proud of the web and the two together no bigger than the web
 * is wide; a cutout that would end within 0.4 mm of where a join ends is moved off it; the edge round no bigger than the web and the spoke can carry, and none where a cutout runs into the hub or the rim (the kernel cannot round that).
 */
export function effective(s: WheelSpec): WheelSpec {
  const g = wheelGeometry(s), n = Math.round(s.spokes);
  // the spokes are no thicker than the rim and the hub: where all three are as thick the wheel is flat with the spokes cut out of it (`in_1251`), and it may be as thin as it likes
  const web = Math.max(1e-3, Math.min(s.web, s.rimT, s.hubT));
  const proudR = (s.rimT - web) / 2, proudH = (s.hubT - web) / 2, room = Math.max(0, g.Rin - g.hubR);
  let [rimJ, hubJ] = [Math.max(0, Math.min(s.rimJoin, proudR - 0.01)), Math.max(0, Math.min(s.hubJoin, proudH - 0.01))];
  if (rimJ + hubJ > room * 0.98 && rimJ + hubJ > 0) { const f = (room * 0.98) / (rimJ + hubJ); rimJ *= f; hubJ *= f; }
  // a draft that would leave the rim or the hub no wall at its faces is the most that leaves one
  const rimWall = g.rim - 0.05, hubWall = s.hub / 2 - s.bore / 2 - 0.05, reach = Math.max(1e-6, s.rimT - web / 2), hubReach = (s.hubT - web) / 2;
  const maxTan = Math.min(Math.max(0, rimWall) / reach, hubReach > 1e-6 ? Math.max(0, hubWall) / hubReach : Infinity), draft = Math.min(Math.max(0, s.draft), (Math.atan(maxTan) * 180) / Math.PI);
  const out: WheelSpec = { ...s, web, draft, rimJoin: rimJ, hubJoin: hubJ, corner: Math.max(0, s.corner), obtuse: Math.max(0, s.obtuse), rimOff: Math.max(0, s.rimOff), hubOff: Math.max(0, s.hubOff) };
  if (n > 0) for (const [o, j] of [["hubOff", "hubJoin"], ["rimOff", "rimJoin"]] as const) if (out[j] > 0 && Math.abs(out[o] - out[j]) < 0.4) out[o] = out[j] + 0.4;
  let e = Math.min(Math.max(0, s.edge), 0.45 * web, 0.4 * Math.max(0, Math.min(s.spokeW, s.spokeW * (1 - s.taper))));
  if (e < EDGE_LEAST || n === 0 || out.hubOff < e + 0.4 || out.rimOff < e + 0.4) e = 0;
  out.edge = e;
  return out;
}

type Cut = { pts: P[]; bulges: number[]; /** how wide the cutout is at its narrowest end (mm along the circle): 0 where it ends in a point */ narrow: number };
const unit = (v: P): P => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
type Curve = { line: true; p: P; d: P } | { line: false; c: P; r: number };
/** the circle through three points (null for three in a line) */
function circle3(a: P, b: P, c: P): { c: P; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const [sa, sb, sc] = [a[0] * a[0] + a[1] * a[1], b[0] * b[0] + b[1] * b[1], c[0] * c[0] + c[1] * c[1]];
  const ux = (sa * (b[1] - c[1]) + sb * (c[1] - a[1]) + sc * (a[1] - b[1])) / d, uy = (sa * (c[0] - b[0]) + sb * (a[0] - c[0]) + sc * (b[0] - a[0])) / d;
  return { c: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) };
}
/** the points where the circles about `a` (radius `ra`) and `b` (`rb`) cross */
function crossCircles(a: P, ra: number, b: P, rb: number): P[] {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (d < 1e-9 || d > ra + rb || d < Math.abs(ra - rb)) return [];
  const x = (d * d + ra * ra - rb * rb) / (2 * d), h = Math.sqrt(Math.max(0, ra * ra - x * x)), u: P = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  return [[a[0] + u[0] * x - u[1] * h, a[1] + u[1] * x + u[0] * h], [a[0] + u[0] * x + u[1] * h, a[1] + u[1] * x - u[0] * h]];
}
/** the points where the circle about `a` (radius `ra`) meets the line through `p` along `d` */
function crossLine(a: P, ra: number, p: P, d: P): P[] {
  const [fx, fy] = [p[0] - a[0], p[1] - a[1]], b = fx * d[0] + fy * d[1], c = fx * fx + fy * fy - ra * ra, disc = b * b - c;
  return disc < 0 ? [] : [-b - Math.sqrt(disc), -b + Math.sqrt(disc)].map((s) => [p[0] + d[0] * s, p[1] + d[1] * s] as P);
}

/**
 * The cutout between spoke 0 (on the x axis) and spoke 1 (a turn of 2 pi / n on): its outline and the bulges of its sides, or null when there is none (the spokes fill the web). Its sides are two spoke edges (a straight line, or with a spiral a
 * circular arc through three points of the curve), an outer and an inner circle about the axis, and where the sides meet a fillet or a chamfer: `corner` where the spoke meets the hub and the rim (`obtuse` at the blunter corner while there is a
 * spiral), each tangent to both its sides exactly (so that a round along the edge can follow it). It never fails: where the spokes run into one another before they reach the hub or the rim the cutout ends in a point there (and the point is
 * rounded as the others are), and a radius too big for the room is the biggest the room allows (found by halving).
 */
function cutout(s: WheelSpec): Cut | null {
  const g = wheelGeometry(s), n = Math.round(s.spokes), { rIn, rOut } = g;
  if (n < 3 || !(rOut - rIn > 0.05)) return null;
  const span = rOut - rIn, spiral = (s.spiral * Math.PI) / 180, chamfer = Math.round(s.cornerKind) === 1, a1 = (2 * Math.PI) / n;
  const hw = (rho: number): number => Math.max(1e-3, (s.spokeW / 2) * (1 - s.taper * ((rho - rIn) / span)));
  const wide = (Math.abs(s.spokeW) / 2) * (1 + 2 * Math.abs(s.taper)) + 1;
  /** the point of the edge of the spoke at angle `a0`, on its side `side` (+1 the turning-forward side), where its centre line is at radius `rho` */
  const edge = (a0: number, side: number, rho: number): P => {
    const th = a0 + spiral * ((rho - rIn) / span), dth = spiral / span;
    const c: P = [rho * Math.cos(th), rho * Math.sin(th)], d: P = [Math.cos(th) - rho * dth * Math.sin(th), Math.sin(th) + rho * dth * Math.cos(th)];
    const nrm = unit([-d[1], d[0]]), w = hw(rho) * side;
    return [c[0] + nrm[0] * w, c[1] + nrm[1] * w];
  };
  /** the centre line radius at which the edge is at radius `target` from the axis */
  const rhoAt = (a0: number, side: number, target: number): number => {
    let [lo, hi] = [Math.max(1e-6, target - wide), target + wide];
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; (Math.hypot(...edge(a0, side, mid)) < target ? (lo = mid) : (hi = mid)); }
    return (lo + hi) / 2;
  };
  const ang = (p: P): number => Math.atan2(p[1], p[0]);
  const pointAt = (a0: number, side: number, r: number): P => edge(a0, side, rhoAt(a0, side, r));
  /** how wide the cutout is at radius `r`, along the circle (mm): negative where the spokes have run into each other */
  const open = (r: number): number => { const d = ang(pointAt(a1, -1, r)) - ang(pointAt(0, 1, r)); return ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * r; };
  // where the cutout is open: the radii from the first to the last that has room
  const N = 90, radii = Array.from({ length: N + 1 }, (_, i) => rIn + (span * i) / N), isOpen = radii.map((r) => open(r) > OPEN_LEAST);
  // the cutout is the longest run of radii that are open (a spiral can pinch it in two: the other lobe is left to the spokes)
  let [first, last, best] = [-1, -1, 0];
  for (let i = 0; i <= N; i++) {
    if (!isOpen[i]) continue;
    let j = i, total = 0;
    while (j + 1 <= N && isOpen[j + 1]) j++;
    for (let k = i; k <= j; k++) total += open(radii[k]!);
    if (total > best) { best = total; first = i; last = j; }
    i = j;
  }
  if (first < 0 || Math.max(...radii.map(open)) < 3 * OPEN_LEAST) return null; // (no room, or only a sliver of it: the spokes fill the web)
  const refine = (closed: number, opened: number): number => { let [c, o] = [closed, opened]; for (let i = 0; i < 40; i++) { const m = (c + o) / 2; (open(m) > OPEN_LEAST ? (o = m) : (c = m)); } return o; };
  const innerArc = first === 0, outerArc = last === N;
  const [rI, rO] = [innerArc ? rIn : refine(radii[first - 1]!, radii[first]!), outerArc ? rOut : refine(radii[last + 1]!, radii[last]!)];
  if (!(rO - rI > 0.05)) return null;
  const curveOf = (a0: number, side: number): Curve => {
    const [p0, p1] = [pointAt(a0, side, rI), pointAt(a0, side, rO)];
    if (spiral === 0) return { line: true, p: p0, d: unit([p1[0] - p0[0], p1[1] - p0[1]]) };
    const c = circle3(p0, pointAt(a0, side, (rI + rO) / 2), p1);
    return c ? { line: false, ...c } : { line: true, p: p0, d: unit([p1[0] - p0[0], p1[1] - p0[1]]) };
  };
  const [k1, k2] = [curveOf(0, 1), curveOf(a1, -1)];
  const O: P = [0, 0], rm = (rI + rO) / 2, [mA, mB] = [pointAt(0, 1, rm), pointAt(a1, -1, rm)], M: P = [(mA[0] + mB[0]) / 2, (mA[1] + mB[1]) / 2]; // (a point inside the cutout)
  const [A, B, C, D] = [pointAt(0, 1, rI), pointAt(0, 1, rO), pointAt(a1, -1, rO), pointAt(a1, -1, rI)];
  const [Vi, Vo]: [P, P] = [[(A[0] + D[0]) / 2, (A[1] + D[1]) / 2], [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2]]; // (where the edges meet, when the cutout ends in a point)
  /** the direction along the curve `k` at `p`, towards `toward` */
  const along = (k: Curve, p: P, toward: P): P => {
    const t: P = k.line ? k.d : unit([-(p[1] - k.c[1]), p[0] - k.c[0]]);
    return (toward[0] - p[0]) * t[0] + (toward[1] - p[1]) * t[1] >= 0 ? t : [-t[0], -t[1]];
  };
  const ctan = (p: P, sigma: number): P => { const u = unit(p); return [-u[1] * sigma, u[0] * sigma]; };
  const turn = (u: P, v: P): number => Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
  /** the radius of a corner: the spoke join radius, the obtuse one where the corner is the blunter while there is a spiral */
  const radiusAt = (theta: number, q: number): number => q * (spiral !== 0 && theta > Math.PI / 2 + 0.02 ? s.obtuse : s.corner);
  type Round = { a: P; b: P; mid: P | null };
  /** the corner of the circle about the axis (radius `R0`, the cutout `outer`side of it or not) and the curve `k` at `corner`: where its fillet or its chamfer touches the circle (a) and the curve (b) */
  const roundArc = (R0: number, outerSide: boolean, k: Curve, corner: P, toward: P, sigma: number, q: number): Round | null => {
    const r = radiusAt(turn(along(k, corner, toward), ctan(corner, sigma)), q);
    if (r < 1e-6) return { a: corner, b: corner, mid: null };
    if (chamfer) {
      const psi = ang(corner), a: P = [R0 * Math.cos(psi + (sigma * r) / R0), R0 * Math.sin(psi + (sigma * r) / R0)], u = along(k, corner, toward);
      let b: P;
      if (k.line) b = [corner[0] + u[0] * r, corner[1] + u[1] * r];
      else { const [vx, vy] = [corner[0] - k.c[0], corner[1] - k.c[1]], sg = (u[0] * -vy + u[1] * vx) > 0 ? 1 : -1, an = (sg * r) / k.r; b = [k.c[0] + vx * Math.cos(an) - vy * Math.sin(an), k.c[1] + vx * Math.sin(an) + vy * Math.cos(an)]; }
      return { a, b, mid: null };
    }
    const dO = outerSide ? R0 - r : R0 + r;
    let cand: P[];
    if (k.line) { const nrm: P = [-k.d[1], k.d[0]], side = (M[0] - k.p[0]) * nrm[0] + (M[1] - k.p[1]) * nrm[1] > 0 ? 1 : -1; cand = crossLine(O, dO, [k.p[0] + nrm[0] * r * side, k.p[1] + nrm[1] * r * side], k.d); }
    else { const inside = Math.hypot(M[0] - k.c[0], M[1] - k.c[1]) < k.r; cand = crossCircles(O, dO, k.c, inside ? k.r - r : k.r + r); }
    if (!cand.length) return null;
    const F = cand.sort((p, q2) => Math.hypot(p[0] - M[0], p[1] - M[1]) - Math.hypot(q2[0] - M[0], q2[1] - M[1]))[0]!;
    const uO = unit([F[0], F[1]]), a: P = [uO[0] * R0, uO[1] * R0];
    let b: P;
    if (k.line) { const t0 = (F[0] - k.p[0]) * k.d[0] + (F[1] - k.p[1]) * k.d[1]; b = [k.p[0] + k.d[0] * t0, k.p[1] + k.d[1] * t0]; }
    else { const u = unit([F[0] - k.c[0], F[1] - k.c[1]]); b = [k.c[0] + u[0] * k.r, k.c[1] + u[1] * k.r]; }
    const u = unit([(a[0] + b[0]) / 2 - F[0], (a[1] + b[1]) / 2 - F[1]]);
    return { a, b, mid: [F[0] + u[0] * r, F[1] + u[1] * r] };
  };
  /** the corner where the two spoke edges meet at `V` (the cutout ends in a point): where its fillet or chamfer touches the first edge (a) and the second (b) */
  const roundV = (V: P, far1: P, far2: P, q: number): Round | null => {
    const u1 = along(k1, V, far1), u2 = along(k2, V, far2), r = radiusAt(turn(u1, u2), q);
    if (r < 1e-6) return { a: V, b: V, mid: null };
    if (chamfer) {
      const pt = (k: Curve, u: P): P => { if (k.line) return [V[0] + u[0] * r, V[1] + u[1] * r]; const [vx, vy] = [V[0] - k.c[0], V[1] - k.c[1]], sg = (u[0] * -vy + u[1] * vx) > 0 ? 1 : -1, an = (sg * r) / k.r; return [k.c[0] + vx * Math.cos(an) - vy * Math.sin(an), k.c[1] + vx * Math.sin(an) + vy * Math.cos(an)]; };
      return { a: pt(k1, u1), b: pt(k2, u2), mid: null };
    }
    const off = (k: Curve): { line: true; p: P; d: P } | { line: false; c: P; r: number } => {
      if (k.line) { const nrm: P = [-k.d[1], k.d[0]], side = (M[0] - k.p[0]) * nrm[0] + (M[1] - k.p[1]) * nrm[1] > 0 ? 1 : -1; return { line: true, p: [k.p[0] + nrm[0] * r * side, k.p[1] + nrm[1] * r * side], d: k.d }; }
      return { line: false, c: k.c, r: Math.hypot(M[0] - k.c[0], M[1] - k.c[1]) < k.r ? k.r - r : k.r + r };
    };
    const [o1, o2] = [off(k1), off(k2)];
    let cand: P[] = [];
    if (o1.line && o2.line) { const det = o1.d[0] * o2.d[1] - o1.d[1] * o2.d[0]; if (Math.abs(det) > 1e-9) { const s1 = ((o2.p[0] - o1.p[0]) * o2.d[1] - (o2.p[1] - o1.p[1]) * o2.d[0]) / det; cand = [[o1.p[0] + o1.d[0] * s1, o1.p[1] + o1.d[1] * s1]]; } }
    else if (o1.line && !o2.line) cand = crossLine(o2.c, o2.r, o1.p, o1.d);
    else if (!o1.line && o2.line) cand = crossLine(o1.c, o1.r, o2.p, o2.d);
    else if (!o1.line && !o2.line) cand = crossCircles(o1.c, o1.r, o2.c, o2.r);
    if (!cand.length) return null;
    const F = cand.sort((p, q2) => Math.hypot(p[0] - V[0], p[1] - V[1]) - Math.hypot(q2[0] - V[0], q2[1] - V[1]))[0]!;
    const proj = (k: Curve): P => { if (k.line) { const t0 = (F[0] - k.p[0]) * k.d[0] + (F[1] - k.p[1]) * k.d[1]; return [k.p[0] + k.d[0] * t0, k.p[1] + k.d[1] * t0]; } const u = unit([F[0] - k.c[0], F[1] - k.c[1]]); return [k.c[0] + u[0] * k.r, k.c[1] + u[1] * k.r]; };
    const [a, b] = [proj(k1), proj(k2)], u = unit([(a[0] + b[0]) / 2 - F[0], (a[1] + b[1]) / 2 - F[1]]);
    return { a, b, mid: [F[0] + u[0] * r, F[1] + u[1] * r] };
  };
  const cross = (u: P, v: P): number => u[0] * v[1] - u[1] * v[0], rad = (p: P): number => Math.hypot(p[0], p[1]);
  type Node = { p: P; t: "e1" | "e2" | "f" | "oa" | "ia"; mid?: P | null };
  const side = (k: Curve, p: P, nx: P): number => (k.line ? 0 : bulgeOf(p, arcMid(k.c, k.r, p, nx), nx));
  /** the points and the bulges of the sides of the outline made of `nodes` (the two points of a corner with no radius are one) */
  const assemble = (nodes: Node[]): { pts: P[]; bulges: number[] } => {
    const pts: P[] = [], bulges: number[] = [];
    nodes.forEach((nd, i) => {
      const nx = nodes[(i + 1) % nodes.length]!.p;
      const bulge = nd.t === "e1" ? side(k1, nd.p, nx) : nd.t === "e2" ? side(k2, nd.p, nx) : nd.t === "oa" ? bulgeOf(nd.p, arcMid(O, rOut, nd.p, nx), nx) : nd.t === "ia" ? bulgeOf(nd.p, arcMid(O, rIn, nd.p, nx), nx) : nd.mid ? bulgeOf(nd.p, nd.mid, nx) : 0;
      const last = pts.length - 1;
      if (last >= 0 && Math.hypot(pts[last]![0] - nd.p[0], pts[last]![1] - nd.p[1]) < 1e-7) bulges[last] = bulge; // (a zero radius: the two points of a corner are one)
      else { pts.push(nd.p); bulges.push(bulge); }
    });
    if (pts.length > 1 && Math.hypot(pts[0]![0] - pts[pts.length - 1]![0], pts[0]![1] - pts[pts.length - 1]![1]) < 1e-7) { pts.pop(); bulges.pop(); } // (the last point is the first: the piece between them is none)
    return { pts, bulges };
  };
  /** whether the outline crosses itself (the edges of a strong spiral, as circles, can cross: then there is no cutout to make) */
  const crosses = (o: { pts: P[]; bulges: number[] }): boolean => {
    const f = flatten(o.pts, o.bulges, 6), m = f.length;
    const side2 = (a: P, b: P, c: P): number => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    for (let i = 0; i < m; i++) for (let j = i + 2; j < m; j++) { if (i === 0 && j === m - 1) continue; const [a, b, c, d] = [f[i]!, f[(i + 1) % m]!, f[j]!, f[(j + 1) % m]!]; if (side2(a, b, c) !== side2(a, b, d) && side2(c, d, a) !== side2(c, d, b)) return true; }
    return false;
  };
  /** the outline for the radii scaled by `q` (null where it cannot be: a fillet that does not exist, or the pieces out of order) */
  const build = (q: number): Node[] | null => {
    const nodes: Node[] = [];
    let a: Round | null = null, b: Round | null = null, c: Round | null = null, d: Round | null = null, vi: Round | null = null, vo: Round | null = null;
    if (innerArc) { a = roundArc(rIn, false, k1, A, B, 1, q); d = roundArc(rIn, false, k2, D, C, -1, q); if (!a || !d) return null; }
    else { vi = roundV(Vi, B, C, q); if (!vi) return null; }
    if (outerArc) { b = roundArc(rOut, true, k1, B, A, 1, q); c = roundArc(rOut, true, k2, C, D, -1, q); if (!b || !c) return null; }
    else { vo = roundV(Vo, A, D, q); if (!vo) return null; }
    const start = innerArc ? a!.b : vi!.a, end1 = outerArc ? b!.b : vo!.a, start2 = outerArc ? c!.b : vo!.b, end2 = innerArc ? d!.b : vi!.b;
    if (!(rad(start) < rad(end1) - 1e-6) || !(rad(start2) > rad(end2) + 1e-6)) return null;
    if (outerArc && !(cross(b!.a, c!.a) > 1e-9)) return null;
    if (innerArc && !(cross(a!.a, d!.a) > 1e-9)) return null;
    nodes.push({ p: start, t: "e1" });
    if (outerArc) nodes.push({ p: b!.b, t: "f", mid: b!.mid }, { p: b!.a, t: "oa" }, { p: c!.a, t: "f", mid: c!.mid }, { p: c!.b, t: "e2" });
    else nodes.push({ p: vo!.a, t: "f", mid: vo!.mid }, { p: vo!.b, t: "e2" });
    if (innerArc) nodes.push({ p: d!.b, t: "f", mid: d!.mid }, { p: d!.a, t: "ia" }, { p: a!.a, t: "f", mid: a!.mid });
    else nodes.push({ p: vi!.b, t: "f", mid: vi!.mid });
    // no piece of the outline is shorter than 0.15 mm (a sliver the kernel cannot make): the radii are made smaller until none is
    for (let i = 0; i < nodes.length; i++) { const dd = Math.hypot(nodes[i]!.p[0] - nodes[(i + 1) % nodes.length]!.p[0], nodes[i]!.p[1] - nodes[(i + 1) % nodes.length]!.p[1]); if (dd > 1e-7 && dd < 0.15) return null; }
    return crosses(assemble(nodes)) ? null : nodes;
  };
  // the biggest share of the radii the room allows: all of them if they fit, else found by halving (a share of 0 is sharp corners)
  let q = 1, nodes = build(1);
  if (!nodes) {
    let [lo, hi] = [0, 1];
    nodes = build(0);
    if (!nodes) return null;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2, tried = build(mid); if (tried) { lo = mid; nodes = tried; } else hi = mid; }
    q = lo;
  }
  void q;
  const { pts, bulges } = assemble(nodes);
  return pts.length >= 3 ? { pts, bulges, narrow: Math.min(innerArc ? open(rIn) : 0, outerArc ? open(rOut) : 0) } : null;
}

/** Why the numbers make no wheel, or null: only what is no solid at all (a size that is not more than 0, a hub bigger than the rim); never a size that is hard to make, nor a thickness in any ratio to the diameter (the spokes are as thick as the rim and hub at the most, and the wheel may be flat or very thin) */
export function wheelProblem(s: WheelSpec, cutting = false): string | null {
  const n = Math.round(s.spokes);
  if (![s.outer, s.rimD, s.hub, s.rimT, s.web, s.hubT].every((v) => v > 0) || (cutting ? !(s.bore >= 0) : !(s.bore > 0))) return "every size must be more than 0";
  if (![s.cornerKind, s.edgeKind, s.rimJoinKind, s.hubJoinKind].every((k) => k === 0 || k === 1)) return "a radius is a fillet (0) or a chamfer (1)";
  if (![s.edge, s.corner, s.obtuse, s.rimJoin, s.hubJoin, s.rimOff, s.hubOff, s.spokeW].every((v) => v >= 0)) return "a radius, an offset and a width are 0 or more";
  if (s.rimMax > 0 && s.rimD > s.rimMax + 1e-6) return `the rim diameter must stay inside the roots of the teeth: ${s.rimMax.toFixed(1)} mm at most`;
  if (s.rimD > s.outer - 2 * THIN) return `the rim diameter must be less than the outer diameter: ${(s.outer - 2 * THIN).toFixed(1)} mm at most`;
  if (s.hub > s.rimD - 2 * THIN) return "the hub diameter must be less than the rim diameter: the web goes between them";
  if (s.hub < s.bore + 2 * THIN) return "the hub diameter must be more than the bore diameter";
  if (!(s.draft >= 0 && s.draft <= 15)) return "the draft is 0 (machined) to 15 degrees";
  if (n < 0 || n === 1 || n === 2 || n > 60) return "0 spokes is a plain web; otherwise 3 to 60 spokes";
  if (cutting && (s.hubT !== s.rimT || s.draft !== 0)) return "a wheel cut into a body is as thick as the body and has no draft";
  return null;
}

/**
 * The wheel's numbers made to fit together: the numbers not typed (`locked` holds the typed ones, the outer diameter among them) follow the ones that are, and are moved only as far as they must for the wheel to be a solid at all. Where they were
 * not typed the hub and its thickness follow the bore, the joins follow the spoke thickness, the obtuse radius the spoke join radius (bigger the more the spokes spiral). The typed numbers are never moved here.
 */
export function repairWheel(s0: WheelSpec, locked: ReadonlySet<string>, cutting = false): WheelSpec {
  const n: WheelSpec = { ...s0 };
  const key = (k: keyof WheelSpec): boolean => !locked.has(k);
  const to = (k: keyof WheelSpec, v: number): void => { if (key(k)) n[k] = Math.round(v * 100) / 100; };
  // what follows what, while it is not typed: a hub is about 2.75 bores across and 2.25 thick (the start's proportions), a join 3/4 of the spoke thickness
  if (locked.has("bore") && key("hub") && n.bore > 0) to("hub", 2.75 * n.bore); // (no bore, no rule: a hub is its usual share of the wheel)
  if (locked.has("hub") && key("bore")) to("bore", n.hub / 2.75);
  if (locked.has("bore") && key("hubT") && !cutting) to("hubT", 2.25 * n.bore);
  if (cutting && key("hubT")) to("hubT", n.rimT); // (a wheel cut into a body is as thick at the hub as at the rim)
  if (locked.has("web") && key("rimJoin")) to("rimJoin", 0.75 * n.web);
  if (locked.has("web") && key("hubJoin")) to("hubJoin", 0.75 * n.web);
  for (let pass = 0; pass < 6; pass++) {
    const before = JSON.stringify(n);
    if (key("draft")) to("draft", Math.min(15, Math.max(0, n.draft)));
    if (key("spokes")) { const k = Math.round(n.spokes); to("spokes", k === 1 || k === 2 ? 3 : Math.min(60, Math.max(0, k))); }
    for (const kk of ["cornerKind", "edgeKind", "rimJoinKind", "hubJoinKind"] as const) if (key(kk)) to(kk, Math.round(n[kk]) === 1 ? 1 : 0);
    for (const k of ["edge", "corner", "rimJoin", "hubJoin", "rimOff", "hubOff", "spokeW"] as const) if (key(k)) to(k, Math.max(0, n[k]));
    if (key("web")) to("web", Math.max(THIN, n.web));
    // a solid: the bore inside the hub, the hub inside the rim, the rim inside the outer diameter, the web the thinnest
    if (n.hub < n.bore + 2 * THIN) { if (key("hub")) to("hub", n.bore + 2 * THIN); else if (key("bore") && !(cutting && n.bore === 0)) to("bore", Math.max(cutting ? 0 : 0.1, n.hub - 2 * THIN)); }
    if (n.rimD < n.hub + 2 * THIN) { if (key("rimD")) to("rimD", n.hub + 2 * THIN); else if (key("hub")) to("hub", Math.max(n.bore + 2 * THIN, n.rimD - 2 * THIN)); }
    if (n.rimD > n.outer - 2 * THIN && key("rimD")) to("rimD", n.outer - 2 * THIN);
    if (n.rimMax > 0 && n.rimD > n.rimMax && key("rimD")) to("rimD", n.rimMax);
    if (n.hub > n.rimD - 2 * THIN && key("hub")) to("hub", Math.max(n.bore + 2 * THIN, n.rimD - 2 * THIN));
    for (const k of ["rimT", "hubT"] as const) if (n.web > n[k]) { if (key(k)) to(k, n.web); else if (key("web")) to("web", n[k]); }
    // the draft leaves the rim and the hub a wall at their faces
    const tn = Math.tan((n.draft * Math.PI) / 180), rimWall = (n.outer - n.rimD) / 2 - tn * (n.rimT - n.web / 2), hubWall = n.hub / 2 - tn * (n.hubT - n.web) / 2 - n.bore / 2;
    if ((rimWall < THIN || hubWall < THIN) && key("draft")) to("draft", Math.max(0, Math.min(15, (Math.atan(Math.max(0, Math.min((n.outer - n.rimD) / 2, n.hub / 2 - n.bore / 2) - THIN) / Math.max(1e-6, Math.max(n.rimT - n.web / 2, (n.hubT - n.web) / 2))) * 180) / Math.PI)));
    if (JSON.stringify(n) === before) break;
  }
  // a wheel cut into a body: the spokes are 0.4 of its thickness while that is not typed
  if (cutting && key("web")) to("web", Math.min(n.web, 0.4 * n.rimT));
  // the obtuse radius: while it is not typed it follows the spoke join radius, bigger the more the spokes spiral (a blunt corner needs a bigger radius to look natural)
  if (key("obtuse")) to("obtuse", n.corner * (1 + Math.abs(n.spiral) / 20));
  return n;
}

const rotate = (c: Cut, a: number): Cut => ({ pts: c.pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)] as P), bulges: c.bulges, narrow: c.narrow });
/** whether the round on the cutouts' edges is made: there is one, and the cutout is wide enough at both ends for a round on each side of it (a cutout that ends in a point, or is narrow, has none: the kernel cannot round it) */
export function edgeMade(s0: WheelSpec): boolean {
  const s = effective(s0), c = Math.round(s.spokes) > 0 ? cutout(s) : null;
  return s.edge > 0 && !!c && c.narrow > 4 * s.edge;
}

/** The picture of the wheel in plan: rim, hub, bore and the cutouts */
export function wheelLines(s0: WheelSpec): [number, number][][] {
  const s = effective(s0), g = wheelGeometry(s), n = Math.round(s.spokes), ring = (r: number, k = 48): P[] => Array.from({ length: k + 1 }, (_, i) => [r * Math.cos((2 * Math.PI * i) / k), r * Math.sin((2 * Math.PI * i) / k)] as P);
  const lines = [ring(g.R, 64), ring(g.Rin, 64), ring(g.hubR), ring(s.bore / 2, 24)];
  const c = n > 0 ? cutout(s) : null;
  if (c) for (let k = 0; k < n; k++) { const r = rotate(c, (2 * Math.PI * k) / n), f = flatten(r.pts, r.bulges); lines.push([...f, f[0]!]); }
  return lines;
}


/**
 * The picture of the wheel in space (`in_1251`): the rim, the hub and the bore as circles on both faces, the floors of the web, and the cutouts at the web's two faces, with a few lines along the axis between the faces, so that how thick each part is can
 * be seen. Lines of points (x, y, z) of the wheel's own frame.
 */
export function wheelLines3(s0: WheelSpec): [number, number, number][][] {
  const s = effective(s0), g = wheelGeometry(s), n = Math.round(s.spokes), zr = s.rimT / 2, zh = s.hubT / 2, zw = s.web / 2;
  const ring = (r: number, z: number, k = 48): [number, number, number][] => Array.from({ length: k + 1 }, (_, i) => [r * Math.cos((2 * Math.PI * i) / k), r * Math.sin((2 * Math.PI * i) / k), z]);
  const lines: [number, number, number][][] = [];
  for (const sg of [-1, 1]) {
    lines.push(ring(g.R, sg * zr, 64), ring(g.Rin, sg * zr, 64), ring(g.hubR, sg * zh));
    if (s.bore > 0) lines.push(ring(s.bore / 2, sg * zh, 24));
    if (zw < zr - 1e-3) lines.push(ring(g.Rin, sg * zw, 64));
    if (zw < zh - 1e-3) lines.push(ring(g.hubR, sg * zw));
  }
  const c = n > 0 ? cutout(s) : null;
  if (c) for (let k = 0; k < n; k++) { const r = rotate(c, (2 * Math.PI * k) / n), f = flatten(r.pts, r.bulges); for (const sg of [-1, 1]) lines.push([...f, f[0]!].map(([x, y]) => [x, y, sg * zw] as [number, number, number])); }
  for (let k = 0; k < 8; k++) { // (a few lines along the axis: the rim, the hub and the bore)
    const a = (2 * Math.PI * k) / 8, [co, si] = [Math.cos(a), Math.sin(a)];
    lines.push([[g.R * co, g.R * si, -zr], [g.R * co, g.R * si, zr]], [[g.hubR * co, g.hubR * si, -zh], [g.hubR * co, g.hubR * si, zh]]);
    if (s.bore > 0 && k % 2 === 0) lines.push([[(s.bore / 2) * co, (s.bore / 2) * si, -zh], [(s.bore / 2) * co, (s.bore / 2) * si, zh]]);
  }
  return lines;
}

/**
 * The lines of the wheel's picture that the number being edited is (`in_1380`): the outside and the inside of the rim, the hub and the bore as circles on both faces, the rim's and the hub's thickness as the lines along the axis,
 * the web's as its floors, and every spoke number as the outlines of the cutouts. Nothing for a number that has no line of its own.
 */
export function wheelMarks3(s0: WheelSpec, key: string): [number, number, number][][] {
  const s = effective(s0), g = wheelGeometry(s), n = Math.round(s.spokes), zr = s.rimT / 2, zh = s.hubT / 2, zw = s.web / 2;
  const ring = (r: number, z: number, k = 64): [number, number, number][] => Array.from({ length: k + 1 }, (_, i) => [r * Math.cos((2 * Math.PI * i) / k), r * Math.sin((2 * Math.PI * i) / k), z]);
  const both = (r: number, z: number): [number, number, number][][] => [ring(r, -z), ring(r, z)];
  const along = (r: number, z: number): [number, number, number][][] => Array.from({ length: 8 }, (_, k) => { const a = (2 * Math.PI * k) / 8; return [[r * Math.cos(a), r * Math.sin(a), -z], [r * Math.cos(a), r * Math.sin(a), z]] as [number, number, number][]; });
  switch (key) {
    case "outer": return both(g.R, zr);
    case "rimD": return both(g.Rin, zr);
    case "hub": return both(g.hubR, zh);
    case "bore": return s.bore > 0 ? both(s.bore / 2, zh) : [];
    case "rimT": return along(g.R, zr);
    case "hubT": return along(g.hubR, zh);
    case "web": return [ring(g.Rin, -zw), ring(g.Rin, zw), ring(g.hubR, -zw), ring(g.hubR, zw)];
    default: {
      if (!["spokes", "spokeW", "taper", "spiral", "rimOff", "hubOff", "edge", "corner", "obtuse"].includes(key) || n <= 0) return [];
      const c = cutout(s);
      if (!c) return [];
      const out: [number, number, number][][] = [];
      for (let k = 0; k < n; k++) { const r = rotate(c, (2 * Math.PI * k) / n), f = flatten(r.pts, r.bulges); for (const sg of [-1, 1]) out.push([...f, f[0]!].map(([x, y]) => [x, y, sg * zw] as [number, number, number])); }
      return out;
    }
  }
}

/** The section of the rim, web and hub (x out from the axis, y along it), the four places the web meets them joined by a fillet or a chamfer: the points and the bulges of the sides. The walls of the rim and of the hub lean by the draft away from the
 * middle plane (a cast wheel's pattern is split there): the rim's outside is smaller at the faces, its inside bigger, the hub's outside smaller; the nominal radii are those at the middle plane, at the web's faces for the walls beside it */
export function wheelSection(s0: WheelSpec): { pts: P[]; bulges: number[] } {
  const s = effective(s0), g = wheelGeometry(s), b = s.bore / 2, H = s.hubT / 2, W = s.rimT / 2, t = s.web / 2;
  const dr = (s.draft * Math.PI) / 180, [sn, cs, tn] = [Math.sin(dr), Math.cos(dr), Math.tan(dr)];
  const rimOutFace = g.R - tn * W, rimInFace = g.Rin + tn * (W - t), hubFace = g.hubR - tn * (H - t);
  const pts: P[] = [], bulges: number[] = [];
  const add = (p: P, k = 0): void => { const l = pts.length - 1; if (l >= 0 && Math.hypot(pts[l]![0] - p[0], pts[l]![1] - p[1]) < 1e-7) { bulges[l] = k; return; } pts.push(p); bulges.push(k); }; // (a point on the one before is that point)
  /** a concave corner at `c`, reached going `d1` and left going `d2` (a right turn), joined by a fillet or a chamfer of size `f` (0: the corner is square): the two points either side of it, and a fillet's bulge between them */
  const corner = (c: P, d1: P, d2: P, f: number, kind: number): void => {
    if (f < 1e-6) { add(c); return; }
    const fillet = Math.round(kind) === 0, tau = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1]))), L = fillet ? f * Math.tan(tau / 2) : f;
    const t1: P = [c[0] - d1[0] * L, c[1] - d1[1] * L], t2: P = [c[0] + d2[0] * L, c[1] + d2[1] * L];
    if (!fillet) { add(t1); add(t2); return; }
    const o: P = [t1[0] + d1[1] * f, t1[1] - d1[0] * f], toC = unit([c[0] - o[0], c[1] - o[1]]);
    add(t1, bulgeOf(t1, [o[0] + toC[0] * f, o[1] + toC[1] * f], t2)); add(t2);
  };
  if (b > 0) { add([b, -H]); add([hubFace, -H]); } else { add([0, -H]); add([hubFace, -H]); }
  corner([g.hubR, -t], [sn, cs], [1, 0], s.hubJoin, s.hubJoinKind);
  corner([g.Rin, -t], [1, 0], [sn, -cs], s.rimJoin, s.rimJoinKind);
  add([rimInFace, -W]); add([rimOutFace, -W]); if (tn > 0) add([g.R, 0]); add([rimOutFace, W]); add([rimInFace, W]);
  corner([g.Rin, t], [-sn, -cs], [-1, 0], s.rimJoin, s.rimJoinKind);
  corner([g.hubR, t], [-1, 0], [-sn, cs], s.hubJoin, s.hubJoinKind);
  add([hubFace, H]); add(b > 0 ? [b, H] : [0, H]);
  // a wheel as thick at the web as at the rim and the hub has points in a straight line: only the corners are kept
  if (pts.length > 1 && Math.hypot(pts[0]![0] - pts[pts.length - 1]![0], pts[0]![1] - pts[pts.length - 1]![1]) < 1e-7) { pts.pop(); bulges.pop(); }
  for (let i = pts.length - 1; i >= 0 && pts.length > 3; i--) {
    const [a, c, d] = [pts[(i + pts.length - 1) % pts.length]!, pts[i]!, pts[(i + 1) % pts.length]!];
    if (Math.abs(bulges[i]!) < 1e-9 && Math.abs(bulges[(i + pts.length - 1) % pts.length]!) < 1e-9 && Math.abs((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) < 1e-9 && (c[0] - a[0]) * (d[0] - c[0]) + (c[1] - a[1]) * (d[1] - c[1]) > 0) { pts.splice(i, 1); bulges.splice(i, 1); }
  }
  return { pts, bulges };
}

/** The edges of the cutouts at the web's two faces that get a round (a second part, made once the kernel has the wheel: its edges are named by where they are) */
function edgeRounds(b: Builder, s: WheelSpec): void {
  const loops = wheelLines(s).slice(4), t = s.web / 2;
  const near = (x: number, y: number): boolean => loops.some((l) => l.some((p, i) => { const q = l[(i + 1) % l.length]!, [dx, dy] = [q[0] - p[0], q[1] - p[1]], len2 = dx * dx + dy * dy, u = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / len2)); return Math.hypot(x - p[0] - u * dx, y - p[1] - u * dy) < 0.06; }));
  b.part("Edge rounds");
  b.roundEdges((sc, toModel, edgeAt) => Object.values(sc.parts).flatMap((p) => {
    if (p.kind !== "line" || p.origin !== "body") return [];
    const e = edgeAt(p.ref);
    if (!e) return [];
    const pts = [e.a, e.b, e.mid].map(toModel);
    return pts.every((q) => Math.abs(q[2]) >= t - 0.02 && near(q[0], q[1])) ? [p.ref as Ref] : [];
  }), Math.round(s.edgeKind) === 1 ? "chamfer" : "fillet", s.edge);
}

/** The wheel as the steps of one part: the section turned about the axis, then the cutouts (the spokes are what is left between them) cut through the web, then a round on the edges of the cutouts */
export function wheelSteps(s0: WheelSpec, place: Place): Result<ModelBuild> {
  const bad = wheelProblem(s0);
  if (bad) return err(bad);
  const s = effective(s0), n = Math.round(s.spokes), b = new Builder(place), sec = wheelSection(s), c = n > 0 ? cutout(s) : null;
  b.part("Wheel");
  const side = b.frame([0, 0, 0], [1, 0, 0], [0, 0, 1]); // (the section across the wheel: x out from the axis, y up it)
  b.turn(side, sec.pts, sec.bulges, [0, 0, 0], [0, 0, 1]);
  if (c) {
    const cuts: Shape[] = Array.from({ length: n }, (_, k) => { const r = rotate(c, (2 * Math.PI * k) / n); return outline(r.pts, r.bulges); });
    const depth = s.web + 2;
    b.extrude(b.plane(-s.web / 2 - 1), cuts[0]!, [], depth, { mode: "cut", also: cuts.slice(1).map((o) => ({ outer: o, depth })) });
    if (edgeMade(s)) edgeRounds(b, s);
  }
  return ok(b.build());
}

/**
 * The same wheel cut into a round body that is there already (a gear, a disc, a ring: `roundbody.ts`), keeping its bore and its outside edge: the rim and the hub stay as thick as the body, the web between them is cut down from both faces to its own
 * thickness (a pocket on each face, then the join radii where the pocket's floor meets the hub and the rim), and the cutouts are cut through the web. Parts, made one after another as the kernel answers: the pockets, the joins, the cutouts,
 * and a round on the cutouts' edges.
 */
export function wheelCutSteps(s0: WheelSpec, place: Place): Result<ModelBuild> {
  const bad = wheelProblem(s0, true);
  if (bad) return err(bad);
  const s = effective(s0), g = wheelGeometry(s), n = Math.round(s.spokes), T = s.rimT / 2, t = s.web / 2, dip = T - t, b = new Builder(place), c = n > 0 ? cutout(s) : null;
  const radial = (p: Vec3): number => Math.hypot(p[0], p[1]);
  /** the circles of the pocket's floors at radius `r`: the corner where the floor meets the wall */
  const floorEdges = (r: number) => (sc: Scene, toModel: (p: Vec3) => Vec3, edgeAt: (ref: Ref) => { a: Vec3; b: Vec3; mid: Vec3 } | null): Ref[] => Object.values(sc.parts).flatMap((p) => {
    if (p.kind !== "line" || p.origin !== "body") return [];
    const e = edgeAt(p.ref);
    if (!e) return [];
    const pts = [e.a, e.b, e.mid].map(toModel);
    return pts.every((q) => Math.abs(Math.abs(q[2]) - t) < 0.02 && Math.abs(radial(q) - r) < 0.03) ? [p.ref as Ref] : [];
  });
  if (s.boreOwned !== 1 && s.bore > 0) { b.part("Bore"); b.extrude(b.plane(-T - 1), disc0(0, 0, s.bore / 2), [], 2 * T + 2, { mode: "cut" }); } // (a body with no bore is given one: round, or with the gear maker's flat or keyway)
  b.part("Pockets");
  if (dip > 0.001) {
    b.extrude(b.plane(T + 0.5), disc0(0, 0, g.Rin), [disc0(0, 0, g.hubR)], -(dip + 0.5), { mode: "cut" });
    b.extrude(b.plane(-T - 0.5), disc0(0, 0, g.Rin), [disc0(0, 0, g.hubR)], dip + 0.5, { mode: "cut" });
    if (s.hubJoin > 0 || s.rimJoin > 0) {
      b.part("Joins");
      if (s.hubJoin > 0) b.roundEdges(floorEdges(g.hubR), Math.round(s.hubJoinKind) === 1 ? "chamfer" : "fillet", s.hubJoin);
      if (s.rimJoin > 0) b.roundEdges(floorEdges(g.Rin), Math.round(s.rimJoinKind) === 1 ? "chamfer" : "fillet", s.rimJoin);
    }
  }
  if (c) {
    b.part("Cutouts");
    const cuts: Shape[] = Array.from({ length: n }, (_, k) => { const r = rotate(c, (2 * Math.PI * k) / n); return outline(r.pts, r.bulges); });
    const depth = s.web + 2;
    b.extrude(b.plane(-t - 1), cuts[0]!, [], depth, { mode: "cut", also: cuts.slice(1).map((o) => ({ outer: o, depth })) });
    if (edgeMade(s)) edgeRounds(b, s);
  }
  return ok(b.build());
}

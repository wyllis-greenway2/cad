// A wheel as a model (`dec_hub_spoke`): a rim, a web and a hub as ONE body, the way a cast or machined wheel is made. The human's own recipe (`in_1236`): the plainest form is a web joining the rim and the hub, with a fillet or chamfer of a set size
// where the web meets each; the spokes are cutouts in that web (their number, how far they stop short of the hub and the rim, the fillet in each corner of a cutout, the width of a spoke and how much it tapers, and a spiral). No corner is ever left
// square. The wheel stands along z with its middle at z = 0. Pure: numbers in, steps out.
import { Builder, outline } from "./modelparts.ts";
import type { Place, ModelBuild, Shape } from "./modelparts.ts";
import { bulgeOf, arcMid } from "./arcs.ts";
import type { P } from "./arcs.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";

/** The numbers of a wheel (mm): `joinKind` 0 a fillet, 1 a chamfer, at the four places the web meets the rim and the hub; `spokes` 0 a plain web, else the number of cutouts; `rimOff` and `hubOff` how far a cutout stops short of the rim's
 * and the hub's walls; `corner` the fillet in each corner of a cutout; `spokeW` the width of a spoke at the hub end; `taper` how much narrower it is at the rim end (a share, negative: wider); `spiral` degrees a spoke turns from hub to rim; `draft` degrees the walls of the rim and the hub lean away from the middle (0 for a machined wheel, 1 to 3 for a cast one, `in_1238`) */
export interface WheelSpec { outer: number; width: number; rim: number; hub: number; hubLen: number; bore: number; web: number; joinKind: number; join: number; spokes: number; rimOff: number; hubOff: number; corner: number; spokeW: number; taper: number; spiral: number; draft: number }
export const WHEEL_START: WheelSpec = { outer: 80, width: 14, rim: 5, hub: 22, hubLen: 18, bore: 8, web: 4, joinKind: 0, join: 3, spokes: 5, rimOff: 6, hubOff: 6, corner: 3, spokeW: 10, taper: 0.3, spiral: 0, draft: 2 };
/** the least a printed or cast part is thick (mm), and the least fillet or chamfer (0.030 in, the Batesville guide's least radius) */
const THIN = 1.2, LEAST_JOIN = 0.8;
/** a cutout that runs right into the hub or the rim (an offset of 0) reaches this far into it: a cut that ends exactly on the wall's own face is not a solid the kernel will make */
const RUN_IN = 0.05;

/** The radii: the rim's outside and inside, the hub's, and the circles the cutouts lie between (each offset is measured from the rim's or the hub's wall: 0 and the spokes run into it, less than the join and the cutout cuts into the fillet) */
export function wheelGeometry(s: WheelSpec): { R: number; Rin: number; hubR: number; rIn: number; rOut: number } {
  const R = s.outer / 2, Rin = R - s.rim, hubR = s.hub / 2;
  return { R, Rin, hubR, rIn: hubR + Math.max(s.hubOff, 0) - (s.hubOff <= 0 ? RUN_IN : 0), rOut: Rin - Math.max(s.rimOff, 0) + (s.rimOff <= 0 ? RUN_IN : 0) };
}

type Cut = { pts: P[]; bulges: number[] };
const unit = (v: P): P => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1];
const polylineLength = (l: P[]): number => l.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - l[i]![0], p[1] - l[i]![1]), 0);
/** `l` without the first `d` mm of its length (it starts at the point that far along), or null if it is no longer than that */
function trimStart(l: P[], d: number): P[] | null {
  let left = d;
  for (let i = 0; i + 1 < l.length; i++) {
    const seg = Math.hypot(l[i + 1]![0] - l[i]![0], l[i + 1]![1] - l[i]![1]);
    if (left < seg) { const t = left / seg; return [[l[i]![0] + (l[i + 1]![0] - l[i]![0]) * t, l[i]![1] + (l[i + 1]![1] - l[i]![1]) * t], ...l.slice(i + 1)]; }
    left -= seg;
  }
  return null;
}

/** The cutout between spoke 0 (on the x axis) and spoke 1 (a turn of 2 pi / n on): its outline and the bulges of its sides, or why it cannot be made */
function cutout(s: WheelSpec): Cut | string {
  const g = wheelGeometry(s), n = Math.round(s.spokes), { rIn, rOut } = g;
  const span = rOut - rIn, spiral = (s.spiral * Math.PI) / 180;
  const hw = (rho: number): number => (s.spokeW / 2) * (1 - s.taper * ((rho - rIn) / span));
  /** the point of the edge of the spoke at angle `a0`, on its side `side` (+1 the turning-forward side), where its centre line is at radius `rho` */
  const edge = (a0: number, side: number, rho: number): P => {
    const th = a0 + spiral * ((rho - rIn) / span), dth = spiral / span;
    const c: P = [rho * Math.cos(th), rho * Math.sin(th)], d: P = [Math.cos(th) - rho * dth * Math.sin(th), Math.sin(th) + rho * dth * Math.cos(th)];
    const nrm = unit([-d[1], d[0]]), w = hw(rho) * side;
    return [c[0] + nrm[0] * w, c[1] + nrm[1] * w];
  };
  /** the centre line radius at which the edge is at radius `target` from the wheel's axis */
  const rhoAt = (a0: number, side: number, target: number): number => {
    let [lo, hi] = [target - s.spokeW - 1, target + s.spokeW + 1];
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; (Math.hypot(...edge(a0, side, mid)) < target ? (lo = mid) : (hi = mid)); }
    return (lo + hi) / 2;
  };
  const steps = spiral === 0 ? 1 : 14;
  const sample = (a0: number, side: number, from: number, to: number): P[] => Array.from({ length: steps + 1 }, (_, i) => edge(a0, side, from + ((to - from) * i) / steps));
  const a1 = 2 * Math.PI / n;
  const e1 = sample(0, 1, rhoAt(0, 1, rIn), rhoAt(0, 1, rOut));                                  // A to B, along the first spoke's turning-forward side
  const e2 = sample(a1, -1, rhoAt(a1, -1, rOut), rhoAt(a1, -1, rIn));                            // C to D, back along the next spoke's other side
  const [A, B, C, D] = [e1[0]!, e1[e1.length - 1]!, e2[0]!, e2[e2.length - 1]!];
  const r = s.corner, ang = (p: P): number => Math.atan2(p[1], p[0]);
  /** a corner of the cutout: the point, the circle it is on, the way along that circle away from it (+1 turning forward), the polyline of the edge leaving it and the length of the circle's side: how far the fillet cuts into the edge, where it touches the circle and its middle */
  const fil = (P0: P, R0: number, sigma: number, away: P[], arcLen: number): { d: number; arc: P; mid: P } | null => {
    const psi = ang(P0), tv: P = [-Math.sin(psi) * sigma, Math.cos(psi) * sigma];
    const probe = away.find((q) => Math.hypot(q[0] - P0[0], q[1] - P0[1]) > 1e-9) ?? P0, u = unit([probe[0] - P0[0], probe[1] - P0[1]]);
    const theta = Math.acos(Math.max(-1, Math.min(1, dot(u, tv))));
    if (theta < 0.2 || theta > Math.PI - 0.2) return null;
    const d = r / Math.tan(theta / 2);
    if (d > 0.45 * polylineLength(away) || d > 0.45 * arcLen) return null;
    const arc: P = [R0 * Math.cos(psi + (sigma * d) / R0), R0 * Math.sin(psi + (sigma * d) / R0)];
    const bis = unit([u[0] + tv[0], u[1] + tv[1]]), k = r / Math.sin(theta / 2), centre: P = [P0[0] + bis[0] * k, P0[1] + bis[1] * k];
    const toP = unit([P0[0] - centre[0], P0[1] - centre[1]]);
    return { d, arc, mid: [centre[0] + toP[0] * r, centre[1] + toP[1] * r] };
  };
  const outerLen = Math.hypot(B[0] - C[0], B[1] - C[1]), innerLen = Math.hypot(A[0] - D[0], A[1] - D[1]);
  const fa = fil(A, rIn, 1, e1, innerLen), fb = fil(B, rOut, 1, [...e1].reverse(), outerLen), fc = fil(C, rOut, -1, e2, outerLen), fd = fil(D, rIn, -1, [...e2].reverse(), innerLen);
  const FAIL = "the cutout is too small for the corner fillets: smaller corner fillets, fewer spokes, or narrower spokes";
  if (!fa || !fb || !fc || !fd) return FAIL;
  /** an edge with the fillets' cuts taken off both ends */
  const both = (l: P[], d0: number, d1: number): P[] | null => { const a = trimStart(l, d0); const b = a ? trimStart([...a].reverse(), d1) : null; return b ? b.reverse() : null; };
  const edge1 = both(e1, fa.d, fb.d), edge2 = both(e2, fc.d, fd.d);
  if (!edge1 || !edge2) return FAIL;
  const m = edge1.length, m2 = edge2.length;
  const pts: P[] = [...edge1, fb.arc, fc.arc, ...edge2, fd.arc, fa.arc], bulges: number[] = pts.map(() => 0);
  bulges[m - 1] = bulgeOf(edge1[m - 1]!, fb.mid, fb.arc);                                   // B's fillet
  bulges[m] = bulgeOf(fb.arc, arcMid([0, 0], rOut, fb.arc, fc.arc), fc.arc);                // the outer arc
  bulges[m + 1] = bulgeOf(fc.arc, fc.mid, edge2[0]!);                                       // C's fillet
  bulges[m + 1 + m2] = bulgeOf(edge2[m2 - 1]!, fd.mid, fd.arc);                             // D's fillet
  bulges[m + 2 + m2] = bulgeOf(fd.arc, arcMid([0, 0], rIn, fd.arc, fa.arc), fa.arc);        // the inner arc
  bulges[m + 3 + m2] = bulgeOf(fa.arc, fa.mid, edge1[0]!);                                  // A's fillet
  return { pts, bulges };
}

/** Why the numbers make no wheel, or null */
export function wheelProblem(s: WheelSpec): string | null {
  const g = wheelGeometry(s), n = Math.round(s.spokes);
  if (![s.outer, s.width, s.rim, s.hub, s.hubLen, s.bore, s.web, s.join].every((v) => v > 0)) return "every size must be more than 0";
  if (![0, 1].includes(Math.round(s.joinKind))) return "the join is a fillet (0) or a chamfer (1)";
  if (s.rim < THIN || s.web < THIN) return `the rim and the web must be at least ${THIN} mm thick`;
  if (s.hub - s.bore < 4) return "the hub must be at least 2 mm thick all round the bore: make the bore smaller or the hub bigger";
  if (s.join < LEAST_JOIN) return `a fillet or chamfer of less than ${LEAST_JOIN} mm (0.030 in) is not castable or machinable: no corner is left square`;
  if ((s.width - s.web) / 2 < s.join) return "the rim must stand proud of the web by at least the size of the join: a wider rim, a thinner web or a smaller join";
  if ((s.hubLen - s.web) / 2 < s.join) return "the hub must stand proud of the web by at least the size of the join: a longer hub, a thinner web or a smaller join";
  if (g.Rin - g.hubR < 2 * s.join + THIN) return "the hub is too big for the rim: there is no room for the web between them and the two joins";
  if (!(s.draft >= 0 && s.draft <= 10)) return "the draft is 0 (machined) to 10 degrees";
  if (s.rim - Math.tan((s.draft * Math.PI) / 180) * (s.width - s.web / 2) < THIN) return `the rim is thinner than ${THIN} mm at its faces once the draft has leaned its walls: less draft, a thicker rim or a narrower rim`;
  if (s.hub / 2 - Math.tan((s.draft * Math.PI) / 180) * (s.hubLen - s.web) / 2 - s.bore / 2 < 2) return "the hub is thinner than 2 mm at its faces once the draft has leaned its wall: less draft, a bigger hub or a shorter hub";
  if (n < 0 || n === 1 || n === 2 || n > 24) return "0 spokes is a plain web; otherwise 3 to 24 spokes";
  if (n === 0) return null;
  if (s.rimOff < 0 || s.hubOff < 0) return "the offsets are 0 or more";
  if (Math.abs(s.rimOff - s.join) < 0.4 || Math.abs(s.hubOff - s.join) < 0.4) return "a cutout that ends within 0.4 mm of where a join ends leaves a sliver: change the offset or the join size";
  if (s.corner < LEAST_JOIN) return `a corner fillet of less than ${LEAST_JOIN} mm (0.030 in) is not castable or machinable: no corner is left square`;
  if (g.rOut - g.rIn < 2 * s.corner + THIN) return "the cutouts are too short for their corner fillets: smaller fillets, smaller offsets or a bigger wheel";
  if (!(s.taper > -0.6 && s.taper < 0.8)) return "the taper is between -0.6 and 0.8 (a share of the width at the hub)";
  if (s.spokeW < THIN || s.spokeW * (1 - s.taper) < THIN) return `a spoke must be at least ${THIN} mm wide at both ends`;
  if (Math.abs(s.spiral) > 180) return "the spiral is at most 180 degrees";
  const gap = (r: number, w: number): number => (2 * Math.PI * r) / n - w;
  if (gap(g.rIn, s.spokeW) < 2 * s.corner + THIN || gap(g.rOut, s.spokeW * (1 - s.taper)) < 2 * s.corner + THIN) return "the spokes are too wide for their number: the gap between two is too small for the corner fillets";
  const c = cutout(s);
  return typeof c === "string" ? c : null;
}

/** an arc side as points: from `a` to `b` with the kernel's bulge */
function flatten(pts: P[], bulges: number[], per = 8): P[] {
  const out: P[] = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!, k = bulges[i] ?? 0;
    out.push(a);
    if (Math.abs(k) < 1e-9) return;
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(dx, dy), sag = k * len;
    const m: P = [(a[0] + b[0]) / 2 - (dy / len) * sag, (a[1] + b[1]) / 2 + (dx / len) * sag];
    const [x1, y1, x2, y2, x3, y3] = [a[0], a[1], m[0], m[1], b[0], b[1]];
    const dd = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(dd) < 1e-12) return;
    const cx = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / dd, cy = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / dd;
    const r = Math.hypot(x1 - cx, y1 - cy), a1 = Math.atan2(y1 - cy, x1 - cx), a3 = Math.atan2(y3 - cy, x3 - cx), a2 = Math.atan2(y2 - cy, x2 - cx);
    const wrap = (v: number): number => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const ccw = wrap(a2 - a1) < wrap(a3 - a1);
    const sweep = ccw ? wrap(a3 - a1) : -wrap(a1 - a3);
    for (let j = 1; j < per; j++) out.push([cx + r * Math.cos(a1 + (sweep * j) / per), cy + r * Math.sin(a1 + (sweep * j) / per)]);
  });
  return out;
}
const rotate = (c: Cut, a: number): Cut => ({ pts: c.pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)] as P), bulges: c.bulges });

/** The picture of the wheel in plan: rim, hub, bore and the cutouts */
export function wheelLines(s: WheelSpec): [number, number][][] {
  const g = wheelGeometry(s), n = Math.round(s.spokes), ring = (r: number, k = 48): P[] => Array.from({ length: k + 1 }, (_, i) => [r * Math.cos((2 * Math.PI * i) / k), r * Math.sin((2 * Math.PI * i) / k)] as P);
  const lines = [ring(g.R, 64), ring(g.Rin, 64), ring(g.hubR), ring(s.bore / 2, 24)];
  const c = n > 0 ? cutout(s) : null;
  if (c && typeof c !== "string") for (let k = 0; k < n; k++) { const r = rotate(c, (2 * Math.PI * k) / n), f = flatten(r.pts, r.bulges); lines.push([...f, f[0]!]); }
  return lines;
}

/** The section of the rim, web and hub (x out from the axis, y along it), the four places the web meets them joined by a fillet or a chamfer: the points and the bulges of the sides. The walls of the rim and of the hub lean by the draft away from the
 * middle plane (a cast wheel's pattern is split there): the rim's outside is smaller at the faces, its inside bigger, the hub's outside smaller; the nominal radii are those at the middle plane, at the web's faces for the walls beside it */
export function wheelSection(s: WheelSpec): { pts: P[]; bulges: number[] } {
  const g = wheelGeometry(s), b = s.bore / 2, H = s.hubLen / 2, W = s.width / 2, t = s.web / 2, f = s.join, fillet = Math.round(s.joinKind) === 0;
  const dr = (s.draft * Math.PI) / 180, [sn, cs, tn] = [Math.sin(dr), Math.cos(dr), Math.tan(dr)];
  const rimOutFace = g.R - tn * W, rimInFace = g.Rin + tn * (W - t), hubFace = g.hubR - tn * (H - t);
  const pts: P[] = [], bulges: number[] = [];
  const add = (p: P, k = 0): void => { pts.push(p); bulges.push(k); };
  /** a concave corner at `c`, reached going `d1` and left going `d2` (a right turn): the two points either side of it, and a fillet's bulge between them */
  const corner = (c: P, d1: P, d2: P): void => {
    const tau = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1]))), L = fillet ? f * Math.tan(tau / 2) : f;
    const t1: P = [c[0] - d1[0] * L, c[1] - d1[1] * L], t2: P = [c[0] + d2[0] * L, c[1] + d2[1] * L];
    if (!fillet) { add(t1); add(t2); return; }
    const o: P = [t1[0] + d1[1] * f, t1[1] - d1[0] * f], toC = unit([c[0] - o[0], c[1] - o[1]]);
    add(t1, bulgeOf(t1, [o[0] + toC[0] * f, o[1] + toC[1] * f], t2)); add(t2);
  };
  add([b, -H]); add([hubFace, -H]);
  corner([g.hubR, -t], [sn, cs], [1, 0]);
  corner([g.Rin, -t], [1, 0], [sn, -cs]);
  add([rimInFace, -W]); add([rimOutFace, -W]); if (tn > 0) add([g.R, 0]); add([rimOutFace, W]); add([rimInFace, W]);
  corner([g.Rin, t], [-sn, -cs], [-1, 0]);
  corner([g.hubR, t], [-1, 0], [-sn, cs]);
  add([hubFace, H]); add([b, H]);
  return { pts, bulges };
}

/** The wheel as the steps of one part: the section turned about the axis, then the cutouts (the spokes are what is left between them) cut through the web */
export function wheelSteps(s: WheelSpec, place: Place): Result<ModelBuild> {
  const bad = wheelProblem(s);
  if (bad) return err(bad);
  const n = Math.round(s.spokes), b = new Builder(place), sec = wheelSection(s);
  b.part("Wheel");
  const side = b.frame([0, 0, 0], [1, 0, 0], [0, 0, 1]); // (the section across the wheel: x out from the axis, y up it)
  b.turn(side, sec.pts, sec.bulges, [0, 0, 0], [0, 0, 1]);
  if (n > 0) {
    const c = cutout(s) as Cut, cuts: Shape[] = Array.from({ length: n }, (_, k) => { const r = rotate(c, (2 * Math.PI * k) / n); return outline(r.pts, r.bulges); });
    const depth = s.web + 2;
    b.extrude(b.plane(-s.web / 2 - 1), cuts[0]!, [], depth, { mode: "cut", also: cuts.slice(1).map((o) => ({ outer: o, depth })) });
  }
  return ok(b.build());
}

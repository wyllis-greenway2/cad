// A wheel as a model (`dec_hub_spoke`): a rim, a web and a hub as ONE body, the way a cast or machined wheel is made. The human's own recipe (`in_1236`): the plainest form is a web joining the rim and the hub, with a fillet or chamfer of a set size
// where the web meets each; the spokes are cutouts in that web (their number, how far they stop short of the hub and the rim, the fillet in each corner of a cutout, the width of a spoke and how much it tapers, and a spiral). No corner is ever left
// square. The wheel stands along z with its middle at z = 0. Pure: numbers in, steps out.
import { Builder, outline } from "./modelparts.ts";
import type { Place, ModelBuild, Shape } from "./modelparts.ts";
import { bulgeOf, arcMid } from "./arcs.ts";
import type { P } from "./arcs.ts";
import type { Ref } from "../shared/ref.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";

/** The numbers of a wheel (mm): `joinKind` 0 a fillet, 1 a chamfer, at the four places the web meets the rim and the hub; `spokes` 0 a plain web, else the number of cutouts; `rimOff` and `hubOff` how far a cutout stops short of the rim's
 * and the hub's walls; `corner` the fillet in each corner of a cutout; `spokeW` the width of a spoke at the hub end; `taper` how much narrower it is at the rim end (a share, negative: wider); `spiral` degrees a spoke turns from hub to rim; `edgeKind` 0 a fillet, 1 a chamfer, of `edge` mm (0: none) on the edges where the cutouts meet the web's faces (`in_1243`); `draft` degrees the walls of the rim and the hub lean away from the middle (0 for a machined wheel, 1 to 3 for a cast one, `in_1238`) */
export interface WheelSpec { outer: number; width: number; rim: number; hub: number; hubLen: number; bore: number; web: number; joinKind: number; join: number; spokes: number; rimOff: number; hubOff: number; corner: number; spokeW: number; taper: number; spiral: number; draft: number; edgeKind: number; edge: number }
export const WHEEL_START: WheelSpec = { outer: 80, width: 14, rim: 5, hub: 22, hubLen: 18, bore: 8, web: 4, joinKind: 0, join: 3, spokes: 5, rimOff: 6, hubOff: 6, corner: 3, spokeW: 10, taper: 0.3, spiral: 0, draft: 2, edgeKind: 0, edge: 1 };
/** the least a printed or cast part is thick (mm), and the least fillet or chamfer (0.030 in, the Batesville guide's least radius) */
const THIN = 1.2, LEAST_JOIN = 0.8;
/** a cutout that runs right into the hub or the rim (an offset of 0) reaches this far into it: a cut that ends exactly on the wall's own face is not a solid the kernel will make */
const RUN_IN = 0.05;
/** the least edge round on the cutouts (mm) */
const EDGE_LEAST = 0.3;

/** The radii: the rim's outside and inside, the hub's, and the circles the cutouts lie between (each offset is measured from the rim's or the hub's wall: 0 and the spokes run into it, less than the join and the cutout cuts into the fillet) */
export function wheelGeometry(s: WheelSpec): { R: number; Rin: number; hubR: number; rIn: number; rOut: number } {
  const R = s.outer / 2, Rin = R - s.rim, hubR = s.hub / 2;
  return { R, Rin, hubR, rIn: hubR + Math.max(s.hubOff, 0) - (s.hubOff <= 0 ? RUN_IN : 0), rOut: Rin - Math.max(s.rimOff, 0) + (s.rimOff <= 0 ? RUN_IN : 0) };
}

type Cut = { pts: P[]; bulges: number[] };
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
 * The cutout between spoke 0 (on the x axis) and spoke 1 (a turn of 2 pi / n on): its outline and the bulges of its sides, or why it cannot be made. Its sides are two spoke edges (a straight line, or with a spiral a circular arc through three
 * points of the curve), an outer and an inner circle about the axis, and a fillet of radius `corner` in each of the four corners, each tangent to both its sides exactly (so that a fillet or a chamfer along the edge can follow it).
 */
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
  const rhoAt = (a0: number, side: number, target: number): number => {
    let [lo, hi] = [target - s.spokeW - 1, target + s.spokeW + 1];
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; (Math.hypot(...edge(a0, side, mid)) < target ? (lo = mid) : (hi = mid)); }
    return (lo + hi) / 2;
  };
  const a1 = (2 * Math.PI) / n, FAIL = "the cutout is too small for the corner fillets: smaller corner fillets, fewer spokes, or narrower spokes";
  const curveOf = (a0: number, side: number): Curve | null => {
    const [r0, r1] = [rhoAt(a0, side, rIn), rhoAt(a0, side, rOut)], [p0, p1] = [edge(a0, side, r0), edge(a0, side, r1)];
    if (spiral === 0) return { line: true, p: p0, d: unit([p1[0] - p0[0], p1[1] - p0[1]]) };
    const c = circle3(p0, edge(a0, side, (r0 + r1) / 2), p1);
    return c ? { line: false, ...c } : { line: true, p: p0, d: unit([p1[0] - p0[0], p1[1] - p0[1]]) };
  };
  const [k1, k2] = [curveOf(0, 1), curveOf(a1, -1)];
  if (!k1 || !k2) return FAIL;
  const O: P = [0, 0], r = s.corner;
  const mA = edge(0, 1, (rIn + rOut) / 2), mB = edge(a1, -1, (rIn + rOut) / 2), M: P = [(mA[0] + mB[0]) / 2, (mA[1] + mB[1]) / 2]; // (a point inside the cutout)
  /** the fillet in the corner of the circle about the axis of radius `R0` (`outer`: the cutout is inside it) and the curve `k`: its tangent points on each and the middle of its arc */
  const fillet = (R0: number, outer: boolean, k: Curve): { onO: P; onK: P; mid: P } | null => {
    const dO = outer ? R0 - r : R0 + r;
    let cand: P[];
    if (k.line) {
      const nrm: P = [-k.d[1], k.d[0]], side = (M[0] - k.p[0]) * nrm[0] + (M[1] - k.p[1]) * nrm[1] > 0 ? 1 : -1;
      cand = crossLine(O, dO, [k.p[0] + nrm[0] * r * side, k.p[1] + nrm[1] * r * side], k.d);
    } else {
      const inside = Math.hypot(M[0] - k.c[0], M[1] - k.c[1]) < k.r; // (the cutout is inside this circle)
      cand = crossCircles(O, dO, k.c, inside ? k.r - r : k.r + r);
    }
    if (!cand.length) return null;
    const F = cand.sort((p, q) => Math.hypot(p[0] - M[0], p[1] - M[1]) - Math.hypot(q[0] - M[0], q[1] - M[1]))[0]!;
    const uO = unit([F[0], F[1]]), onO: P = [uO[0] * R0, uO[1] * R0];
    let onK: P;
    if (k.line) { const t0 = (F[0] - k.p[0]) * k.d[0] + (F[1] - k.p[1]) * k.d[1]; onK = [k.p[0] + k.d[0] * t0, k.p[1] + k.d[1] * t0]; }
    else { const u = unit([F[0] - k.c[0], F[1] - k.c[1]]); onK = [k.c[0] + u[0] * k.r, k.c[1] + u[1] * k.r]; }
    const ch: P = [(onO[0] + onK[0]) / 2 - F[0], (onO[1] + onK[1]) / 2 - F[1]], u = unit(ch);
    return { onO, onK, mid: [F[0] + u[0] * r, F[1] + u[1] * r] };
  };
  const [fa, fb, fc, fd] = [fillet(rIn, false, k1), fillet(rOut, true, k1), fillet(rOut, true, k2), fillet(rIn, false, k2)];
  if (!fa || !fb || !fc || !fd) return FAIL;
  const ang = (p: P): number => Math.atan2(p[1], p[0]), cross = (u: P, v: P): number => u[0] * v[1] - u[1] * v[0];
  // the order round the outline must hold: along the first edge A to B outward, the outer arc B to C turning forward, the second edge C to D inward, the inner arc D to A turning back
  const len = (p: P, q: P): number => Math.hypot(p[0] - q[0], p[1] - q[1]);
  if (len(fa.onK, fb.onK) < 0.2 || len(fc.onK, fd.onK) < 0.2 || cross(fb.onO, fc.onO) <= 0 || cross(fa.onO, fd.onO) <= 0 || Math.abs(ang(fc.onO) - ang(fb.onO)) < 1e-4) return FAIL;
  if ((Math.hypot(...fa.onK) > Math.hypot(...fb.onK) || Math.hypot(...fd.onK) > Math.hypot(...fc.onK))) return FAIL;
  const side = (k: Curve, p: P, q: P): number => (k.line ? 0 : bulgeOf(p, arcMid(k.c, k.r, p, q), q));
  const pts: P[] = [fa.onK, fb.onK, fb.onO, fc.onO, fc.onK, fd.onK, fd.onO, fa.onO];
  const bulges = [
    side(k1, fa.onK, fb.onK),                 // the first edge, A to B
    bulgeOf(fb.onK, fb.mid, fb.onO),          // B's fillet
    bulgeOf(fb.onO, arcMid(O, rOut, fb.onO, fc.onO), fc.onO), // the outer arc
    bulgeOf(fc.onO, fc.mid, fc.onK),          // C's fillet
    side(k2, fc.onK, fd.onK),                 // the second edge, C to D
    bulgeOf(fd.onK, fd.mid, fd.onO),          // D's fillet
    bulgeOf(fd.onO, arcMid(O, rIn, fd.onO, fa.onO), fa.onO),   // the inner arc
    bulgeOf(fa.onO, fa.mid, fa.onK),          // A's fillet
  ];
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
  if (s.edge < 0 || (s.edge > 0 && s.edge < EDGE_LEAST)) return `the spoke edge is 0 (none) or at least ${EDGE_LEAST} mm`;
  if (![0, 1].includes(Math.round(s.edgeKind))) return "the spoke edge is a fillet (0) or a chamfer (1)";
  if (s.edge > 0) {
    if (s.edge > 0.45 * s.web) return "the spoke edge is too big for the web: its round on each face takes up to 0.45 of the web's thickness";
    if (2 * s.edge > Math.min(s.spokeW, s.spokeW * (1 - s.taper)) - 0.4) return "the spoke edge is too big for the spoke: a spoke keeps a flat top of at least 0.4 mm";
    if (s.hubOff < s.edge + 0.4 || s.rimOff < s.edge + 0.4) return "with a spoke edge the cutouts must stop short of the hub and the rim by the edge's size and 0.4 mm (spokes that run into them have no edge round)";
  }
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

/**
 * The wheel's numbers made to fit together (`in_1240`): the numbers not typed (`locked` holds the typed ones, the Size among them) are moved, as far as they must, so that a number typed is met by the rest and the wheel can be made;
 * where they were not typed the hub and the hub's length follow the bore, the join follows the web. The typed numbers are never moved here: when they cannot all be met, `wheelProblem` says so and the box takes the typed number back.
 */
export function repairWheel(s0: WheelSpec, locked: ReadonlySet<string>): WheelSpec {
  const n: WheelSpec = { ...s0 };
  const key = (k: keyof WheelSpec): boolean => !locked.has(k);
  const to = (k: keyof WheelSpec, v: number): void => { if (key(k)) n[k] = Math.round(v * 100) / 100; };
  const cuts0 = (): boolean => Math.round(n.spokes) > 0;
  const R = (): number => n.outer / 2, rin = (): number => R() - n.rim, hubR = (): number => n.hub / 2;
  const tn = (): number => Math.tan((n.draft * Math.PI) / 180);
  // what follows what, while it is not typed: a hub is about 2.75 bores across and 2.25 long (the start's proportions), a join 3/4 of the web
  if (locked.has("bore") && key("hub")) to("hub", 2.75 * n.bore);
  if (locked.has("hub") && key("bore")) to("bore", n.hub / 2.75);
  if (locked.has("bore") && key("hubLen")) to("hubLen", 2.25 * n.bore);
  if (locked.has("web") && key("join")) to("join", 0.75 * n.web);
  for (let pass = 0; pass < 8; pass++) {
    const before = JSON.stringify(n);
    // ranges and floors
    if (key("draft")) to("draft", Math.min(10, Math.max(0, n.draft)));
    if (key("taper")) to("taper", Math.min(0.7, Math.max(-0.5, n.taper)));
    if (key("spokes")) { const k = Math.round(n.spokes); to("spokes", k === 1 || k === 2 ? 3 : Math.min(24, Math.max(0, k))); }
    if (key("joinKind")) to("joinKind", Math.round(n.joinKind) === 1 ? 1 : 0);
    if (key("edgeKind")) to("edgeKind", Math.round(n.edgeKind) === 1 ? 1 : 0);
    if (key("edge")) to("edge", Math.max(0, n.edge));
    for (const [k, v] of [["rim", THIN], ["web", THIN], ["join", LEAST_JOIN], ["corner", LEAST_JOIN], ["spokeW", THIN], ["bore", 1], ["hubOff", 0], ["rimOff", 0]] as [keyof WheelSpec, number][]) if (n[k] < v) to(k, v);
    // a spoke edge: the cutouts stop short of the hub and the rim by its size and 0.4 mm, and it is small enough for the web and a spoke's width
    if (cuts0() && n.edge > 0) {
      for (const o of ["hubOff", "rimOff"] as const) if (n[o] < n.edge + 0.4 && key(o)) to(o, n.edge + 0.4);
      const most = Math.min(0.45 * n.web, (Math.min(n.spokeW, n.spokeW * (1 - n.taper)) - 0.4) / 2, Math.min(n.hubOff, n.rimOff) - 0.4);
      if (n.edge > most && key("edge")) to("edge", most < EDGE_LEAST ? 0 : most);
    }
    // the hub's wall round the bore
    if (n.hub < n.bore + 4) { if (key("hub")) to("hub", n.bore + 4); else if (key("bore")) to("bore", Math.max(1, n.hub - 4)); }
    // the rim and the hub stand proud of the web by the join
    for (const [k, other] of [["width", "web"], ["hubLen", "web"]] as [keyof WheelSpec, keyof WheelSpec][]) {
      const need = n[other] + 2 * n.join + 0.01;
      if (n[k] < need) { if (key(k)) to(k, need); else if (key(other)) to(other, Math.max(THIN, n[k] - 2 * n.join - 0.01)); else if (key("join")) to("join", Math.max(LEAST_JOIN, (n[k] - n[other]) / 2 - 0.01)); }
    }
    // room between the hub and the rim for the web, the two joins and (with cutouts) a cutout and its corner fillets
    const cuts = Math.round(n.spokes) > 0;
    const need = (): number => Math.max(2 * n.join + THIN, cuts ? 2 * n.corner + THIN + n.hubOff + n.rimOff : 0);
    const room = (): number => rin() - hubR();
    if (room() < need()) {
      if (cuts) for (const k of ["hubOff", "rimOff"] as const) if (room() < need() && key(k)) to(k, Math.max(n.edge > 0 ? n.edge + 0.4 : 0, n[k] - (need() - room())));
      if (room() < need() && key("hub")) to("hub", Math.max(n.bore + 4, 2 * (rin() - need())));
      if (room() < need() && key("rim")) to("rim", Math.max(THIN, R() - hubR() - need()));
      if (room() < need() && key("join")) to("join", Math.max(LEAST_JOIN, (room() - THIN) / 2));
      if (room() < need() && cuts && key("corner")) to("corner", Math.max(LEAST_JOIN, (room() - THIN - n.hubOff - n.rimOff) / 2));
      if (room() < need() && key("bore") && n.hub - n.bore > 4) to("bore", Math.max(1, n.hub - 4));
    }
    // the draft leaves the rim and the hub thick enough at their faces
    const W = n.width / 2, H = n.hubLen / 2, t = n.web / 2;
    if (n.rim - tn() * (W + W - t) < THIN) { if (key("draft")) to("draft", (Math.atan(Math.max(0, n.rim - THIN) / (2 * W - t)) * 180) / Math.PI); else if (key("rim")) to("rim", THIN + tn() * (2 * W - t)); }
    if (n.hub / 2 - tn() * (H - t) - n.bore / 2 < 2) { if (key("draft")) to("draft", (Math.atan(Math.max(0, n.hub / 2 - n.bore / 2 - 2) / (H - t)) * 180) / Math.PI); else if (key("hub")) to("hub", n.bore + 4 + 2 * tn() * (H - t)); }
    // the cutouts: a spoke at least THIN wide at both ends and room between two for the corner fillets
    if (cuts) {
      if (n.spokeW * (1 - n.taper) < THIN) { if (key("taper")) to("taper", 1 - THIN / n.spokeW); else if (key("spokeW")) to("spokeW", THIN / (1 - n.taper)); }
      const g = wheelGeometry(n), k = Math.round(n.spokes);
      const gapIn = (2 * Math.PI * g.rIn) / k - 2 * n.corner - THIN, gapOut = (2 * Math.PI * g.rOut) / k - 2 * n.corner - THIN;
      if (n.spokeW > gapIn || n.spokeW * (1 - n.taper) > gapOut) {
        if (key("spokeW")) to("spokeW", Math.max(THIN, Math.min(gapIn, gapOut / Math.max(0.1, 1 - n.taper))));
        else if (key("corner")) to("corner", Math.max(LEAST_JOIN, Math.min((2 * Math.PI * g.rIn) / k - n.spokeW - THIN, (2 * Math.PI * g.rOut) / k - n.spokeW * (1 - n.taper) - THIN) / 2));
        else if (key("spokes") && k > 3) to("spokes", k - 1);
      }
      // an offset that ends within 0.4 mm of where a join ends leaves a sliver: it goes a little short of it, or a little past
      for (const o of ["hubOff", "rimOff"] as const) if (Math.abs(n[o] - n.join) < 0.4 && key(o)) to(o, n.join >= 0.9 ? n.join - 0.5 : n.join + 0.4);
    }
  }
  // the corner fillets must fit the cutout (a strong spiral or a wide taper makes one corner sharp): smaller fillets, then a gentler spiral
  for (let i = 0; i < 10 && Math.round(n.spokes) > 0 && wheelProblem(n) !== null; i++) {
    const c = cutout(n);
    if (typeof c !== "string") break;
    if (key("corner") && n.corner > LEAST_JOIN) to("corner", Math.max(LEAST_JOIN, n.corner * 0.8));
    else if (key("spiral") && n.spiral !== 0) to("spiral", Math.abs(n.spiral) < 4 ? 0 : n.spiral * 0.8);
    else if (key("spokeW")) to("spokeW", Math.max(THIN, n.spokeW * 0.9));
    else break;
  }
  // a wheel too small for cutouts at all is a plain web
  if (Math.round(n.spokes) > 0 && key("spokes") && wheelProblem(n) !== null && wheelProblem({ ...n, spokes: 0 }) === null) n.spokes = 0;
  return n;
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
  if (n > 0 && s.edge > 0) {
    // the edges of the cutouts at the web's two faces get a fillet or a chamfer: a second part, made once the kernel has the wheel (its edges are named by where they are)
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
  return ok(b.build());
}

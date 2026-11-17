// Cams (`dec_spline_and_cams`): the shapes of an eccentric cam and a snail (drop) cam, as the drawing is made of them. Pure maths in the plane's own x and y, the shaft's axis at the origin, the rise starting along +x.
// An eccentric cam is a disc turned about a point that is not its middle: the follower rises and falls by twice the offset, smoothly (simple harmonic motion). A snail cam rises at a steady rate over one turn (a spiral of
// Archimedes) and drops back at once: the cam of a ratchet-like lift, a striking clock, a lever that is let go. Neither has a standard tooth: the numbers are the diameter, the lift, and the shaft's hole.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Vec3 } from "../math/vec.ts";
import { splineAt } from "./spline.ts";
import { ratchetShapes } from "./ratchet.ts";

export type CamKind = "eccentric" | "snail" | "disc" | "ratchet";
/** how a disc cam's follower moves while it rises or returns: all three start and end at rest (no jump of speed, so the profile has no corner); the cycloidal law is the gentlest on the follower, the harmonic the simplest, the parabolic the one of steady push (an even acceleration, then an even braking) */
export type CamLaw = "cycloidal" | "harmonic" | "parabolic";
export interface CamSpec {
  kind: CamKind;
  /** mm: an eccentric's disc; a snail's smallest (base) circle */
  diameter: number;
  /** mm: an eccentric's offset of the disc's middle from the shaft (the follower moves twice this); a snail's rise over one turn */
  lift: number;
  /** mm: the shaft's hole, 0 for none */
  hole: number;
  /** a disc cam (`kind: "disc"`): the law of the follower's motion, and the angles round the cam, degrees from +x, counter-clockwise: the rise, the dwell at the top, the return (the rest of the turn is the dwell at the bottom) */
  law?: CamLaw; rise?: number; dwell?: number; ret?: number;
  /** a disc cam: the roller of the follower, its radius in mm (0: a point follower): the profile is the path of the roller's pitch curve taken in by this much */
  roller?: number;
  /** a ratchet (`kind: "ratchet"`, `dec_ratchet`): the tooth count, the depth of a tooth (mm), the lean of the face (degrees from radial), the pawl's arm (mm from its contact to its pivot, 0 for none) and the width of its boss (mm) */
  teeth?: number; depth?: number; hook?: number; pawl?: number; width?: number;
  /** the whole drawing turned about the shaft, degrees counter-clockwise from +x (0 if absent) */
  turn?: number;
}
export type V2 = [number, number];
export interface CamShapes {
  /** round parts: the disc of an eccentric, and the shaft's hole */
  circles: { c: V2; r: number; hole?: true }[];
  /** a snail's spiral, from its base circle at the start of the turn to the top of the rise at the end of it; the sides that close the shape are a straight line from the end back to the start */
  spiral: V2[] | null;
  /** a disc cam's outline: points of a closed curve round the shaft, counter-clockwise */
  closed: V2[] | null;
  /** closed outlines of straight sides and arcs (a ratchet's wheel and pawl): the corners, and the bulge of the side from each to the next (`Line.bulge`) */
  polys?: { points: V2[]; bulges: number[] }[];
}
const SPIRAL_POINTS = 25;
export function camProblem(s: CamSpec): string | null {
  if (!(s.diameter > 0)) return "the cam needs a diameter";
  if (s.kind !== "ratchet" && !(s.lift > 0)) return s.kind === "eccentric" ? "the cam needs an offset (how far the shaft is from the middle of the disc)" : "the cam needs a lift (how far it rises over one turn)";
  if (s.hole < 0) return "the shaft's hole cannot be less than nothing";
  const r = s.diameter / 2;
  if (s.kind === "eccentric" && s.hole / 2 + s.lift >= r - 1e-9) return "the shaft's hole would break through the edge of the disc: make the offset or the hole smaller, or the disc bigger";
  if (s.kind === "disc") {
    const [rise, dwell, ret] = [s.rise ?? 0, s.dwell ?? 0, s.ret ?? 0];
    if (!(rise > 0) || !(ret > 0)) return "the cam needs a rise and a return, in degrees";
    if (dwell < 0 || (s.roller ?? 0) < 0) return "the dwell and the roller cannot be less than nothing";
    if (rise + dwell + ret > 360 + 1e-9) return `the rise, the dwell and the return add up to ${rise + dwell + ret} degrees: no more than one turn (360)`;
  }
  if (s.kind === "snail" && s.hole / 2 >= r - 1e-9) return "the shaft's hole is as wide as the cam's base circle: make the hole smaller";
  return null;
}
export function camShapes(s: CamSpec): Result<CamShapes> {
  const why = camProblem(s);
  if (why) return err(why);
  const r = s.diameter / 2;
  const hole: CamShapes["circles"] = s.hole > 0 ? [{ c: [0, 0], r: s.hole / 2, hole: true }] : [];
  if (s.kind === "ratchet") { const r = ratchetShapes(s); return r.ok ? ok({ circles: r.value.circles, spiral: null, closed: null, polys: r.value.polys }) : err(r.error); }
  if (s.kind === "disc") return discShapes(s, hole);
  if (s.kind === "eccentric") return ok({ circles: [{ c: [s.lift, 0], r }, ...hole], spiral: null, closed: null });
  const spiral: V2[] = Array.from({ length: SPIRAL_POINTS }, (_, i) => { const t = (i / (SPIRAL_POINTS - 1)) * 2 * Math.PI; const rr = r + (s.lift * t) / (2 * Math.PI); return [rr * Math.cos(t), rr * Math.sin(t)]; });
  spiral[spiral.length - 1] = [r + s.lift, 0]; // (the turn ends exactly on the axis of the start, not a rounding off it)
  return ok({ circles: hole, spiral, closed: null });
}

// ---- the disc cam: a rise, a dwell, a return and a dwell, in a motion law, with an optional roller
const LAWS: Record<CamLaw, (u: number) => number> = {
  cycloidal: (u) => u - Math.sin(2 * Math.PI * u) / (2 * Math.PI),
  harmonic: (u) => (1 - Math.cos(Math.PI * u)) / 2,
  parabolic: (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)),
};
/** how far the follower is up, 0 to 1, with the cam at `t` radians */
function height(s: CamSpec, t: number): number {
  const d = Math.PI / 180;
  const [rise, dwell, ret] = [(s.rise ?? 0) * d, (s.dwell ?? 0) * d, (s.ret ?? 0) * d];
  const law = LAWS[s.law ?? "cycloidal"];
  const a = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (a < rise) return law(a / rise);
  if (a < rise + dwell) return 1;
  if (a < rise + dwell + ret) return 1 - law((a - rise - dwell) / ret);
  return 0;
}
/** the outline at `t`: the pitch curve (the path of the follower's centre) taken in by the roller's radius along its normal */
function outline(s: CamSpec, t: number): V2 {
  const r0 = s.diameter / 2;
  const at = (u: number): V2 => { const r = r0 + s.lift * height(s, u); return [r * Math.cos(u), r * Math.sin(u)]; };
  const p = at(t);
  const rho = s.roller ?? 0;
  if (rho <= 0) return p;
  const [a, b] = [at(t - 1e-5), at(t + 1e-5)];
  const [tx, ty] = [b[0] - a[0], b[1] - a[1]];
  const l = Math.hypot(tx, ty) || 1;
  return [p[0] - (ty / l) * rho, p[1] + (tx / l) * rho]; // (the normal outward of a counter-clockwise curve is the tangent turned a quarter turn clockwise; the profile is inside the pitch curve)
}
/** how far a point is from the closed outline given as a dense polyline */
function offOutline(q: V2, poly: readonly V2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [a, b] = [poly[i]!, poly[(i + 1) % poly.length]!];
    const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
    const k = Math.max(0, Math.min(1, ((q[0] - a[0]) * ex + (q[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)));
    best = Math.min(best, Math.hypot(a[0] + ex * k - q[0], a[1] + ey * k - q[1]));
  }
  return best;
}
const dist2 = (a: V2, b: V2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
function discShapes(s: CamSpec, hole: CamShapes["circles"]): Result<CamShapes> {
  const DENSE = 720;
  const dense = Array.from({ length: DENSE }, (_, i) => outline(s, (i / DENSE) * 2 * Math.PI));
  // a roller too big for the tightest turn of the pitch curve makes a loop in the profile (a cusp): the roller must fit round every convex turn
  if ((s.roller ?? 0) > 0) {
    const pitch = Array.from({ length: DENSE }, (_, i) => { const t = (i / DENSE) * 2 * Math.PI; const r = s.diameter / 2 + s.lift * height(s, t); return [r * Math.cos(t), r * Math.sin(t)] as V2; });
    for (let i = 0; i < DENSE; i++) {
      const [a, b, c] = [pitch[(i + DENSE - 1) % DENSE]!, pitch[i]!, pitch[(i + 1) % DENSE]!];
      const turn = Math.atan2((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]), (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]));
      const len = (dist2(a, b) + dist2(b, c)) / 2;
      if (turn > 1e-9 && len / turn < (s.roller ?? 0)) return err(`the roller (radius ${s.roller}) is too big for the tightest turn of the cam: use a smaller roller or a gentler rise`);
    }
  }
  const minR = Math.min(...dense.map((p) => Math.hypot(p[0], p[1])));
  if (s.hole / 2 >= minR - 1e-6) return err("the shaft's hole is as wide as the cam's smallest radius: make the hole smaller");
  // the knots: the ends of the rise, the dwell and the return, some between, and more wherever the curve through them strays from the true outline
  const d = Math.PI / 180;
  const marks = [0, s.rise! * d, (s.rise! + (s.dwell ?? 0)) * d, (s.rise! + (s.dwell ?? 0) + s.ret!) * d, 2 * Math.PI].filter((m, i, all) => i === 0 || m > all[i - 1]! + 1e-9);
  let knots: number[] = [];
  marks.slice(0, -1).forEach((m, i) => { const next = marks[i + 1]!; const n = Math.max(2, Math.ceil((next - m) / (30 * d))); for (let k = 0; k < n; k++) knots.push(m + ((next - m) * k) / n); });
  const tol = Math.max(0.02, (s.diameter / 2) * 1e-3);
  for (let pass = 0; pass < 6 && knots.length < 240; pass++) {
    const ring = knots.map((t) => outline(s, t));
    const bad: number[] = [];
    knots.forEach((t, i) => {
      const t2 = i + 1 < knots.length ? knots[i + 1]! : 2 * Math.PI;
      const [p0, p1, p2, p3] = [ring[(i + ring.length - 1) % ring.length]!, ring[i]!, ring[(i + 1) % ring.length]!, ring[(i + 2) % ring.length]!];
      const q = middleOf(p0, p1, p2, p3);
      if (offOutline(q, dense) > tol) bad.push((t + t2) / 2);
    });
    if (!bad.length) break;
    knots = [...knots, ...bad].sort((a, b) => a - b);
  }
  return ok({ circles: hole, spiral: null, closed: knots.map((t) => outline(s, t)) });
}
/** the middle of the span from p1 to p2 of the spline through the four points, as the drawing makes it (`spline.ts`): how closely the knots follow the outline */
const middleOf = (p0: V2, p1: V2, p2: V2, p3: V2): V2 => { const q = splineAt([p0, p1, p2, p3].map((p) => [p[0], p[1], 0] as Vec3), 1.5); return [q[0], q[1]]; };

// The machine of the path repeat (`dec_path_repeat`, `in_840` to `in_842`): a path in a plane, rules for where copies stand along it, and the frames (a point, the way the path runs, the way across it) the copies go to. Pure
// arithmetic on numbers: no scene, no kernel, no names. The path is a chain of straight lines and circular arcs, open or closed; it can be moved sideways first (the offset); the rules say how the copies are spaced, what happens at
// the ends and what happens at the corners. A figure, a body or a fastener hole is then made at each frame by what uses this file.
//
// Conventions: a path is walked from its first segment's start. The way across is the **left** of the way the path runs (the way run turned a quarter turn counter-clockwise). A segment's `bulge` is the sagitta over the chord and
// is positive when the arc bulges to the **left** of a to b (so it is walked clockwise), as the arc tool's is.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";

export type Pt = readonly [number, number];
export interface Seg { a: Pt; b: Pt; /** 0: a straight line; else the sagitta over the chord, positive to the left of a to b */ bulge: number }
export interface Path { segs: readonly Seg[]; closed: boolean }
/** A place on the path: the point, the unit way the path runs there, the unit way across it (the left), how far along the path it is and whether it is a corner. */
export interface Frame { at: Pt; along: Pt; across: Pt; s: number; corner: boolean }

const EPS = 1e-9;
const TURN = 0.01; // (radians: a turn smaller than this at a joint is not a corner)
const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]];
const add = (p: Pt, q: Pt): Pt => [p[0] + q[0], p[1] + q[1]];
const mul = (p: Pt, k: number): Pt => [p[0] * k, p[1] * k];
const dot = (p: Pt, q: Pt): number => p[0] * q[0] + p[1] * q[1];
const len = (p: Pt): number => Math.hypot(p[0], p[1]);
const unit = (p: Pt): Pt => { const l = len(p) || 1; return [p[0] / l, p[1] / l]; };
const left = (t: Pt): Pt => [-t[1], t[0]];
const near = (p: Pt, q: Pt, tol = 1e-7): boolean => len(sub(p, q)) <= tol;

// ---- one segment as geometry ----
interface Line { kind: "line"; a: Pt; b: Pt; length: number; t: Pt }
interface Arc { kind: "arc"; a: Pt; b: Pt; c: Pt; r: number; a0: number; th: number; length: number }
type Geo = Line | Arc;
const arcSweep = (bulge: number): number => -4 * Math.atan(2 * bulge); // (counter-clockwise positive: a bulge to the left is walked clockwise)
function geoOf(s: Seg): Geo {
  const chord = sub(s.b, s.a);
  const c = len(chord);
  if (Math.abs(s.bulge) < EPS || c < EPS) return { kind: "line", a: s.a, b: s.b, length: c, t: c < EPS ? [1, 0] : mul(chord, 1 / c) };
  const th = arcSweep(s.bulge);
  const r = c / (2 * Math.abs(Math.sin(th / 2)));
  const m = mul(add(s.a, s.b), 0.5);
  const centre = add(m, mul(left(unit(chord)), Math.sign(th) * r * Math.cos(th / 2)));
  return { kind: "arc", a: s.a, b: s.b, c: centre, r, a0: Math.atan2(s.a[1] - centre[1], s.a[0] - centre[0]), th, length: r * Math.abs(th) };
}
const at = (g: Geo, u: number): { p: Pt; t: Pt } => {
  if (g.kind === "line") return { p: add(g.a, mul(g.t, u)), t: g.t };
  const al = g.a0 + Math.sign(g.th) * (u / g.r);
  return { p: add(g.c, [g.r * Math.cos(al), g.r * Math.sin(al)]), t: mul([-Math.sin(al), Math.cos(al)], Math.sign(g.th)) };
};
/** The unit way a segment runs where it starts and where it ends. */
const endsRun = (g: Geo): [Pt, Pt] => [at(g, 0).t, at(g, g.length).t];

/** A path from a polyline: the points (a closed path goes back to the first), and optionally a bulge for each side. */
export function pathOf(points: readonly Pt[], closed = false, bulges: readonly number[] = []): Path {
  const n = closed ? points.length : points.length - 1;
  const segs: Seg[] = Array.from({ length: Math.max(n, 0) }, (_, i) => ({ a: points[i]!, b: points[(i + 1) % points.length]!, bulge: bulges[i] ?? 0 }));
  return { segs, closed };
}
/** A circle as a closed path of two half circles, walked counter-clockwise from its rightmost point. */
export function circlePath(centre: Pt, radius: number): Path {
  const [a, b]: [Pt, Pt] = [[centre[0] + radius, centre[1]], [centre[0] - radius, centre[1]]];
  const half = -Math.tan(Math.PI / 4) / 2; // (a half circle, counter-clockwise: bulge = -tan(theta / 4) / 2 for theta = pi)
  return { segs: [{ a, b, bulge: half }, { a: b, b: a, bulge: half }], closed: true };
}

/** Why a path is not one: its sides do not meet end to end, or one has no length. Null if it is. */
export function pathProblem(p: Path): string | null {
  if (!p.segs.length) return "the path has no sides";
  for (const [i, s] of p.segs.entries()) {
    if (![...s.a, ...s.b, s.bulge].every(Number.isFinite)) return "the path has a number that is not one";
    if (len(sub(s.a, s.b)) < EPS) return "a side of the path has no length";
    const next = p.segs[i + 1] ?? (p.closed ? p.segs[0] : undefined);
    if (next && !near(s.b, next.a)) return "the sides of the path do not meet end to end";
  }
  return null;
}
const geos = (p: Path): Geo[] => p.segs.map(geoOf);
/** The length of the path. */
export const lengthOf = (p: Path): number => geos(p).reduce((t, g) => t + g.length, 0);

/** Where the path is `s` along it (wrapped round if it is closed, held to its ends if it is open): the point and the way it runs. */
export function pointAt(p: Path, s: number): { at: Pt; along: Pt; across: Pt } {
  const gs = geos(p);
  const total = gs.reduce((t, g) => t + g.length, 0);
  let u = p.closed ? ((s % total) + total) % total : Math.min(Math.max(s, 0), total);
  for (const [i, g] of gs.entries()) {
    if (u <= g.length + EPS || i === gs.length - 1) { const x = at(g, Math.min(u, g.length)); return { at: x.p, along: x.t, across: left(x.t) }; }
    u -= g.length;
  }
  const x = at(gs[0]!, 0);
  return { at: x.p, along: x.t, across: left(x.t) };
}
/** How far along the path each joint of two sides is, for the joints where the path turns (a corner): the start of the path is first when it is one, and the end of an open path is last. */
export function cornersOf(p: Path): number[] {
  const gs = geos(p);
  const out: number[] = [];
  let s = 0;
  for (const [i, g] of gs.entries()) {
    const prev = gs[i - 1] ?? (p.closed ? gs[gs.length - 1] : undefined);
    if (!prev) out.push(0); // (the start of an open path is a corner: a place where a side begins)
    else if (Math.acos(Math.min(1, Math.max(-1, dot(endsRun(prev)[1], endsRun(g)[0])))) > TURN) out.push(s);
    s += g.length;
  }
  if (!p.closed) out.push(s); // (so is its end)
  return out;
}

// ---- the offset ----
/** Intersections of two circles, of a circle and an infinite line, or of two infinite lines (the points, any number from 0 to 2). */
const circleCircle = (c1: Pt, r1: number, c2: Pt, r2: number): Pt[] => {
  const d = len(sub(c2, c1));
  if (d < EPS || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
  const x = (d * d + r1 * r1 - r2 * r2) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - x * x));
  const e = unit(sub(c2, c1));
  const m = add(c1, mul(e, x));
  return h < 1e-9 ? [m] : [add(m, mul(left(e), h)), add(m, mul(left(e), -h))];
};
const lineCircle = (a: Pt, t: Pt, c: Pt, r: number): Pt[] => {
  const f = sub(a, c);
  const b = dot(f, t);
  const disc = b * b - (dot(f, f) - r * r);
  if (disc < -1e-9) return [];
  const q = Math.sqrt(Math.max(0, disc));
  return q < 1e-9 ? [add(a, mul(t, -b))] : [add(a, mul(t, -b + q)), add(a, mul(t, -b - q))];
};
const lineLine = (a: Pt, t: Pt, b: Pt, u: Pt): Pt[] => {
  const den = t[0] * u[1] - t[1] * u[0];
  if (Math.abs(den) < 1e-12) return [];
  const k = ((b[0] - a[0]) * u[1] - (b[1] - a[1]) * u[0]) / den;
  return [add(a, mul(t, k))];
};
/** The offset curve of one side, `d` to its left, as an extended curve (a line through a point, or a circle). */
const sideOffset = (g: Geo, d: number): { kind: "line"; p: Pt; t: Pt } | { kind: "arc"; c: Pt; r: number; th: number } | string => {
  if (g.kind === "line") return { kind: "line", p: add(g.a, mul(left(g.t), d)), t: g.t };
  const r = g.th > 0 ? g.r - d : g.r + d; // (the centre is on the left of a counter-clockwise arc: moving left goes toward it)
  return r < 1e-6 ? "the offset is more than a curve is round" : { kind: "arc", c: g.c, r, th: g.th };
};
/** The point where the offsets of two joined sides meet, the one nearest to where the joint moves to. Null if the offsets do not meet (the sides go round each other). */
function joint(g1: Geo, g2: Geo, d: number, o1: ReturnType<typeof sideOffset>, o2: ReturnType<typeof sideOffset>): Pt | null {
  if (typeof o1 === "string" || typeof o2 === "string") return null;
  const hint = add(g1.kind === "line" ? g1.b : g1.b, mul(left(endsRun(g1)[1]), d));
  const cands = o1.kind === "line" && o2.kind === "line" ? lineLine(o1.p, o1.t, o2.p, o2.t)
    : o1.kind === "line" && o2.kind === "arc" ? lineCircle(o1.p, o1.t, o2.c, o2.r)
    : o1.kind === "arc" && o2.kind === "line" ? lineCircle(o2.p, o2.t, o1.c, o1.r)
    : o1.kind === "arc" && o2.kind === "arc" ? circleCircle(o1.c, o1.r, o2.c, o2.r) : [];
  return cands.sort((p, q) => len(sub(p, hint)) - len(sub(q, hint)))[0] ?? null;
}
/** The path moved `distance` to its left (a negative distance, to its right). Sides are cut or extended to meet at the corners; an offset that turns a side inside out, or is more than a curve is round, is refused. */
export function offsetPath(p: Path, distance: number): Result<Path> {
  const bad = pathProblem(p);
  if (bad) return err(bad);
  if (!Number.isFinite(distance)) return err("the offset is not a number");
  if (Math.abs(distance) < EPS) return ok(p);
  const gs = geos(p);
  const offs = gs.map((g) => sideOffset(g, distance));
  for (const o of offs) if (typeof o === "string") return err(o);
  const n = gs.length;
  // each side's two new ends: where it meets the one before and the one after (a tangent-continuous joint keeps the moved end)
  const startOf = (i: number): Pt => {
    const prev = i > 0 ? i - 1 : p.closed ? n - 1 : -1;
    const g = gs[i]!;
    const moved = add(g.a, mul(left(endsRun(g)[0]), distance));
    if (prev < 0) return moved;
    const j = joint(gs[prev]!, g, distance, offs[prev]!, offs[i]!);
    return j && Math.acos(Math.min(1, Math.max(-1, dot(endsRun(gs[prev]!)[1], endsRun(g)[0])))) > TURN ? j : moved;
  };
  const starts = gs.map((_, i) => startOf(i));
  const segs: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const g = gs[i]!;
    const a = starts[i]!;
    const next = i + 1 < n ? i + 1 : p.closed ? 0 : -1;
    const b = next >= 0 ? starts[next]! : add(g.b, mul(left(endsRun(g)[1]), distance));
    if (g.kind === "line") {
      if (dot(sub(b, a), g.t) <= 1e-9) return err("the offset turns a side of the path inside out: it is more than the side can take");
      segs.push({ a, b, bulge: 0 });
    } else {
      const o = offs[i] as { kind: "arc"; c: Pt; r: number; th: number };
      // the arc keeps its centre and direction; its new ends decide how far round it goes
      const sign = Math.sign(o.th);
      const angle = (q: Pt): number => Math.atan2(q[1] - o.c[1], q[0] - o.c[0]);
      let th = angle(b) - angle(a);
      while (sign > 0 && th < 0) th += 2 * Math.PI;
      while (sign < 0 && th > 0) th -= 2 * Math.PI;
      if (Math.abs(th) < 1e-9 || Math.abs(th) > 2 * Math.PI - 1e-6) return err("the offset leaves a curve of the path with no length");
      if (Math.abs(th) > Math.abs(o.th) + Math.PI) return err("the offset turns a curve of the path inside out");
      segs.push({ a, b, bulge: -Math.tan(th / 4) / 2 });
    }
  }
  return ok({ segs, closed: p.closed });
}

// ---- the rules ----
export type Spacing = { by: "distance"; distance: number } | { by: "count"; count: number };
export interface Rules {
  spacing: Spacing;
  /** for a distance on a path with no corner rule: leave the rest at the end, adjust the spacing so the last copy lands on the end (the default), or centre the copies */
  ends?: "remainder" | "fit" | "centre";
  /** how far from the start and from the end of an open path the first and last copy stand */
  startInset?: number;
  endInset?: number;
  /** what the corners of the path do: nothing (the default); a copy at every corner and each side divided between them; or distances worked in from each corner */
  corners?: "ignore" | "each" | "inward";
  /** the path is moved this far to its left first */
  offset?: number;
  /** the whole row is walked this far along the path (`in_909`): on a closed path the places turn round it, on an open one they move along it and any that go past an end are left out */
  shift?: number;
}
export interface Placed { frames: Frame[]; /** the spacing the copies stand at (the adjusted one when the rules adjust it; a side's own for corners "each") */ spacing: number | null; /** the path as it was moved by the offset */ path: Path }

/** The places the rules give along a path (offset first), as frames. Refused, with the reason, for a path or numbers that make none. */
export function placeAlong(path: Path, rules: Rules): Result<Placed> {
  const bad = pathProblem(path);
  if (bad) return err(bad);
  const sp = rules.spacing;
  if (sp.by === "distance" && !(sp.distance > 0 && Number.isFinite(sp.distance))) return err("the distance between copies must be a number above zero");
  if (sp.by === "count" && !(Number.isInteger(sp.count) && sp.count >= 1)) return err("the number of copies must be a whole number, one or more");
  const [i0, i1] = [rules.startInset ?? 0, rules.endInset ?? 0];
  if (!(i0 >= 0) || !(i1 >= 0) || !Number.isFinite(i0 + i1)) return err("an inset must be a number, zero or more");
  const moved = rules.offset ? offsetPath(path, rules.offset) : ok(path);
  if (!moved.ok) return moved;
  const p = moved.value;
  const total = lengthOf(p);
  const corners = rules.corners ?? "ignore";
  const cs = corners === "ignore" ? [] : cornersOf(p);
  const frame = (s: number, corner = false): Frame => { const x = pointAt(p, s); return { ...x, s: p.closed ? ((s % total) + total) % total : s, corner }; };
  const shift = rules.shift ?? 0;
  if (!Number.isFinite(shift)) return err("the shift is not a number");
  // the row walked along the path: round a closed one, along an open one (what goes past an end is left out)
  const done = (ss: number[], spacing: number | null, cornerAt: ReadonlySet<number> = new Set()): Result<Placed> => {
    const moved2 = Math.abs(shift) < 1e-12 ? ss.map((s) => [s, cornerAt.has(s)] as const) : ss.map((s) => [s + shift, false] as const).filter(([s]) => p.closed || (s >= -1e-9 && s <= total + 1e-9));
    if (!moved2.length) return err("the shift takes every place past the end of the path");
    return ok({ frames: moved2.map(([s, c]) => frame(s, c)), spacing, path: p });
  };

  // corners: a copy at every corner and the sides between divided (each), or worked in from each corner (inward)
  if (corners !== "ignore" && cs.length > 0 && !(p.closed && cs.length < 1)) {
    if (sp.by !== "distance" && corners !== "each") return err("working in from the corners needs a distance between copies, not a count");
    const d = sp.by === "distance" ? sp.distance : 1;
    const sides: [number, number][] = [];
    for (let i = 0; i < cs.length - (p.closed ? 0 : 1); i++) sides.push([cs[i]!, p.closed && i === cs.length - 1 ? cs[0]! + total : cs[i + 1]!]);
    // by a count with a hole at every corner (`in_945`): the count is all the holes, the corners are some of them, and the rest are shared out between the sides by their length (the largest remainders get the odd ones)
    let extra: number[] | null = null;
    if (sp.by === "count") {
      const rest = sp.count - (p.closed ? sides.length : sides.length + 1);
      if (rest < 0) return err(`a hole at every corner is ${p.closed ? sides.length : sides.length + 1} holes: the number must be at least that`);
      const lens = sides.map(([a, b]) => b - a);
      const sum = lens.reduce((x, y) => x + y, 0) || 1;
      const raw = lens.map((l) => (rest * l) / sum);
      extra = raw.map(Math.floor);
      let left = rest - extra.reduce((x, y) => x + y, 0);
      const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((x, y) => y[0] - x[0] || x[1] - y[1]);
      for (const [, i] of order) { if (left <= 0) break; extra[i]!++; left--; }
    }
    const out: number[] = [];
    const corner = new Set<number>();
    let adjusted: number | null = null;
    for (const [si, [a, b]] of sides.entries()) {
      const L = b - a;
      corner.add(a);
      out.push(a);
      if (corners === "each") {
        const n = extra ? extra[si]! + 1 : Math.max(1, Math.ceil(L / d - 1e-9));
        adjusted = adjusted === null ? L / n : Math.min(adjusted, L / n);
        for (let k = 1; k < n; k++) out.push(a + (L * k) / n);
      } else {
        const k = Math.floor(L / 2 / d + 1e-9);
        const fromStart = Array.from({ length: k }, (_, j) => a + (j + 1) * d);
        const fromEnd = Array.from({ length: k }, (_, j) => b - (j + 1) * d);
        const seen = new Set(fromStart.map((x) => Math.round(x * 1e6)));
        out.push(...fromStart, ...fromEnd.filter((x) => !seen.has(Math.round(x * 1e6))).reverse());
      }
    }
    if (!p.closed) { const end = sides[sides.length - 1]![1]; out.push(end); corner.add(end); }
    const sorted = [...new Set(out.map((x) => Math.round(x * 1e9) / 1e9))].sort((x, y) => x - y);
    return done(sorted, corners === "each" ? adjusted : d, corner);
  }

  // no corner rule (or none to apply): copies by arclength
  if (p.closed) {
    const phase = i0; // (on a closed path the start inset only says where the first copy stands)
    if (sp.by === "count") { const n = sp.count; return done(Array.from({ length: n }, (_, i) => phase + (total * i) / n), total / n); }
    const d = sp.distance;
    if ((rules.ends ?? "fit") === "remainder") { const n = Math.max(1, Math.floor(total / d + 1e-9)); return done(Array.from({ length: n }, (_, i) => phase + i * d), d); }
    const n = Math.max(1, Math.round(total / d));
    return done(Array.from({ length: n }, (_, i) => phase + (total * i) / n), total / n);
  }
  const [a, b] = [i0, total - i1];
  if (b < a - 1e-9) return err("the insets are more than the path is long");
  const span = Math.max(0, b - a);
  if (sp.by === "count") {
    const n = sp.count;
    return n === 1 ? done([a + span / 2], null) : done(Array.from({ length: n }, (_, i) => a + (span * i) / (n - 1)), span / (n - 1));
  }
  const d = sp.distance;
  const ends = rules.ends ?? "fit";
  if (ends === "remainder") { const m = Math.floor(span / d + 1e-9); return done(Array.from({ length: m + 1 }, (_, i) => a + i * d), d); }
  if (ends === "centre") { const m = Math.floor(span / d + 1e-9); const lead = (span - m * d) / 2; return done(Array.from({ length: m + 1 }, (_, i) => a + lead + i * d), d); }
  const m = Math.max(1, Math.round(span / d)); // (fit: the nearest whole number of steps, the spacing adjusted to land on the end)
  return span < EPS ? done([a], null) : done(Array.from({ length: m + 1 }, (_, i) => a + (span * i) / m), span / m);
}

/** A frame lifted onto a plane in space: the point and the two ways, as 3D vectors. `origin`, `u` and `v` are the plane's (`u` and `v` unit and square to each other). */
export function lifted(f: Frame, plane: { origin: readonly [number, number, number]; u: readonly [number, number, number]; v: readonly [number, number, number] }): { at: [number, number, number]; along: [number, number, number]; across: [number, number, number] } {
  const lift = (q: Pt): [number, number, number] => [q[0] * plane.u[0] + q[1] * plane.v[0], q[0] * plane.u[1] + q[1] * plane.v[1], q[0] * plane.u[2] + q[1] * plane.v[2]];
  const p = lift(f.at);
  return { at: [plane.origin[0] + p[0], plane.origin[1] + p[1], plane.origin[2] + p[2]], along: lift(f.along), across: lift(f.across) };
}

// ---- the numbers a path repeat keeps ----
/** Everything a path repeat keeps besides the path itself: the rules, and whether the copies turn with the path and whether the path is walked from its other end. */
export interface RepeatNumbers { rules: Rules; turn: boolean; reverse: boolean }
/** How many numbers a record's `params` holds. */
export const PATH_NUMBERS = 10;
const PATH_PARAMS = 9; // (a record made before the shift had nine numbers: the tenth, the shift, is 0 when it is not there)
const ENDS = ["fit", "remainder", "centre"] as const;
const CORNERS = ["ignore", "each", "inward"] as const;
/** The rules as the numbers a repeat's record keeps: [by (0 distance, 1 count), its value, ends (0 fit, 1 remainder, 2 centre), start inset, end inset, corners (0 ignore, 1 each, 2 inward), offset, turn (0 or 1), reverse (0 or 1), shift]. */
export function numbersOf(n: RepeatNumbers): number[] {
  const r = n.rules;
  return [r.spacing.by === "count" ? 1 : 0, r.spacing.by === "count" ? r.spacing.count : r.spacing.distance, ENDS.indexOf(r.ends ?? "fit"), r.startInset ?? 0, r.endInset ?? 0, CORNERS.indexOf(r.corners ?? "ignore"), r.offset ?? 0, n.turn ? 1 : 0, n.reverse ? 1 : 0, r.shift ?? 0];
}
/** The numbers of a record read back as rules, or why they are not any. */
export function rulesFrom(v: readonly number[]): Result<RepeatNumbers> {
  if (v.length < PATH_PARAMS || !v.slice(0, PATH_NUMBERS).every(Number.isFinite)) return err("the numbers of the path repeat are not all there");
  const [by, value, ends, i0, i1, corners, offset, turn, reverse] = v as number[];
  const shift = v[9] ?? 0;
  const e = ENDS[Math.round(ends!)], c = CORNERS[Math.round(corners!)];
  if (!e || !c) return err("the numbers of the path repeat name an end or a corner rule that is not one");
  return ok({ rules: { spacing: Math.round(by!) === 1 ? { by: "count", count: value! } : { by: "distance", distance: value! }, ends: e, startInset: i0!, endInset: i1!, corners: c, offset: offset!, shift }, turn: Math.round(turn!) === 1, reverse: Math.round(reverse!) === 1 });
}
/** The path walked from its other end (the same places along it, counted the other way round). */
export function reversedPath(p: Path): Path {
  return { segs: [...p.segs].reverse().map((s) => ({ a: s.b, b: s.a, bulge: -s.bulge })), closed: p.closed };
}

// The sketch's constraint solver (E48 to E51, E55, E58, E61; `dec_constraints_in_engine`, `dec_constraint_solver_small`). Pure and deterministic: no kernel, no screen, no clock, no randomness
// (the restarts use a fixed sequence). `solve(system, options) -> { solution, verdict }`.
//  - the unknowns are the coordinates of points and the radii of circles; a line is two points; a part may be fixed (read-only: a body's edge, E53) or held for one solve (the part that does not move: E51)
//  - every relation is written once, as residuals over a small forward-mode differentiation, so the Jacobian is exact and there is nothing to keep in step
//  - Levenberg-Marquardt from the start positions (the nearest solution, so the sketch moves as little as it can); components that share no unknown are solved apart
//  - the verdict: solved / under-constrained (the free parts named) / redundant (the constraints that add nothing named) / over-constrained (a smallest set that cannot hold together named);
//    an answer that collapses (a line or radius of nothing) is a conflict, not a solution (E50)

// ---------------------------------------------------------------- the system
export interface PointSpec { id: string; x: number; y: number; /** read-only: a body's anchor (E53), or a point the person fixed */ fixed?: boolean }
export interface LineSpec { id: string; a: string; b: string }
export interface CircleSpec { id: string; c: string; r: number; fixedR?: boolean }
export type Relation =
  | "fixed" | "coincident" | "horizontal" | "vertical" | "parallel" | "perpendicular" | "collinear" | "equalLength" | "equalRadius" | "concentric" | "pointOnLine" | "pointOnCircle" | "midpoint"
  | "tangent" | "tangentCircles" | "distance" | "length" | "radius" | "pointLineDistance" | "horizontalDistance" | "verticalDistance" | "angle";
export interface Constraint { id: string; kind: Relation; /** the ids of the parts, in the order the relation reads them (the first is the one that moves when one must, E51) */ parts: string[]; /** the number of a dimension (degrees for an angle) */ value?: number; /** `fixed`: where; tangent circles: internal */ at?: [number, number]; internal?: boolean }
export interface System { points: PointSpec[]; lines: LineSpec[]; circles: CircleSpec[]; constraints: Constraint[] }
export interface Solution { points: Record<string, [number, number]>; circles: Record<string, number> }
export type VerdictKind = "solved" | "under" | "redundant" | "over";
export interface Verdict {
  kind: VerdictKind;
  /** the constraints hold and nothing collapsed */ ok: boolean;
  /** how many ways the sketch can still move */ freedom: number; /** the parts that can still move (point ids, circle ids for a radius) */ free: string[];
  /** constraints that add nothing the others do not already say (they hold) */ redundant: string[]; /** of those, the ones that say nothing new at all (every part of what they say follows from the others) */ implied: string[];
  /** when not ok: a set of constraints that cannot hold together and none of which can be left out of it */ conflict: string[]; reason: string;
}
export interface Options { /** a part that must reach this place: a drag (soft: it goes as near as the constraints allow) */ pins?: Record<string, [number, number]>; /** parts that do not move in this solve */ hold?: string[]; /** solve only the parts connected to these (the rest keep their places) */ only?: string[]; restarts?: number; minSize?: number; /** the most solves spent narrowing a conflict */ maxSolves?: number }
export interface Result { solution: Solution; verdict: Verdict; iterations: number; /** a pin that could not be reached, with how far it is */ unreached: Record<string, number>; /** the constraints that hold a pin back: a set that cannot hold with the pinned parts where they were taken to, none of which can be left out of it (E55) */ holds: string[] }

// ---------------------------------------------------------------- forward-mode differentiation over a few unknowns
class D {
  v: number; g: Map<number, number>;
  constructor(v: number, g?: Map<number, number>) { this.v = v; this.g = g ?? new Map(); }
}
const k = (v: number) => new D(v);
const lin = (a: D, ca: number, b: D, cb: number, v: number): D => { const g = new Map<number, number>(); for (const [i, x] of a.g) g.set(i, (g.get(i) ?? 0) + ca * x); for (const [i, x] of b.g) g.set(i, (g.get(i) ?? 0) + cb * x); return new D(v, g); };
const add = (a: D, b: D) => lin(a, 1, b, 1, a.v + b.v), sub = (a: D, b: D) => lin(a, 1, b, -1, a.v - b.v), mul = (a: D, b: D) => lin(a, b.v, b, a.v, a.v * b.v);
const scaleD = (a: D, s: number) => lin(a, s, a, 0, a.v * s);
const div = (a: D, b: D) => lin(a, 1 / b.v, b, -a.v / (b.v * b.v), a.v / b.v);
const sqrtD = (a: D) => { const s = Math.sqrt(a.v); return lin(a, s > 0 ? 0.5 / s : 0, a, 0, s); };
type P = { x: D; y: D };
const dot2 = (u: P, w: P) => add(mul(u.x, w.x), mul(u.y, w.y)), cross2 = (u: P, w: P) => sub(mul(u.x, w.y), mul(u.y, w.x)), vec = (a: P, b: P): P => ({ x: sub(b.x, a.x), y: sub(b.y, a.y) });
const len = (u: P) => sqrtD(dot2(u, u));

// ---------------------------------------------------------------- the relations, as residuals (zero when they hold)
interface Ctx { pt(id: string): P; line(id: string): { a: P; b: P }; r(id: string): D; c(id: string): P; value: number; at?: [number, number]; internal?: boolean }
const kindOf = (id: string, S: System): "point" | "line" | "circle" => S.points.some((p) => p.id === id) ? "point" : S.lines.some((l) => l.id === id) ? "line" : "circle";
const RELATIONS: Record<Relation, { arity: number; parts: ("point" | "line" | "circle")[][]; rows: (ids: string[], c: Ctx, kinds: string[]) => D[] }> = {
  fixed: { arity: 1, parts: [["point"]], rows: (ids, c) => { const p = c.pt(ids[0]!); return [sub(p.x, k(c.at![0])), sub(p.y, k(c.at![1]))]; } },
  coincident: { arity: 2, parts: [["point"], ["point"]], rows: (ids, c) => { const p = c.pt(ids[0]!), q = c.pt(ids[1]!); return [sub(p.x, q.x), sub(p.y, q.y)]; } },
  horizontal: { arity: 1, parts: [["line", "point"], ["point"]], rows: (ids, c, kk) => kk[0] === "line" ? (() => { const l = c.line(ids[0]!); return [sub(l.b.y, l.a.y)]; })() : [sub(c.pt(ids[1]!).y, c.pt(ids[0]!).y)] },
  vertical: { arity: 1, parts: [["line", "point"], ["point"]], rows: (ids, c, kk) => kk[0] === "line" ? (() => { const l = c.line(ids[0]!); return [sub(l.b.x, l.a.x)]; })() : [sub(c.pt(ids[1]!).x, c.pt(ids[0]!).x)] },
  parallel: { arity: 2, parts: [["line"], ["line"]], rows: (ids, c) => { const a = c.line(ids[0]!), b = c.line(ids[1]!), u = vec(a.a, a.b), w = vec(b.a, b.b); return [div(cross2(u, w), mul(len(u), len(w)))]; } },
  perpendicular: { arity: 2, parts: [["line"], ["line"]], rows: (ids, c) => { const a = c.line(ids[0]!), b = c.line(ids[1]!), u = vec(a.a, a.b), w = vec(b.a, b.b); return [div(dot2(u, w), mul(len(u), len(w)))]; } },
  collinear: { arity: 2, parts: [["line"], ["line"]], rows: (ids, c) => { const a = c.line(ids[0]!), b = c.line(ids[1]!), u = vec(a.a, a.b), n = len(u); return [div(cross2(u, vec(a.a, b.a)), n), div(cross2(u, vec(a.a, b.b)), n)]; } },
  equalLength: { arity: 2, parts: [["line"], ["line"]], rows: (ids, c) => { const a = c.line(ids[0]!), b = c.line(ids[1]!); return [sub(len(vec(a.a, a.b)), len(vec(b.a, b.b)))]; } },
  equalRadius: { arity: 2, parts: [["circle"], ["circle"]], rows: (ids, c) => [sub(c.r(ids[0]!), c.r(ids[1]!))] },
  concentric: { arity: 2, parts: [["circle"], ["circle"]], rows: (ids, c) => { const p = c.c(ids[0]!), q = c.c(ids[1]!); return [sub(p.x, q.x), sub(p.y, q.y)]; } },
  pointOnLine: { arity: 2, parts: [["point"], ["line"]], rows: (ids, c) => { const p = c.pt(ids[0]!), l = c.line(ids[1]!), u = vec(l.a, l.b); return [div(cross2(u, vec(l.a, p)), len(u))]; } },
  pointOnCircle: { arity: 2, parts: [["point"], ["circle"]], rows: (ids, c) => [sub(len(vec(c.c(ids[1]!), c.pt(ids[0]!))), c.r(ids[1]!))] },
  midpoint: { arity: 2, parts: [["point"], ["line"]], rows: (ids, c) => { const p = c.pt(ids[0]!), l = c.line(ids[1]!); return [sub(p.x, scaleD(add(l.a.x, l.b.x), 0.5)), sub(p.y, scaleD(add(l.a.y, l.b.y), 0.5))]; } },
  tangent: { arity: 2, parts: [["line"], ["circle"]], rows: (ids, c) => { const l = c.line(ids[0]!), u = vec(l.a, l.b), d = div(cross2(u, vec(l.a, c.c(ids[1]!))), len(u)), r = c.r(ids[1]!); return [div(sub(mul(d, d), mul(r, r)), scaleD(r, 2))]; } },
  tangentCircles: { arity: 2, parts: [["circle"], ["circle"]], rows: (ids, c) => { const d = len(vec(c.c(ids[0]!), c.c(ids[1]!))), r1 = c.r(ids[0]!), r2 = c.r(ids[1]!); return [c.internal ? sub(d, new D(Math.abs(r1.v - r2.v), (r1.v >= r2.v ? sub(r1, r2) : sub(r2, r1)).g)) : sub(d, add(r1, r2))]; } },
  distance: { arity: 2, parts: [["point"], ["point"]], rows: (ids, c) => [sub(len(vec(c.pt(ids[0]!), c.pt(ids[1]!))), k(c.value))] },
  length: { arity: 1, parts: [["line"]], rows: (ids, c) => { const l = c.line(ids[0]!); return [sub(len(vec(l.a, l.b)), k(c.value))]; } },
  radius: { arity: 1, parts: [["circle"]], rows: (ids, c) => [sub(c.r(ids[0]!), k(c.value))] },
  pointLineDistance: { arity: 2, parts: [["point"], ["line"]], rows: (ids, c) => { const p = c.pt(ids[0]!), l = c.line(ids[1]!), u = vec(l.a, l.b), s = div(cross2(u, vec(l.a, p)), len(u)); return [sub(new D(Math.abs(s.v), (s.v >= 0 ? s : scaleD(s, -1)).g), k(c.value))]; } },
  horizontalDistance: { arity: 2, parts: [["point"], ["point"]], rows: (ids, c) => [sub(sub(c.pt(ids[1]!).x, c.pt(ids[0]!).x), k(c.value))] },
  verticalDistance: { arity: 2, parts: [["point"], ["point"]], rows: (ids, c) => [sub(sub(c.pt(ids[1]!).y, c.pt(ids[0]!).y), k(c.value))] },
  angle: { arity: 2, parts: [["line"], ["line"]], rows: (ids, c) => { const a = c.line(ids[0]!), b = c.line(ids[1]!), u = vec(a.a, a.b), w = vec(b.a, b.b), th = (c.value * Math.PI) / 180; return [div(sub(scaleD(cross2(u, w), Math.cos(th)), scaleD(dot2(u, w), Math.sin(th))), mul(len(u), len(w)))]; } },
};
/** a constraint that cannot be read (a wrong kind of part, a part that is not there) is said in words */
export function validate(S: System): string | null {
  const ids = new Set([...S.points.map((p) => p.id), ...S.lines.map((l) => l.id), ...S.circles.map((c) => c.id)]);
  for (const l of S.lines) if (!S.points.some((p) => p.id === l.a) || !S.points.some((p) => p.id === l.b)) return `line ${l.id} names a point that is not there`;
  for (const c of S.circles) if (!S.points.some((p) => p.id === c.c)) return `circle ${c.id} names a centre that is not there`;
  const seen = new Set<string>();
  for (const c of S.constraints) {
    if (seen.has(c.id)) return `two constraints are called ${c.id}`; seen.add(c.id);
    const def = RELATIONS[c.kind]; if (!def) return `${c.id}: there is no relation called ${c.kind}`;
    const want = def.parts.length; if (c.parts.length !== want && !(c.kind === "horizontal" || c.kind === "vertical") ) return `${c.id}: ${c.kind} takes ${want} part${want === 1 ? "" : "s"}, not ${c.parts.length}`;
    for (const p of c.parts) if (!ids.has(p)) return `${c.id}: ${p} is not there`;
    if (c.kind === "horizontal" || c.kind === "vertical") { const kk = c.parts.map((p) => kindOf(p, S)); if (!((c.parts.length === 1 && kk[0] === "line") || (c.parts.length === 2 && kk[0] === "point" && kk[1] === "point"))) return `${c.id}: ${c.kind} takes a line, or two points`; continue; }
    c.parts.forEach((p, i) => { if (!def.parts[i]!.includes(kindOf(p, S))) return; });
    for (let i = 0; i < want; i++) if (!def.parts[i]!.includes(kindOf(c.parts[i]!, S))) return `${c.id}: ${c.kind} needs a ${def.parts[i]!.join(" or ")} as part ${i + 1}, ${c.parts[i]} is a ${kindOf(c.parts[i]!, S)}`;
    if ((c.kind === "distance" || c.kind === "length" || c.kind === "radius" || c.kind === "pointLineDistance") && !(typeof c.value === "number" && c.value > 0)) return `${c.id}: ${c.kind} needs a number above nothing`;
    if ((c.kind === "angle" || c.kind === "horizontalDistance" || c.kind === "verticalDistance") && typeof c.value !== "number") return `${c.id}: ${c.kind} needs a number`;
    if (c.kind === "fixed" && !c.at) return `${c.id}: fixed needs the place`;
  }
  return null;
}

// ---------------------------------------------------------------- the numbers
const tol = (scale: number) => 1e-9 * Math.max(1, scale);
/** solve a dense symmetric system by Cholesky; null when it is not positive definite */
function cholesky(A: number[][], b: number[]): number[] | null {
  const n = b.length, L = A.map((r) => r.map(() => 0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = A[i]![j]!; for (let q = 0; q < j; q++) s -= L[i]![q]! * L[j]![q]!; if (i === j) { if (!(s > 1e-300)) return null; L[i]![i] = Math.sqrt(s); } else L[i]![j] = s / L[j]![j]!; }
  const y = new Array<number>(n).fill(0), x = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) { let s = b[i]!; for (let q = 0; q < i; q++) s -= L[i]![q]! * y[q]!; y[i] = s / L[i]![i]!; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]!; for (let q = i + 1; q < n; q++) s -= L[q]![i]! * x[q]!; x[i] = s / L[i]![i]!; }
  return x;
}
/** the rank of a set of rows added one after the other: which rows add something (Gram-Schmidt with a tolerance) */
function independentRows(rows: number[][], eps: number): boolean[] {
  const basis: number[][] = [], out: boolean[] = [];
  for (const r0 of rows) {
    const r = [...r0], norm0 = Math.hypot(...r0); if (norm0 < eps) { out.push(false); continue; }
    for (let pass = 0; pass < 2; pass++) for (const b of basis) { const d = r.reduce((s, v, i) => s + v * b[i]!, 0); for (let i = 0; i < r.length; i++) r[i] = r[i]! - d * b[i]!; }
    const n = Math.hypot(...r);
    if (n > eps * Math.max(1, norm0) * 1e2 && n > 1e-7 * norm0) { basis.push(r.map((v) => v / n)); out.push(true); } else out.push(false);
  }
  return out;
}
/** the directions the unknowns can still move in: the null space of the rows, by elimination with full pivoting */
function nullSpace(rows: number[][], n: number): { basis: number[][]; rank: number } {
  const M = rows.map((r) => [...r]); const pivots: number[] = []; let rank = 0; const scale = Math.max(1e-12, ...M.flat().map(Math.abs)), eps = 1e-8 * scale;
  const used = new Array<boolean>(n).fill(false);
  for (let step = 0; step < Math.min(M.length, n); step++) {
    let best = 0, bi = -1, bj = -1; for (let i = rank; i < M.length; i++) for (let j = 0; j < n; j++) if (!used[j] && Math.abs(M[i]![j]!) > best) { best = Math.abs(M[i]![j]!); bi = i; bj = j; }
    if (best <= eps) break;
    [M[rank], M[bi]] = [M[bi]!, M[rank]!]; const pv = M[rank]![bj]!; M[rank] = M[rank]!.map((v) => v / pv);
    for (let i = 0; i < M.length; i++) if (i !== rank) { const f = M[i]![bj]!; if (f !== 0) M[i] = M[i]!.map((v, c) => v - f * M[rank]![c]!); }
    used[bj] = true; pivots.push(bj); rank++;
  }
  const basis: number[][] = [];
  for (let j = 0; j < n; j++) if (!used[j]) { const v = new Array<number>(n).fill(0); v[j] = 1; for (let r = 0; r < rank; r++) v[pivots[r]!] = -M[r]![j]!; basis.push(v); }
  return { basis, rank };
}

interface Prep {
  names: string[]; /** unknown index -> what it is */ x: number[]; frozen: boolean[];
  pointVar: Map<string, [number, number]>; circleVar: Map<string, number>; rows: { c: Constraint; fn: (x: number[]) => D[] }[]; pins: { id: string; at: [number, number] }[];
}
function prepare(S: System, hold: Set<string>, pins: Record<string, [number, number]>): Prep {
  const names: string[] = [], x: number[] = [], frozen: boolean[] = [], pointVar = new Map<string, [number, number]>(), circleVar = new Map<string, number>();
  for (const p of S.points) { const fz = !!p.fixed || hold.has(p.id); pointVar.set(p.id, [names.length, names.length + 1]); names.push(p.id + ".x", p.id + ".y"); x.push(p.x, p.y); frozen.push(fz, fz); }
  for (const c of S.circles) { circleVar.set(c.id, names.length); names.push(c.id + ".r"); x.push(c.r); frozen.push(!!c.fixedR || hold.has(c.id)); }
  const mk = (xs: number[]) => {
    const v = (i: number) => (frozen[i] ? new D(xs[i]!) : new D(xs[i]!, new Map([[i, 1]])));
    const pt = (id: string): P => { const [i, j] = pointVar.get(id)!; return { x: v(i), y: v(j) }; };
    const lines = new Map(S.lines.map((l) => [l.id, l])), circles = new Map(S.circles.map((c) => [c.id, c]));
    return { pt, line: (id: string) => { const l = lines.get(id)!; return { a: pt(l.a), b: pt(l.b) }; }, r: (id: string) => v(circleVar.get(id)!), c: (id: string) => pt(circles.get(id)!.c) };
  };
  const rows = S.constraints.map((c) => ({ c, fn: (xs: number[]) => { const m = mk(xs), kk = c.parts.map((p) => kindOf(p, S)); return RELATIONS[c.kind].rows(c.parts, { ...m, value: c.value ?? 0, at: c.at, internal: c.internal }, kk); } }));
  return { names, x, frozen, pointVar, circleVar, rows, pins: Object.entries(pins).map(([id, at]) => ({ id, at })) };
}
/** a pin is a wish, a constraint is a rule: the pin weighs little against them, and the rules are made exact again after */
const PIN_WEIGHT = 1e-3;

interface Attempt { x: number[]; cost: number; iterations: number; converged: boolean; residual: number }
/** Levenberg-Marquardt on the unknowns that are not frozen; `use` says which constraints take part */
function levenberg(S: System, prep: Prep, use: Set<string>, start: number[], scale: number, withPins: boolean, maxIter = 300): Attempt {
  const free = prep.frozen.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0), n = free.length; let x = [...start];
  const eval_ = (xs: number[]) => {
    const r: number[] = [], J: Map<number, number>[] = [];
    for (const row of prep.rows) if (use.has(row.c.id)) for (const d of row.fn(xs)) { r.push(d.v); J.push(d.g); }
    if (withPins) for (const pin of prep.pins) { const [i, j] = prep.pointVar.get(pin.id)!; r.push(PIN_WEIGHT * (xs[i]! - pin.at[0]), PIN_WEIGHT * (xs[j]! - pin.at[1])); J.push(new Map(prep.frozen[i] ? [] : [[i, PIN_WEIGHT]]), new Map(prep.frozen[j] ? [] : [[j, PIN_WEIGHT]])); }
    return { r, J };
  };
  const cost = (r: number[]) => r.reduce((s, v) => s + v * v, 0), t = tol(scale); let lambda = 1e-3, iterations = 0, stall = 0, { r, J } = eval_(x), c = cost(r);
  if (n === 0 || r.length === 0) return { x, cost: c, iterations: 0, converged: Math.sqrt(c) <= t, residual: Math.sqrt(c) };
  const idx = new Map(free.map((g, q) => [g, q] as const));
  for (; iterations < maxIter; iterations++) {
    if (Math.max(0, ...r.map(Math.abs)) <= t * 1e-2 && !withPins) break;
    const H = Array.from({ length: n }, () => new Array<number>(n).fill(0)), g = new Array<number>(n).fill(0);
    J.forEach((row, q) => { const e = [...row].filter(([i]) => idx.has(i)).map(([i, v]) => [idx.get(i)!, v] as const); for (const [a, va] of e) { g[a]! += va * r[q]!; for (const [b, vb] of e) H[a]![b]! += va * vb; } });
    if (Math.sqrt(g.reduce((s, v) => s + v * v, 0)) < 1e-14) break;
    const trace = H.reduce((s, row, i) => s + row[i]!, 0);
    let moved = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const A = H.map((row, i) => row.map((v, j) => (i === j ? v + lambda * (trace / n + 1e-9) : v))), step = cholesky(A, g.map((v) => -v)); // damped the same in every direction, so a step that has freedom takes the smallest move (the nearest answer)
      if (step) {
        const nx = [...x]; free.forEach((gi, q) => { nx[gi] = x[gi]! + step[q]!; }); const ev = eval_(nx), nc = cost(ev.r);
        if (nc < c) { x = nx; r = ev.r; J = ev.J; const drop = c - nc; c = nc; lambda = Math.max(1e-12, lambda / 5); moved = true; stall = drop <= 1e-9 * Math.max(c, 1e-12) ? stall + 1 : 0; if (stall >= 5) iterations = 1e9; /* it is not getting nearer: the constraints cannot hold */ break; }
      }
      lambda *= 4; if (lambda > 1e12) break;
    }
    if (!moved || iterations >= 1e9) break;
  }
  const residual = Math.max(0, ...eval_(x).r.slice(0, eval_(x).r.length - (withPins ? 2 * prep.pins.length : 0)).map(Math.abs));
  return { x, cost: c, iterations, converged: residual <= t, residual };
}

/** a fixed sequence of nudges, so a retry is the same on every run */
const NUDGE = [0.37, -0.61, 0.83, -0.19, 0.53, -0.97, 0.11, 0.71];
const nudged = (start: number[], frozen: boolean[], scale: number, attempt: number): number[] => start.map((v, i) => (frozen[i] ? v : v + scale * 0.05 * attempt * NUDGE[(i + attempt) % NUDGE.length]!));

/** do the constraints in `use` hold from this start, with no line or radius of nothing */
function feasible(S: System, prep: Prep, use: Set<string>, scale: number, restarts: number, minSize: number, maxIter = 300): { ok: boolean; attempt: Attempt; why: string } {
  let last: Attempt | null = null, why = "the constraints cannot all be made to hold";
  for (let a = 0; a <= restarts; a++) {
    const at = levenberg(S, prep, use, a === 0 ? prep.x : nudged(prep.x, prep.frozen, scale, a), scale, false, maxIter); last = at;
    if (!at.converged) continue;
    const collapsed = collapse(S, prep, at.x, minSize); if (collapsed) { why = collapsed; continue; }
    return { ok: true, attempt: at, why: "" };
  }
  return { ok: false, attempt: last!, why };
}
function collapse(S: System, prep: Prep, x: number[], minSize: number): string | null {
  for (const l of S.lines) { const [ai, aj] = prep.pointVar.get(l.a)!, [bi, bj] = prep.pointVar.get(l.b)!; if (Math.hypot(x[bi]! - x[ai]!, x[bj]! - x[aj]!) < minSize) return `line ${l.id} would be a line of nothing`; }
  for (const c of S.circles) if (x[prep.circleVar.get(c.id)!]! < minSize) return `circle ${c.id} would have no radius`;
  return null;
}

/** a set of constraints that cannot hold together and none of which can be left out of it (QuickXplain): about the size of the set times the log of the rest, in solves; past the budget, all of them, said */
function narrow(ids: string[], can: (set: string[]) => boolean, budget: number): { set: string[]; exceeded: boolean } {
  let solves = 0; const test = (set: string[]): boolean => (solves++ > budget ? true : can(set));
  const qx = (background: string[], added: string[], rest: string[]): string[] => {
    if (added.length > 0 && !test(background)) return [];
    if (rest.length === 1) return rest;
    const mid = Math.floor(rest.length / 2), a = rest.slice(0, mid), b = rest.slice(mid), d2 = qx([...background, ...a], a, b), d1 = qx([...background, ...d2], d2, a); return [...d1, ...d2];
  };
  const set = qx([], [], ids); return solves > budget ? { set: ids, exceeded: true } : { set, exceeded: false };
}

export function solve(S: System, opts: Options = {}): Result {
  const bad = validate(S); const empty: Solution = { points: Object.fromEntries(S.points.map((p) => [p.id, [p.x, p.y] as [number, number]])), circles: Object.fromEntries(S.circles.map((c) => [c.id, c.r])) };
  if (bad) return { solution: empty, verdict: { kind: "over", ok: false, freedom: 0, free: [], redundant: [], implied: [], conflict: [], reason: bad }, iterations: 0, unreached: {}, holds: [] };
  const hold = new Set(opts.hold ?? []), pins = opts.pins ?? {}, restarts = opts.restarts ?? 4;
  const xs = S.points.flatMap((p) => [p.x, p.y]).concat(S.circles.map((c) => c.r)), scale = Math.max(1, ...xs.map(Math.abs)), minSize = opts.minSize ?? 1e-6 * scale;
  const prep = prepare(S, hold, pins);
  // the parts connected through a constraint (or a pin) are solved together, the others apart
  const parent = prep.names.map((_, i) => i), find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const touch = (c: Constraint): number[] => c.parts.flatMap((id) => { const kind = kindOf(id, S); if (kind === "point") return [...prep.pointVar.get(id)!]; if (kind === "line") { const l = S.lines.find((q) => q.id === id)!; return [...prep.pointVar.get(l.a)!, ...prep.pointVar.get(l.b)!]; } const c2 = S.circles.find((q) => q.id === id)!; return [prep.circleVar.get(id)!, ...prep.pointVar.get(c2.c)!]; });
  for (const c of S.constraints) { const t = touch(c).filter((i) => !prep.frozen[i]); for (const i of t.slice(1)) parent[find(i)] = find(t[0]!); }
  for (const pin of prep.pins) { const [i, j] = prep.pointVar.get(pin.id)!; if (!prep.frozen[i]!) parent[find(j)] = find(i); }
  const comps = new Map<number, string[]>();
  for (const c of S.constraints) { const t = touch(c).filter((i) => !prep.frozen[i]); const root = t.length ? find(t[0]!) : -1; comps.set(root, [...(comps.get(root) ?? []), c.id]); }
  const solved = [...prep.x]; let iterations = 0; const unreached: Record<string, number> = {};
  const redundant: string[] = [], implied: string[] = [], conflict: string[] = []; let reason = "", ok = true, freedomTotal = 0; const freeParts = new Set<string>();
  const only = opts.only ? new Set(opts.only) : null;
  for (const [root, ids] of [...comps].sort((a, b) => a[0] - b[0])) {
    if (only && !ids.some((id) => touch(S.constraints.find((c) => c.id === id)!).some((i) => only.has(prep.names[i]!.split(".")[0]!)))) continue;
    const use = new Set(ids), f = feasible(S, prep, use, scale, restarts, minSize); iterations += f.attempt.iterations;
    if (!f.ok) { // a set that cannot hold together and cannot be made smaller: QuickXplain, a number of solves about the size of the set times the log of the rest (not one for each constraint)
      ok = false; const n = narrow(ids, (set) => feasible(S, prep, new Set(set), scale, 2, minSize).ok, opts.maxSolves ?? 60);
      conflict.push(...n.set); reason = f.why + (n.exceeded ? " (the set that conflicts was not narrowed: too many parts)" : ""); continue;
    }
    // where it ended; then what is free and what adds nothing
    for (let q = 0; q < solved.length; q++) if (!prep.frozen[q] && find(q) === root) solved[q] = f.attempt.x[q]!;
    const free = prep.frozen.map((fz, q) => (fz ? -1 : q)).filter((q) => q >= 0 && find(q) === root), pos = new Map(free.map((q, i) => [q, i] as const)), rowsOf: { id: string; row: number[] }[] = [];
    for (const row of prep.rows) if (use.has(row.c.id)) for (const d of row.fn(f.attempt.x)) { const v = new Array<number>(free.length).fill(0); for (const [i, g] of d.g) if (pos.has(i)) v[pos.get(i)!] = g; rowsOf.push({ id: row.c.id, row: v }); }
    const indep = independentRows(rowsOf.map((r) => r.row), 1e-9), partial = new Set<string>(); rowsOf.forEach((r, i) => { if (!indep[i]) partial.add(r.id); });
    redundant.push(...ids.filter((id) => partial.has(id)));
    for (const id of ids) { const mine = rowsOf.map((r, i) => (r.id === id ? i : -1)).filter((i) => i >= 0); if (mine.length && mine.every((i) => !indep[i])) implied.push(id); }
    const ns = nullSpace(rowsOf.map((r) => r.row), free.length); freedomTotal += ns.basis.length;
    for (const v of ns.basis) v.forEach((c, i) => { if (Math.abs(c) > 1e-8) freeParts.add(prep.names[free[i]!]!.split(".")[0]!); });
  }
  // a part with no constraint at all is free too
  const constrained = new Set<string>(); for (const c of S.constraints) for (const i of touch(c)) constrained.add(prep.names[i]!.split(".")[0]!);
  for (const p of S.points) if (!p.fixed && !hold.has(p.id) && !constrained.has(p.id)) { freedomTotal += 2; freeParts.add(p.id); }
  for (const c of S.circles) if (!c.fixedR && !hold.has(c.id) && !constrained.has(c.id)) { freedomTotal += 1; freeParts.add(c.id); }
  // a drag: the pinned parts go as near as the constraints let them
  let final = solved, holds: string[] = [];
  if (ok && prep.pins.length) {
    // first as a rule: the pinned parts fixed where they were taken to (the same answer as a fresh solve with them fixed there); when the constraints do not allow it, as a wish: as near as they let it go
    const target = solve({ ...S, points: S.points.map((p) => (pins[p.id] ? { ...p, x: pins[p.id]![0], y: pins[p.id]![1], fixed: true } : p)) }, { hold: opts.hold, restarts });
    if (target.verdict.ok) { final = [...solved]; for (const p of S.points) { const [i, j] = prep.pointVar.get(p.id)!; final[i] = target.solution.points[p.id]![0]; final[j] = target.solution.points[p.id]![1]; } for (const c of S.circles) final[prep.circleVar.get(c.id)!] = target.solution.circles[c.id]!; iterations += target.iterations; }
    else {
      // what holds it back: the constraints that cannot hold with the pinned parts fixed where they were taken to
      const S2 = { ...S, points: S.points.map((p) => (pins[p.id] ? { ...p, x: pins[p.id]![0], y: pins[p.id]![1], fixed: true } : p)) }, prep2 = prepare(S2, hold, {});
      holds = narrow(S.constraints.map((c) => c.id), (set) => feasible(S2, prep2, new Set(set), scale, 2, minSize).ok, opts.maxSolves ?? 60).set;
      const all = new Set(S.constraints.map((c) => c.id)), pulled = levenberg(S, prep, all, solved, scale, true), exact = levenberg(S, prep, all, pulled.x, scale, false); iterations += pulled.iterations + exact.iterations;
      if (exact.converged && !collapse(S, prep, exact.x, minSize)) final = exact.x;
    }
    for (const pin of prep.pins) { const [i, j] = prep.pointVar.get(pin.id)!; const d = Math.hypot(final[i]! - pin.at[0], final[j]! - pin.at[1]); if (d > tol(scale) * 1e3) unreached[pin.id] = d; }
  }
  const solution: Solution = { points: Object.fromEntries(S.points.map((p) => [p.id, [final[prep.pointVar.get(p.id)![0]]!, final[prep.pointVar.get(p.id)![1]]!] as [number, number]])), circles: Object.fromEntries(S.circles.map((c) => [c.id, final[prep.circleVar.get(c.id)!]!])) };
  const kind: VerdictKind = !ok ? "over" : redundant.length ? "redundant" : freedomTotal > 0 ? "under" : "solved";
  return { solution: ok ? solution : empty, verdict: { kind, ok, freedom: freedomTotal, free: [...freeParts].sort(), redundant, implied, conflict, reason }, iterations, unreached, holds };
}

// ---------------------------------------------------------------- asking for a constraint (E55: made, already holds, or refused)
export interface Attempt2 { outcome: "added" | "already" | "refused"; /** `already`: the constraint that says it, or that it follows from the others */ by: string[]; /** `refused`: the constraints that cannot hold together with it, and the ones among them that were there before */ victims: string[]; holding: string[]; system: System; verdict: Verdict }
const sameAs = (a: Constraint, b: Constraint) => a.kind === b.kind && a.value === b.value && JSON.stringify([...a.parts].sort()) === JSON.stringify([...b.parts].sort());
/** ask for a constraint: it is made, or it already holds as asked (nothing is added twice), or it is refused with the constraints that hold it back named */
export function tryAdd(S: System, c: Constraint, opts: Options = {}): Attempt2 {
  const twin = S.constraints.find((q) => sameAs(q, c) && !(c.kind === "horizontal" || c.kind === "vertical"));
  if (twin) return { outcome: "already", by: [twin.id], victims: [], holding: [], system: S, verdict: solve(S, opts).verdict };
  const next: System = { ...S, constraints: [...S.constraints, c] }, r = solve(next, opts);
  if (!r.verdict.ok) return { outcome: "refused", by: [], victims: r.verdict.conflict, holding: r.verdict.conflict.filter((id) => id !== c.id), system: S, verdict: r.verdict };
  if (r.verdict.implied.includes(c.id)) return { outcome: "already", by: S.constraints.map((q) => q.id), victims: [], holding: [], system: S, verdict: r.verdict }; // it follows from what is there
  return { outcome: "added", by: [], victims: [], holding: [], system: next, verdict: r.verdict };
}

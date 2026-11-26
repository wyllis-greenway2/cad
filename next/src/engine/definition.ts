// A sketch's definition read without the kernel (E48, E49, E62): the solver's system made from points, lines, circles, arcs and constraints, solved, and the drawn parts as the plane's segments. A sketch that lies on a plane has no body in it, so this is all
// the screen needs to draw it, edit it and trim it on its own (`bubbledemo.ts`, `sketchcontrol.ts`); a sketch that holds a body's edges (anchors) is made by `sketch.ts`, which adds them to the same system.
import { Refusal } from "./refusal.ts";
import { type Constraint, type Options as SolveOptions, type Result, type System, solve } from "./solver.ts";
import type { Seg } from "./region.ts";
import type { SketchParams } from "./sketch.ts";

/** the solver's system of a definition: an arc is a circle with its two ends held on it */
export function systemOf(p: SketchParams): System {
  const at0 = new Map(p.points.map((q) => [q.id, q] as const));
  const arcCircles = (p.arcs ?? []).map((a) => { const c = at0.get(a.c), s0 = at0.get(a.a); if (!c || !s0) throw new Error(`the arc ${a.id} names a point that is not there`); return { id: a.id, c: a.c, r: Math.hypot(s0.x - c.x, s0.y - c.y), fixedR: false, arc: true, ends: [a.a, a.b] as [string, string] }; });
  const arcEnds: Constraint[] = (p.arcs ?? []).flatMap((a) => [{ id: `${a.id}.start`, kind: "pointOnCircle" as const, parts: [a.a, a.id] }, { id: `${a.id}.end`, kind: "pointOnCircle" as const, parts: [a.b, a.id] }]);
  return { points: p.points.map((q) => ({ id: q.id, x: q.x, y: q.y, fixed: !!q.fixed })), lines: (p.lines ?? []).map((l) => ({ id: l.id, a: l.a, b: l.b })), circles: [...(p.circles ?? []).map((c) => ({ id: c.id, c: c.c, r: c.r, fixedR: !!c.fixedR })), ...arcCircles], constraints: [...(p.constraints ?? []), ...arcEnds] };
}
/** a solve that is not ok is refused, in words, with the constraints that hold it back named (E55) */
export function refusalOf(r: Result): Refusal {
  const who = r.verdict.conflict.length ? `: ${r.verdict.conflict.join(", ")}` : "";
  return new Refusal(r.verdict.conflict.length ? `these constraints cannot all hold${who}${r.verdict.reason ? ` (${r.verdict.reason})` : ""}` : r.verdict.reason || "this sketch cannot be made", r.verdict.conflict);
}
/**
 * The solve a sketch is made with: the first corner stays (`in_1565`). The oldest point that is not fixed is held while the rest gives way to a number or a relation (a length of 55 on a side that was 40 moves the far end, not the first corner); if the sketch cannot hold
 * with it held (a place is asked of it twice) it is solved without. A drag that names its own pins or held parts is left as it is.
 */
export function solveKeeping(system: System, opts: SolveOptions = {}): Result {
  const first = system.points.find((q) => !q.fixed)?.id;
  if (!first || opts.pins || opts.hold?.length) return solve(system, opts);
  const held = solve(system, { ...opts, hold: [first] });
  return held.verdict.ok ? held : solve(system, opts);
}
/** the places the parts of a definition end up (local to the plane): every point, and the radius of every circle and arc; refused as a sketch is */
export function solveDefinition(p: SketchParams, opts: SolveOptions = {}): { points: Record<string, [number, number]>; radii: Record<string, number>; result: Result } {
  if (!Array.isArray(p.points)) throw new Error("a sketch needs its points");
  const names = [...p.points.map((q) => q.id), ...(p.lines ?? []).map((q) => q.id), ...(p.circles ?? []).map((q) => q.id), ...(p.arcs ?? []).map((q) => q.id)];
  const dup = names.find((n, i) => names.indexOf(n) !== i); if (dup) throw new Error(`two parts of this sketch are called ${dup}`);
  const result = solveKeeping(systemOf(p), opts);
  if (!result.verdict.ok) throw refusalOf(result);
  return { points: result.solution.points, radii: result.solution.circles, result };
}
/** the drawn lines, arcs and circles of a definition as the plane's segments, from where the solve put them (construction geometry is not drawn) */
export function segsOf(p: SketchParams, sol: Record<string, [number, number]>, radii: Record<string, number>): Seg[] {
  const TAU = 2 * Math.PI, norm = (x: number) => { const m = x % TAU; return m < 0 ? m + TAU : m; }, out: Seg[] = [];
  for (const l of p.lines ?? []) if (!l.construction) out.push({ name: l.id, kind: "line", a: sol[l.a]!, b: sol[l.b]! });
  for (const a of p.arcs ?? []) { if (a.construction) continue; const c = sol[a.c]!, s0 = sol[a.a]!, e0 = sol[a.b]!, ta = Math.atan2(s0[1] - c[1], s0[0] - c[0]), tb = Math.atan2(e0[1] - c[1], e0[0] - c[0]); out.push({ name: a.id, kind: "arc", c, r: radii[a.id]!, t0: a.cw ? tb : ta, sweep: a.cw ? norm(ta - tb) : norm(tb - ta) }); }
  for (const c of p.circles ?? []) if (!c.construction) out.push({ name: c.id, kind: "arc", c: sol[c.c]!, r: radii[c.id]!, t0: 0, sweep: TAU });
  return out;
}

// What a relation can be said over, and where it stands in a sketch: the two questions the helper bar's suggestions (`interaction/suggest.ts`) and the helpers of drawing (`engine/helpers.ts`) both ask,
// answered here once (`dec_helpers_one_rule`: a helper is a relation that is applicable and within reach; nothing else about relations is decided in two places). Pure.
import { RELATIONS, residualsOf, tryAdd, type Constraint, type Relation, type System } from "./solver.ts";

export type PartKind = "point" | "line" | "circle";
/** whether a relation can be said over exactly these kinds of parts, in this order (level and upright take a line, or two points) */
export function fits(name: Relation, kinds: readonly string[]): boolean {
  if (name === "horizontal" || name === "vertical") return kinds.length === 1 ? kinds[0] === "line" : kinds.length === 2 && kinds[0] === "point" && kinds[1] === "point";
  const def = RELATIONS[name];
  return kinds.length === def.parts.length && def.parts.every((allowed, i) => (allowed as string[]).includes(kinds[i]!));
}
/** every list of kinds a relation can be said over (the shapes to look for it in) */
export function kindTuples(name: Relation): PartKind[][] {
  if (name === "horizontal" || name === "vertical") return [["line"], ["point", "point"]];
  return RELATIONS[name].parts.reduce<PartKind[][]>((acc, allowed) => (acc.length ? acc.flatMap((a) => allowed.map((k) => [...a, k])) : allowed.map((k) => [k])), []).filter((t) => fits(name, t));
}

export type Standing = "free" | "holds" | "already" | "refused";
/** where a constraint stands in a system: it already follows from what is there (`already`), the solver would refuse it (`refused`), it holds as the parts are but is not said (`holds`), or it would be new (`free`) */
export function standingOf(S: System, c: Constraint): { state: Standing; by: string[]; victims: string[]; holding: string[] } {
  const t = tryAdd(S, c);
  if (t.outcome === "already") return { state: "already", by: t.by, victims: t.victims, holding: t.holding };
  if (t.outcome === "refused") return { state: "refused", by: t.by, victims: t.victims, holding: t.holding };
  return { state: residualsOf(S, c).every((v) => Math.abs(v) < 1e-7) ? "holds" : "free", by: t.by, victims: t.victims, holding: t.holding };
}
/** Whether a relation in this standing is worth offering, to the helpers of drawing and to the helper bar alike: it would add something (new, or true as drawn and not yet said), and the solver would accept it. Already said and refused are never offered. */
export const offerable = (s: Standing): boolean => s === "free" || s === "holds";

/** About how far things must move (mm) for a relation to hold, from where they are: the shortest move that takes its residuals to zero (one Newton step from the parts it names: the coordinates of their points, the radii of their circles); 0 when it holds; Infinity when it does not depend on them. This is "in range", whatever moved things there (`in_1622`): a drag, a typed number, a part carried along, an undo. */
export function snapEstimate(S: System, c: Constraint): number {
  const r0 = residualsOf(S, c); if (!r0.length || !r0.every(Number.isFinite)) return Infinity;
  if (r0.every((v) => Math.abs(v) < 1e-9)) return 0;
  const pts = new Set<string>(), radii: string[] = [];
  for (const id of c.parts) { const l = S.lines.find((x) => x.id === id), k = S.circles.find((x) => x.id === id); if (l) { pts.add(l.a); pts.add(l.b); } else if (k) { pts.add(k.c); radii.push(k.id); } else pts.add(id); }
  const moves: ((S2: System, d: number) => System)[] = [];
  for (const id of pts) { moves.push((S2, d) => ({ ...S2, points: S2.points.map((p) => (p.id === id ? { ...p, x: p.x + d } : p)) })); moves.push((S2, d) => ({ ...S2, points: S2.points.map((p) => (p.id === id ? { ...p, y: p.y + d } : p)) })); }
  for (const id of radii) moves.push((S2, d) => ({ ...S2, circles: S2.circles.map((k) => (k.id === id ? { ...k, r: k.r + d } : k)) }));
  const h = 1e-5, J = moves.map((mv) => residualsOf(mv(S, h), c).map((v, i) => (v - r0[i]!) / h)); // (J[j][i]: row i's change for unknown j)
  const m = r0.length, A = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, k) => J.reduce((a, col) => a + col[i]! * col[k]!, 0))); // (J J^T)
  let y: number[];
  if (m === 1) { if (A[0]![0]! < 1e-14) return Infinity; y = [-r0[0]! / A[0]![0]!]; }
  else { const det = A[0]![0]! * A[1]![1]! - A[0]![1]! * A[1]![0]!; if (Math.abs(det) < 1e-14) return Infinity; y = [(-r0[0]! * A[1]![1]! + r0[1]! * A[0]![1]!) / det, (-r0[1]! * A[0]![0]! + r0[0]! * A[1]![0]!) / det]; }
  return Math.hypot(...J.map((col) => col.reduce((a, v, i) => a + v * y[i]!, 0))); // |J^T y|
}

// Dragging a part of a drawing as rules (`in_1576`): which points a press on a part holds, where a dragged point would stick, and the solve that follows the pointer. Pure: the definition and places in; the definition as the solver leaves it out.
// The part is pinned where the pointer puts it (soft: it goes as near as the constraints allow) and the solve is made from where the drag began, so it does not drift. A point let go on another point or a curve lands there and makes no constraint (`in_1574`).
import type { SketchParams } from "../engine/sketch.ts";
import { solveDefinition } from "../engine/definition.ts";
import type { Pt } from "../engine/region.ts";
import { bake, hitAt, type Sol } from "./drawing.ts";

/** the points a press on this part takes: the point itself, both ends of a line, a circle's centre, an arc's three points */
export function pinsOf(p: SketchParams, id: string): string[] {
  if (p.points.some((q) => q.id === id)) return [id];
  const l = (p.lines ?? []).find((q) => q.id === id); if (l) return [l.a, l.b];
  const c = (p.circles ?? []).find((q) => q.id === id); if (c) return [c.c];
  const a = (p.arcs ?? []).find((q) => q.id === id); if (a) return [a.c, a.a, a.b];
  return [];
}
export interface Join { id: string; kind: "point" | "curve"; at: Pt }
/** where a dragged point would stick: another point within reach, else a curve it is not a part of */
export function joinFor(p: SketchParams, s: Sol, id: string, q: Pt, tol: number): Join | null {
  let best: Join | null = null, bd = tol;
  for (const x of p.points) { if (x.id === id) continue; const at = s.points[x.id]; if (!at) continue; const d = Math.hypot(q[0] - at[0], q[1] - at[1]); if (d < bd) { bd = d; best = { id: x.id, kind: "point", at }; } }
  if (best) return best;
  const mine = new Set([...(p.lines ?? []).filter((l) => l.a === id || l.b === id).map((l) => l.id), ...(p.arcs ?? []).filter((a) => a.a === id || a.b === id || a.c === id).map((a) => a.id), ...(p.circles ?? []).filter((c) => c.c === id).map((c) => c.id)]);
  const h = hitAt({ ...p, lines: (p.lines ?? []).filter((l) => !mine.has(l.id)), arcs: (p.arcs ?? []).filter((a) => !mine.has(a.id)), circles: (p.circles ?? []).filter((c) => !mine.has(c.id)), points: [] }, s, q, tol);
  return h && h.kind === "curve" ? { id: h.id, kind: "curve", at: h.at } : null;
}
/** the drawing with the pinned points where they are asked to be, as the solver leaves it, and the constraints that held it back (named), or null when it cannot be solved there */
export function dragTo(def0: SketchParams, pins: Record<string, Pt>): { params: SketchParams; held: string[] } | null {
  try { const r = solveDefinition(def0, { pins }); return { params: bake(def0, { points: r.points, radii: r.radii }), held: r.result.holds ?? [] }; } catch { return null; }
}

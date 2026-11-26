// Dragging a part of a drawing as rules (`in_1576`): which points a press on a part holds, where a dragged point would stick, and the solve that follows the pointer. Pure: the definition and places in; the definition as the solver leaves it out.
// The part is pinned where the pointer puts it (soft: it goes as near as the constraints allow) and the solve is made from where the drag began, so it does not drift. A point let go on another point or a curve lands there and makes no constraint (`in_1574`).
import { solveDefinition } from "../engine/definition.ts";
import type { Pt } from "../engine/region.ts";
import type { SketchParams } from "../engine/sketch.ts";
import type { System } from "../engine/solver.ts";
import { bake, hitAt, type Sol } from "./drawing.ts";

/** the points a press on this part takes: the point itself (an arc's centre takes the arc with it), both ends of a line, a circle's centre; an arc's curve takes none (it sets the radius) */
export function pinsOf(p: SketchParams, id: string): string[] {
  if (p.points.some((q) => q.id === id)) {
    // (an arc's centre moves the whole arc; any other point only itself)
    const arcs = (p.arcs ?? []).filter((a) => a.c === id),
      used = (p.lines ?? []).some((l) => l.a === id || l.b === id) || (p.circles ?? []).some((c) => c.c === id);
    return arcs.length === 1 && !used ? [id, arcs[0]!.a, arcs[0]!.b] : [id];
  }
  const l = (p.lines ?? []).find((q) => q.id === id);
  if (l) return [l.a, l.b];
  const c = (p.circles ?? []).find((q) => q.id === id);
  if (c) return [c.c];
  return [];
}
export interface Join {
  id: string;
  kind: "point" | "curve";
  at: Pt;
}
/** where a dragged point would stick: another point within reach, else a curve it is not a part of */
export function joinFor(p: SketchParams, s: Sol, id: string, q: Pt, tol: number): Join | null {
  let best: Join | null = null,
    bd = tol;
  for (const x of p.points) {
    if (x.id === id) continue;
    const at = s.points[x.id];
    if (!at) continue;
    const d = Math.hypot(q[0] - at[0], q[1] - at[1]);
    if (d < bd) {
      bd = d;
      best = { id: x.id, kind: "point", at };
    }
  }
  if (best) return best;
  const mine = new Set([
    ...(p.lines ?? []).filter((l) => l.a === id || l.b === id).map((l) => l.id),
    ...(p.arcs ?? []).filter((a) => a.a === id || a.b === id || a.c === id).map((a) => a.id),
    ...(p.circles ?? []).filter((c) => c.c === id).map((c) => c.id),
  ]);
  const h = hitAt(
    {
      ...p,
      lines: (p.lines ?? []).filter((l) => !mine.has(l.id)),
      arcs: (p.arcs ?? []).filter((a) => !mine.has(a.id)),
      circles: (p.circles ?? []).filter((c) => !mine.has(c.id)),
      points: [],
    },
    s,
    q,
    tol,
  );
  return h && h.kind === "curve" ? { id: h.id, kind: "curve", at: h.at } : null;
}
/** the drawing with the pinned points where they are asked to be, as the solver leaves it, and the constraints that held it back (named), or null when it cannot be solved there */
export function dragTo(def0: SketchParams, pins: Record<string, Pt>): { params: SketchParams; held: string[] } | null {
  try {
    const r = solveDefinition(def0, { pins });
    return { params: bake(def0, { points: r.points, radii: r.radii }), held: r.result.holds ?? [] };
  } catch {
    return null;
  }
}

// ---- hints while dragging (`in_1617`): the part being dragged is a motion over the sketch (`engine/probe.ts`); what is left of the old figures is for a circle's edge
/** the system with parts taken out: those named, the lines and circles that use a point taken out, and every constraint that names one of them */
export function without(S: System, ids: readonly string[]): System {
  const gone = new Set(ids);
  for (const l of S.lines) if (gone.has(l.a) || gone.has(l.b)) gone.add(l.id);
  for (const c of S.circles) if (gone.has(c.c)) gone.add(c.id);
  return {
    points: S.points.filter((x) => !gone.has(x.id)),
    lines: S.lines.filter((l) => !gone.has(l.id)),
    circles: S.circles.filter((c) => !gone.has(c.id)),
    constraints: S.constraints.filter((k) => !k.parts.some((x) => gone.has(x))),
  };
}
/** a circle with its radius put at `r` (the edge dragged), the rest solved round it; not if the radius is held (locked or fixed): the constraints that hold it are named */
export function dragRadius(def0: SketchParams, id: string, r: number): { params: SketchParams; held: string[] } | null {
  const c = (def0.circles ?? []).find((q) => q.id === id);
  if (!c || c.fixedR) return null;
  const locked = (def0.constraints ?? []).filter((k) => k.kind === "radius" && k.parts.includes(id)).map((k) => k.id);
  if (locked.length) return { params: def0, held: locked };
  try {
    const out = solveDefinition({
      ...def0,
      circles: (def0.circles ?? []).map((q) => (q.id === id ? { ...q, r, fixedR: true } : q)),
    });
    return { params: bake(def0, { points: out.points, radii: out.radii }), held: out.result.holds ?? [] };
  } catch {
    return null;
  }
}
/** the constraints that are doing work in a drag (`in_1620`): those that name a part that was carried along (it moved, and it was not one of the points held where the pointer put them, nor the circle whose edge is dragged), so a tangent shows when the line pulled takes its circle with it and a level shows while the far end of a line follows */
export function activeOf(def0: SketchParams, next: SketchParams, held: readonly string[]): string[] {
  const was = new Map(def0.points.map((q) => [q.id, q] as const)),
    moved = new Set<string>();
  for (const q of next.points) {
    const w = was.get(q.id);
    if (w && Math.hypot(q.x - w.x, q.y - w.y) > 1e-6) moved.add(q.id);
  }
  const carried = new Set<string>([...moved].filter((id) => !held.includes(id)));
  for (const c of next.circles ?? []) {
    const w = (def0.circles ?? []).find((x) => x.id === c.id);
    if (w && Math.abs(c.r - w.r) > 1e-6 && !held.includes(c.id)) carried.add(c.id);
  }
  const lines = def0.lines ?? [],
    circles = def0.circles ?? [],
    arcs = def0.arcs ?? [];
  const isCarried = (id: string) =>
    carried.has(id) ||
    lines.some((l) => l.id === id && (carried.has(l.a) || carried.has(l.b))) ||
    circles.some((c) => c.id === id && carried.has(c.c)) ||
    arcs.some((a) => a.id === id && (carried.has(a.c) || carried.has(a.a) || carried.has(a.b)));
  return (def0.constraints ?? []).filter((k) => k.parts.some(isCarried)).map((k) => k.id);
}

// Dragging a part of a drawing as rules (`in_1576`): which points a press on a part holds, where a dragged point would stick, and the solve that follows the pointer. Pure: the definition and places in; the definition as the solver leaves it out.
// The part is pinned where the pointer puts it (soft: it goes as near as the constraints allow) and the solve is made from where the drag began, so it does not drift. A point let go on another point or a curve lands there and makes no constraint (`in_1574`).
import type { SketchParams } from "../engine/sketch.ts";
import { solveDefinition } from "../engine/definition.ts";
import type { Pt } from "../engine/region.ts";
import { bake, hitAt, type Sol } from "./drawing.ts";
import type { System } from "../engine/solver.ts";
import type { Free } from "../engine/free.ts";

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

// ---- hints while dragging (`in_1617`): what a dragged point or circle edge is to the helpers (the same rules as when it was drawn), and the sketch without it to look for what it could go to
/** what a dragged point is to the helpers: the free end of its line or lines (each a line drawn from its other end), else a place alone; and the parts to take out of the system while looking (what is dragged is not a target for itself) */
export function freeOfDrag(p: SketchParams, s: Sol, id: string): { free: Free; out: string[] } {
  const lines = (p.lines ?? []).filter((l) => l.a === id || l.b === id),
    round = [
      ...(p.circles ?? []).filter((c) => c.c === id),
      ...(p.arcs ?? []).filter((a) => a.c === id || a.a === id || a.b === id),
    ];
  if (lines.length >= 1 && !round.length) {
    // a corner of one line or of several: each is a line out of its other end to the place, so a tangent for each can be looked for (two tangents from one place)
    const ends = lines.map((l) => {
      const other = l.a === id ? l.b : l.a;
      return { l, other, at: s.points[other] };
    });
    if (ends.every((e) => e.at))
      return {
        free: {
          shape: "line",
          from: ends[0]!.at!,
          startId: ends[0]!.other,
          ...(ends.length > 1
            ? { more: ends.slice(1).map((e) => ({ name: `~M${e.l.id}`, from: e.at!, startId: e.other })) }
            : {}),
        },
        out: [id, ...lines.map((l) => l.id)],
      };
  }
  return { free: { shape: "point" }, out: [id, ...lines.map((l) => l.id), ...round.map((c) => c.id)] };
}
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
/** a part dragged as one piece (a whole line, an arc, or a circle by its centre): the free figure that moves, the place that stands for it, and the parts to take out while looking; null: it is not one piece (a point of several lines) */
export function pieceOf(p: SketchParams, s: Sol, id: string): { free: Free; ref: Pt; out: string[] } | null {
  const at = (q: string) => s.points[q];
  const l = (p.lines ?? []).find((q) => q.id === id);
  if (l) {
    const a = at(l.a),
      b = at(l.b);
    if (!a || !b) return null;
    const na = `~${l.a}`,
      nb = `~${l.b}`;
    return {
      free: {
        shape: "piece",
        ref: a,
        points: { [na]: a, [nb]: b },
        lines: [{ name: `~${l.id}`, a: na, b: nb }],
        circles: [],
      },
      ref: a,
      out: [l.a, l.b, l.id],
    };
  }
  const arc =
    (p.arcs ?? []).find((q) => q.id === id) ??
    ((p.arcs ?? []).filter((q) => q.c === id).length === 1 &&
    !(p.circles ?? []).some((q) => q.c === id) &&
    !(p.lines ?? []).some((l) => l.a === id || l.b === id)
      ? (p.arcs ?? []).find((q) => q.c === id)
      : undefined); // (a whole arc: its centre and both ends, and the circle it is on; pressed by its centre)
  if (arc) {
    const c = at(arc.c),
      a = at(arc.a),
      b = at(arc.b),
      r = s.radii[arc.id];
    if (!c || !a || !b || r === undefined) return null;
    const nc = `~${arc.c}`,
      na = `~${arc.a}`,
      nb = `~${arc.b}`;
    return {
      free: {
        shape: "piece",
        ref: c,
        points: { [nc]: c, [na]: a, [nb]: b },
        lines: [],
        circles: [{ name: `~${arc.id}`, c: nc, r }],
      },
      ref: c,
      out: [arc.c, arc.a, arc.b, arc.id],
    };
  }
  const rounds = [
      ...(p.circles ?? []).filter((c) => c.c === id),
      ...(p.arcs ?? []).filter((a) => a.c === id || a.a === id || a.b === id),
    ],
    lines = (p.lines ?? []).filter((x) => x.a === id || x.b === id);
  const c = rounds.length === 1 && !lines.length ? (p.circles ?? []).find((q) => q.c === id) : null,
    at0 = at(id);
  if (c && at0) {
    const n = `~${id}`;
    return {
      free: {
        shape: "piece",
        ref: at0,
        points: { [n]: at0 },
        lines: [],
        circles: [{ name: `~${c.id}`, c: n, r: s.radii[c.id] ?? c.r }],
      },
      ref: at0,
      out: [id, c.id],
    };
  }
  return null;
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

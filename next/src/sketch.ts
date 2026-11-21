// Sketch figures and the tools that make them, as pure functions. A figure is drawn on a plane in the plane's own two axes (so it goes with the plane when the plane is moved).
// Line: clicks lay a chain of segments. Rectangle: two opposite corners. Circle: the middle, then a point on it.
import { add, dot, scale, sub, type V3 } from "./vec.ts";
import type { Frame } from "./planes.ts";
import { vOf } from "./planes.ts";
import { settings } from "./settings.ts";

export type P2 = [number, number];
export type Shape = { kind: "line"; a: P2; b: P2 } | { kind: "rect"; a: P2; b: P2 } | { kind: "circle"; c: P2; r: number };
export type ToolKind = "line" | "rect" | "circle";
/** A tool: its kind and the points placed so far for the figure under way. */
export interface Tool { kind: ToolKind; pts: P2[] }
export const newTool = (kind: ToolKind): Tool => ({ kind, pts: [] });
const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** A point is placed: the figures made (none, or one) and the tool as it is then. A line goes on from where it ended; the others are done. */
export function place(t: Tool, p: P2): { made: Shape[]; tool: Tool } {
  const a = t.pts[0];
  if (!a) return { made: [], tool: { ...t, pts: [p] } };
  if (dist(a, p) < 1e-9) return { made: [], tool: t }; // (a second click on the same place makes nothing)
  if (t.kind === "line") return { made: [{ kind: "line", a, b: p }], tool: { ...t, pts: [p] } };
  if (t.kind === "rect") return { made: [{ kind: "rect", a, b: p }], tool: { ...t, pts: [] } };
  return { made: [{ kind: "circle", c: a, r: dist(a, p) }], tool: { ...t, pts: [] } };
}
/** What would be made if the next point were here (shown as the pointer moves). */
export function preview(t: Tool, p: P2): Shape | null { return place(t, p).made[0] ?? null; }
/** The figure under way is given up (a line's chain ends). */
export const cancelFigure = (t: Tool): Tool => ({ ...t, pts: [] });

/** A figure as a line of points (closed for a rectangle and a circle). */
export function outline(s: Shape): P2[] {
  if (s.kind === "line") return [s.a, s.b];
  if (s.kind === "rect") return [s.a, [s.b[0], s.a[1]], s.b, [s.a[0], s.b[1]], s.a];
  const n = settings.sketch.circleSegments;
  return Array.from({ length: n + 1 }, (_, k) => [s.c[0] + s.r * Math.cos((k / n) * 2 * Math.PI), s.c[1] + s.r * Math.sin((k / n) * 2 * Math.PI)] as P2);
}
/** The points a pointer sticks to: ends, corners, middles. */
export function keyPoints(s: Shape): P2[] {
  if (s.kind === "line") return [s.a, s.b];
  if (s.kind === "rect") return [s.a, [s.b[0], s.a[1]], s.b, [s.a[0], s.b[1]]];
  return [s.c, [s.c[0] + s.r, s.c[1]], [s.c[0], s.c[1] + s.r], [s.c[0] - s.r, s.c[1]], [s.c[0], s.c[1] - s.r]];
}
/** Where a point goes when the pointer is near a place of an earlier figure, else near a grid crossing (within `tol` mm of it), else stays. */
export function snap(p: P2, shapes: Shape[], step: number, tol: number): P2 {
  let best: P2 | null = null, bd = tol;
  for (const s of shapes) for (const k of keyPoints(s)) { const d = dist(p, k); if (d < bd) { bd = d; best = k; } }
  if (best) return best;
  const g: P2 = [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step];
  return dist(p, g) < tol ? g : p;
}

// ---- between the plane's own axes and the world ----
export const to3 = (f: Frame, p: P2): V3 => add(f.origin, add(scale(f.u, p[0]), scale(vOf(f), p[1])));
export const to2 = (f: Frame, q: V3): P2 => { const d = sub(q, f.origin); return [dot(d, f.u), dot(d, vOf(f))]; };
/** Where a ray meets the plane (null: it never does). */
export function onPlane(f: Frame, o: V3, d: V3): V3 | null {
  const den = dot(d, f.normal);
  if (Math.abs(den) < 1e-9) return null;
  return add(o, scale(d, dot(sub(f.origin, o), f.normal) / den));
}

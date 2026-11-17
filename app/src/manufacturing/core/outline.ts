// Flat outlines as loops (`in_569`): generic 2D code every cutting route shares (laser, plasma, waterjet, a router's profile). Pieces that meet end to end are joined into loops, a loop is turned into a polygon within a
// tolerance, and loops are told apart as outside edges and holes by how they nest. Pure; millimetres in the plane's own coordinates.
import type { FlatPiece, Point2, Layer } from "../contract/index.ts";

export type Line = Extract<FlatPiece, { kind: "line" }>;
export type Arc = Extract<FlatPiece, { kind: "arc" }>;
/** A straight or curved piece of a loop, in the order the loop goes. */
export type Item = Line | Arc;
export interface Loop { items: Item[]; closed: boolean; layer: Layer }

const TAU = Math.PI * 2;
const near = (a: Point2, b: Point2, tol: number): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

/** How far round an arc goes, in radians: positive counter-clockwise, negative clockwise; a full turn when its ends are the same point. */
export function sweepOf(a: Arc): number {
  const [a0, a1] = [Math.atan2(a.p[1] - a.center[1], a.p[0] - a.center[0]), Math.atan2(a.q[1] - a.center[1], a.q[0] - a.center[0])];
  const ccw = ((a1 - a0) % TAU + TAU) % TAU;
  const s = a.ccw ? ccw : -(((a0 - a1) % TAU + TAU) % TAU);
  return Math.abs(s) < 1e-9 ? (a.ccw ? TAU : -TAU) : s;
}
const turned = (p: Item): Item => (p.kind === "line" ? { ...p, p: p.q, q: p.p } : { ...p, p: p.q, q: p.p, ccw: !p.ccw });

/** A circle as two half arcs (a full-circle arc has the same two ends, which controllers and files read in different ways). */
function circleItems(c: Point2, r: number, layer: Layer): Item[] {
  const [e, w]: [Point2, Point2] = [[c[0] + r, c[1]], [c[0] - r, c[1]]];
  return [{ kind: "arc", center: c, radius: r, p: e, q: w, ccw: true, layer }, { kind: "arc", center: c, radius: r, p: w, q: e, ccw: true, layer }];
}

/** The pieces joined end to end into loops, each piece turned the way its loop goes, closed when a run comes back to its start. Pieces of different layers are never joined. A circle is its own closed loop of two arcs. */
export function loopsOf(pieces: readonly FlatPiece[], tol = 1e-4): Loop[] {
  const out: Loop[] = [];
  for (const layer of ["cut", "score", "engrave"] as const) {
    const mine = pieces.filter((p) => (p.layer ?? "cut") === layer);
    const left: Item[] = [];
    for (const p of mine) {
      if (p.kind === "circle") out.push({ items: circleItems(p.center, p.radius, layer), closed: true, layer });
      else left.push({ ...p, layer });
    }
    while (left.length) {
      const items: Item[] = [left.shift()!];
      for (let grew = true; grew; ) {
        grew = false;
        const [first, last] = [items[0]!, items[items.length - 1]!];
        if (items.length > 1 && near(first.p, last.q, tol)) break;
        for (let i = 0; i < left.length; i++) {
          const q = left[i]!;
          if (near(last.q, q.p, tol)) { items.push(q); left.splice(i, 1); grew = true; break; }
          if (near(last.q, q.q, tol)) { items.push(turned(q)); left.splice(i, 1); grew = true; break; }
          if (near(first.p, q.q, tol)) { items.unshift(q); left.splice(i, 1); grew = true; break; }
          if (near(first.p, q.p, tol)) { items.unshift(turned(q)); left.splice(i, 1); grew = true; break; }
        }
      }
      const closed = near(items[0]!.p, items[items.length - 1]!.q, tol) && (items.length > 1 || items[0]!.kind === "arc");
      out.push({ items, closed, layer });
    }
  }
  return out;
}

/** The points of a loop as a polygon, an arc cut into steps so that the polygon is never more than `tol` mm from the curve. A closed loop does not repeat its first point. */
export function polygonOf(loop: Loop, tol = 0.01): Point2[] {
  const pts: Point2[] = [];
  for (const it of loop.items) {
    pts.push(it.p);
    if (it.kind === "arc") {
      const s = sweepOf(it);
      const r = it.radius;
      const step = r > tol ? 2 * Math.acos(Math.max(0, 1 - tol / r)) : Math.PI / 2;
      const n = Math.max(2, Math.ceil(Math.abs(s) / Math.max(step, 1e-3)));
      const a0 = Math.atan2(it.p[1] - it.center[1], it.p[0] - it.center[0]);
      for (let i = 1; i < n; i++) pts.push([it.center[0] + r * Math.cos(a0 + (s * i) / n), it.center[1] + r * Math.sin(a0 + (s * i) / n)]);
    }
  }
  if (!loop.closed) pts.push(loop.items[loop.items.length - 1]!.q);
  return pts;
}

/** Twice the signed area: positive when the polygon goes counter-clockwise. */
export function areaOf(poly: readonly Point2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [p, q] = [poly[i]!, poly[(i + 1) % poly.length]!]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
export function lengthOf(poly: readonly Point2[], closed: boolean): number {
  let l = 0;
  for (let i = 0; i + 1 < poly.length; i++) l += Math.hypot(poly[i + 1]![0] - poly[i]![0], poly[i + 1]![1] - poly[i]![1]);
  return closed && poly.length > 1 ? l + Math.hypot(poly[0]![0] - poly[poly.length - 1]![0], poly[0]![1] - poly[poly.length - 1]![1]) : l;
}
/** Is the point inside the polygon (the even-odd rule)? */
export function insidePolygon(p: Point2, poly: readonly Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i]!, poly[j]!];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/** Is the whole of a polygon inside another (every one of its points)? A polygon that only crosses another is not inside it. */
export const containedIn = (p: readonly Point2[], outer: readonly Point2[]): boolean => p.every((v) => insidePolygon(v, outer));
/** How many other closed loops each loop lies wholly inside: 0 for an outside edge, 1 for a hole in it, 2 for an island in the hole, and so on. Open loops are depth 0 and are not counted as containers. Two loops that cross are neither inside the other. */
export function depthsOf(polys: readonly Point2[][], closed: readonly boolean[]): number[] {
  return polys.map((p, i) => (closed[i] ? polys.reduce((n, q, j) => (j !== i && closed[j] && containedIn(p, q) ? n + 1 : n), 0) : 0));
}
/** The smallest box round the points: its corners. */
export function boxOf(polys: readonly (readonly Point2[])[]): { min: Point2; max: Point2 } | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polys) for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return Number.isFinite(x0) ? { min: [x0, y0], max: [x1, y1] } : null;
}

// Offsetting a polygon (`in_569`): the path a beam or a cutter must follow to cut a line `d` mm to one side (kerf, tool radius). Generic 2D code every cutting route shares. Each corner is mitred (so a sharp corner of the part stays
// sharp), with a bevel where two edges nearly fold back on themselves. Not for loops with features smaller than the offset: it says so by returning null rather than giving a wrong path. Pure; millimetres.
import type { Point2 } from "../contract/index.ts";
import { areaOf } from "./outline.ts";

const segDist = (p: Point2, a: Point2, b: Point2): number => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

/**
 * The polygon moved `d` mm outwards (`d` negative: inwards), whichever way it goes round. Null when the result is not a sensible polygon: the shape turned inside out or shrank to almost nothing
 * (a hole smaller than the offset, a web thinner than twice it). `miter` is the longest a corner's point may reach, in multiples of `d`.
 */
export function offsetPolygon(poly: readonly Point2[], d: number, miter = 4): Point2[] | null {
  const n = poly.length;
  if (n < 3) return null;
  if (d === 0) return poly.map((p) => [p[0], p[1]]);
  const ccw = areaOf(poly) > 0;
  const pts = ccw ? poly : [...poly].reverse();
  const normal = (a: Point2, b: Point2): Point2 | null => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return l < 1e-12 ? null : [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]; }; // (the outward one for a counter-clockwise polygon)
  const out: Point2[] = [];
  for (let i = 0; i < n; i++) {
    const [prev, cur, next] = [pts[(i + n - 1) % n]!, pts[i]!, pts[(i + 1) % n]!];
    const n1 = normal(prev, cur), n2 = normal(cur, next);
    if (!n1 || !n2) continue; // (a repeated point)
    const k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    if (k < 1 / (miter * miter) * 2) { out.push([cur[0] + n1[0] * d, cur[1] + n1[1] * d], [cur[0] + n2[0] * d, cur[1] + n2[1] * d]); continue; } // (almost folded back: a bevel)
    out.push([cur[0] + ((n1[0] + n2[0]) * d) / k, cur[1] + ((n1[1] + n2[1]) * d) / k]);
  }
  if (out.length < 3) return null;
  const a0 = areaOf(pts), a1 = areaOf(out);
  if (a1 <= 0 || (d < 0 && a1 > a0) || (d > 0 && a1 < a0)) return null; // (turned inside out, or the wrong way)
  if (d < 0 && a1 < a0 * 1e-4) return null;
  // every point of the result must be a distance of `d` or more from the original (a shape that has gone through itself is a small shape the wrong way out, with the right sign of area)
  if (n * out.length < 4e6) {
    const need = Math.abs(d) * (1 - 1e-6) - 1e-9;
    for (const q of out) for (let i = 0; i < n; i++) if (segDist(q, pts[i]!, pts[(i + 1) % n]!) < need) return null;
  }
  return ccw ? out : out.reverse();
}

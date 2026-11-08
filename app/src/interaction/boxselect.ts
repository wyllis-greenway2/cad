// Drag select (`in_230`): a drag with the right button draws a rectangle; what is inside it when it is let go is selected (what it touches too, when it is dragged from right to left; Shift
// adds to what is selected). Edges (lines, arcs, circles) are what it picks; only when there are none in it, the corners. What a face of the body hides is not picked, nor what a step used up.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import { outlineOf } from "../operation/part.ts";
import { consumed } from "../operation/ownership.ts";
import type { PointerView } from "../operation/part.ts";
import { candidatesAt } from "./picking.ts";

export interface Box { x0: number; y0: number; x: number; y: number }
/** Pulled from the right to the left: what it only touches is picked too. */
export const crossing = (b: Box): boolean => b.x < b.x0;

const RING = 24;
const PIECES = 16;
/** The points a part is drawn through: a corner is one, a line two, an arc its curve, a circle its ring. */
function samples(scene: Scene, ref: Ref): Vec3[] {
  const p = scene.parts[ref];
  if (!p) return [];
  const o = outlineOf(lookup(scene), p);
  const along = (pts: Vec3[]): Vec3[] => pts.flatMap((a, i) => (i === 0 ? [a] : Array.from({ length: PIECES }, (_, k) => { const b = pts[i - 1]!; const t = (k + 1) / PIECES; return add(b, scale(sub(a, b), t)); })));
  switch (o.shape) {
    case "point": return [o.at];
    case "segment": return along([o.a, o.b]);
    case "polyline": return along(o.pts);
    case "circle": {
      const n = normalize(o.normal);
      const u = normalize(Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0]));
      const v = cross(n, u);
      return Array.from({ length: RING }, (_, k) => { const t = (k / RING) * Math.PI * 2; return add(o.center, scale(add(scale(u, Math.cos(t)), scale(v, Math.sin(t))), o.radius)); });
    }
    default: return [];
  }
}

/** What the rectangle picks, in the order of the scene. `view` makes the picking view of a pixel; `project` takes a point of the scene to the pixels. */
export function boxSelect(scene: Scene, box: Box, project: (p: Vec3) => [number, number], view: (x: number, y: number) => PointerView): Ref[] {
  const [lo, hi] = [[Math.min(box.x0, box.x), Math.min(box.y0, box.y)], [Math.max(box.x0, box.x), Math.max(box.y0, box.y)]] as const;
  const inside = (q: [number, number]) => q[0] >= lo[0] && q[0] <= hi[0] && q[1] >= lo[1] && q[1] <= hi[1];
  const touch = crossing(box);
  const used = consumed(scene);
  const hidden = (at: Vec3, q: [number, number]): boolean => {
    const pv = view(q[0], q[1]);
    if (!pv.ray) return false;
    const t = dot(sub(at, pv.ray.o), pv.ray.d);
    return candidatesAt(scene, pv, { pointTol: 0, lineTol: 0 }).some((c) => c.rank === 2 && scene.parts[c.ref]?.origin !== "world" && c.score < t - (0.002 * t + 0.05));
  };
  const hit = (ref: Ref): boolean => {
    const pts = samples(scene, ref);
    if (!pts.length) return false;
    const px = pts.map(project);
    const ok = touch ? px.some(inside) : px.every(inside);
    if (!ok) return false;
    const mid = Math.floor(pts.length / 2);
    const at = px.filter(inside).length ? (touch ? px.findIndex(inside) : mid) : mid;
    return !hidden(pts[at]!, px[at]!);
  };
  const edges: Ref[] = [];
  const corners: Ref[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.origin === "world" || used.has(p.ref) || ("derived" in p && p.derived)) continue;
    if (p.kind === "line" || p.kind === "circle") { if (hit(p.ref)) edges.push(p.ref); }
    else if (p.kind === "corner") { if (hit(p.ref)) corners.push(p.ref); }
  }
  return edges.length ? edges : corners;
}

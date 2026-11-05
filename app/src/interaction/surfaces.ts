// Surfaces as triangles (flat xyz), for drawing a part's highlight and its fill: a world pane, a flat face of the body, a closed loop of lines, a disk.
// Pure; the view turns these into meshes.
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot } from "../math/vec.ts";
import type { Lookup, Part } from "../operation/part.ts";
import { pointOf, circleOf } from "../operation/part.ts";
import { settings } from "../shared/settings.ts";

/** Ear clipping of a simple polygon given in 2D; returns triangle index triples. */
export function triangulate(poly: [number, number][]): number[] {
  const n = poly.length;
  if (n < 3) return [];
  const area = poly.reduce((s, p, i) => s + (poly[(i + 1) % n]![0] - p[0]) * (poly[(i + 1) % n]![1] + p[1]), 0);
  const idx = poly.map((_, i) => i);
  if (area > 0) idx.reverse(); // counter-clockwise
  const out: number[] = [];
  const cross = (a: number, b: number, c: number) => (poly[b]![0] - poly[a]![0]) * (poly[c]![1] - poly[a]![1]) - (poly[b]![1] - poly[a]![1]) * (poly[c]![0] - poly[a]![0]);
  const inside = (p: number, a: number, b: number, c: number) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const [a, b, c] = [idx[(i + idx.length - 1) % idx.length]!, idx[i]!, idx[(i + 1) % idx.length]!];
      if (cross(a, b, c) <= 1e-12) continue;
      if (idx.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      out.push(a, b, c);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push(idx[0]!, idx[1]!, idx[2]!);
  return out;
}

/** How far an infinite plane is drawn for highlighting (mm): far past anything you will look at. */
const INFINITE = 20000;

/** The triangles of a surface part, or null if the part is not a surface. */
export function surfaceTriangles(get: Lookup, p: Part): number[] | null {
  if (p.kind === "plane") {
    if (p.mesh) return [...p.mesh];
    const e = p.infinite ? INFINITE : p.extent;
    if (e === undefined) return null;
    const from = p.infinite ? -INFINITE : p.origin === "world" ? settings.panes.offset : 0; // a world pane floats out from the axes
    const c = (x: number, y: number): Vec3 => add(p.at, add(scale(p.u, from + x * (e - from)), scale(p.v, from + y * (e - from))));
    return [c(0, 0), c(1, 0), c(1, 1), c(0, 0), c(1, 1), c(0, 1)].flat();
  }
  if (p.kind !== "face") return null;
  const pl = p.plane ? get(p.plane) : undefined;
  if (!pl || pl.kind !== "plane") return null;
  const flat2d = (q: Vec3): [number, number] => [dot(sub(q, pl.at), pl.u), dot(sub(q, pl.at), pl.v)];
  const lift = (x: number, y: number): Vec3 => add(pl.at, add(scale(pl.u, x), scale(pl.v, y)));
  let poly: [number, number][];
  if (p.disk) {
    const c = circleOf(get, p.disk);
    if (!c) return null;
    const [cx, cy] = flat2d(c.center);
    poly = Array.from({ length: 64 }, (_, i) => [cx + Math.cos((i / 64) * Math.PI * 2) * c.radius, cy + Math.sin((i / 64) * Math.PI * 2) * c.radius]);
  } else {
    poly = p.corners.map((r) => pointOf(get, r)).filter((q): q is Vec3 => !!q).map(flat2d);
  }
  return triangulate(poly).flatMap((i) => [...lift(poly[i]![0], poly[i]![1])]);
}

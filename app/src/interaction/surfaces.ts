// Surfaces as triangles (flat xyz), for drawing a part's highlight and its fill: a world pane, a flat face of the body, a closed loop of lines, a disk.
// Pure; the view turns these into meshes.
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot } from "../math/vec.ts";
import type { Lookup, Part } from "../operation/part.ts";
import { circleOf, loopPoints, localOf, liftOf } from "../operation/part.ts";
import { triangulate, joinTouching, withHoles2d } from "../operation/polygon.ts";
export { triangulate, joinTouching }; // (kept here for the callers that ask the surfaces for them)

/** How far an infinite plane is drawn for highlighting (mm): far past anything you will look at. */
const INFINITE = 20000;

/** The triangles of a surface part, or null if the part is not a surface. */
export function surfaceTriangles(get: Lookup, p: Part): number[] | null {
  if (p.kind === "plane") {
    if (p.mesh) return [...p.mesh];
    const e = p.infinite ? INFINITE : p.extent;
    if (e === undefined) return null;
    const from = p.infinite ? -INFINITE : 0;
    const c = (x: number, y: number): Vec3 => add(p.at, add(scale(p.u, from + x * (e - from)), scale(p.v, from + y * (e - from))));
    return [c(0, 0), c(1, 0), c(1, 1), c(0, 0), c(1, 1), c(0, 1)].flat();
  }
  if (p.kind !== "face") return null;
  const pl = p.plane ? get(p.plane) : undefined;
  if (!pl || pl.kind !== "plane") return null;
  const flat2d = (q: Vec3): [number, number] => localOf(pl, q);
  const lift = (x: number, y: number): Vec3 => liftOf(pl, [x, y]);
  const shape = (f: Extract<Part, { kind: "face" }>): [number, number][] | null => {
    if (f.disk) {
      const c = circleOf(get, f.disk);
      if (!c) return null;
      const [cx, cy] = flat2d(c.center);
      return Array.from({ length: 64 }, (_, i): [number, number] => [cx + Math.cos((i / 64) * Math.PI * 2) * c.radius, cy + Math.sin((i / 64) * Math.PI * 2) * c.radius]);
    }
    return loopPoints(get, f.loop, f.corners).map(flat2d);
  };
  const holes = (p.holes ?? []).map((h) => get(h)).flatMap((h) => (h?.kind === "face" ? [shape(h)] : [])).filter((h): h is [number, number][] => !!h);
  if (holes.length) {
    const outer = shape(p);
    if (!outer) return null;
    const merged = withHoles2d(outer, joinTouching(holes));
    return triangulate(merged).flatMap((i) => [...lift(merged[i]![0], merged[i]![1])]);
  }
  let poly: [number, number][];
  if (p.disk) {
    const c = circleOf(get, p.disk);
    if (!c) return null;
    const [cx, cy] = flat2d(c.center);
    poly = Array.from({ length: 64 }, (_, i) => [cx + Math.cos((i / 64) * Math.PI * 2) * c.radius, cy + Math.sin((i / 64) * Math.PI * 2) * c.radius]);
  } else {
    poly = loopPoints(get, p.loop, p.corners).map(flat2d);
  }
  return triangulate(poly).flatMap((i) => [...lift(poly[i]![0], poly[i]![1])]);
}


// Surfaces as triangles (flat xyz), for drawing a part's highlight and its fill: a world pane, a flat face of the body, a closed loop of lines, a disk.
// Pure; the view turns these into meshes.
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot } from "../math/vec.ts";
import type { Lookup, Part } from "../operation/part.ts";
import { circleOf, loopPoints } from "../operation/part.ts";

/** Ear clipping of a simple polygon given in 2D; returns triangle index triples. */
export function triangulate(poly: [number, number][]): number[] {
  const n = poly.length;
  if (n < 3) return [];
  const area = poly.reduce((s, p, i) => s + (poly[(i + 1) % n]![0] - p[0]) * (poly[(i + 1) % n]![1] + p[1]), 0);
  const idx = poly.map((_, i) => i);
  if (area > 0) idx.reverse(); // counter-clockwise
  const out: number[] = [];
  const cross = (a: number, b: number, c: number) => (poly[b]![0] - poly[a]![0]) * (poly[c]![1] - poly[a]![1]) - (poly[b]![1] - poly[a]![1]) * (poly[c]![0] - poly[a]![0]);
  const same = (p: number, q: number) => Math.abs(poly[p]![0] - poly[q]![0]) < 1e-12 && Math.abs(poly[p]![1] - poly[q]![1]) < 1e-12;
  const inside = (p: number, a: number, b: number, c: number) => !same(p, a) && !same(p, b) && !same(p, c) && cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0; // (a point repeated by a bridge to a hole is not in the way of itself)
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
    const from = p.infinite ? -INFINITE : 0;
    const c = (x: number, y: number): Vec3 => add(p.at, add(scale(p.u, from + x * (e - from)), scale(p.v, from + y * (e - from))));
    return [c(0, 0), c(1, 0), c(1, 1), c(0, 0), c(1, 1), c(0, 1)].flat();
  }
  if (p.kind !== "face") return null;
  const pl = p.plane ? get(p.plane) : undefined;
  if (!pl || pl.kind !== "plane") return null;
  const flat2d = (q: Vec3): [number, number] => [dot(sub(q, pl.at), pl.u), dot(sub(q, pl.at), pl.v)];
  const lift = (x: number, y: number): Vec3 => add(pl.at, add(scale(pl.u, x), scale(pl.v, y)));
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
    const merged = withHoles2d(outer, holes);
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

/** A polygon with holes as one polygon: each hole is joined to the outside by a bridge (two coincident edges) from its nearest vertex to the nearest outer vertex that can be seen from it. */
function withHoles2d(outer: [number, number][], holes: [number, number][][]): [number, number][] {
  const orient = (p: [number, number][]) => p.reduce((s, a, i) => s + (p[(i + 1) % p.length]![0] - a[0]) * (p[(i + 1) % p.length]![1] + a[1]), 0); // > 0: clockwise
  let ring = orient(outer) > 0 ? [...outer].reverse() : [...outer]; // counter-clockwise
  const crosses = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) => {
    const o = (p: [number, number], q: [number, number], r: [number, number]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return o(a, b, c) * o(a, b, d) < -1e-12 && o(c, d, a) * o(c, d, b) < -1e-12;
  };
  for (const h0 of [...holes].sort((a, b) => Math.max(...b.map((p) => p[0])) - Math.max(...a.map((p) => p[0])))) {
    const hole = orient(h0) < 0 ? [...h0].reverse() : [...h0]; // clockwise
    let best: { i: number; j: number; d: number } | null = null;
    for (let i = 0; i < hole.length; i++) for (let j = 0; j < ring.length; j++) {
      const d = Math.hypot(hole[i]![0] - ring[j]![0], hole[i]![1] - ring[j]![1]);
      if (best && d >= best.d) continue;
      const edges: [[number, number], [number, number]][] = [];
      for (let k = 0; k < ring.length; k++) edges.push([ring[k]!, ring[(k + 1) % ring.length]!]);
      for (let k = 0; k < hole.length; k++) edges.push([hole[k]!, hole[(k + 1) % hole.length]!]);
      if (edges.some(([a, b]) => crosses(hole[i]!, ring[j]!, a, b))) continue;
      best = { i, j, d };
    }
    if (!best) continue;
    const { i, j } = best;
    ring = [...ring.slice(0, j + 1), ...hole.slice(i), ...hole.slice(0, i), hole[i]!, ring[j]!, ...ring.slice(j + 1)];
  }
  return ring;
}

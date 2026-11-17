// Polygons in 2D (`in_681`): ear clipping, joining holes that touch, and bridging holes into the outline. Pure; the faces of the drawing, the faces of the body and the cut face of a section all use them.

const triangulated = new Map<string, number[]>();
/**
 * Ear clipping of a simple polygon given in 2D; returns triangle index triples. The answer for a polygon is kept (by its numbers), since the same face is filled again and again while the pointer
 * moves over it or the view is turned, and clipping a polygon of a few hundred points takes milliseconds (`in_248`).
 */
export function triangulate(poly: [number, number][]): number[] {
  const key = poly.map((p) => `${p[0]},${p[1]}`).join(";");
  const known = triangulated.get(key);
  if (known) return known;
  const made = clip(poly);
  if (triangulated.size >= 200) triangulated.delete(triangulated.keys().next().value!);
  triangulated.set(key, made);
  return made;
}

function clip(poly: [number, number][]): number[] {
  const n = poly.length;
  if (n < 3) return [];
  const area = poly.reduce((s, p, i) => s + (poly[(i + 1) % n]![0] - p[0]) * (poly[(i + 1) % n]![1] + p[1]), 0);
  const idx = poly.map((_, i) => i);
  if (area > 0) idx.reverse(); // counter-clockwise
  const out: number[] = [];
  const cross = (a: number, b: number, c: number) => (poly[b]![0] - poly[a]![0]) * (poly[c]![1] - poly[a]![1]) - (poly[b]![1] - poly[a]![1]) * (poly[c]![0] - poly[a]![0]);
  const same = (p: number, q: number) => Math.abs(poly[p]![0] - poly[q]![0]) < 1e-12 && Math.abs(poly[p]![1] - poly[q]![1]) < 1e-12;
  const inside = (p: number, a: number, b: number, c: number) => !same(p, a) && !same(p, b) && !same(p, c) && cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0; // (a point repeated by a bridge to a hole is not in the way of itself)
  // one pass round the polygon, cutting each ear as it is found and going on from there (not starting again from the first corner after every cut, which made the work grow with the cube of the points)
  let i = 0;
  let idle = 0;
  while (idx.length > 3 && idle <= idx.length) {
    i %= idx.length;
    const m = idx.length;
    const [a, b, c] = [idx[(i + m - 1) % m]!, idx[i]!, idx[(i + 1) % m]!];
    let ear = cross(a, b, c) > 1e-12;
    if (ear) {
      const [x0, x1] = [Math.min(poly[a]![0], poly[b]![0], poly[c]![0]), Math.max(poly[a]![0], poly[b]![0], poly[c]![0])];
      const [y0, y1] = [Math.min(poly[a]![1], poly[b]![1], poly[c]![1]), Math.max(poly[a]![1], poly[b]![1], poly[c]![1])];
      for (const p of idx) {
        if (p === a || p === b || p === c) continue;
        const [px, py] = poly[p]!;
        if (px < x0 || px > x1 || py < y0 || py > y1) continue; // (outside the triangle's box: outside it)
        if (inside(p, a, b, c)) { ear = false; break; }
      }
    }
    if (ear) {
      out.push(a, b, c);
      idx.splice(i, 1);
      i = Math.max(0, i - 1);
      idle = 0;
    } else {
      i++;
      idle++;
    }
  }
  if (idx.length === 3) out.push(idx[0]!, idx[1]!, idx[2]!);
  return out;
}


/**
 * Holes that touch along a side are one hole: the pieces a circle was cut into by lines, which lie inside a bigger figure, share the sides the lines made. Joining them to the outside one by one would bridge
 * along those shared sides and leave a sliver out of the fill (`in_245`); taking the shared sides away first leaves the outline of their union, which has nothing in it to bridge across. If the edges do not
 * pair up cleanly the holes are left as they were.
 */
export function joinTouching(holes: [number, number][][]): [number, number][][] {
  if (holes.length < 2) return holes;
  const key = (p: [number, number]) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;
  const ccw = (p: [number, number][]) => (p.reduce((s, a, i) => s + (p[(i + 1) % p.length]![0] - a[0]) * (p[(i + 1) % p.length]![1] + a[1]), 0) > 0 ? [...p].reverse() : p);
  const edges = new Map<string, { a: [number, number]; b: [number, number] }>();
  for (const h of holes.map(ccw)) for (let i = 0; i < h.length; i++) {
    const [a, b] = [h[i]!, h[(i + 1) % h.length]!];
    if (key(a) === key(b)) continue;
    const back = `${key(b)}>${key(a)}`;
    if (edges.has(back)) edges.delete(back); // (the same side walked the other way by the hole beside it: it is inside the union)
    else edges.set(`${key(a)}>${key(b)}`, { a, b });
  }
  if (edges.size === [...holes].reduce((n, h) => n + h.length, 0)) return holes; // (nothing shared)
  const from = new Map<string, { a: [number, number]; b: [number, number] }[]>();
  for (const e of edges.values()) from.set(key(e.a), [...(from.get(key(e.a)) ?? []), e]);
  const loops: [number, number][][] = [];
  for (const start of [...edges.values()]) {
    if (!from.get(key(start.a))?.includes(start)) continue; // (already walked)
    const loop: [number, number][] = [];
    let e: typeof start | undefined = start;
    while (e) {
      loop.push(e.a);
      const list = from.get(key(e.a))!;
      list.splice(list.indexOf(e), 1);
      e = from.get(key(e.b))?.[0];
      if (e === start) break;
    }
    if (loop.length < 3) return holes;
    loops.push(loop);
  }
  const left = [...from.values()].reduce((n, l) => n + l.length, 0);
  return left === 0 && loops.length ? loops : holes;
}

/** A polygon with holes as one polygon: each hole is joined to the outside by a bridge (two coincident edges) from its nearest vertex to the nearest outer vertex that can be seen from it. */
export function withHoles2d(outer: [number, number][], holes: [number, number][][]): [number, number][] {
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

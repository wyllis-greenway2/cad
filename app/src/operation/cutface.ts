// THE CUT FACE (`in_574`, `dec_cross_section`): where a sheet that is cutting passes through the body, the cut is a face like any other: this slices the body's triangles by the sheet's plane, chains the cut into outlines
// (an outline inside another is a hole), keeps what the other sheets leave of them, and fills them. The faces, their edges and their corners are named by where they are, as every part of the body is
// (`compiler/body.ts`), so a constraint to a cut edge is found again when the sheet is put back where it was. Pure: numbers in, numbers out.
import type { Vec3 } from "../math/vec.ts";
import { add, sub, scale, dot, cross, normalize } from "../math/vec.ts";
import type { Scene } from "./scene.ts";
import { triangulate, withHoles2d, joinTouching } from "./polygon.ts";

/** A sheet that cuts: a point on its plane and the normal that points to the half that is cut away. */
export interface Sheet { at: Vec3; n: Vec3 }
/** One face of the cut: the plane (outward normal and offset), its outlines in 3D (the first is the outside, the rest are holes) and its triangles (flat x, y, z). */
export interface CutFace { n: Vec3; d: number; loops: Vec3[][]; /** the edges of the outlines: straight sides and arcs (a circle is two half arcs that know each other) */ edges: CutEdge[]; mesh: number[] }
/** One edge of the cut: its ends, and when it is an arc the circle it lies on and a point halfway round it. A circle is two of these, `half` set on both. */
export interface CutEdge { a: Vec3; b: Vec3; arc?: { center: Vec3; normal: Vec3; radius: number; mid: Vec3 }; half?: true }

const EPS = 1e-6;
const q = (v: number): string => String(Math.round(v * 1e4) / 1e4 + 0);
const keyOf = (p: Vec3): string => `${q(p[0])},${q(p[1])},${q(p[2])}`;

/** Every sheet that is cutting the view, from the scene: its middle and the normal that points to what is cut away. */
export function cuttingSheets(scene: Scene): Sheet[] {
  return Object.values(scene.parts).flatMap((p) => {
    if (p.kind !== "plane" || !p.section || !p.cut || p.extent === undefined) return [];
    const n = normalize(cross(p.u, p.v));
    return [{ at: add(p.at, scale(add(p.u, p.v), p.extent / 2)) as Vec3, n: (p.flip ? scale(n, -1) : n) as Vec3 }];
  });
}

/** The plane's two axes, chosen as the body's flat faces choose theirs (`compiler/body.ts`). */
export const axesOf = (n: Vec3): [Vec3, Vec3] => {
  const u: Vec3 = Math.abs(n[2]) > 0.9 ? normalize([1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2]]) : normalize(cross([0, 0, 1], n));
  return [u, cross(n, u)];
};
const areaOf = (p: [number, number][]): number => p.reduce((s, a, i) => s + (p[(i + 1) % p.length]![0] * a[1] - a[0] * p[(i + 1) % p.length]![1]), 0) / 2;
const inside = (pt: [number, number], poly: [number, number][]): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i]!, poly[j]!];
    if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};
/** The points of a closed outline without the ones that stand on the line between their neighbours. */
const straighten = (p: [number, number][]): [number, number][] => {
  let out = p;
  for (let again = true; again && out.length > 3;) {
    again = false;
    const keep = out.filter((b, i) => {
      const [a, c] = [out[(i + out.length - 1) % out.length]!, out[(i + 1) % out.length]!];
      const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      return Math.abs(cr) > 1e-9 * Math.max(1, Math.hypot(c[0] - a[0], c[1] - a[1]));
    });
    if (keep.length < out.length && keep.length >= 3) { out = keep; again = true; }
  }
  return out;
};
/** What a closed outline keeps of the half plane `dot(m, p) + c <= 0` in the plane's own coordinates (Sutherland and Hodgman). */
const keepHalf = (poly: [number, number][], f: (p: [number, number]) => number): [number, number][] => {
  const out: [number, number][] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const [fa, fb] = [f(a), f(b)];
    if (fa <= EPS) out.push(a);
    if ((fa < -EPS && fb > EPS) || (fa > EPS && fb < -EPS)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  });
  return out;
};

/** The circle through three points in the plane, or null when they are in a line. */
function circleThrough(a: [number, number], b: [number, number], c: [number, number]): { x: number; y: number; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const [a2, b2, c2] = [a[0] * a[0] + a[1] * a[1], b[0] * b[0] + b[1] * b[1], c[0] * c[0] + c[1] * c[1]];
  const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { x, y, r: Math.hypot(a[0] - x, a[1] - y) };
}
/** How near to a circle the points of a run must lie: the tessellation of a curved face leaves the cut a little inside the true curve, so a few hundredths of the radius (and never less than a hundredth of a millimetre). */
const fitTol = (r: number): number => Math.max(0.01, 0.025 * r);
const fitsCircle = (pts: [number, number][], c: { x: number; y: number; r: number }): boolean => c.r < 1e5 && pts.every((p) => Math.abs(Math.hypot(p[0] - c.x, p[1] - c.y) - c.r) <= fitTol(c.r));

/**
 * The edges of a closed outline (its points in the plane's coordinates): runs of points that lie on one circle become arcs (a cylinder, a cone or a sphere cut by a plane across its axis), the rest are straight sides;
 * an outline that is all one circle is two half arcs. The outline is walked from its sharpest corner so that no arc is begun in the middle.
 */
function edgesOf(poly: [number, number][]): { pts: [number, number][]; arc?: { x: number; y: number; r: number }; half?: true }[] {
  const n = poly.length;
  // all one circle?
  if (n >= 8) {
    const c = circleThrough(poly[0]!, poly[Math.floor(n / 3)]!, poly[Math.floor((2 * n) / 3)]!);
    if (c && fitsCircle(poly, c)) { const m = n >> 1; return [{ pts: poly.slice(0, m + 1), arc: c, half: true }, { pts: [...poly.slice(m), poly[0]!], arc: c, half: true }]; }
  }
  // from the sharpest corner
  const turn = (i: number): number => { const [a, b, c] = [poly[(i + n - 1) % n]!, poly[i]!, poly[(i + 1) % n]!]; return Math.abs(Math.atan2((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]), (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]))); };
  let start = 0;
  for (let i = 1; i < n; i++) if (turn(i) > turn(start)) start = i;
  const at = (i: number): [number, number] => poly[(start + i) % n]!;
  const out: { pts: [number, number][]; arc?: { x: number; y: number; r: number } }[] = [];
  let i = 0;
  while (i < n) {
    let best: { to: number; c: { x: number; y: number; r: number } } | null = null;
    for (let j = i + 4; j <= n; j++) { // (at least five points: a rectangle's four corners are on a circle too)
      const run = Array.from({ length: j - i + 1 }, (_, k) => at(i + k));
      const c = circleThrough(run[0]!, run[run.length >> 1]!, run[run.length - 1]!);
      if (!c || !fitsCircle(run, c)) break;
      if (run.some((p, k) => k > 0 && Math.hypot(p[0] - run[k - 1]![0], p[1] - run[k - 1]![1]) > 0.7 * c.r)) break; // (a curve is many short sides: a regular pentagon is not a circle)
      best = { to: j, c };
    }
    if (best) { out.push({ pts: Array.from({ length: best.to - i + 1 }, (_, k) => at(i + k)), arc: best.c }); i = best.to; }
    else { out.push({ pts: [at(i), at(i + 1)] }); i++; }
  }
  return out;
}

/** The faces the sheet cuts out of the body whose triangles these are (`vertices`: flat x, y, z; `triangles`: the index of each corner), less what the `others` cut away. */
export function sectionFaces(mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> }, sheet: Sheet, others: Sheet[] = []): CutFace[] {
  const n = normalize(sheet.n);
  const d = dot(n, sheet.at);
  const [u, v] = axesOf(n);
  const V = (i: number): Vec3 => [mesh.vertices[i * 3]!, mesh.vertices[i * 3 + 1]!, mesh.vertices[i * 3 + 2]!];
  // 1. the segments where the triangles cross the plane (a triangle that only touches it, or lies in it, gives none)
  const segs: [Vec3, Vec3][] = [];
  for (let t = 0; t + 2 < mesh.triangles.length; t += 3) {
    const ix = [mesh.triangles[t]!, mesh.triangles[t + 1]!, mesh.triangles[t + 2]!];
    const ps = ix.map(V);
    const ds = ps.map((p) => dot(n, p) - d);
    const sg = ds.map((x) => (x < -EPS ? -1 : x > EPS ? 1 : 0));
    if (!sg.includes(-1) || !sg.includes(1)) continue;
    const pts: Vec3[] = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if (sg[i] === 0) pts.push(ps[i]!);
      else if (sg[i]! * sg[j]! < 0) { const k = ds[i]! / (ds[i]! - ds[j]!); pts.push(add(ps[i]!, scale(sub(ps[j]!, ps[i]!), k)) as Vec3); }
    }
    const uniq = pts.filter((p, i) => pts.findIndex((o) => keyOf(o) === keyOf(p)) === i);
    if (uniq.length === 2) segs.push([uniq[0]!, uniq[1]!]);
  }
  if (!segs.length) return [];
  // 2. the segments chained into closed outlines
  const at = new Map<string, number[]>();
  segs.forEach(([a, b], i) => { for (const p of [a, b]) at.set(keyOf(p), [...(at.get(keyOf(p)) ?? []), i]); });
  const used = new Set<number>();
  const loops: Vec3[][] = [];
  for (let s = 0; s < segs.length; s++) {
    if (used.has(s)) continue;
    const loop: Vec3[] = [segs[s]![0]];
    let cur = s;
    let head = segs[s]![1];
    used.add(s);
    let closed = false;
    for (let guard = 0; guard < segs.length + 2; guard++) {
      if (keyOf(head) === keyOf(loop[0]!)) { closed = true; break; }
      loop.push(head);
      const next = (at.get(keyOf(head)) ?? []).find((i) => !used.has(i));
      if (next === undefined) break;
      used.add(next);
      head = keyOf(segs[next]![0]) === keyOf(head) ? segs[next]![1] : segs[next]![0];
      cur = next;
    }
    void cur;
    if (closed && loop.length >= 3) loops.push(loop);
  }
  // 3. the outlines in the plane's own coordinates, straightened; an outline inside another is a hole of it
  const flat = (p: Vec3): [number, number] => [dot(p, u), dot(p, v)];
  const polys = loops.map((l) => straighten(l.map(flat))).filter((p) => p.length >= 3 && Math.abs(areaOf(p)) > 1e-9);
  const depth = polys.map((p, i) => polys.filter((o, j) => j !== i && Math.abs(areaOf(o)) > Math.abs(areaOf(p)) && inside(p[0]!, o)).length);
  const faces: CutFace[] = [];
  polys.forEach((outer, i) => {
    if (depth[i]! % 2 === 1) return;
    const holes = polys.filter((h, j) => depth[j] === depth[i]! + 1 && inside(h[0]!, outer));
    // 4. what the other sheets cut away is not part of the face
    const shape = (poly: [number, number][]): [number, number][] => others.reduce((cur, o) => {
      if (cur.length < 3) return cur;
      const m = normalize(o.n);
      const cm = dot(m, o.at);
      return keepHalf(cur, (p) => dot(m, add(add(scale(n, d), scale(u, p[0])), scale(v, p[1]))) - cm);
    }, poly);
    const out = shape(outer);
    if (out.length < 3 || Math.abs(areaOf(out)) < 1e-9) return;
    const hs = holes.map(shape).filter((h) => h.length >= 3 && Math.abs(areaOf(h)) > 1e-9);
    const lift = (p: [number, number]): Vec3 => add(add(scale(n, d), scale(u, p[0])), scale(v, p[1])) as Vec3;
    const ring = hs.length ? withHoles2d(out, joinTouching(hs)) : out;
    const tris = triangulate(ring).flatMap((k) => [...lift(ring[k]!)]);
    if (!tris.length) return;
    const edges: CutEdge[] = [out, ...hs].flatMap((l) => edgesOf(l).map((e): CutEdge => {
      const [a, b] = [lift(e.pts[0]!), lift(e.pts[e.pts.length - 1]!)];
      if (!e.arc) return { a, b };
      const m = e.pts[e.pts.length >> 1]!;
      const k = e.arc.r / (Math.hypot(m[0] - e.arc.x, m[1] - e.arc.y) || 1);
      return { a, b, arc: { center: lift([e.arc.x, e.arc.y]), normal: n, radius: e.arc.r, mid: lift([e.arc.x + (m[0] - e.arc.x) * k, e.arc.y + (m[1] - e.arc.y) * k]) }, ...(e.half ? { half: true as const } : {}) };
    }));
    faces.push({ n, d, loops: [out, ...hs].map((l) => l.map(lift)), edges, mesh: tris });
  });
  return faces;
}

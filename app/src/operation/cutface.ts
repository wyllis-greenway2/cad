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
export interface CutFace { n: Vec3; d: number; loops: Vec3[][]; mesh: number[] }

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
    faces.push({ n, d, loops: [out, ...hs].map((l) => l.map(lift)), mesh: tris });
  });
  return faces;
}

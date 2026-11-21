// What is under the pointer, for the stand-in boxes: a corner, a cut plane's border, a line (edge) or a face, in that order. Only what is seen
// counts: a part that a cut plane has cut away, or that a nearer face hides, is not there. A cut plane's surface is never picked, only its border.
import { dot, sub, add, scale, type V3 } from "./vec.ts";
import { project, rayFrom, type Cam } from "./camera.ts";
import type { Scene, Thing } from "./scene.ts";
import { isCutAway, type Region } from "./planes.ts";
import { settings } from "./settings.ts";

export interface Item { kind: "vertex" | "edge" | "face" | "body" | "cut"; thing?: string; index?: number; id?: string }
export type Hit = Item & { point: V3 };
export const keyOf = (i: Item): string => `${i.kind}:${i.thing ?? i.id}:${i.index ?? ""}`;

/** The eight corners of a box: bit 0 is x, bit 1 y, bit 2 z (1 = the high end). */
export const cornersOf = (t: Thing): V3[] => Array.from({ length: 8 }, (_, i) => [i & 1 ? t.hi[0] : t.lo[0], i & 2 ? t.hi[1] : t.lo[1], i & 4 ? t.hi[2] : t.lo[2]] as V3);
/** The twelve edges: pairs of corners that differ in one bit. */
export const EDGES: Array<[number, number]> = (() => { const e: Array<[number, number]> = []; for (let a = 0; a < 8; a++) for (let b = 0; b < 3; b++) if (!(a & (1 << b))) e.push([a, a | (1 << b)]); return e; })();
/** Face `index` (2 * axis + (1 for the high side)): its four corners in a loop. */
export function faceOf(t: Thing, index: number): V3[] {
  const k = index >> 1, i = (k + 1) % 3, j = (k + 2) % 3, c = index & 1 ? t.hi[k]! : t.lo[k]!;
  return [[t.lo[i]!, t.lo[j]!], [t.hi[i]!, t.lo[j]!], [t.hi[i]!, t.hi[j]!], [t.lo[i]!, t.hi[j]!]].map(([a, b]) => { const p: V3 = [0, 0, 0]; p[k] = c; p[i] = a!; p[j] = b!; return p; });
}
export const faceNormal = (index: number): V3 => { const n: V3 = [0, 0, 0]; n[index >> 1] = index & 1 ? 1 : -1; return n; };

/** The nearest face of any thing that a ray meets, going through the parts a cut has taken away. */
export function firstFace(m: Scene, rs: Region[], o: V3, d: V3): { t: number; thing: Thing; index: number } | null {
  let best: { t: number; thing: Thing; index: number } | null = null;
  for (const thing of m.things) for (let index = 0; index < 6; index++) {
    const k = index >> 1;
    if (Math.abs(d[k]!) < 1e-12) continue;
    const t = ((index & 1 ? thing.hi[k]! : thing.lo[k]!) - o[k]!) / d[k]!;
    if (t <= 1e-9 || (best && t >= best.t)) continue;
    const p = add(o, scale(d, t));
    if (![0, 1, 2].every((i) => i === k || (p[i]! >= thing.lo[i]! - 1e-9 && p[i]! <= thing.hi[i]! + 1e-9))) continue;
    if (isCutAway(rs, p)) continue;
    best = { t, thing, index };
  }
  return best;
}

const distToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; u: number } => {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  const u = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return { d: Math.hypot(px - (ax + vx * u), py - (ay + vy * u)), u };
};

/** What is under (px, py): `borders` are the cut planes' borders (id and loop). */
export function pick(m: Scene, rs: Region[], borders: Array<{ id: string; poly: V3[] }>, c: Cam, w: number, h: number, px: number, py: number): Hit | null {
  const aspect = w / h, S = settings.planes;
  const ray = rayFrom(c, (px / w) * 2 - 1, -((py / h) * 2 - 1), aspect);
  const seen = (q: V3): boolean => { // is the point in the picture: not cut away and not behind a face?
    if (isCutAway(rs, q, 1e-4)) return false;
    const at = project(c, q, w, h), r = rayFrom(c, (at.x / w) * 2 - 1, -((at.y / h) * 2 - 1), aspect), tq = dot(sub(q, r.o), r.d), f = firstFace(m, rs, r.o, r.d);
    return !f || f.t >= tq - 0.01 - 1e-4 * Math.abs(tq);
  };
  const ok = (depth: number) => c.ortho !== null || depth > 1e-6;
  // a corner
  let bestV: { d: number; hit: Hit } | null = null;
  for (const thing of m.things) cornersOf(thing).forEach((q, index) => {
    const at = project(c, q, w, h), d = Math.hypot(at.x - px, at.y - py);
    if (ok(at.depth) && d <= S.pickVertexPx && (!bestV || d < bestV.d) && seen(q)) bestV = { d, hit: { kind: "vertex", thing: thing.id, index, point: q } };
  });
  if (bestV) return (bestV as { hit: Hit }).hit;
  // a cut plane's border
  let bestB: { d: number; hit: Hit } | null = null;
  for (const b of borders) for (let i = 0; i < b.poly.length; i++) {
    const a = b.poly[i]!, z = b.poly[(i + 1) % b.poly.length]!, pa = project(c, a, w, h), pz = project(c, z, w, h);
    if (!ok(pa.depth) || !ok(pz.depth)) continue;
    const s = distToSegment(px, py, pa.x, pa.y, pz.x, pz.y);
    if (s.d <= S.pickBorderPx && (!bestB || s.d < bestB.d)) bestB = { d: s.d, hit: { kind: "cut", id: b.id, point: add(a, scale(sub(z, a), s.u)) } };
  }
  if (bestB) return (bestB as { hit: Hit }).hit;
  // a line
  let bestE: { d: number; hit: Hit } | null = null;
  for (const thing of m.things) { const cs = cornersOf(thing); EDGES.forEach(([i, j], index) => {
    const a = cs[i]!, z = cs[j]!, pa = project(c, a, w, h), pz = project(c, z, w, h);
    if (!ok(pa.depth) || !ok(pz.depth)) return;
    const s = distToSegment(px, py, pa.x, pa.y, pz.x, pz.y);
    if (s.d > S.pickEdgePx || (bestE && s.d >= bestE.d)) return;
    const q = add(a, scale(sub(z, a), s.u));
    if (seen(q)) bestE = { d: s.d, hit: { kind: "edge", thing: thing.id, index, point: q } };
  }); }
  if (bestE) return (bestE as { hit: Hit }).hit;
  // a face
  const f = firstFace(m, rs, ray.o, ray.d);
  return f ? { kind: "face", thing: f.thing.id, index: f.index, point: add(ray.o, scale(ray.d, f.t)) } : null;
}

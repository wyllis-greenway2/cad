// Wall thickness (`dec_measure_report`, `in_575`): how much material there is straight in from the surface, for printing (a wall thinner than a nozzle prints badly or not at all). From the triangles of a body: from sample points
// of every triangle a ray goes into the solid along the inward normal, and how far it goes to the next surface is the thickness there. Pure on triangle lists (nine numbers a triangle), with the tree of boxes of `collide.ts`.
import type { Vec3 } from "../math/vec.ts";
import { buildTree } from "./collide.ts";
import type { Tree } from "./collide.ts";

export interface Walls {
  /** the least thickness found, mm */
  thinnest: number;
  /** where: the sample point on the surface */
  at: Vec3;
  /** the share (0 to 1) of the surface, by area, whose samples have less than `minMm` behind them */
  thinShare: number;
  /** how many sample points were tried, and whether every triangle was (a very detailed body is sampled) */
  samples: number;
  all: boolean;
}

/** Where a ray (from `o` along the unit vector `d`) first meets the triangles of the tree beyond `eps`, or Infinity. */
function firstHit(tree: Tree, o: Vec3, d: Vec3, eps: number): number {
  let best = Infinity;
  const t = tree.tris;
  const inv: Vec3 = [1 / (d[0] || 1e-30), 1 / (d[1] || 1e-30), 1 / (d[2] || 1e-30)];
  const stack = [0];
  while (stack.length) {
    const nd = tree.nodes[stack.pop()!]!;
    // the slab test of the box
    let t0 = 0, t1 = best;
    for (let k = 0; k < 3; k++) {
      let a = (nd.lo[k]! - o[k]!) * inv[k]!, b = (nd.hi[k]! - o[k]!) * inv[k]!;
      if (a > b) { const x = a; a = b; b = x; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) break;
    }
    if (t0 > t1) continue;
    if (nd.l >= 0) { stack.push(nd.l, nd.r); continue; }
    for (let j = nd.from; j < nd.to; j++) {
      const i = 9 * tree.order[j]!;
      const [ax, ay, az] = [t[i]!, t[i + 1]!, t[i + 2]!];
      const e1x = t[i + 3]! - ax, e1y = t[i + 4]! - ay, e1z = t[i + 5]! - az, e2x = t[i + 6]! - ax, e2y = t[i + 7]! - ay, e2z = t[i + 8]! - az;
      // Moller-Trumbore
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-14) continue;
      const id = 1 / det;
      const sx = o[0] - ax, sy = o[1] - ay, sz = o[2] - az;
      const u = (sx * px + sy * py + sz * pz) * id;
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * id;
      if (v < -1e-9 || u + v > 1 + 1e-9) continue;
      const hit = (e2x * qx + e2y * qy + e2z * qz) * id;
      if (hit > eps && hit < best) best = hit;
    }
  }
  return best;
}

/** The thinnest wall of the body made of these triangles (outward facing by their winding), and the share of its surface thinner than `minMm`; null when there is nothing to measure (no triangles, or no ray finds the other side). */
export function wallThickness(tris: ArrayLike<number>, minMm: number, maxSamples = 40000): Walls | null {
  const n = Math.floor(tris.length / 9);
  if (!n) return null;
  const tree = buildTree(tris);
  // which way is out: the winding of a closed mesh gives a positive volume when the triangles face outward
  let vol = 0;
  for (let i = 0; i < n; i++) { const o = 9 * i; vol += (tris[o]! * (tris[o + 4]! * tris[o + 8]! - tris[o + 5]! * tris[o + 7]!) - tris[o + 1]! * (tris[o + 3]! * tris[o + 8]! - tris[o + 5]! * tris[o + 6]!) + tris[o + 2]! * (tris[o + 3]! * tris[o + 7]! - tris[o + 4]! * tris[o + 6]!)) / 6; }
  const out = vol >= 0 ? 1 : -1;
  const stride = Math.max(1, Math.ceil((n * 4) / maxSamples));
  let thinnest = Infinity, at: Vec3 = [0, 0, 0], samples = 0, area = 0, thin = 0;
  for (let i = 0; i < n; i += stride) {
    const o = 9 * i;
    const a: Vec3 = [tris[o]!, tris[o + 1]!, tris[o + 2]!], b: Vec3 = [tris[o + 3]!, tris[o + 4]!, tris[o + 5]!], c: Vec3 = [tris[o + 6]!, tris[o + 7]!, tris[o + 8]!];
    const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(cr[0], cr[1], cr[2]);
    if (len < 1e-12) continue;
    const dir: Vec3 = [(-out * cr[0]) / len, (-out * cr[1]) / len, (-out * cr[2]) / len]; // (into the solid)
    const w: [number, number, number][] = [[1 / 3, 1 / 3, 1 / 3], [2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3]];
    let here = Infinity;
    for (const [wa, wb, wc] of w) {
      const p: Vec3 = [a[0] * wa + b[0] * wb + c[0] * wc, a[1] * wa + b[1] * wb + c[1] * wc, a[2] * wa + b[2] * wb + c[2] * wc];
      const d = firstHit(tree, [p[0] + dir[0] * 1e-4, p[1] + dir[1] * 1e-4, p[2] + dir[2] * 1e-4], dir, 1e-6) + 1e-4;
      if (!Number.isFinite(d)) continue;
      samples++;
      if (d < here) here = d;
      if (d < thinnest) { thinnest = d; at = p; }
    }
    if (Number.isFinite(here)) { const a2 = len / 2; area += a2; if (here < minMm) thin += a2; }
  }
  return Number.isFinite(thinnest) ? { thinnest, at, thinShare: area > 0 ? thin / area : 0, samples, all: stride === 1 } : null;
}

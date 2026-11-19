// Hard bodies (`dec_hard_bodies`, `in_473`): do two bodies, as triangles, go into each other (or, with a clearance, come nearer than it)? Pure geometry on triangle lists (9 numbers a triangle),
// with a tree of boxes over the triangles of a body that stays so that a whole drag can be tested against it. A body moved by a rigid motion is found the last place it did not collide on the way.
import type { Vec3 } from "../math/vec.ts";
import type { Rigid } from "./frames.ts";
import { applyPoint } from "./frames.ts";

type M3 = [number, number, number];
/**
 * Two ways of telling that triangles cross (`in_484`). A move is stopped by the first (`MOVE`): a crossing counts when the triangles are made a hundredth of a millimetre bigger, so that a body is stopped a hair short of
 * a wall. Whether two bodies are in each other already (and the warning about it) is the second (`DEEP`): they must really go into each other, by a hundredth. So a body that a move has stopped at a wall is never one that
 * is read as inside it, however the faces of the kernel come out when they are made again (a few thousandths of a millimetre) or whichever of the two bodies is taken to be the one that moves.
 */
interface Mode { /** how far from the plane of a triangle both ends of a segment must be to cross it */ eps: number; /** how far outside the edges of a triangle a crossing may still be inside it */ edge: number }
const MOVE: Mode = { eps: 1e-4, edge: 0.02 };
const DEEPMODE: Mode = { eps: 0.015, edge: 1e-4 };
/** The moving triangles are moved by this much (a hundredth of a micron, far below `MOVE.eps`) before they are tested, so that nothing is exactly on a diagonal or an edge of the other body's triangles; touching stays touching. */
const NUDGE: Vec3 = [1.3e-5, 2.1e-5, 0.7e-5];
const nudged = (t: ArrayLike<number>): number[] => { const o: number[] = new Array(t.length); for (let i = 0; i < t.length; i++) o[i] = t[i]! + NUDGE[i % 3]!; return o; }; // mm: what lies this near a plane or a surface is on it, a touch, not a crossing

export interface Tree { /** the normal and its length for each triangle, made when first asked for (`normalsOf`) */ nrm?: Float64Array; tris: ArrayLike<number>; nodes: { lo: Vec3; hi: Vec3; l: number; r: number; from: number; to: number }[]; order: number[]; lo: Vec3; hi: Vec3 }

/** The boxes over the triangles: halved at the middle of the longest side of the box of their centres, to leaves of a few triangles. */
export function buildTree(tris: ArrayLike<number>): Tree {
  const n = Math.floor(tris.length / 9);
  const order = Array.from({ length: n }, (_, i) => i);
  const centre = (i: number, k: number): number => (tris[9 * i + k]! + tris[9 * i + 3 + k]! + tris[9 * i + 6 + k]!) / 3;
  const nodes: Tree["nodes"] = [];
  const boxOf = (from: number, to: number): [M3, M3] => {
    const lo: M3 = [Infinity, Infinity, Infinity], hi: M3 = [-Infinity, -Infinity, -Infinity];
    for (let j = from; j < to; j++) for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) { const x = tris[9 * order[j]! + 3 * v + k]!; if (x < lo[k]!) lo[k] = x; if (x > hi[k]!) hi[k] = x; }
    return [lo, hi];
  };
  const make = (from: number, to: number): number => {
    const [lo, hi] = boxOf(from, to);
    const id = nodes.length;
    nodes.push({ lo, hi, l: -1, r: -1, from, to });
    if (to - from <= 4) return id;
    const k = [0, 1, 2].reduce((m, i) => (hi[i]! - lo[i]! > hi[m]! - lo[m]! ? i : m), 0);
    const part = order.slice(from, to).sort((a, b) => centre(a, k) - centre(b, k));
    for (let j = 0; j < part.length; j++) order[from + j] = part[j]!;
    const mid = (from + to) >> 1;
    nodes[id]!.l = make(from, mid);
    nodes[id]!.r = make(mid, to);
    return id;
  };
  if (!n) return { tris, nodes: [], order, lo: [0, 0, 0], hi: [0, 0, 0] };
  make(0, n);
  return { tris, nodes, order, lo: nodes[0]!.lo, hi: nodes[0]!.hi };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const tri = (t: ArrayLike<number>, i: number): [Vec3, Vec3, Vec3] => [[t[9 * i]!, t[9 * i + 1]!, t[9 * i + 2]!], [t[9 * i + 3]!, t[9 * i + 4]!, t[9 * i + 5]!], [t[9 * i + 6]!, t[9 * i + 7]!, t[9 * i + 8]!]];

/** Does the segment p-q cross the triangle (really cross it: both ends clear of its plane, on opposite sides)? (scalars only: this is run for millions of pairs) */
function crosses(p: Vec3, q: Vec3, t: [Vec3, Vec3, Vec3], mode: Mode = MOVE): boolean {
  const eps = mode.eps;
  const [t0, t1, t2] = t;
  const ux = t1[0] - t0[0], uy = t1[1] - t0[1], uz = t1[2] - t0[2], vx = t2[0] - t0[0], vy = t2[1] - t0[1], vz = t2[2] - t0[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (nl < 1e-12) return false;
  const dp = (nx * (p[0] - t0[0]) + ny * (p[1] - t0[1]) + nz * (p[2] - t0[2])) / nl;
  const dq = (nx * (q[0] - t0[0]) + ny * (q[1] - t0[1]) + nz * (q[2] - t0[2])) / nl;
  if (!((dp > eps && dq < -eps) || (dp < -eps && dq > eps))) return false;
  const k = dp / (dp - dq);
  const xx = p[0] + (q[0] - p[0]) * k, xy = p[1] + (q[1] - p[1]) * k, xz = p[2] + (q[2] - p[2]) * k;
  // (inside the triangle, or within `mode.edge` of its edge: a crossing right on an edge counts for both triangles, or the answer would depend on which of two bodies is the one that moves, `in_484`)
  const slack = -mode.edge * nl;
  const sideOf = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): number => {
    const ex = bx - ax, ey = by - ay, ez = bz - az, wx = xx - ax, wy = xy - ay, wz = xz - az;
    const e = nx * (ey * wz - ez * wy) + ny * (ez * wx - ex * wz) + nz * (ex * wy - ey * wx);
    return e - slack * Math.sqrt(ex * ex + ey * ey + ez * ez);
  };
  return sideOf(t0[0], t0[1], t0[2], t1[0], t1[1], t1[2]) > 0 && sideOf(t1[0], t1[1], t1[2], t2[0], t2[1], t2[2]) > 0 && sideOf(t2[0], t2[1], t2[2], t0[0], t0[1], t0[2]) > 0;
}
/**
 * Is every corner of `a` on one side of the plane of `b`, at least `gap` from it? Then `a` is that far from `b` and neither crosses it (`in_484`): most pairs of triangles that are tried are far apart in this way,
 * and this is a few multiplications where the full test is many.
 */
function apart(a: [Vec3, Vec3, Vec3], b: [Vec3, Vec3, Vec3], gap: number, mode: Mode = MOVE): boolean {
  const eps = mode.eps;
  const [b0, b1, b2] = b;
  const ux = b1[0] - b0[0], uy = b1[1] - b0[1], uz = b1[2] - b0[2], vx = b2[0] - b0[0], vy = b2[1] - b0[1], vz = b2[2] - b0[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (nl < 1e-12) return false;
  const lim = (eps + gap) * nl;
  let pos = 0, neg = 0;
  for (const p of a) { const d = nx * (p[0] - b0[0]) + ny * (p[1] - b0[1]) + nz * (p[2] - b0[2]); if (d > lim) pos++; else if (d < -lim) neg++; }
  return pos === 3 || neg === 3;
}
const triCross = (a: [Vec3, Vec3, Vec3], b: [Vec3, Vec3, Vec3], mode: Mode = MOVE): boolean =>
  !apart(a, b, 0, mode) && !apart(b, a, 0, mode) && (crosses(a[0], a[1], b, mode) || crosses(a[1], a[2], b, mode) || crosses(a[2], a[0], b, mode) || crosses(b[0], b[1], a, mode) || crosses(b[1], b[2], a, mode) || crosses(b[2], b[0], a, mode));

function pointSeg(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return Math.hypot(...sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]));
}
function pointTri(p: Vec3, t: [Vec3, Vec3, Vec3]): number {
  const n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
  const nl = Math.hypot(...n);
  const edges = Math.min(pointSeg(p, t[0], t[1]), pointSeg(p, t[1], t[2]), pointSeg(p, t[2], t[0]));
  if (nl < 1e-12) return edges;
  const d = dot(n, sub(p, t[0])) / nl;
  const x: Vec3 = [p[0] - (n[0] / nl) * d, p[1] - (n[1] / nl) * d, p[2] - (n[2] / nl) * d];
  const inside = dot(n, cross(sub(t[1], t[0]), sub(x, t[0]))) >= 0 && dot(n, cross(sub(t[2], t[1]), sub(x, t[1]))) >= 0 && dot(n, cross(sub(t[0], t[2]), sub(x, t[2]))) >= 0;
  return inside ? Math.abs(d) : edges;
}
function segSeg(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const [d1, d2, r] = [sub(q1, p1), sub(q2, p2), sub(p1, p2)];
  const [a, e, f] = [dot(d1, d1), dot(d2, d2), dot(d2, r)];
  let s: number, t: number;
  if (a < 1e-18 && e < 1e-18) return Math.hypot(...r);
  if (a < 1e-18) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = dot(d1, r);
    if (e < 1e-18) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
    else {
      const b = dot(d1, d2);
      const den = a * e - b * b;
      s = den > 1e-18 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  const [x, y]: [Vec3, Vec3] = [[p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s], [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t]];
  return Math.hypot(...sub(x, y));
}
/** The least distance between two triangles that do not cross. */
function triDist(a: [Vec3, Vec3, Vec3], b: [Vec3, Vec3, Vec3], within = Infinity): number {
  if (within < Infinity && (apart(a, b, within) || apart(b, a, within))) return within; // (all of one is further than that from the plane of the other: no nearer than `within`)
  let m = Infinity;
  for (const p of a) m = Math.min(m, pointTri(p, b));
  for (const p of b) m = Math.min(m, pointTri(p, a));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m = Math.min(m, segSeg(a[i]!, a[(i + 1) % 3]!, b[j]!, b[(j + 1) % 3]!));
  return m;
}

/** A few points just inside the closed surface of these triangles (or on the piece itself when it is `open`): the middle of some of the triangles, taken a hair in against the way each faces. */
function probes(tris: ArrayLike<number>, open: boolean): Vec3[] {
  const n = Math.floor(tris.length / 9);
  const out: Vec3[] = [];
  for (const i of new Set([0, n >> 1, n - 1])) {
    if (i < 0 || i >= n) continue;
    const [a, b, c] = tri(tris, i);
    const m: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const nv = cross(sub(b, a), sub(c, a));
    const l = Math.hypot(...nv);
    out.push(open || l < 1e-12 ? m : [m[0] - (nv[0] / l) * 1e-3, m[1] - (nv[1] / l) * 1e-3, m[2] - (nv[2] / l) * 1e-3]);
  }
  return out;
}

/** Is the point inside the closed surface of these triangles? (a ray that no edge is on, the crossings counted) */
function inside(p: Vec3, tris: ArrayLike<number>): boolean {
  const d: Vec3 = [1, 0.0017320508, 0.0005773503];
  let n = 0;
  for (let i = 0; i < Math.floor(tris.length / 9); i++) {
    const [a, b, c] = tri(tris, i);
    const [e1, e2] = [sub(b, a), sub(c, a)];
    const h = cross(d, e2);
    const det = dot(e1, h);
    if (Math.abs(det) < 1e-14) continue;
    const s = sub(p, a);
    const u = dot(s, h) / det;
    if (u < 0 || u > 1) continue;
    const qv = cross(s, e1);
    const v = dot(d, qv) / det;
    if (v < 0 || u + v > 1) continue;
    if (dot(e2, qv) / det > 0) n++;
  }
  return n % 2 === 1;
}

/**
 * Do the moving triangles (already in their place) collide with the body that stays: do they cross its surface, or (with `clearance`) come nearer to it than that, or is one inside the other? `open`: the moving
 * triangles are a piece of surface and not a closed body (a face being pulled out): only a point of the piece itself is tested for being inside.
 */
export function collides(moving: ArrayLike<number>, fixed: Tree, clearance = 0, open = false, deep = false): boolean {
  const mode = deep ? DEEPMODE : MOVE;
  const nm = Math.floor(moving.length / 9);
  if (!nm || !fixed.nodes.length) return false;
  const c = Math.max(0, clearance);
  // the box of what moves, against the box of what stays
  const lo: M3 = [Infinity, Infinity, Infinity], hi: M3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nm * 3; i++) for (let k = 0; k < 3; k++) { const x = moving[3 * i + k]!; if (x < lo[k]!) lo[k] = x; if (x > hi[k]!) hi[k] = x; }
  for (let k = 0; k < 3; k++) if (hi[k]! < fixed.lo[k]! - c || lo[k]! > fixed.hi[k]! + c) return false;
  const mv = nudged(moving);
  for (let i = 0; i < nm; i++) {
    const a = tri(mv, i);
    const alo: Vec3 = [Math.min(a[0][0], a[1][0], a[2][0]) - c, Math.min(a[0][1], a[1][1], a[2][1]) - c, Math.min(a[0][2], a[1][2], a[2][2]) - c];
    const ahi: Vec3 = [Math.max(a[0][0], a[1][0], a[2][0]) + c, Math.max(a[0][1], a[1][1], a[2][1]) + c, Math.max(a[0][2], a[1][2], a[2][2]) + c];
    const stack = [0];
    while (stack.length) {
      const nd = fixed.nodes[stack.pop()!]!;
      if (ahi[0] < nd.lo[0] || alo[0] > nd.hi[0] || ahi[1] < nd.lo[1] || alo[1] > nd.hi[1] || ahi[2] < nd.lo[2] || alo[2] > nd.hi[2]) continue;
      if (nd.l < 0) {
        for (let j = nd.from; j < nd.to; j++) {
          const b = tri(fixed.tris, fixed.order[j]!);
          if (triCross(a, b, mode)) return true;
          if (c > 0 && triDist(a, b, c) < c) return true;
        }
      } else stack.push(nd.l, nd.r);
    }
  }
  // no surface crosses: one may be wholly inside the other (a point just inside the surface of one, not a corner of it, which may lie on the other's surface when they line up)
  for (const q of probes(moving, open)) if (inside(q, fixed.tris)) return true;
  if (!open) for (const q of probes(fixed.tris, false)) if (inside(q, moving)) return true;
  return false;
}

/** The normals of the triangles of a tree (x, y, z and the length, four numbers each), made once. */
function normalsOf(tree: Tree): Float64Array {
  if (tree.nrm) return tree.nrm;
  const n = Math.floor(tree.tris.length / 9);
  const out = new Float64Array(4 * n);
  for (let i = 0; i < n; i++) {
    const o = 9 * i, s = tree.tris;
    const ux = s[o + 3]! - s[o]!, uy = s[o + 4]! - s[o + 1]!, uz = s[o + 5]! - s[o + 2]!, vx = s[o + 6]! - s[o]!, vy = s[o + 7]! - s[o + 1]!, vz = s[o + 8]! - s[o + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    out[4 * i] = nx; out[4 * i + 1] = ny; out[4 * i + 2] = nz; out[4 * i + 3] = Math.sqrt(nx * nx + ny * ny + nz * nz);
  }
  return (tree.nrm = out);
}

/**
 * `collides(moved(mover.tris, r), fixed, clearance, open)` without moving every triangle (`in_479`): the tree of the moving body is walked together with the tree of the body that stays, each box of the moving
 * body taken to where the motion puts it, and only the triangles of the leaves that meet are moved and tested. `surfaceOnly`: a body wholly inside the other, with no surface crossing, is not looked for. For a heavy body that has a few contacts this is a few triangles, not all of them, at every
 * step of a drag.
 */
export function collidesMoving(mover: Tree, r: Rigid, fixed: Tree, clearance = 0, open = false, deep = false, surfaceOnly = false): boolean {
  const mode = deep ? DEEPMODE : MOVE;
  if (!mover.nodes.length || !fixed.nodes.length) return false;
  const c = Math.max(0, clearance);
  const pad = c + 1e-4; // (the boxes are padded a little: the triangles are nudged, and a box of a turned body is not exact)
  const R = r.turn, K = r.k, S = r.shift, N0 = NUDGE[0], N1 = NUDGE[1], N2 = NUDGE[2];
  // (no arrays are made for a point: the motion is done with numbers, this runs for every step of a drag)
  const boxes: (Float64Array | undefined)[] = new Array(mover.nodes.length);
  const boxOf = (i: number): Float64Array => {
    const kept = boxes[i];
    if (kept) return kept;
    const nd = mover.nodes[i]!;
    const bx = new Float64Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
    for (let m = 0; m < 8; m++) {
      const x = m & 1 ? nd.hi[0] : nd.lo[0], y = m & 2 ? nd.hi[1] : nd.lo[1], z = m & 4 ? nd.hi[2] : nd.lo[2];
      const qx = K * (R[0] * x + R[1] * y + R[2] * z) + S[0] + N0, qy = K * (R[3] * x + R[4] * y + R[5] * z) + S[1] + N1, qz = K * (R[6] * x + R[7] * y + R[8] * z) + S[2] + N2;
      if (qx < bx[0]!) bx[0] = qx; if (qy < bx[1]!) bx[1] = qy; if (qz < bx[2]!) bx[2] = qz;
      if (qx > bx[3]!) bx[3] = qx; if (qy > bx[4]!) bx[4] = qy; if (qz > bx[5]!) bx[5] = qz;
    }
    return (boxes[i] = bx);
  };
  interface Placed { p: Float64Array; n: [number, number, number]; nl: number; t?: [Vec3, Vec3, Vec3] }
  const placed: (Placed | undefined)[] = new Array(Math.floor(mover.tris.length / 9));
  const triOf = (i: number): Placed => {
    let a = placed[i];
    if (!a) {
      const s = mover.tris, o = 9 * i, w = new Float64Array(9);
      for (let v = 0; v < 3; v++) {
        const x = s[o + 3 * v]!, y = s[o + 3 * v + 1]!, z = s[o + 3 * v + 2]!;
        w[3 * v] = K * (R[0] * x + R[1] * y + R[2] * z) + S[0] + N0; w[3 * v + 1] = K * (R[3] * x + R[4] * y + R[5] * z) + S[1] + N1; w[3 * v + 2] = K * (R[6] * x + R[7] * y + R[8] * z) + S[2] + N2;
      }
      const ux = w[3]! - w[0]!, uy = w[4]! - w[1]!, uz = w[5]! - w[2]!, vx = w[6]! - w[0]!, vy = w[7]! - w[1]!, vz = w[8]! - w[2]!;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      a = { p: w, n: [nx, ny, nz], nl: Math.sqrt(nx * nx + ny * ny + nz * nz) };
      placed[i] = a;
    }
    return a;
  };
  const tuple = (a: Placed): [Vec3, Vec3, Vec3] => (a.t ??= [[a.p[0]!, a.p[1]!, a.p[2]!], [a.p[3]!, a.p[4]!, a.p[5]!], [a.p[6]!, a.p[7]!, a.p[8]!]]);
  const fn4 = normalsOf(fixed), fts = fixed.tris, lim0 = mode.eps + c;
  const stack: [number, number][] = [[0, 0]];
  while (stack.length) {
    const [mi, fi] = stack.pop()!;
    const mn = mover.nodes[mi]!, fn = fixed.nodes[fi]!;
    const b = boxOf(mi);
    if (b[3]! + pad < fn.lo[0] || b[0]! - pad > fn.hi[0] || b[4]! + pad < fn.lo[1] || b[1]! - pad > fn.hi[1] || b[5]! + pad < fn.lo[2] || b[2]! - pad > fn.hi[2]) continue;
    if (mn.l < 0 && fn.l < 0) {
      for (let i = mn.from; i < mn.to; i++) {
        const A = triOf(mover.order[i]!);
        const ap = A.p;
        for (let j = fn.from; j < fn.to; j++) {
          const fidx = fixed.order[j]!, o = 9 * fidx;
          // (most pairs are far apart: all of one on one side of the plane of the other, by more than they can cross or come near, is said with a few multiplications)
          const nlf = fn4[4 * fidx + 3]!;
          if (nlf > 1e-12) {
            const nx = fn4[4 * fidx]!, ny = fn4[4 * fidx + 1]!, nz = fn4[4 * fidx + 2]!, lim = lim0 * nlf;
            let pos = 0, neg = 0;
            for (let v = 0; v < 3; v++) { const d = nx * (ap[3 * v]! - fts[o]!) + ny * (ap[3 * v + 1]! - fts[o + 1]!) + nz * (ap[3 * v + 2]! - fts[o + 2]!); if (d > lim) pos++; else if (d < -lim) neg++; }
            if (pos === 3 || neg === 3) continue;
          }
          if (A.nl > 1e-12) {
            const lim = lim0 * A.nl;
            let pos = 0, neg = 0;
            for (let v = 0; v < 3; v++) { const d = A.n[0] * (fts[o + 3 * v]! - ap[0]!) + A.n[1] * (fts[o + 3 * v + 1]! - ap[1]!) + A.n[2] * (fts[o + 3 * v + 2]! - ap[2]!); if (d > lim) pos++; else if (d < -lim) neg++; }
            if (pos === 3 || neg === 3) continue;
          }
          const f = tri(fixed.tris, fidx);
          const at = tuple(A);
          if (triCross(at, f, mode)) return true;
          if (c > 0 && triDist(at, f, c) < c) return true;
        }
      }
    } else if (mn.l < 0) stack.push([mi, fn.l], [mi, fn.r]);
    else if (fn.l < 0) stack.push([mn.l, fi], [mn.r, fi]);
    else {
      const vol = (lo: Vec3, hi: Vec3): number => (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
      if (vol(mn.lo, mn.hi) >= vol(fn.lo, fn.hi)) stack.push([mn.l, fi], [mn.r, fi]);
      else stack.push([mi, fn.l], [mi, fn.r]);
    }
  }
  if (surfaceOnly) return false; // (a motion in small steps cannot swallow a body without a surface crossing first: the counted rays below walk every triangle of the body that stays, and were most of the time of a test that finds nothing)
  // no surface crosses: one may be wholly inside the other (as in `collides`; a point is only tried against a body whose box it is in)
  const within = (q: Vec3, lo: Vec3, hi: Vec3): boolean => q[0] >= lo[0] && q[0] <= hi[0] && q[1] >= lo[1] && q[1] <= hi[1] && q[2] >= lo[2] && q[2] <= hi[2];
  for (const q of probes(mover.tris, open)) { const p = applyPoint(r, q); if (within(p, fixed.lo, fixed.hi) && inside(p, fixed.tris)) return true; }
  if (!open) {
    const m = r.turn, k = r.k || 1;
    for (const q of probes(fixed.tris, false)) { // (taken back into the frame of the moving body, where its triangles are)
      const d: Vec3 = [(q[0] - r.shift[0]) / k, (q[1] - r.shift[1]) / k, (q[2] - r.shift[2]) / k];
      const p: Vec3 = [m[0] * d[0] + m[3] * d[1] + m[6] * d[2], m[1] * d[0] + m[4] * d[1] + m[7] * d[2], m[2] * d[0] + m[5] * d[1] + m[8] * d[2]];
      if (within(p, mover.lo, mover.hi) && inside(p, mover.tris)) return true;
    }
  }
  return false;
}

/**
 * The direction the surface of the body that stays faces where the moving triangles meet it (`in_474`): the unit normals of the triangles of the fixed body that the moving ones cross or come within the
 * clearance of, those that face against the motion `against` (the faces it is going into, not the ones it only brushes), the faces that face alike taken together (`in_485`: one normal each, so a floor and a wall it also touches are not averaged into a ramp); none when there are none.
 */
export function contactNormals(moving: ArrayLike<number>, fixed: Tree, clearance = 0, against: Vec3 = [0, 0, 0]): Vec3[] {
  const nm = Math.floor(moving.length / 9);
  const c = Math.max(0, clearance);
  const groups: { sum: M3 }[] = []; // (the faces met, grouped by the way they face: a floor and a wall are two, the facets of one round wall are one)
  const mv = nudged(moving);
  for (let i = 0; i < nm; i++) {
    const a = tri(mv, i);
    const alo: Vec3 = [Math.min(a[0][0], a[1][0], a[2][0]) - c, Math.min(a[0][1], a[1][1], a[2][1]) - c, Math.min(a[0][2], a[1][2], a[2][2]) - c];
    const ahi: Vec3 = [Math.max(a[0][0], a[1][0], a[2][0]) + c, Math.max(a[0][1], a[1][1], a[2][1]) + c, Math.max(a[0][2], a[1][2], a[2][2]) + c];
    const stack = fixed.nodes.length ? [0] : [];
    while (stack.length) {
      const nd = fixed.nodes[stack.pop()!]!;
      if (ahi[0] < nd.lo[0] || alo[0] > nd.hi[0] || ahi[1] < nd.lo[1] || alo[1] > nd.hi[1] || ahi[2] < nd.lo[2] || alo[2] > nd.hi[2]) continue;
      if (nd.l < 0) {
        for (let j = nd.from; j < nd.to; j++) {
          const b = tri(fixed.tris, fixed.order[j]!);
          if (!(triCross(a, b) || (c > 0 && triDist(a, b, c) < c))) continue;
          const n = cross(sub(b[1], b[0]), sub(b[2], b[0])); // (its length is twice its area: bigger triangles count more)
          if (dot(n, against) >= -1e-9 * Math.hypot(...n) * Math.hypot(...against)) continue; // (a face that faces along the motion or across it is not what it is going into)
          const nl = Math.hypot(...n);
          if (nl < 1e-12) continue;
          const g = groups.find((q) => { const ql = Math.hypot(...q.sum); return (q.sum[0] * n[0] + q.sum[1] * n[1] + q.sum[2] * n[2]) / (ql * nl) > 0.97; });
          if (g) { g.sum[0] += n[0]; g.sum[1] += n[1]; g.sum[2] += n[2]; } else groups.push({ sum: [n[0], n[1], n[2]] });
        }
      } else stack.push(nd.l, nd.r);
    }
  }
  return groups.map((g) => { const l = Math.hypot(...g.sum); return [g.sum[0] / l, g.sum[1] / l, g.sum[2] / l] as Vec3; });
}

/** The triangles of `moving` (nine numbers each, in the frame of `fixed`) that cross the triangles of `fixed` or come within the clearance of them: where two bodies are in each other, to show it (`in_1056`: the red of a jam). At most `most` of them. */
export function crossingTris(moving: ArrayLike<number>, fixed: Tree, clearance = 0, most = 300): number[] {
  const nm = Math.floor(moving.length / 9);
  const c = Math.max(0, clearance);
  const out: number[] = [];
  const mv = nudged(moving);
  for (let i = 0; i < nm && out.length < most * 9; i++) {
    const a = tri(mv, i);
    const alo: Vec3 = [Math.min(a[0][0], a[1][0], a[2][0]) - c, Math.min(a[0][1], a[1][1], a[2][1]) - c, Math.min(a[0][2], a[1][2], a[2][2]) - c];
    const ahi: Vec3 = [Math.max(a[0][0], a[1][0], a[2][0]) + c, Math.max(a[0][1], a[1][1], a[2][1]) + c, Math.max(a[0][2], a[1][2], a[2][2]) + c];
    const stack = fixed.nodes.length ? [0] : [];
    let hit = false;
    while (stack.length && !hit) {
      const nd = fixed.nodes[stack.pop()!]!;
      if (ahi[0] < nd.lo[0] || alo[0] > nd.hi[0] || ahi[1] < nd.lo[1] || alo[1] > nd.hi[1] || ahi[2] < nd.lo[2] || alo[2] > nd.hi[2]) continue;
      if (nd.l < 0) { for (let j = nd.from; j < nd.to && !hit; j++) { const b = tri(fixed.tris, fixed.order[j]!); if (triCross(a, b) || (c > 0 && triDist(a, b, c) < c)) hit = true; } } else stack.push(nd.l, nd.r);
    }
    if (hit) for (let k = 0; k < 9; k++) out.push(moving[9 * i + k]!);
  }
  return out;
}

// ---- the way a rigid motion goes: a screw, taken part of the way ----
/** The motion from nothing (t = 0) to the whole of `r` (t = 1), as a turn about an axis with the slide along it, so a body on the way is where the motion would have it. */
export function partOf(r: Rigid, t: number): Rigid {
  const m = r.turn;
  const tr = m[0] + m[4] + m[8];
  const angle = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
  if (angle < 1e-9) return { turn: [1, 0, 0, 0, 1, 0, 0, 0, 1], shift: [r.shift[0] * t, r.shift[1] * t, r.shift[2] * t], k: 1 };
  let n: Vec3 = [m[7] - m[5], m[2] - m[6], m[3] - m[1]];
  const nl = Math.hypot(...n);
  if (nl < 1e-9) { // half a turn: the axis is where the matrix is not turned
    const k = [0, 4, 8].reduce((q, i) => (m[i]! > m[q]! ? i : q), 0);
    const col: Vec3 = k === 0 ? [m[0] + 1, m[3], m[6]] : k === 4 ? [m[1], m[4] + 1, m[7]] : [m[2], m[5], m[8] + 1];
    const cl = Math.hypot(...col);
    n = [col[0] / cl, col[1] / cl, col[2] / cl];
  } else n = [n[0] / nl, n[1] / nl, n[2] / nl];
  const slide = dot(n, r.shift);
  const flat: Vec3 = [r.shift[0] - n[0] * slide, r.shift[1] - n[1] * slide, r.shift[2] - n[2] * slide];
  const cot = 1 / Math.tan(angle / 2);
  const side = cross(n, flat);
  const c: Vec3 = [flat[0] / 2 + (side[0] * cot) / 2, flat[1] / 2 + (side[1] * cot) / 2, flat[2] / 2 + (side[2] * cot) / 2]; // (a point on the axis)
  const th = angle * t;
  const [s, co] = [Math.sin(th), Math.cos(th), ];
  const [x, y, z] = n;
  const R: Rigid["turn"] = [co + x * x * (1 - co), x * y * (1 - co) - z * s, x * z * (1 - co) + y * s, y * x * (1 - co) + z * s, co + y * y * (1 - co), y * z * (1 - co) - x * s, z * x * (1 - co) - y * s, z * y * (1 - co) + x * s, co + z * z * (1 - co)];
  const rc: Vec3 = [R[0] * c[0] + R[1] * c[1] + R[2] * c[2], R[3] * c[0] + R[4] * c[1] + R[5] * c[2], R[6] * c[0] + R[7] * c[1] + R[8] * c[2]];
  return { turn: R, shift: [c[0] - rc[0] + n[0] * slide * t, c[1] - rc[1] + n[1] * slide * t, c[2] - rc[2] + n[2] * slide * t], k: 1 };
}

/** The triangles moved by the rigid motion. */
export function moved(tris: ArrayLike<number>, r: Rigid): number[] {
  const out: number[] = new Array(tris.length);
  for (let i = 0; i + 2 < tris.length; i += 3) { const p = applyPoint(r, [tris[i]!, tris[i + 1]!, tris[i + 2]!]); out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2]; }
  return out;
}

/**
 * How much of a motion a hard body may make before it collides: 1 when all of it, else the part (0..1) it can make. `hit(t)` says whether the body, taken that part of the way, collides. Tested in steps
 * along the way (so a thin wall is not stepped over) and the last free step narrowed down.
 */
export function freePart(hit: (t: number) => boolean, steps = 24): number {
  if (!hit(1)) {
    // all of it is free at the end: still, a wall between would have been stepped over
    for (let k = 1; k < steps; k++) if (hit(k / steps)) return narrow(hit, (k - 1) / steps, k / steps);
    return 1;
  }
  for (let k = 1; k <= steps; k++) if (hit(k / steps)) return narrow(hit, (k - 1) / steps, k / steps);
  return 1;
}
function narrow(hit: (t: number) => boolean, free: number, bad: number): number {
  let [a, b] = [free, bad];
  for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (hit(m)) b = m; else a = m; }
  return a;
}

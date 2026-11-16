// Hard bodies (`dec_hard_bodies`, `in_473`): do two bodies, as triangles, go into each other (or, with a clearance, come nearer than it)? Pure geometry on triangle lists (9 numbers a triangle),
// with a tree of boxes over the triangles of a body that stays so that a whole drag can be tested against it. A body moved by a rigid motion is found the last place it did not collide on the way.
import type { Vec3 } from "../math/vec.ts";
import type { Rigid } from "./frames.ts";
import { applyPoint } from "./frames.ts";

type M3 = [number, number, number];
const EPS = 1e-4;
/** The moving triangles are moved by this much (a hundredth of a micron, far below `EPS`) before they are tested, so that nothing is exactly on a diagonal or an edge of the other body's triangles; touching stays touching. */
const NUDGE: Vec3 = [1.3e-5, 2.1e-5, 0.7e-5];
const nudged = (t: ArrayLike<number>): number[] => { const o: number[] = new Array(t.length); for (let i = 0; i < t.length; i++) o[i] = t[i]! + NUDGE[i % 3]!; return o; }; // mm: what lies this near a plane or a surface is on it, a touch, not a crossing

export interface Tree { tris: ArrayLike<number>; nodes: { lo: Vec3; hi: Vec3; l: number; r: number; from: number; to: number }[]; order: number[]; lo: Vec3; hi: Vec3 }

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

/** Does the segment p-q cross the triangle (really cross it: both ends clear of its plane, on opposite sides)? */
function crosses(p: Vec3, q: Vec3, t: [Vec3, Vec3, Vec3]): boolean {
  const n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
  const nl = Math.hypot(...n);
  if (nl < 1e-12) return false;
  const [dp, dq] = [dot(n, sub(p, t[0])) / nl, dot(n, sub(q, t[0])) / nl];
  if (!((dp > EPS && dq < -EPS) || (dp < -EPS && dq > EPS))) return false;
  const k = dp / (dp - dq);
  const x: Vec3 = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
  const [e0, e1, e2] = [dot(n, cross(sub(t[1], t[0]), sub(x, t[0]))), dot(n, cross(sub(t[2], t[1]), sub(x, t[1]))), dot(n, cross(sub(t[0], t[2]), sub(x, t[2])))];
  return e0 > 0 && e1 > 0 && e2 > 0; // (strictly inside: a crossing through an edge or a corner is a touch; the moving triangles are nudged by `NUDGE` first, so a crossing that falls exactly on the diagonal of a face is not lost)
}
const triCross = (a: [Vec3, Vec3, Vec3], b: [Vec3, Vec3, Vec3]): boolean =>
  crosses(a[0], a[1], b) || crosses(a[1], a[2], b) || crosses(a[2], a[0], b) || crosses(b[0], b[1], a) || crosses(b[1], b[2], a) || crosses(b[2], b[0], a);

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
function triDist(a: [Vec3, Vec3, Vec3], b: [Vec3, Vec3, Vec3]): number {
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
export function collides(moving: ArrayLike<number>, fixed: Tree, clearance = 0, open = false): boolean {
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
          if (triCross(a, b)) return true;
          if (c > 0 && triDist(a, b) < c) return true;
        }
      } else stack.push(nd.l, nd.r);
    }
  }
  // no surface crosses: one may be wholly inside the other (a point just inside the surface of one, not a corner of it, which may lie on the other's surface when they line up)
  for (const q of probes(moving, open)) if (inside(q, fixed.tris)) return true;
  if (!open) for (const q of probes(fixed.tris, false)) if (inside(q, moving)) return true;
  return false;
}

/**
 * `collides(moved(mover.tris, r), fixed, clearance, open)` without moving every triangle (`in_479`): the tree of the moving body is walked together with the tree of the body that stays, each box of the moving
 * body taken to where the motion puts it, and only the triangles of the leaves that meet are moved and tested. For a heavy body that has a few contacts this is a few triangles, not all of them, at every
 * step of a drag.
 */
export function collidesMoving(mover: Tree, r: Rigid, fixed: Tree, clearance = 0, open = false): boolean {
  if (!mover.nodes.length || !fixed.nodes.length) return false;
  const c = Math.max(0, clearance);
  const pad = c + 1e-4; // (the boxes are padded a little: the triangles are nudged, and a box of a turned body is not exact)
  const place = (p: Vec3): Vec3 => { const q = applyPoint(r, p); return [q[0] + NUDGE[0], q[1] + NUDGE[1], q[2] + NUDGE[2]]; };
  const boxes: ({ lo: M3; hi: M3 } | undefined)[] = new Array(mover.nodes.length);
  const boxOf = (i: number): { lo: M3; hi: M3 } => {
    const kept = boxes[i];
    if (kept) return kept;
    const nd = mover.nodes[i]!;
    const lo: M3 = [Infinity, Infinity, Infinity], hi: M3 = [-Infinity, -Infinity, -Infinity];
    for (let m = 0; m < 8; m++) {
      const q = place([m & 1 ? nd.hi[0] : nd.lo[0], m & 2 ? nd.hi[1] : nd.lo[1], m & 4 ? nd.hi[2] : nd.lo[2]]);
      for (let k = 0; k < 3; k++) { if (q[k]! < lo[k]!) lo[k] = q[k]!; if (q[k]! > hi[k]!) hi[k] = q[k]!; }
    }
    return (boxes[i] = { lo, hi });
  };
  const placed = new Map<number, [Vec3, Vec3, Vec3]>();
  const triOf = (i: number): [Vec3, Vec3, Vec3] => {
    let a = placed.get(i);
    if (!a) { const l = tri(mover.tris, i); a = [place(l[0]), place(l[1]), place(l[2])]; placed.set(i, a); }
    return a;
  };
  const stack: [number, number][] = [[0, 0]];
  while (stack.length) {
    const [mi, fi] = stack.pop()!;
    const mn = mover.nodes[mi]!, fn = fixed.nodes[fi]!;
    const b = boxOf(mi);
    if (b.hi[0] + pad < fn.lo[0] || b.lo[0] - pad > fn.hi[0] || b.hi[1] + pad < fn.lo[1] || b.lo[1] - pad > fn.hi[1] || b.hi[2] + pad < fn.lo[2] || b.lo[2] - pad > fn.hi[2]) continue;
    if (mn.l < 0 && fn.l < 0) {
      for (let i = mn.from; i < mn.to; i++) {
        const a = triOf(mover.order[i]!);
        for (let j = fn.from; j < fn.to; j++) {
          const f = tri(fixed.tris, fixed.order[j]!);
          if (triCross(a, f)) return true;
          if (c > 0 && triDist(a, f) < c) return true;
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
 * clearance of, added up, those that face against the motion `against` (the faces it is going into, not the ones it only brushes); null when there are none.
 */
export function contactNormal(moving: ArrayLike<number>, fixed: Tree, clearance = 0, against: Vec3 = [0, 0, 0]): Vec3 | null {
  const nm = Math.floor(moving.length / 9);
  const c = Math.max(0, clearance);
  const sum: M3 = [0, 0, 0];
  let any = false;
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
          if (!(triCross(a, b) || (c > 0 && triDist(a, b) < c))) continue;
          const n = cross(sub(b[1], b[0]), sub(b[2], b[0])); // (its length is twice its area: bigger triangles count more)
          if (dot(n, against) >= -1e-9 * Math.hypot(...n) * Math.hypot(...against)) continue; // (a face that faces along the motion or across it is not what it is going into)
          sum[0] += n[0]; sum[1] += n[1]; sum[2] += n[2];
          any = true;
        }
      } else stack.push(nd.l, nd.r);
    }
  }
  const l = Math.hypot(...sum);
  return any && l > 1e-12 ? [sum[0] / l, sum[1] / l, sum[2] / l] : null;
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
  for (let i = 0; i < 10; i++) { const m = (a + b) / 2; if (hit(m)) b = m; else a = m; }
  return a;
}

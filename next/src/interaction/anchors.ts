// Where an arrow stands on what is picked on a body (`dec_body_look_and_feel`, as the old app put it): a face's arrow in the middle of the face; an edge's arrow a quarter of the way along a straight edge, in the middle of a curved one. Pure: the engine's mesh in, a place out.
import type { V3 } from "../vec.ts";

/** the part of a mesh a face is: its triangles, as ranges of the index list */
export interface Tris {
  positions: Float32Array;
  indices: Uint32Array;
}
/** The middle of a face: the centre of its area (each triangle counts as big as it is); when that is not on the face (a ring, an L, the wall of a cylinder, whose middle is its axis), the place on the face nearest to it, and of those (all round a cylinder) the one nearest `near` (where it was picked). */
export function faceCentre(m: Tris, f: { start: number; count: number }, near?: V3): V3 {
  let area = 0;
  const sum: V3 = [0, 0, 0],
    tris: { a: V3; b: V3; c: V3; mid: V3 }[] = [],
    P = m.positions;
  for (let k = f.start; k + 2 < f.start + f.count; k += 3) {
    const at = (n: number): V3 => [
        P[3 * m.indices[k + n]!]!,
        P[3 * m.indices[k + n]! + 1]!,
        P[3 * m.indices[k + n]! + 2]!,
      ],
      a = at(0),
      b = at(1),
      c = at(2),
      u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
      s = Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!), // (twice the triangle's area)
      mid: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    area += s;
    for (let i = 0; i < 3; i++) sum[i]! += s * mid[i]!;
    tris.push({ a, b, c, mid });
  }
  if (!(area > 0)) return [0, 0, 0];
  const c: V3 = [sum[0] / area, sum[1] / area, sum[2] / area];
  const dist = (p: V3, q: V3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  if (tris.some((t) => dist(closestOnTriangle(c, t.a, t.b, t.c), c) < 1e-7 * (1 + Math.sqrt(area)))) return c; // (on the face: not only over it, as the middle of a cylinder's wall is)
  let best = tris[0]!.mid,
    d = Infinity,
    dn = Infinity;
  for (const t of tris) {
    const p = closestOnTriangle(c, t.a, t.b, t.c),
      e = dist(p, c),
      en = near ? dist(p, near) : 0;
    if (e < d - 1e-6 * (1 + d) || (e <= d + 1e-6 * (1 + d) && en < dn)) {
      d = Math.min(d, e);
      dn = en;
      best = p;
    }
  }
  return best;
}
/** The way a face stands out of the body at a place of it: the normals the mesh has at the corners of the triangle nearest to it, averaged (a flat face's is its plane's). */
export function normalAt(m: Tris & { normals: Float32Array }, f: { start: number; count: number }, p: V3): V3 {
  let best = 0,
    d = Infinity;
  const at = (k: number, n: number): V3 => [
    m.positions[3 * m.indices[k + n]!]!,
    m.positions[3 * m.indices[k + n]! + 1]!,
    m.positions[3 * m.indices[k + n]! + 2]!,
  ];
  for (let k = f.start; k + 2 < f.start + f.count; k += 3) {
    const q = closestOnTriangle(p, at(k, 0), at(k, 1), at(k, 2)),
      e = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (e < d) {
      d = e;
      best = k;
    }
  }
  const s: V3 = [0, 0, 0];
  for (let n = 0; n < 3; n++) for (let i = 0; i < 3; i++) s[i]! += m.normals[3 * m.indices[best + n]! + i]!;
  const l = Math.hypot(...s) || 1;
  return [s[0] / l, s[1] / l, s[2] / l];
}
/** the point of the triangle nearest to a place (Ericson, Real-Time Collision Detection, 5.1.5) */
function closestOnTriangle(p: V3, a: V3, b: V3, c: V3): V3 {
  const sub = (x: V3, y: V3): V3 => [x[0] - y[0], x[1] - y[1], x[2] - y[2]],
    dot = (x: V3, y: V3) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2],
    on = (o: V3, v: V3, t: number): V3 => [o[0] + v[0] * t, o[1] + v[1] * t, o[2] + v[2] * t],
    ab = sub(b, a),
    ac = sub(c, a),
    ap = sub(p, a),
    d1 = dot(ab, ap),
    d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b),
    d3 = dot(ab, bp),
    d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return on(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c),
    d5 = dot(ab, cp),
    d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return on(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return on(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
  const den = 1 / (va + vb + vc);
  return on(on(a, ab, vb * den), ac, vc * den);
}
/** Where the arrow of an edge stands: an edge that is a straight line, a quarter of the way along it; a curve, at the point of it half way along its length. `lines` are the polylines of the edges, x y z each; `e` the part of it that is this edge. */
export function edgeAnchor(lines: Float32Array, e: { start: number; count: number }): V3 {
  const at = (i: number): V3 => [
    lines[3 * (e.start + i)]!,
    lines[3 * (e.start + i) + 1]!,
    lines[3 * (e.start + i) + 2]!,
  ];
  if (e.count <= 2) {
    const a = at(0),
      b = at(Math.max(0, e.count - 1));
    return [a[0] + (b[0] - a[0]) / 4, a[1] + (b[1] - a[1]) / 4, a[2] + (b[2] - a[2]) / 4];
  }
  let total = 0;
  const along: number[] = [0];
  for (let i = 1; i < e.count; i++) {
    const p = at(i - 1),
      q = at(i);
    total += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    along.push(total);
  }
  let i = 1;
  while (i < e.count - 1 && along[i]! < total / 2) i++;
  const p = at(i - 1),
    q = at(i),
    t = (total / 2 - along[i - 1]!) / Math.max(1e-12, along[i]! - along[i - 1]!);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
}

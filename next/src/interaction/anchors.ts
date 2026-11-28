// Where an arrow stands on what is picked on a body (`dec_body_look_and_feel`, as the old app put it): a face's arrow in the middle of the face; an edge's arrow a quarter of the way along a straight edge, in the middle of a curved one. Pure: the engine's mesh in, a place out.
import type { V3 } from "../vec.ts";

/** the part of a mesh a face is: its triangles, as ranges of the index list */
export interface Tris {
  positions: Float32Array;
  indices: Uint32Array;
}
/** The middle of a face: the centre of its area (each triangle counts as big as it is); when that is not on the face (a ring, an L), the middle of the triangle of it that is nearest. */
export function faceCentre(m: Tris, f: { start: number; count: number }): V3 {
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
  if (tris.some((t) => inTriangle(c, t.a, t.b, t.c))) return c;
  let best = tris[0]!.mid,
    d = Infinity;
  for (const t of tris) {
    const e = Math.hypot(t.mid[0] - c[0], t.mid[1] - c[1], t.mid[2] - c[2]);
    if (e < d) {
      d = e;
      best = t.mid;
    }
  }
  return best;
}
/** whether a place (on the plane of the triangle, or very near it) is inside the triangle */
function inTriangle(p: V3, a: V3, b: V3, c: V3): boolean {
  const sub = (x: V3, y: V3): V3 => [x[0] - y[0], x[1] - y[1], x[2] - y[2]],
    dot = (x: V3, y: V3) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2],
    v0 = sub(c, a),
    v1 = sub(b, a),
    v2 = sub(p, a),
    d00 = dot(v0, v0),
    d01 = dot(v0, v1),
    d11 = dot(v1, v1),
    d20 = dot(v2, v0),
    d21 = dot(v2, v1),
    den = d00 * d11 - d01 * d01;
  if (Math.abs(den) < 1e-18) return false;
  const u = (d11 * d20 - d01 * d21) / den,
    v = (d00 * d21 - d01 * d20) / den;
  return u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9;
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

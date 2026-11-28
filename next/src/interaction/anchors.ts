// Where an arrow stands on what is picked on a body (`dec_body_look_and_feel`, as the old app put it): a face's arrow in the middle of the face; an edge's arrow a quarter of the way along a straight edge, in the middle of a curved one. Pure: the engine's mesh in, a place out.
import type { V3 } from "../vec.ts";

/** the part of a mesh a face is: its triangles, as ranges of the index list */
export interface Tris {
  positions: Float32Array;
  indices: Uint32Array;
}
/** The middle of a face: the centre of its area (each triangle counts as big as it is). */
export function faceCentre(m: Tris, f: { start: number; count: number }): V3 {
  let area = 0;
  const sum: V3 = [0, 0, 0];
  for (let k = f.start; k + 2 < f.start + f.count; k += 3) {
    const a = 3 * m.indices[k]!,
      b = 3 * m.indices[k + 1]!,
      c = 3 * m.indices[k + 2]!,
      P = m.positions;
    const ux = P[b]! - P[a]!,
      uy = P[b + 1]! - P[a + 1]!,
      uz = P[b + 2]! - P[a + 2]!,
      vx = P[c]! - P[a]!,
      vy = P[c + 1]! - P[a + 1]!,
      vz = P[c + 2]! - P[a + 2]!,
      s = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx); // (twice the triangle's area)
    area += s;
    for (let i = 0; i < 3; i++) sum[i]! += (s * (P[a + i]! + P[b + i]! + P[c + i]!)) / 3;
  }
  return area > 0 ? [sum[0] / area, sum[1] / area, sum[2] / area] : [0, 0, 0];
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

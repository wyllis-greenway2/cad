// Picking on a body (`in_1568`): what the pointer is at on the bodies the engine made: an edge when the pointer is within a few pixels of one that can be seen, else the face it is over. Pure: the meshes, the camera and the pointer in; the face or edge (by the
// ids the steps use) and the place out. A face is found by the pointer's ray through the triangles; an edge by its distance on the screen to the edge's polyline, and only if it is not behind the face the ray meets first.
import { project, type Cam } from "../camera.ts";
import { idKey } from "../engine/id.ts";
import { rayOf } from "../orb.ts";
import type { BodyMesh, EdgeInfo, FaceInfo } from "../studio.ts";
import type { V3 } from "../vec.ts";

/** The edges that bound some faces of a body (those with a name: two faces beside them): a face stands for its edges (`dec_selection_tools`, `in_257`), so a round or chamfer of a face is of every one of them. */
export function edgesAround(m: Pick<BodyMesh, "edgeInfo">, faces: readonly Pick<FaceInfo, "ref">[]): EdgeInfo[] {
  const sides = new Set(faces.map((f) => idKey(f.ref)));
  return m.edgeInfo.filter((e) => sides.has(idKey(e.ref.a)) || sides.has(idKey(e.ref.b)));
}
export type Hit =
  | { kind: "face"; body: string; face: FaceInfo; point: V3; normal: V3; depth: number }
  | { kind: "edge"; body: string; edge: EdgeInfo; point: V3; depth: number };

/** the first triangle of the mesh the ray meets: how far along it, and the face it belongs to (Möller–Trumbore) */
function rayMesh(m: BodyMesh, o: V3, d: V3): { t: number; face: FaceInfo; normal: V3 } | null {
  let best: { t: number; face: FaceInfo; normal: V3 } | null = null;
  const P = m.positions,
    I = m.indices;
  for (const f of m.faces) {
    for (let k = f.start; k < f.start + f.count; k += 3) {
      const a = 3 * I[k]!,
        b = 3 * I[k + 1]!,
        c = 3 * I[k + 2]!;
      const e1x = P[b]! - P[a]!,
        e1y = P[b + 1]! - P[a + 1]!,
        e1z = P[b + 2]! - P[a + 2]!,
        e2x = P[c]! - P[a]!,
        e2y = P[c + 1]! - P[a + 1]!,
        e2z = P[c + 2]! - P[a + 2]!;
      const px = d[1] * e2z - d[2] * e2y,
        py = d[2] * e2x - d[0] * e2z,
        pz = d[0] * e2y - d[1] * e2x,
        det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const tx = o[0] - P[a]!,
        ty = o[1] - P[a + 1]!,
        tz = o[2] - P[a + 2]!,
        u = (tx * px + ty * py + tz * pz) / det;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y,
        qy = tz * e1x - tx * e1z,
        qz = tx * e1y - ty * e1x,
        v = (d[0] * qx + d[1] * qy + d[2] * qz) / det;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) / det;
      if (t > 1e-6 && (!best || t < best.t)) {
        const nx = e1y * e2z - e1z * e2y,
          ny = e1z * e2x - e1x * e2z,
          nz = e1x * e2y - e1y * e2x,
          l = Math.hypot(nx, ny, nz) || 1;
        best = { t, face: f, normal: [nx / l, ny / l, nz / l] };
      }
    }
  }
  return best;
}
const toSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; u: number } => {
  const vx = bx - ax,
    vy = by - ay,
    l2 = vx * vx + vy * vy,
    u = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return { d: Math.hypot(px - (ax + vx * u), py - (ay + vy * u)), u };
};
/** The pointer's ray for picking: from the eye in perspective; in a straight view from far in front of the model along the view (its own ray starts on the plane through the eye, which can be inside the model: what is behind that plane is still under the pointer). */
export function pickRay(cam: Cam, w: number, h: number, x: number, y: number): { o: V3; d: V3 } {
  const r = rayOf(cam, w, h, x, y);
  return cam.ortho === null ? r : { o: [r.o[0] - r.d[0] * 1e6, r.o[1] - r.d[1] * 1e6, r.o[2] - r.d[2] * 1e6], d: r.d };
}
/** what the pointer is at: an edge within `tolPx` that is not hidden behind the face the pointer is over, else that face, else nothing */
export function pickAt(
  meshes: readonly BodyMesh[],
  cam: Cam,
  w: number,
  h: number,
  x: number,
  y: number,
  tolPx = 7,
): Hit | null {
  const r = pickRay(cam, w, h, x, y),
    o = r.o,
    d = r.d;
  let face: Hit | null = null,
    bestT = Infinity;
  for (const m of meshes) {
    const f = rayMesh(m, o, d);
    if (f && f.t < bestT) {
      bestT = f.t;
      const point: V3 = [o[0] + d[0] * f.t, o[1] + d[1] * f.t, o[2] + d[2] * f.t];
      face = {
        kind: "face",
        body: m.id,
        face: f.face,
        point,
        normal: f.normal,
        depth: project(cam, point, w, h).depth,
      };
    }
  }
  let edge: Hit | null = null,
    bd = tolPx;
  for (const m of meshes)
    for (const e of m.edgeInfo) {
      const pts = Array.from({ length: e.count }, (_, i) => {
        const k = 3 * (e.start + i);
        const q: V3 = [m.lines[k]!, m.lines[k + 1]!, m.lines[k + 2]!];
        return { q, s: project(cam, q, w, h) };
      });
      for (let i = 0; i + 1 < pts.length; i++) {
        const A = pts[i]!,
          B = pts[i + 1]!;
        if (cam.ortho === null && (A.s.depth <= 1e-6 || B.s.depth <= 1e-6)) continue;
        const g = toSeg(x, y, A.s.x, A.s.y, B.s.x, B.s.y);
        if (g.d >= bd) continue;
        const depth =
          cam.ortho !== null
            ? A.s.depth + (B.s.depth - A.s.depth) * g.u
            : 1 / (1 / A.s.depth + (1 / B.s.depth - 1 / A.s.depth) * g.u); // (on the screen, 1 / depth is what runs evenly along a line)
        if (face && depth > face.depth * 1.004 + 0.05) continue; // (behind the face the pointer is over)
        bd = g.d;
        edge = {
          kind: "edge",
          body: m.id,
          edge: e,
          point: ((): V3 => {
            const t = cam.ortho !== null ? g.u : (depth - A.s.depth) / (B.s.depth - A.s.depth || 1);
            return [A.q[0] + (B.q[0] - A.q[0]) * t, A.q[1] + (B.q[1] - A.q[1]) * t, A.q[2] + (B.q[2] - A.q[2]) * t];
          })(),
          depth,
        };
      }
    }
  return edge ?? face;
}

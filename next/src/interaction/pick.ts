// Picking on a body (`in_1568`): what the pointer is at on the bodies the engine made: an edge when the pointer is within a few pixels of one that can be seen, else the face it is over. Pure: the meshes, the camera and the pointer in; the face or edge (by the
// ids the steps use) and the place out. A face is found by the pointer's ray through the triangles; an edge by its distance on the screen to the edge's polyline, and only if it is not behind the face the ray meets first.
import { forward, project, type Cam } from "../camera.ts";
import { idKey } from "../engine/id.ts";
import { rayOf } from "../orb.ts";
import { faceCentre } from "./anchors.ts";
import type { BodyMesh, EdgeInfo, FaceInfo, VertexInfo } from "../studio.ts";
import type { V3 } from "../vec.ts";

/** the body a hit is in (its name; "" for one with none) */
export const ownerOf = (h: Hit): string =>
  (h.kind === "face" ? h.face.body : h.kind === "edge" ? h.edge.body : h.vertex.body) ?? "";
/** The edges that bound some faces of a body (those with a name: two faces beside them): a face stands for its edges (`dec_selection_tools`, `in_257`), so a round or chamfer of a face is of every one of them. */
export function edgesAround(m: Pick<BodyMesh, "edgeInfo">, faces: readonly Pick<FaceInfo, "ref">[]): EdgeInfo[] {
  const sides = new Set(faces.map((f) => idKey(f.ref)));
  return m.edgeInfo.filter((e) => sides.has(idKey(e.ref.a)) || sides.has(idKey(e.ref.b)));
}
export type Hit =
  | { kind: "face"; body: string; face: FaceInfo; point: V3; normal: V3; depth: number }
  | { kind: "edge"; body: string; edge: EdgeInfo; point: V3; depth: number; near?: number }
  | { kind: "vertex"; body: string; vertex: VertexInfo; point: V3; depth: number; near?: number };

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
/** everything under the pointer, in the old app's order (corners, then edges, then the face in front; each nearest first): a corner or an edge within `tolPx` that is not hidden behind the face the pointer is over, and that face. A repeated click goes down this list (`MD-3`). */
export function pickAll(
  meshes: readonly BodyMesh[],
  cam: Cam,
  w: number,
  h: number,
  x: number,
  y: number,
  tolPx = 7,
): Hit[] {
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
  const hidden = (depth: number) => !!face && depth > face.depth * 1.004 + 0.05; // (behind the face the pointer is over)
  const vertices: { hit: Hit; g: number }[] = [];
  for (const m of meshes)
    for (const v of m.vertexInfo) {
      const s = project(cam, v.at, w, h);
      if (cam.ortho === null && s.depth <= 1e-6) continue;
      const g = Math.hypot(s.x - x, s.y - y);
      if (g >= tolPx || hidden(s.depth)) continue;
      vertices.push({ g, hit: { kind: "vertex", body: m.id, vertex: v, point: v.at, depth: s.depth, near: g } });
    }
  const edges: { hit: Hit; g: number }[] = [];
  for (const m of meshes)
    for (const e of m.edgeInfo) {
      const pts = Array.from({ length: e.count }, (_, i) => {
        const k = 3 * (e.start + i);
        const q: V3 = [m.lines[k]!, m.lines[k + 1]!, m.lines[k + 2]!];
        return { q, s: project(cam, q, w, h) };
      });
      let best: { hit: Hit; g: number } | null = null;
      for (let i = 0; i + 1 < pts.length; i++) {
        const A = pts[i]!,
          B = pts[i + 1]!;
        if (cam.ortho === null && (A.s.depth <= 1e-6 || B.s.depth <= 1e-6)) continue;
        const g = toSeg(x, y, A.s.x, A.s.y, B.s.x, B.s.y);
        if (g.d >= (best?.g ?? tolPx)) continue;
        const depth =
          cam.ortho !== null
            ? A.s.depth + (B.s.depth - A.s.depth) * g.u
            : 1 / (1 / A.s.depth + (1 / B.s.depth - 1 / A.s.depth) * g.u); // (on the screen, 1 / depth is what runs evenly along a line)
        if (hidden(depth)) continue;
        const t = cam.ortho !== null ? g.u : (depth - A.s.depth) / (B.s.depth - A.s.depth || 1);
        best = {
          g: g.d,
          hit: {
            kind: "edge",
            body: m.id,
            edge: e,
            point: [A.q[0] + (B.q[0] - A.q[0]) * t, A.q[1] + (B.q[1] - A.q[1]) * t, A.q[2] + (B.q[2] - A.q[2]) * t],
            depth,
            near: g.d,
          },
        };
      }
      if (best) edges.push(best);
    }
  const byNear = (a: { g: number }, b: { g: number }) => a.g - b.g;
  return [...vertices.sort(byNear).map((v) => v.hit), ...edges.sort(byNear).map((e) => e.hit), ...(face ? [face] : [])];
}
/** what the pointer is at: the first of everything under it */
export const pickAt = (
  meshes: readonly BodyMesh[],
  cam: Cam,
  w: number,
  h: number,
  x: number,
  y: number,
  tolPx = 7,
): Hit | null => pickAll(meshes, cam, w, h, x, y, tolPx)[0] ?? null;

/** whether nothing of the bodies stands between the eye and a place (a place on a body's own surface is seen) */
export function visibleFrom(meshes: readonly BodyMesh[], cam: Cam, p: V3): boolean {
  const eye: V3 =
      cam.ortho === null
        ? cam.eye
        : (() => {
            const f = forward(cam);
            return [p[0] - f[0] * 1e6, p[1] - f[1] * 1e6, p[2] - f[2] * 1e6];
          })(),
    v: V3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]],
    dist = Math.hypot(...v),
    d: V3 = [v[0] / dist, v[1] / dist, v[2] / dist];
  return !meshes.some((m) => {
    const f = rayMesh(m, eye, d);
    return !!f && f.t < dist - 0.02 - (cam.ortho === null ? 1e-4 * dist : 0); // (in a straight view the ray begins 1e6 mm back: a share of that would hide a body 100 mm in front, `in_1746`)
  });
}

/** the place half way along a polyline (by its points: the middle one, or between the two ends of a straight one) */
const middle = (ps: V3[]): V3 =>
  ps.length % 2
    ? ps[(ps.length - 1) / 2]!
    : ([0, 1, 2].map((k) => (ps[ps.length / 2 - 1]![k]! + ps[ps.length / 2]![k]!) / 2) as V3);
/** What a box drawn on the screen takes of the bodies, as the old app's did (edges first, hidden ones skipped): the edges that lie wholly in it and are seen; none: the corners in it that are seen; none: the faces whose middle is in it and seen. One body: the first that has any. */
export function boxPick(
  meshes: readonly BodyMesh[],
  cam: Cam,
  w: number,
  h: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): { body: string; faces: FaceInfo[]; edges: EdgeInfo[]; vertices: VertexInfo[]; whole: string[]; at: V3 } | null {
  const lo = { x: Math.min(box.x0, box.x1), y: Math.min(box.y0, box.y1) },
    hi = { x: Math.max(box.x0, box.x1), y: Math.max(box.y0, box.y1) },
    inside = (p: V3) => {
      const s = project(cam, p, w, h);
      return (cam.ortho !== null || s.depth > 1e-6) && s.x >= lo.x && s.x <= hi.x && s.y >= lo.y && s.y <= hi.y;
    };
  for (const m of meshes) {
    const pt = (i: number): V3 => [m.lines[3 * i]!, m.lines[3 * i + 1]!, m.lines[3 * i + 2]!];
    const edges = m.edgeInfo.filter((e) => {
      const ps = Array.from({ length: e.count }, (_, i) => pt(e.start + i));
      return ps.every(inside) && visibleFrom(meshes, cam, middle(ps));
    });
    const mid = (ps: V3[]): V3 => [0, 1, 2].map((k) => ps.reduce((a, p) => a + p[k]!, 0) / ps.length) as V3;
    if (edges.length)
      return {
        body: m.id,
        faces: [],
        edges,
        vertices: [],
        whole: [],
        at: mid(edges.map((e) => middle(Array.from({ length: e.count }, (_, i) => pt(e.start + i))))),
      };
    const vertices = m.vertexInfo.filter((v) => inside(v.at) && visibleFrom(meshes, cam, v.at));
    if (vertices.length)
      return { body: m.id, faces: [], edges: [], vertices, whole: [], at: mid(vertices.map((v) => v.at)) };
    const faces = m.faces.filter((f) => {
      const c = faceCentre(m, f);
      return inside(c) && visibleFrom(meshes, cam, c);
    });
    if (faces.length)
      return { body: m.id, faces, edges: [], vertices: [], whole: [], at: mid(faces.map((f) => faceCentre(m, f))) };
  }
  return null;
}

/** The bodies a box on the screen goes over whole (every point of the body inside it, seen or not): picked whole, as a double click does (`in_1738`). */
export function boxWhole(
  meshes: readonly BodyMesh[],
  cam: Cam,
  w: number,
  h: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): { body: string; faces: FaceInfo[]; edges: EdgeInfo[]; vertices: VertexInfo[]; whole: string[]; at: V3 } | null {
  const lo = { x: Math.min(box.x0, box.x1), y: Math.min(box.y0, box.y1) },
    hi = { x: Math.max(box.x0, box.x1), y: Math.max(box.y0, box.y1) };
  for (const m of meshes) {
    const keys = [...new Set(m.faces.map((f) => f.body ?? ""))],
      whole = keys.filter((k) =>
        m.faces
          .filter((f) => (f.body ?? "") === k)
          .every((f) => {
            for (let i = f.start; i < f.start + f.count; i++) {
              const q = project(
                cam,
                [
                  m.positions[3 * m.indices[i]!]!,
                  m.positions[3 * m.indices[i]! + 1]!,
                  m.positions[3 * m.indices[i]! + 2]!,
                ],
                w,
                h,
              );
              if ((cam.ortho === null && q.depth <= 1e-6) || q.x < lo.x || q.x > hi.x || q.y < lo.y || q.y > hi.y)
                return false;
            }
            return true;
          }),
      );
    if (!whole.length) continue;
    const c: V3 = [0, 0, 0];
    let n = 0;
    for (const f of m.faces)
      if (whole.includes(f.body ?? "")) {
        const p = faceCentre(m, f);
        for (let k = 0; k < 3; k++) c[k]! += p[k]!;
        n++;
      }
    return { body: m.id, faces: [], edges: [], vertices: [], whole, at: [c[0] / n, c[1] / n, c[2] / n] };
  }
  return null;
}

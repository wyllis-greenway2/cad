// The helper handles (`in_117`): Move shows X Y Z arrows you drag; Fillet / chamfer shows a double arrow on the edge (drag one way for a fillet, the other for a chamfer of that
// size); Rotate shows curved arrows round X Y Z at a centre you can move to the point you want to turn about. Pure geometry: where the handles are, which one is under the
// pointer, and what a drag of one means. The view draws them; the controller applies the drag.
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { normalOfPlane } from "../operation/part.ts";
import type { Op } from "./operations.ts";
import { bodyCentre } from "./objects.ts";
import type { Camera } from "./camera.ts";
import { basis } from "./camera.ts";
import { settings } from "../shared/settings.ts";

export type HandleKind = "arrow" | "double" | "arc" | "ball";
export interface Handle {
  id: string;
  kind: HandleKind;
  axis: 0 | 1 | 2 | null;
  /** an arrow or double arrow: [from, to]; an arc: the points along it; a ball: [at] */
  points: Vec3[];
}
export interface Gizmo { handles: Handle[]; centre: Vec3 }

export const hasGizmo = (kind: Op["kind"]): boolean => kind === "move" || kind === "rotate" || kind === "edge";
const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** The direction that is "out" of an edge of the body: the two faces that meet there, added. Dragging along it makes a fillet, against it a chamfer. */
export function edgeDirection(scene: Scene, a: Vec3, b: Vec3): Vec3 {
  const normals: Vec3[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "plane" || p.origin !== "body") continue;
    const n = normalOfPlane(p);
    if (Math.abs(dot(n, sub(a, p.at))) < 1e-3 && Math.abs(dot(n, sub(b, p.at))) < 1e-3) normals.push(n);
  }
  if (normals.length >= 2) {
    const d = add(normals[0]!, normals[1]!);
    if (Math.hypot(...d) > 1e-6) return normalize(d);
  }
  const along = normalize(sub(b, a));
  const helper: Vec3 = Math.abs(along[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return normalize(cross(along, helper)); // a straight edge between parallel faces: any way across it
}

/** The handles for the operation that is being set up, sized to the view (about a sixth of the view distance). */
export function gizmoFor(scene: Scene, op: Op, cam: Camera): Gizmo | null {
  const L = cam.distance * settings.gizmo.sizeOfView;
  if (op.kind === "move" || op.kind === "rotate") {
    const centre = op.kind === "rotate" ? (op.pivot ?? bodyCentre(scene)) : bodyCentre(scene);
    if (!centre) return null;
    if (op.kind === "move") return { centre, handles: AXES.map((d, i): Handle => ({ id: `move:${"xyz"[i]}`, kind: "arrow", axis: i as 0 | 1 | 2, points: [centre, add(centre, scale(d, L))] })) };
    // three curved arrows, one round each axis, each a quarter turn in its own plane, and a ball at the centre to move it
    const handles: Handle[] = AXES.map((_, i): Handle => {
      const u = AXES[(i + 1) % 3]!;
      const v = AXES[(i + 2) % 3]!;
      const pts: Vec3[] = [];
      for (let k = 0; k <= 20; k++) {
        const t = ((20 + (k / 20) * 90) * Math.PI) / 180;
        pts.push(add(centre, scale(add(scale(u, Math.cos(t)), scale(v, Math.sin(t))), L * 0.8)));
      }
      return { id: `rot:${"xyz"[i]}`, kind: "arc", axis: i as 0 | 1 | 2, points: pts };
    });
    handles.push({ id: "pivot", kind: "ball", axis: null, points: [centre] });
    return { centre, handles };
  }
  // an edge: a double arrow through its middle, along the way out of the corner
  const line = scene.parts[op.parts[0]!];
  if (!line || line.kind !== "line") return null;
  const [pa, pb] = [scene.parts[line.a], scene.parts[line.b]];
  if (!pa || !pb || pa.kind !== "corner" || pb.kind !== "corner") return null;
  const m = scale(add(pa.at, pb.at), 0.5);
  const d = edgeDirection(scene, pa.at, pb.at);
  return { centre: m, handles: [{ id: "edge", kind: "double", axis: null, points: [add(m, scale(d, -L * 0.3)), add(m, scale(d, L * 0.3))] }] };
}

// ---- which handle is under the pointer ----
const segDist = (p: [number, number], a: [number, number], b: [number, number]): number => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
/** The handle nearest the pointer within `tolPx`, if any. The ball wins over what is under it. */
export function hitHandle(g: Gizmo, project: (p: Vec3) => [number, number], x: number, y: number, tolPx = settings.gizmo.hitPx): Handle | null {
  let best: { h: Handle; d: number } | null = null;
  for (const h of g.handles) {
    const pts = h.points.map(project);
    const d = h.kind === "ball" ? Math.hypot(x - pts[0]![0], y - pts[0]![1]) - 4 : Math.min(...pts.slice(1).map((q, i) => segDist([x, y], pts[i]!, q)));
    if (d <= tolPx && (!best || d < best.d)) best = { h, d };
  }
  return best?.h ?? null;
}

// ---- what a drag means ----
export interface Ray { o: Vec3; d: Vec3 }
/** Where on the line `p + t u` (u a unit vector) the ray comes closest, as t. Null when the ray is parallel to the line. */
export function paramOnLine(p: Vec3, u: Vec3, ray: Ray): number | null {
  const w = sub(p, ray.o);
  const b = dot(u, ray.d);
  const den = 1 - b * b;
  if (den < 1e-6) return null;
  return (b * dot(ray.d, w) - dot(u, w)) / den;
}
const hitPlane = (ray: Ray, at: Vec3, n: Vec3): Vec3 | null => {
  const den = dot(n, ray.d);
  if (Math.abs(den) < 1e-6) return null;
  const t = dot(n, sub(at, ray.o)) / den;
  return t > 0 ? add(ray.o, scale(ray.d, t)) : null;
};

export interface Drag {
  id: string;
  kind: HandleKind;
  axis: 0 | 1 | 2 | null;
  /** the line, the turning centre or the ball's position where the drag began */
  origin: Vec3;
  /** the unit direction of the line, or the axis turned about */
  dir: Vec3;
  /** the parameter, angle (radians) or offset at the start */
  start: number;
  offset: Vec3 | null;
}

/** Begin dragging a handle with the pointer ray at the press. Null if the ray cannot be turned into a drag (the view is along the line). */
export function startDrag(g: Gizmo, h: Handle, ray: Ray, cam: Camera): Drag | null {
  if (h.kind === "arrow" || h.kind === "double") {
    const dir = normalize(sub(h.points[1]!, h.points[0]!));
    const origin = h.kind === "double" ? scale(add(h.points[0]!, h.points[1]!), 0.5) : h.points[0]!;
    const t = paramOnLine(origin, dir, ray);
    return t === null ? null : { id: h.id, kind: h.kind, axis: h.axis, origin, dir, start: t, offset: null };
  }
  if (h.kind === "arc") {
    const dir = AXES[h.axis!]!;
    const p = hitPlane(ray, g.centre, dir);
    return p ? { id: h.id, kind: "arc", axis: h.axis, origin: g.centre, dir, start: angleIn(g.centre, dir, p), offset: null } : null;
  }
  const dir = basis(cam).forward;
  const p = hitPlane(ray, g.centre, dir);
  return p ? { id: h.id, kind: "ball", axis: null, origin: g.centre, dir, start: 0, offset: sub(p, g.centre) } : null;
}
/** The angle of a point round an axis through `centre` (right-handed about the axis), in radians. */
function angleIn(centre: Vec3, axis: Vec3, p: Vec3): number {
  const u = normalize(cross(Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], axis));
  const v = cross(axis, u);
  const r = sub(p, centre);
  return Math.atan2(dot(r, v), dot(r, u));
}
const snap = (v: number, step: number) => Math.round(v / step) * step;
const clean = (v: number) => Math.round(v * 1e6) / 1e6 + 0;

/** The value a drag has reached: a distance along a line (arrows, the edge), degrees for a turn, or the new position of the ball. */
export function dragTo(d: Drag, ray: Ray): { value: number } | { pivot: Vec3 } | null {
  if (d.kind === "arrow" || d.kind === "double") {
    const t = paramOnLine(d.origin, d.dir, ray);
    return t === null ? null : { value: clean(snap(t - d.start, settings.op.distanceStep)) };
  }
  if (d.kind === "arc") {
    const p = hitPlane(ray, d.origin, d.dir);
    if (!p) return null;
    let a = angleIn(d.origin, d.dir, p) - d.start;
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return { value: clean(snap((a * 180) / Math.PI, settings.gizmo.angleStep)) };
  }
  const p = hitPlane(ray, d.origin, d.dir);
  return p && d.offset ? { pivot: sub(p, d.offset) } : null;
}

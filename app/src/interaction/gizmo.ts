// The helper handles (`in_117`): Move shows X Y Z arrows you drag; Fillet / chamfer shows a double arrow on the edge (drag one way for a fillet, the other for a chamfer of that
// size); Rotate shows curved arrows round X Y Z at a centre you can move to the point you want to turn about. Pure geometry: where the handles are, which one is under the
// pointer, and what a drag of one means. The view draws them; the controller applies the drag.
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { normalOfPlane } from "../operation/part.ts";
import type { Op } from "./operations.ts";
import { bodyCentre } from "./objects.ts";
import { patternValues, patternCentre } from "./pattern.ts";
import type { Camera } from "./camera.ts";
import { basis } from "./camera.ts";
import { settings } from "../shared/settings.ts";

export type HandleKind = "arrow" | "double" | "arc" | "ball" | "scale";
export interface Handle {
  id: string;
  kind: HandleKind;
  axis: 0 | 1 | 2 | null;
  /** an arrow or double arrow: [from, to]; a turning ring: the points round it (closed); a ball: [at]; a scale handle: [centre, the corner you pull] */
  points: Vec3[];
  /** a turning ring: the axis it turns about */
  dir?: Vec3;
  /** a turning ring: which of its points carries the arrowhead */
  head?: number;
}
export interface Gizmo { handles: Handle[]; centre: Vec3 }

export const hasGizmo = (kind: Op["kind"]): boolean => kind !== "dimension";
const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const RING = 48;
/** One size for every arrow: a double arrow reaches this far each way from its middle (times the gizmo length), a single arrow is the same overall length. */
const HALF = 0.3;

/** The direction that is "out" of an edge of the body: the two faces that meet there, added. Dragging along it makes a fillet, against it a chamfer. */
export function edgeDirection(scene: Scene, a: Vec3, b: Vec3): Vec3 {
  const normals: Vec3[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "plane" || p.origin !== "body" || p.curved || p.rounded) continue;
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

/** A full circle round `axis` through `centre`, so which plane it turns in is plain to see; the arrowhead sits a little way round. */
function ring(id: string, centre: Vec3, axis: Vec3, R: number, i: 0 | 1 | 2 | null): Handle {
  const u = normalize(cross(Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], axis));
  const v = cross(axis, u);
  const points: Vec3[] = [];
  for (let k = 0; k <= RING; k++) {
    const t = (k / RING) * Math.PI * 2;
    points.push(add(centre, scale(add(scale(u, Math.cos(t)), scale(v, Math.sin(t))), R)));
  }
  return { id, kind: "arc", axis: i, points, dir: axis, head: Math.round(RING / 8) };
}
const cornersOf = (scene: Scene, refs: readonly string[]): Vec3[] => refs.map((r) => scene.parts[r]).filter((p): p is Extract<NonNullable<Scene["parts"][string]>, { kind: "corner" }> => p?.kind === "corner").map((p) => p.at);
const middle = (pts: Vec3[]): Vec3 => scale(pts.reduce((a, p) => add(a, p), [0, 0, 0] as Vec3), 1 / Math.max(1, pts.length));
/** The box that holds the body's corners, or null with no body. */
function bodyBox(scene: Scene): { lo: Vec3; hi: Vec3 } | null {
  const pts = Object.values(scene.parts).filter((p) => p.kind === "corner" && p.origin === "body").map((p) => (p as { at: Vec3 }).at);
  if (!pts.length) return null;
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i]!, p[i]!); hi[i] = Math.max(hi[i]!, p[i]!); }
  return { lo, hi };
}

/** The handles for the operation that is being set up (or whose handle shows up by itself), sized to the view (about a sixth of the view distance). */
export function gizmoFor(scene: Scene, op: Op, cam: Camera): Gizmo | null {
  const L = cam.distance * settings.gizmo.sizeOfView;
  if ((op.kind === "extrude" || op.kind === "pushpull") && op.origin && op.normal) {
    // the arrow normal to the figure or the face, pointing both ways: drag it out to pull, in to push
    return { centre: op.origin, handles: [{ id: "pull", kind: "double", axis: null, points: [add(op.origin, scale(op.normal, -HALF * L)), add(op.origin, scale(op.normal, HALF * L))] }] };
  }
  if (op.kind === "edge") {
    // a double arrow on each selected edge, through its middle, along the way out of the corner; the size you drag applies to all of them
    const handles: Handle[] = (op.edges ?? []).map((e, i): Handle => ({ id: `edge:${i}`, kind: "double", axis: null, points: [add(e.mid, scale(e.dir, -HALF * L)), add(e.mid, scale(e.dir, HALF * L))] }));
    return handles.length ? { centre: scale(add(handles[0]!.points[0]!, handles[0]!.points[1]!), 0.5), handles } : null;
  }
  if (op.kind === "linear" || op.kind === "circular") {
    const v = patternValues(op);
    if (v.length < 6) return null;
    if (op.kind === "circular") {
      // the same rings and ball as a rotation: the ring you take sets the axis, the ball is the point the copies turn about
      const pivot: Vec3 = [v[3]!, v[4]!, v[5]!];
      return { centre: pivot, handles: AXES.map((d, i) => ring(`rot:${"xyz"[i]}`, pivot, d, L * 0.8, i as 0 | 1 | 2)) }; // (the point itself is a vertex in the scene: move it with Move)
    }
    // an arrow along each axis whose end is where the next copy goes (pull it for the distance between them), and a short arrow past the last copy (pull it for how many)
    const c = patternCentre(scene, op);
    const handles: Handle[] = [];
    AXES.forEach((d, i) => {
      const sp = v[2 * i + 1]!;
      const n = Math.max(1, Math.round(v[2 * i]!));
      if (Math.abs(sp) < 1e-9) return;
      const sgn = sp < 0 ? -1 : 1;
      handles.push({ id: `lin:${"xyz"[i]}`, kind: "arrow", axis: i as 0 | 1 | 2, points: [c, add(c, scale(d, sp))] });
      // the stub for how many starts a good way past the last copy (and so well clear of the spacing arrow, which ends at the first), and stays close to the copies once there are some
      const slot = add(c, scale(d, sp * n + sgn * L * (n > 1 ? 0.35 : 0.9)));
      handles.push({ id: `cnt:${"xyz"[i]}`, kind: "arrow", axis: i as 0 | 1 | 2, points: [slot, add(slot, scale(d, sgn * L * 0.3))] });
    });
    return { centre: c, handles };
  }
  if (op.target === "shape" && op.kind === "scale" && op.pivot) {
    // the ball on the figure's far corner (a circle: on its rim) pulled out for bigger
    const first = op.parts[0] ? scene.parts[op.parts[0]] : undefined;
    const pl = op.plane ? scene.parts[op.plane] : undefined;
    const far = first?.kind === "corner" ? first.at : first?.kind === "circle" && pl?.kind === "plane" ? add(op.pivot, scale(pl.u, first.radius)) : null;
    return far ? { centre: op.pivot, handles: [{ id: "scale", kind: "scale", axis: null, points: [op.pivot, far] }] } : null;
  }
  if (op.target === "plane") {
    // a drawn figure: the same X Y Z arrows and rings as an object, at the figure's middle (the pivot of a turn can be moved)
    const pts = cornersOf(scene, op.parts);
    if (!pts.length) return null;
    const centre = op.kind === "rotate" ? (op.pivot ?? middle(pts)) : middle(pts);
    if (op.kind === "move") return { centre, handles: AXES.map((d, i): Handle => ({ id: `move:${"xyz"[i]}`, kind: "arrow", axis: i as 0 | 1 | 2, points: [centre, add(centre, scale(d, 2 * HALF * L))] })) };
    return { centre, handles: [...AXES.map((d, i) => ring(`rot:${"xyz"[i]}`, centre, d, L * 0.8, i as 0 | 1 | 2)), { id: "pivot", kind: "ball", axis: null, points: [centre] }] };
  }
  const box = bodyBox(scene);
  if (!box) return null;
  const centre = op.kind === "rotate" ? (op.pivot ?? bodyCentre(scene) ?? scale(add(box.lo, box.hi), 0.5)) : scale(add(box.lo, box.hi), 0.5);
  if (op.kind === "move") return { centre, handles: AXES.map((d, i): Handle => ({ id: `move:${"xyz"[i]}`, kind: "arrow", axis: i as 0 | 1 | 2, points: [centre, add(centre, scale(d, 2 * HALF * L))] })) };
  if (op.kind === "rotate") return { centre, handles: [...AXES.map((d, i) => ring(`rot:${"xyz"[i]}`, centre, d, L * 0.8, i as 0 | 1 | 2)), { id: "pivot", kind: "ball", axis: null, points: [centre] }] };
  if (op.kind === "scale") return { centre, handles: [{ id: "scale", kind: "scale", axis: null, points: [centre, box.hi] }] };
  return null;
}

/** The handles moved along with what they are dragging (the arrows of a move or a pull follow the object live). */
export function followed(g: Gizmo, drag: { dir: Vec3; kind: HandleKind; id: string } | null, value: number | null): Gizmo {
  if (!drag || value === null || (drag.kind !== "arrow" && drag.kind !== "double") || drag.id.startsWith("edge")) return g;
  const by = scale(drag.dir, value);
  return { centre: add(g.centre, by), handles: g.handles.map((h) => ({ ...h, points: h.points.map((p) => add(p, by)) })) };
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
  if (h.kind === "scale") {
    // the ball slides along the diagonal from the centre: how far along it the pointer is, relative to where you took hold, is the factor
    const dir = sub(h.points[1]!, h.points[0]!);
    const t = paramOnLine(h.points[0]!, normalize(dir), ray);
    return t === null ? null : { id: h.id, kind: "scale", axis: null, origin: h.points[0]!, dir, start: Math.max(1e-6, t / Math.hypot(...dir)), offset: null };
  }
  if (h.kind === "arc") {
    const dir = h.dir ?? AXES[h.axis!]!;
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
  if (d.kind === "scale") {
    const t = paramOnLine(d.origin, normalize(d.dir), ray);
    return t === null ? null : { value: clean(Math.max(0.05, snap(t / Math.hypot(...d.dir) / d.start, 0.01))) };
  }
  const p = hitPlane(ray, d.origin, d.dir);
  return p && d.offset ? { pivot: sub(p, d.offset) } : null;
}

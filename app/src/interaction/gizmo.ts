// The helper handles (`in_117`): Move shows X Y Z arrows you drag; Fillet / chamfer shows a double arrow on the edge (drag one way for a fillet, the other for a chamfer of that
// size); Rotate shows curved arrows round X Y Z at a centre you can move to the point you want to turn about. Pure geometry: where the handles are, which one is under the
// pointer, and what a drag of one means. The view draws them; the controller applies the drag.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross, normalize, centroid } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { normalOfPlane } from "../operation/part.ts";
import type { Op } from "./operations.ts";
import { patternValues, patternCentre } from "./pattern.ts";
import type { Camera } from "./camera.ts";
import { basis } from "./camera.ts";
import { settings } from "../shared/settings.ts";
import { jointOfBody } from "./mate.ts";

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

/** A point that lies on the handle itself (its middle: an arrow's, the point half way round a ring): a finger that cannot reach a small handle drags a proxy that starts from here (`in_284`). */
export const handleMiddle = (h: Handle): Vec3 => h.points.length === 2 ? [(h.points[0]![0] + h.points[1]![0]) / 2, (h.points[0]![1] + h.points[1]![1]) / 2, (h.points[0]![2] + h.points[1]![2]) / 2] : h.points[h.points.length >> 1]!;

export const hasGizmo = (kind: Op["kind"]): boolean => kind !== "dimension";
const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const RING = 48;
/** One size for every arrow: a double arrow reaches this far each way from its middle (times the gizmo length), a single arrow is the same overall length. */
const HALF = 0.3;

/** Does this mesh (triangles, x y z for each corner) have a corner at `p`? */
function hasCorner(m: readonly number[], p: Vec3): boolean {
  for (let i = 0; i + 2 < m.length; i += 3) if (Math.abs(m[i]! - p[0]) < 2e-3 && Math.abs(m[i + 1]! - p[1]) < 2e-3 && Math.abs(m[i + 2]! - p[2]) < 2e-3) return true;
  return false;
}

/** The direction that is "out" of an edge of the body: the two faces that meet there, added. Dragging along it makes a fillet, against it a chamfer. */
export function edgeDirection(scene: Scene, a: Vec3, b: Vec3, radial?: Vec3): Vec3 {
  const normals: Vec3[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "plane" || p.origin !== "body" || p.curved || p.rounded) continue;
    const n = normalOfPlane(p);
    if (Math.abs(dot(n, sub(a, p.at))) < 1e-3 && Math.abs(dot(n, sub(b, p.at))) < 1e-3 && (!p.mesh || (hasCorner(p.mesh, a) && hasCorner(p.mesh, b)))) normals.push(n); // (in the plane is not enough: the other side of the gear has faces in the same plane, `in_266`)
  }
  if (normals.length < 2 && !radial) {
    // a flat face and a curved one (a tooth's flank and the round bottom between teeth): the curved face's outward normal where it touches the edge, from its triangles (`in_266`: the arrow stood at a made-up angle)
    for (const p of Object.values(scene.parts)) {
      if (normals.length >= 2) break;
      if (p.kind !== "plane" || p.origin !== "body" || !(p.curved || p.rounded) || !p.mesh) continue;
      const m = p.mesh;
      let n: Vec3 = [0, 0, 0];
      for (let i = 0; i + 8 < m.length; i += 9) {
        const t = [0, 3, 6].map((o) => [m[i + o]!, m[i + o + 1]!, m[i + o + 2]!] as Vec3);
        if (!t.some((q) => Math.hypot(...sub(q, a)) < 2e-3) || !t.some((q) => Math.hypot(...sub(q, b)) < 2e-3 || Math.hypot(...sub(q, a)) > 2e-3)) continue;
        n = add(n, cross(sub(t[1]!, t[0]!), sub(t[2]!, t[0]!)));
      }
      if (Math.hypot(...n) > 1e-9) normals.push(normalize(n));
    }
  }
  if (normals.length >= 2) {
    const d = add(normals[0]!, normals[1]!);
    if (Math.hypot(...d) > 1e-6) return normalize(d);
  }
  // a curved edge (the rim of a post): out of the flat face and out from the middle of the curve
  if (radial) {
    const d = normals.length ? add(normals[0]!, radial) : radial;
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
/** The box that holds the body's corners, or null with no body. With several bodies the box of the ones selected (`parts`), so the arrows and rings stand in the middle of what is selected, not of everything (`in_291`). */
function bodyBox(scene: Scene, parts: readonly string[] = []): { lo: Vec3; hi: Vec3 } | null {
  const mine = parts.map((r) => scene.parts[r]).filter((q): q is Extract<NonNullable<Scene["parts"][string]>, { kind: "body" }> => q?.kind === "body" && !!q.bbox);
  if (mine.length) {
    return { lo: [0, 1, 2].map((i) => Math.min(...mine.map((b) => b.bbox!.min[i]!))) as unknown as Vec3, hi: [0, 1, 2].map((i) => Math.max(...mine.map((b) => b.bbox!.max[i]!))) as unknown as Vec3 };
  }
  const pts = Object.values(scene.parts).filter((p) => p.kind === "corner" && p.origin === "body").map((p) => (p as { at: Vec3 }).at);
  if (!pts.length) return null;
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i]!, p[i]!); hi[i] = Math.max(hi[i]!, p[i]!); }
  return { lo, hi };
}

/** Where the arrows of a move stand as it begins: the middle of the body's box, or of the corners of the drawn figure. Null with nothing to move. */
export function moveCentre(scene: Scene, op: Op): Vec3 | null {
  if (op.target === "plane") { const pts = cornersOf(scene, op.parts); return pts.length ? centroid(pts) : null; }
  const box = bodyBox(scene, op.parts);
  return box ? scale(add(box.lo, box.hi), 0.5) : null;
}
/**
 * How far a move has taken what it moves since the move began (`in_230`): the position the bubbles show, starting at 0 and keeping on across drags until the move is put away. A body: the move
 * steps made since (so it is there the moment the step is, not when the kernel has answered); a drawn figure: where its middle is now against where it began.
 */
export function moveOffset(scene: Scene, op: Op): Vec3 {
  if (op.kind !== "move" || !op.from) return [0, 0, 0];
  if (op.target === "plane") { const c = moveCentre(scene, op); return c ? sub(c, op.from) : [0, 0, 0]; }
  const out: [number, number, number] = [0, 0, 0];
  for (const st of scene.steps.slice(op.stepsAt ?? scene.steps.length)) {
    if (st.type !== "move" || st.parts[0] !== op.parts[0]) continue;
    if (st.params.vx !== undefined) { out[0] += Number(st.params.vx); out[1] += Number(st.params.vy); out[2] += Number(st.params.vz); } // (a body dragged free, `in_291`)
    else out[Number(st.params.axis ?? 0)]! += Number(st.params.value ?? 0);
  }
  if (op.free) { out[0] += op.free[0]; out[1] += op.free[1]; out[2] += op.free[2]; } // (and while it is being dragged: the arrows and the numbers go with it, `in_293`)
  return out;
}

/** The handles for the operation that is being set up (or whose handle shows up by itself), sized to the view (about a sixth of the view distance). */
export function gizmoFor(scene: Scene, op: Op, cam: Camera): Gizmo | null {
  const L = cam.distance * settings.gizmo.sizeOfView;
  if ((op.kind === "extrude" || op.kind === "pushpull" || op.kind === "offset") && op.origin && op.normal) {
    // the arrow normal to the figure or the face, pointing both ways: drag it out to pull, in to push
    return { centre: op.origin, handles: [{ id: "pull", kind: "double", axis: null, points: [add(op.origin, scale(op.normal, -HALF * L)), add(op.origin, scale(op.normal, HALF * L))] }] };
  }
  if (op.kind === "edge") {
    // one double arrow, on the edge selected last, through its middle, along the way out of the corner; the size you drag applies to all the selected edges, so one arrow and one bubble are all there is to work with
    const handles: Handle[] = (op.edges ?? []).slice(-1).map((e, i): Handle => ({ id: `edge:${i}`, kind: "double", axis: null, points: [add(e.mid, scale(e.dir, -HALF * L)), add(e.mid, scale(e.dir, HALF * L))] }));
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
    const centre = op.kind === "rotate" ? (op.pivot ?? centroid(pts)) : centroid(pts);
    if (op.kind === "move") return { centre, handles: AXES.map((d, i): Handle => ({ id: `move:${"xyz"[i]}`, kind: "arrow", axis: i as 0 | 1 | 2, points: [centre, add(centre, scale(d, 2 * HALF * L))] })) };
    return { centre, handles: [...AXES.map((d, i) => ring(`rot:${"xyz"[i]}`, centre, d, L * 0.8, i as 0 | 1 | 2)), { id: "pivot", kind: "ball", axis: null, points: [centre] }] };
  }
  const box = bodyBox(scene, op.parts);
  if (!box) return null;
  // a move that has begun keeps its arrows where the body is by the steps made (the kernel's box lags behind them: the arrows would jump back for a moment, `in_230`)
  const centre = op.kind === "rotate" ? (op.pivot ?? scale(add(box.lo, box.hi), 0.5)) : op.kind === "move" && op.from ? add(op.from, moveOffset(scene, op)) : scale(add(box.lo, box.hi), 0.5);
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
    const d = (h.kind === "ball" ? Math.hypot(x - pts[0]![0], y - pts[0]![1]) - 4 : Math.min(...pts.slice(1).map((q, i) => segDist([x, y], pts[i]!, q)))) - (h.id.startsWith("joint:") ? 3 : 0); // (a joint's handle wins over a move arrow along the same axis, `in_323`)
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
  /** an arrow seen nearly end-on: a small move of the pointer would be a big move along it, so the value follows the pointer across the screen instead, at a steady rate (`in_163`) */
  screen?: { x0: number; y0: number; ux: number; uy: number; pxPerMm: number };
  /** the rounding of the value, when it is not the usual distance step */
  step?: number;
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
export function dragTo(d: Drag, ray: Ray, pointer?: readonly [number, number]): { value: number } | { pivot: Vec3 } | null {
  if (d.kind === "arrow" || d.kind === "double") {
    const step = d.step ?? settings.op.distanceStep;
    if (d.screen && pointer) return { value: clean(snap(((pointer[0] - d.screen.x0) * d.screen.ux + (pointer[1] - d.screen.y0) * d.screen.uy) / d.screen.pxPerMm, step)) };
    const t = paramOnLine(d.origin, d.dir, ray);
    return t === null ? null : { value: clean(snap(t - d.start, step)) };
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

/** The handles of a body that is free to turn and slide on a mate (`in_323`): a ring round the shared axis (turn) and an arrow along it, past the body's end (slide); none for a body with no such mate. */
export function jointHandles(scene: Scene, body: Ref, cam: Camera): Handle[] {
  const j = jointOfBody(scene, body);
  const b = scene.parts[body];
  if (!j || b?.kind !== "body" || !b.bbox) return [];
  const L = cam.distance * settings.gizmo.sizeOfView;
  const c = scale(add(b.bbox.min, b.bbox.max), 0.5);
  const at = add(j.point, scale(j.dir, dot(sub(c, j.point), j.dir))); // (the middle of the body, on the axis)
  const half = Math.abs(dot(sub(b.bbox.max, b.bbox.min), j.dir)) / 2;
  const start = add(at, scale(j.dir, half + HALF * L * 0.2));
  return [ring("joint:turn", at, j.dir, L * 0.6, null), { id: "joint:slide", kind: "arrow", axis: null, points: [start, add(start, scale(j.dir, HALF * L * 1.2))] }];
}

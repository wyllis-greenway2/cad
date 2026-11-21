// Sketch planes and cut planes (prototype: docs/rebuild/sketch_planes_requirements.md). Pure.
// A sketch plane is where lines are drawn: one is active, and it carries the grid. A cut plane only cuts: the half of everything on the camera's side
// of it is not drawn, everything clicks through it, and only its border (inside a box round what it cuts) can be pointed at.
import { cross, dot, len, scale, sub, add, unit, type V3 } from "./vec.ts";
import { forward, type Cam } from "./camera.ts";
import type { Scene } from "./scene.ts";
import { settings } from "./settings.ts";

/** A flat surface: a point on it, the way it faces, and which way its first axis runs. */
export interface Frame { origin: V3; normal: V3; u: V3 }
export interface Cut extends Frame { id: string; on: boolean; temp: boolean }
export interface PlaneState { sketch: Frame | null; cuts: Cut[]; next: number }
export const noPlanes = (): PlaneState => ({ sketch: null, cuts: [], next: 1 });

export const vOf = (f: Frame): V3 => cross(f.normal, f.u);
/** The frame of a plane with this normal: its first axis is the horizontal one, so Z stays up in it. */
export function frameOf(origin: V3, normal: V3): Frame {
  const n = unit(normal);
  const u = Math.abs(n[2]) > 0.999 ? ([1, 0, 0] as V3) : unit(cross([0, 0, 1], n));
  return { origin, normal: n, u };
}
/** A normal near a world axis is made that axis. */
export function snapNormal(n: V3): V3 {
  for (let a = 0; a < 3; a++) if (Math.abs(n[a]!) > Math.cos(settings.planes.snapAxisRad)) { const r: V3 = [0, 0, 0]; r[a] = n[a]! > 0 ? 1 : -1; return r; }
  return unit(n);
}
/** A sketch plane at `point` facing the camera (snapped to an axis when near one). */
export const facingCamera = (c: Cam, point: V3): Frame => frameOf(point, snapNormal(scale(forward(c), -1)));
/** A cut plane's frame at `point`: across the axis the camera looks along. */
export function acrossView(c: Cam, point: V3): Frame {
  const f = forward(c), a = [0, 1, 2].reduce((m, i) => (Math.abs(f[i]!) > Math.abs(f[m]!) ? i : m), 0), n: V3 = [0, 0, 0];
  n[a] = 1;
  return frameOf(point, n);
}

/** Which side of a plane the camera is on: 1 if it is the side the normal points to. An orthographic view has no place to be, only a direction. */
export function cameraSide(f: Frame, c: Cam): 1 | -1 {
  const d = c.ortho !== null ? -dot(forward(c), f.normal) : dot(sub(c.eye, f.origin), f.normal);
  return d >= 0 ? 1 : -1;
}
/** The half-spaces that are cut away: a point is cut where `dot(p - origin, n) > 0`. Always the camera's side, and only for planes that are on. */
export interface Region { origin: V3; n: V3 }
export const regionsOf = (st: PlaneState, c: Cam): Region[] => st.cuts.filter((k) => k.on).map((k) => ({ origin: k.origin, n: scale(k.normal, cameraSide(k, c)) }));
export const isCutAway = (rs: Region[], p: V3, eps = 1e-6): boolean => rs.some((r) => dot(sub(p, r.origin), r.n) > eps);

// ---- the box a cut plane is drawn in, and the shapes where it meets things ----
export interface Box { lo: V3; hi: V3 }
export function modelBox(m: Scene): Box | null {
  if (!m.things.length) return null;
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const t of m.things) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i]!, t.lo[i]!); hi[i] = Math.max(hi[i]!, t.hi[i]!); }
  return { lo, hi };
}
const grow = (b: Box, share: number): Box => {
  const lo = [0, 1, 2].map((i) => b.lo[i]! - Math.max(1, (b.hi[i]! - b.lo[i]!) * share)) as V3, hi = [0, 1, 2].map((i) => b.hi[i]! + Math.max(1, (b.hi[i]! - b.lo[i]!) * share)) as V3;
  return { lo, hi };
};
/** A convex polygon cut to the half-space `dot(p - o, n) >= 0` (Sutherland and Hodgman). */
function clip(poly: V3[], o: V3, n: V3): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, da = dot(sub(a, o), n), db = dot(sub(b, o), n);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) out.push(add(a, scale(sub(b, a), da / (da - db))));
  }
  return out;
}
/** The plane's own shape cut by a box: the polygon where the plane meets it (empty if it does not). */
export function inBox(f: Frame, b: Box): V3[] {
  const c: V3 = [(b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, (b.lo[2] + b.hi[2]) / 2];
  const centre = sub(c, scale(f.normal, dot(sub(c, f.origin), f.normal))); // (the box's middle taken onto the plane)
  const R = len(sub(b.hi, b.lo)) * 2 + 1, u = scale(f.u, R), v = scale(vOf(f), R);
  let poly: V3[] = [sub(sub(centre, u), v), sub(add(centre, u), v), add(add(centre, u), v), add(sub(centre, u), v)];
  for (let i = 0; i < 3 && poly.length >= 3; i++) {
    const e: V3 = [0, 0, 0]; e[i] = 1;
    poly = clip(poly, b.lo, e); if (poly.length < 3) break;
    poly = clip(poly, b.hi, scale(e, -1));
  }
  return poly.length >= 3 ? poly : [];
}
/** What is drawn of a cut plane: its border, in a box round the model (a small square if it meets nothing). */
export function borderOf(f: Frame, m: Scene): V3[] {
  const b = modelBox(m), poly = b ? inBox(f, grow(b, settings.planes.marginShare)) : [];
  if (poly.length >= 3) return poly;
  const h = settings.planes.defaultMm / 2, u = scale(f.u, h), v = scale(vOf(f), h);
  return [sub(sub(f.origin, u), v), sub(add(f.origin, u), v), add(add(f.origin, u), v), add(sub(f.origin, u), v)];
}
/** Where a cut plane cuts a thing: the face of the cut. */
export const cutFaceOf = (f: Frame, t: { lo: V3; hi: V3 }): V3[] => inBox(f, t);

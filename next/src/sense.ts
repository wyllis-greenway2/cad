// What the camera needs to know about the scene: how far ahead things are, what to turn about, and whether anything is in view. Pure.
import { add, len, scale, sub, dot, type V3 } from "./vec.ts";
import { forward, home, project, type Cam } from "./camera.ts";
import { centreOf, hitThings, type Scene, type Thing } from "./scene.ts";
import { settings } from "./settings.ts";

/** The world's own axes, as one thing, for when the model has nothing (and so there is still something to be lost from). */
export const WORLD: Thing = { id: "world", lo: [0, 0, 0], hi: [24, 24, 24] };
export const thingsOf = (sc: Scene): Thing[] => (sc.things.length ? sc.things : [WORLD]);

/**
 * How far ahead along `ray` things are, which sets how big a step is. The first surface the ray meets; else how far in front of the eye the nearest thing's centre is
 * (so a zoom goes toward it and never past it, and the same zoom back returns exactly); else, with every thing behind or none, how far away the nearest thing or the origin is.
 * Always at least a little, and never a number that can run out.
 */
export function depthAhead(sc: Scene, c: Cam, ray: V3): number {
  const h = hitThings(sc, c.eye, ray);
  return h ? h.t : scaleDepth(sc, c);
}
/** The same without the surface under a ray: how far in front of the eye the nearest thing's centre is, or how far away things are. It sets the fog, the grid's spacing and the depth range, and does not jump as the view crosses an edge. */
export function scaleDepth(sc: Scene, c: Cam): number {
  const f = forward(c);
  const points: V3[] = sc.things.length ? sc.things.map(centreOf) : [[0, 0, 0]];
  let ahead = Infinity, away = Infinity;
  for (const p of points) {
    const rel = sub(p, c.eye), s = dot(rel, f);
    if (s > settings.view.minSurfaceMm && s < ahead) ahead = s;
    away = Math.min(away, len(rel));
  }
  return Math.max(isFinite(ahead) ? ahead : away, settings.view.minSurfaceMm);
}

/**
 * The point an orbit turns about: the centre of the thing nearest the line of sight (how far its centre is from the line the screen's middle looks along), among those whose centre is on the screen (`in_291`:
 * turning about a point between two things far apart threw the one being looked at off the screen). With none, the point straight ahead at the depth ahead (the point looked at).
 */
export function pivotFor(sc: Scene, c: Cam, w: number, h: number): V3 {
  const f = forward(c);
  let best: { off: number; p: V3 } | null = null;
  for (const t of sc.things) {
    const p = centreOf(t), rel = sub(p, c.eye), s = dot(rel, f);
    const at = project(c, p, w, h);
    if (s <= 0 || at.x < 0 || at.x > w || at.y < 0 || at.y > h) continue; // (behind the eye or off the screen: not in view; turning about it would swing what is looked at out of the picture)
    const off = len(sub(rel, scale(f, s)));
    if (!best || off < best.off) best = { off, p };
  }
  return best ? best.p : add(c.eye, scale(f, depthAhead(sc, c, f)));
}

/** Does any of the thing's box show in the view, and big enough to see (6 px across, or a lone point on the screen)? Boxes behind the eye do not count. */
export function inView(c: Cam, w: number, h: number, t: Thing): boolean {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, front = 0;
  for (const x of [t.lo[0], t.hi[0]]) for (const y of [t.lo[1], t.hi[1]]) for (const z of [t.lo[2], t.hi[2]]) {
    const p = project(c, [x, y, z], w, h);
    if (p.depth <= 1e-3) continue;
    front++;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  if (!front || x1 < 0 || x0 > w || y1 < 0 || y0 > h) return false;
  const lone = len(sub(t.hi, t.lo)) < 1e-6;
  return lone || Math.max(x1 - x0, y1 - y0) >= 6;
}
export const nothingInView = (sc: Scene, c: Cam, w: number, h: number): boolean => !thingsOf(sc).some((t) => inView(c, w, h, t));
/** The last thing in view (the most recently made, if several), to be remembered while none is. */
export const lastSeen = (sc: Scene, c: Cam, w: number, h: number): string | null => [...thingsOf(sc)].reverse().find((t) => inView(c, w, h, t))?.id ?? null;
/** The thing a Reset goes to: the one last seen, else the last there is. */
export const resetTarget = (sc: Scene, seen: string | null): Thing => { const ts = thingsOf(sc); return ts.find((t) => t.id === seen) ?? ts[ts.length - 1]!; };
export const homeCam = home;

/** Which little pane of the world planes a ray goes through, if any: the pane for the plane across `axis` is a square in the positive quarter of that plane, a little way from the origin. */
export function pickPane(from: V3, dir: V3, gizmoScale = 1): { axis: 0 | 1 | 2; t: number } | null {
  const lo = settings.world.paneGapMm * gizmoScale, hi = lo + settings.world.paneMm * gizmoScale;
  let best: { axis: 0 | 1 | 2; t: number } | null = null;
  for (const k of [0, 1, 2] as const) {
    if (Math.abs(dir[k]) < 1e-12) continue;
    const t = -from[k] / dir[k];
    if (t <= 0) continue;
    const ok = [0, 1, 2].every((i) => i === k || (() => { const v = from[i]! + dir[i]! * t; return v >= lo && v <= hi; })());
    if (ok && (!best || t < best.t)) best = { axis: k, t };
  }
  return best;
}
/** Where a ray meets the world plane across `axis` (through the origin), if in front of the eye. */
export function planeHit(from: V3, dir: V3, axis: 0 | 1 | 2): { t: number; point: V3 } | null {
  if (Math.abs(dir[axis]) < 1e-12) return null;
  const t = -from[axis] / dir[axis];
  return t > 0 ? { t, point: add(from, scale(dir, t)) } : null;
}

/**
 * The grid's spacing and the fog's reach, from the camera's distance to the plane that is on and from the origin, and from nothing else: not from where the view points, and not from what is in it.
 * The spacing is a power of ten, and `blend` (0 to 1) says how far the view has gone toward the next one up, so that the lines of one spacing fade into the next and nothing pops.
 */
export function gridLevel(c: Cam, plane: 0 | 1 | 2): { step: number; blend: number; fog: number } {
  const height = Math.max(Math.abs(c.eye[plane]) * c.lens, settings.view.minSurfaceMm); // (the distance to the plane; a straight view is far away with the lens shut, so the lens is taken out)
  const e = Math.log10(height / 6), k = Math.floor(e), step = 10 ** k;
  return { step, blend: e - k, fog: Math.max(len(c.eye), (12 * step) / c.lens) };
}

/**
 * The pane a pointer is over, with a face of a thing counting only if it lies exactly in the pane's plane (`in_1409`): where a ray meets a thing's face that is not in the plane of the
 * pane, the face is what is pointed at (standard selection), whether the pane is in front of it or behind it. A pane over a face in the very same plane is the pane.
 */
export function paneAt(sc: Scene, from: V3, dir: V3, gizmoScale = 1): { axis: 0 | 1 | 2; t: number } | null {
  const p = pickPane(from, dir, gizmoScale);
  if (!p) return null;
  const h = hitThings(sc, from, dir);
  if (!h) return p;
  const exact = Math.abs(h.normal[p.axis]!) === 1 && Math.abs(from[p.axis]! + dir[p.axis]! * h.t) < 1e-6; // (the face faces along the pane's axis, and is at the plane through the origin)
  return exact ? p : null;
}

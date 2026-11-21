// The camera as pure maths: an eye looking in a direction, through a lens. No target, no stored distance, no zoom number.
//   Move  the eye along a ray, or across the view.          (zoom, walk, pan)
//   Turn  the camera about a point.                          (orbit: the point is a pivot; look: the point is the eye)
//   Lens  how much perspective there is; a straight view is the same camera with the lens nearly shut and the eye far back.
// How far a step goes is always a fraction of the depth ahead (what is in front on that ray), which the caller measures.
import { settings } from "./settings.ts";
import { add, clamp, cross, dot, lerp, rotate, scale, shortest, sub, unit, type V3 } from "./vec.ts";

export interface Cam {
  eye: V3;
  yaw: number; // radians, the direction looked in, about Z (0 = along +X, counter-clockwise from above)
  pitch: number; // radians above the horizon, in [-PI/2, PI/2]; there is no roll: Z is always up
  lens: number; // 1 = full perspective .. settings.view.straightLens = as good as orthographic
}

const HALF_PI = Math.PI / 2;
export const home = (): Cam => {
  // from the +X +Y corner, a little above, looking at the origin from the home distance
  const az = settings.view.homeAzimuth, el = settings.view.homeElevation, d = settings.view.homeDistance;
  const toward: V3 = [-Math.cos(el) * Math.cos(az), -Math.cos(el) * Math.sin(az), -Math.sin(el)];
  return { eye: scale(toward, -d), yaw: Math.atan2(toward[1], toward[0]), pitch: Math.asin(toward[2]), lens: 1 };
};

export const forward = (c: Cam): V3 => [Math.cos(c.pitch) * Math.cos(c.yaw), Math.cos(c.pitch) * Math.sin(c.yaw), Math.sin(c.pitch)];
export const upOf = (c: Cam): V3 => [-Math.sin(c.pitch) * Math.cos(c.yaw), -Math.sin(c.pitch) * Math.sin(c.yaw), Math.cos(c.pitch)];
export const rightOf = (c: Cam): V3 => cross(forward(c), upOf(c));
const tanHalf0 = (): number => Math.tan((settings.view.fovDeg * Math.PI) / 360);
/** The lens's vertical field of view, in radians. */
export const fovOf = (c: Cam): number => 2 * Math.atan(tanHalf0() * c.lens);
/** The size of the view's height, in mm, at `depth` in front of the eye. */
export const heightAt = (c: Cam, depth: number): number => 2 * depth * tanHalf0() * c.lens;
export const isStraight = (c: Cam): boolean => c.lens <= settings.view.straightLens + 1e-9;

/** The unit direction of the ray through a point of the view: (nx, ny) in -1..1 across it, y up. */
export function rayThrough(c: Cam, nx: number, ny: number, aspect: number): V3 {
  const t = tanHalf0() * c.lens;
  return unit(add(forward(c), add(scale(rightOf(c), nx * t * aspect), scale(upOf(c), ny * t))));
}

/** Turn the whole camera about `point`, by a yaw about Z and a pitch about its own right side: the eye swings round the point, and the point stays where it is on screen. With the eye as the point, the eye stays and the view turns. The pitch stops at straight up and down, and the eye stops with it. */
export function turnAbout(c: Cam, point: V3, dyaw: number, dpitch: number): Cam {
  const pitch = clamp(c.pitch + dpitch, -HALF_PI, HALF_PI);
  const dp = pitch - c.pitch;
  const yaw = c.yaw + dyaw;
  let v = sub(c.eye, point);
  v = rotate(v, [0, 0, 1], dyaw);
  const right: V3 = rightOf({ ...c, yaw });
  v = rotate(v, right, dp);
  return { ...c, eye: add(point, v), yaw, pitch };
}
/** Move the eye by `dist` mm along the unit direction `dir`. */
export const moveAlong = (c: Cam, dir: V3, dist: number): Cam => ({ ...c, eye: add(c.eye, scale(dir, dist)) });
/** Slide the view so that what is `depth` ahead follows the pointer's movement in pixels. */
export function pan(c: Cam, dxPx: number, dyPx: number, depth: number, heightPx: number): Cam {
  const wpp = heightAt(c, depth) / heightPx;
  return { ...c, eye: add(c.eye, add(scale(rightOf(c), -dxPx * wpp), scale(upOf(c), dyPx * wpp))) };
}
// ---- the world's planes: where the straight views look from ----
export type Axis = 0 | 1 | 2;
export const AXIS_NAME = ["X", "Y", "Z"] as const;
/** The direction a straight view looks in, for the plane across `axis`, looked at from its positive (+1) or negative (-1) side. The first axis of the plane runs to the right: Z top has X to the right and Y up; X has Y to the right; Y has X to the right. */
export function straightDirection(axis: Axis, side: 1 | -1): { yaw: number; pitch: number } {
  if (axis === 2) return { yaw: HALF_PI, pitch: side === 1 ? -HALF_PI : HALF_PI };
  if (axis === 0) return { yaw: side === 1 ? Math.PI : 0, pitch: 0 };
  return { yaw: side === 1 ? -HALF_PI : HALF_PI, pitch: 0 };
}
/** The side of the plane across `axis` that the eye is on, as it looks at `focus` (the side whose view shows the face). */
export const sideOn = (c: Cam, focus: V3, axis: Axis): 1 | -1 => (c.eye[axis] - focus[axis] >= 0 ? 1 : -1);
/** The axis the view is nearest to coming along, how near (0 at the diagonal, 1 along it) and from which side (`in_295`). */
export function facing(c: Cam): { axis: Axis; sign: 1 | -1; strength: number } {
  const o = scale(forward(c), -1);
  let k: Axis = 0;
  for (const i of [1, 2] as const) if (Math.abs(o[i]) > Math.abs(o[k])) k = i;
  return { axis: k, sign: o[k] >= 0 ? 1 : -1, strength: clamp((Math.abs(o[k]) - 0.6) / 0.4, 0, 1) };
}
/** Whether the view is looking straight along `axis` (within the tolerance), from which side. */
export function straightAlong(c: Cam, tol = settings.view.normalToleranceRad): { axis: Axis; sign: 1 | -1 } | null {
  const f = facing(c);
  return Math.abs(forward(c)[f.axis]) > Math.cos(tol) ? { axis: f.axis, sign: f.sign } : null;
}

// ---- the lens, and eased changes of view ----
/**
 * Change the lens. The picture's size goes as 1 over the eye's distance times the lens, so with the eye staying where it is the view is simply zoomed; with `holdDepth` (how far in front of the eye the point to keep is)
 * the eye goes forward or back by what keeps that point the same size, so nothing jumps while the perspective comes in or goes out. Both a zoom of a straight view and a change to or from one are this.
 */
export const setLens = (c: Cam, lens: number, holdDepth = 0): Cam => ({ ...c, lens, eye: add(c.eye, scale(forward(c), holdDepth * (1 - c.lens / lens))) });
/** Zoom a straight view by `factor` (below 1 = closer) without letting perspective creep in: the lens is shut more (or opened, up to the straight view's own) with the eye where it is; only past the lens's ends is the eye moved, by a share of `refDepth`. The point at (nx, ny) across the view (-1..1, y up) stays where it is on the screen. */
export function zoomLens(c: Cam, factor: number, refDepth: number, nx = 0, ny = 0, aspect = 1): Cam {
  const want = c.lens * factor, lens = clamp(want, settings.view.minStraightLens, settings.view.straightLens);
  const half = heightAt(c, refDepth) / 2;
  const slide = add(scale(rightOf(c), nx * half * aspect), scale(upOf(c), ny * half));
  const next: Cam = { ...setLens(c, lens), eye: add(c.eye, scale(slide, 1 - lens / c.lens)) };
  return lens === want ? next : moveAlong(next, forward(c), refDepth * (1 - want / lens));
}

/** A change of view that plays out over time: the lens goes to `lens`, and the direction to `dir` (turning about `hold`, a point of the world that keeps its place and size), or, with `eyeTo`, the whole view flies there (Reset). */
export interface Go { t0: number; ms: number; from: Cam; lens: number; dir?: { yaw: number; pitch: number }; hold: V3; eyeTo?: V3 }
/** The camera `k` of the way through the change (already eased), from `c`, which may have been moved by hand since. */
export function stepGo(g: Go, k: number, c: Cam): Cam {
  if (g.eyeTo && g.dir) return blend(g.from, { eye: g.eyeTo, yaw: g.dir.yaw, pitch: g.dir.pitch, lens: g.lens }, k);
  let n = c;
  if (g.dir) n = turnAbout(n, g.hold, shortest(n.yaw, g.from.yaw + shortest(g.from.yaw, g.dir.yaw) * k), lerp(g.from.pitch, g.dir.pitch, k) - n.pitch);
  return setLens(n, lerp(g.from.lens, g.lens, k), dot(sub(g.hold, n.eye), forward(n)));
}

// ---- seeing ----
/** A point taken to the screen: pixels from the top left, and how far in front of the eye it is (negative: behind it). */
export function project(c: Cam, p: V3, w: number, h: number): { x: number; y: number; depth: number } {
  const rel = sub(p, c.eye);
  const depth = dot(rel, forward(c));
  const t = tanHalf0() * c.lens;
  const k = depth > 1e-9 ? 1 / (depth * t) : 0;
  return { x: (dot(rel, rightOf(c)) * k * (h / w) * 0.5 + 0.5) * w, y: (0.5 - dot(rel, upOf(c)) * k * 0.5) * h, depth };
}
/** How far in front of the eye a point is, along the view (negative: behind it). */
export const forwardDepth = (c: Cam, p: V3): number => dot(sub(p, c.eye), forward(c));
/** The camera that frames a box whole from the home direction. */
export function frameBox(lo: V3, hi: V3, aspect: number): Cam {
  const centre: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const radius = Math.max(1, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
  const h0 = home();
  const t = tanHalf0();
  const d = (radius * 1.15) / Math.min(t, t * aspect); // (the sphere round the box fits the narrower side)
  return { ...h0, eye: sub(centre, scale(forward(h0), d)) };
}

/** The cameras blended, k from 0 to 1 (eased by the caller): the eye goes straight, the direction turns the short way, the lens opens or shuts. */
export function blend(a: Cam, b: Cam, k: number): Cam {
  return { eye: [lerp(a.eye[0], b.eye[0], k), lerp(a.eye[1], b.eye[1], k), lerp(a.eye[2], b.eye[2], k)], yaw: a.yaw + shortest(a.yaw, b.yaw) * k, pitch: lerp(a.pitch, b.pitch, k), lens: lerp(a.lens, b.lens, k) };
}

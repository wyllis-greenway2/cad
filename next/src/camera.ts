// The camera as pure maths: no DOM, no three.js. Orbit, pan, zoom, straight-on views of a plane, and the game-style fly.
// One lens serves both looks: `mix` is how much perspective there is (1 = all, near 0 = looking straight, which is as good as orthographic);
// the eye is dollied back as the lens narrows, so what is at the target keeps its size and the view moves smoothly between the two.
import { settings } from "./settings.ts";

export type V3 = [number, number, number];
export interface Cam {
  target: V3;
  azimuth: number; // radians around Z (0 = looking from +X)
  elevation: number; // radians above the XY plane, in [-PI/2, PI/2]
  distance: number; // mm from the target, as if all perspective
  mix: number; // 1 = full perspective .. settings.view.minMix = orthographic
  straight: boolean; // looking straight at a plane (mix is on its way to minMix)
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const TWO_PI = Math.PI * 2;
export const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
/** Signed shortest turn from `a` to `b`, in (-PI, PI]. */
export const shortest = (a: number, b: number): number => { let d = (b - a) % TWO_PI; if (d > Math.PI) d -= TWO_PI; if (d <= -Math.PI) d += TWO_PI; return d; };

export const home = (): Cam => ({ target: [0, 0, 0], azimuth: settings.view.homeAzimuth, elevation: settings.view.homeElevation, distance: settings.view.homeDistance, mix: 1, straight: false });

/** The unit vector from the target towards the eye. */
export const offset = (c: Cam): V3 => [Math.cos(c.elevation) * Math.cos(c.azimuth), Math.cos(c.elevation) * Math.sin(c.azimuth), Math.sin(c.elevation)];
export const eyeDistance = (c: Cam): number => c.distance / Math.max(c.mix, settings.view.minMix);
export const eye = (c: Cam): V3 => add(c.target, scale(offset(c), eyeDistance(c)));
/** The lens's vertical field of view in radians for this much perspective. */
export const fov = (c: Cam): number => 2 * Math.atan(Math.tan((settings.view.fovDeg * Math.PI) / 360) * Math.max(c.mix, settings.view.minMix));
/** The camera's own axes in the world. */
export function basis(c: Cam): { forward: V3; right: V3; up: V3 } {
  const forward = scale(offset(c), -1);
  const up: V3 = [-Math.sin(c.elevation) * Math.cos(c.azimuth), -Math.sin(c.elevation) * Math.sin(c.azimuth), Math.cos(c.elevation)];
  return { forward, right: cross(forward, up), up };
}
/** Half the height of the view, in mm, at the target (independent of mix). */
const halfHeight = (c: Cam): number => c.distance * Math.tan((settings.view.fovDeg * Math.PI) / 360);

/** Turn the view about the target: the scene follows the pointer. */
export const orbit = (c: Cam, dxPx: number, dyPx: number): Cam => ({
  ...c, azimuth: c.azimuth - dxPx * settings.view.orbitRadPerPx, elevation: clamp(c.elevation + dyPx * settings.view.orbitRadPerPx, -Math.PI / 2, Math.PI / 2), straight: false,
});
/** Slide the view: the scene follows the pointer. */
export function pan(c: Cam, dxPx: number, dyPx: number, heightPx: number): Cam {
  const wpp = (2 * halfHeight(c)) / heightPx;
  const { right, up } = basis(c);
  return { ...c, target: add(c.target, add(scale(right, -dxPx * wpp), scale(up, dyPx * wpp))) };
}
/**
 * Zoom by a factor (below 1 = closer). Zooming in keeps the point under the pointer where it is on the screen
 * (`nx`, `ny` are the pointer in -1..1 across the view, y up); zooming out is about the centre, so it never runs away.
 */
export function zoom(c: Cam, factor: number, nx = 0, ny = 0, aspect = 1): Cam {
  const distance = clamp(c.distance * factor, settings.view.minDistance, settings.view.maxDistance);
  const f = distance / c.distance;
  if (f >= 1 || (nx === 0 && ny === 0)) return { ...c, distance };
  const { right, up } = basis(c);
  const h = halfHeight(c);
  const point = add(scale(right, nx * h * aspect), scale(up, ny * h)); // the point at the pointer, relative to the target
  return { ...c, distance, target: add(c.target, scale(point, 1 - f)) };
}

/** Look straight at a plane: `normal` points at the eye, `u` is the plane's first axis (it runs to the right on the screen). `side` -1 looks from behind. */
export function lookStraight(c: Cam, normal: V3, u: V3, side: 1 | -1 = 1): Cam {
  const n = scale(unit(normal), side);
  const vertical = Math.abs(n[2]) > 0.9999;
  return { ...c, elevation: Math.asin(clamp(n[2], -1, 1)), azimuth: vertical ? Math.atan2(-u[0] * side, u[1] * side) : Math.atan2(n[1], n[0]), straight: true };
}
/** Which side of the plane the eye is on when looking straight at it: 1, -1, or 0 if not straight on. */
export function sideOf(c: Cam, normal: V3, tolRad = 0.02): 1 | -1 | 0 {
  const d = dot(offset(c), unit(normal));
  return d > Math.cos(tolRad) ? 1 : d < -Math.cos(tolRad) ? -1 : 0;
}
/** X, Y or Z pressed: look straight at the plane; if already looking straight from the front, from the back (and back again). */
export function lookAlternating(c: Cam, normal: V3, u: V3): Cam {
  const here = sideOf(c, normal);
  return lookStraight(c, normal, u, here === 1 ? -1 : here === -1 ? 1 : dot(offset(c), unit(normal)) >= 0 ? 1 : -1);
}

/** The two cameras blended, k from 0 to 1 (eased by the caller); angles turn the short way round, perspective goes in or out. */
export function blend(a: Cam, b: Cam, k: number): Cam {
  const lerp = (x: number, y: number) => x + (y - x) * k;
  return {
    target: [lerp(a.target[0], b.target[0]), lerp(a.target[1], b.target[1]), lerp(a.target[2], b.target[2])],
    azimuth: a.azimuth + shortest(a.azimuth, b.azimuth) * k, elevation: lerp(a.elevation, b.elevation), distance: lerp(a.distance, b.distance),
    mix: lerp(a.mix, b.mix), straight: k >= 1 ? b.straight : false,
  };
}
/** Where the perspective should be: out while straight, in otherwise. */
export const mixGoal = (c: Cam): number => (c.straight ? settings.view.minMix : 1);

// ---- game-style flying: the eye moves, the view turns about the eye ----
/** Move the eye along the view (`ahead`, `side` in view-distances per second) for `dt` seconds. */
export function walk(c: Cam, ahead: number, side: number, dt: number): Cam {
  const { forward, right } = basis(c);
  const step = scale(add(scale(forward, ahead), scale(right, side)), c.distance * dt);
  return { ...c, target: add(c.target, step) };
}
/** Turn the view about the eye by a screen movement in pixels. */
export function swivel(c: Cam, dxPx: number, dyPx: number): Cam {
  const e = eye(c);
  const azimuth = c.azimuth + dxPx * settings.view.orbitRadPerPx; // looking turns the opposite way to orbiting
  const elevation = clamp(c.elevation - dyPx * settings.view.orbitRadPerPx, -Math.PI / 2, Math.PI / 2);
  const next: Cam = { ...c, azimuth, elevation, straight: false };
  return { ...next, target: sub(e, scale(offset(next), eyeDistance(next))) };
}

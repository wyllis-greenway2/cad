// The camera as pure maths (`dec_clean_engine_design` section 8, `dec_interaction_spec`): orbit about the model without re-centring it on screen,
// straight-on views of a plane (orthographic while looking straight), X Y Z N alternating front and back, pan, zoom, and the projection that picking needs.
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross, normalize } from "../math/vec.ts";
import type { PointerView } from "../operation/part.ts";
import { settings } from "../shared/settings.ts";

export interface Camera {
  target: Vec3;
  azimuth: number; // radians around Z
  elevation: number; // radians above the XY plane, within [-PI/2, PI/2]
  distance: number; // mm from the target
  /** True while looking straight at a plane: drawn orthographic. Any orbit clears it. */
  straight: boolean;
  /** How much perspective (1 = all, the default; 0 = none, which is looking straight): between, the eye is dollied back and the lens narrowed so that what is at the target keeps its size, so the view goes smoothly between orthographic and perspective (`in_193`) */
  mix?: number;
}
/** Below this much perspective the view is drawn orthographic (it is the same picture to the eye). */
export const ORTHO_MIX = 0.02;
export const mixOf = (c: Camera): number => (c.straight ? 0 : c.mix ?? 1);
/** How far the eye is from the target: the distance, dollied back while the lens is narrowed. */
export const eyeDistance = (c: Camera): number => { const m = mixOf(c); return m <= ORTHO_MIX ? c.distance : c.distance / m; };

const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
/** Signed shortest rotation from `from` to `to`, in (-PI, PI]. */
export function shortest(from: number, to: number): number {
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d <= -Math.PI) d += TWO_PI;
  return d;
}

export const homeCamera = (): Camera => ({ target: [0, 0, 0], azimuth: settings.view.homeAzimuth, elevation: settings.view.homeElevation, distance: settings.view.homeDistance, straight: false });

export const offsetOf = (c: Camera): Vec3 => [Math.cos(c.elevation) * Math.cos(c.azimuth), Math.cos(c.elevation) * Math.sin(c.azimuth), Math.sin(c.elevation)];
export const position = (c: Camera): Vec3 => add(c.target, scale(offsetOf(c), eyeDistance(c)));
/** The camera's own axes in the world: forward (into the screen), right and up (on the screen). */
export function basis(c: Camera): { forward: Vec3; right: Vec3; up: Vec3 } {
  const forward = scale(offsetOf(c), -1);
  const up: Vec3 = [-Math.sin(c.elevation) * Math.cos(c.azimuth), -Math.sin(c.elevation) * Math.sin(c.azimuth), Math.cos(c.elevation)];
  return { forward, right: cross(forward, up), up };
}

/**
 * The world axes a straight (orthographic) view is looking along (`normal`, the one pointing at the eye) and the one that runs across the screen (`right`); null when the view is not square on to an axis.
 * What an operation starts with, so that it works in the plane being looked at and not towards the camera (`in_244`).
 */
export function viewAxes(c: Camera): { normal: 0 | 1 | 2; right: 0 | 1 | 2 } | null {
  if (!c.straight) return null;
  const { forward, right } = basis(c);
  const big = (v: Vec3, skip = -1): 0 | 1 | 2 => { let m = -1; for (let i = 0; i < 3; i++) if (i !== skip && (m === -1 || Math.abs(v[i]!) > Math.abs(v[m]!))) m = i; return m as 0 | 1 | 2; };
  const normal = big(forward);
  if (Math.abs(forward[normal]!) < 0.99) return null;
  return { normal, right: big(right, normal) };
}

/**
 * Orbit by (dAz, dEl). With a pivot (the middle of the model in view) the camera turns about the pivot and the pivot stays exactly where it is on the screen:
 * its position in the camera's frame is kept, so there is no auto re-centring (`in_081`, `in_082`).
 */
export function orbit(c: Camera, dAz: number, dEl: number, pivot?: Vec3): Camera {
  const next: Camera = { ...c, azimuth: c.azimuth + dAz, elevation: clamp(c.elevation + dEl, -HALF_PI, HALF_PI), straight: false };
  if (!pivot) return next;
  const b0 = basis(c);
  const rel = sub(pivot, c.target);
  const [a, u, f] = [dot(rel, b0.right), dot(rel, b0.up), dot(rel, b0.forward)];
  const b1 = basis(next);
  const target = sub(pivot, add(add(scale(b1.right, a), scale(b1.up, u)), scale(b1.forward, f)));
  return { ...next, target };
}

/** Pan by a screen movement in pixels: the scene follows the pointer. */
export function pan(c: Camera, dxPx: number, dyPx: number, viewportHeightPx: number): Camera {
  const wpp = worldPerPixel(c, viewportHeightPx);
  const { right, up } = basis(c);
  return { ...c, target: add(c.target, add(scale(right, -dxPx * wpp), scale(up, dyPx * wpp))) };
}
const worldPerPixel = (c: Camera, viewportHeightPx: number): number => (2 * c.distance * Math.tan((settings.view.fovDeg * Math.PI) / 360)) / viewportHeightPx;

/** Zoom by a factor (below 1 = closer). */
export const zoom = (c: Camera, factor: number): Camera => ({ ...c, distance: clamp(c.distance * factor, settings.view.minDistance, settings.view.maxDistance) });

/** Look straight at a plane given its normal and its first axis. side = +1 from the front (along the normal), -1 from the back. */
export function lookStraight(c: Camera, normal: Vec3, u: Vec3, side: 1 | -1 = 1): Camera {
  const n = scale(normalize(normal), side);
  const elevation = Math.asin(clamp(n[2], -1, 1));
  const vertical = Math.abs(n[2]) > 0.9999;
  // looking along the Z axis, the azimuth is free: choose it so the plane's first axis runs to the right on the screen
  const azimuth = vertical ? Math.atan2(-u[0], u[1]) : Math.atan2(n[1], n[0]);
  return { ...c, azimuth, elevation, straight: true };
}
/** The side we are looking at the plane from, when looking straight at it: +1, -1, or 0 if not straight on. */
export function sideOf(c: Camera, normal: Vec3, tol = settings.view.normalToleranceRad): 1 | -1 | 0 {
  const d = dot(offsetOf(c), normalize(normal));
  if (d > Math.cos(tol)) return 1;
  if (d < -Math.cos(tol)) return -1;
  return 0;
}
/** N, X, Y, Z pressed: look straight at the plane; if already looking straight from the front, from the back (and back again). */
export function lookAlternating(c: Camera, normal: Vec3, u: Vec3): Camera {
  const here = sideOf(c, normal);
  return lookStraight(c, normal, u, here === 1 ? -1 : here === -1 ? 1 : dot(offsetOf(c), normalize(normal)) >= 0 ? 1 : -1); // (not yet straight on: from the side you are on, the one that shows the face)
}

/** The two cameras blended: k from 0 to 1 (eased by the caller). Angles turn the short way round. */
export function blend(a: Camera, b: Camera, k: number): Camera {
  const lerp = (x: number, y: number) => x + (y - x) * k;
  return {
    target: [lerp(a.target[0], b.target[0]), lerp(a.target[1], b.target[1]), lerp(a.target[2], b.target[2])],
    azimuth: a.azimuth + shortest(a.azimuth, b.azimuth) * k,
    elevation: lerp(a.elevation, b.elevation),
    distance: lerp(a.distance, b.distance),
    straight: k >= 1 ? b.straight : false,
    // going to a straight view the perspective is taken out as the camera arrives, and coming from one it is put in: no jump at either end
    ...(a.straight !== b.straight || (a.mix ?? 1) !== (b.mix ?? 1) ? { mix: Math.max(0, lerp(mixOf(a), mixOf(b))) } : b.mix !== undefined ? { mix: b.mix } : {}),
  };
}

/** Move the target and set the distance so a box of this centre and size fills the view. */
export function frame(c: Camera, centre: Vec3, radius: number): Camera {
  const d = clamp((radius * 1.2) / Math.tan((settings.view.fovDeg * Math.PI) / 360), settings.view.minDistance, settings.view.maxDistance);
  return { ...c, target: centre, distance: d };
}

/**
 * Projection for picking and drawing: world to screen pixels, and the ray under a screen pixel. `ortho` (looking straight) uses the same size at the target distance.
 */
export function projector(c: Camera, widthPx: number, heightPx: number) {
  const { forward, right, up } = basis(c);
  const eye = position(c);
  const f = 1 / Math.tan((settings.view.fovDeg * Math.PI) / 360); // screen half-height = 1 / f at depth 1
  const m = mixOf(c);
  const ortho = m <= ORTHO_MIX;
  const fe = ortho ? f : f / m; // (a narrowed lens, with the eye dollied back: what is at the target keeps its size)
  const halfH = c.distance / f; // world half-height at the target distance
  const project = (p: Vec3): [number, number] => {
    const rel = sub(p, eye);
    const [x, y, z] = [dot(rel, right), dot(rel, up), dot(rel, forward)];
    if (ortho) return [widthPx / 2 + (x / halfH) * (heightPx / 2), heightPx / 2 - (y / halfH) * (heightPx / 2)];
    const k = fe / Math.max(z, 1e-6);
    return [widthPx / 2 + x * k * (heightPx / 2), heightPx / 2 - y * k * (heightPx / 2)];
  };
  const ray = (px: number, py: number): { o: Vec3; d: Vec3 } => {
    const nx = ((px - widthPx / 2) / (heightPx / 2));
    const ny = -((py - heightPx / 2) / (heightPx / 2));
    if (ortho) return { o: add(eye, add(scale(right, nx * halfH), scale(up, ny * halfH))), d: forward };
    return { o: eye, d: normalize(add(forward, add(scale(right, nx / fe), scale(up, ny / fe)))) };
  };
  const view = (px: number, py: number): PointerView => ({ x: px, y: py, project, ray: ray(px, py), rayAt: ray, straight: c.straight || ortho });
  return { project, ray, view, eye, forward, right, up, ortho, halfH };
}

/**
 * Zoom by a factor (below 1 = closer) keeping the world point `anchor` where it is on the screen (zoom toward the cursor). Without an anchor: about the view centre.
 * The anchor's offsets from the target (right, up) scale with the new view size, and its depth offset is kept, so it does not move on screen.
 */
export function zoomAt(c: Camera, factor: number, anchor?: Vec3): Camera {
  let next = zoom(c, factor);
  if (!anchor) return next;
  if (c.straight && next.distance === c.distance) return next;
  const b = basis(c);
  const rel = sub(anchor, c.target);
  const [a, u, f] = [dot(rel, b.right), dot(rel, b.up), dot(rel, b.forward)];
  if (c.straight) {
    const k = next.distance / c.distance;
    return { ...next, target: sub(anchor, add(add(scale(b.right, a * k), scale(b.up, u * k)), scale(b.forward, f))) };
  }
  // the surface under the cursor is `c.distance + f` from the camera: its distance is multiplied by the factor, going in or out, so a zoom in and the same zoom out are one the inverse of the other (`in_200`; before, going out
  // multiplied the distance to the target, which after going in on a surface is much shorter than the surface's: the same clicks out took the view several times farther than it began)
  const depth = c.distance + f;
  if (factor < 1 && depth <= settings.view.minSurfaceMm + 1e-9) return c; // (already as close to it as it may be)
  const want = Math.max(depth * factor, settings.view.minSurfaceMm);
  // the target stands where the surface's depth leaves it: when the distance to the target is already as short as it may be (it is only the centre of the view), the target moves instead, along the view,
  // so that the surface is still brought to the depth asked for (before, the zoom did nothing there and the view stayed stuck far from the surface, `in_230`)
  const distance = clamp(want - f, settings.view.minDistance, settings.view.maxDistance);
  const fNew = want - distance;
  const k = want / depth;
  return { ...c, distance, target: sub(anchor, add(add(scale(b.right, a * k), scale(b.up, u * k)), scale(b.forward, fNew))) };
}

/** How far apart, in millimetres at the target, two parts can be on the screen and still count as touching for the offers of constraints: the snap distance in pixels on a screen of a standard height (`in_294`: a finger, or an eye, does not land closer than that). */
export const nearTolMm = (c: Camera): number => worldPerPixel(c, 800) * settings.sketch.snapPx;

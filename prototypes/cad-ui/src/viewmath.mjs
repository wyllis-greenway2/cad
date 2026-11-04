// Pure view math: no three.js, no DOM (inv_math_pure). Z-up, turntable camera.
// Camera offset from the target = dist * (cos e cos a, cos e sin a, sin e): a = azimuth around Z, e = elevation.
// "Up" on screen = d/de of that direction, which stays well defined straight above (e = PI/2).

/** Plane name -> index of its normal axis, the in-plane axes (u right, v up in the normal view), and the normal view. */
export const PLANES = {
  XY: { axis: 2, u: 0, v: 1, view: { a: -Math.PI / 2, e: Math.PI / 2 } }, // from +Z, X right, Y up
  XZ: { axis: 1, u: 0, v: 2, view: { a: -Math.PI / 2, e: 0 } }, // from -Y (front), X right, Z up
  YZ: { axis: 0, u: 1, v: 2, view: { a: 0, e: 0 } }, // from +X (right), Y right, Z up
};

const TWO_PI = Math.PI * 2;
/** Signed shortest rotation from `from` to `to`, in (-PI, PI]. */
export function shortest(from, to) {
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d <= -Math.PI) d += TWO_PI;
  return d;
}

export const cameraOffset = (a, e) => [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
export const cameraUp = (a, e) => [-Math.sin(e) * Math.cos(a), -Math.sin(e) * Math.sin(a), Math.cos(e)];

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/** Is the camera looking straight along the plane's normal, in the plane's standard orientation? */
export function isNormal(view, plane, tol) {
  const t = PLANES[plane].view;
  return Math.abs(view.e - t.e) <= tol && Math.abs(shortest(view.a, t.a)) <= tol;
}

/** A point projected onto a plane through the origin (its normal coordinate zeroed). */
export function projectOnto(plane, p) {
  const q = [...p];
  q[PLANES[plane].axis] = 0;
  return q;
}

/**
 * Nearest origin plane hit by a ray, ignoring planes seen (almost) edge-on and hits beyond maxDist.
 * Returns { plane, t, point } or null.
 */
export function pickPlane(origin, dir, { maxDist = Infinity, minCos = 0.03 } = {}) {
  let best = null;
  for (const [name, def] of Object.entries(PLANES)) {
    const dk = dir[def.axis];
    if (Math.abs(dk) < minCos) continue;
    const t = -origin[def.axis] / dk;
    if (t <= 0 || t > maxDist) continue;
    if (!best || t < best.t) best = { plane: name, t, point: origin.map((o, i) => o + t * dir[i]) };
  }
  return best;
}

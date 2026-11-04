// Pure view math: no three.js, no DOM (inv_math_pure). Z-up, turntable camera.
// Camera offset from the target = dist * (cos e cos a, cos e sin a, sin e): a = azimuth around Z, e = elevation.
// "Up" on screen = d/de of that direction, which stays well defined straight above (e = PI/2).

/** Plane name -> index of its normal axis, the in-plane axes (u right, v up in the normal view), and the normal view. */
export const PLANES = {
  XY: { axis: 2, u: 0, v: 1, offset: 0, basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], view: { a: -Math.PI / 2, e: Math.PI / 2 } }, // from +Z, X right, Y up
  XZ: { axis: 1, u: 0, v: 2, offset: 0, basis: [[1, 0, 0], [0, 0, 1], [0, -1, 0]], view: { a: -Math.PI / 2, e: 0 } }, // from -Y (front), X right, Z up
  YZ: { axis: 0, u: 1, v: 2, offset: 0, basis: [[0, 1, 0], [0, 0, 1], [1, 0, 0]], view: { a: 0, e: 0 } }, // from +X (right), Y right, Z up
};

/** Planes made from the faces of a body ("datum" planes): axis-aligned, at `offset` along the axis, with the normal pointing
 *  `sign` along it. Added with addFacePlane; looked up with planeDef (base planes and these alike). */
export const DATUMS = {};
export const planeDef = (id) => PLANES[id] ?? DATUMS[id];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const BASE_FOR_AXIS = ["YZ", "XZ", "XY"];
const BASE_SIGN = { XY: 1, XZ: -1, YZ: 1 }; // the normal of each base plane points +Z, -Y, +X
let datumCount = 0;
/**
 * The plane for a face with outward normal `sign` * axis at `offset`. If it is one of the three base planes, that one is returned;
 * the same face plane twice gives the same id. `a` is the camera azimuth to use for a horizontal face (so the view does not spin).
 * The in-plane axes are the ones the camera sees when looking straight at the face: u right, v up (never mirrored).
 */
export function addFacePlane({ axis, sign, offset }, a = 0) {
  const base = BASE_FOR_AXIS[axis];
  if (Math.abs(offset) < 1e-6 && sign === BASE_SIGN[base]) return base;
  for (const [id, d] of Object.entries(DATUMS)) if (d.axis === axis && d.sign === sign && Math.abs(d.offset - offset) < 1e-6) return id;
  const n = [0, 0, 0];
  n[axis] = sign;
  const e = axis === 2 ? sign * (Math.PI / 2) : 0;
  const az = axis === 2 ? a : Math.atan2(n[1], n[0]);
  const up = cameraUp(az, e);
  const id = `F${++datumCount}`;
  DATUMS[id] = { id, datum: true, base, axis, sign, offset, n, view: { a: az, e }, basis: [cross3(up, n), up, n] };
  return id;
}
/** [u, v, normal] unit vectors of a plane in world coordinates. */
export const basisOf = (id) => planeDef(id).basis;
/** The world-space frame of a plane (origin = where the world origin projects onto it) as numbers, for the geometry kernel. */
export function frameOf(id) {
  const d = planeDef(id);
  const origin = [0, 0, 0];
  origin[d.axis] = d.offset ?? 0;
  const [u, , n] = d.basis;
  return { origin, xDir: u.slice(), normal: n.slice() };
}

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
  const t = planeDef(plane).view;
  return Math.abs(view.e - t.e) <= tol && Math.abs(shortest(view.a, t.a)) <= tol;
}

/** A point projected onto a plane through the origin (its normal coordinate zeroed). */
export function projectOnto(plane, p) {
  const q = [...p];
  const d = planeDef(plane);
  q[d.axis] = d.offset ?? 0;
  return q;
}

/**
 * Nearest origin plane hit by a ray, ignoring planes seen (almost) edge-on and hits beyond maxDist.
 * `only` restricts the test to one plane (sketch mode: only the sketch plane exists).
 * Returns { plane, t, point } or null.
 */
export function pickPlane(origin, dir, { maxDist = Infinity, minCos = 0.03, only = null } = {}) {
  let best = null;
  const all = { ...PLANES, ...(only && DATUMS[only] ? { [only]: DATUMS[only] } : {}) }; // face planes can only be picked when asked for
  for (const [name, def] of Object.entries(all)) {
    if (only && name !== only) continue;
    const dk = dir[def.axis];
    if (Math.abs(dk) < minCos) continue;
    const t = ((def.offset ?? 0) - origin[def.axis]) / dk;
    if (t <= 0 || t > maxDist) continue;
    if (!best || t < best.t) best = { plane: name, t, point: origin.map((o, i) => o + t * dir[i]) };
  }
  return best;
}

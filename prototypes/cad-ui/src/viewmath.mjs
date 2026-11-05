// Pure view math: no three.js, no DOM (inv_math_pure). Z-up, turntable camera.
// Camera offset from the target = dist * (cos e cos a, cos e sin a, sin e): a = azimuth around Z, e = elevation.
// "Up" on screen = d/de of that direction, which stays well defined straight above (e = PI/2).

/** Plane name -> index of its normal axis, the in-plane axes (u right, v up in the normal view), and the normal view. */
export const PLANES = {
  // n = unit normal, d = n . p for points on the plane (so n * d is where the world origin projects onto it), basis = [u, v, n]
  XY: { axis: 2, u: 0, v: 1, n: [0, 0, 1], d: 0, offset: 0, basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], view: { a: -Math.PI / 2, e: Math.PI / 2 } }, // from +Z, X right, Y up
  XZ: { axis: 1, u: 0, v: 2, n: [0, -1, 0], d: 0, offset: 0, basis: [[1, 0, 0], [0, 0, 1], [0, -1, 0]], view: { a: -Math.PI / 2, e: 0 } }, // from -Y (front), X right, Z up
  YZ: { axis: 0, u: 1, v: 2, n: [1, 0, 0], d: 0, offset: 0, basis: [[0, 1, 0], [0, 0, 1], [1, 0, 0]], view: { a: 0, e: 0 } }, // from +X (right), Y right, Z up
};

/** Planes made from the faces of a body ("datum" planes): any orientation. Added with addFacePlane; looked up with planeDef (base
 *  planes and these alike). `base` is the base plane whose sheet is used to show it (the one it is closest to). */
export const DATUMS = {};
export const planeDef = (id) => PLANES[id] ?? DATUMS[id];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const BASE_FOR_AXIS = ["YZ", "XZ", "XY"];
let datumCount = 0;
/**
 * The plane for a face with outward unit normal `n` on the plane n . p = d. A face may also be given as { axis, sign, offset }
 * (an axis-aligned one). If it is one of the three base planes, that one is returned; the same face plane twice gives the same id.
 * `a` is the camera azimuth to use for a horizontal face (so the view does not spin). The in-plane axes are the ones the camera sees
 * when looking straight at the face: u right, v up (never mirrored), so a tilted face works the same as an axis-aligned one.
 */
export function addFacePlane(face, a = 0) {
  let n;
  let d;
  if (face.n) {
    const l = Math.hypot(...face.n);
    n = face.n.map((v) => v / l);
    d = face.d;
  } else {
    n = [0, 0, 0];
    n[face.axis] = face.sign;
    d = face.sign * face.offset;
  }
  for (const [id, p] of Object.entries(PLANES)) if (dot3(p.n, n) > 1 - 1e-9 && Math.abs(p.d - d) < 1e-6) return id;
  for (const [id, p] of Object.entries(DATUMS)) if (dot3(p.n, n) > 1 - 1e-9 && Math.abs(p.d - d) < 1e-6) return id;
  const axis = n.reduce((best, v, i) => (Math.abs(v) > Math.abs(n[best]) ? i : best), 0);
  const e = Math.asin(Math.max(-1, Math.min(1, n[2])));
  const az = Math.abs(n[2]) > 1 - 1e-9 ? a : Math.atan2(n[1], n[0]); // straight up or down: keep the current heading
  const up = cameraUp(az, e);
  const id = `F${++datumCount}`;
  DATUMS[id] = { id, datum: true, base: BASE_FOR_AXIS[axis], axis, n, d, offset: d * n[axis], view: { a: az, e }, basis: [cross3(up, n), up, n] };
  return id;
}
/** [u, v, normal] unit vectors of a plane in world coordinates. */
export const basisOf = (id) => planeDef(id).basis;
/** Where the world origin projects onto a plane. */
export const planeOrigin = (id) => {
  const { n, d } = planeDef(id);
  return n.map((v) => v * d);
};
/** The world-space frame of a plane (origin = where the world origin projects onto it) as numbers, for the geometry kernel. */
export function frameOf(id) {
  const [u, , n] = planeDef(id).basis;
  return { origin: planeOrigin(id), xDir: u.slice(), normal: n.slice() };
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

/** The same plane seen from its other side (the camera turned half way round, so the plane's u axis runs the other way on screen). */
export const flippedView = (t) => ({ a: t.a + Math.PI, e: -t.e });
/** Which side of the plane is the camera looking at it from, straight on? +1 = the standard front side (along the normal), -1 = the back, 0 = neither. */
export function normalSide(view, plane, tol) {
  const t = planeDef(plane).view;
  if (Math.abs(view.e - t.e) <= tol && Math.abs(shortest(view.a, t.a)) <= tol) return 1;
  const f = flippedView(t);
  return Math.abs(view.e - f.e) <= tol && Math.abs(shortest(view.a, f.a)) <= tol ? -1 : 0;
}
/** Is the camera looking straight along the plane's normal, from either side? */
export const isNormal = (view, plane, tol) => normalSide(view, plane, tol) !== 0;

/** A point projected onto a plane (any orientation). */
export function projectOnto(plane, p) {
  const { n, d } = planeDef(plane);
  const k = dot3(n, p) - d;
  return p.map((v, i) => v - k * n[i]);
}

/**
 * Nearest origin plane hit by a ray, ignoring planes seen (almost) edge-on and hits beyond maxDist.
 * `only` restricts the test to one plane (sketch mode: only the sketch plane exists).
 * Returns { plane, t, point } or null.
 */
export function pickPlane(origin, dir, { maxDist = Infinity, minCos = 0.03, only = null, within = null } = {}) {
  let best = null;
  const all = { ...PLANES, ...(only && DATUMS[only] ? { [only]: DATUMS[only] } : {}) }; // face planes can only be picked when asked for
  for (const [name, def] of Object.entries(all)) {
    if (only && name !== only) continue;
    const dk = dot3(def.n, dir);
    if (Math.abs(dk) < minCos) continue;
    const t = (def.d - dot3(def.n, origin)) / dk;
    if (t <= 0 || t > maxDist) continue;
    const point = origin.map((o, i) => o + t * dir[i]);
    if (within && !within(name, point)) continue; // e.g. only the small panes count, not the whole infinite plane
    if (!best || t < best.t) best = { plane: name, t, point };
  }
  return best;
}

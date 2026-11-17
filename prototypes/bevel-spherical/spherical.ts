// The spherical involute tooth of a straight bevel gear (a prototype, `in_764`; nothing in `app/src` imports it). The exact conjugate tooth of a straight bevel gear is a cone through the apex whose section by a sphere about the apex
// is a spherical involute: the curve a great circle traces rolling on the base circle (the base cone has half angle gb, sin gb = sin(delta) cos(alpha)). The octoid of the generated gears (the envelope of the flat flank of a crown rack,
// ANSI/AGMA 2005 and ISO 23509 name it) is close to it: the literature says the octoid is a little thicker at the root and thinner at the toe (see the README for the sources). Nothing here is read from a standard: it is derived.
//
// Derivation (checked by the test, not taken from a source): the normal of the curve at a point is the great circle through it tangent to the base circle, and a great circle (a plane through the apex) is tangent to the base cone when its
// normal makes the angle 90 degrees - gb with the axis. The tangent of the curve is that plane's normal, so its component along the axis is constant, sin gb. With P = (sin t cos f, sin t sin f, cos t), t the angle from the axis
// (the spherical radius) and f the azimuth, |dP|^2 = dt^2 + sin^2 t df^2 and dP_z = -sin t dt, so  sin^2 t dt^2 = sin^2 gb (dt^2 + sin^2 t df^2),  df/dt = sqrt(sin^2 t - sin^2 gb) / (sin gb sin t).  f(t) is its integral from t = gb.
import type { BevelSpec } from "../bevel-pair/bevel.ts";
import { bevelOf } from "../bevel-pair/bevel.ts";

/** the azimuth of the spherical involute at the angle `t` from the axis, from the base cone `gb` (radians), by Simpson's rule */
export function involuteAzimuth(t: number, gb: number): number {
  if (t <= gb) return 0;
  const sg = Math.sin(gb);
  const f = (u: number) => Math.sqrt(Math.max(0, Math.sin(u) ** 2 - sg * sg)) / (sg * Math.sin(u));
  // the integrand has a square root start at gb: substitute u = gb + (t - gb) s^2 (so du = 2 (t - gb) s ds) to take the singularity off the end
  const n = 400, w = t - gb;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const s = i / n, u = gb + w * s * s;
    const c = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    sum += c * f(u) * 2 * w * s;
  }
  return sum / (3 * n);
}

/** The outline of the big end as the pitch plane's section (r = R cos(delta) tan(t)) of the cone over the spherical involute tooth: polar points (radius, angle), counter-clockwise, the first tooth centred on angle 0; like `bevelSection` of the Tredgold prototype. */
export function sphericalSection(sp: BevelSpec, perFlank = 10, turn = 0): [number, number][] {
  const b = bevelOf(sp);
  const { delta, coneDistance: R } = b;
  const alpha = ((sp.pressure ?? 20) * Math.PI) / 180, z = sp.z, Rcd = R * Math.cos(delta);
  const gb = Math.asin(Math.sin(delta) * Math.cos(alpha));
  const tTip = delta + Math.atan(b.addendum / R), tRoot = delta - Math.atan(b.dedendum / R);
  const half0 = (sp.module * (Math.PI / 2 + (sp.xt ?? 0))) / (2 * R * Math.sin(delta)); // (half the tooth's azimuth at the pitch cone: the arc m (pi / 2 + xt) over the pitch radius R sin(delta) = m z / 2; xt a change of the thickness, as the Tredgold prototype has it)
  const f0 = involuteAzimuth(delta, gb);
  const halfAt = (t: number) => half0 + f0 - involuteAzimuth(t, gb);
  const pitch = (2 * Math.PI) / z;
  const lo = Math.max(gb, tRoot);
  const to = (t: number, phi: number): [number, number] => [Rcd * Math.tan(t), phi];
  const pts: [number, number][] = [];
  for (let k = 0; k < z; k++) {
    const c = k * pitch;
    const flank = (side: 1 | -1) => Array.from({ length: perFlank + 1 }, (_, i) => { const t = lo + ((tTip - lo) * i) / perFlank; return to(t, c + side * halfAt(t)); });
    const right = flank(-1), left = flank(1);
    if (tRoot < gb) pts.push(to(tRoot, c - halfAt(gb))); // (below the base cone the flank is radial)
    pts.push(...right, ...left.reverse());
    if (tRoot < gb) pts.push(to(tRoot, c + halfAt(gb)));
    pts.push(to(tRoot, c + pitch / 2));
  }
  return pts.map(([r, th]) => [r, th + turn]);
}

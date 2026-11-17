// A face-milled spiral bevel tooth by the gearing law (a prototype, `in_768`; nothing in `app/src` imports it). Derived from H. J. Stadtfeld, "Gear Mathematics for Bevel & Hypoid Gears", Chapter 2 (Gear Technology, August 2015: a vector
// model of the generating gear, the cutter head and the ratio of roll; file `chapter2.pdf`, `in_768`) and R. L. Huston and J. J. Coy (NASA TM 82622, 1981): the generating gear (a crown gear) has circular-arc teeth, the work gear is the
// envelope of the crown's tooth flanks as the crown rolls with it about axes through a common apex; the two members of a set generated from one crown tooth are conjugate.
//
// The model, in the generating gear's frame (the crown's pitch plane is x-z, its axis y, the apex the origin, the mean point M = (0, 0, RM) on the z axis):
//  - The cutter's axis is parallel to y through C = M - RW (cos b, 0, -sin b)... i.e. C = (RW cos b, 0, RM - RW sin b) for a right hand member (x mirrored for the left hand one): the tooth centre line at M is the circle of radius RW about C, and its
//    tangent makes the spiral angle `b` with the radial line z (Stadtfeld eq. 33 to 37: EX = RM - RW with RW = RW {-cos b, 0, sin b}: C = {65.99, 0, 48.24} for the chapter's example).
//  - The crown tooth is the band between two cones about the cutter axis: at the height y above the pitch plane the radius of the one flank is r_A(y) = RW - tB/4 - y tan(a), of the other r_B(y) = RW + tB/4 + y tan(a), tB the normal circular pitch
//    (pi mn), a the blade angle (pressure angle): the band is tB/2 wide at the pitch plane, narrower toward the tip (y < 0), wider toward the root of a work gear on the other side (y > 0). (Stadtfeld eq. 27 to 30: the blade tip radii RCOW1..4
//    are these radii at the depth of the blade tip, hF1 and hF2.)
//  - The work gear's axis a makes the angle 90 degrees + gamma (its pitch angle) with the crown's: a = (0, -sin g, cos g); the ratio of roll is sin(g) (UDIF, eq. 44 and 53): crown angle = -sin(g) x work angle.
//  - The gearing law (the relative velocity of the two surfaces at the contact has no part along the normal): the relative motion is a rotation about the contact line z of cos(g) per unit of the work gear's angle, so  (P' x n')_z = 0 for the crown's
//    point P' and normal n' turned by psi about y; with P = (x, y, z), n = (nx, ny, nz):  tan(psi) = -(x ny - y nx) / (z ny - y nz). The point is then in the work gear's frame turned back by psi / sin(g) about a.
// What is NOT here: the root fillets and the tooth's ends, crowning, a hypoid offset (the next steps).
export type V3 = [number, number, number];

export interface CrownSpec {
  /** the mean cone distance, the cutter radius and the mean spiral angle (radians) */ RM: number; RW: number; beta: number;
  /** the normal circular pitch pi mn and the blade (pressure) angle, radians */ tB: number; alpha: number;
  /** the work gear's pitch angle, radians */ gamma: number;
  /** +1 for a right hand crown (the example's ring gear), -1 for a left hand one (its pinion) */ hand?: 1 | -1;
}
/** the centre of the cutter in the crown's frame */
export const cutterCentre = (c: CrownSpec): V3 => [(c.hand ?? 1) * c.RW * Math.cos(c.beta), 0, c.RM - c.RW * Math.sin(c.beta)];
/** the radius of the flank `f` ("A" the inside one, "B" the outside) at the height y above the pitch plane */
export const flankRadius = (c: CrownSpec, f: "A" | "B", y: number): number => (f === "A" ? c.RW - c.tB / 4 - y * Math.tan(c.alpha) : c.RW + c.tB / 4 + y * Math.tan(c.alpha));
/** a point of the flank and its normal at the angle `th` round the cutter axis and the height y */
export function flankPoint(c: CrownSpec, f: "A" | "B", th: number, y: number): { p: V3; n: V3 } {
  const C = cutterCentre(c), r = flankRadius(c, f, y), t = Math.tan(c.alpha);
  const dr = f === "A" ? -t : t; // (dr / dy)
  const [ct, st] = [Math.cos(th), Math.sin(th)];
  return { p: [C[0] + r * ct, y, C[2] + r * st], n: [ct, -dr, st] }; // (the gradient of  rho_c - r(y))
}
const rotY = (p: V3, a: number): V3 => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
const rotAxis = (p: V3, ax: V3, a: number): V3 => { // (Rodrigues)
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const d = ax[0] * p[0] + ax[1] * p[1] + ax[2] * p[2];
  const cr: V3 = [ax[1] * p[2] - ax[2] * p[1], ax[2] * p[0] - ax[0] * p[2], ax[0] * p[1] - ax[1] * p[0]];
  return [p[0] * c + cr[0] * s + ax[0] * d * (1 - c), p[1] * c + cr[1] * s + ax[1] * d * (1 - c), p[2] * c + cr[2] * s + ax[2] * d * (1 - c)];
};
/** the crown's roll angle at which the point is in contact (the nearest to 0 of the two that satisfy the gearing law) */
export function rollAngle(p: V3, n: V3): number {
  const [x, y, z] = p, [nx, ny, nz] = n;
  return Math.atan(-(x * ny - y * nx) / (z * ny - y * nz));
}
/** the point of the work gear's flank that the crown's point generates, in the frame in which the work gear's axis is z, its apex the origin, and the crown's axis tilted by 90 degrees + gamma (the frame of the crown turned so that a is z) */
export function workPoint(c: CrownSpec, p: V3, n: V3): { p: V3; psi: number } {
  const psi = rollAngle(p, n);
  const a: V3 = [0, -Math.sin(c.gamma), Math.cos(c.gamma)];
  const q = rotAxis(rotY(p, psi), a, psi / Math.sin(c.gamma)); // (turned back by the work gear's own turn: -psi_w = psi / sin g)
  const [xw, yw]: [V3, V3] = [[1, 0, 0], [0, a[2], -a[1]]]; // (the work frame: x as the crown's, z = a, y = a x x)
  return { p: [q[0] * xw[0] + q[1] * xw[1] + q[2] * xw[2], q[0] * yw[0] + q[1] * yw[1] + q[2] * yw[2], q[0] * a[0] + q[1] * a[1] + q[2] * a[2]], psi };
}

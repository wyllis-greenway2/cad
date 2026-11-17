// A straight crown gear and the straight bevel pinion that meshes with it (a prototype, `dec_crown_gears`, `in_800`; nothing in `app/src` imports it).
// The crown gear is the pitch angle of 90 degrees: a flat annulus whose teeth stand from its face, straight and radial, each flank a plane through the radial line where the flank meets the pitch plane, leaning by the pressure angle: at the height `y`
// (the pitch plane at 0, the teeth's tips towards -y, the pinion's side) the flank is moved sideways by `-y tan(alpha)` towards the middle of the tooth, a distance that does not grow with the radius, so the tooth is thinnest at its inner end.
// The pinion is the envelope of the crown's flanks by the gearing law (`prototypes/bevel-spiral-generated/generate.ts`: the crown's axis y, the pinion's axis at 90 degrees + its pitch angle, the ratio of roll sin(g) = z1 / zc), as the spiral bevel's pinion is.
import type { V3 } from "../bevel-spiral-generated/generate.ts";
import type { Gear } from "../bevel-spiral-generated/sections.ts";

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rot = (p: V3, ax: V3, a: number): V3 => { const [c, s] = [Math.cos(a), Math.sin(a)], d = dot(ax, p), cr = cross(ax, p); return [p[0] * c + cr[0] * s + ax[0] * d * (1 - c), p[1] * c + cr[1] * s + ax[1] * d * (1 - c), p[2] * c + cr[2] * s + ax[2] * d * (1 - c)]; };

export interface CrownSpec { /** the crown's teeth */ zc: number; /** the pinion's teeth */ z1: number; module: number; alpha: number; /** the pinion's addendum and dedendum factors (1 and 1.25 of the module) */ kK?: number; kF?: number; /** the crown's inner and outer radius */ rIn: number; rOut: number; /** slot widening on each side for the pinion (backlash), mm */ bl?: number }
export interface CrownPair { spec: CrownSpec; pinion: Gear; /** the angle of the half tooth at the pitch plane */ halfAngle: number }
export function crownPair(sp: CrownSpec): CrownPair {
  const g1 = Math.asin(sp.z1 / sp.zc);
  const [kK, kF] = [sp.kK ?? 1, sp.kF ?? 1.25];
  return { spec: sp, halfAngle: Math.PI / (2 * sp.zc), pinion: { axis: [0, -Math.sin(g1), Math.cos(g1)], gamma: g1, z: sp.z1, hK: kK * sp.module, hF: kF * sp.module } };
}
/**
 * The flank of the crown tooth at the contact line (the tooth centred on the z axis of the pair's frame): `side` +1 towards +x, -1 towards -x; the point at the radius s along the flank's radial line and the height y, and the normal out of the tooth.
 * The flank's radial line in the pitch plane is e (at the angle `halfAngle` from z towards x), t the way along the pitch plane away from the tooth's middle; at the height y the flank is moved by y tan(alpha) along t (towards the middle for y < 0).
 * The tooth is where  lateral <= y tan(alpha)  (lateral along t from the radial line), so the normal out of it is  cos(alpha) t - sin(alpha) y_hat.
 */
export function crownFlank(cp: CrownPair, side: 1 | -1, s: number, y: number, widen = 0): { p: V3; n: V3 } {
  const [phi, al] = [cp.halfAngle, cp.spec.alpha];
  const e: V3 = [Math.sin(phi), 0, Math.cos(phi)], t: V3 = [Math.cos(phi), 0, -Math.sin(phi)];
  const n: V3 = [Math.cos(al) * t[0], -Math.sin(al), Math.cos(al) * t[2]];
  const p: V3 = [s * e[0] + y * Math.tan(al) * t[0] + widen * n[0], y + widen * n[1], s * e[2] + y * Math.tan(al) * t[2] + widen * n[2]];
  return side === 1 ? { p, n } : { p: [-p[0], p[1], p[2]], n: [-n[0], n[1], n[2]] };
}
/** the polar position (radius, angle from the z axis towards x) of the flank at the height y and the radius r of the crown: for a section of the crown across its axis */
export function flankAngle(cp: CrownPair, y: number, r: number): number { return cp.halfAngle + Math.asin(Math.max(-1, Math.min(1, (y * Math.tan(cp.spec.alpha)) / r))); }

const rotY = (v: V3, psi: number): V3 => [v[0] * Math.cos(psi) + v[2] * Math.sin(psi), v[1], -v[0] * Math.sin(psi) + v[2] * Math.cos(psi)];
/** the pinion's point that the crown's flank point generates, in the pair's frame at the meshing place */
export function pinionPoint(cp: CrownPair, side: 1 | -1, s: number, y: number): { p: V3; n: V3 } {
  const { p, n } = crownFlank(cp, side, s, y, cp.spec.bl ?? 0);
  const [x, yy, z] = p, [nx, ny, nz] = n;
  const psi = Math.atan(-(x * ny - yy * nx) / (z * ny - yy * nz));
  const back = (v: V3): V3 => rot(rotY(v, psi), cp.pinion.axis, psi / Math.sin(cp.pinion.gamma));
  return { p: back(p), n: back(n) };
}
export interface Grid { P: V3[][] }
/** the pinion's flank surface from one flank of the crown, on a grid over the radius and the height */
export function pinionGrid(cp: CrownPair, side: 1 | -1, ns = 120, ny = 80): Grid {
  const { rIn, rOut } = cp.spec, g = cp.pinion;
  const [s0, s1, y0, y1] = [rIn - 8, rOut + 8, -g.hF - 3, g.hK + 3];
  const P: V3[][] = [];
  for (let i = 0; i <= ns; i++) { const row: V3[] = []; for (let j = 0; j <= ny; j++) row.push(pinionPoint(cp, side, s0 + ((s1 - s0) * i) / ns, y0 + ((y1 - y0) * j) / ny).p); P.push(row); }
  return { P };
}

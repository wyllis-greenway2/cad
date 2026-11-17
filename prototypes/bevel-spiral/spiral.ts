// A circular-cut spiral bevel tooth as a twisted straight bevel tooth (a prototype, `in_766`; nothing in `app/src` imports it).
// The tooth's lengthwise centre line is a circular arc (the cutter's radius `rc`) whose spiral angle (the angle between it and the cone's generator) is `bm` at the mean cone distance `Rm` and, at the cone distance `r`,
//   sin b(r) = (2 Rm rc sin bm - Rm^2 + r^2) / (2 r rc)                      (the formula of the Gear Technology Ask the Expert on backlash, Sept / Oct 2017, p. 82, `in_734`, for the outer end Re)
// Developing the pitch cone into a plane, the arc keeps its angle: with psi the developed angle round the apex, r dpsi = tan b dr, so  psi(r) = integral from Rm of tan b(r) / r dr; on the cone the azimuth about the axis is psi / sin(delta)
// (the cone of half angle delta unrolls into a sector of angle 2 pi sin(delta)). The tooth at the cone distance `r` is then the straight bevel tooth's section there (the outline scaled by r / R toward the apex), turned about the axis by
// `hand * psi(r) / sin(delta)`; a mating pair has opposite hands and the same developed spiral, so the same `psi(r)`. This is the shape of the tooth, no more: it is NOT the tooth a spiral bevel generator cuts (the octoid with the lengthwise
// curve and the crowning of ISO 23509 / AGMA 2005 and the machine's settings); no source for those was read (`q_spiral_hypoid_gears`).
import type { BevelSpec } from "../bevel-pair/bevel.ts";
import { bevelOf, bevelSection } from "../bevel-pair/bevel.ts";

export interface SpiralSpec extends BevelSpec { /** mean spiral angle, degrees (35 is usual) */ spiral?: number; /** the cutter radius as a multiple of the mean cone distance (0.9 if none: the Gear Technology example has it a little under it) */ cutter?: number; /** +1 or -1: which way the tooth turns as it goes in towards the apex */ hand?: 1 | -1 }

/** the spiral angle at the cone distance r (radians) */
export function spiralAngle(r: number, Rm: number, rc: number, bm: number): number {
  const s = (2 * Rm * rc * Math.sin(bm) - Rm * Rm + r * r) / (2 * r * rc);
  return Math.asin(Math.max(-1, Math.min(1, s)));
}
/** the developed angle psi(r) from the mean cone distance, radians (Simpson) */
export function developedAngle(r: number, Rm: number, rc: number, bm: number): number {
  const n = 200, h = (r - Rm) / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) { const x = Rm + i * h; const c = i === 0 || i === n ? 1 : i % 2 ? 4 : 2; sum += c * Math.tan(spiralAngle(x, Rm, rc, bm)) / x; }
  return (sum * h) / 3;
}
/** the section of the spiral tooth at the cone distance r: the straight tooth's outline scaled to it and turned; polar points (radius, angle) in the plane across the axis at r cos(delta) */
export function spiralSection(sp: SpiralSpec, r: number, perFlank = 6): [number, number][] {
  const b = bevelOf(sp);
  const Rm = b.coneDistance - b.face / 2, rc = (sp.cutter ?? 0.9) * Rm, bm = ((sp.spiral ?? 35) * Math.PI) / 180;
  const turn = ((sp.hand ?? 1) * developedAngle(r, Rm, rc, bm)) / Math.sin(b.delta);
  return bevelSection(sp, perFlank, turn).map(([rr, th]) => [(rr * r) / b.coneDistance, th]);
}

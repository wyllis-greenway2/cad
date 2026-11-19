// A crown (face) gear (`dec_crown_gears`, `in_802`): the bevel gear whose pitch angle is 90 degrees, a flat wheel with straight radial teeth standing on its face. It is a bevel gear record (`BevelSpec`) whose pitch angle comes out as a right
// angle (the teeth of the pinion it meshes with, `mate`, and the angle between the shafts, 90 degrees plus the pinion's pitch angle, fix that: `crownShaft`), so the bevel gear's mesh, link and placing are its own; only its body differs, as there is no cone to cut.
// The tooth is the one `prototypes/crown-gear` measured to fit a straight bevel pinion (about 1 mm3 of overlap at its place, over 100 half a pitch round): its flanks are planes through the radial lines at half the tooth's angle, leaning by the
// pressure angle, so that the tooth is narrower by `h tan(alpha)` at the height `h` above the pitch plane at every radius (thinnest at the inner end). The proportions are those of the pinion `prototypes/crown-gear` measured against (addendum `m`, dedendum `1.25 m`, which `bevelOf` gives a pinion whose mate is a crown gear): the crown's tip is `m` above the pitch plane (a quarter module of clearance over the pinion's root), its root `1.25 m` below it (the same over the pinion's tip), the plate a thickness below that. (Straight flank planes through the radial lines make the gap narrower the deeper it goes, so a deeper root closes it at the inner end.)
import { END_REACH, shortestFor } from "./blankchamfer.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { GearSpec } from "./gear.ts";
import { isCrown } from "./bevel.ts";
import { SPIRAL } from "./spiral.ts";
import { bulgeOf } from "./arcs.ts";
import type { P } from "./arcs.ts";

/** The angle between the shafts (degrees) of a crown gear of `z` teeth and the pinion of `mate` teeth it meshes with: 90 degrees plus the pinion's pitch angle (sin = mate / z). */
export const crownShaft = (z: number, mate: number): number => 90 + (Math.asin(Math.min(1, mate / z)) * 180) / Math.PI;

/** the face width of a crown gear as a fraction of its pitch radius if none is given (the teeth are thinnest at the inner end, so a third would make them pointed) */
export const CROWN_FACE = 0.15;
export interface CrownGeometry {
  /** the pitch radius (and the cone distance of the pair), mm */ R: number;
  inner: number; outer: number;
  /** the tooth's height above the pitch plane and the root's depth below it, mm */ tip: number; root: number;
  /** the plate's thickness below the root, mm */ thick: number;
  /** half the tooth's angle at the pitch plane, radians */ half: number;
  alpha: number;
  /** a spiral crown gear (`dec_spiral_crown`): the mean spiral angle (radians), the cutter radius and the cutter's centre (x, y of the gear's plane) that make its teeth the bands between two cones about the cutter's axis */ spiral?: { beta: number; RW: number; C: [number, number] };
}
/** The numbers of a crown gear, or why there is none: the pinion needs enough virtual teeth not to be undercut, the teeth must not come to a point at the inner end, the gaps not close at the root. */
export function crownOf(spec: GearSpec): Result<CrownGeometry> {
  const b = spec.bevel;
  if (!b || !isCrown(spec)) return err("not a crown gear");
  const z = Math.round(spec.teeth), mate = Math.round(b.mate), m = spec.module;
  if (!(z >= 12 && z <= 200)) return err("a crown gear needs 12 to 200 teeth");
  if (!(mate >= 6 && mate < z)) return err("the pinion needs 6 or more teeth and fewer than the crown gear's");
  if (!(m > 0)) return err("the module must be above zero");
  const alpha = ((spec.pressure ?? 20) * Math.PI) / 180;
  if (!(alpha > 0 && alpha < (35 * Math.PI) / 180)) return err("the pressure angle must be between 0 and 35 degrees");
  const g1 = Math.asin(mate / z), zv = mate / Math.cos(g1);
  if (b.spiral === undefined && zv < 2 / Math.sin(alpha) ** 2) return err(`the pinion's ${mate} teeth are undercut against a crown gear of ${z} (its virtual tooth count ${zv.toFixed(1)} is under ${(2 / Math.sin(alpha) ** 2).toFixed(1)}): more pinion teeth or a smaller crown gear`);
  const beta = b.spiral === undefined ? 0 : (b.spiral * Math.PI) / 180;
  if (b.spiral !== undefined) { // a spiral crown gear (`dec_spiral_crown`): the spiral pinion's limits, a 20 degree pressure angle
    if ((spec.pressure ?? 20) !== 20) return err("a spiral crown gear is made for a pressure angle of 20 degrees only");
    if ((b.offset ?? 0) > 0) return err("a spiral crown gear has no hypoid offset");
    if (!(b.spiral >= SPIRAL.minAngle && b.spiral <= SPIRAL.maxAngle)) return err(`the spiral angle must be from ${SPIRAL.minAngle} to ${SPIRAL.maxAngle} degrees`);
    if (mate < SPIRAL.minPinion) return err(`the pinion of a spiral crown gear needs ${SPIRAL.minPinion} or more teeth`);
    if (z + mate > SPIRAL.maxTotal) return err(`a spiral pair is made for ${SPIRAL.maxTotal} teeth at most between the two gears: ${z} and ${mate} make ${z + mate}`);
    if (z / mate > SPIRAL.maxCrownRatio) return err(`a spiral crown gear has at most ${SPIRAL.maxCrownRatio} times its pinion's teeth: ${Math.ceil(z / SPIRAL.maxCrownRatio)} or more teeth for this pinion`);
  }
  const R = (m * z) / 2 / Math.cos(beta); // (the pitch radius at the middle of the face: with a spiral the module is the normal one there)
  const face = b.face ?? CROWN_FACE;
  const inner = spec.crown?.inner ?? R * (1 - face), outer = spec.crown?.outer ?? R;
  if (!(inner > 0.3 * R && outer > inner + m && outer <= 1.4 * R)) return err(`the inner radius must be from ${(0.3 * R).toFixed(1)} mm to under the outer one, which is at most ${(1.4 * R).toFixed(1)} mm (the pitch radius is ${R.toFixed(1)})`);
  const thick = spec.width && spec.width > 0 ? spec.width : 2 * m;
  const RW = SPIRAL.cutter * R;
  const g: CrownGeometry = { R, inner, outer, tip: m, root: 1.25 * m, thick, half: Math.PI / (2 * z) - (spec.backlash ?? 0) / (2 * R), alpha, ...(b.spiral !== undefined ? { spiral: { beta, RW, C: [RW * Math.cos(beta), R - RW * Math.sin(beta)] as [number, number] } } : {}) };
  if ((spec.bore ?? 0) / 2 > inner - m) return err("the bore must be inside the inner radius of the teeth");
  if (!((spec.chamfer ?? 0) >= 0 && (spec.chamfer ?? 0) <= 1)) return err("the chamfer is from 0 to 1 module deep");
  if ((spec.chamfer ?? 0) > 0 && !(outer - inner >= shortestFor((spec.chamfer ?? 0) * m, m))) return err(`the chamfer is too deep for teeth ${(outer - inner).toFixed(1)} mm long: at most ${Math.max(0, (outer - inner - 0.1 * m) / 2 - 0.25 * m).toFixed(1)} mm`);
  if (!(thick >= 0.5 * m)) return err("the plate must be at least half a module thick");
  if (!g.spiral && !(2 * inner * Math.sin(flankAngle(g, g.tip, inner)) >= 0.2 * m)) return err("the teeth come to a point at their inner end: a larger inner radius, fewer teeth or a smaller pressure angle");
  if (!g.spiral && !(flankAngle(g, -g.root, inner) < (Math.PI / z) * 0.98)) return err("the gaps close at the root of the inner end: a larger inner radius or a smaller pressure angle");
  return ok(g);
}
/** Half the tooth's angle at height `h` above the pitch plane (the tip is up) and radius `r`: the flank's lateral offset is `h tan(alpha)` less than at the pitch plane at every radius. */
export { isCrown };
/** how far inside the inner radius the loft's outline goes (mm) */
const INSET = 0.4;
const flankAngle = (g: CrownGeometry, h: number, r: number): number => g.half - Math.asin((h * Math.tan(g.alpha)) / r);
/** The outline of the whole wheel in the plane at height `h`: corners (x, y) and the bulge of each side, counter-clockwise, tooth 0 centred on +x. Each tooth is its two flanks, the arc across its tip at the outer radius and the arc of the gap at the inner one. */
export function crownSection(spec: GearSpec, g: CrownGeometry, h: number): { points: P[]; bulges: number[] } {
  if (g.spiral) return spiralCrownSection(spec, g, h);
  const ri = g.inner - INSET; // (the loft goes a little inside the inner radius, where the blank cuts it: surfaces that coincide would not be cut cleanly)
  const ro = g.outer + ((spec.chamfer ?? 0) > 0 ? END_REACH : 0); // (and with a chamfer a little beyond the outer radius too, `dec_bevel_chamfer`)
  const z = Math.round(spec.teeth), pitch = (2 * Math.PI) / z;
  const [a0, a1] = [flankAngle(g, h, ri), flankAngle(g, h, ro)];
  const at = (r: number, th: number): P => [r * Math.cos(th), r * Math.sin(th)];
  const points: P[] = [], bulges: number[] = [];
  for (let k = 0; k < z; k++) {
    const c = k * pitch;
    const [i0, o0, o1, i1] = [at(ri, c - a0), at(ro, c - a1), at(ro, c + a1), at(ri, c + a0)];
    points.push(i0, o0, o1, i1);
    bulges.push(0, bulgeOf(o0, at(ro, c), o1), 0, bulgeOf(i1, at(ri, c + pitch / 2), at(ri, c + pitch - a0)));
  }
  return { points, bulges };
}

/**
 * The outline of a spiral crown gear in the plane at height `h` above the pitch plane (`dec_spiral_crown`): each tooth is the band between two cones about the cutter's axis (the generating crown of `spiral.ts`: its flanks are the cones of radius
 * RW -+ (pi m / 4 - h tan alpha) about the cutter's centre, so the band narrows towards the tip), cut off by the circles of the inner and the outer radius: four arcs, two about the cutter's centre and two about the gear's. Tooth 0 passes the contact line (the
 * pair's mean point at azimuth 90 degrees, as the spiral ring gear's does); the rest are it turned by a pitch each.
 */
function spiralCrownSection(spec: GearSpec, g: CrownGeometry, h: number): { points: P[]; bulges: number[] } {
  const sp = g.spiral!, z = Math.round(spec.teeth), pitch = (2 * Math.PI) / z;
  const q = (Math.PI * spec.module) / 4, t = Math.tan(g.alpha);
  const [rA, rB] = [sp.RW - q + h * t, sp.RW + q - h * t];
  const ri = g.inner - INSET, ro = g.outer + ((spec.chamfer ?? 0) > 0 ? END_REACH : 0);
  const [C, d] = [sp.C, Math.hypot(sp.C[0], sp.C[1])];
  /** where the circle of radius `r` about the cutter's centre crosses the circle of radius `R` about the origin, the crossing nearest the contact line */
  const cross = (r: number, R: number): P => {
    const a = (R * R - r * r + d * d) / (2 * d), hh = Math.sqrt(Math.max(R * R - a * a, 0)), [ux, uy] = [C[0] / d, C[1] / d];
    const c: P[] = [[a * ux - hh * uy, a * uy + hh * ux], [a * ux + hh * uy, a * uy - hh * ux]];
    const near = (p: P) => Math.hypot(p[0], p[1] - R);
    return near(c[0]!) < near(c[1]!) ? c[0]! : c[1]!;
  };
  const [Ain, Aout, Bout, Bin] = [cross(rA, ri), cross(rA, ro), cross(rB, ro), cross(rB, ri)];
  const arcMid = (a: P, b: P, Q: [number, number], r: number): P => {
    const [a1, a2] = [Math.atan2(a[1] - Q[1], a[0] - Q[0]), Math.atan2(b[1] - Q[1], b[0] - Q[0])];
    const da = ((((a2 - a1 + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    return [Q[0] + r * Math.cos(a1 + da / 2), Q[1] + r * Math.sin(a1 + da / 2)];
  };
  const O: [number, number] = [0, 0];
  type Side = { to: P; c: [number, number]; r: number };
  // counter-clockwise: the order the corners come in makes a positive area; else the other way round
  const ccw: [P, Side][] = [[Ain, { to: Aout, c: C, r: rA }], [Aout, { to: Bout, c: O, r: ro }], [Bout, { to: Bin, c: C, r: rB }], [Bin, { to: Ain, c: O, r: ri }]];
  const area = ccw.reduce((s, [p, { to }]) => s + (p[0] * to[1] - to[0] * p[1]), 0);
  const loop: [P, Side][] = area > 0 ? ccw : [[Ain, { to: Bin, c: O, r: ri }], [Bin, { to: Bout, c: C, r: rB }], [Bout, { to: Aout, c: O, r: ro }], [Aout, { to: Ain, c: C, r: rA }]];
  const points: P[] = [], bulges: number[] = [];
  for (let k = 0; k < z; k++) {
    const [c, s] = [Math.cos(k * pitch), Math.sin(k * pitch)];
    const rot = (p: P): P => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
    for (const [p, { to, c: Q, r }] of loop) { points.push(rot(p)); bulges.push(bulgeOf(rot(p), rot(arcMid(p, to, Q, r)), rot(to))); }
  }
  return { points, bulges };
}


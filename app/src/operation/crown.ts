// A crown (face) gear (`dec_crown_gears`, `in_802`): the bevel gear whose pitch angle is 90 degrees, a flat wheel with straight radial teeth standing on its face. It is a bevel gear record (`BevelSpec`) whose pitch angle comes out as a right
// angle (the teeth of the pinion it meshes with, `mate`, and the angle between the shafts, 90 degrees plus the pinion's pitch angle, fix that: `crownShaft`), so the bevel gear's mesh, link and placing are its own; only its body differs, as there is no cone to cut.
// The tooth is the one `prototypes/crown-gear` measured to fit a straight bevel pinion (about 1 mm3 of overlap at its place, over 100 half a pitch round): its flanks are planes through the radial lines at half the tooth's angle, leaning by the
// pressure angle, so that the tooth is narrower by `h tan(alpha)` at the height `h` above the pitch plane at every radius (thinnest at the inner end). The proportions are those of the pinion `prototypes/crown-gear` measured against (addendum `m`, dedendum `1.25 m`, which `bevelOf` gives a pinion whose mate is a crown gear): the crown's tip is `m` above the pitch plane (a quarter module of clearance over the pinion's root), its root `1.25 m` below it (the same over the pinion's tip), the plate a thickness below that. (Straight flank planes through the radial lines make the gap narrower the deeper it goes, so a deeper root closes it at the inner end.)
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { GearSpec } from "./gear.ts";
import { isCrown } from "./bevel.ts";
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
  if (zv < 2 / Math.sin(alpha) ** 2) return err(`the pinion's ${mate} teeth are undercut against a crown gear of ${z} (its virtual tooth count ${zv.toFixed(1)} is under ${(2 / Math.sin(alpha) ** 2).toFixed(1)}): more pinion teeth or a smaller crown gear`);
  const R = (m * z) / 2;
  const face = b.face ?? CROWN_FACE;
  const inner = spec.crown?.inner ?? R * (1 - face), outer = spec.crown?.outer ?? R;
  if (!(inner > 0.3 * R && outer > inner + m && outer <= 1.4 * R)) return err(`the inner radius must be from ${(0.3 * R).toFixed(1)} mm to under the outer one, which is at most ${(1.4 * R).toFixed(1)} mm (the pitch radius is ${R.toFixed(1)})`);
  const thick = spec.width && spec.width > 0 ? spec.width : 2 * m;
  const g: CrownGeometry = { R, inner, outer, tip: m, root: 1.25 * m, thick, half: Math.PI / (2 * z) - (spec.backlash ?? 0) / (2 * R), alpha };
  if ((spec.bore ?? 0) / 2 > inner - m) return err("the bore must be inside the inner radius of the teeth");
  if (!(thick >= 0.5 * m)) return err("the plate must be at least half a module thick");
  if (!(2 * inner * Math.sin(flankAngle(g, g.tip, inner)) >= 0.2 * m)) return err("the teeth come to a point at their inner end: a larger inner radius, fewer teeth or a smaller pressure angle");
  if (!(flankAngle(g, -g.root, inner) < (Math.PI / z) * 0.98)) return err("the gaps close at the root of the inner end: a larger inner radius or a smaller pressure angle");
  return ok(g);
}
/** Half the tooth's angle at height `h` above the pitch plane (the tip is up) and radius `r`: the flank's lateral offset is `h tan(alpha)` less than at the pitch plane at every radius. */
export { isCrown };
/** how far inside the inner radius the loft's outline goes (mm) */
const INSET = 0.4;
const flankAngle = (g: CrownGeometry, h: number, r: number): number => g.half - Math.asin((h * Math.tan(g.alpha)) / r);
/** The outline of the whole wheel in the plane at height `h`: corners (x, y) and the bulge of each side, counter-clockwise, tooth 0 centred on +x. Each tooth is its two flanks, the arc across its tip at the outer radius and the arc of the gap at the inner one. */
export function crownSection(spec: GearSpec, g: CrownGeometry, h: number): { points: P[]; bulges: number[] } {
  const ri = g.inner - INSET; // (the loft goes a little inside the inner radius, where the blank cuts it: surfaces that coincide would not be cut cleanly)
  const z = Math.round(spec.teeth), pitch = (2 * Math.PI) / z;
  const [a0, a1] = [flankAngle(g, h, ri), flankAngle(g, h, g.outer)];
  const at = (r: number, th: number): P => [r * Math.cos(th), r * Math.sin(th)];
  const points: P[] = [], bulges: number[] = [];
  for (let k = 0; k < z; k++) {
    const c = k * pitch;
    const [i0, o0, o1, i1] = [at(ri, c - a0), at(g.outer, c - a1), at(g.outer, c + a1), at(ri, c + a0)];
    points.push(i0, o0, o1, i1);
    bulges.push(0, bulgeOf(o0, at(g.outer, c), o1), 0, bulgeOf(i1, at(ri, c + pitch / 2), at(ri, c + pitch - a0)));
  }
  return { points, bulges };
}

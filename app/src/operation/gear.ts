// Gear outlines (`dec_gear_tool`): the closed outline of a spur gear with involute teeth, as points on a plane and, for each side from one point to the next, how far its middle stands out
// (a bulge, the same number a drawn arc keeps, `Line.bulge`), so the outline is drawn as ordinary lines and arcs. Pure maths in the plane's own x and y, centred on the origin, tooth 0 pointing along +x
// (for an internal gear: tooth 0 is centred on +x as well). Nothing here knows how the part will be made (`prin_manufacture_agnostic`).
//
// The numbers (ISO 53, DIN 867): module m (mm per tooth of pitch diameter), tooth count z, pressure angle a. Pitch radius rp = m z / 2, base radius rb = rp cos a; the flank of a tooth is the
// involute of the base circle: at radius r its half-thickness, as an angle, is  half(r) = half(rp) + inv(a_p) - inv(a_r)  with inv(a) = tan a - a and cos a_r = rb / r.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { pulleyOutline } from "./pulley.ts";
import { sprocketOutline } from "./sprocket.ts";
import { cycloidalOutline } from "./cycloidal.ts";
import { boreProblem } from "./bore.ts";
import type { CamSpec } from "./cams.ts";
import { gearRoot } from "./gearroot.ts";
import { wormOf, wheelOf } from "./worm.ts";
import type { WormSpec, WheelSpec } from "./worm.ts";
import { bevelPoints, bevelLayout, isCrown, bevelOf } from "./bevel.ts";
import { spiralFor, spiralBody } from "./spiral.ts";
import { faceFor, faceBody, pinionWidth, FACE } from "./face.ts";
import { crownOf, crownSection } from "./crown.ts";
import type { BevelSpec } from "./bevel.ts";

/** the belts there are timing pulleys for (`pulley.ts`) */
export type PulleyKind = "2GT" | "3GT" | "HTD5M" | "HTD8M";
export interface GearSpec {
  teeth: number;
  /** mm of pitch diameter per tooth */
  module: number;
  /** degrees; 20 by default */
  pressure?: number;
  /** profile shift as a fraction of the module (external gears; 0 by default): pushes the cutter out, thickening the root, which avoids undercut with few teeth */
  shift?: number;
  /** mm of tooth thickness taken off along the pitch circle (0 by default) */
  backlash?: number;
  /** root clearance as a fraction of the module (0.25 by default) */
  clearance?: number;
  /** a ring: the outline is the hole whose teeth point in (a wall of `rim` modules round it, 2 by default, is drawn as a circle by the caller) */
  internal?: boolean;
  rim?: number;
  /** diameter of a round hole through the middle of an external gear, mm (0 or absent: none) */
  bore?: number;
  /** a helical gear (`in_598`): the helix angle at the pitch circle in degrees (above 0 a right hand helix, below 0 a left hand one, 45 at the most) and the width of the gear along its axis, mm. The module, the pressure angle, the shift,
   * the backlash and the clearance are the *normal* ones, measured square to the teeth; the outline is the transverse section (module / cos of the helix angle) that the body is then twisted from (`helixTwist`) */
  helix?: number;
  width?: number;
  /** a worm (`in_608`): `teeth` is its starts, `module` its axial module, `pressure` its axial pressure angle; the diameter and the length of its core are here */
  worm?: WormSpec;
  /** a worm wheel (`in_608`): the throated wheel for a worm of this diameter and this many starts, as wide as this */
  wheel?: WheelSpec;
  /** a straight bevel gear (`bevel.ts`, `in_735`): an APPROXIMATION of the standard tooth; `teeth`, `module` and `pressure` as for a gear (the module is the one at the big end); the teeth of its mate, the angle between the shafts and the face width are here */
  bevel?: BevelSpec;
  /** a crown gear (`crown.ts`, `in_802`): a bevel gear whose pitch angle is a right angle; the radii the teeth run between, mm (the pitch radius less a face width, and the pitch radius, if none; the plate's thickness is `width`) */
  crown?: { inner?: number; outer?: number };
  /** arcs to each side of a tooth's flank (2 to 8; 4 by default): fewer is a rougher involute and a body with fewer faces, which is quicker to make (`dec_speed_rules`) */
  detail?: number;
  /** the corner radius of the rack cutter, in modules: the root is then shaped as that cutter makes it (a fillet, and the undercut when there are few teeth: `gearroot.ts`); none or 0: the root is the circle between the flanks */
  fillet?: number;
  /** the tips of the teeth broken at the two faces of a gear that has a thickness (`in_791`): a flat 45 degree bevel this many modules deep on each tooth tip at each face, cut by the kernel in one step (`chamferOf`, `toothChamfer`); none or 0: sharp */
  chamfer?: number;
  /** the whole perimeter of both faces of a spur gear or a ring with a thickness chamfered, mm (`in_866`, for printing): the body is a ruled loft through the outline inset by this much at each face and the full outline this far in (`edgeOutlines`); none or 0: sharp */
  edge?: number;
  /** the outline moved in by this much (mm): not a number of a gear but what `edgeOutlines` asks `gearOutline` for: an involute's offset is an involute of the same base circle, so the inset outline is the same gear with its teeth thinner and its tip and root circles moved */
  inset?: number;
  /** a flat cut this deep (mm) into the bore, on its +x side: a D bore (`bore.ts`) */
  flat?: number;
  /** a keyway of this width (mm) in the bore, with its depth `keyDepth` (the hub depth t2 of DIN 6885, mm: the standard's for the bore if none) */
  key?: number;
  keyDepth?: number;
  /** a rack: a gear of endless radius, a straight bar with straight-sided teeth (`teeth` of them, `rim` modules of bar under the roots, 2 by default); its outline lies along x from the middle of its pitch line, teeth up */
  rack?: boolean;
  /** a timing pulley for this belt (`pulley.ts`): `teeth` grooves, `clearance` (mm, bigger all round than the belt tooth) in place of the root clearance of a gear; the module is the belt's pitch */
  pulley?: PulleyKind;
  /** a roller chain sprocket (`sprocket.ts`): `teeth` teeth for the ANSI chain number `chain` (40 if none), or for the `pitch` and `roller` diameter given (mm); a bore as for a gear */
  sprocket?: { chain?: number; pitch?: number; roller?: number; /** the ISO 606 tooth form (`iso606.ts`): the chain number is then the B series' 6 to 24 (or an ANSI number for the A series), and `fit` from 0 (tight) to 1 (loose), 0.5 if none, where in ISO's limits the seat and flank are */ iso?: boolean; fit?: number };
  /** a cycloidal (clock) gear (`cycloidal.ts`): the generating circle's radius, the addendum and the dedendum, in modules (3, 1 and 1.25 if none); the same circle for gears that are to mesh; backlash as for a gear */
  cycloidal?: { circle?: number; addendum?: number; dedendum?: number };
  /** a cam or a ratchet (`dec_spline_and_cams`, `dec_ratchet`) kept as a record as a gear is: its numbers (`teeth` and `module` are 1 and unused); its parts are made by `camscene.ts`, not from an outline */
  cam?: CamSpec;
}
export interface GearOutline {
  /** the corners of the outline in order, counter-clockwise */
  points: [number, number][];
  /** for the side from points[i] to the next (the last goes back to the first): how far its middle is out from the chord as a fraction of the chord's length, positive to the left of the way it goes (0: a straight side) */
  bulges: number[];
  pitchRadius: number;
  baseRadius: number;
  /** the outside of an external gear's teeth; the inside of an internal gear's teeth */
  tipRadius: number;
  /** the bottom of the gaps (the top of the gaps for an internal gear) */
  rootRadius: number;
  /** an internal gear: the radius of the wall round the hole (the outer circle) */
  outerRadius?: number;
  /** a rack: how long it is along its pitch line, mm */
  length?: number;
  /** things worth saying that did not stop the outline (few teeth: undercut not shaped; teeth pointed; tip inside the base circle) */
  warnings: string[];
}

/** per side of a tooth: how many arcs make up the involute (each is an arc through two points of it and the point between; checked in the tests) */
const DEFAULT_ARCS = 4;
const inv = (a: number) => Math.tan(a) - a;
const polar = (r: number, a: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];

/** How far the middle `m` of a side from `a` to `b` stands out from the chord, as a fraction of its length, positive to the left of the way it goes (the bulge of `Line`). */
export function bulgeOf(a: readonly [number, number], m: readonly [number, number], b: readonly [number, number]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return 0;
  const off = ((m[0] - (a[0] + b[0]) / 2) * -dy + (m[1] - (a[1] + b[1]) / 2) * dx) / len;
  return Math.abs(off) < 1e-12 ? 0 : off / len;
}

/** The outline of a rack: straight sides at the pressure angle, the pitch line along the x axis, the middle of it at the origin, teeth up. */
function rackOutline(spec: GearSpec): Result<GearOutline> {
  const n = Math.round(spec.teeth);
  const m = spec.module;
  if (!Number.isFinite(n) || n < 1 || n > 500) return err("a rack needs 1 to 500 teeth");
  if (!Number.isFinite(m) || m <= 0) return err("the module must be above zero");
  const alphaN = ((spec.pressure ?? 20) * Math.PI) / 180;
  if (!(alphaN > 0 && alphaN < (35 * Math.PI) / 180)) return err("the pressure angle must be between 0 and 35 degrees");
  // a helical rack (`in_783`): the module, the pressure angle and the backlash are the normal ones; the outline is the section across the rack, whose module is mn / cos(helix) and whose pressure angle is atan(tan(an) / cos(helix)); the body is that section slid along the rack as it goes through its thickness (`helixShear`)
  if (spec.helix !== undefined) {
    if (!(Math.abs(spec.helix) > 0 && Math.abs(spec.helix) <= 45)) return err("the helix angle must be from 1 to 45 degrees (a minus sign is a left hand helix); a rack with no helix is the plain rack");
    if (!(spec.width! > 0)) return err("the width of a helical rack must be above zero");
  }
  const k = spec.helix !== undefined ? Math.cos((Math.abs(spec.helix) * Math.PI) / 180) : 1;
  const alpha = Math.atan(Math.tan(alphaN) / k);
  const [c, t] = [spec.clearance ?? 0.25, Math.tan(alpha)];
  const p = (Math.PI * m) / k;
  const s = p / 2 - (spec.backlash ?? 0) / k; // (the tooth's thickness on the pitch line)
  const [tip, root] = [m, -(1 + c) * m]; // (the addendum and dedendum are the normal ones, measured across the teeth, so the same in the section)
  const [ht, hr] = [s / 2 - m * t, s / 2 + (1 + c) * m * t]; // (half the tooth at its tip and at its root)
  if (s <= 0 || ht <= 1e-6) return err("the teeth would be pointed: less backlash is needed");
  if (p - 2 * hr <= 1e-6) return err("the teeth meet at the root");
  const bottom = root - (spec.rim ?? 2) * m;
  const L = n * p;
  const top: [number, number][] = [[0, root]]; // (the top edge from the left end to the right, a half gap at each end)
  for (let k = 0; k < n; k++) { const xc = (k + 0.5) * p; top.push([xc - hr, root], [xc - ht, tip], [xc + ht, tip], [xc + hr, root]); }
  top.push([L, root]);
  const points = [[0, bottom], [L, bottom], ...top.slice().reverse()].map((q): [number, number] => [q[0]! - L / 2, q[1]!]); // (counter-clockwise: along the bottom, up the right end, back along the top)
  return ok({ points, bulges: points.map(() => 0), pitchRadius: 0, baseRadius: 0, tipRadius: tip, rootRadius: root, length: L, warnings: [] });
}

/** How far the outline of a helical gear is turned while it is carried along its axis for its whole width, degrees (the sign is the hand), or null for a gear that is not helical: width x tan(helix) / transverse pitch radius. */
/** Whether a gear has a body made with it (`in_697`): a helix, or a thickness above zero (a flat gear has neither). */
export const hasBody = (spec: GearSpec): boolean => spec.helix !== undefined || (spec.width ?? 0) > 0 || !!spec.bevel;
/**
 * What a tooth chamfer is (`in_760`, `in_859`): how deep it is (mm), which way is out of the material at the tooth tips (+1 outside a gear, -1 inside a ring) and the thickness; null when there is no chamfer or no thickness, or for a kind of gear
 * that has none. The kernel cuts one flat wedge off each tooth tip at each face (`toothChamfer`).
 */
export function chamferOf(spec: GearSpec): { depth: number; side: 1 | -1; width: number } | null {
  const c = (spec.chamfer ?? 0) * spec.module;
  if (spec.wheel) return c > 0 ? { depth: c, side: 1, width: spec.wheel.width + 2 * (spec.wheel.land ?? 0) } : null; // (a worm wheel: its throated part and a land at each face, `in_923`)
  if (spec.bevel?.facegear === "pinion") { // a face gear drive's spur pinion (`dec_bevel_chamfer`): a spur gear of the width of the pair's pinion
    const f = faceFor(spec);
    return c > 0 && f.ok ? { depth: c, side: 1, width: pinionWidth(f.value.pair) } : null;
  }
  const w = spec.width ?? 0;
  if (!(c > 0) || !(w > 0) || spec.rack || spec.pulley || spec.sprocket || spec.cycloidal || spec.worm || spec.bevel) return null;
  return { depth: c, side: spec.internal ? -1 : 1, width: w };
}
/**
 * The two outlines of an edge chamfer (`in_866`): the full one and the one inset by the chamfer, with the same number of sides, as the body is a ruled loft through the inset outline at the bottom face, the full one a chamfer above it, the full one a chamfer
 * under the top face and the inset one at the top face. Null with no edge chamfer, no thickness or a kind of gear that has none.
 */
export function edgeOutlines(spec: GearSpec): { full: GearOutline; inset: GearOutline; c: number } | null {
  const c = spec.edge ?? 0;
  if (!(c > 0) || !hasBody(spec) || spec.rack || spec.pulley || spec.sprocket || spec.cycloidal || spec.worm || spec.wheel || spec.bevel || spec.helix !== undefined) return null;
  const [full, inset] = [gearOutline({ ...spec, edge: undefined, chamfer: undefined }), gearOutline({ ...spec, edge: undefined, chamfer: undefined, inset: c })];
  return full.ok && inset.ok && full.value.points.length === inset.value.points.length ? { full: full.value, inset: inset.value, c } : null;
}
/** How far each layer of a helical rack is slid along the rack for each mm of its thickness (tan of the helix angle, with the sign of the hand), or null for anything that is not a helical rack (`in_783`). */
export const helixShear = (spec: GearSpec): number | null => spec.rack && spec.helix !== undefined && spec.width! > 0 ? Math.tan((spec.helix * Math.PI) / 180) : null;
export function helixTwist(spec: GearSpec): number | null {
  if (spec.rack) return null; // (a rack is slid, not turned)
  if (spec.helix === undefined || !(spec.width! > 0) || !(spec.teeth > 0) || !(spec.module > 0)) return null;
  const b = (spec.helix * Math.PI) / 180;
  const rp = (spec.module * Math.round(spec.teeth)) / (2 * Math.cos(b));
  return ((spec.width! * Math.tan(b)) / rp) * (180 / Math.PI);
}

/** A worm's outline is the figure of its thread (the tooth of the axial section: its axial place and radius as x and y), the one thing the generic code draws; the worm itself is made by `worm.ts`' steps. */
function wormOutline(spec: GearSpec): Result<GearOutline> {
  const g = wormOf(spec);
  if (!g.ok) return g;
  const { rRoot, rTip, rp, half } = g.value;
  const hb = half(rRoot - 0.5 * spec.module);
  const points: [number, number][] = [[hb, rRoot - 0.5 * spec.module], [half(rTip), rTip], [-half(rTip), rTip], [-hb, rRoot - 0.5 * spec.module]];
  return ok({ points, bulges: points.map(() => 0), pitchRadius: rp, baseRadius: 0, tipRadius: rTip, rootRadius: rRoot, warnings: [] });
}
/** A worm wheel's outline as this code can give it at once: the circle of its pitch (the real sections, worked out from the worm, take seconds: `wheelsections.ts`); what is checked is the numbers. */
function wheelOutline(spec: GearSpec): Result<GearOutline> {
  const w = wheelOf(spec);
  if (!w.ok) return w;
  const { rw, rootAt, tipAt } = w.value;
  const n = 48;
  const points: [number, number][] = Array.from({ length: n }, (_, i) => [rw * Math.cos((2 * Math.PI * i) / n), rw * Math.sin((2 * Math.PI * i) / n)]);
  return ok({ points, bulges: points.map(() => 0), pitchRadius: rw, baseRadius: 0, tipRadius: tipAt(0), rootRadius: rootAt(0), warnings: [] });
}

/** A straight bevel gear's outline: the big end of the toothed cone (`bevel.ts`), as corners and arcs. */
function bevelOutline(spec: GearSpec): Result<GearOutline> {
  if (spec.bevel?.facegear !== undefined) { // a face gear (its first section) or its spur pinion (a plain spur gear's outline)
    const f = faceFor(spec);
    if (!f.ok) return f;
    if (f.value.role === "pinion") return gearOutline({ teeth: spec.teeth, module: spec.module, backlash: spec.backlash ?? FACE.backlash });
    const body = faceBody(f.value.pair);
    if (!body.ok) return body;
    const s0 = body.value.sections[0]!, p = f.value.pair;
    return ok({ points: s0.points, bulges: s0.bulges, pitchRadius: p.R2, baseRadius: p.R2, tipRadius: p.outer, rootRadius: p.inner, warnings: ["a face gear: the tooth is the envelope of its spur pinion's involute, for a pinion at 90 degrees"] });
  }
  if (spec.bevel?.spiral !== undefined && !isCrown(spec)) { // a spiral bevel gear: the pair must make (`spiral.ts`): the outline is the heel's first plane
    const sp = spiralFor(spec);
    if (!sp.ok) return sp;
    const body = spiralBody(sp.value.pair, sp.value.which);
    if (!body.ok) return body;
    const g = bevelOf(spec);
    if (!g.ok) return g;
    const s0 = body.value.sections[0]!;
    return ok({ points: s0.points, bulges: s0.bulges, pitchRadius: g.value.pitchRadius, baseRadius: g.value.pitchRadius * Math.cos((20 * Math.PI) / 180), tipRadius: g.value.tipRadius, rootRadius: g.value.rootRadius, warnings: ["a spiral bevel tooth from the gearing law (a crown gear's circular-arc tooth enveloped by the pinion); the pair is made for each other"] });
  }
  if (isCrown(spec)) { // a crown gear: the section across its pitch plane (`crown.ts`)
    const c = crownOf(spec);
    if (!c.ok) return c;
    const { points, bulges } = crownSection(spec, c.value, 0);
    return ok({ points, bulges, pitchRadius: c.value.R, baseRadius: c.value.R, tipRadius: c.value.outer, rootRadius: c.value.inner, warnings: ["a crown gear with straight radial teeth, to mesh with a straight bevel pinion"] });
  }
  const b = bevelPoints(spec);
  if (!b.ok) return b;
  const lay = bevelLayout(spec); // (the body is made from it: the numbers that cannot are refused here, with why)
  if (!lay.ok) return lay;
  const { geometry: g, points, bulges } = b.value;
  return ok({ points, bulges, pitchRadius: g.pitchRadius, baseRadius: g.pitchRadius * Math.cos(((spec.pressure ?? 20) * Math.PI) / 180), tipRadius: g.tipRadius, rootRadius: g.rootRadius, warnings: ["an approximation of the standard bevel tooth (Tredgold back cone), not the octoid form of ISO 23509"] });
}

/** The outline of a gear, or why there is none (and why its bore has no such flat or keyway). */
export function gearOutline(spec: GearSpec): Result<GearOutline> {
  if (spec.cam) return err("a cam is not a gear: it has no tooth outline");
  const r = outlineOf(spec);
  if (!r.ok) return r;
  const why = boreProblem(spec, r.value.rootRadius);
  return why ? err(why) : r;
}
/** What is wrong with the chamfers of a rack or a worm wheel (`in_924`): they are made by the kernel at the faces (the tip of each tooth for a rack's Chamfer, the whole perimeter for the Edge chamfer), one of them at a time. */
function endChamferProblem(spec: GearSpec): string | null {
  const [c, e] = [spec.chamfer ?? 0, spec.edge ?? 0];
  if (c === 0 && e === 0) return null;
  const thick = spec.wheel ? spec.wheel.width + 2 * (spec.wheel.land ?? 0) : spec.width ?? 0;
  if (c !== 0 && e !== 0) return "a chamfer of the tips of the teeth and one of the whole edge are not made together: one of them";
  if (!(thick > 0)) return "a chamfer needs a thickness: give it a thickness";
  if (c !== 0) { if (!(c > 0 && c <= 1)) return "the chamfer is from 0 to 1 module deep"; if (!(c * spec.module * 2 < thick)) return "the chamfer is deeper than half the thickness"; }
  if (e !== 0) { if (!(e > 0 && e <= 3)) return "the edge chamfer is from 0 to 3 mm"; if (!(e * 2 < thick)) return "the edge chamfer is deeper than half the thickness"; if (spec.wheel) { if (!((spec.wheel.land ?? 0) >= e)) return "the edge chamfer of a worm wheel is made in its land (the straight part at each face): give it a land at least as long as the chamfer"; if (spec.flat || spec.key) return "an edge chamfer is not made for a bore with a flat or a keyway yet"; } }
  return null;
}
function outlineOf(spec: GearSpec): Result<GearOutline> {
  if (!spec.pulley && !spec.sprocket && !spec.cycloidal && spec.clearance !== undefined && !(spec.clearance >= 0 && spec.clearance <= 1)) return err("the clearance is from 0 to 1 module");
  if (spec.rack || spec.wheel) { const why = endChamferProblem(spec); if (why) return err(why); }
  if (spec.bevel) return bevelOutline(spec);
  if (spec.worm) return wormOutline(spec);
  if (spec.wheel) return wheelOutline(spec);
  if (spec.cycloidal) return cycloidalOutline(spec);
  if (spec.rack) return rackOutline(spec);
  if (spec.pulley) return pulleyOutline(spec);
  if (spec.sprocket) return sprocketOutline(spec);
  const z = Math.round(spec.teeth);
  const mn = spec.module; // (the normal module; the transverse one `m` is bigger for a helical gear)
  if (!Number.isFinite(z) || z < 3 || z > 500) return err("a gear needs 3 to 500 teeth");
  if (!Number.isFinite(mn) || mn <= 0) return err("the module must be above zero");
  const alphaN = ((spec.pressure ?? 20) * Math.PI) / 180;
  if (!(alphaN > 0 && alphaN < (35 * Math.PI) / 180)) return err("the pressure angle must be between 0 and 35 degrees");
  if ((spec.chamfer ?? 0) !== 0) {
    if (!((spec.chamfer ?? 0) > 0 && (spec.chamfer ?? 0) <= 1)) return err("the chamfer is from 0 to 1 module deep");
    if (!(hasBody(spec))) return err("a chamfer needs a thickness: give the gear a thickness (or a helix)");
    if (!(spec.chamfer! * mn * 2 < (spec.width ?? 0))) return err("the chamfer is deeper than half the thickness of the gear");
  }
  if ((spec.edge ?? 0) !== 0 && !spec.inset) { // an edge chamfer (`in_866`): the numbers it needs, and that the outline inset by it is one of the same shape (the loft joins them side by side)
    const c = spec.edge!;
    if (!(c > 0 && c <= 3)) return err("the edge chamfer is from 0 to 3 mm");
    if (!hasBody(spec)) return err("an edge chamfer needs a thickness: give the gear a thickness");
    if (spec.helix !== undefined) return err("an edge chamfer is not made for a helical gear yet");
    if (spec.flat || spec.key) return err("an edge chamfer is not made for a bore with a flat or a keyway yet");
    if ((spec.fillet ?? 0) > 0) return err("an edge chamfer is not made with a root fillet yet");
    if (!(c * 2 < (spec.width ?? 0))) return err("the edge chamfer is deeper than half the thickness of the gear");
    const [a, b] = [outlineOf({ ...spec, edge: undefined, chamfer: undefined }), outlineOf({ ...spec, edge: undefined, chamfer: undefined, inset: c })];
    if (!a.ok) return a;
    if (!b.ok) return err(`the edge chamfer is too big for these teeth (${b.error})`);
    if (a.value.points.length !== b.value.points.length) return err("the edge chamfer is too big for these teeth: the outline inset by it has another shape");
    return a;
  }
  if (spec.inset && !spec.internal) { // the outline moved in by `inset` (`edgeOutlines`): thinner teeth and the tip and root circles in by that much, the same involutes
    const { inset: d, ...rest } = spec;
    return outlineOf({ ...rest, shift: (rest.shift ?? 0) - d / mn, backlash: (rest.backlash ?? 0) + (2 * d * (1 - Math.sin(alphaN))) / Math.cos(alphaN) });
  }
  const helical = spec.helix !== undefined;
  if (helical) {
    if (!(Math.abs(spec.helix!) > 0 && Math.abs(spec.helix!) <= 45)) return err("the helix angle must be from 1 to 45 degrees (a minus sign is a left hand helix); a gear with no helix is the plain gear tool");
    if (!(spec.width! > 0)) return err("the width of a helical gear must be above zero");
  }
  const k = helical ? Math.cos((Math.abs(spec.helix!) * Math.PI) / 180) : 1; // (cosine of the helix angle: the section across the gear is a gear of the module mn / k, pressure angle atan(tan(alphaN) / k))
  const m = mn / k;
  const alpha = Math.atan(Math.tan(alphaN) / k);
  const ARCS = Math.round(spec.detail ?? DEFAULT_ARCS);
  if (!(ARCS >= 2 && ARCS <= 8)) return err("the detail (arcs to a flank) must be from 2 to 8");
  const x = spec.internal ? 0 : (spec.shift ?? 0) * k; // (the shift is a distance, x mn, which is x k in transverse modules)
  const c = k * (1 + (spec.clearance ?? 0.25)) - 1; // (the root is (1 + clearance) mn below the pitch circle: the same distance in the transverse section)
  const backlash = (spec.backlash ?? 0) / k;
  const [rp, warnings] = [(m * z) / 2, [] as string[]];
  const rb = rp * Math.cos(alpha);
  const invP = inv(alpha);
  const invAt = (r: number) => inv(Math.acos(Math.min(1, rb / r)));
  // the half thickness of a tooth (an external gear) or of the material between two gaps (an internal gear), as an angle, at radius r
  const thickness = Math.max(1e-6, (Math.PI / 2 + 2 * x * Math.tan(alpha)) * m - backlash);
  const half0 = thickness / (2 * rp) - (spec.internal ? (spec.inset ?? 0) / rb : 0); // (a ring inset: its teeth thinner by the flank's move along the base circle)
  const half = spec.internal ? (r: number) => half0 + invAt(r) - invP : (r: number) => half0 + invP - invAt(r);
  const pitch = (2 * Math.PI) / z;
  const tooth = (k: number) => k * pitch;
  const points: [number, number][] = [];
  const bulges: number[] = [];
  const add = (p: [number, number]) => points.push(p);
  const edge = (a: [number, number], m2: [number, number], b: [number, number]) => bulges.push(bulgeOf(a, m2, b));

  // the flank between two radii, as points with the middle point of each arc: radii spaced evenly along the roll of the involute (tan of its angle), so the arcs are about equal
  const flank = (lo: number, hi: number, centre: number, side: 1 | -1): { p: [number, number][]; mid: [number, number][] } => {
    const [t0, t1] = [Math.sqrt(Math.max(0, (lo / rb) ** 2 - 1)), Math.sqrt(Math.max(0, (hi / rb) ** 2 - 1))];
    const at = (t: number): [number, number] => { const r = rb * Math.sqrt(1 + t * t); return polar(r, centre + side * half(r)); };
    const p: [number, number][] = [], mid: [number, number][] = [];
    for (let j = 0; j <= ARCS; j++) p.push(at(t0 + ((t1 - t0) * j) / ARCS));
    for (let j = 0; j < ARCS; j++) mid.push(at(t0 + ((t1 - t0) * (j + 0.5)) / ARCS));
    return { p, mid };
  };

  if (!spec.internal) {
    const rf = rp - m * (1 + c - x);
    let ra = rp + m * (k + x); // (the addendum is mn, which is k transverse modules)
    if (rf <= 0.2 * rp) return err("the teeth are too deep for this few: raise the tooth count or lower the module");
    const smallest = 0.02 * pitch; // a tip narrower than this (half angle) is a point
    if (half(ra) < smallest) {
      let [lo, hi] = [rp, ra]; // half(rp) > smallest unless the tooth is already pointed at the pitch circle
      if (half(lo) < smallest) return err("the teeth would be pointed at the pitch circle: less shift or more backlash-free thickness is needed");
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (half(mid) < smallest) hi = mid; else lo = mid; }
      ra = lo;
      warnings.push("the tips are pointed, so they are cut short");
    }
    if (z < (2 * (1 - x)) / Math.sin(alpha) ** 2 - 1e-9) warnings.push("few teeth: the root is not undercut, so this gear will bind against a gear that reaches it (a Fillet shapes the root as a cutter leaves it)");
    if ((spec.bore ?? 0) < 0 || (spec.bore ?? 0) >= 2 * rf * 0.95) return err("the bore must be smaller than the gear's root circle");
    const r0 = Math.max(rb, rf);
    if (half(r0) >= pitch / 2 - 1e-4) return err("the teeth meet at the root: raise the tooth count or lower the shift");
    if ((spec.fillet ?? 0) < 0) return err("the fillet cannot be below zero");
    if ((spec.fillet ?? 0) > 0) { // the root as the rack cutter makes it (`in_592`)
      const g = gearRoot({ m, z, alpha, x, c, backlash, rho: spec.fillet! * mn });
      if (!g.ok) return err(g.error);
      const { pts, rLo } = g.value;
      if (!(rLo < ra) || rLo < rb - 1e-9) return err("the root's fillet would reach the tip: a smaller fillet");
      for (let k = 0; k < z; k++) {
        const phi = tooth(k);
        const cwR = pts.map(([r, a]) => polar(r, phi - pitch / 2 + a)), ccwR = pts.map(([r, a]) => polar(r, phi + pitch / 2 - a));
        const cw = flank(rLo, ra, phi, -1), ccw = flank(rLo, ra, phi, 1);
        add(cwR[6]!); edge(cwR[6]!, cwR[5]!, cwR[4]!); // the root's corner, up to where the involute starts
        add(cwR[4]!); edge(cwR[4]!, cwR[3]!, cwR[2]!);
        add(cwR[2]!); edge(cwR[2]!, cwR[1]!, cw.p[0]!);
        for (let j = 0; j <= ARCS; j++) { add(cw.p[j]!); if (j < ARCS) edge(cw.p[j]!, cw.mid[j]!, cw.p[j + 1]!); }
        edge(cw.p[ARCS]!, polar(ra, phi), ccw.p[ARCS]!);
        for (let j = ARCS; j >= 0; j--) { add(ccw.p[j]!); if (j > 0) edge(ccw.p[j]!, ccw.mid[j - 1]!, ccw.p[j - 1]!); }
        edge(ccw.p[0]!, ccwR[1]!, ccwR[2]!);
        add(ccwR[2]!); edge(ccwR[2]!, ccwR[3]!, ccwR[4]!);
        add(ccwR[4]!); edge(ccwR[4]!, ccwR[5]!, ccwR[6]!);
        add(ccwR[6]!); edge(ccwR[6]!, polar(rf, phi + pitch / 2), polar(pts[6]![0], phi + pitch / 2 + pts[6]![1])); // the root circle to the next tooth's corner
      }
      return ok({ points, bulges, pitchRadius: rp, baseRadius: rb, tipRadius: ra, rootRadius: rf, warnings: [...warnings.filter((w) => !w.startsWith("few teeth")), ...(g.value.undercut ? ["undercut: the root is shaped as the cutter leaves it, so the involute starts higher up"] : [])] });
    }
    for (let k = 0; k < z; k++) {
      const phi = tooth(k);
      const cw = flank(r0, ra, phi, -1), ccw = flank(r0, ra, phi, 1);
      const sunk = rf < rb - 1e-9; // the involute begins at the base circle; below it a straight radial side runs down to the root circle
      if (sunk) { add(polar(rf, phi - half(rb))); bulges.push(0); }
      for (let j = 0; j <= ARCS; j++) { add(cw.p[j]!); if (j < ARCS) edge(cw.p[j]!, cw.mid[j]!, cw.p[j + 1]!); }
      edge(cw.p[ARCS]!, polar(ra, phi), ccw.p[ARCS]!); // the tip: an arc about the centre
      for (let j = ARCS; j >= 0; j--) { add(ccw.p[j]!); if (j > 0) edge(ccw.p[j]!, ccw.mid[j - 1]!, ccw.p[j - 1]!); }
      if (sunk) { add(polar(rf, phi + half(rb))); }
      const from = sunk ? polar(rf, phi + half(rb)) : ccw.p[0]!;
      if (sunk) bulges.push(0); // (a radial side: straight)
      const nextStart = sunk ? polar(rf, tooth(k + 1) - half(rb)) : flank(r0, ra, tooth(k + 1), -1).p[0]!;
      edge(from, polar(rf, phi + pitch / 2), nextStart); // the root: an arc about the centre
    }
    return ok({ points, bulges, pitchRadius: rp, baseRadius: rb, tipRadius: ra, rootRadius: rf, warnings });
  }

  // an internal gear: the hole, going round counter-clockwise; at each tooth of the ring the side comes in from the gap's root circle to the tip circle, round the tip, and out again
  const rr = rp + m * (1 + c) + (spec.inset ?? 0);
  let rt = rp - m + (spec.inset ?? 0);
  if (rt <= rb) { rt = rb * 1.0005; warnings.push("few teeth for a ring: the tip circle is inside the base circle, so the tips are cut at it"); }
  if (rt >= rp) return err("the tip circle would be outside the pitch circle: raise the tooth count");
  if (half(rr) >= pitch / 2 - 1e-4) return err("the teeth meet at the root: raise the tooth count");
  for (let k = 0; k < z; k++) {
    const phi = tooth(k);
    const cw = flank(rt, rr, phi, -1), ccw = flank(rt, rr, phi, 1);
    for (let j = ARCS; j >= 0; j--) { add(cw.p[j]!); if (j > 0) edge(cw.p[j]!, cw.mid[j - 1]!, cw.p[j - 1]!); }
    edge(cw.p[0]!, polar(rt, phi), ccw.p[0]!); // the tip: an arc about the centre
    for (let j = 0; j <= ARCS; j++) { add(ccw.p[j]!); if (j < ARCS) edge(ccw.p[j]!, ccw.mid[j]!, ccw.p[j + 1]!); }
    edge(ccw.p[ARCS]!, polar(rr, phi + pitch / 2), flank(rt, rr, tooth(k + 1), -1).p[ARCS]!);
  }
  return ok({ points, bulges, pitchRadius: rp, baseRadius: rb, tipRadius: rt, rootRadius: rr, outerRadius: rr - (spec.inset ?? 0) + m * (spec.rim ?? 2), warnings });
}

/** The module that makes the gear's outside diameter this wide (external, no shift): the outside diameter is m (z + 2). */
export const moduleForOutside = (teeth: number, outside: number, shift = 0): number => outside / (Math.round(teeth) + 2 * (1 + shift));

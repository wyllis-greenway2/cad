// What each number of the gear box means, in a line (`in_685`): the box is a panel with every number named and explained, not a row of bare numbers. Words only; the numbers are `tools.ts`'s.
import type { GearKey } from "./tools.ts";
import { KEYS, standardKey } from "../operation/bore.ts";

/** What each number of a cam says, in a line (`dec_spline_and_cams`), by the label the box shows */
export const CAM_HINTS: Record<string, string> = {
  Diameter: "The size across: a cam's base circle (the smallest it gets), an eccentric's whole disc, a ratchet's outside circle at the tips of its teeth. The pointer's distance from the shaft sets it, or type it.",
  Offset: "How far the shaft is from the middle of the disc, mm. The follower moves twice this.",
  Lift: "How far the follower rises over the base circle, mm (a snail: over one turn).",
  Rise: "Degrees of the turn over which the follower rises, from the +x direction round counter-clockwise.",
  Dwell: "Degrees the follower stays at the top before it comes down. 0 for none.",
  Return: "Degrees of the turn over which the follower comes down. Rise + dwell + return is at most 360; what is left is the rest at the bottom.",
  Hole: "The shaft's hole, diameter in mm. 0 for none. If left, a fifth of the diameter for a cam or a ratchet, a quarter of the crank radius for a Geneva wheel (the hole of the crank too).",
  Layer: "How thick the wheel and the locking disc are, mm (6 if left): they are one layer, and the crank's pin stands up through it.",
  Plate: "How thick the crank plate is, mm (3 if left): it is under the wheel's layer, and carries the pin.",
  Pitch: "The distance from one tooth tip to the next along the bar, mm (the pointer's distance from the first click divided by the teeth sets it, or type it).",
  Base: "The thickness of the bar under the roots of the teeth, mm (one and a half times the depth if left).",
  Slots: "How many slots the wheel has, 3 to 24. The wheel turns one slot's step (360 divided by this) for each turn of the crank. Few slots make a jerky drive.",
  Crank: "The radius of the circle the crank's pin goes round, mm (the pointer's distance from the wheel's shaft sets it, or type it). With the slots it fixes how far apart the two shafts are: a divided by the sine of 180 over the slots (the title shows it).",
  Pin: "The pin's diameter, mm (a quarter of the crank radius if left). The slots are this wide plus the clearance each side.",
  Clearance: "Play between the pin and the slot, mm each side. 0.3 if left (a starting point for printing; set it for your printer).",
  Teeth: "How many teeth (a whole number, 3 to 200). More teeth hold in finer steps.",
  Depth: "From the tip of a tooth to its root, mm. A common start is 0.4 of the pitch (a wheel: the circle's length divided by the teeth; a bar: the distance from tip to tip).",
  Hook: "How far the holding face of each tooth leans from straight to the centre, degrees (0 to 30). 0 is a radial face; a lean holds the pawl in the gap.",
  Pawl: "The pawl's arm: from where it rests on the tooth to its pivot, mm. 0 draws the wheel (or the bar) alone. The arm runs along the tangent at the contact (turned outward only as far as it must to clear the next tooth), so the load runs along it.",
  Width: "The pawl's boss at the pivot, diameter mm (its pivot hole is half of it).",
  Angle: "Turns the whole drawing about the shaft, degrees counter-clockwise from +x: where the engaged tooth and the pawl sit.",
  Roller: "Radius of the follower's roller, mm; 0 for a point follower. The outline is taken in by this much; a roller too big for a tight turn is refused.",
};
export const camTitle = (kind: string, law?: string, centres?: string, layout?: string): string => (kind === "geneva" && layout && layout !== "apart" ? `Geneva drive ${layout === "model" ? "as a 3D model" : "assembled (sketch)"}${centres ? `, shafts ${centres} apart` : ""}` : kind === "linear" ? "Straight ratchet and pawl" : kind === "geneva" ? `Geneva wheel and crank${centres ? `, shafts ${centres} apart` : ""}` : kind === "ratchet" ? "Ratchet wheel and pawl" : kind === "eccentric" ? "Eccentric cam" : kind === "snail" ? "Snail cam" : `Disc cam, ${law ?? "cycloidal"}`);
export const GEAR_HINTS: Record<GearKey, string> = {
  sun: "Teeth on the sun, the middle gear. Type the planet's teeth or a ratio and the rest follows.",
  planet: "Teeth on each planet. The ring gets sun + 2 planets teeth. Leave empty to let a ratio choose.",
  planets: "How many planets. They stand evenly round the sun; (sun + ring) divided by this must be a whole number, or they could not all mesh (unless Spacing is 1).",
  pin: "Diameter of the pin each planet turns on, mm (the planet's bore is this plus the gap all round).",
  pingap: "Room between a pin and its planet's bore, mm, all round. 0.2 is a loose fit; raise it to print in place.",
  spacing: "0: the planets are equally spaced (needs sun + ring teeth divisible by the number of planets). 1: any number of planets, at the nearest positions where every one meshes (spaced as evenly as the teeth allow, so the load is not quite balanced).",
  housing: "Wall thickness of a tube round the ring, mm: a body of its own, a snug fit outside the ring. 0 or empty makes no housing.",
  cap: "Thickness of an end cap on the housing, mm, on the side away from the carrier (a disc of its own, with a hole for the sun's shaft). Needs a housing wall.",
  housingfit: "Room between the ring's outside and the housing's inside, mm (0.2 if empty).",
  plategap: "Room between the planets and the carrier plate along the axis, mm (0: they touch). With some, the plate is on a plane of its own that far below the gears, and the pins are as much longer.",
  carrier: "Thickness of the carrier plate (mm): a plate with a pin at each planet, behind the gears. 0 (or empty) makes no carrier.",
  teeth: "How many teeth. A partner needs the same module and pressure angle; its teeth divided by yours is the speed ratio.",
  module: "Tooth size in mm: pitch diameter divided by teeth. Meshing gears must have the same module. Common: 0.5, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5.",
  pressure: "Pressure angle in degrees, the slope of the tooth side. 20 is the modern standard (older gears use 14.5). Meshing gears must share it.",
  shift: "Profile shift in modules: moves the whole tooth out (+) or in (−), used to avoid undercut on small gears. 0 for a standard gear.",
  backlash: "Play between meshed teeth in mm (the teeth are made this much thinner). 0 is the nominal tooth.",
  clearance: "Gap between a tooth tip and the bottom of its partner's gap, in modules. 0.25 is standard. (Pulleys: extra groove size in mm.)",
  fillet: "Rounding at the foot of each tooth, in modules (0 for none). Makes the tooth stronger.",
  bore: "Hole through the middle: its diameter in mm (0 for none).",
  flat: "A flat cut into the bore for a D shaped shaft: how far in from the round, in mm (0 for none). There is no one standard for D flats: measure the shaft. A bore has a flat or a keyway, not both: typing one clears the other.",
  key: "Width of a keyway cut into the bore, in mm (0 for none). Standard keys (DIN 6885): 6 to 8 mm bore 2 wide, to 10 mm 3, to 12 mm 4, to 17 mm 5, to 22 mm 6, to 30 mm 8, to 38 mm 10.",
  keydepth: "Depth of the keyway in mm. Leave 0 to take it from the DIN 6885 table for the bore.",
  rim: "Ring gear: thickness of the wall round the teeth, in modules. Rack: thickness of the bar under the teeth, in modules.",
  ratio: "Partner teeth divided by this gear's teeth (2 means it has twice as many teeth and turns half as fast).",
  angle: "Direction the partner stands in, in degrees round the gear (or how far a rack stands turned).",
  hypoid: "Hypoid offset: how far the ring gear's axis misses the pinion's, in mm (0 for a spiral bevel pair). The pinion lies below the ring gear's axis; at most 0.15 of the ring gear's pitch diameter. The spiral angle is the pinion's: the ring gear's follows from it and the offset.",
  offset: "How far along the rack the gear sits, in mm.",
  chain: "Roller chain number: 40 to 120 (ANSI) or 6 to 24 (ISO B series).",
  pitch: "Chain pitch in mm (type your own, or choose a chain).",
  roller: "Roller diameter in mm (type your own, or choose a chain).",
  circle: "Clock gears: radius of the rolling circle that draws the tooth, in modules. Gears that mesh must share it.",
  addendum: "Clock gears: height of the tooth above the pitch circle, in modules.",
  dedendum: "Clock gears: depth of the gap below the pitch circle, in modules.",
  fit: "ISO sprocket: how loose the tooth form is, 0 (tight) to 1 (loose).",
  helix: "Helix angle at the pitch circle in degrees: 0 is a straight tooth, anything else makes it a 3D helical gear (six modules thick unless you give a thickness). A minus sign makes a left hand gear; a partner needs the opposite hand (Mesh gear does that). On a rack the teeth lean along its length by this angle, and the gear that meshes with it has the same number (Mesh gear and Mesh rack make it so).",
  width: "How thick the gear is along its axis, in mm. 0 leaves a flat outline (a sketch); anything above makes it a 3D gear. With a helix and no thickness, six modules.",
  diameter: "A worm's pitch diameter in mm (a worm has no teeth to count). The wheel for it must be made for the same diameter. Ten times the module is usual; a thicker worm is stronger and has a smaller lead angle.",
  length: "How long the worm's core is, in mm. At least two leads (a lead is the starts times pi times the module).",
  journal: "The plain shaft left at each end of the worm, in mm, for a bearing or a coupling. 0 makes the thread run the whole length and be cut flat at the ends (no shaft). Left alone: two modules (less on a short worm).",
  runout: "How long the thread takes to run out into the shaft at each end, in mm (a cone cut away from the tooth, so it does not stop in a square wall). 0 stops it square. Only for a worm with a journal; left alone: a pitch or two.",
  mate: "How many teeth the gear it meshes with has. Face gear: its spur pinion's teeth (12 or more, between a third and a half of the face gear's); the pair's shafts are at exactly 90 degrees and cross. Bevel gear (an APPROXIMATION of the standard tooth, to be verified): with the shaft angle it fixes this gear's cone angle. Crown gear: the straight bevel pinion's teeth (fewer than the crown's, and enough not to be undercut: 17 or more for 20 degrees); the shafts are then 90 degrees plus the pinion's cone angle apart (116.7 degrees for 18 on 40), so the pinion stands tilted: that is the geometry of a crown gear, a spur pinion at exactly 90 degrees needs a face gear.",
  shaft: "Bevel gear: the angle between the two shafts in degrees (90 is the usual pair). From 30 to 150.",
  edge: "Chamfer the whole top and bottom edge of the gear, every edge of both faces, in mm (0.3 to 0.5 is usual; 0 is sharp), so that the first layer of a print does not squash out and the edges are easy to handle. Needs a thickness; spur gears and rings, a round bore; made in one go, about as quickly as the gear itself.",
  chamfer: "Break the tips of the teeth at the two faces, in modules deep (0.1 to 0.5 is usual; 0 is sharp). A 45 degree cone cut once for the whole gear, so it costs one cut, not one for each tooth. Needs a thickness. Also helps a printed gear come off the bed without a ridge.",
  land: "Worm wheel: a straight land at each face, in mm (none by default; a module or two is usual, and it takes the kernel several times as long): the teeth keep their section out to the faces, cut back where the worm's thread would be, instead of ending in a thin wedge. 0 is the throated part alone.",
  face: "Bevel gear: the width of the teeth along the cone as a fraction of the cone distance. A third is the usual limit (0.1 to 0.5).",
  inner: "Crown gear: the radius where the teeth start, mm. The teeth are thinnest here (their flanks are planes through the axis' radial lines), so they come to a point if it is too small. The pitch radius less 15% of it by default.",
  outer: "Crown gear: the radius where the teeth end, mm; the pitch radius (module times teeth over 2) by default.",
  spiral: "Spiral bevel gear: the mean spiral angle of the teeth, degrees, from 15 to 45 (30 is usual). The pair is made for each other (the ring gear's tooth is worked out from the pinion's), for shafts at 90 degrees and a 20 degree pressure angle, the pinion at least 16 teeth, the two gears together at most 80 teeth (30 and 50, say; not 30 and 55) and the ring gear at most 2.5 times the pinion's teeth.",
  starts: "How many threads the worm has (1 to 4). The wheel turns this many teeth for each turn of the worm, so more starts is a faster, steeper drive.",
};

/** What the numbers of a planetary set mean where it differs from a gear's (`dec_planetary_gears`). */
export const PLANETARY_HINTS: Partial<Record<GearKey, string>> = {
  ratio: "Speed ratio with the ring held, sun in, carrier out (the usual reduction). Type it and the teeth are chosen to be nearest; type the teeth and it is shown. Empty: shown as the teeth give it.",
  module: "Tooth size in mm for the whole set: every gear has the same module.",
  width: "How thick every gear is along its axis, in mm.",
  helix: "Helix angle of the sun in degrees (0: straight teeth). The planets take the opposite hand and the ring the planets' hand, so they all mesh; a minus sign is a left hand sun.",
  bore: "Hole through the sun for its shaft, in mm (0 for none).",
  rim: "Thickness of the ring's wall round its teeth, in modules.",
  backlash: "Play between meshed teeth in mm, for every mesh.",
  clearance: "Gap between a tooth tip and the bottom of its partner's gap, in modules. 0.25 is standard.",
};
/** The name the box shows for the kind of gear being made. */
export function gearTitle(g: { planetary?: true; face?: "gear" | "pinion"; spiral?: true; crown?: true; bevel?: true; internal?: boolean; rack?: boolean; pulley?: string; sprocket?: true; iso?: true; cycloidal?: true; mesh?: unknown }): string {
  const what = g.face === "gear" ? "Face gear" : g.face === "pinion" ? "Spur pinion (for a face gear)" : g.spiral ? "Spiral bevel gear" : g.crown ? "Crown gear" : g.bevel ? "Bevel gear (approximation)" : g.pulley ? `${g.pulley === "2GT" ? "GT2" : g.pulley === "3GT" ? "GT3" : g.pulley === "HTD5M" ? "HTD 5M" : "HTD 8M"} pulley` : g.sprocket ? (g.iso ? "ISO sprocket" : "Sprocket") : g.cycloidal ? (g.internal ? "Clock ring" : g.rack ? "Clock rack" : "Clock gear") : g.rack ? "Rack" : g.internal ? "Ring gear" : "Gear";
  if (g.planetary) return "Planetary gear set";
  return g.mesh ? `${what} (meshing)` : what;
}

/** A line for the bore fields that says what the standard gives for the bore as it is now (`in_690`); null for the other fields or a bore the DIN 6885 table does not cover (6 to 38 mm). */
export function boreHint(key: GearKey, bore: number): string | null {
  if (key !== "key" && key !== "keydepth") return null;
  const k = standardKey(bore);
  if (!k) return bore > 0 ? `No DIN 6885 key for a ${+bore.toFixed(2)} mm bore (the table is for ${KEYS[0]!.over} to ${KEYS[KEYS.length - 1]!.upto} mm): type the width and the depth.` : null;
  return `For a ${+bore.toFixed(2)} mm bore the standard key is ${k.b} wide and the keyway ${k.t2} deep.`;
}

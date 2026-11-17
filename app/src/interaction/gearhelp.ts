// What each number of the gear box means, in a line (`in_685`): the box is a panel with every number named and explained, not a row of bare numbers. Words only; the numbers are `tools.ts`'s.
import type { GearKey } from "./tools.ts";
import { KEYS, standardKey } from "../operation/bore.ts";

export const GEAR_HINTS: Record<GearKey, string> = {
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
  offset: "How far along the rack the gear sits, in mm.",
  chain: "Roller chain number: 40 to 120 (ANSI) or 6 to 24 (ISO B series).",
  pitch: "Chain pitch in mm (type your own, or choose a chain).",
  roller: "Roller diameter in mm (type your own, or choose a chain).",
  circle: "Clock gears: radius of the rolling circle that draws the tooth, in modules. Gears that mesh must share it.",
  addendum: "Clock gears: height of the tooth above the pitch circle, in modules.",
  dedendum: "Clock gears: depth of the gap below the pitch circle, in modules.",
  fit: "ISO sprocket: how loose the tooth form is, 0 (tight) to 1 (loose).",
  helix: "Helix angle at the pitch circle in degrees: 0 is a straight tooth, anything else makes it a 3D helical gear (six modules thick unless you give a thickness). A minus sign makes a left hand gear; a partner needs the opposite hand (Mesh gear does that).",
  width: "How thick the gear is along its axis, in mm. 0 leaves a flat outline (a sketch); anything above makes it a 3D gear. With a helix and no thickness, six modules.",
  diameter: "A worm's pitch diameter in mm (a worm has no teeth to count). The wheel for it must be made for the same diameter. Ten times the module is usual; a thicker worm is stronger and has a smaller lead angle.",
  length: "How long the worm's core is, in mm. At least two leads (a lead is the starts times pi times the module).",
  journal: "The plain shaft left at each end of the worm, in mm, for a bearing or a coupling. 0 makes the thread run the whole length and be cut flat at the ends (no shaft). Left alone: two modules (less on a short worm).",
  runout: "How long the thread takes to run out into the shaft at each end, in mm (a cone cut away from the tooth, so it does not stop in a square wall). 0 stops it square. Only for a worm with a journal; left alone: a pitch or two.",
  mate: "Bevel gear (an APPROXIMATION of the standard tooth, to be verified): how many teeth the gear it meshes with has. With the shaft angle it fixes this gear's cone angle; the pair share the module.",
  shaft: "Bevel gear: the angle between the two shafts in degrees (90 is the usual pair). From 30 to 150.",
  face: "Bevel gear: the width of the teeth along the cone as a fraction of the cone distance. A third is the usual limit (0.1 to 0.5).",
  starts: "How many threads the worm has (1 to 4). The wheel turns this many teeth for each turn of the worm, so more starts is a faster, steeper drive.",
};

/** The name the box shows for the kind of gear being made. */
export function gearTitle(g: { bevel?: true; internal?: boolean; rack?: boolean; pulley?: string; sprocket?: true; iso?: true; cycloidal?: true; mesh?: unknown }): string {
  const what = g.bevel ? "Bevel gear (approximation)" : g.pulley ? `${g.pulley === "2GT" ? "GT2" : g.pulley === "3GT" ? "GT3" : g.pulley === "HTD5M" ? "HTD 5M" : "HTD 8M"} pulley` : g.sprocket ? (g.iso ? "ISO sprocket" : "Sprocket") : g.cycloidal ? (g.internal ? "Clock ring" : g.rack ? "Clock rack" : "Clock gear") : g.rack ? "Rack" : g.internal ? "Ring gear" : "Gear";
  return g.mesh ? `${what} (meshing)` : what;
}

/** A line for the bore fields that says what the standard gives for the bore as it is now (`in_690`); null for the other fields or a bore the DIN 6885 table does not cover (6 to 38 mm). */
export function boreHint(key: GearKey, bore: number): string | null {
  if (key !== "key" && key !== "keydepth") return null;
  const k = standardKey(bore);
  if (!k) return bore > 0 ? `No DIN 6885 key for a ${+bore.toFixed(2)} mm bore (the table is for ${KEYS[0]!.over} to ${KEYS[KEYS.length - 1]!.upto} mm): type the width and the depth.` : null;
  return `For a ${+bore.toFixed(2)} mm bore the standard key is ${k.b} wide and the keyway ${k.t2} deep.`;
}

// What each number of the gear box means, in a line (`in_685`): the box is a panel with every number named and explained, not a row of bare numbers. Words only; the numbers are `tools.ts`'s.
import type { GearKey } from "./tools.ts";

/** What each number of a cam says, in a line (`dec_spline_and_cams`), by the label the box shows */
export const CAM_HINTS: Record<string, string> = {
  Diameter: "The base circle: the smallest the cam gets (the pointer's distance from the shaft sets it, or type it). For an eccentric, the whole disc.",
  Offset: "How far the shaft is from the middle of the disc, mm. The follower moves twice this.",
  Lift: "How far the follower rises over the base circle, mm (a snail: over one turn).",
  Rise: "Degrees of the turn over which the follower rises, from the +x direction round counter-clockwise.",
  Dwell: "Degrees the follower stays at the top before it comes down. 0 for none.",
  Return: "Degrees of the turn over which the follower comes down. Rise + dwell + return is at most 360; what is left is the rest at the bottom.",
  Hole: "The shaft's hole, diameter in mm. 0 for none (a fifth of the diameter if left).",
  Roller: "Radius of the follower's roller, mm; 0 for a point follower. The outline is taken in by this much; a roller too big for a tight turn is refused.",
};
export const camTitle = (kind: string, law?: string): string => (kind === "eccentric" ? "Eccentric cam" : kind === "snail" ? "Snail cam" : `Disc cam, ${law ?? "cycloidal"}`);
export const GEAR_HINTS: Record<GearKey, string> = {
  teeth: "How many teeth. A partner needs the same module and pressure angle; its teeth divided by yours is the speed ratio.",
  module: "Tooth size in mm: pitch diameter divided by teeth. Meshing gears must have the same module. Common: 0.5, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5.",
  pressure: "Pressure angle in degrees, the slope of the tooth side. 20 is the modern standard (older gears use 14.5). Meshing gears must share it.",
  shift: "Profile shift in modules: moves the whole tooth out (+) or in (−), used to avoid undercut on small gears. 0 for a standard gear.",
  backlash: "Play between meshed teeth in mm (the teeth are made this much thinner). 0 is the nominal tooth.",
  clearance: "Gap between a tooth tip and the bottom of its partner's gap, in modules. 0.25 is standard. (Pulleys: extra groove size in mm.)",
  fillet: "Rounding at the foot of each tooth, in modules (0 for none). Makes the tooth stronger.",
  detail: "How finely the curved tooth sides are drawn. More is smoother and heavier to work out.",
  bore: "Hole through the middle: its diameter in mm (0 for none).",
  flat: "A flat cut into the bore for a D shaped shaft, in mm (0 for none).",
  key: "Width of a keyway cut into the bore, in mm (0 for none).",
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
  helix: "Helix angle at the pitch circle in degrees; a minus sign makes a left hand gear. A partner needs the opposite hand.",
  width: "Width of the gear along its axis, in mm.",
  diameter: "A worm's pitch diameter in mm (a worm has no teeth to count). The wheel for it must be made for the same diameter. Ten times the module is usual; a thicker worm is stronger and has a smaller lead angle.",
  length: "How long the worm's core is, in mm. At least two leads (a lead is the starts times pi times the module).",
  starts: "How many threads the worm has (1 to 4). The wheel turns this many teeth for each turn of the worm, so more starts is a faster, steeper drive.",
};

/** The name the box shows for the kind of gear being made. */
export function gearTitle(g: { internal?: boolean; rack?: boolean; helical?: true; pulley?: string; sprocket?: true; iso?: true; cycloidal?: true; mesh?: unknown }): string {
  const what = g.pulley ? `${g.pulley === "2GT" ? "GT2" : g.pulley === "3GT" ? "3GT" : g.pulley === "HTD5M" ? "HTD 5M" : "HTD 8M"} pulley` : g.sprocket ? (g.iso ? "ISO sprocket" : "Sprocket") : g.cycloidal ? (g.internal ? "Clock ring" : g.rack ? "Clock rack" : "Clock gear") : g.rack ? "Rack" : g.internal ? "Ring gear" : g.helical ? "Helical gear" : "Gear";
  return g.mesh ? `${what} (meshing)` : what;
}

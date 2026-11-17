// Worm gears (`dec_worm_gears`, `in_608`): the worm and the numbers it shares with its wheel. A worm is a screw whose section through its axis is the tooth of a rack (the ZA worm: straight flanks in the axial section): its
// thread is that tooth carried along a helix (`dec_spiral_extrude`) on a core. Pure maths: the axial coordinate a runs along the axis from the middle of the worm and the radius rho from the axis.
//
// The numbers: the axial module m (the thread's pitch along the axis is pi m), the axial pressure angle, the number of starts k (the lead is k pi m, so one turn carries the thread k pitches), the pitch diameter d (the
// worm has no teeth to count: the diameter is free, and the lead angle atan(k m / d) follows from it), the length of the core. The thread stands out an addendum m beyond the pitch circle and goes a dedendum 1.25 m below it.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { GearSpec } from "./gear.ts";

/** a worm: its pitch diameter and the length of its core, mm; its starts are `GearSpec.teeth`, its axial module `module`, its axial pressure angle `pressure` */
export interface WormSpec { diameter: number; length: number }
/** a worm wheel: the pitch diameter of the worm it is for, the worm's starts, and its own width, mm; its teeth are `GearSpec.teeth`, the module and pressure angle those of the worm */
export interface WheelSpec { starts: number; diameter: number; width: number }

export interface WormGeometry {
  starts: number; module: number; alpha: number; tanA: number;
  /** pitch, root and tip radii of the worm */ rp: number; rRoot: number; rTip: number;
  /** pitch of the thread along the axis (pi m) and the lead, the way a turn carries it (starts x that) */ px: number; lead: number;
  /** half the width of the thread along the axis at radius r */ half: (r: number) => number;
}
const WORM_STARTS = 4;

/** The geometry from the numbers of a worm or of the wheel for it, or why there is none. */
export function wormGeometry(starts: number, module: number, pressureDeg: number | undefined, diameter: number): Result<WormGeometry> {
  const k = Math.round(starts);
  if (!Number.isFinite(k) || k < 1 || k > WORM_STARTS) return err(`a worm has 1 to ${WORM_STARTS} starts`);
  if (!Number.isFinite(module) || module <= 0) return err("the module must be above zero");
  const alpha = ((pressureDeg ?? 20) * Math.PI) / 180;
  if (!(alpha >= (10 * Math.PI) / 180 && alpha <= (30 * Math.PI) / 180)) return err("the pressure angle of a worm must be from 10 to 30 degrees");
  if (!(diameter > 0)) return err("the diameter of the worm must be above zero");
  const rp = diameter / 2, rRoot = rp - 1.25 * module, rTip = rp + module;
  if (!(rRoot > 1.5 * module)) return err("the worm is too thin for its module: a bigger diameter or a smaller module");
  const tanA = Math.tan(alpha), px = Math.PI * module;
  const half = (r: number) => px / 4 - (r - rp) * tanA;
  if (!(half(rTip) > 0.05 * module)) return err("the thread would be pointed at its tip: a smaller pressure angle");
  if (!(2 * half(rRoot) < 0.95 * px)) return err("the threads would meet at their root: a smaller pressure angle");
  return ok({ starts: k, module, alpha, tanA, rp, rRoot, rTip, px, lead: k * px, half });
}

/** The geometry of the worm a spec makes. */
export function wormOf(spec: GearSpec): Result<WormGeometry> {
  const w = spec.worm;
  if (!w) return err("not a worm");
  const g = wormGeometry(spec.teeth, spec.module, spec.pressure, w.diameter);
  if (!g.ok) return g;
  if (!(w.length >= 2 * g.value.lead)) return err(`the worm must be at least two leads (${(2 * g.value.lead).toFixed(1)} mm) long`);
  if (w.length > 40 * g.value.lead) return err("the worm is too long for its lead");
  const bore = spec.bore ?? 0;
  if (bore < 0 || bore >= 1.8 * g.value.rRoot) return err("the bore must be smaller than the worm's root diameter");
  if (spec.flat || spec.key || spec.keyDepth !== undefined) return err("a worm has a round bore only");
  return g;
}

/** What the worm's steps are made of, along the axis from its middle: the core from -L/2 to L/2; each start one thread, its figure a trapezoid at its first tooth's place `a0 + j px`, carried `sweep` mm along the axis (the thread ends inside the core). */
export function wormLayout(g: WormGeometry, length: number): { base: number; a0: number; sweep: number; figure: [number, number][] } {
  const base = g.rRoot - 0.5 * g.module; // (the thread's foot reaches a little into the core, so the two join)
  const hb = g.half(base);
  const edge = hb + 0.5; // (the thread stays this far inside the core's ends: a thread that touches an end face exactly is a join the kernel cannot make)
  const a0 = -length / 2 + edge;
  const sweep = length - 2 * edge - (g.starts - 1) * g.px;
  return { base, a0, sweep, figure: [[hb, base], [g.half(g.rTip), g.rTip], [-g.half(g.rTip), g.rTip], [-hb, base]] }; // (counter-clockwise in (axis, radius): a thread swept from a figure drawn the other way round is a solid turned inside out)
}

/** The numbers of a worm wheel (a `GearSpec` with `wheel`): the worm it is for and what follows from the two. */
export interface WheelGeometry {
  worm: WormGeometry; z: number; rw: number;
  /** the distance from the wheel's axis to the worm's */ cd: number;
  /** the throat: the distance from the worm's axis to the wheel's tip surface, an arc about it */ throat: number;
  width: number;
  /** the radius of the tip surface at height h from the middle plane (an arc about the worm's axis) and of the root circle there */
  tipAt: (h: number) => number; rootAt: (h: number) => number;
}
export function wheelOf(spec: GearSpec): Result<WheelGeometry> {
  const w = spec.wheel;
  if (!w) return err("not a worm wheel");
  const g = wormGeometry(w.starts, spec.module, spec.pressure, w.diameter);
  if (!g.ok) return g;
  const z = Math.round(spec.teeth);
  if (!Number.isFinite(z) || z < 12 || z > 200) return err("a worm wheel needs 12 to 200 teeth");
  if (z < g.value.starts * 8) return err("a worm wheel needs at least 8 teeth to a start");
  const worm = g.value, rw = (spec.module * z) / 2, cd = rw + worm.rp, throat = worm.rRoot + 0.25 * spec.module;
  if (!(w.width > 0 && w.width < 1.8 * throat * 0.7)) return err(`the width of the wheel must be from 0 to ${(1.26 * throat).toFixed(1)} mm for this worm`);
  const bore = spec.bore ?? 0;
  if (bore < 0 || bore >= 2 * (cd - worm.rTip) * 0.9) return err("the bore must be smaller than the wheel's root circle");
  if (spec.flat || spec.key || spec.keyDepth !== undefined) return err("a worm wheel has a round bore only");
  const tipAt = (h: number) => cd - Math.sqrt(throat * throat - h * h);
  const rootAt = (h: number) => cd - Math.sqrt(worm.rTip * worm.rTip - h * h);
  return ok({ worm, z, rw, cd, throat, width: w.width, tipAt, rootAt });
}

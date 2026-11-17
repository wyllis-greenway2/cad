// Worm gears (`dec_worm_gears`, `in_608`): the worm and the numbers it shares with its wheel. A worm is a screw whose section through its axis is the tooth of a rack (the ZA worm: straight flanks in the axial section): its
// thread is that tooth carried along a helix (`dec_spiral_extrude`) on a core. Pure maths: the axial coordinate a runs along the axis from the middle of the worm and the radius rho from the axis.
//
// The numbers: the axial module m (the thread's pitch along the axis is pi m), the axial pressure angle, the number of starts k (the lead is k pi m, so one turn carries the thread k pitches), the pitch diameter d (the
// worm has no teeth to count: the diameter is free, and the lead angle atan(k m / d) follows from it), the length of the core. The thread stands out an addendum m beyond the pitch circle and goes a dedendum 1.25 m below it.
import { boreProblem } from "./bore.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { GearSpec } from "./gear.ts";

/** a worm: its pitch diameter and the length of its core, mm; its starts are `GearSpec.teeth`, its axial module `module`, its axial pressure angle `pressure` */
export interface WormSpec {
  diameter: number; length: number;
  /** the plain shaft at each end, in mm (`in_696`): 0 is a worm whose thread runs the whole length and is cut flat at the ends; left out, two modules (less on a short worm) */
  journal?: number;
  /** how long the thread takes to run out into the shaft at each end of a worm with journals, in mm: 0 is a thread that stops square; left out, a pitch or two */
  runout?: number;
}
/** a worm wheel: the pitch diameter of the worm it is for, the worm's starts, and its own width, mm; its teeth are `GearSpec.teeth`, the module and pressure angle those of the worm */
export interface WheelSpec { starts: number; diameter: number; width: number; /** a straight land at each face, mm (`in_758`): the throated part is `width` wide and the wheel `width` + 2 `land`; none (0) is the wheel as it was */ land?: number }

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
  if (w.journal !== undefined && !(w.journal === 0 || (w.journal >= 1 && w.journal * 4 < w.length))) return err("the journal (the plain shaft at each end) is 0 for a thread that runs the whole length, or from 1 mm up to a quarter of the length");
  if (w.runout !== undefined && !(w.runout >= 0 && w.runout <= 3 * g.value.lead)) return err("the run-out of the thread is from 0 to three leads");
  const ends = wormLayout(g.value, w);
  if (!ends.flush && !(ends.sweep >= 0.5 * g.value.lead)) return err("the worm is too short for its journals: a longer worm or shorter journals");
  const shape = boreProblem(spec, g.value.rRoot);
  if (shape) return err(shape);
  return g;
}

/**
 * What the worm's steps are made of, along the axis from its middle: the core and each start's thread, its figure a trapezoid at its first tooth's place `a0 + j px`, carried `sweep` along its helix (`in_608`).
 * A worm with journals (the default) has its thread start `journal` from each end of the core, and the thread runs out into the shaft over `runout` (a cone cut, `figures`); a worm with none (`journal` 0, `flush`) has the core and
 * the thread longer than the worm and cut flat at its ends, so the thread runs the whole length (`in_696`).
 */
export function wormLayout(g: WormGeometry, w: WormSpec): { base: number; a0: number; sweep: number; figure: [number, number][]; flush: boolean; journal: number; runout: number; /** the core's length: the worm's, or longer to be cut flat */ core: number; /** the figures (axial place, radius) that are cut away after the threads: the run-outs, or the two ends */ cuts: [number, number][][] } {
  const base = g.rRoot - 0.5 * g.module; // (the thread's foot reaches a little into the core, so the two join)
  const hb = g.half(base);
  const stagger = (g.starts - 1) * g.px;
  const room = (w.length - g.lead - 2 * hb - stagger) / 2; // (the most a journal can be, for a thread of a lead)
  const journal = w.journal ?? Math.max(1, Math.min(2 * g.module, room));
  const flush = journal === 0;
  // a worm with journals: the thread's wall at its start (as wide as the tooth) lies in the plain shaft, so that the run-out begins where the shaft ends, `journal` from the end of the worm; the thread stays 0.5 clear of the core's end (a thread that touches an end face exactly is a join the kernel cannot make)
  const edge = flush ? hb + 0.5 : Math.max(hb + 0.5, journal - hb);
  const over = flush ? hb + 0.5 + stagger + 1 : 0; // (a worm cut flat: the core and the thread go this far beyond each end)
  const core = w.length + 2 * over;
  const a0 = -core / 2 + edge;
  const sweep = core - 2 * edge - stagger;
  const figure: [number, number][] = [[hb, base], [g.half(g.rTip), g.rTip], [-g.half(g.rTip), g.rTip], [-hb, base]]; // (counter-clockwise in (axis, radius): a thread swept from a figure drawn the other way round is the wrong way out)
  const runout = flush ? 0 : w.runout ?? Math.max(0, Math.min(1.5 * g.lead, 0.4 * (sweep - 2 * hb - stagger)));
  const e = 0, top = g.rTip + 1.5; // (the cone starts exactly at the root's radius, the core's own surface: a cut a hair above it leaves a sliver of thread the kernel calls self-crossing)
  const cuts: [number, number][][] = [];
  if (flush) for (const s of [-1, 1]) { const [x0, x1] = [s * w.length / 2, s * (core / 2 + 1)]; cuts.push([[x0, 0], [x1, 0], [x1, top], [x0, top]]); } // (what is beyond the ends)
  else if (runout > 0) { // (the cone the thread comes out of at the start, and goes into at the end: from the root's radius at the thread's end to its full height a run-out away)
    // the end face of a thread is a flat wall as wide as the tooth: the cone is at the root's radius where that wall ends (its far edge, `hb` past the thread's start and `hb` before its stop, the later start and the earlier stop of the starts) and rises to the full height a run-out beyond, so the wall is gone and not a wedge of it (`in_719`)
    const [xs, xe] = [a0 + stagger + hb, a0 + sweep - hb];
    const pad = 2 * hb + stagger + 1; // (the cone goes on at the root's radius over the whole of the thread's end, where the wall stood)
    cuts.push([[xs - pad, g.rRoot + e], [xs, g.rRoot + e], [xs + runout, g.rTip + e], [xs + runout, top], [xs - pad, top]]);
    cuts.push([[xe - runout, g.rTip + e], [xe, g.rRoot + e], [xe + pad, g.rRoot + e], [xe + pad, top], [xe - runout, top]]); // (counter-clockwise like the first)
  }
  return { base, a0, sweep, figure, flush, journal, runout, core, cuts };
}

/** The numbers of a worm wheel (a `GearSpec` with `wheel`): the worm it is for and what follows from the two. */
export interface WheelGeometry {
  worm: WormGeometry; z: number; rw: number;
  /** the distance from the wheel's axis to the worm's */ cd: number;
  /** the throat: the distance from the worm's axis to the wheel's tip surface, an arc about it */ throat: number;
  width: number; /** the straight land at each face, mm: the tooth section carried straight out to the face, cut back by the worm's envelope */ land: number; /** the radius of the cylinder about the worm's axis the land is cut back by: the thread's tip circle and a tenth of a module beyond it */ clear: number;
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
  const land = w.land ?? 0;
  if (!(land >= 0 && land <= 4 * spec.module)) return err("the land at each face of the wheel must be from 0 to 4 modules");
  const bore = spec.bore ?? 0;
  if (bore < 0 || bore >= 2 * (cd - worm.rTip) * 0.9) return err("the bore must be smaller than the wheel's root circle");
  const shape = boreProblem(spec, cd - worm.rTip);
  if (shape) return err(shape);
  const clear = worm.rTip + 0.1 * spec.module;
  const tipAt = (h: number) => cd - Math.sqrt(throat * throat - h * h);
  const rootAt = (h: number) => cd - Math.sqrt(worm.rTip * worm.rTip - h * h);
  return ok({ worm, z, rw, cd, throat, width: w.width, land, clear, tipAt, rootAt });
}

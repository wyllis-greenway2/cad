// The gear assemblies that come as models (`dec_gear_models`), as one list: for each, its numbers (with what they mean), the size it has overall, how to make it, and the simple picture of it that is shown while it is being placed. The tool
// (`interaction/tools.ts`) works on this list without knowing which model it has. Pure.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Place, ModelBuild } from "./modelparts.ts";
import { gearboxSteps, gearboxProblem, gearboxRatio, gearboxFootprint, GEARBOX_START } from "./modelgearbox.ts";
import type { GearboxSpec } from "./modelgearbox.ts";
import { bearingParts } from "./modelbearing.ts";
import { Builder } from "./modelparts.ts";
import { BEARINGS, bearingRow, bearingFromNums } from "./bearingdata.ts";
import { differentialSteps, differentialProblem, differentialExtent, DIFFERENTIAL_START } from "./modeldifferential.ts";
import type { DifferentialSpec } from "./modeldifferential.ts";
import { cycloidalSteps, cycloidalProblem, cycloidalRatio, cycloidalRim, discOutline, CYCLOIDAL_START } from "./modelcycloidal.ts";
import type { CycloidalSpec } from "./modelcycloidal.ts";

export type ModelKind = "gearbox" | "ballbearing" | "differential" | "cycloidal";
export const MODEL_KINDS: readonly ModelKind[] = ["gearbox", "ballbearing", "differential", "cycloidal"];
/** The numbers of a model, by name */
export type Nums = Record<string, number>;
/** One number of a model: what it is called, a line that says what it is, and whether it grows with the overall size (a length of the thing, not a room left for the printer or a count) */
export interface ModelField { key: string; label: string; hint: string; scaled?: true }
/** a picture made of lines in the model's plan, each line a list of points (closed ones repeat their first) */
export type Lines = [number, number][][];

interface Def {
  title: string;
  fields: ModelField[];
  start: Nums;
  problem: (n: Nums) => string | null;
  /** the longest way across the model, in its plan (mm), and the middle of it */
  extent: (n: Nums) => number;
  centre: (n: Nums) => [number, number];
  build: (n: Nums, place: Place) => Result<ModelBuild>;
  outline: (n: Nums) => Lines;
  /** a line under the numbers: what the model does */
  about: (n: Nums) => string;
}
const circle = (cx: number, cy: number, r: number, count = 40): [number, number][] => Array.from({ length: count + 1 }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / count), cy + r * Math.sin((2 * Math.PI * i) / count)] as [number, number]);
const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const F = (key: string, label: string, hint: string, scaled?: true): ModelField => ({ key, label, hint, ...(scaled ? { scaled } : {}) });

const catalogueShape = bearingFromNums;
const catalogueProblem = (n: Nums): string | null => { const s = catalogueShape(n); return typeof s === "string" ? s : null; };
const gb = (n: Nums): GearboxSpec => n as unknown as GearboxSpec;
const df = (n: Nums): DifferentialSpec => n as unknown as DifferentialSpec;
const cy = (n: Nums): CycloidalSpec => n as unknown as CycloidalSpec;

const DEFS: Record<ModelKind, Def> = {
  gearbox: {
    title: "Reduction gearbox",
    fields: [F("stages", "Stages", "1 to 4: a pinion and a gear each, in a layer of its own"), F("pinion", "Pinion teeth", "10 or more"), F("gear", "Gear teeth", "the pinion's teeth times 1.5 to 6"), F("module", "Module", "mm of pitch diameter a tooth", true), F("width", "Gear thickness", "mm", true), F("rod", "Rod diameter", "the rods the gears sit on", true), F("fit", "Bore room", "between a gear's bore and its rod; 0: a press fit"), F("bearing", "Plate room", "between a plate's hole and a rod: the rods turn in them"), F("plate", "Plate thickness", "mm", true), F("gap", "Layer gap", "between the layers and the plates")],
    start: { ...GEARBOX_START },
    problem: (n) => gearboxProblem(gb(n)),
    extent: (n) => { const f = gearboxFootprint(gb(n)); return Math.max(f.x1 - f.x0, 2 * f.hy); },
    centre: (n) => { const f = gearboxFootprint(gb(n)); return [(f.x0 + f.x1) / 2, 0]; },
    build: (n, place) => gearboxSteps(gb(n), place),
    outline: (n) => {
      const s = gb(n), f = gearboxFootprint(s), r = (z: number) => (s.module * z) / 2;
      return [rect(f.x0, -f.hy, f.x1, f.hy), ...f.rods.map((x) => circle(x, 0, s.rod / 2, 16)), ...f.rods.flatMap((x, i) => [...(i < s.stages ? [circle(x, 0, r(s.pinion))] : []), ...(i > 0 ? [circle(x, 0, r(s.gear))] : [])])];
    },
    about: (n) => `${gearboxRatio(gb(n)).toFixed(2)} : 1 in all (${(n.gear! / n.pinion!).toFixed(2)} a stage)`,
  },
  ballbearing: {
    title: "Deep groove ball bearing",
    fields: [
      F("number", "Bearing number", "a catalogue deep groove ball bearing: 623 to 627, 607 to 609, 6000 to 6006, 6200 to 6206; 0 makes one of your own from the numbers below"),
      F("detail", "Detail", "0: simple (two plain rings); 1: detailed (grooves and balls)"),
      F("bore", "Bore", "mm (a bearing of your own: number 0)"), F("outer", "Outside diameter", "mm (a bearing of your own)"), F("width", "Width", "mm (a bearing of your own)"),
      F("ring", "Inner ring outside diameter", "mm (a bearing of your own; 0: from the balls)"),
      F("clearance", "Room round a ball", "mm all round it, detailed only: the balls are bodies of their own and must not touch the rings"),
      F("balls", "Balls", "detailed only; 0: the catalogue's, or a typical set"), F("ball", "Ball diameter", "mm, detailed only; 0: the catalogue's, or a typical one")],
    start: { number: 608, detail: 0, bore: 8, outer: 22, width: 7, ring: 0, clearance: 0.02, balls: 0, ball: 0 },
    problem: (n) => catalogueProblem(n),
    extent: (n) => { const sh = catalogueShape(n); return typeof sh === "string" ? 0 : sh.outer; },
    centre: () => [0, 0],
    build: (n, place) => { const sh = catalogueShape(n); if (typeof sh === "string") return err(sh); const b = new Builder(place); bearingParts(b, { ...sh, detail: sh.detail }); return ok(b.build()); },
    outline: (n) => {
      const sh = catalogueShape(n);
      if (typeof sh === "string") return [];
      return [circle(0, 0, sh.outer / 2, 64), circle(0, 0, sh.bore / 2, 48), circle(0, 0, sh.pitch - sh.surface, 48), circle(0, 0, sh.pitch + sh.surface, 48), ...Array.from({ length: sh.detail ? sh.balls : 0 }, (_, k) => circle(sh.pitch * Math.cos((2 * Math.PI * k) / sh.balls), sh.pitch * Math.sin((2 * Math.PI * k) / sh.balls), sh.rb, 14))];
    },
    about: (n) => { const sh = catalogueShape(n); return typeof sh === "string" ? "" : `${sh.number ? sh.number : "your own"}: ${sh.bore} x ${sh.outer} x ${sh.width} mm, inner ring ${(2 * (sh.pitch - sh.surface)).toFixed(1)} mm across${sh.detail ? `, ${sh.balls} balls of ${(2 * sh.rb).toFixed(2)} mm${sh.typical ? " (a typical set)" : ""}` : " (simple: two rings)"}; the outer ring is held, the inner turns`; },
  },
  differential: {
    title: "Differential",
    fields: [F("side", "Side gear teeth", "even"), F("spider", "Spider gear teeth", "fewer than the side gears"), F("module", "Module", "mm", true), F("axle", "Axle diameter", "mm", true), F("pin", "Cross pin diameter", "mm", true), F("fit", "Bore room", "between a gear's bore and what is through it"), F("room", "Cage hole room", "between a hole in the cage and what is through it"), F("wall", "Cage wall", "mm", true), F("cap", "Cap thickness", "mm", true), F("drive", "Drive gear teeth", "0 for none"), F("driveModule", "Drive gear module", "mm", true), F("driveWidth", "Drive gear thickness", "mm", true)],
    start: { ...DIFFERENTIAL_START },
    problem: (n) => differentialProblem(df(n)),
    extent: (n) => { const e = differentialExtent(df(n)); return e ? Math.max(2 * e.reach, 2 * Math.max(e.outer, e.drive)) : 0; },
    centre: () => [0, 0],
    build: (n, place) => differentialSteps(df(n), place),
    outline: (n) => {
      const e = differentialExtent(df(n));
      if (!e) return [];
      const s = df(n), tipS = (s.module * s.side) / 2 + s.module, tipP = (s.module * s.spider) / 2 + s.module;
      return [rect(-e.half, -e.outer, e.half, e.outer), rect(-e.reach, -s.axle / 2, e.reach, s.axle / 2), [[-e.bigS, -tipS], [-e.bigS, tipS], [0, 0], [-e.bigS, -tipS]], [[e.bigS, -tipS], [e.bigS, tipS], [0, 0], [e.bigS, -tipS]], [[-tipP, e.bigP], [tipP, e.bigP], [0, 0], [-tipP, e.bigP]], [[-tipP, -e.bigP], [tipP, -e.bigP], [0, 0], [-tipP, -e.bigP]], ...(e.drive ? [rect(-s.driveWidth / 2, -e.drive, s.driveWidth / 2, e.drive)] : [])];
    },
    about: () => "two side gears, two spiders on a cross pin, a cage, two axles and a drive gear",
  },
  cycloidal: {
    title: "Cycloidal drive",
    fields: [F("pins", "Ring pins", "the disc has one lobe fewer: the ratio is that number"), F("circle", "Pin circle radius", "mm", true), F("pin", "Ring pin diameter", "mm", true), F("ecc", "Eccentricity", "how far the disc's middle stands off the shaft's", true), F("play", "Disc room", "the disc is taken in by this much all round, so it runs free"), F("disc", "Disc thickness", "mm", true), F("outPins", "Output pins", "3 or more"), F("outCircle", "Output pin circle radius", "mm", true), F("outPin", "Output pin diameter", "mm", true), F("shaft", "Input shaft diameter", "mm", true), F("cam", "Eccentric radius", "mm", true), F("plate", "Plate thickness", "mm", true), F("gap", "Layer gap", "mm"), F("room", "Shaft room in the plates", "mm")],
    start: { ...CYCLOIDAL_START },
    problem: (n) => cycloidalProblem(cy(n)),
    extent: (n) => 2 * cycloidalRim(cy(n)),
    centre: () => [0, 0],
    build: (n, place) => cycloidalSteps(cy(n), place),
    outline: (n) => {
      const s = cy(n);
      const disc = s.pins >= 3 && s.ecc > 0 && s.circle > s.ecc * s.pins ? discOutline(s, 12 * (Math.round(s.pins) - 1)).map(([x, y]) => [x + s.ecc, y] as [number, number]) : [];
      if (disc.length) disc.push(disc[0]!);
      return [circle(0, 0, cycloidalRim(s), 64), ...Array.from({ length: Math.max(0, Math.round(s.pins)) }, (_, k) => circle(s.circle * Math.cos((2 * Math.PI * k) / s.pins), s.circle * Math.sin((2 * Math.PI * k) / s.pins), s.pin / 2, 12)), ...(disc.length ? [disc] : []), circle(0, 0, s.shaft / 2, 16)];
    },
    about: (n) => `${cycloidalRatio(cy(n))} : 1, the output turning the other way`,
  },
};

export const modelTitle = (k: ModelKind): string => DEFS[k].title;
export const modelFields = (k: ModelKind): ModelField[] => DEFS[k].fields;
export const modelAbout = (k: ModelKind, n: Nums): string => DEFS[k].about(n);
export const modelProblem = (k: ModelKind, n: Nums): string | null => DEFS[k].problem(n);
export const modelExtent = (k: ModelKind, n: Nums): number => DEFS[k].extent(n);
export const modelCentre = (k: ModelKind, n: Nums): [number, number] => DEFS[k].centre(n);
export const modelBuild = (k: ModelKind, n: Nums, place: Place): Result<ModelBuild> => DEFS[k].build(n, place);
export const modelOutline = (k: ModelKind, n: Nums): Lines => DEFS[k].outline(n);
export const modelStart = (k: ModelKind): Nums => ({ ...DEFS[k].start });

const tidy = (key: string, v: number): number => (key === "module" || key === "driveModule" ? Math.round(v * 20) / 20 : Math.round(v * 100) / 100);

/**
 * The numbers a model has: the usual ones, with each number that was typed in place of the usual. A length that is typed also says how big the model is, so the lengths not typed follow it by the same factor (a module of 1 where 1.5 is usual: every
 * length two thirds of what it was); and, given an overall size (mm across the longest way), every length that was not typed is grown or shrunk by the one factor that makes the model that big (the rooms and the counts stay as they are; the numbers
 * typed are not moved). Found by halving: the size grows with the factor. A factor at which the model cannot be made (a size the numbers cannot reach, or a scale too small for the teeth) is not chosen: the nearest that can be made is.
 */
export function modelNumbers(kind: ModelKind, typed: Nums, size?: number): Nums {
  const d = DEFS[kind];
  if (kind === "ballbearing") { // (a catalogue bearing has the sizes of its number: a size asked for picks the bearing whose outside diameter is nearest; number 0, a bearing of your own, takes the size as its outside diameter; what is typed wins)
    const n: Nums = { ...d.start, ...typed };
    if (typed.number === undefined && size !== undefined && size > 0) n.number = [...BEARINGS].sort((x, y) => Math.abs(x.D - size) - Math.abs(y.D - size) || Math.abs(x.number - d.start.number!) - Math.abs(y.number - d.start.number!))[0]!.number;
    else if (n.number === 0 && typed.outer === undefined && size !== undefined && size > 0) n.outer = size;
    const row = Math.round(n.number!) === 0 ? undefined : bearingRow(Math.round(n.number!));
    if (row) { n.bore = row.d; n.outer = row.D; n.width = row.B; n.ring = 0; const sh = catalogueShape(n); if (typeof sh !== "string") n.ring = Math.round(2 * (sh.pitch - sh.surface) * 100) / 100; } // (the numbers shown are the bearing's)
    return n;
  }
  const at = (f: number): Nums => {
    const n: Nums = { ...d.start };
    for (const fl of d.fields) if (fl.scaled) n[fl.key] = tidy(fl.key, d.start[fl.key]! * f);
    return { ...n, ...typed };
  };
  const free = d.fields.some((fl) => fl.scaled && typed[fl.key] === undefined);
  if (size === undefined || !(size > 0) || !free) {
    const lead = d.fields.find((fl) => fl.scaled && typed[fl.key] !== undefined && d.start[fl.key]! > 0);
    return lead ? at(typed[lead.key]! / d.start[lead.key]!) : at(1);
  }
  const reach = (f: number): number => d.extent(at(f)); // (0 where the model cannot be made)
  let [lo, hi] = [0.02, 200];
  for (let i = 0; i < 60; i++) { const mid = Math.sqrt(lo * hi); if (reach(mid) < size) lo = mid; else hi = mid; }
  for (const f of [Math.sqrt(lo * hi), hi, lo * 1.5, 1]) if (reach(f) > 0 && !d.problem(at(f))) return at(f);
  return at(1);
}

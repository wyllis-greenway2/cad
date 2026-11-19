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
import { engineSteps, engineProblem, engineGeometry, engineFootprint, engineDisplacement, ENGINE_START, ENGINE_PRESETS } from "./modelengine.ts";
import type { EngineSpec } from "./modelengine.ts";
import { wheelSteps, wheelProblem, wheelLines, WHEEL_START } from "./modelwheel.ts";
import type { WheelSpec } from "./modelwheel.ts";

export type ModelKind = "gearbox" | "ballbearing" | "differential" | "cycloidal" | "engine" | "wheel";
export const MODEL_KINDS: readonly ModelKind[] = ["gearbox", "ballbearing", "differential", "cycloidal", "engine", "wheel"];
/** The numbers of a model, by name */
export type Nums = Record<string, number>;
/** One number of a model: what it is called, a line that says what it is, and whether it grows with the overall size (a length of the thing, not a room left for the printer or a count) */
export interface ModelField { key: string; label: string; hint: string; scaled?: true; /** shown only while the number `key` has this value (a bearing's box shows the numbers of the source chosen at its top, `in_1196`) */ when?: { key: string; is: number }; /** shown at the top of the box, above the size and the turn */ top?: true; /** the names of the values of a field that is a toggle button (its value is the place of the one chosen) */ choices?: string[] }
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
const en = (n: Nums): EngineSpec => n as unknown as EngineSpec;
const wh = (n: Nums): WheelSpec => n as unknown as WheelSpec;

const BEARING_START: Nums = { own: 0, number: 608, detail: 0, bore: 8, outer: 22, width: 7, ring: 0, clearance: 0.02, balls: 0, ball: 0 };
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
      { ...F("own", "Source", "a bearing from the catalogue, or one of your own numbers"), choices: ["Catalogue", "Your own"], top: true },
      { ...F("number", "Bearing number", "623 to 627, 607 to 609, 6000 to 6006, 6200 to 6206; the Size box picks the one nearest an outside diameter"), when: { key: "own", is: 0 } },
      { ...F("detail", "Detail", "simple: two plain rings; detailed: the grooves and the balls"), choices: ["Simple", "Detailed"], when: { key: "own", is: 1 } },
      { ...F("bore", "Bore", "mm", true), when: { key: "own", is: 1 } }, { ...F("outer", "Outside diameter", "mm", true), when: { key: "own", is: 1 } }, { ...F("width", "Width", "mm", true), when: { key: "own", is: 1 } },
      { ...F("ring", "Inner ring outside diameter", "mm; 0: from the balls", true), when: { key: "own", is: 1 } },
      { ...F("clearance", "Room round a ball", "mm all round it, detailed only: the balls are bodies of their own and must not touch the rings"), when: { key: "own", is: 1 } },
      { ...F("balls", "Balls", "detailed only; 0: a typical set"), when: { key: "own", is: 1 } }, { ...F("ball", "Ball diameter", "mm, detailed only; 0: a typical one", true), when: { key: "own", is: 1 } }],
    start: BEARING_START,
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
  engine: {
    title: "Piston engine",
    fields: [{ ...F("preset", "Engine", "a real engine's bore, stroke and pin (the Honda service manual) to start from, or your own numbers; a number you type replaces the preset's"), choices: ["Your own", ...ENGINE_PRESETS.map((e) => e.name)], top: true }, F("bore", "Bore", "mm: the cylinder's diameter", true), F("stroke", "Stroke", "mm: twice the crank's radius", true), F("ratio", "Rod ratio", "the crank's radius over the rod's length: 0.25 to 0.33 is usual"), F("pin", "Piston pin diameter", "mm: 0.25 to 0.3 of the bore is usual", true), F("shaft", "Shaft diameter", "mm", true), F("wall", "Wall", "mm: the floor and the cylinder's wall", true), F("flywheel", "Flywheel diameter", "mm", true), F("rings", "Ring grooves", "0 to 3"), F("room", "Room", "mm all round the moving parts")],
    start: { ...ENGINE_START },
    problem: (n) => engineProblem(en(n)),
    extent: (n) => { if (engineProblem(en(n))) return 0; const f = engineFootprint(en(n)); return Math.max(f.x1 - f.x0, 2 * f.hy); },
    centre: (n) => { if (engineProblem(en(n))) return [0, 0]; const f = engineFootprint(en(n)); return [(f.x0 + f.x1) / 2, 0]; },
    build: (n, place) => engineSteps(en(n), place),
    outline: (n) => {
      const s = en(n);
      if (engineProblem(s)) return [];
      const g = engineGeometry(s), f = engineFootprint(s);
      return [rect(f.x0, -f.hy, f.x1, f.hy), rect(g.x0, -g.ro, g.x1 + s.wall, g.ro), rect(g.x0, -s.bore / 2, g.x1, s.bore / 2), circle(0, 0, g.rweb, 40), circle(0, 0, s.flywheel / 2, 48), circle(g.r, 0, g.cp / 2, 16), circle(g.r + g.l, 0, s.pin / 2, 16), [[g.r, 0], [g.r + g.l, 0]]];
    },
    about: (n) => { const s = en(n), p = ENGINE_PRESETS[Math.round(s.preset) - 1]; return `${p ? p.name + ": " : ""}${engineDisplacement(s).toFixed(1)} cm3, rod ${(s.stroke / 2 / s.ratio).toFixed(1)} mm long; the crank turns the rod and the piston by the exact slider-crank; the ring grooves follow Honda's ring heights, and a preset's bore, stroke and pin are Honda's; the other sizes are rules of thumb, not standards`; },
  },
  wheel: {
    title: "Wheel (rim, web, hub)",
    fields: [
      F("outer", "Outside diameter", "mm: the whole wheel", true), F("width", "Rim width", "mm: along the axis", true), F("rim", "Rim thickness", "mm: across, at least 1.2", true),
      F("hub", "Hub diameter", "mm", true), F("hubLen", "Hub length", "mm: along the axis", true), F("bore", "Bore", "mm: the hole for the shaft", true),
      F("web", "Web (spoke) thickness", "mm along the axis: the web and the spokes are this thick", true),
      { ...F("joinKind", "Join", "where the web meets the rim and the hub: a fillet or a chamfer"), choices: ["Fillet", "Chamfer"] }, F("join", "Join size", "mm: at least 0.8 (0.030 in); no corner is left square", true),
      F("draft", "Draft", "degrees the rim's and the hub's walls lean away from the middle: 0 for a machined wheel, 1 to 3 for a cast one"), F("spokes", "Spokes", "0: a plain web; else the number of cutouts in it (3 to 24)"), F("hubOff", "Hub offset", "mm a cutout stops short of the hub (from its wall): 0 and the spokes run into the hub; less than the join and it cuts into the fillet", true), F("rimOff", "Rim offset", "mm a cutout stops short of the rim (from its wall): 0 and the spokes run into the rim; less than the join and it cuts into the fillet", true),
      F("corner", "Cutout corner fillet", "mm: every corner of a cutout is rounded, at least 0.8", true), F("spokeW", "Spoke width", "mm at the hub end", true), F("taper", "Spoke taper", "how much narrower a spoke is at the rim end, as a share of its width (negative: wider)"), F("spiral", "Spiral", "degrees a spoke turns from the hub to the rim (0: straight)")],
    start: { ...WHEEL_START },
    problem: (n) => wheelProblem(wh(n)),
    extent: (n) => (wheelProblem(wh(n)) ? 0 : wh(n).outer),
    centre: () => [0, 0],
    build: (n, place) => wheelSteps(wh(n), place),
    outline: (n) => (wheelProblem(wh(n)) ? [] : wheelLines(wh(n))),
    about: (n) => `${wh(n).outer} mm across, ${Math.round(wh(n).spokes) ? `${Math.round(wh(n).spokes)} cutouts in the web` : "a plain web"}, ${wh(n).bore} mm bore; the proportions are yours${wh(n).draft ? `, ${wh(n).draft} degrees of draft on the rim and hub` : ", no draft"}`,
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
export function modelNumbers(kind: ModelKind, typedIn: Nums, size?: number): Nums {
  const d = DEFS[kind];
  const typed: Nums = kind === "ballbearing" && typedIn.own ? { ...typedIn, number: 0 } : typedIn; // (a bearing of your own is number 0)
  if (kind === "ballbearing" && !typed.own) { // (a catalogue bearing has the sizes of its number and is simple: a size asked for picks the bearing whose outside diameter is nearest; a number typed wins)
    const n: Nums = { ...d.start, ...typed, detail: 0 };
    if (typed.number === undefined && size !== undefined && size > 0) n.number = [...BEARINGS].sort((x, y) => Math.abs(x.D - size) - Math.abs(y.D - size) || Math.abs(x.number - d.start.number!) - Math.abs(y.number - d.start.number!))[0]!.number;
    const row = bearingRow(Math.round(n.number!));
    if (row) { n.bore = row.d; n.outer = row.D; n.width = row.B; n.ring = 0; const sh = catalogueShape(n); if (typeof sh !== "string") n.ring = Math.round(2 * (sh.pitch - sh.surface) * 100) / 100; } // (the numbers shown are the bearing's)
    return n;
  }
  const preset = kind === "engine" ? ENGINE_PRESETS[Math.round(typedIn.preset ?? 0) - 1] : undefined; // (a preset engine is another start: its numbers scale as the usual ones do, `dec_engine_presets`)
  const base: Nums = preset ? { ...d.start, ...(preset.spec as unknown as Nums) } : d.start;
  const at = (f: number): Nums => {
    const n: Nums = { ...base };
    for (const fl of d.fields) if (fl.scaled) n[fl.key] = tidy(fl.key, base[fl.key]! * f);
    return { ...n, ...typed };
  };
  const free = d.fields.some((fl) => fl.scaled && typed[fl.key] === undefined);
  if (size === undefined || !(size > 0) || !free) {
    const lead = d.fields.find((fl) => fl.scaled && typed[fl.key]! > 0 && base[fl.key]! > 0); // (a number typed as 0, an offset that is none, sets no scale)
    return lead ? at(typed[lead.key]! / base[lead.key]!) : at(1);
  }
  const reach = (f: number): number => d.extent(at(f)); // (0 where the model cannot be made)
  let [lo, hi] = [0.02, 200];
  for (let i = 0; i < 60; i++) { const mid = Math.sqrt(lo * hi); if (reach(mid) < size) lo = mid; else hi = mid; }
  for (const f of [Math.sqrt(lo * hi), hi, lo * 1.5, 1]) if (reach(f) > 0 && !d.problem(at(f))) return at(f);
  return at(1);
}

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
import { pistonSteps, pistonProblem, pistonExtent, pistonGeometry, pistonWeight, PISTON_START, PISTON_PRESETS, MATERIALS } from "./modelpiston.ts";
import type { PistonSpec } from "./modelpiston.ts";
import { fitNumbers } from "./modelfit.ts";
import { wheelSteps, wheelCutSteps, wheelProblem, wheelLines, wheelLines3, repairWheel, edgeMade, WHEEL_START } from "./modelwheel.ts";
import type { WheelSpec } from "./modelwheel.ts";

export type ModelKind = "gearbox" | "ballbearing" | "differential" | "cycloidal" | "engine" | "piston" | "wheel" | "wheelcut";
export const MODEL_KINDS: readonly ModelKind[] = ["gearbox", "ballbearing", "differential", "cycloidal", "engine", "piston", "wheel", "wheelcut"];
/** The numbers of a model, by name */
export type Nums = Record<string, number>;
/** One number of a model: what it is called, a line that says what it is, and whether it grows with the overall size (a length of the thing, not a room left for the printer or a count) */
export interface ModelField { key: string; label: string; hint: string; /** the heading the field is listed under in the box (`dec_piston_maker`): a model with many numbers groups them, and the box lets a group be folded */ section?: string; scaled?: true; /** not shown in the box: a number the box's Size sets (`Def.sizeKey`) */ hidden?: true; /** a whole number (teeth, stages, pins): moved a whole step at a time (`modelfit.ts`); `zero`: and 0 is allowed */ whole?: true; zero?: true; /** shown but not the person's to set: it comes from the body the model is cut into (the box shows it dimmed) */ fixed?: true; /** a fixed number is free while this other number has this value (a body with no bore has a bore to set) */ unless?: { key: string; is: number }; /** the key of a fillet-or-chamfer number the box shows as a little toggle beside this one (a radius: 0 a fillet, 1 a chamfer) */ toggle?: string; /** shown only while the number `key` has this value (a bearing's box shows the numbers of the source chosen at its top, `in_1196`) */ when?: { key: string; is: number; /** shown while the number is NOT this value */ not?: true }; /** shown at the top of the box, above the size and the turn */ top?: true; /** the names of the values of a field that is a toggle button (its value is the place of the one chosen) */ choices?: string[] }
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
  /** the number that is the model's Size (the longest way across): typing the Size or sizing with the pointer sets it, and the box does not list it twice (the wheel's outside diameter) */
  sizeKey?: string;
  /** what the box calls the Size (the wheel's is its outer diameter) */
  sizeLabel?: string;
  /** the Size is not the person's to set: it comes from the body the model is cut into (the box shows it dimmed) */
  fixedSize?: true;
  /** the numbers made to fit together: every number not typed (`locked` holds the ones that were) is moved as far as it must for the model to be possible, so that a number typed is met by the others and not refused (the wheel) */
  repair?: (n: Nums, locked: ReadonlySet<string>) => Nums;
  /** the picture of the model in space, when it has one: lines of points (x, y, z) of its own frame (`in_1251`) */
  outline3?: (n: Nums) => [number, number, number][][];
  /** a line under the numbers: what the model does */
  about: (n: Nums) => string;
}
const circle = (cx: number, cy: number, r: number, count = 40): [number, number][] => Array.from({ length: count + 1 }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / count), cy + r * Math.sin((2 * Math.PI * i) / count)] as [number, number]);
const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
/** the numbers that count things (teeth, stages, pins, rings): moved a whole step at a time when the numbers are made to fit; those that may be 0 for none */
const WHOLE = new Set(["stages", "pinion", "gear", "side", "spider", "drive", "pins", "outPins", "rings", "spokes", "balls"]), ZERO = new Set(["drive", "rings", "spokes", "balls"]);
const F = (key: string, label: string, hint: string, scaled?: true): ModelField => ({ key, label, hint, ...(scaled ? { scaled } : {}), ...(WHOLE.has(key) ? { whole: true as const } : {}), ...(ZERO.has(key) ? { zero: true as const } : {}) });

/** The fields in groups, each group under a heading in the box: the fields shown at the top (`top`) first, then each group's fields in the order given; a field left out of every group, or named twice, is a mistake that stops the module (so no number is lost from the box) */
function grouped(fields: ModelField[], groups: readonly (readonly [string, readonly string[]])[]): ModelField[] {
  const out: ModelField[] = fields.filter((f) => f.top), seen = new Set(out.map((f) => f.key));
  for (const [name, keys] of groups) for (const k of keys) {
    const f = fields.find((x) => x.key === k);
    if (!f) throw new Error(`the group ${name} names ${k}, which is not a field`);
    if (seen.has(k)) throw new Error(`${k} is in two groups`);
    seen.add(k);
    out.push({ ...f, section: name });
  }
  for (const f of fields) if (!seen.has(f.key)) throw new Error(`${f.key} is in no group`);
  return out;
}

const GROUPS_ENGINE = (f: ModelField[]): ModelField[] => grouped(f, [
  ["Engine", ["bore", "stroke", "ratio", "shaft", "wall", "flywheel", "room"]],
  ["Piston", ["pin", "rings", "oil", "topLand", "crown", "skirtWall", "drain"]],
  ["Piston fits", ["skirtFit", "pinFit", "ringSide"]]]);
const GROUPS_PISTON = (f: ModelField[]): ModelField[] => grouped(f, [
  ["Size and material", ["bore", "pin", "material", "pinHeight", "skirtLen"]],
  ["Crown", ["crown", "crownShape", "crownHeight", "crownDia", "crownChamfer", "valveReliefs", "reliefDia", "reliefDepth", "reliefOffset"]],
  ["Ring belt", ["rings", "oil", "topLand", "ringHeight", "oilRingHeight", "ringRadial", "land", "backRoom", "ringSide", "topLandRelief", "landRelief"]],
  ["Oil drain holes", ["drain", "drainDia"]],
  ["Skirt", ["skirtWall", "skirtFit", "skirtShape", "oval", "taper", "footChamfer", "skirtStyle", "padAngle"]],
  ["Pin and bosses", ["pinKind", "pinBore", "pinLen", "pinFit", "bossGap", "bossReach", "room"]],
  ["Pin retention", ["retention", "clipWidth", "clipDepth", "clipEdge", "pinFloat"]]]);

const catalogueShape = bearingFromNums;
const catalogueProblem = (n: Nums): string | null => { const s = catalogueShape(n); return typeof s === "string" ? s : null; };
const gb = (n: Nums): GearboxSpec => n as unknown as GearboxSpec;
const df = (n: Nums): DifferentialSpec => n as unknown as DifferentialSpec;
const cy = (n: Nums): CycloidalSpec => n as unknown as CycloidalSpec;
const en = (n: Nums): EngineSpec => n as unknown as EngineSpec;
const pi = (n: Nums): PistonSpec => n as unknown as PistonSpec;
const wh = (n: Nums): WheelSpec => n as unknown as WheelSpec;

const BEARING_START: Nums = { own: 0, number: 608, detail: 0, bore: 8, outer: 22, width: 7, ring: 0, clearance: 0.02, balls: 0, ball: 0 };
function wheelDef(cutting: boolean): Def {
  const def: Def = {
    title: cutting ? "Cut spokes (rim, web, hub in a round body)" : "Wheel (rim, web, hub)",
    sizeLabel: "Outer diameter",
    ...(cutting ? { fixedSize: true as const } : {}),
    fields: [
      { ...F("outer", "Outer diameter", "mm: the whole wheel (the Size)", true), hidden: true },
      F("rimD", "Rim diameter", "mm: the rim's inside, where the web meets it; the rim is (outer diameter - this) / 2 thick across", true), F("hub", "Hub diameter", "mm: the hub's outside", true), F("bore", "Bore diameter", "mm: the hole for the shaft", true),
      ...(["flat", "key", "keyDepth"] as const).map((k) => ({ ...F(k, k === "flat" ? "Bore flat" : k === "key" ? "Key width" : "Key depth", k === "flat" ? "mm: a flat cut this deep into the bore for a D shaped shaft; 0 for none (a bore has a flat or a keyway, not both)" : k === "key" ? "mm: the width of a keyway cut into the bore; 0 for none (DIN 6885 keys: 6 to 8 mm bore 2 wide, to 10 mm 3, to 12 mm 4, to 17 mm 5, to 22 mm 6, to 30 mm 8, to 38 mm 10)" : "mm: the depth of the keyway; leave 0 for the DIN 6885 depth for the bore", true), when: { key: "boreOwned", is: 1, not: true as const } })),
      F("rimT", "Rim thickness", "mm along the axis (the wheel's width at the rim)", true), F("web", "Spoke thickness", "mm along the axis: the web and the spokes are this thick", true), F("hubT", "Hub thickness", "mm along the axis (the hub's length)", true),
      F("spokes", "Spoke count", "0: a plain web; else the number of cutouts in it (3 to 24)"), F("spokeW", "Spoke width", "mm across a spoke, at the hub end", true), F("taper", "Spoke taper", "how much narrower a spoke is at the rim end, as a share of its width (negative: wider)"), F("spiral", "Spoke spiral", "degrees a spoke turns from the hub to the rim (0: straight)"),
      F("rimOff", "Spoke rim offset", "mm a cutout stops short of the rim (from its wall): 0 and the spokes run into the rim; less than the join radius and it cuts into the fillet", true), F("hubOff", "Spoke hub offset", "mm a cutout stops short of the hub (from its wall): 0 and the spokes run into the hub", true),
      { ...F("edge", "Spoke radius", "mm: the radius of the spoke itself, the round on the edges where the cutouts meet the web's faces; 0 for none (a chamfer with the toggle); it is made as big as the web and the spoke allow, and not where a cutout runs into the hub or the rim", true), toggle: "edgeKind" },
      { ...F("corner", "Spoke join radius", "mm: where a cutout's sides meet the hub and the rim; 0 for square; it is made as big as the room between the spokes allows", true), toggle: "cornerKind" },
      { ...F("obtuse", "Spoke obtuse radius", "mm: the same at the blunter corner of a cutout, which a spiral makes (it follows the spoke join radius and the spiral while it is not typed)", true), toggle: "cornerKind", when: { key: "spiral", is: 0, not: true } },
      { ...F("rimJoin", "Rim join radius", "mm: where the web meets the rim; 0 for square", true), toggle: "rimJoinKind" },
      { ...F("hubJoin", "Hub join radius", "mm: where the web meets the hub; 0 for square", true), toggle: "hubJoinKind" },
      F("draft", "Draft", "degrees the rim's and the hub's walls lean away from the middle: 0 for a machined wheel, 1 to 3 for a cast one"),
      ...["cornerKind", "edgeKind", "rimJoinKind", "hubJoinKind"].map((k) => ({ ...F(k, k, ""), choices: ["Fillet", "Chamfer"], hidden: true as const }))],
    start: cutting ? { ...WHEEL_START, hubT: WHEEL_START.rimT, draft: 0 } : { ...WHEEL_START },
    sizeKey: "outer",
    repair: (n, locked) => repairWheel(wh(n), locked, cutting) as unknown as Nums,
    problem: (n) => wheelProblem(wh(n), cutting),
    extent: (n) => (wheelProblem(wh(n), cutting) ? 0 : wh(n).outer),
    centre: () => [0, 0],
    build: (n, place) => (cutting ? wheelCutSteps(wh(n), place) : wheelSteps(wh(n), place)),
    outline: (n) => (wheelProblem(wh(n), cutting) ? [] : wheelLines(wh(n))),
    outline3: (n) => (wheelProblem(wh(n), cutting) ? [] : wheelLines3(wh(n))),
    about: (n) => `${wh(n).outer} mm across, ${Math.round(wh(n).spokes) ? `${Math.round(wh(n).spokes)} cutouts in the web` : "a plain web"}, ${wh(n).bore} mm bore${wh(n).draft ? `, ${wh(n).draft} degrees of draft on the rim and hub` : ", no draft"}${wh(n).edge > 0 && Math.round(wh(n).spokes) > 0 && !edgeMade(wh(n)) ? "; no spoke radius made: it is bigger than the web and the spoke allow, or a cutout runs into the hub or the rim, or is pointed or narrow" : ""}`,
  };
  if (cutting) def.fields = def.fields.map((f) => (["bore", "rimT", "hubT", "draft"].includes(f.key) ? { ...f, fixed: true as const, ...(f.key === "bore" ? { unless: { key: "boreOwned", is: 0 } } : {}) } : f)); // (the bore, the thickness and the draft are the body's: shown, not set; a body with no bore is given one: its bore is free, `in_1259`)
  return def;
}

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
    fields: GROUPS_ENGINE([{ ...F("preset", "Start from", "a Honda engine's bore, stroke and pin (the service manual), or your own numbers; a number you type replaces the preset's"), choices: ["Your own", ...ENGINE_PRESETS.map((e) => e.name.replace("Honda ", ""))], top: true }, F("bore", "Bore", "mm: the cylinder's diameter", true), F("stroke", "Stroke", "mm: twice the crank's radius", true), F("ratio", "Rod ratio", "the crank's radius over the rod's length: 0.25 to 0.33 is usual"), F("pin", "Piston pin diameter", "mm: 0.25 to 0.3 of the bore is usual", true), F("shaft", "Shaft diameter", "mm", true), F("wall", "Wall", "mm: the floor and the cylinder's wall", true), F("flywheel", "Flywheel diameter", "mm", true), F("rings", "Ring grooves", "0 to 3 compression rings"), F("oil", "Oil ring groove", "0 or 1: Honda's pack is two compression rings and an oil ring"), F("topLand", "Top land", "of the bore, above the top ring groove (assumed: 0.04 to 0.10 is usual)"), F("crown", "Crown thickness", "of the bore, the piston is hollow (assumed: 0.04 to 0.15)"), F("drain", "Oil drain holes", "per side, through the oil ring groove into the piston (assumed: 0 to 4)"), F("skirtWall", "Piston wall", "of the bore: the skirt and under the ring grooves (assumed: half the crown)"), F("room", "Room", "mm all round the moving parts that are not the piston's own fits: the shaft, the rod's eyes, the slot"), F("skirtFit", "Piston room in the bore", "mm across; Honda 0.015 to 0.050"), F("pinFit", "Pin room in the piston", "mm across; Honda 0.002 to 0.014"), F("ringSide", "Ring side room", "mm above and below a ring in its groove; Honda 0.015 to 0.045")]),
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
  wheel: wheelDef(false),
  wheelcut: wheelDef(true),
  piston: {
    title: "Piston",
    fields: GROUPS_PISTON([{ ...F("preset", "Start from", "a Honda engine's bore and pin (the service manual), or your own numbers; a number you type replaces the preset's"), choices: ["Your own", ...PISTON_PRESETS.map((e) => e.name.replace("Honda ", ""))], top: true },
      F("bore", "Bore", "mm: the cylinder's diameter", true), F("pin", "Pin diameter", "mm: 0.25 to 0.3 of the bore is usual", true),
      { ...F("material", "Material", "the piston's: its density gives the weight and its room in the bore (a number typed in Room in the bore replaces it)"), choices: MATERIALS.map((m) => m.name) }, { ...F("pinKind", "Pin", "solid or hollow (the pin and the circlips are steel)"), choices: ["Solid", "Hollow"] }, F("pinBore", "Pin bore", "mm; 0: 0.55 of the pin (assumed)", true),
      F("rings", "Ring grooves", "0 to 3 compression rings"), F("oil", "Oil ring groove", "0 or 1: Honda's pack is two compression rings and an oil ring"),
      F("topLand", "Top land", "of the bore, above the top ring groove (assumed: 0.04 to 0.10 is usual)"), F("crown", "Crown thickness", "of the bore, the piston is hollow (assumed: 0.04 to 0.15)"), F("skirtWall", "Piston wall", "of the bore: the skirt and under the ring grooves (assumed: half the crown)"),
      F("drain", "Oil drain holes", "per side, through the oil ring groove into the piston (assumed: 0 to 4)"),
      F("skirtFit", "Room in the bore", "mm across; 0: by the material (Honda 0.015 to 0.050)"), F("pinFit", "Pin room in the piston", "mm across; Honda 0.002 to 0.014"), F("ringSide", "Ring side room", "mm above and below a ring in its groove; Honda 0.015 to 0.045"), F("room", "Room beside the rod", "mm each side of the rod between the pin bosses"),
      F("pinHeight", "Pin height", "mm from the pin's axis to the crown; 0: the ring belt and what the rod's eye needs", true), F("skirtLen", "Skirt below the pin", "mm; 0: 0.27 of the bore (assumed)", true), F("pinLen", "Pin length", "mm; 0: the longest the walls allow", true),
      F("ringHeight", "Compression ring height", "mm; 0: Honda's 1.5 (1.0 for a small bore)", true), F("oilRingHeight", "Oil ring height", "mm; 0: Honda's 2.5 (2.0 for a small bore)", true), F("ringRadial", "Ring radial width", "mm; 0: the bore over 22 (ISO 6622-1's thicker series)", true),
      F("land", "Land between rings", "mm; 0: 1.6 times a compression ring (assumed)", true), F("backRoom", "Groove back room", "mm behind a ring; 0: 0.45 (assumed)"), F("drainDia", "Drain hole diameter", "mm; 0: 0.03 of the bore (assumed)", true),
      F("topLandRelief", "Top land relief", "mm across, smaller than the skirt; 0: 0.003 of the bore (assumed)", true), F("landRelief", "Land relief", "mm across, the other lands; 0: 0.002 of the bore (assumed)", true), { ...F("retention", "Pin retention", "none, or a circlip in a groove at each end of the pin (Honda's)"), choices: ["None", "Circlips"] }, F("clipWidth", "Circlip groove width", "mm; 0: 0.06 of the pin, at least 0.8 (assumed)", true), F("clipDepth", "Circlip groove depth", "mm; 0: 0.028 of the pin, at least 0.4 (assumed)", true), F("clipEdge", "Circlip groove from the face", "mm; 0: 1.0 (assumed)", true), F("pinFloat", "Pin end float", "mm between the pin and the circlip; 0: 0.1 (assumed)"), { ...F("skirtShape", "Skirt shape", "a plain cylinder, or narrower along the pin (oval) and at the top (taper)"), choices: ["Round", "Oval, tapered"] }, F("oval", "Skirt oval", "mm across, narrower along the pin; 0: 0.001 of the bore (assumed)", true), F("taper", "Skirt taper", "mm across, narrower at the top of the skirt; 0: 0.0007 of the bore (assumed)", true), F("footChamfer", "Foot chamfer", "mm; 0: 0.004 of the bore (assumed)", true), { ...F("skirtStyle", "Skirt style", "a full skirt, or two pads on the thrust sides (the skirt cut away at the pin)"), choices: ["Full", "Two pads"] }, F("padAngle", "Pad angle", "degrees each pad spans; 0: 80 (the Caterpillar patent: 70 to 90)"), { ...F("crownShape", "Crown", "flat, a dome up, a dish down, or a bowl (the pin height stays the distance to the flat edge)"), choices: ["Flat", "Dome", "Dish", "Bowl"] }, F("crownHeight", "Crown height", "mm: a dome's rise, a dish's or bowl's depth; 0: 0.04, 0.03 or 0.04 of the bore (assumed)", true), F("crownDia", "Crown shape diameter", "mm across; 0: 0.75 of the bore, a bowl 0.6 (assumed)", true), F("crownChamfer", "Crown edge chamfer", "mm; 0: 0.004 of the bore (assumed)", true), F("valveReliefs", "Valve reliefs", "0 to 2 round pockets in a flat crown, along the pin's axis"), F("reliefDia", "Relief diameter", "mm; 0: 0.3 of the bore (assumed)", true), F("reliefDepth", "Relief depth", "mm; 0: 0.02 of the bore (assumed)", true), F("reliefOffset", "Relief distance from the axis", "mm; 0: 0.25 of the bore (assumed)", true), F("bossGap", "Gap between the pin bosses", "mm; 0: the rod's thickness and its room each side", true), F("bossReach", "Boss reach", "mm beyond the pin's hole; 0: the wall's thickness (assumed)", true)]),
    start: { ...PISTON_START, preset: 0 },
    problem: (n) => pistonProblem(pi(n)),
    extent: (n) => { if (pistonProblem(pi(n))) return 0; const e = pistonExtent(pi(n)); return Math.max(e.diameter, e.height); },
    centre: () => [0, 0],
    build: (n, place) => pistonSteps(pi(n), place),
    outline: (n) => { const s = pi(n); if (pistonProblem(s)) return []; const g = pistonGeometry(s); return [circle(0, 0, g.rp, 48), circle(0, 0, g.shell.inner, 48), circle(0, 0, g.rp - g.belt.depth, 48), rect(-g.pinHalf, -s.pin / 2, g.pinHalf, s.pin / 2)]; },
    about: (n) => { const s = pi(n), p = PISTON_PRESETS[Math.round((n.preset ?? 0)) - 1], e = pistonExtent(s), g = pistonGeometry(s); const w = pistonWeight(s, g); return `${p ? p.name + ": " : ""}${e.diameter.toFixed(1)} mm across, ${e.height.toFixed(1)} mm tall, ${w.total.toFixed(1)} g (piston ${w.piston.toFixed(1)}, pin ${w.pin.toFixed(1)}, circlips ${w.clips.toFixed(2)}), pin ${g.ch.toFixed(1)} mm below the crown; every number of 0 is worked out by a rule (Honda's numbers, or assumed ones: the field says which)`; },
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
const HOME: Place = { at: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] };
const wireMemo = new Map<string, [number, number, number][][]>();
/** The picture of a model in space (`in_1262`): its own, if it has one, else the lines its steps make (the loops of what is extruded at both ends, a turned body's section and rings, a gear's circles), so every model's blue preview is in 3D. Empty when the numbers make no model. */
export const modelOutline3 = (k: ModelKind, n: Nums): [number, number, number][][] => {
  const own = DEFS[k].outline3?.(n);
  if (own) return own;
  const key = k + JSON.stringify(n), hit = wireMemo.get(key);
  if (hit) return hit;
  let wires: [number, number, number][][] = [];
  try { if (!DEFS[k].problem(n)) { const b = DEFS[k].build(n, HOME); if (b.ok) wires = b.value.wires as unknown as [number, number, number][][]; } } catch { wires = []; }
  if (wireMemo.size > 12) wireMemo.delete(wireMemo.keys().next().value!);
  wireMemo.set(key, wires);
  return wires;
};
export const modelFixedSize = (k: ModelKind): boolean => !!DEFS[k].fixedSize;
export const modelSizeLabel = (k: ModelKind): string => DEFS[k].sizeLabel ?? "Size";
export const modelSizeKey = (k: ModelKind): string | undefined => DEFS[k].sizeKey;
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
  const preset = kind === "engine" ? ENGINE_PRESETS[Math.round(typedIn.preset ?? 0) - 1] : kind === "piston" ? PISTON_PRESETS[Math.round(typedIn.preset ?? 0) - 1] : undefined; // (a preset engine is another start: its numbers scale as the usual ones do, `dec_engine_presets`)
  const base: Nums = preset ? { ...d.start, ...(preset.spec as unknown as Nums) } : d.start;
  const raw = (f: number): Nums => {
    const n: Nums = { ...base };
    for (const fl of d.fields) if (fl.scaled) n[fl.key] = tidy(fl.key, base[fl.key]! * f);
    return { ...n, ...typed };
  };
  const locked = new Set(Object.keys(typed));
  /** the numbers made to fit together: the model's own following (the wheel's hub follows the bore), then the same search for every model for what is still wrong (`modelfit.ts`) */
  const at = (f: number): Nums => { const n = d.repair ? d.repair(raw(f), locked) : raw(f); return fitNumbers(d.problem, n, locked, d.fields); };
  const free = d.fields.some((fl) => fl.scaled && typed[fl.key] === undefined);
  if (size === undefined || !(size > 0) || !free) {
    const lead = d.fields.find((fl) => fl.scaled && typed[fl.key]! > 0 && base[fl.key]! > 0); // (a number typed as 0, an offset that is none, sets no scale)
    return lead ? at(typed[lead.key]! / base[lead.key]!) : at(1);
  }
  const reach = (f: number): number => d.extent(raw(f)); // (0 where the model cannot be made)
  let [lo, hi] = [0.02, 200];
  for (let i = 0; i < 60; i++) { const mid = Math.sqrt(lo * hi); if (reach(mid) < size) lo = mid; else hi = mid; }
  for (const f of [Math.sqrt(lo * hi), hi, lo * 1.5, 1]) if (reach(f) > 0 && !d.problem(at(f))) return at(f);
  return at(1);
}

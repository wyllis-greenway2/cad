// A reduction gearbox as a model (`dec_gear_models`): N stages of a spur pinion and gear, each stage in a layer of its own, the gear of one stage and the pinion of the next on the same rod, between a base plate with four posts and a top
// plate. The gears are gear records made with the gear tool (they keep their numbers and can be edited and meshed as any gear); the rods, the plates and the posts are plain bodies. Pure: numbers in, steps out.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { Builder, disc, box, meshedWith } from "./modelparts.ts";
import type { Place, ModelBuild } from "./modelparts.ts";
import type { GearHolder } from "./modelparts.ts";

export interface GearboxSpec {
  /** how many pinion and gear pairs in a row */ stages: number;
  /** the teeth of each stage's pinion and gear */ pinion: number; gear: number;
  module: number;
  /** the thickness of every gear (mm) */ width: number;
  /** the rods' diameter (mm) */ rod: number;
  /** the room between a gear's bore and its rod (mm; 0: a press fit) */ fit: number;
  /** the room between the plates' holes and a rod (mm): the rods turn in them */ bearing: number;
  /** the plates' thickness (mm) */ plate: number;
  /** the room between a layer and the next, and between the end layers and the plates (mm) */ gap: number;
}
export const GEARBOX_START: GearboxSpec = { stages: 2, pinion: 12, gear: 36, module: 1.5, width: 6, rod: 5, fit: 0.1, bearing: 0.2, plate: 3, gap: 1 };
const GEARBOX_LIMITS = { stages: [1, 4], pinion: 10, ratio: [1.5, 6], module: [0.5, 5] } as const;
/** the speed ratio, input over output, of the whole train */
export const gearboxRatio = (s: Pick<GearboxSpec, "stages" | "pinion" | "gear">): number => (s.gear / s.pinion) ** s.stages;

const POST = 3; // (the radius of a post, mm: an M3 screw's pilot hole goes down its middle)
const PILOT = 2.5;
const SCREW = 3.4;
const MARGIN = 4; // (the plates reach this far past the gears' tips)
const LID_GAP = 0.2; // (the posts stop this far short of the top plate: the two stay separate bodies, a lid that is screwed on)

/** Why the numbers make no gearbox, or null */
export function gearboxProblem(s: GearboxSpec): string | null {
  const n = (v: number) => Number.isFinite(v);
  if (![s.stages, s.pinion, s.gear, s.module, s.width, s.rod, s.fit, s.bearing, s.plate, s.gap].every(n)) return "every number must be a number";
  if (!Number.isInteger(s.stages) || s.stages < GEARBOX_LIMITS.stages[0] || s.stages > GEARBOX_LIMITS.stages[1]) return `the stages are from ${GEARBOX_LIMITS.stages[0]} to ${GEARBOX_LIMITS.stages[1]}`;
  if (!Number.isInteger(s.pinion) || s.pinion < GEARBOX_LIMITS.pinion) return `the pinion needs ${GEARBOX_LIMITS.pinion} or more teeth (fewer are cut away at the foot)`;
  if (!Number.isInteger(s.gear)) return "the gear's teeth must be a whole number";
  const r = s.gear / s.pinion;
  if (r < GEARBOX_LIMITS.ratio[0] || r > GEARBOX_LIMITS.ratio[1]) return `each stage reduces ${GEARBOX_LIMITS.ratio[0]} to ${GEARBOX_LIMITS.ratio[1]} times (the gear's teeth over the pinion's)`;
  if (s.module < GEARBOX_LIMITS.module[0] || s.module > GEARBOX_LIMITS.module[1]) return `the module is from ${GEARBOX_LIMITS.module[0]} to ${GEARBOX_LIMITS.module[1]} mm`;
  if (s.width <= 0 || s.plate <= 0 || s.gap < 0 || s.fit < 0 || s.bearing < 0) return "the widths must be more than 0, the rooms 0 or more";
  if (s.rod <= 0) return "the rod needs a diameter";
  const root = s.module * (s.pinion / 2 - 1.25); // (the pinion's root circle)
  if (s.rod + 2 * s.fit + 2 > 2 * root) return `the rod is too wide for the pinion: its root circle is ${(2 * root).toFixed(1)} mm across and the bore needs 1 mm of wall`;
  return null;
}

/** The steps that make the gearbox (the problem, if the numbers make none) */
export function gearboxSteps(s: GearboxSpec, place?: Place): Result<ModelBuild> {
  const bad = gearboxProblem(s);
  if (bad) return err(bad);
  const b = new Builder(place);
  const m = s.module, a = (m * (s.pinion + s.gear)) / 2; // (the centre distance of each stage)
  const tip = (z: number) => m * (z / 2 + 1);
  const rods = Array.from({ length: s.stages + 1 }, (_, k) => k * a);
  const W = s.width, G = s.gap, T = s.plate;
  const top = T + G + s.stages * (W + G); // (the underside of the top plate)
  const bore = s.rod + s.fit * 2;
  const spec = (teeth: number) => ({ teeth, module: m, width: W, bore });
  const ground = b.plane(0);
  const [x0, x1] = [-tip(s.pinion) - MARGIN, rods[s.stages]! + tip(s.gear) + MARGIN];
  const hy = tip(s.gear) + MARGIN;
  const post = (x: number, y: number) => ({ outer: disc(x, y, POST), holes: [disc(x, y, PILOT)], depth: top - LID_GAP });
  const corners: [number, number][] = [[x0 + POST + 1, -hy + POST + 1], [x1 - POST - 1, -hy + POST + 1], [x1 - POST - 1, hy - POST - 1], [x0 + POST + 1, hy - POST - 1]];
  const rodHoles = rods.map((x) => disc(x, 0, s.rod / 2 + s.bearing));
  // from the bottom up: the base plate with its four posts, the rods (from the underside of the base plate to the top of the top plate), the gears layer by layer (stage i in the layer i: its pinion on rod i, its gear, meshed with it, on rod i + 1), and the top plate
  b.part("Base plate and posts");
  b.extrude(ground, box(x0, -hy, x1, hy), rodHoles, T, { also: corners.map(([x, y]) => post(x, y)) });
  rods.forEach((x, k) => { b.part(`Rod ${k + 1}`); b.extrude(ground, disc(x, 0, s.rod / 2), [], top + T); });
  for (let i = 0; i < s.stages; i++) {
    b.part(`Stage ${i + 1} pinion`);
    const pl = b.plane(T + G + i * (W + G));
    const z = pl.z;
    const p: GearHolder = b.gear(pl, [rods[i]!, 0, z], spec(s.pinion));
    const placed = meshedWith({ ...p, id: "g_000", at: [rods[i]!, 0, z], spec: spec(s.pinion), turn: 0 }, s.gear, 0);
    if (typeof placed === "string") return err(placed);
    b.part(`Stage ${i + 1} gear`);
    b.gear(pl, placed.at, { ...placed.spec, bore }, placed.turn, p);
  }
  b.part("Top plate");
  const lid = b.plane(top);
  b.extrude(lid, box(x0, -hy, x1, hy), [...rodHoles, ...corners.map(([x, y]) => disc(x, y, SCREW / 2))], T);
  return ok(b.build());
}

/** the plates' box in the model's frame (x0, x1 along the rods, hy half the width across them): for the size, the middle and the preview */
export function gearboxFootprint(s: GearboxSpec): { x0: number; x1: number; hy: number; rods: number[] } {
  const a = (s.module * (s.pinion + s.gear)) / 2, tip = (z: number) => s.module * (z / 2 + 1);
  return { x0: -tip(s.pinion) - MARGIN, x1: s.stages * a + tip(s.gear) + MARGIN, hy: tip(s.gear) + MARGIN, rods: Array.from({ length: s.stages + 1 }, (_, k) => k * a) };
}

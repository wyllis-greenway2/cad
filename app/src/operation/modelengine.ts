// A single cylinder piston engine as a model (`dec_engine_model`): a block with the cylinder, a crankshaft with a crank disc and a flywheel, a connecting rod, a piston with ring grooves and a gudgeon pin. The parts are all worked out from a few master numbers (bore,
// stroke, rod ratio) so that they fit one another exactly: the stroke makes the crank's throw, the rod ratio the rod's length, the bore the cylinder and the piston, and the proportions the rest. The motion is the exact slider crank
// (`pistonX`). The proportions are rules of thumb of engine design, not standards (the ISO standards for rings and pins are not free to read): the fields say which numbers are which. Pure: numbers in, steps out.
//
// The crank turns about the z axis through the origin; the cylinder's axis is the x axis (the piston goes out along +x to its top dead centre at the angle 0), and the middle plane of the rod, the piston and the cylinder is the height `zc`.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { Builder, disc, outline, box } from "./modelparts.ts";
import type { Place, ModelBuild, Shape } from "./modelparts.ts";
import { pistonFit, rodDesign, crankPinFor } from "./pistondesign.ts";
import type { RingBelt, Shell, RodDesign } from "./pistondesign.ts";
import { pistonGeometry, pistonProblem, buildPiston, PISTON_START } from "./modelpiston.ts";
import type { PistonSpec } from "./modelpiston.ts";
import { buildRod } from "./modelrod.ts";

export interface EngineSpec {
  /** the cylinder's bore, the stroke (mm) and the rod ratio: the crank's radius over the rod's length (0.25 to 0.33 is usual) */ bore: number; stroke: number; ratio: number;
  /** the gudgeon (piston) pin's diameter, the crankshaft's diameter, the thickness of the walls and the flywheel's diameter (mm) */ pin: number; shaft: number; wall: number; flywheel: number;
  /** the compression rings' grooves (0 to 3), and whether there is a groove for an oil ring (0 or 1; Honda's pack is two compression rings and an oil ring) */ rings: number; oil: number;
  /** the land above the top ring groove, as a proportion of the bore (ASSUMED, `dec_piston_belt`: 0.04 to 0.10 is usual) */ topLand: number;
  /** the piston is hollow (`dec_piston_hollow`, ASSUMED): the crown's thickness and the wall's (the skirt, and under the grooves), as proportions of the bore; the wall is half the crown */ crown: number; skirtWall: number;
  /** oil drain holes through the oil ring's groove floor into the cavity, per thrust side (0 to 4; `dec_piston_drain`, ASSUMED) */ drain: number;
  /** the room all round the moving parts that are not the piston's own fits (mm): the shaft in the block, the rod's eyes on the pins, the slot for the rod */ room: number;
  /** the piston's own fits (mm; `dec_clearance_defaults`, Honda's nominal middles): the piston's room in the bore (across, so half a side), the pin's room in its bore in the piston (across) and a ring's room above and below it in its groove */ skirtFit: number; pinFit: number; ringSide: number;
  /** the rest of the piston's numbers (`dec_piston_maker`), **0 = auto**: the engine's box does not show them; the Piston model does */ pinHeight: number; skirtLen: number; pinLen: number; ringHeight: number; oilRingHeight: number; ringRadial: number; land: number; backRoom: number; drainDia: number; bossGap: number; bossReach: number; archHeight: number; pinFlat: number; flatDepth: number; flatWidth: number; crownShape: number; crownHeight: number; crownDia: number; crownChamfer: number; valveReliefs: number; reliefDia: number; reliefDepth: number; reliefOffset: number; skirtShape: number; oval: number; taper: number; footChamfer: number; skirtStyle: number; padAngle: number; material: number; pinKind: number; pinBore: number; topLandRelief: number; landRelief: number; retention: number; clipWidth: number; clipDepth: number; clipEdge: number; pinFloat: number;
  /** which engine the numbers are: 0 your own, 1 to 3 a preset of `ENGINE_PRESETS` (the box starts from its numbers; a number typed replaces one) */ preset: number;
}
const NOMINAL = pistonFit(30); // (the fits do not follow the bore)
export const ENGINE_START: EngineSpec = { bore: 30, stroke: 30, ratio: 0.27, pin: 8, shaft: 8, wall: 4, flywheel: 50, rings: 2, oil: 1, topLand: 0.07, crown: 0.08, skirtWall: 0.04, drain: 2, room: 0.15, skirtFit: 0, pinFit: NOMINAL.pinFit, ringSide: NOMINAL.ringSide, pinHeight: 0, skirtLen: 0, pinLen: 0, ringHeight: 0, oilRingHeight: 0, ringRadial: 0, land: 0, backRoom: 0, drainDia: 0, bossGap: 0, bossReach: 0, archHeight: 0, pinFlat: 0, flatDepth: 0, flatWidth: 0, crownShape: 0, crownHeight: 0, crownDia: 0, crownChamfer: 0, valveReliefs: 0, reliefDia: 0, reliefDepth: 0, reliefOffset: 0, skirtShape: 1, oval: 0, taper: 0, footChamfer: 0, skirtStyle: 0, padAngle: 0, material: 0, pinKind: 1, pinBore: 0, topLandRelief: 0, landRelief: 0, retention: 1, clipWidth: 0, clipDepth: 0, clipEdge: 0, pinFloat: 0, preset: 0 };
/** the piston's numbers of an engine's */
export const pistonOf = (s: EngineSpec): PistonSpec => { const o = {} as Record<string, number>; for (const k of Object.keys(PISTON_START)) o[k] = (s as unknown as Record<string, number>)[k]!; return o as unknown as PistonSpec; };

/** Real engines as starting numbers (`dec_engine_presets`): the bore, stroke and pin of the Honda GX120, GX160 and GX200 (the service manual), two compression ring grooves, and the GX160's rod ratio from its rod length (83.8 to 84.4 mm between centres, the crank's radius 22.5 mm). **Assumed, not Honda's:** the GX120's and GX200's rod ratio (the model's usual) and every preset's shaft, wall and flywheel (the model's own proportions at the preset's bore). */
const honda = (preset: number, bore: number, stroke: number, pin: number, ratio: number): EngineSpec => {
  const f = bore / ENGINE_START.bore, tidy = (v: number): number => Math.round(v * 10) / 10;
  return { ...ENGINE_START, bore, stroke, pin, ratio, shaft: tidy(ENGINE_START.shaft * f), wall: tidy(ENGINE_START.wall * f), flywheel: tidy(ENGINE_START.flywheel * f), rings: 2, oil: 1, preset };
};
export const ENGINE_PRESETS: readonly { name: string; spec: EngineSpec }[] = [
  { name: "Honda GX120", spec: honda(1, 60, 42, 13, ENGINE_START.ratio) },
  { name: "Honda GX160", spec: honda(2, 68, 45, 18, 0.268) },
  { name: "Honda GX200", spec: honda(3, 68, 54, 18, ENGINE_START.ratio) },
];

/** every length the parts are made from (mm), worked out from the numbers (proportions are rules of thumb) */
export interface EngineGeometry {
  /** the crank's radius and the rod's length (centre to centre) */ r: number; l: number;
  /** the piston: its radius, the distance from the pin's axis to the crown and to the foot of the skirt, and the ring belt (the grooves from the crown down) */ rp: number; ch: number; sk: number; belt: RingBelt; shell: Shell;
  /** the piston maker's geometry (`modelpiston.ts`) */ pg: ReturnType<typeof pistonGeometry>;
  /** the rod's I-beam and split big end (ASSUMED, `dec_rod_design`) */ rod: RodDesign;
  /** a crank web (ASSUMED, `dec_crankshaft_design`): the hub's radius, the pin boss's radius and the neck's half width between them, the counterweight's radius and how far its middle is from the shaft's axis (opposite the pin) */ cw: { hub: number; boss: number; neck: number; rc: number; c: number };
  /** the crank pin's diameter, the radius of the crank disc, the rod's big and small eye outer radii, the rod's thickness */ cp: number; rweb: number; rb: number; rs: number; w: number;
  /** the height of the cylinder's axis, the floor's thickness, the thickness of the crank disc and the flywheel */ zc: number; tb: number; tw: number; tf: number;
  /** where the cylinder's tube begins and ends along x, and the outer radius of the tube */ x0: number; x1: number; ro: number;
  /** the least half width of the slot in the piston for the rod to swing in, the floor's reach behind the crank */ slot: number; rf: number;
}
export function engineGeometry(s: EngineSpec): EngineGeometry {
  const r = s.stroke / 2, l = r / s.ratio, B = s.bore, pg0 = pistonGeometry(pistonOf(s)), rp = pg0.rp;
  const cp = crankPinFor(B), rb = cp / 2 + 2.5, rs = pg0.rs, w = pg0.w;
  // the piston (`modelpiston.ts`: the ring belt, the pin height as the stack, the shell, all typed or auto)
  const pg = pg0, { belt, shell, ch, sk } = pg;
  const ro = B / 2 + s.wall, tb = s.wall, tw = Math.max(3, s.wall), tf = Math.max(4, s.wall + 2);
  const rweb = r + cp / 2 + 2, zc = tb + ro - 0.5;
  const x0 = l - r - sk - 1, x1 = r + l + ch + 1 + pg.cr.top; // (the head clears a dome too)
  const phi = Math.asin(Math.min(0.99, s.ratio));
  const slot = Math.max(rs + 1, sk * Math.tan(phi) + 0.6 * rs + 1);
  const rod = rodDesign(B, w, rb, 0.6 * rs);
  const cw = { hub: s.shaft / 2 + 3, boss: cp / 2 + 2, neck: Math.min(s.shaft / 2 + 3, cp / 2 + 2), rc: 0.6 * rweb, c: 0.4 * rweb };
  return { r, l, rp, ch, sk, belt, shell, pg, rod, cw, cp, rweb, rb, rs, w, zc, tb, tw, tf, x0, x1, ro, slot, rf: rweb + 3 };
}
/** the distance from the crank's axis to the piston pin when the crank has turned `deg` degrees from top dead centre: the slider crank, exactly */
export const pistonX = (r: number, l: number, deg: number): number => { const a = (deg * Math.PI) / 180; return r * Math.cos(a) + Math.sqrt(l * l - r * r * Math.sin(a) ** 2); };
/** the angle the rod makes with the cylinder's axis (degrees, counter-clockwise positive, seen from +z) when the crank has turned `deg` degrees */
export const rodAngle = (r: number, l: number, deg: number): number => (-Math.asin((r * Math.sin((deg * Math.PI) / 180)) / l) * 180) / Math.PI;
/** the cylinder's swept volume (cm3) */
export const engineDisplacement = (s: Pick<EngineSpec, "bore" | "stroke">): number => (Math.PI / 4) * s.bore * s.bore * s.stroke / 1000;

/** Why the numbers make no engine, or null */
export function engineProblem(s: EngineSpec): string | null {
  if (!Object.values(s).every(Number.isFinite)) return "every number must be a number";
  if (![s.bore, s.stroke, s.pin, s.shaft, s.wall, s.flywheel].every((v) => v > 0)) return "the sizes must be more than 0";
  const pp = pistonProblem(pistonOf(s));
  if (pp) return pp;
  if (s.ratio < 0.2 || s.ratio > 0.5) return "the rod ratio (the crank's radius over the rod's length) is 0.2 to 0.5; 0.25 to 0.33 is usual";
  const g = engineGeometry(s);
  if (g.r < g.cp / 2 + 1.5) return `the stroke is too short for the crank pin: it must be ${(2 * (g.cp / 2 + 1.5)).toFixed(1)} mm or more`;
  if (s.flywheel < 2 * g.rweb) return `the flywheel must be ${(2 * g.rweb).toFixed(1)} mm across or more (the crank disc is that big)`;
  if (g.slot > g.shell.inner - 1.5) return "the rod swings too far for the inside of the piston: a longer rod (a smaller ratio), a bigger bore, a thinner wall or a smaller pin";
  if (g.x0 < g.rweb + 2) return "the rod is too short: the piston's skirt would hit the crank disc at the bottom of the stroke (a smaller ratio or a smaller stroke)";
  if (g.x0 < g.r + g.rb + 1) return "the rod is too short: the crank's big end would reach the cylinder";
  // the rod's middle line, at the foot of the cylinder's tube, must stay clear of the bore's wall
  for (let a = 0; a < 360; a += 5) {
    const px = pistonX(g.r, g.l, a), cx = g.r * Math.cos((a * Math.PI) / 180), cy = g.r * Math.sin((a * Math.PI) / 180);
    if (px <= g.x0) continue;
    const y = cy * (1 - (g.x0 - cx) / (px - cx));
    if (g.x0 >= cx && Math.abs(y) > s.bore / 2 - g.rs - s.room) return "the rod would hit the cylinder's wall: a longer rod";
  }
  return null;
}

/** The steps that make the engine (the problem, if the numbers make none) */
export function engineSteps(s: EngineSpec, place?: Place): Result<ModelBuild> {
  const bad = engineProblem(s);
  if (bad) return err(bad);
  const g = engineGeometry(s), b = new Builder(place), rm = s.room, R = s.bore / 2;
  const xp0 = g.r + g.l; // (the piston pin at top dead centre)
  const webTop = g.zc - g.w / 2 - 0.4, rodTop = g.zc + g.w / 2;
  const up = (x: number): ReturnType<Builder["frame"]> => b.frame([x, 0, g.zc], [0, 1, 0], [0, 0, 1]); // (a plane across the cylinder: its normal is +x, its points (y, z) from the axis)
  // the block: a floor with the cylinder standing on it
  b.part("Block");
  b.extrude(b.plane(0), box(-g.rf, -g.ro, g.x1 + s.wall, g.ro), [disc(0, 0, s.shaft / 2 + rm)], g.tb);
  b.extrude(up(g.x0), disc(0, 0, g.ro), [disc(0, 0, R)], g.x1 - g.x0, { mode: "add" });
  b.extrude(up(g.x1), disc(0, 0, g.ro), [], s.wall, { mode: "add" });
  // the crankshaft: the shaft, the crank disc and the crank pin the rod's big eye turns on
  b.part("Crankshaft");
  // a two web crank (`dec_crankshaft_design`): the shaft, a lower web with a counterweight opposite the pin, the crank pin between the webs (the rod's big end is split so that it goes on between them), an upper web with its counterweight
  const zLow = -g.tf - 0.5, webTopU = rodTop + 0.4;
  const web = (z: number): void => { const cw = g.cw; b.extrude(b.plane(z), disc(0, 0, cw.hub), [], g.tw, { mode: "add", also: [{ outer: disc(g.r, 0, cw.boss), depth: g.tw }, { outer: box(0, -cw.neck, g.r, cw.neck), depth: g.tw }, { outer: disc(-cw.c, 0, cw.rc), depth: g.tw }] }); };
  b.extrude(b.plane(zLow), disc(0, 0, s.shaft / 2), [], webTop - zLow);
  web(webTop - g.tw);
  b.extrude(b.plane(webTop - 0.0), disc(g.r, 0, g.cp / 2), [], webTopU - webTop + 0.0, { mode: "add" });
  web(webTopU);
  b.part("Flywheel");
  b.extrude(b.plane(zLow), disc(0, 0, s.flywheel / 2), [disc(0, 0, s.shaft / 2 + rm)], g.tf);
  // the piston and its pin (`modelpiston.ts`, the piston maker's own code)
  buildPiston(b, pistonOf(s), g.pg, xp0, g.zc);
  // the connecting rod (`dec_rod_design`): the small eye, an I-beam (a pocket in each face, a web and flanges between), and the upper half of the split big end with its two lugs; the cap is the lower half, a body of its own; the bolt holes go through both lugs
  // the connecting rod and its cap (`dec_rod_design`, `modelrod.ts`: the rod maker's own code; the sleeve, shells and bolts are off here)
  const rd = g.rod;
  buildRod(b, { l: g.l, pin: s.pin, rm, w: g.w, ws: g.w, rb: g.rb, ri: g.cp / 2 + rm, rs: g.rs, eye: s.pin / 2 + rm, web: rd.web, flange: rd.flange, bolt: rd.bolt, lug: rd.lug, boltY: rd.boltY, pockets: 1, bush: 0, shell: 0, bolts: 0, cpR: g.cp / 2 }, g.r, g.zc);
  return ok(b.build());
}

/** the footprint of the engine in its plan (the longest way across, and where the middle is along x) */
export function engineFootprint(s: EngineSpec): { x0: number; x1: number; hy: number } {
  const g = engineGeometry(s);
  return { x0: -g.rf, x1: g.x1 + s.wall, hy: g.ro };
}

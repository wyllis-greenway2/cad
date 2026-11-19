// A single cylinder piston engine as a model (`dec_engine_model`): a block with the cylinder, a crankshaft with a crank disc and a flywheel, a connecting rod, a piston with ring grooves and a gudgeon pin. The parts are all worked out from a few master numbers (bore,
// stroke, rod ratio) so that they fit one another exactly: the stroke makes the crank's throw, the rod ratio the rod's length, the bore the cylinder and the piston, and the proportions the rest. The motion is the exact slider crank
// (`pistonX`). The proportions are rules of thumb of engine design, not standards (the ISO standards for rings and pins are not free to read): the fields say which numbers are which. Pure: numbers in, steps out.
//
// The crank turns about the z axis through the origin; the cylinder's axis is the x axis (the piston goes out along +x to its top dead centre at the angle 0), and the middle plane of the rod, the piston and the cylinder is the height `zc`.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { Builder, disc, outline, box } from "./modelparts.ts";
import type { Place, ModelBuild } from "./modelparts.ts";

export interface EngineSpec {
  /** the cylinder's bore, the stroke (mm) and the rod ratio: the crank's radius over the rod's length (0.25 to 0.33 is usual) */ bore: number; stroke: number; ratio: number;
  /** the gudgeon (piston) pin's diameter, the crankshaft's diameter, the thickness of the walls and the flywheel's diameter (mm) */ pin: number; shaft: number; wall: number; flywheel: number;
  /** the compression rings' grooves (0 to 3) */ rings: number;
  /** the room all round the moving parts (mm): the piston in the bore, the pin in its eyes */ room: number;
}
export const ENGINE_START: EngineSpec = { bore: 30, stroke: 30, ratio: 0.27, pin: 8, shaft: 8, wall: 4, flywheel: 50, rings: 2, room: 0.15 };

/** every length the parts are made from (mm), worked out from the numbers (proportions are rules of thumb) */
export interface EngineGeometry {
  /** the crank's radius and the rod's length (centre to centre) */ r: number; l: number;
  /** the piston: its radius, the distance from the pin's axis to the crown and to the foot of the skirt, the ring grooves' height, depth and pitch, the land above the top groove */ rp: number; ch: number; sk: number; gh: number; gd: number; gp: number; land: number;
  /** the crank pin's diameter, the radius of the crank disc, the rod's big and small eye outer radii, the rod's thickness */ cp: number; rweb: number; rb: number; rs: number; w: number;
  /** the height of the cylinder's axis, the floor's thickness, the thickness of the crank disc and the flywheel */ zc: number; tb: number; tw: number; tf: number;
  /** where the cylinder's tube begins and ends along x, and the outer radius of the tube */ x0: number; x1: number; ro: number;
  /** the least half width of the slot in the piston for the rod to swing in, the floor's reach behind the crank */ slot: number; rf: number;
}
export function engineGeometry(s: EngineSpec): EngineGeometry {
  const r = s.stroke / 2, l = r / s.ratio, B = s.bore, rp = B / 2 - s.room;
  const cp = Math.round(s.pin * 1.25 * 10) / 10, rb = cp / 2 + 2.5, rs = s.pin / 2 + 1.5, w = Math.max(3, Math.round(s.pin * 0.75 * 10) / 10);
  const ch = 0.55 * B, sk = 0.35 * B, gh = Math.max(1, 0.05 * B), gd = Math.max(1.2, 0.06 * B), gp = gh + Math.max(1, 0.04 * B), land = 0.12 * B;
  const ro = B / 2 + s.wall, tb = s.wall, tw = Math.max(3, s.wall), tf = Math.max(4, s.wall + 2);
  const rweb = r + cp / 2 + 3, zc = tb + ro - 0.5;
  const x0 = l - r - sk - 1, x1 = r + l + ch + 1;
  const phi = Math.asin(Math.min(0.99, s.ratio));
  const slot = Math.max(rs + 1, sk * Math.tan(phi) + 0.6 * rs + 1);
  return { r, l, rp, ch, sk, gh, gd, gp, land, cp, rweb, rb, rs, w, zc, tb, tw, tf, x0, x1, ro, slot, rf: rweb + 3 };
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
  if (!Number.isInteger(s.rings) || s.rings < 0 || s.rings > 3) return "the rings are 0 to 3";
  if (s.room < 0.02 || s.room > 1) return "the room round the moving parts is 0.02 to 1 mm";
  if (s.ratio < 0.2 || s.ratio > 0.5) return "the rod ratio (the crank's radius over the rod's length) is 0.2 to 0.5; 0.25 to 0.33 is usual";
  if (s.bore < 12) return "the bore must be 12 mm or more";
  if (s.pin < 0.18 * s.bore || s.pin > 0.4 * s.bore) return `the pin is 0.18 to 0.4 of the bore: ${(0.18 * s.bore).toFixed(1)} to ${(0.4 * s.bore).toFixed(1)} mm (0.25 to 0.3 is usual)`;
  const g = engineGeometry(s);
  if (g.r < g.cp / 2 + s.shaft / 2 + 1.5) return `the stroke is too short for the shaft and the crank pin: it must be ${(2 * (g.cp / 2 + s.shaft / 2 + 1.5)).toFixed(1)} mm or more`;
  if (s.flywheel < 2 * g.rweb) return `the flywheel must be ${(2 * g.rweb).toFixed(1)} mm across or more (the crank disc is that big)`;
  if (g.slot > g.rp - 2.5) return "the rod swings too far for the piston's skirt: a longer rod (a smaller ratio), a bigger bore or a smaller pin";
  // the lowest ring groove and the slot for the rod must leave material between them
  const grooveLow = g.ch - g.land - (s.rings > 0 ? (s.rings - 1) * g.gp + g.gh : 0);
  if (s.rings > 0 && grooveLow < g.rs + 2.5) return "the ring grooves run into the piston pin's boss: fewer rings or a smaller pin";
  if (g.ch - g.rs - 1.5 <= s.pin / 2 + 1) return "the piston is too short for the pin";
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
  const zLow = -g.tf - 0.5;
  b.extrude(b.plane(zLow), disc(0, 0, s.shaft / 2), [], webTop - zLow);
  b.extrude(b.plane(webTop - g.tw), disc(0, 0, g.rweb), [], g.tw, { mode: "add" });
  b.extrude(b.plane(webTop), disc(g.r, 0, g.cp / 2), [], rodTop + 2 - webTop, { mode: "add" });
  b.part("Flywheel");
  b.extrude(b.plane(zLow), disc(0, 0, s.flywheel / 2), [disc(0, 0, s.shaft / 2 + rm)], g.tf);
  // the piston: a cylinder with the ring grooves, a slot across for the rod and the hole for the pin (cuts come before the rod, which stands in the slot)
  b.part("Piston");
  b.extrude(up(xp0 - g.sk), disc(0, 0, g.rp), [], g.sk + g.ch);
  for (let k = 0; k < s.rings; k++) b.extrude(up(xp0 + g.ch - g.land - k * g.gp - g.gh), disc(0, 0, g.rp + rm / 2), [disc(0, 0, g.rp - g.gd)], g.gh, { mode: "cut" });
  b.extrude(b.plane(g.zc - g.w / 2 - rm), box(xp0 - g.sk - 1, -g.slot, xp0 + g.rs + 1, g.slot), [], g.w + 2 * rm, { mode: "cut" });
  b.extrude(b.plane(g.zc - g.rp - 1), disc(xp0, 0, s.pin / 2 + rm), [], 2 * g.rp + 2, { mode: "cut" });
  b.part("Piston pin");
  const half = Math.sqrt(g.rp * g.rp - (s.pin / 2 + 1) ** 2) - 0.3;
  b.extrude(b.plane(g.zc - half), disc(xp0, 0, s.pin / 2), [], 2 * half);
  // the connecting rod: two eyes and a tapered beam between them, in the rod's own plane
  b.part("Connecting rod");
  const hb = 0.6 * g.rb, hs = 0.6 * g.rs, xa = g.r + g.rb - 1, xb = xp0 - g.rs + 1, at = (x: number): number => hb + ((hs - hb) * (x - g.r)) / g.l;
  b.extrude(b.plane(g.zc - g.w / 2), outline([[xa, -at(xa)], [xb, -at(xb)], [xb, at(xb)], [xa, at(xa)]]), [], g.w, { also: [
    { outer: disc(g.r, 0, g.rb), holes: [disc(g.r, 0, g.cp / 2 + rm)], depth: g.w },
    { outer: disc(xp0, 0, g.rs), holes: [disc(xp0, 0, s.pin / 2 + rm)], depth: g.w }] });
  return ok(b.build());
}

/** the footprint of the engine in its plan (the longest way across, and where the middle is along x) */
export function engineFootprint(s: EngineSpec): { x0: number; x1: number; hy: number } {
  const g = engineGeometry(s);
  return { x0: -g.rf, x1: g.x1 + s.wall, hy: g.ro };
}

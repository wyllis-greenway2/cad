// A single cylinder piston engine as a model (`dec_engine_model`): a block with the cylinder, a crankshaft with a crank disc and a flywheel, a connecting rod, a piston with ring grooves and a gudgeon pin. The parts are all worked out from a few master numbers (bore,
// stroke, rod ratio) so that they fit one another exactly: the stroke makes the crank's throw, the rod ratio the rod's length, the bore the cylinder and the piston, and the proportions the rest. The motion is the exact slider crank
// (`pistonX`). The proportions are rules of thumb of engine design, not standards (the ISO standards for rings and pins are not free to read): the fields say which numbers are which. Pure: numbers in, steps out.
//
// The crank turns about the z axis through the origin; the cylinder's axis is the x axis (the piston goes out along +x to its top dead centre at the angle 0), and the middle plane of the rod, the piston and the cylinder is the height `zc`.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { Builder, disc, outline, box } from "./modelparts.ts";
import type { Place, ModelBuild } from "./modelparts.ts";
import { pistonFit, ringBelt, pistonShell } from "./pistondesign.ts";
import type { RingBelt, Shell } from "./pistondesign.ts";

export interface EngineSpec {
  /** the cylinder's bore, the stroke (mm) and the rod ratio: the crank's radius over the rod's length (0.25 to 0.33 is usual) */ bore: number; stroke: number; ratio: number;
  /** the gudgeon (piston) pin's diameter, the crankshaft's diameter, the thickness of the walls and the flywheel's diameter (mm) */ pin: number; shaft: number; wall: number; flywheel: number;
  /** the compression rings' grooves (0 to 3), and whether there is a groove for an oil ring (0 or 1; Honda's pack is two compression rings and an oil ring) */ rings: number; oil: number;
  /** the land above the top ring groove, as a proportion of the bore (ASSUMED, `dec_piston_belt`: 0.04 to 0.10 is usual) */ topLand: number;
  /** the piston is hollow (`dec_piston_hollow`, ASSUMED): the crown's thickness and the wall's (the skirt, and under the grooves), as proportions of the bore; the wall is half the crown */ crown: number; skirtWall: number;
  /** oil drain holes through the oil ring's groove floor into the cavity, per thrust side (0 to 4; `dec_piston_drain`, ASSUMED) */ drain: number;
  /** the room all round the moving parts that are not the piston's own fits (mm): the shaft in the block, the rod's eyes on the pins, the slot for the rod */ room: number;
  /** the piston's own fits (mm; `dec_clearance_defaults`, Honda's nominal middles): the piston's room in the bore (across, so half a side), the pin's room in its bore in the piston (across) and a ring's room above and below it in its groove */ skirtFit: number; pinFit: number; ringSide: number;
  /** which engine the numbers are: 0 your own, 1 to 3 a preset of `ENGINE_PRESETS` (the box starts from its numbers; a number typed replaces one) */ preset: number;
}
const NOMINAL = pistonFit(30); // (the fits do not follow the bore)
export const ENGINE_START: EngineSpec = { bore: 30, stroke: 30, ratio: 0.27, pin: 8, shaft: 8, wall: 4, flywheel: 50, rings: 2, oil: 1, topLand: 0.07, crown: 0.08, skirtWall: 0.04, drain: 2, room: 0.15, skirtFit: NOMINAL.skirtClearance, pinFit: NOMINAL.pinFit, ringSide: NOMINAL.ringSide, preset: 0 };

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
  /** the crank pin's diameter, the radius of the crank disc, the rod's big and small eye outer radii, the rod's thickness */ cp: number; rweb: number; rb: number; rs: number; w: number;
  /** the height of the cylinder's axis, the floor's thickness, the thickness of the crank disc and the flywheel */ zc: number; tb: number; tw: number; tf: number;
  /** where the cylinder's tube begins and ends along x, and the outer radius of the tube */ x0: number; x1: number; ro: number;
  /** the least half width of the slot in the piston for the rod to swing in, the floor's reach behind the crank */ slot: number; rf: number;
}
export function engineGeometry(s: EngineSpec): EngineGeometry {
  const r = s.stroke / 2, l = r / s.ratio, B = s.bore, rp = B / 2 - s.skirtFit / 2;
  const cp = Math.round(s.pin * 1.25 * 10) / 10, rb = cp / 2 + 2.5, rs = s.pin / 2 + 1.5, w = Math.max(3, Math.round(s.pin * 0.75 * 10) / 10);
  // the ring belt (`dec_piston_belt`: Honda's ring heights and side room, the assumed lands, top land and depth) and the pin height: the stack (the belt, then the larger of the pin's radius and a margin of 0.05 of the bore, ASSUMED, and what the rod's small eye and its slot need); the skirt below the pin 0.27 of the bore is ASSUMED (rule A5, NACA 817): the remembered 0.35 made a real GX160 (rod 84 mm, stroke 45) impossible (its skirt would hit the crank disc at the bottom of the stroke; it must be under 0.32)
  const belt = ringBelt(B, s.rings, s.oil, s.topLand, s.ringSide), shell = pistonShell(B, rp, belt.depth, s.crown, s.skirtWall, s.pin, s.pinFit), ch = Math.max(belt.length + Math.max(s.pin / 2 + 0.05 * B, rs + 2.5), shell.crown + rs + 2.5), sk = 0.27 * B; // (the cavity under the crown must hold the rod's eye too)
  const ro = B / 2 + s.wall, tb = s.wall, tw = Math.max(3, s.wall), tf = Math.max(4, s.wall + 2);
  const rweb = r + cp / 2 + 3, zc = tb + ro - 0.5;
  const x0 = l - r - sk - 1, x1 = r + l + ch + 1;
  const phi = Math.asin(Math.min(0.99, s.ratio));
  const slot = Math.max(rs + 1, sk * Math.tan(phi) + 0.6 * rs + 1);
  return { r, l, rp, ch, sk, belt, shell, cp, rweb, rb, rs, w, zc, tb, tw, tf, x0, x1, ro, slot, rf: rweb + 3 };
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
  if (s.oil !== 0 && s.oil !== 1) return "the oil ring groove is 0 (none) or 1";
  if (!Number.isInteger(s.drain) || s.drain < 0 || s.drain > 4) return "the oil drain holes are 0 to 4 on each side";
  if (s.crown < 0.02 || s.crown > 0.3) return "the crown is 0.02 to 0.3 of the bore thick (0.04 to 0.15 is usual)";
  if (s.skirtWall < 0.01 || s.skirtWall > 0.15) return "the piston's wall is 0.01 to 0.15 of the bore (half the crown is the usual)";
  if (s.topLand < 0.02 || s.topLand > 0.3) return "the land above the top ring groove is 0.02 to 0.3 of the bore (0.04 to 0.10 is usual)";
  if (s.room < 0.02 || s.room > 1) return "the room round the moving parts is 0.02 to 1 mm";
  if (s.skirtFit < 0.005 || s.skirtFit > 1) return "the piston's room in the bore is 0.005 to 1 mm across (Honda 0.015 to 0.050)";
  if (s.pinFit < 0.001 || s.pinFit > 0.5) return "the pin's room in the piston is 0.001 to 0.5 mm across (Honda 0.002 to 0.014)";
  if (s.ringSide < 0.005 || s.ringSide > 0.5) return "a ring's room in its groove is 0.005 to 0.5 mm (Honda 0.015 to 0.045)";
  if (s.ratio < 0.2 || s.ratio > 0.5) return "the rod ratio (the crank's radius over the rod's length) is 0.2 to 0.5; 0.25 to 0.33 is usual";
  if (s.bore < 12) return "the bore must be 12 mm or more";
  if (s.pin < 0.18 * s.bore || s.pin > 0.4 * s.bore) return `the pin is 0.18 to 0.4 of the bore: ${(0.18 * s.bore).toFixed(1)} to ${(0.4 * s.bore).toFixed(1)} mm (0.25 to 0.3 is usual)`;
  const g = engineGeometry(s);
  if (g.r < g.cp / 2 + s.shaft / 2 + 1.5) return `the stroke is too short for the shaft and the crank pin: it must be ${(2 * (g.cp / 2 + s.shaft / 2 + 1.5)).toFixed(1)} mm or more`;
  if (s.flywheel < 2 * g.rweb) return `the flywheel must be ${(2 * g.rweb).toFixed(1)} mm across or more (the crank disc is that big)`;
  if (g.shell.innerBelt < 2) return "the walls and the ring grooves leave no room inside the piston: a bigger bore, a thinner wall or fewer rings";
  if (g.slot > g.shell.inner - 1.5) return "the rod swings too far for the inside of the piston: a longer rod (a smaller ratio), a bigger bore, a thinner wall or a smaller pin";
  if (g.belt.depth > g.rp - 2) return "the ring grooves are too deep for the bore: a bigger bore";
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
  for (const gr of g.belt.grooves) b.extrude(up(xp0 + g.ch - gr.top - gr.height), disc(0, 0, g.rp + 1), [disc(0, 0, g.rp - g.belt.depth)], gr.height, { mode: "cut" });
  // the cavity, open at the foot (`dec_piston_hollow`): wide up to the bottom of the ring belt, narrower under it, up to the crown's underside; then the two pin bosses either side of the rod, and the pin's hole through them and the walls
  const sh = g.shell, top = xp0 + g.ch - sh.crown, wideTop = xp0 + g.ch - Math.max(g.belt.length, sh.crown), zoff = g.w / 2 + rm;
  b.extrude(up(xp0 - g.sk), disc(0, 0, sh.inner), [], wideTop - (xp0 - g.sk), { mode: "cut" });
  b.extrude(up(xp0 - g.sk), disc(0, 0, sh.innerBelt), [], top - (xp0 - g.sk), { mode: "cut" });
  // each pad is as wide as the metal behind it allows: below the ring belt up to the piston's outside, and in the belt's zone up to the grooves' floors (a pad must not stand in a groove)
  const root = g.rp - g.belt.depth, reach = (outer: number, inside: number): number => Math.min(sh.boss, 0.95 * Math.sqrt(Math.max(0, outer * outer - inside * inside))), foot = xp0 - sh.boss;
  const yw = reach(g.rp, sh.inner), yn = reach(root, sh.innerBelt);
  b.extrude(up(foot), box(-yw, zoff, yw, sh.inner), [], wideTop - foot, { mode: "add" });
  b.extrude(up(foot), box(-yw, -sh.inner, yw, -zoff), [], wideTop - foot, { mode: "add" });
  if (top > wideTop + 1e-6) {
    b.extrude(up(wideTop), box(-yn, zoff, yn, sh.innerBelt), [], top - wideTop, { mode: "add" });
    b.extrude(up(wideTop), box(-yn, -sh.innerBelt, yn, -zoff), [], top - wideTop, { mode: "add" });
  }
  b.extrude(b.plane(g.zc - g.rp - 1), disc(xp0, 0, s.pin / 2 + s.pinFit / 2), [], 2 * g.rp + 2, { mode: "cut" });
  // the oil drain holes (`dec_piston_drain`): radial holes through the oil groove's floor into the cavity, on the two thrust sides, in the groove's middle
  const oilGroove = g.belt.grooves.find((x) => x.oil);
  if (oilGroove && s.drain > 0) {
    const xh = xp0 + g.ch - oilGroove.top - oilGroove.height / 2, rh = Math.min(0.03 * s.bore, 0.8 * oilGroove.height) / 2, r0 = g.shell.innerBelt - 0.5, r1 = g.rp - g.belt.depth + 0.5;
    for (const side of [1, -1]) for (let k = 0; k < s.drain; k++) {
      const a = ((s.drain === 1 ? 90 : 45 + (90 * k) / (s.drain - 1)) * Math.PI) / 180, dy = side * Math.sin(a), dz = Math.cos(a); // (the angle is from the pin's axis, which lies along z)
      b.extrude(b.frame([xh, r0 * dy, g.zc + r0 * dz], [1, 0, 0], [0, dz, -dy]), disc(0, 0, rh), [], r1 - r0, { mode: "cut" });
    }
  }
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

// The piston maker (`dec_piston_maker`): every number that builds a piston, and the piston made from them: a hollow cup with a ring belt, oil drain holes, two pin bosses and the pin through them. A model of its own (*Models > Piston*, crown up) and the piston of the
// engine (`modelengine.ts` builds its piston by `buildPiston` here, so the two cannot differ). A number of 0 where the field says so is AUTO: the rule of `dec_piston_parameters` (Honda's numbers, or an assumption, marked so) works it out. Lengths in mm; the proportions of the bore are of the bore.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { Builder, disc, box } from "./modelparts.ts";
import type { Place, ModelBuild } from "./modelparts.ts";
import { pistonFit, ringBelt, pistonShell } from "./pistondesign.ts";
import type { RingBelt, Shell } from "./pistondesign.ts";

export interface PistonSpec {
  /** the cylinder's bore (mm) and the piston pin's diameter (mm) */ bore: number; pin: number;
  /** the compression rings' grooves (0 to 3), and whether there is a groove for an oil ring (0 or 1) */ rings: number; oil: number;
  /** the land above the top ring groove, the crown's thickness and the wall's (the skirt, and under the grooves), as proportions of the bore (ASSUMED) */ topLand: number; crown: number; skirtWall: number;
  /** oil drain holes in the oil ring's groove floor, per thrust side (0 to 4) */ drain: number;
  /** the room each side of the rod between the pin bosses (mm) */ room: number;
  /** the piston's own fits (mm): its room in the bore (across), the pin's room in the piston (across), a ring's room above and below it in its groove */ skirtFit: number; pinFit: number; ringSide: number;
  /** **0 = auto** (the rule works it out): the distance from the pin's axis to the crown (the stack), the skirt below the pin (0.27 of the bore, ASSUMED), the pin's length (the longest the walls allow) */ pinHeight: number; skirtLen: number; pinLen: number;
  /** **0 = auto**: a compression ring's height and the oil ring's (Honda's 1.5 and 2.5 mm, down to 1.0 and 2.0 for a small bore), a ring's radial width (the bore over 22, ISO 6622-1's thicker series), the land between rings (1.6 times a compression ring), the groove's back room (0.45 mm) */ ringHeight: number; oilRingHeight: number; ringRadial: number; land: number; backRoom: number;
  /** **0 = auto**: an oil drain hole's diameter (0.03 of the bore), the gap between the pin bosses (the rod's thickness and its room each side), how far a boss reaches beyond the pin's hole (a wall's thickness) */ drainDia: number; bossGap: number; bossReach: number;
}
const FIT = pistonFit(30); // (the fits do not follow the bore)
export const PISTON_START: PistonSpec = { bore: 30, pin: 8, rings: 2, oil: 1, topLand: 0.07, crown: 0.08, skirtWall: 0.04, drain: 2, room: 0.15, skirtFit: FIT.skirtClearance, pinFit: FIT.pinFit, ringSide: FIT.ringSide, pinHeight: 0, skirtLen: 0, pinLen: 0, ringHeight: 0, oilRingHeight: 0, ringRadial: 0, land: 0, backRoom: 0, drainDia: 0, bossGap: 0, bossReach: 0 };

export interface PistonGeometry {
  /** the piston's radius, the distance from the pin's axis to the crown and to the foot of the skirt */ rp: number; ch: number; sk: number;
  belt: RingBelt; shell: Shell;
  /** the rod's small eye's outer radius, and the rod's thickness (worked out from the pin, as the engine does) */ rs: number; w: number;
  /** half the gap between the pin bosses, half the pin's length, an oil drain hole's radius */ zoff: number; pinHalf: number; drainR: number;
}
export function pistonGeometry(p: PistonSpec): PistonGeometry {
  const B = p.bore, rp = B / 2 - p.skirtFit / 2, rs = p.pin / 2 + 1.5, w = Math.max(3, Math.round(p.pin * 0.75 * 10) / 10);
  const typed = (v: number): number | undefined => (v > 0 ? v : undefined);
  const belt = ringBelt(B, p.rings, p.oil, p.topLand, p.ringSide, { ring: typed(p.ringHeight), oilRing: typed(p.oilRingHeight), land: typed(p.land), radial: typed(p.ringRadial), back: typed(p.backRoom) });
  const shell = pistonShell(B, rp, belt.depth, p.crown, p.skirtWall, p.pin, p.pinFit, typed(p.bossReach));
  // the pin height is the stack (the belt, then the larger of the pin's radius and 0.05 of the bore: ASSUMED, and what the rod's small eye and its slot need); the cavity under the crown must hold the rod's eye too
  const stack = Math.max(belt.length + Math.max(p.pin / 2 + 0.05 * B, rs + 2.5), shell.crown + rs + 2.5);
  const oil = belt.grooves.find((x) => x.oil);
  return { rp, ch: p.pinHeight > 0 ? p.pinHeight : stack, sk: p.skirtLen > 0 ? p.skirtLen : 0.27 * B, belt, shell, rs, w,
    zoff: (p.bossGap > 0 ? p.bossGap : w + 2 * p.room) / 2, pinHalf: p.pinLen > 0 ? p.pinLen / 2 : Math.sqrt(rp * rp - (p.pin / 2 + 1) ** 2) - 0.3,
    drainR: Math.min(p.drainDia > 0 ? p.drainDia : 0.03 * B, 0.8 * (oil?.height ?? Infinity)) / 2 };
}

/** Why the numbers make no piston, or null */
export function pistonProblem(p: PistonSpec): string | null {
  if (!Object.values(p).every(Number.isFinite)) return "every number must be a number";
  if (![p.bore, p.pin].every((v) => v > 0)) return "the sizes must be more than 0";
  if (!Number.isInteger(p.rings) || p.rings < 0 || p.rings > 3) return "the rings are 0 to 3";
  if (p.oil !== 0 && p.oil !== 1) return "the oil ring groove is 0 (none) or 1";
  if (!Number.isInteger(p.drain) || p.drain < 0 || p.drain > 4) return "the oil drain holes are 0 to 4 on each side";
  if (p.crown < 0.02 || p.crown > 0.3) return "the crown is 0.02 to 0.3 of the bore thick (0.04 to 0.15 is usual)";
  if (p.skirtWall < 0.01 || p.skirtWall > 0.15) return "the piston's wall is 0.01 to 0.15 of the bore (half the crown is the usual)";
  if (p.topLand < 0.02 || p.topLand > 0.3) return "the land above the top ring groove is 0.02 to 0.3 of the bore (0.04 to 0.10 is usual)";
  if (p.room < 0.02 || p.room > 1) return "the room round the moving parts is 0.02 to 1 mm";
  if (p.skirtFit < 0.005 || p.skirtFit > 1) return "the piston's room in the bore is 0.005 to 1 mm across (Honda 0.015 to 0.050)";
  if (p.pinFit < 0.001 || p.pinFit > 0.5) return "the pin's room in the piston is 0.001 to 0.5 mm across (Honda 0.002 to 0.014)";
  if (p.ringSide < 0.005 || p.ringSide > 0.5) return "a ring's room in its groove is 0.005 to 0.5 mm (Honda 0.015 to 0.045)";
  for (const [v, what] of [[p.pinHeight, "the pin height"], [p.skirtLen, "the skirt below the pin"], [p.pinLen, "the pin's length"], [p.ringHeight, "a compression ring's height"], [p.oilRingHeight, "the oil ring's height"], [p.ringRadial, "a ring's radial width"], [p.land, "the land between rings"], [p.backRoom, "the groove's back room"], [p.drainDia, "a drain hole's diameter"], [p.bossGap, "the gap between the bosses"], [p.bossReach, "the boss reach"]] as const) if (v < 0) return `${what} is 0 (auto) or more`;
  if (p.bore < 12) return "the bore must be 12 mm or more";
  if (p.pin < 0.18 * p.bore || p.pin > 0.4 * p.bore) return `the pin is 0.18 to 0.4 of the bore: ${(0.18 * p.bore).toFixed(1)} to ${(0.4 * p.bore).toFixed(1)} mm (0.25 to 0.3 is usual)`;
  const g = pistonGeometry(p);
  if (g.shell.innerBelt < 2) return "the walls and the ring grooves leave no room inside the piston: a bigger bore, a thinner wall or fewer rings";
  if (g.belt.depth > g.rp - 2) return "the ring grooves are too deep for the bore: a bigger bore";
  if (p.pinHeight > 0 && g.ch < g.belt.length + p.pin / 2 + 1) return `the pin height is too small for the ring belt: ${(g.belt.length + p.pin / 2 + 1).toFixed(1)} mm or more, or the pin hole would run into a ring groove`;
  if (p.pinHeight > 0 && g.ch < g.shell.crown + p.pin / 2 + 0.5) return `the pin height is too small for the crown: ${(g.shell.crown + p.pin / 2 + 0.5).toFixed(1)} mm or more`;
  if (g.sk < p.pin / 2 + 1) return `the skirt below the pin is too short for the pin: ${(p.pin / 2 + 1).toFixed(1)} mm or more`;
  if (g.zoff < 1 || g.zoff > g.shell.innerBelt - 1) return "the gap between the pin bosses is 2 mm or more and must leave the bosses room inside the piston";
  if (p.pinLen > 0 && (p.pinLen < 2 * g.zoff + 2 || p.pinLen > 2 * g.rp)) return `the pin is ${(2 * g.zoff + 2).toFixed(1)} mm to ${(2 * g.rp).toFixed(1)} mm long (through both bosses, inside the piston's width)`;
  return null;
}

/**
 * The piston and its pin as bodies "Piston" and "Piston pin" (`dec_piston_hollow`, `dec_piston_belt`, `dec_piston_drain`): the cup along x with its pin on the axis through (xp0, 0, zc) and along z; the crown is at x = xp0 + ch, the foot of the skirt at xp0 - sk.
 * `up(x)` is a plane across the cylinder at x.
 */
export function buildPiston(b: Builder, p: PistonSpec, g: PistonGeometry, xp0: number, zc: number): void {
  const up = (x: number): ReturnType<Builder["frame"]> => b.frame([x, 0, zc], [0, 1, 0], [0, 0, 1]);
  b.part("Piston");
  b.extrude(up(xp0 - g.sk), disc(0, 0, g.rp), [], g.sk + g.ch);
  for (const gr of g.belt.grooves) b.extrude(up(xp0 + g.ch - gr.top - gr.height), disc(0, 0, g.rp + 1), [disc(0, 0, g.rp - g.belt.depth)], gr.height, { mode: "cut" });
  // the cavity, open at the foot: wide up to the bottom of the ring belt, narrower under it, up to the crown's underside; then the two pin bosses either side of the rod, and the pin's hole through them and the walls
  const sh = g.shell, top = xp0 + g.ch - sh.crown, wideTop = xp0 + g.ch - Math.max(g.belt.length, sh.crown), zoff = g.zoff;
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
  b.extrude(b.plane(zc - g.rp - 1), disc(xp0, 0, p.pin / 2 + p.pinFit / 2), [], 2 * g.rp + 2, { mode: "cut" });
  // the oil drain holes: radial holes through the oil groove's floor into the cavity, on the two thrust sides, in the groove's middle
  const oilGroove = g.belt.grooves.find((x) => x.oil);
  if (oilGroove && p.drain > 0) {
    const xh = xp0 + g.ch - oilGroove.top - oilGroove.height / 2, r0 = g.shell.innerBelt - 0.5, r1 = g.rp - g.belt.depth + 0.5;
    for (const side of [1, -1]) for (let k = 0; k < p.drain; k++) {
      const a = ((p.drain === 1 ? 90 : 45 + (90 * k) / (p.drain - 1)) * Math.PI) / 180, dy = side * Math.sin(a), dz = Math.cos(a); // (the angle is from the pin's axis, which lies along z)
      b.extrude(b.frame([xh, r0 * dy, zc + r0 * dz], [1, 0, 0], [0, dz, -dy]), disc(0, 0, g.drainR), [], r1 - r0, { mode: "cut" });
    }
  }
  b.part("Piston pin");
  b.extrude(b.plane(zc - g.pinHalf), disc(xp0, 0, p.pin / 2), [], 2 * g.pinHalf);
}

/** The piston standing crown up on the plane, its middle on the click (the model's x axis along the piston's, turned to stand up): the steps that make it */
export function pistonSteps(p: PistonSpec, place?: Place): Result<ModelBuild> {
  const bad = pistonProblem(p);
  if (bad) return err(bad);
  const g = pistonGeometry(p);
  // the piston is built as in the engine (its axis along x, its pin along z); stood up: the model's x becomes the world's up, its z the world's -x
  const at = place ?? { at: [0, 0, 0] as [number, number, number], ex: [1, 0, 0] as [number, number, number], ey: [0, 1, 0] as [number, number, number], ez: [0, 0, 1] as [number, number, number] };
  const up: Place = { at: at.at, ex: at.ez, ey: at.ey, ez: [-at.ex[0], -at.ex[1], -at.ex[2]] };
  const b = new Builder(up);
  buildPiston(b, p, g, g.sk, 0);
  return ok(b.build());
}
/** the piston's footprint when it stands (the diameter) and its height */
export const pistonExtent = (p: PistonSpec): { diameter: number; height: number } => { const g = pistonGeometry(p); return { diameter: 2 * g.rp, height: g.sk + g.ch }; };

/** Real engines' pistons as starting numbers (`dec_piston_maker`): the bore and pin of the Honda GX120, GX160 and GX200 (the service manual), two compression rings and an oil ring; everything else auto */
export const PISTON_PRESETS: readonly { name: string; spec: PistonSpec & { preset: number } }[] = [
  { name: "Honda GX120", spec: { ...PISTON_START, bore: 60, pin: 13, preset: 1 } },
  { name: "Honda GX160", spec: { ...PISTON_START, bore: 68, pin: 18, preset: 2 } },
  { name: "Honda GX200", spec: { ...PISTON_START, bore: 68, pin: 18, preset: 3 } },
];

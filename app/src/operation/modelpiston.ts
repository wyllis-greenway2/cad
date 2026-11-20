// The piston maker (`dec_piston_maker`): every number that builds a piston, and the piston made from them: a hollow cup with a ring belt, oil drain holes, two pin bosses and the pin through them. A model of its own (*Models > Piston*, crown up) and the piston of the
// engine (`modelengine.ts` builds its piston by `buildPiston` here, so the two cannot differ). A number of 0 where the field says so is AUTO: the rule of `dec_piston_parameters` (Honda's numbers, or an assumption, marked so) works it out. Lengths in mm; the proportions of the bore are of the bore.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { Builder, disc, box, outline } from "./modelparts.ts";
import { bulgeOf } from "./arcs.ts";
import type { Place, ModelBuild } from "./modelparts.ts";
import { pistonFit, ringBelt, pistonShell } from "./pistondesign.ts";
import type { RingBelt, Shell } from "./pistondesign.ts";

export interface PistonSpec {
  /** the cylinder's bore (mm) and the piston pin's diameter (mm) */ bore: number; pin: number;
  /** the compression rings' grooves (0 to 3), and whether there is a groove for an oil ring (0 or 1) */ rings: number; oil: number;
  /** the land above the top ring groove, the crown's thickness and the wall's (the skirt, and under the grooves), as proportions of the bore (ASSUMED) */ topLand: number; crown: number; skirtWall: number;
  /** oil drain holes in the oil ring's groove floor, per thrust side (0 to 4) */ drain: number;
  /** the room each side of the rod between the pin bosses (mm) */ room: number;
  /** the piston's own fits (mm): its room in the bore (across; **0 = auto**: by the material), the pin's room in the piston (across), a ring's room above and below it in its groove */ skirtFit: number; pinFit: number; ringSide: number;
  /** **0 = auto** (the rule works it out): the distance from the pin's axis to the crown (the stack), the skirt below the pin (0.27 of the bore, ASSUMED), the pin's length (the longest the walls allow) */ pinHeight: number; skirtLen: number; pinLen: number;
  /** **0 = auto**: a compression ring's height and the oil ring's (Honda's 1.5 and 2.5 mm, down to 1.0 and 2.0 for a small bore), a ring's radial width (the bore over 22, ISO 6622-1's thicker series), the land between rings (1.6 times a compression ring), the groove's back room (0.45 mm) */ ringHeight: number; oilRingHeight: number; ringRadial: number; land: number; backRoom: number;
  /** the lands are cut smaller than the skirt (`dec_piston_lands_clips`, ASSUMED), **0 = auto**: the top land's and the other lands' diameter less than the skirt's (mm across: 0.003 and 0.002 of the bore) */ topLandRelief: number; landRelief: number;
  /** the material (an index of `MATERIALS`: 0 cast aluminium, 1 hypereutectic, 2 forged aluminium, 3 cast iron, 4 steel): its density gives the weight, and its room in the bore is the default when `skirtFit` is 0 (`dec_piston_material`) */ material: number;
  /** the pin: 0 solid, 1 hollow (the pin's bore, `pinBore`, **0 = auto**: 0.55 of the pin, ASSUMED) */ pinKind: number; pinBore: number;
  /** the skirt (`dec_piston_skirt`): 0 round and straight, 1 oval and tapered; **0 = auto**: the oval (narrower along the pin, mm across: 0.001 of the bore), the taper (narrower at the top, mm across: 0.0007 of the bore), the foot's chamfer (0.004 of the bore); the style 0 full, 1 two pads, each pad's angle (degrees, **0 = auto** 80) */ skirtShape: number; oval: number; taper: number; footChamfer: number; skirtStyle: number; padAngle: number;
  /** the pin's retention: 0 none, 1 circlips (a groove in the pin bore near each outer face and a circlip in it: Honda's); **0 = auto**: the groove's width (0.06 of the pin, at least 0.8 mm) and depth (0.028 of the pin, at least 0.4 mm), its distance from the outer face (1.0 mm), the pin's end float (0.1 mm) */ retention: number; clipWidth: number; clipDepth: number; clipEdge: number; pinFloat: number;
  /** **0 = auto**: an oil drain hole's diameter (0.03 of the bore), the gap between the pin bosses (the rod's thickness and its room each side), how far a boss reaches beyond the pin's hole (a wall's thickness) */ drainDia: number; bossGap: number; bossReach: number;
}
const FIT = pistonFit(30); // (the fits do not follow the bore)
/** The materials (`dec_piston_material`): the density (g/cm3, standard values from memory) and the room in the bore across (mm; cast aluminium: Honda's middle, forged aluminium: Wiseco's 0.05, cast iron: Kean's five thousandths of an inch; hypereutectic and steel take their neighbour's: assumed) */
export const MATERIALS: readonly { name: string; density: number; fit: number }[] = [
  { name: "Cast aluminium", density: 2.7, fit: FIT.skirtClearance }, { name: "Hypereutectic aluminium", density: 2.65, fit: FIT.skirtClearance }, { name: "Forged aluminium", density: 2.76, fit: 0.05 },
  { name: "Cast iron", density: 7.2, fit: 0.13 }, { name: "Steel", density: 7.85, fit: 0.13 }];
const STEEL = 7.85; // (the pin and the circlips, g/cm3)
export const PISTON_START: PistonSpec = { bore: 30, pin: 8, rings: 2, oil: 1, topLand: 0.07, crown: 0.08, skirtWall: 0.04, drain: 2, room: 0.15, skirtFit: 0, pinFit: FIT.pinFit, ringSide: FIT.ringSide, pinHeight: 0, skirtLen: 0, pinLen: 0, ringHeight: 0, oilRingHeight: 0, ringRadial: 0, land: 0, backRoom: 0, drainDia: 0, bossGap: 0, bossReach: 0, skirtShape: 1, oval: 0, taper: 0, footChamfer: 0, skirtStyle: 0, padAngle: 0, material: 0, pinKind: 1, pinBore: 0, topLandRelief: 0, landRelief: 0, retention: 1, clipWidth: 0, clipDepth: 0, clipEdge: 0, pinFloat: 0 };
const CLIP_ROOM = 0.05; // (a circlip's room in its groove, mm: two bodies may not share a face)

export interface PistonGeometry {
  /** the piston's room in the bore across (given, or the material's), its density, and the pin's bore (0 solid; auto: 0.55 of the pin, less where that would leave under 1 mm or 0.08 of the pin of wall) */ fit: number; density: number; pinBore: number;
  /** the piston's radius, the distance from the pin's axis to the crown and to the foot of the skirt */ rp: number; ch: number; sk: number;
  belt: RingBelt; shell: Shell;
  /** the rod's small eye's outer radius, and the rod's thickness (worked out from the pin, as the engine does) */ rs: number; w: number;
  /** half the gap between the pin bosses, half the pin's length, an oil drain hole's radius */ zoff: number; pinHalf: number; drainR: number;
  /** the skirt (`dec_piston_skirt`): the radius at the top of the skirt (under the belt; the foot's is `rp`), the oval and the taper across, the foot's chamfer, the skirt's top (mm from the crown), the outer radius along the pin axis at the pin's height, the half angle of the cut-away wedge of a pad skirt (radians from the pin axis; 0 full), and the skirt's radius at a height above the pin's axis */ rt: number; oval: number; taper: number; chamfer: number; skirtTop: number; rzPin: number; wedge: number; radiusAt: (xAbove: number) => number;
  /** the relieved lands from the crown down: where each begins and ends (mm from the crown) and its radius */ lands: { top: number; bottom: number; radius: number }[];
  /** the circlip grooves (none without retention): the groove's width and depth, the distance from the pin's axis to its inner face, the pin bore's radius, the circlip's outer and inner radius and its thickness */ clip: { width: number; depth: number; z: number; bore: number; outer: number; inner: number; thick: number } | null;
}
export function pistonGeometry(p: PistonSpec): PistonGeometry {
  const B = p.bore, mat = MATERIALS[Math.round(p.material)] ?? MATERIALS[0]!, fit = p.skirtFit > 0 ? p.skirtFit : mat.fit, rp = B / 2 - fit / 2, rs = p.pin / 2 + 1.5, w = Math.max(3, Math.round(p.pin * 0.75 * 10) / 10);
  const typed = (v: number): number | undefined => (v > 0 ? v : undefined);
  const belt = ringBelt(B, p.rings, p.oil, p.topLand, p.ringSide, { ring: typed(p.ringHeight), oilRing: typed(p.oilRingHeight), land: typed(p.land), radial: typed(p.ringRadial), back: typed(p.backRoom) });
  const shell = pistonShell(B, rp, belt.depth, p.crown, p.skirtWall, p.pin, p.pinFit, typed(p.bossReach));
  // the pin height is the stack (the belt, then the larger of the pin's radius and 0.05 of the bore: ASSUMED, and what the rod's small eye and its slot need); the cavity under the crown must hold the rod's eye too
  const stack = Math.max(belt.length + Math.max(p.pin / 2 + 0.05 * B, rs + 2.5), shell.crown + rs + 2.5);
  const oil = belt.grooves.find((x) => x.oil);
  // the skirt: oval, taper and chamfer (`dec_piston_skirt`)
  const round = p.skirtShape === 0, oval = round ? 0 : p.oval > 0 ? p.oval : 0.001 * B, taper = round ? 0 : p.taper > 0 ? p.taper : 0.0007 * B, chamfer = p.footChamfer > 0 ? p.footChamfer : 0.004 * B;
  const rt = rp - taper / 2, chH = p.pinHeight > 0 ? p.pinHeight : stack, skL = p.skirtLen > 0 ? p.skirtLen : 0.27 * B, skirtTop = belt.length, topAbove = chH - belt.length; // (the skirt's top: the belt's length below the crown, topAbove above the pin's axis)
  const rAt = (xAbove: number): number => rp - (taper / 2) * Math.min(1, Math.max(0, (xAbove + skL) / Math.max(1e-9, skL + topAbove))); // (the skirt's radius xAbove mm above the pin's axis: the foot's at the foot, rt at the top)
  const rzPin = Math.min(rAt(0), rp - oval / 2);
  const wedge = p.skirtStyle === 1 ? ((90 - (p.padAngle > 0 ? p.padAngle : 80) / 2) * Math.PI) / 180 : 0;
  // the relieved lands (`dec_piston_lands_clips`): the top land and the lands between grooves, smaller than the skirt's top by a diameter
  const reTop = p.topLandRelief > 0 ? p.topLandRelief : 0.003 * B, reLand = p.landRelief > 0 ? p.landRelief : 0.002 * B, lands: PistonGeometry["lands"] = [];
  const gs = belt.grooves;
  lands.push({ top: 0, bottom: gs[0]?.top ?? belt.length, radius: rt - reTop / 2 });
  for (let k = 0; k + 1 < gs.length; k++) lands.push({ top: gs[k]!.top + gs[k]!.height, bottom: gs[k + 1]!.top, radius: rt - reLand / 2 });
  // the circlip grooves: in the pin bore near each outer face; the pin ends the float short of the circlip
  const bore = p.pin / 2 + p.pinFit / 2, cw = p.clipWidth > 0 ? p.clipWidth : Math.max(0.8, 0.06 * p.pin), cd = p.clipDepth > 0 ? p.clipDepth : Math.max(0.4, 0.028 * p.pin), edge = p.clipEdge > 0 ? p.clipEdge : 1.0, flt = p.pinFloat > 0 ? p.pinFloat : 0.1;
  const zIn = rzPin - edge - cw, outer = bore + cd - CLIP_ROOM;
  const clip = p.retention === 1 ? { width: cw, depth: cd, z: zIn, bore, outer, inner: outer - 2.8 * cd, thick: cw - 2 * CLIP_ROOM } : null;
  return { rt, oval, taper, chamfer, skirtTop, rzPin, wedge, radiusAt: rAt, fit, density: mat.density, pinBore: p.pinKind === 1 ? (p.pinBore > 0 ? p.pinBore : Math.min(0.55 * p.pin, p.pin - 2 * Math.max(1, 0.08 * p.pin))) : 0, rp, ch: p.pinHeight > 0 ? p.pinHeight : stack, sk: p.skirtLen > 0 ? p.skirtLen : 0.27 * B, belt, shell, rs, w,
    zoff: (p.bossGap > 0 ? p.bossGap : w + 2 * p.room) / 2, pinHalf: p.pinLen > 0 ? p.pinLen / 2 : clip ? zIn - flt : Math.sqrt(rp * rp - (p.pin / 2 + 1) ** 2) - 0.3,
    drainR: Math.min(p.drainDia > 0 ? p.drainDia : 0.03 * B, 0.8 * (oil?.height ?? Infinity)) / 2, lands, clip };
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
  if (!Number.isInteger(p.material) || p.material < 0 || p.material >= MATERIALS.length) return `the material is 0 to ${MATERIALS.length - 1}: ${MATERIALS.map((m, i) => `${i} ${m.name.toLowerCase()}`).join(", ")}`;
  if (p.pinKind !== 0 && p.pinKind !== 1) return "the pin is solid (0) or hollow (1)";
  if (p.pinBore < 0) return "the pin's bore is 0 (auto) or more";
  if (p.skirtFit !== 0 && (p.skirtFit < 0.005 || p.skirtFit > 1)) return "the piston's room in the bore is 0 (by the material) or 0.005 to 1 mm across (Honda 0.015 to 0.050)";
  if (p.pinFit < 0.001 || p.pinFit > 0.5) return "the pin's room in the piston is 0.001 to 0.5 mm across (Honda 0.002 to 0.014)";
  if (p.ringSide < 0.005 || p.ringSide > 0.5) return "a ring's room in its groove is 0.005 to 0.5 mm (Honda 0.015 to 0.045)";
  for (const [v, what] of [[p.pinHeight, "the pin height"], [p.skirtLen, "the skirt below the pin"], [p.pinLen, "the pin's length"], [p.ringHeight, "a compression ring's height"], [p.oilRingHeight, "the oil ring's height"], [p.ringRadial, "a ring's radial width"], [p.land, "the land between rings"], [p.backRoom, "the groove's back room"], [p.drainDia, "a drain hole's diameter"], [p.bossGap, "the gap between the bosses"], [p.bossReach, "the boss reach"]] as const) if (v < 0) return `${what} is 0 (auto) or more`;
  for (const [v, what] of [[p.topLandRelief, "the top land's relief"], [p.landRelief, "the lands' relief"], [p.clipWidth, "the circlip groove's width"], [p.clipDepth, "the circlip groove's depth"], [p.clipEdge, "the circlip groove's distance from the face"], [p.pinFloat, "the pin's end float"]] as const) if (v < 0) return `${what} is 0 (auto) or more`;
  for (const [v, what] of [[p.oval, "the skirt's oval"], [p.taper, "the skirt's taper"], [p.footChamfer, "the foot's chamfer"], [p.padAngle, "the pad angle"]] as const) if (v < 0) return `${what} is 0 (auto) or more`;
  if (p.skirtShape !== 0 && p.skirtShape !== 1) return "the skirt shape is 0 (round) or 1 (oval and tapered)";
  if (p.skirtStyle !== 0 && p.skirtStyle !== 1) return "the skirt is full (0) or two pads (1)";
  if (p.padAngle !== 0 && (p.padAngle < 30 || p.padAngle > 150)) return "a pad spans 30 to 150 degrees (70 to 90 is usual)";
  if (p.retention !== 0 && p.retention !== 1) return "the pin retention is 0 (none) or 1 (circlips)";
  if (p.bore < 12) return "the bore must be 12 mm or more";
  if (p.pin < 0.18 * p.bore || p.pin > 0.4 * p.bore) return `the pin is 0.18 to 0.4 of the bore: ${(0.18 * p.bore).toFixed(1)} to ${(0.4 * p.bore).toFixed(1)} mm (0.25 to 0.3 is usual)`;
  const g = pistonGeometry(p);
  for (const l of g.lands) if (l.radius < g.rp - g.belt.depth + 0.3) return `the lands are cut too far below the skirt for the groove floors: ${((g.rp - g.belt.depth + 0.3 - l.radius) * 2).toFixed(2)} mm less relief`;
  if (g.shell.innerBelt < 2) return "the walls and the ring grooves leave no room inside the piston: a bigger bore, a thinner wall or fewer rings";
  if (g.belt.depth > g.rp - 2) return "the ring grooves are too deep for the bore: a bigger bore";
  if (p.pinHeight > 0 && g.ch < g.belt.length + p.pin / 2 + 1) return `the pin height is too small for the ring belt: ${(g.belt.length + p.pin / 2 + 1).toFixed(1)} mm or more, or the pin hole would run into a ring groove`;
  if (p.pinHeight > 0 && g.ch < g.shell.crown + p.pin / 2 + 0.5) return `the pin height is too small for the crown: ${(g.shell.crown + p.pin / 2 + 0.5).toFixed(1)} mm or more`;
  if (g.sk < p.pin / 2 + 1) return `the skirt below the pin is too short for the pin: ${(p.pin / 2 + 1).toFixed(1)} mm or more`;
  if (g.zoff < 1 || g.zoff > g.shell.innerBelt - 1) return "the gap between the pin bosses is 2 mm or more and must leave the bosses room inside the piston";
  if (p.pinLen > 0 && (p.pinLen < 2 * g.zoff + 2 || p.pinLen > 2 * g.rp)) return `the pin is ${(2 * g.zoff + 2).toFixed(1)} mm to ${(2 * g.rp).toFixed(1)} mm long (through both bosses, inside the piston's width)`;
  if (g.pinBore > 0 && g.pinBore > p.pin - 2 * Math.max(1, 0.08 * p.pin)) return `the pin's bore leaves too thin a wall: ${(p.pin - 2 * Math.max(1, 0.08 * p.pin)).toFixed(1)} mm or less`;
  if (g.oval > 0.01 * p.bore || g.taper > 0.01 * p.bore) return `the skirt's oval and taper are ${(0.01 * p.bore).toFixed(2)} mm across or less (0.01 of the bore)`;
  if (g.chamfer > g.sk / 2) return `the foot's chamfer is ${(g.sk / 2).toFixed(1)} mm or less (half the skirt)`;
  if (p.skirtStyle === 1 && g.sk < g.shell.boss + 2) return `a skirt of two pads needs the skirt to reach ${(g.shell.boss + 2).toFixed(1)} mm below the pin or more`;
  const c = g.clip;
  if (c) {
    const yw = Math.min(g.shell.boss, 0.95 * Math.sqrt(Math.max(0, g.rp * g.rp - g.shell.inner * g.shell.inner)));
    if (p.clipEdge > 0 && p.clipEdge < 0.5) return "the circlip groove is 0.5 mm or more from the face (0: auto)";
    if (c.z < g.zoff + 1) return "the circlip grooves leave no room for the pin between the bosses: a bigger bore, a narrower groove or a smaller gap between the bosses";
    if (c.z < g.shell.inner && c.bore + c.depth + 0.2 > yw) return "the circlip groove is deeper than the pin boss is wide: a shallower groove or a longer boss reach";
    if (g.pinHalf > c.z) return `the pin is too long for the circlips: ${(2 * c.z).toFixed(1)} mm or less`;
  }
  return null;
}

/**
 * The piston and its pin as bodies "Piston" and "Piston pin" (`dec_piston_hollow`, `dec_piston_belt`, `dec_piston_drain`): the cup along x with its pin on the axis through (xp0, 0, zc) and along z; the crown is at x = xp0 + ch, the foot of the skirt at xp0 - sk.
 * `up(x)` is a plane across the cylinder at x.
 */
export function buildPiston(b: Builder, p: PistonSpec, g: PistonGeometry, xp0: number, zc: number): void {
  const up = (x: number): ReturnType<Builder["frame"]> => b.frame([x, 0, zc], [0, 1, 0], [0, 0, 1]);
  b.part("Piston");
  // the outer body, turned (`dec_piston_skirt`): the foot (chamfered) at the skirt's full radius, narrowing upward by the taper to the belt, straight to the crown
  const xf = xp0 - g.sk, xc = xp0 + g.ch, xs = xc - g.skirtTop, c0 = Math.min(g.chamfer, g.sk / 2 - 0.01);
  b.turn(b.frame([0, 0, zc], [1, 0, 0], [0, 1, 0]), [[xf, 0], [xf, g.rp - c0], [xf + c0, g.rp], [xs, g.rt], [xc, g.rt], [xc, 0]], undefined, [0, 0, zc], [1, 0, 0]);
  // the oval: a lens (two arcs) as the skirt's section, narrower along the pin, cut from the foot to the belt
  if (g.oval > 0) {
    const w = g.rp + 0.05, bz = g.rp - g.oval / 2, A: [number, number] = [-w, 0], B: [number, number] = [w, 0];
    b.extrude(up(xf), disc(0, 0, g.rp + 1), [outline([A, B], [bulgeOf(A, [0, bz], B), bulgeOf(B, [0, -bz], A)])], xs - xf + 0.3, { mode: "cut" }); // (0.3 mm past the skirt's top, into the lowest groove or the land: its top face must not lie in the groove's bottom face)
  }
  // two pads: the skirt cut away at the two sides of the pin, below the bosses, leaving a pad on each thrust side
  if (g.wedge > 0) {
    const q = (g.rp + 2) / Math.cos(g.wedge), s = Math.sin(g.wedge) * q, z = Math.cos(g.wedge) * q, xe = xp0 - g.shell.boss - 0.3;
    for (const side of [1, -1]) b.extrude(up(xf - 0.5), outline([[0, 0], [s, side * z], [-s, side * z]]), [], xe - (xf - 0.5), { mode: "cut" });
  }
  for (const gr of g.belt.grooves) b.extrude(up(xp0 + g.ch - gr.top - gr.height), disc(0, 0, g.rp + 1), [disc(0, 0, g.rp - g.belt.depth)], gr.height, { mode: "cut" });
  // the lands are cut smaller than the skirt (`dec_piston_lands_clips`)
  for (const l of g.lands) if (l.bottom - l.top > 1e-6) b.extrude(up(xp0 + g.ch - l.bottom), disc(0, 0, g.rp + 1), [disc(0, 0, l.radius)], l.bottom - l.top, { mode: "cut" });
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
  // the circlip grooves in the pin bore, one near each outer face
  const c = g.clip;
  if (c) for (const side of [1, -1]) b.extrude(b.plane(side > 0 ? zc + c.z : zc - c.z - c.width), disc(xp0, 0, c.bore + c.depth), [disc(xp0, 0, c.bore - 0.5)], c.width, { mode: "cut" });
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
  b.extrude(b.plane(zc - g.pinHalf), disc(xp0, 0, p.pin / 2), g.pinBore > 0 ? [disc(xp0, 0, g.pinBore / 2)] : [], 2 * g.pinHalf);
  // the circlips: a plain ring in each groove, with a little room (no gap or ears: not modelled)
  if (c) for (const side of [1, -1]) { b.part(side > 0 ? "Circlip 1" : "Circlip 2"); b.extrude(b.plane(side > 0 ? zc + c.z + CLIP_ROOM : zc - c.z - c.width + CLIP_ROOM), disc(xp0, 0, c.outer), [disc(xp0, 0, c.inner)], c.thick); }
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

const simpson = (f: (x: number) => number, a: number, b: number, n = 2000): number => { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return (s * h) / 3; };
/** The volumes (mm3) of the piston (the cup), the pin and the two circlips, worked out from the numbers (the kernel's volumes agree within 0.3 %, a test holds it) */
export function pistonVolumes(p: PistonSpec, g: PistonGeometry = pistonGeometry(p)): { cup: number; pin: number; clips: number } {
  const sh = g.shell, H = g.sk + g.ch, rp = g.rp, bt = g.belt, wideL = H - Math.max(bt.length, sh.crown), topL = H - sh.crown, zoff = g.zoff, rho = p.pin / 2 + p.pinFit / 2;
  const frustum = (h: number, r0: number, r1: number): number => (Math.PI * h * (r0 * r0 + r0 * r1 + r1 * r1)) / 3;
  const c0 = Math.min(g.chamfer, g.sk / 2 - 0.01), xsH = H - g.skirtTop; // (heights above the foot)
  // the outer body, turned: the chamfered foot, the tapered skirt, the straight belt to the crown
  let v = frustum(c0, rp - c0, rp) + frustum(xsH - c0, rp, g.rt) + Math.PI * g.rt * g.rt * g.skirtTop;
  // the oval: what the lens cut takes off the skirt (a circle of the skirt's radius there, less its part inside the lens)
  if (g.oval > 0) {
    const w = rp + 0.05, bz = rp - g.oval / 2, R = (w * w + bz * bz) / (2 * bz), d = R - bz;
    const lens = (y: number): number => Math.sqrt(Math.max(0, R * R - y * y)) - d;
    const ring = (x: number): number => { const r = g.rp - (g.rp - g.rt) * Math.min(1, Math.max(0, (x - c0) / (xsH - c0))); const lim = Math.min(r, w); return Math.PI * r * r - simpson((y) => 2 * Math.min(Math.sqrt(Math.max(0, r * r - y * y)), lens(y)), -lim, lim, 1200); };
    v -= simpson(ring, 0, xsH, 40);
  }
  for (const gr of bt.grooves) v -= Math.PI * (g.rt * g.rt - (rp - bt.depth) ** 2) * gr.height;
  for (const l of g.lands) v -= Math.PI * (g.rt * g.rt - l.radius ** 2) * (l.bottom - l.top);
  v -= Math.PI * sh.inner ** 2 * wideL + Math.PI * sh.innerBelt ** 2 * (topL - wideL);
  const reach = (outer: number, inside: number): number => Math.min(sh.boss, 0.95 * Math.sqrt(Math.max(0, outer * outer - inside * inside))), footB = g.sk - sh.boss;
  const yw = reach(rp, sh.inner), yn = reach(rp - bt.depth, sh.innerBelt);
  const area = (R: number, yb: number): number => simpson((y) => Math.max(0, Math.sqrt(Math.max(0, R * R - y * y)) - zoff), -yb, yb);
  v += 2 * (area(sh.inner, yw) * (wideL - footB) + area(sh.innerBelt, yn) * Math.max(0, topL - wideL));
  v -= 2 * simpson((y) => 2 * Math.sqrt(Math.max(0, rho * rho - y * y)) * Math.max(0, Math.sqrt(Math.max(0, sh.inner * sh.inner - y * y)) - zoff), -rho, rho);
  // the pin's hole through the two walls: from the cavity out to the skirt's outer face at the pin (the circle of the skirt's radius there, or the lens, whichever is nearer)
  const rPin = g.radiusAt(0), wPin = rp + 0.05, bzP = rp - g.oval / 2, RP = (wPin * wPin + bzP * bzP) / (2 * bzP), dP = RP - bzP;
  const outerZ = (y: number): number => Math.min(Math.sqrt(Math.max(0, rPin * rPin - y * y)), g.oval > 0 ? Math.sqrt(Math.max(0, RP * RP - y * y)) - dP : Infinity);
  v -= 2 * simpson((y) => 2 * Math.sqrt(Math.max(0, rho * rho - y * y)) * (outerZ(y) - Math.sqrt(Math.max(0, sh.inner * sh.inner - y * y))), -rho, rho);
  if (g.clip) v -= 2 * Math.PI * ((g.clip.bore + g.clip.depth) ** 2 - g.clip.bore ** 2) * g.clip.width;
  // two pads: the wedges cut away below the bosses (a ring sector of the skirt's wall, over the height cut; the wall is the full radius at the foot: the oval and the taper there are neglected, the chamfer is inside the cut)
  if (g.wedge > 0) v -= 2 * g.wedge * (rp * rp - sh.inner * sh.inner) * (g.sk - sh.boss - 0.3 + 0.5);
  const pin = Math.PI * ((p.pin / 2) ** 2 - (g.pinBore / 2) ** 2) * 2 * g.pinHalf;
  return { cup: v, pin, clips: g.clip ? 2 * Math.PI * (g.clip.outer ** 2 - g.clip.inner ** 2) * g.clip.thick : 0 };
}
/** The weight (grams) of the piston, the pin and the circlips: the piston in its material, the pin and the circlips in steel */
export function pistonWeight(p: PistonSpec, g: PistonGeometry = pistonGeometry(p)): { piston: number; pin: number; clips: number; total: number } {
  const v = pistonVolumes(p, g), piston = (v.cup * g.density) / 1000, pin = (v.pin * STEEL) / 1000, clips = (v.clips * STEEL) / 1000;
  return { piston, pin, clips, total: piston + pin + clips };
}

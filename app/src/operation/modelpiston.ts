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
  /** the crown (`dec_piston_crown`): the shape 0 flat, 1 dome, 2 dish, 3 bowl; **0 = auto**: the shape's height (a dome's height, a dish's or bowl's depth: 0.04, 0.03, 0.04 of the bore), the shaped part's diameter (0.75 of the bore, a bowl 0.6), the crown's edge chamfer (0.004 of the bore); valve reliefs in a flat crown: how many (0 to 2: not 0 = auto), each one's diameter (0.3 of the bore), depth (0.02) and its distance from the axis along the pin's axis (0.25) */ crownShape: number; crownHeight: number; crownDia: number; crownChamfer: number; valveReliefs: number; reliefDia: number; reliefDepth: number; reliefOffset: number;
  /** the skirt's arched cutaway and the flats round the pin (`dec_piston_shape`): the arch's height above the foot (mm, **0 = auto**: up to just below the bosses); the pin's flats 0 none, 1 flat, the flat's depth below the skirt's face (**0 = auto** 0.02 of the bore) and its width (**0 = auto**: the boss and a millimetre either side) */ archHeight: number; pinFlat: number; flatDepth: number; flatWidth: number; /** the ramp's angle to the axis (degrees, **0 = auto** 30; for pinFlat 2, a flat that angles out to the skirt's face before the ring belt) */ flatRamp: number;
  /** the pin bosses (`dec_piston_interior`): 0 block pads (a rectangular block either side of the rod), 1 round (a boss round the pin's axis, braced to the crown by a rib); the rib's thickness (mm, **0 = auto**: 0.8 of the wall) */ bossShape: number; ribWidth: number;
  /** the pin's retention: 0 none, 1 circlips (a groove in the pin bore near each outer face and a circlip in it: Honda's); **0 = auto**: the groove's width (0.06 of the pin, at least 0.8 mm) and depth (0.028 of the pin, at least 0.4 mm), its distance from the outer face (1.0 mm, measured where the groove is widest: the face curves away from the pin's axis), the pin's end float (0.1 mm) */ retention: number; clipWidth: number; clipDepth: number; clipEdge: number; pinFloat: number;
  /** **0 = auto**: an oil drain hole's diameter (0.03 of the bore), the gap between the pin bosses (the rod's thickness and its room each side), how far a boss reaches beyond the pin's hole (a wall's thickness) */ drainDia: number; bossGap: number; bossReach: number;
}
const FIT = pistonFit(30); // (the fits do not follow the bore)
/** The materials (`dec_piston_material`): the density (g/cm3, standard values from memory) and the room in the bore across (mm; cast aluminium: Honda's middle, forged aluminium: Wiseco's 0.05, cast iron: Kean's five thousandths of an inch; hypereutectic and steel take their neighbour's: assumed) */
export const MATERIALS: readonly { name: string; density: number; fit: number }[] = [
  { name: "Cast aluminium", density: 2.7, fit: FIT.skirtClearance }, { name: "Hypereutectic aluminium", density: 2.65, fit: FIT.skirtClearance }, { name: "Forged aluminium", density: 2.76, fit: 0.05 },
  { name: "Cast iron", density: 7.2, fit: 0.13 }, { name: "Steel", density: 7.85, fit: 0.13 }];
const STEEL = 7.85; // (the pin and the circlips, g/cm3)
export const PISTON_START: PistonSpec = { bore: 30, pin: 8, rings: 2, oil: 1, topLand: 0.07, crown: 0.08, skirtWall: 0.04, drain: 2, room: 0.15, skirtFit: 0, pinFit: FIT.pinFit, ringSide: FIT.ringSide, pinHeight: 0, skirtLen: 0, pinLen: 0, ringHeight: 0, oilRingHeight: 0, ringRadial: 0, land: 0, backRoom: 0, drainDia: 0, bossGap: 0, bossReach: 0, crownShape: 0, crownHeight: 0, crownDia: 0, crownChamfer: 0, valveReliefs: 0, reliefDia: 0, reliefDepth: 0, reliefOffset: 0, archHeight: 0, pinFlat: 2, flatDepth: 0, flatWidth: 0, flatRamp: 0, bossShape: 1, ribWidth: 0, skirtShape: 1, oval: 0, taper: 0, footChamfer: 0, skirtStyle: 1, padAngle: 0, material: 0, pinKind: 1, pinBore: 0, topLandRelief: 0, landRelief: 0, retention: 1, clipWidth: 0, clipDepth: 0, clipEdge: 0, pinFloat: 0 };
const CLIP_ROOM = 0.05; // (a circlip's room in its groove, mm: two bodies may not share a face)

export interface PistonGeometry {
  /** the piston's room in the bore across (given, or the material's), its density, and the pin's bore (0 solid; auto: 0.55 of the pin, less where that would leave under 1 mm or 0.08 of the pin of wall) */ fit: number; density: number; pinBore: number;
  /** the piston's radius, the distance from the pin's axis to the crown and to the foot of the skirt */ rp: number; ch: number; sk: number;
  belt: RingBelt; shell: Shell;
  /** the rod's small eye's outer radius, and the rod's thickness (worked out from the pin, as the engine does) */ rs: number; w: number;
  /** half the gap between the pin bosses, half the pin's length, an oil drain hole's radius */ zoff: number; pinHalf: number; drainR: number;
  /** the skirt (`dec_piston_skirt`): the radius at the top of the skirt (under the belt; the foot's is `rp`), the oval and the taper across, the foot's chamfer, the skirt's top (mm from the crown), the outer radius along the pin axis at the pin's height, the half angle of the cut-away wedge of a pad skirt (radians from the pin axis; 0 full), and the skirt's radius at a height above the pin's axis */ rt: number; oval: number; taper: number; chamfer: number; skirtTop: number; rzPin: number; wedge: number; radiusAt: (xAbove: number) => number; outerZ: (y: number) => number; faceZ: (y: number) => number; faceAt: (xAbove: number, y: number) => number;
  /** the crown (`dec_piston_crown`): the shape, its height (a dome's rise or a dish's or bowl's depth), the shaped part's radius, the edge chamfer, how far the piston reaches above the flat crown (a dome's height), and the valve reliefs (how many, each one's radius, depth and distance from the axis) */ cr: { shape: number; height: number; radius: number; edge: number; top: number; reliefs: { n: number; r: number; depth: number; off: number } };
  /** the pin bosses (`dec_piston_interior`): round with a rib (or block pads), the boss's radius round the pin's axis and the rib's thickness */ round: { on: boolean; r: number; rib: number };
  /** the arched cutaway (none for a full skirt): its half width at the foot, its height above the foot, and the flats round the pin: the plane's distance from the axis, the half width, and where it begins and ends (mm above the pin's axis) */ arch: { on: boolean; fits: boolean; w: number; h: number } ; flat: { on: boolean; fits: boolean; z: number; yf: number; x0: number; x1: number; xa: number; tan: number };
  /** the relieved lands from the crown down: where each begins and ends (mm from the crown) and its radius */ lands: { top: number; bottom: number; radius: number }[];
  /** the circlip grooves (none without retention): the groove's width and depth, the distance from the pin's axis to its inner face, the pin bore's radius, the circlip's outer and inner radius and its thickness */ clip: { width: number; depth: number; z: number; bore: number; outer: number; inner: number; thick: number } | null;
}
export function pistonGeometry(p: PistonSpec): PistonGeometry {
  const B = p.bore, mat = MATERIALS[Math.round(p.material)] ?? MATERIALS[0]!, fit = p.skirtFit > 0 ? p.skirtFit : mat.fit, rp = B / 2 - fit / 2, rs = p.pin / 2 + 1.5, w = Math.max(3, Math.round(p.pin * 0.75 * 10) / 10);
  const typed = (v: number): number | undefined => (v > 0 ? v : undefined);
  const belt = ringBelt(B, p.rings, p.oil, p.topLand, p.ringSide, { ring: typed(p.ringHeight), oilRing: typed(p.oilRingHeight), land: typed(p.land), radial: typed(p.ringRadial), back: typed(p.backRoom) });
  const shell = pistonShell(B, rp, belt.depth, p.crown, p.skirtWall, p.pin, p.pinFit, typed(p.bossReach));
  // the pin height is the stack (the belt, then the larger of the pin's radius and 0.05 of the bore: ASSUMED, and what the rod's small eye and its slot need); the cavity under the crown must hold the rod's eye too
  const stack = Math.max(belt.length + Math.max(p.pin / 2 + 0.05 * B, rs + 2.5), shell.crown + rs + 2.5, p.bossShape === 1 ? Math.max(belt.length, shell.crown) + shell.boss + 0.5 : 0); // (a round boss stands wholly below the ring belt and the crown)
  const oil = belt.grooves.find((x) => x.oil);
  // the skirt: oval, taper and chamfer (`dec_piston_skirt`)
  const round = p.skirtShape === 0, oval = round ? 0 : p.oval > 0 ? p.oval : 0.001 * B, taper = round ? 0 : p.taper > 0 ? p.taper : 0.0007 * B, chamfer = p.footChamfer > 0 ? p.footChamfer : 0.004 * B;
  const rt = rp - taper / 2, chH = p.pinHeight > 0 ? p.pinHeight : stack, skL = p.skirtLen > 0 ? p.skirtLen : 0.27 * B, skirtTop = belt.length, topAbove = chH - belt.length; // (the skirt's top: the belt's length below the crown, topAbove above the pin's axis)
  const rAt = (xAbove: number): number => rp - (taper / 2) * Math.min(1, Math.max(0, (xAbove + skL) / Math.max(1e-9, skL + topAbove))); // (the skirt's radius xAbove mm above the pin's axis: the foot's at the foot, rt at the top)
  const rzPin = Math.min(rAt(0), rp - oval / 2);
  // the skirt's outer face at the pin's height, along the pin's axis, y off the axis (across the thrust): the circle of the skirt's radius there or the oval's lens, whichever is nearer
  // the flats round the pin and the arched cutaway (`dec_piston_shape`)
  const wedgeA = p.skirtStyle === 1 ? ((90 - (p.padAngle > 0 ? p.padAngle : 80) / 2) * Math.PI) / 180 : 0, bossR = shell.boss, zoffG = (p.bossGap > 0 ? p.bossGap : w + 2 * p.room) / 2;
  // the flats and the arch are on by default and are made where the piston has room for them (a piston too small for them has none); numbers typed for them are held to (a refusal when they cannot be made)
  const flatTyped = p.flatDepth > 0 || p.flatWidth > 0, archTyped = p.archHeight > 0 || p.padAngle > 0;
  const flatG = { z: rzPin - (p.flatDepth > 0 ? p.flatDepth : 0.02 * B), yf: p.flatWidth > 0 ? p.flatWidth / 2 : bossR + 1, x0: -(bossR + 0.1), x1: chH - belt.length - 0.6 };
  // the ramp (pinFlat 2): the flat's top angles out to the skirt's face, reaching it at x1, so the flat never reaches the ring belt
  const tanR = Math.tan(((p.flatRamp > 0 ? p.flatRamp : 30) * Math.PI) / 180), xaR = p.pinFlat === 2 ? flatG.x1 - Math.max(0, rzPin - flatG.z) / tanR : flatG.x1;
  const flatFits = xaR - flatG.x0 >= 2 && flatG.z >= zoffG + 3 && flatG.yf >= p.pin / 2 + 1;
  const flat = { on: (p.pinFlat === 1 || p.pinFlat === 2) && (flatFits || flatTyped), fits: flatFits, ...flatG, xa: xaR, tan: tanR };
  const archH = p.archHeight > 0 ? p.archHeight : skL - bossR - 0.3, archFits = archH >= 2 && archH <= skL - bossR - 0.3 + 1e-9;
  const arch = { on: wedgeA > 0 && (archFits || archTyped), fits: archFits, w: rp * Math.sin(wedgeA), h: archH };
  const wL = rp + 0.05, bzL = rp - oval / 2, RL = (wL * wL + bzL * bzL) / (2 * bzL), dL = RL - bzL;
  const faceAt = (xAbove: number, y: number): number => Math.min(Math.sqrt(Math.max(0, rAt(xAbove) * rAt(xAbove) - y * y)), oval > 0 ? Math.sqrt(Math.max(0, RL * RL - y * y)) - dL : Infinity); // (the skirt's round face at a height above the pin's axis, y off the pin's axis)
  const faceZ = (y: number): number => Math.min(Math.sqrt(Math.max(0, rAt(0) * rAt(0) - y * y)), oval > 0 ? Math.sqrt(Math.max(0, RL * RL - y * y)) - dL : Infinity); // (the skirt's round face)
  const outerZ = (y: number): number => Math.min(faceZ(y), flat.on && Math.abs(y) <= flat.yf ? flat.z : Infinity); // (and its face with the flats)
  const cs = Math.round(p.crownShape), crEdge = p.crownChamfer > 0 ? p.crownChamfer : 0.004 * B, crH = cs === 0 ? 0 : p.crownHeight > 0 ? p.crownHeight : [0, 0.04, 0.03, 0.04][cs]! * B, crR = (p.crownDia > 0 ? p.crownDia : (cs === 3 ? 0.6 : 0.75) * B) / 2;
  const cr = { shape: cs, height: crH, radius: crR, edge: crEdge, top: cs === 1 ? crH : 0, reliefs: { n: Math.round(p.valveReliefs), r: (p.reliefDia > 0 ? p.reliefDia : 0.3 * B) / 2, depth: p.reliefDepth > 0 ? p.reliefDepth : 0.02 * B, off: p.reliefOffset > 0 ? p.reliefOffset : 0.25 * B } };
  // the relieved lands (`dec_piston_lands_clips`): the top land and the lands between grooves, smaller than the skirt's top by a diameter
  const reTop = p.topLandRelief > 0 ? p.topLandRelief : 0.003 * B, reLand = p.landRelief > 0 ? p.landRelief : 0.002 * B, lands: PistonGeometry["lands"] = [];
  const gs = belt.grooves;
  lands.push({ top: 0, bottom: gs[0]?.top ?? belt.length, radius: rt - reTop / 2 });
  for (let k = 0; k + 1 < gs.length; k++) lands.push({ top: gs[k]!.top + gs[k]!.height, bottom: gs[k + 1]!.top, radius: rt - reLand / 2 });
  // the circlip grooves: in the pin bore near each outer face; the pin ends the float short of the circlip
  const bore = p.pin / 2 + p.pinFit / 2, cw = p.clipWidth > 0 ? p.clipWidth : Math.max(0.8, 0.06 * p.pin), cd = p.clipDepth > 0 ? p.clipDepth : Math.max(0.4, 0.028 * p.pin), edge = p.clipEdge > 0 ? p.clipEdge : 1.0, flt = p.pinFloat > 0 ? p.pinFloat : 0.1;
  const zIn = outerZ(bore + cd) - edge - cw, outer = bore + cd - CLIP_ROOM;
  const clip = p.retention === 1 ? { width: cw, depth: cd, z: zIn, bore, outer, inner: outer - 2.8 * cd, thick: cw - 2 * CLIP_ROOM } : null;
  return { round: { on: p.bossShape === 1, r: shell.boss, rib: p.ribWidth > 0 ? p.ribWidth : 0.8 * shell.wall }, arch, flat, cr, rt, oval, taper, chamfer, skirtTop, rzPin, wedge: wedgeA, radiusAt: rAt, outerZ, faceZ, faceAt, fit, density: mat.density, pinBore: p.pinKind === 1 ? (p.pinBore > 0 ? p.pinBore : Math.min(0.55 * p.pin, p.pin - 2 * Math.max(1, 0.08 * p.pin))) : 0, rp, ch: p.pinHeight > 0 ? p.pinHeight : stack, sk: p.skirtLen > 0 ? p.skirtLen : 0.27 * B, belt, shell, rs, w,
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
  for (const [v, what] of [[p.crownHeight, "the crown shape's height"], [p.crownDia, "the crown shape's diameter"], [p.crownChamfer, "the crown's edge chamfer"], [p.reliefDia, "a valve relief's diameter"], [p.reliefDepth, "a valve relief's depth"], [p.reliefOffset, "a valve relief's distance from the axis"]] as const) if (v < 0) return `${what} is 0 (auto) or more`;
  if (!Number.isInteger(p.crownShape) || p.crownShape < 0 || p.crownShape > 3) return "the crown is flat (0), a dome (1), a dish (2) or a bowl (3)";
  if (!Number.isInteger(p.valveReliefs) || p.valveReliefs < 0 || p.valveReliefs > 2) return "the valve reliefs are 0 to 2";
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
  for (const [v, what] of [[p.archHeight, "the arch's height"], [p.flatDepth, "the flat's depth"], [p.flatWidth, "the flat's width"]] as const) if (v < 0) return `${what} is 0 (auto) or more`;
  if (p.bossShape !== 0 && p.bossShape !== 1) return "the pin bosses are block pads (0) or round with a rib (1)";
  if (p.ribWidth < 0) return "the rib's thickness is 0 (auto) or more";
  if (p.bossShape === 1 && p.ribWidth > 0 && (p.ribWidth < 0.5 || p.ribWidth > 2 * g.shell.boss)) return `the rib is 0.5 to ${(2 * g.shell.boss).toFixed(1)} mm thick`;
  if (p.pinFlat !== 0 && p.pinFlat !== 1 && p.pinFlat !== 2) return "the pin's flats are 0 (none), 1 (flat) or 2 (flat with a ramp)";
  if (p.flatRamp < 0 || p.flatRamp > 80) return "the ramp's angle is 0 (auto) to 80 degrees";
  if (g.arch.on && !g.arch.fits && g.arch.h > g.sk - g.shell.boss - 0.3 + 1e-9) return `the arch reaches the pin bosses: ${Math.max(0, g.sk - g.shell.boss - 0.3).toFixed(1)} mm high or less`;
  if (g.arch.on && !g.arch.fits && g.arch.h < 2) return "the arch is 2 mm high or more";
  if (g.flat.on && !g.flat.fits) {
    if (g.flat.xa - g.flat.x0 < 2) return "the flat has no room between the bosses' feet and the ring belt: a shorter belt, a longer pin height or no flat";
    if (g.flat.z < g.zoff + 3) return "the flat is too deep: it must leave 3 mm of boss beyond the gap between the bosses";
    if (g.flat.yf < p.pin / 2 + 1) return "the flat is narrower than the pin bore: a wider flat";
  }
  const cr = g.cr, flatR = g.rt - cr.edge;
  if (cr.edge > g.shell.crown / 2 || cr.edge > g.rt / 4) return `the crown's edge chamfer is ${Math.min(g.shell.crown / 2, g.rt / 4).toFixed(2)} mm or less`;
  if (cr.shape !== 0) {
    if (cr.radius > flatR - 0.5) return `the crown shape is ${(2 * (flatR - 0.5)).toFixed(1)} mm across or less (it must leave a flat band at the edge)`;
    if (cr.shape === 1 && cr.height > 0.3 * p.bore) return `a dome is ${(0.3 * p.bore).toFixed(1)} mm high or less (0.3 of the bore)`;
    if (cr.shape !== 1 && cr.height > g.shell.crown - 1.5) return `a ${cr.shape === 2 ? "dish" : "bowl"} is ${Math.max(0, g.shell.crown - 1.5).toFixed(1)} mm deep or less: it must leave 1.5 mm of crown (a thicker crown allows a deeper one)`;
  }
  if (cr.reliefs.n > 0) {
    if (cr.shape !== 0) return "valve reliefs go in a flat crown (not a dome, dish or bowl)";
    if (cr.reliefs.depth > g.shell.crown - 1.5) return `a valve relief is ${Math.max(0, g.shell.crown - 1.5).toFixed(1)} mm deep or less: it must leave 1.5 mm of crown`;
    if (cr.reliefs.off + cr.reliefs.r > flatR - 0.5) return "the valve reliefs are too far out or too big for the crown: they must stay inside its flat";
    if (cr.reliefs.n === 2 && cr.reliefs.off < cr.reliefs.r + 0.25) return "the two valve reliefs overlap: a smaller diameter or a greater distance from the axis";
  }
  const c = g.clip;
  if (c) {
    const yw = Math.min(g.shell.boss, 0.95 * Math.sqrt(Math.max(0, g.rp * g.rp - g.shell.inner * g.shell.inner)));
    if (p.clipEdge > 0 && p.clipEdge < 0.5) return "the circlip groove is 0.5 mm or more from the face (0: auto)";
    if (c.z < g.zoff + 1) return "the circlip grooves leave no room for the pin between the bosses: a bigger bore, a narrower groove or a smaller gap between the bosses";
    if (c.z < g.shell.inner && c.bore + c.depth + 0.2 > (g.round.on ? g.shell.boss : yw)) return "the circlip groove is deeper than the pin boss is wide: a shallower groove or a longer boss reach";
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
  const cr = g.cr, ec = cr.edge, pts: [number, number][] = [[xf, 0], [xf, g.rp - c0], [xf + c0, g.rp], [xs, g.rt], [xc - ec, g.rt], [xc, g.rt - ec]], bul: number[] = [0, 0, 0, 0, 0, 0];
  // the crown (`dec_piston_crown`): a flat top, or a dome, a dish or a bowl within a flat band at the edge
  if (cr.shape === 0) { pts.push([xc, 0]); }
  else if (cr.shape === 3) { pts.push([xc, cr.radius], [xc - cr.height, 0.75 * cr.radius], [xc - cr.height, 0]); bul.push(0, 0); }
  else {
    const R = (cr.radius * cr.radius + cr.height * cr.height) / (2 * cr.height), up = cr.shape === 1, cx = up ? xc + cr.height - R : xc - cr.height + R, phi = Math.atan2(cr.radius, up ? R - cr.height : cr.height - R), mid = up ? phi / 2 : (phi + Math.PI) / 2;
    const F: [number, number] = [xc, cr.radius], G: [number, number] = [up ? xc + cr.height : xc - cr.height, 0];
    pts.push(F, G); bul.push(bulgeOf(F, [cx + R * Math.cos(mid), R * Math.sin(mid)], G), 0);
  }
  b.turn(b.frame([0, 0, zc], [1, 0, 0], [0, 1, 0]), pts, bul.length < pts.length ? [...bul, ...Array(pts.length - bul.length).fill(0)] : bul, [0, 0, zc], [1, 0, 0]);
  // the valve reliefs: round pockets in a flat crown, along the pin's axis
  if (cr.reliefs.n > 0) for (const zz of cr.reliefs.n === 1 ? [cr.reliefs.off] : [cr.reliefs.off, -cr.reliefs.off]) b.extrude(up(xc - cr.reliefs.depth), disc(0, zz, cr.reliefs.r), [], cr.reliefs.depth + 0.5, { mode: "cut" });
  // the oval: a lens (two arcs) as the skirt's section, narrower along the pin, cut from the foot to the belt
  if (g.oval > 0) {
    const w = g.rp + 0.05, bz = g.rp - g.oval / 2, A: [number, number] = [-w, 0], B: [number, number] = [w, 0];
    b.extrude(up(xf), disc(0, 0, g.rp + 1), [outline([A, B], [bulgeOf(A, [0, bz], B), bulgeOf(B, [0, -bz], A)])], xs - xf + 0.3, { mode: "cut" }); // (0.3 mm past the skirt's top, into the lowest groove or the land: its top face must not lie in the groove's bottom face)
  }
  // the arched cutaway (`dec_piston_shape`): the skirt cut away at the two sides of the pin in an arch, leaving the ears (pads) on the thrust sides that reach further down: a plane cut along the pin's axis, an arch in (x, y): straight sides and a semicircular top when it is tall, a circular segment when it is low
  if (g.arch.on) {
    const w = g.arch.w, xe = xf + g.arch.h, tall = g.arch.h >= w, bx = tall ? xe - w : xf, A: [number, number] = [xf - 1, -w], B: [number, number] = [bx, -w], C: [number, number] = [bx, w], D: [number, number] = [xf - 1, w];
    const apex: [number, number] = [xe, 0], R = (w * w + g.arch.h * g.arch.h) / (2 * g.arch.h);
    void R;
    b.extrude(b.plane(zc - g.rp - 1), outline([A, B, C, D], [0, bulgeOf(B, apex, C), 0, 0]), [], 2 * g.rp + 2, { mode: "cut" });
  }
  // the flats round the pin: a plane cut at each side, the skirt's face ending on a flat at the pin's bore
  if (g.flat.on) {
    const fl = g.flat, depthCut = g.rp + 1 - fl.z;
    if (fl.xa < fl.x1 - 1e-6) {
      // a flat with a ramp: its section (x along the piston, z along the pin) drawn on an upright plane and cut across the thrust, the ramp running on past the face
      const e = 0.3, xe = fl.x1 + e, ze = fl.z + fl.tan * (xe - fl.xa), top = g.rp + 1;
      for (const sg of [1, -1]) {
        const pts: [number, number][] = [[xp0 + fl.x0, fl.z], [xp0 + fl.xa, fl.z], [xp0 + xe, ze], [xp0 + xe, top], [xp0 + fl.x0, top]];
        b.extrude(b.frame([0, sg * fl.yf, zc], [1, 0, 0], [0, 0, sg]), outline(sg > 0 ? pts : pts.map(([x, z]) => [x, z] as [number, number]).reverse()), [], 2 * fl.yf, { mode: "cut" });
      }
    } else {
      b.extrude(b.plane(zc + fl.z), box(xp0 + fl.x0, -fl.yf, xp0 + fl.x1, fl.yf), [], depthCut, { mode: "cut" });
      b.extrude(b.plane(zc - fl.z - depthCut), box(xp0 + fl.x0, -fl.yf, xp0 + fl.x1, fl.yf), [], depthCut, { mode: "cut" });
    }
  }
  for (const gr of g.belt.grooves) b.extrude(up(xp0 + g.ch - gr.top - gr.height), disc(0, 0, g.rp + 1), [disc(0, 0, g.rp - g.belt.depth)], gr.height, { mode: "cut" });
  // the lands are cut smaller than the skirt (`dec_piston_lands_clips`)
  for (const l of g.lands) if (l.bottom - l.top > 1e-6) b.extrude(up(xp0 + g.ch - l.bottom), disc(0, 0, g.rp + 1), [disc(0, 0, l.radius)], l.bottom - l.top, { mode: "cut" });
  // the cavity, open at the foot: wide up to the bottom of the ring belt, narrower under it, up to the crown's underside; then the two pin bosses either side of the rod, and the pin's hole through them and the walls
  const sh = g.shell, top = xp0 + g.ch - sh.crown, wideTop = xp0 + g.ch - Math.max(g.belt.length, sh.crown), zoff = g.zoff;
  b.extrude(up(xp0 - g.sk), disc(0, 0, sh.inner), [], wideTop - (xp0 - g.sk), { mode: "cut" });
  b.extrude(up(xp0 - g.sk), disc(0, 0, sh.innerBelt), [], top - (xp0 - g.sk), { mode: "cut" });
  const root = g.rp - g.belt.depth, reach = (outer: number, inside: number): number => Math.min(sh.boss, 0.95 * Math.sqrt(Math.max(0, outer * outer - inside * inside))), foot = xp0 - sh.boss;
  if (g.round.on) {
    // round bosses (`dec_piston_interior`): a boss round the pin's axis at each side of the rod, from the gap to the cavity's wall, each braced to the crown's underside by a rib (a plate across the thrust, thin, in the pin's axis and the piston's)
    const rt2 = g.round.rib / 2, depth = sh.inner - zoff;
    b.extrude(b.plane(zc + zoff), disc(xp0, 0, sh.boss), [], depth, { mode: "add" });
    b.extrude(b.plane(zc - sh.inner), disc(xp0, 0, sh.boss), [], depth, { mode: "add" });
    b.extrude(b.plane(zc + zoff), box(xp0, -rt2, wideTop, rt2), [], depth, { mode: "add" });
    b.extrude(b.plane(zc - sh.inner), box(xp0, -rt2, wideTop, rt2), [], depth, { mode: "add" });
    if (top > wideTop + 1e-6) {
      b.extrude(b.plane(zc + zoff), box(wideTop, -rt2, top, rt2), [], sh.innerBelt - zoff, { mode: "add" });
      b.extrude(b.plane(zc - sh.innerBelt), box(wideTop, -rt2, top, rt2), [], sh.innerBelt - zoff, { mode: "add" });
    }
  } else {
    // block pads: each as wide as the metal behind it allows: below the ring belt up to the piston's outside, and in the belt's zone up to the grooves' floors (a pad must not stand in a groove)
    const yw = reach(g.rp, sh.inner), yn = reach(root, sh.innerBelt);
    b.extrude(up(foot), box(-yw, zoff, yw, sh.inner), [], wideTop - foot, { mode: "add" });
    b.extrude(up(foot), box(-yw, -sh.inner, yw, -zoff), [], wideTop - foot, { mode: "add" });
    if (top > wideTop + 1e-6) {
      b.extrude(up(wideTop), box(-yn, zoff, yn, sh.innerBelt), [], top - wideTop, { mode: "add" });
      b.extrude(up(wideTop), box(-yn, -sh.innerBelt, yn, -zoff), [], top - wideTop, { mode: "add" });
    }
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
export const pistonExtent = (p: PistonSpec): { diameter: number; height: number } => { const g = pistonGeometry(p); return { diameter: 2 * g.rp, height: g.sk + g.ch + g.cr.top }; };

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
  // the crown: the edge chamfer, and a dome (added), a dish (taken), a bowl (taken) or the valve reliefs (taken)
  const cr = g.cr;
  v -= Math.PI * (g.rt - cr.edge / 3) * cr.edge * cr.edge;
  if (cr.shape === 1) v += (Math.PI * cr.height * (3 * cr.radius * cr.radius + cr.height * cr.height)) / 6;
  if (cr.shape === 2) v -= (Math.PI * cr.height * (3 * cr.radius * cr.radius + cr.height * cr.height)) / 6;
  if (cr.shape === 3) v -= frustum(cr.height, cr.radius, 0.75 * cr.radius);
  if (cr.reliefs.n > 0) v -= cr.reliefs.n * Math.PI * cr.reliefs.r * cr.reliefs.r * cr.reliefs.depth;
  for (const gr of bt.grooves) v -= Math.PI * (g.rt * g.rt - (rp - bt.depth) ** 2) * gr.height;
  for (const l of g.lands) v -= Math.PI * (g.rt * g.rt - l.radius ** 2) * (l.bottom - l.top);
  v -= Math.PI * sh.inner ** 2 * wideL + Math.PI * sh.innerBelt ** 2 * (topL - wideL);
  const reach = (outer: number, inside: number): number => Math.min(sh.boss, 0.95 * Math.sqrt(Math.max(0, outer * outer - inside * inside))), footB = g.sk - sh.boss;
  const yw = reach(rp, sh.inner), yn = reach(rp - bt.depth, sh.innerBelt);
  const area = (R: number, yb: number): number => simpson((y) => Math.max(0, Math.sqrt(Math.max(0, R * R - y * y)) - zoff), -yb, yb);
  if (g.round.on) { // the round bosses and their ribs (inside the cavity): per side, over the height, the part of the boss's disc and the rib's strip that lies inside the cavity's radius
    const Rb = sh.boss, hr = g.round.rib / 2, xpin = g.sk;
    const slab = (x0: number, x1: number, R: number): number => (x1 <= x0 ? 0 : simpson((x) => { const hd = Math.abs(x - xpin) <= Rb ? Math.sqrt(Math.max(0, Rb * Rb - (x - xpin) ** 2)) : 0, hw = Math.max(hd, x >= xpin ? hr : 0); return simpson((z) => 2 * Math.min(hw, Math.sqrt(Math.max(0, R * R - z * z))), zoff, R, 100); }, x0, x1, 160));
    v += 2 * (slab(xpin - Rb, wideL, sh.inner) + slab(wideL, topL, sh.innerBelt));
  } else v += 2 * (area(sh.inner, yw) * (wideL - footB) + area(sh.innerBelt, yn) * Math.max(0, topL - wideL));
  v -= 2 * simpson((y) => 2 * Math.sqrt(Math.max(0, rho * rho - y * y)) * Math.max(0, Math.sqrt(Math.max(0, sh.inner * sh.inner - y * y)) - zoff), -rho, rho);
  // the pin's hole through the two walls: from the cavity out to the skirt's outer face at the pin (the circle of the skirt's radius there, or the lens, whichever is nearer)
  v -= 2 * simpson((y) => 2 * Math.sqrt(Math.max(0, rho * rho - y * y)) * (g.faceZ(y) - Math.sqrt(Math.max(0, sh.inner * sh.inner - y * y))), -rho, rho); // (the bore runs out to the round face: the flat's own cut leaves the bore's part out)
  if (g.clip) v -= 2 * Math.PI * ((g.clip.bore + g.clip.depth) ** 2 - g.clip.bore ** 2) * g.clip.width;
  // the arched cutaway: the skirt's wall (from the cavity's radius out to the skirt's face) over the arch's area, on the two sides of the pin
  if (g.arch.on) {
    const w = g.arch.w, hA = g.arch.h, tall = hA >= w, bx = tall ? hA - w : 0, Rg = (w * w + hA * hA) / (2 * hA), cxA = hA - Rg; // (heights above the foot)
    const half = (x: number): number => (tall ? (x <= bx ? w : Math.sqrt(Math.max(0, w * w - (x - bx) ** 2))) : Math.min(w, Math.sqrt(Math.max(0, Rg * Rg - (x - cxA) ** 2))));
    v -= 2 * simpson((x) => { const ya = half(x), r = g.radiusAt(x - g.sk); return simpson((y) => Math.max(0, g.faceAt(x - g.sk, y) - Math.sqrt(Math.max(0, sh.inner * sh.inner - y * y))), -ya, ya, 120); }, 0, hA, 80);
  }
  // the flats: what is beyond the flat's plane, where it is solid (outside the cavity and the pin's bore), over the flat's area
  if (g.flat.on) {
    const fl = g.flat;
    v -= 2 * simpson((xa) => simpson((y) => { const xr = xa; const face = g.faceAt(xr, y), cav = Math.sqrt(Math.max(0, sh.inner * sh.inner - y * y)); return xr * xr + y * y <= rho * rho ? 0 : Math.max(0, face - Math.max(fl.z + (xr > fl.xa ? fl.tan * (xr - fl.xa) : 0), cav)); }, -fl.yf, fl.yf, 160), fl.x0, fl.xa < fl.x1 - 1e-6 ? fl.x1 + 0.3 : fl.x1, 120);
  }
  const pin = Math.PI * ((p.pin / 2) ** 2 - (g.pinBore / 2) ** 2) * 2 * g.pinHalf;
  return { cup: v, pin, clips: g.clip ? 2 * Math.PI * (g.clip.outer ** 2 - g.clip.inner ** 2) * g.clip.thick : 0 };
}
/** The weight (grams) of the piston, the pin and the circlips: the piston in its material, the pin and the circlips in steel */
export function pistonWeight(p: PistonSpec, g: PistonGeometry = pistonGeometry(p)): { piston: number; pin: number; clips: number; total: number } {
  const v = pistonVolumes(p, g), piston = (v.cup * g.density) / 1000, pin = (v.pin * STEEL) / 1000, clips = (v.clips * STEEL) / 1000;
  return { piston, pin, clips, total: piston + pin + clips };
}

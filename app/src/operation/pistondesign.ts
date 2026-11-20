// The piston's fit numbers that come from a real engine's service data (`dec_engine_presets`, tier 1 of `dec_piston_parameters`): the Honda GX120, GX160 and GX200 service manual (bores 60 and 68 mm). Every number here is Honda's, or the middle of Honda's
// range, or (outside Honda's bores) a clamp the parameter list names; nothing is an assumed proportion. Lengths in mm. Pure: a bore in, numbers out. The test (`test/pistonhonda.test.ts`) holds Honda's table and checks these against it.

/** Honda's ring heights are the same at a 60 and a 68 mm bore, so they do not follow the bore: 1.5 mm (compression) and 2.5 mm (oil). A smaller bore takes the proportion (0.025 and 0.042 of it) down to the floors 1.0 and 2.0 mm (the smallest rings a maker offers, `dec_piston_parameters`); a larger one stays at Honda's. */
const compressionRingHeight = (bore: number): number => Math.min(1.5, Math.max(1.0, 0.025 * bore));
const oilRingHeight = (bore: number): number => Math.min(2.5, Math.max(2.0, 0.042 * bore));

export interface PistonFit {
  /** the height of a compression ring and of the oil ring (mm) */ compressionRing: number; oilRing: number;
  /** the room above and below a ring in its groove (mm): the middle of Honda's 0.015 to 0.045 */ ringSide: number;
  /** a ring's end gap in the bore (mm): the middle of Honda's 0.2 to 0.4 (compression) and 0.15 to 0.35 (oil) */ endGapCompression: number; endGapOil: number;
  /** the piston's diameter less than the bore's (mm), measured 10 mm above the foot of the skirt and at 90 degrees to the pin: the middle of Honda's 0.015 to 0.050 */ skirtClearance: number;
  /** the pin's room in its bore in the piston (mm): the middle of Honda's 0.002 to 0.014 (a floating pin held by circlips) */ pinFit: number;
}
export function pistonFit(bore: number): PistonFit {
  return { compressionRing: compressionRingHeight(bore), oilRing: oilRingHeight(bore), ringSide: 0.03, endGapCompression: 0.3, endGapOil: 0.25, skirtClearance: 0.03, pinFit: 0.008 };
}
/** The piston pin the builder takes when none is given: 0.265 of the bore (Honda's 18 mm in 68 mm), to the nearest half millimetre. A GX120's 13 mm in 60 mm (0.217) is a smaller pin that a preset names. */
export const defaultPin = (bore: number): number => Math.round(0.265 * bore * 2) / 2;

export interface Groove {
  /** from the crown to the groove's upper edge (mm) */ top: number;
  /** the groove's height: a ring's height and its side room (mm) */ height: number;
  /** the oil ring's groove */ oil: boolean;
}
export interface RingBelt {
  /** the grooves from the crown down: the compression grooves, then the oil ring's */ grooves: Groove[];
  /** every groove's depth (mm) */ depth: number;
  /** from the crown to the lower edge of the last groove (the top land when there is none) (mm) */ length: number;
}
/**
 * The ring belt, from the crown down (`dec_piston_belt`). **ASSUMED**, the rules A1 to A3 of `dec_piston_parameters`, except the ring heights and the side room, which are Honda's:
 * the land between rings is 1.6 times a compression ring's height (A1); the top land is the typed `topLand` times the bore (A2); the grooves' depth is a ring's radial width, the bore over 22 (the thicker series of ISO 6622-1), plus a back room of 0.45 mm (A3).
 */
export function ringBelt(bore: number, rings: number, oil: number, topLand: number, ringSide: number, typed: { ring?: number; oilRing?: number; land?: number; radial?: number; back?: number } = {}): RingBelt {
  const fit = pistonFit(bore), ringH = typed.ring ?? fit.compressionRing, oilH = typed.oilRing ?? fit.oilRing, land = typed.land ?? 1.6 * fit.compressionRing, grooves: Groove[] = [];
  let at = topLand * bore;
  const add = (ring: number, isOil: boolean): void => { const height = ring + ringSide; grooves.push({ top: at, height, oil: isOil }); at += height + land; };
  for (let k = 0; k < rings; k++) add(ringH, false);
  if (oil) add(oilH, true);
  const last = grooves[grooves.length - 1];
  return { grooves, depth: (typed.radial ?? bore / 22) + (typed.back ?? 0.45), length: last ? last.top + last.height : topLand * bore };
}

export interface Shell {
  /** the crown's thickness and the wall's (skirt, and the metal under the grooves' floors) (mm) */ crown: number; wall: number;
  /** the radius of the cavity below the ring belt, and under it (mm) */ inner: number; innerBelt: number;
  /** how far the pin bosses reach from the pin's axis, down and sideways (mm) */ boss: number;
}
/**
 * The hollow piston's numbers (`dec_piston_hollow`). **ASSUMED**, nothing here is a source's: the crown is the typed proportion of the bore (A6), the wall the typed proportion (half the crown, the human's choice, `in_1246`), the cavity's radius the piston's less the wall,
 * and under the ring grooves less their depth as well; the pin bosses reach a wall's thickness beyond the pin's hole (A12).
 */
export function pistonShell(bore: number, radius: number, depth: number, crown: number, skirtWall: number, pin: number, pinFit: number, bossReach?: number): Shell {
  const wall = skirtWall * bore;
  return { crown: crown * bore, wall, inner: radius - wall, innerBelt: radius - depth - wall, boss: pin / 2 + pinFit / 2 + (bossReach ?? wall) };
}

export interface RodDesign {
  /** the web left between the two pockets of the I-beam, and the flanges' width (mm) */ web: number; flange: number;
  /** the cap bolts' diameter, how far each lug runs either side of the split, and how far the lug's bolt sits from the rod's middle line (mm) */ bolt: number; lug: number; boltY: number;
}
/** The connecting rod's shape numbers (`dec_rod_design`). **ASSUMED**: no source gives them. The web is 0.3 of the rod's thickness, the flanges 0.3 of the small end's half width (at least 0.8 mm), the bolts 0.09 of the bore (at least 2 mm), the lugs 1.5 bolts long. */
export function rodDesign(bore: number, thickness: number, bigRadius: number, smallHalf: number): RodDesign {
  const bolt = Math.max(2, 0.09 * bore);
  return { web: 0.3 * thickness, flange: Math.max(0.8, 0.3 * smallHalf), bolt, lug: 1.5 * bolt, boltY: bigRadius + bolt / 2 + 0.3 };
}

/** The crank pin's diameter (mm): 0.44 of the bore, from Honda's service manual (29.98 mm in a 68 mm bore, 25.98 mm in a 60 mm bore: 0.441 and 0.433), to a tenth of a millimetre (`dec_crankshaft_design`). */
export const crankPinFor = (bore: number): number => Math.round(0.44 * bore * 10) / 10;

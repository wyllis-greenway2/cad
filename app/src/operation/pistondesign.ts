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

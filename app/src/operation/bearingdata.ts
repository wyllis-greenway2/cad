// Deep groove ball bearings (`dec_bearing_library`, `in_1146`): the boundary dimensions of the common single-row series and, where a catalogue gives them, the balls. Every dimension is written down only where two sources the project has READ agree
// (docs/sources/README.md, "Ball bearings"); a bearing listed by one source only is not here. Pure: tables, and what is worked out from them.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";

/** one bearing: bore `d`, outside diameter `D`, width `B` (mm, ISO 15 boundary dimensions as printed); `balls` and `ball` (the diameter, mm) as NSK prints them for the 60 and 62 series, else none */
export interface BearingRow { number: number; d: number; D: number; B: number; balls?: number; ball?: number }
/** the miniature series (3 to 9 mm bore): dimensions in the igus table and on MISUMI's pages; no catalogue read gives their balls */
const MINI: [number, number, number, number][] = [[623, 3, 10, 4], [624, 4, 13, 5], [625, 5, 16, 5], [626, 6, 19, 6], [627, 7, 22, 7], [607, 7, 19, 6], [608, 8, 22, 7], [609, 9, 24, 7]];
/** the 60 and 62 series: dimensions in NSK's pages and the igus table, balls as NSK prints them (count, diameter in mm) */
const SERIES: [number, number, number, number, number, number][] = [
  [6000, 10, 26, 8, 7, 4.762], [6001, 12, 28, 8, 8, 4.762], [6002, 15, 32, 9, 9, 4.762], [6003, 17, 35, 10, 10, 4.762], [6004, 20, 42, 12, 9, 6.35], [6005, 25, 47, 12, 10, 6.35], [6006, 30, 55, 13, 11, 7.144],
  [6200, 10, 30, 9, 8, 4.762], [6201, 12, 32, 10, 7, 5.953], [6202, 15, 35, 11, 8, 5.953], [6203, 17, 40, 12, 8, 6.747], [6204, 20, 47, 14, 8, 7.938], [6205, 25, 52, 15, 9, 7.938], [6206, 30, 62, 16, 9, 9.525],
];
export const BEARINGS: readonly BearingRow[] = [
  ...MINI.map(([number, d, D, B]): BearingRow => ({ number, d, D, B })),
  ...SERIES.map(([number, d, D, B, balls, ball]): BearingRow => ({ number, d, D, B, balls, ball })),
];
export const bearingRow = (number: number): BearingRow | undefined => BEARINGS.find((b) => b.number === number);
const bearingNumbers = (): string => BEARINGS.map((b) => b.number).join(", ");

/** The balls of a bearing: the catalogue's where it gives them, else a typical set worked out from the dimensions: a ball of 0.285 of the ring's depth (D - d) and as many as fill 0.62 of the ring of balls. Checked against NSK's numbers for the 60 and 62 series it gives the same count for 11 of the 14 (two more or less for the rest) and the diameter to within 8 % for 13 (6200: 20 % too big): a typical set, said to be one wherever it is used. */
export function ballsOf(b: BearingRow): { balls: number; ball: number; typical: boolean } {
  if (b.balls !== undefined && b.ball !== undefined) return { balls: b.balls, ball: b.ball, typical: false };
  const ball = Math.round(0.285 * (b.D - b.d) * 100) / 100, pitch = (b.d + b.D) / 2;
  return { balls: Math.floor((0.62 * Math.PI * pitch) / ball), ball, typical: true };
}
/** The shapes of the rings and balls in a catalogue bearing: the ball circle, the groove (radius 0.52 of the ball's diameter, the usual), how far each ring's surface stands from the ball circle, and the room left round each ball (mm; not from a catalogue: a bearing's internal clearance is a few hundredths of a millimetre, and the balls are made bodies of their own, so they must not touch) */
export function bearingShape(b: BearingRow, clearance: number, override?: { balls?: number; ball?: number; ring?: number }): Result<{ pitch: number; dw: number; balls: number; rg: number; surface: number; half: number; typical: boolean }> {
  const set = ballsOf(b), dw = override?.ball ?? set.ball, balls = override?.balls ?? set.balls;
  if (!(dw > 0) || !(balls >= 3) || !Number.isInteger(balls)) return err("a bearing needs 3 or more balls of a size");
  if (!(clearance >= 0 && clearance <= 0.3 * dw)) return err("the room round a ball is from 0 to 0.3 of its diameter");
  let pitch = (b.d + b.D) / 4, surface = 0.22 * dw;
  const rg = 0.52 * dw + clearance;
  if (override?.ring) { // (the inner ring's outside diameter set: the outer ring's wall is the same as the inner's, and the balls stand between)
    const [ri, ro] = [override.ring / 2, b.D / 2 - (override.ring - b.d) / 2];
    if (!(ri > b.d / 2 && ro > ri)) return err("the inner ring's outside diameter must be more than the bore and under the outside diameter less the same wall");
    pitch = (ri + ro) / 2; surface = (ro - ri) / 2;
    if (surface > 0.9 * rg) return err(`the rings are ${(2 * surface).toFixed(2)} mm apart, more than the balls fill: bigger balls or a bigger inner ring`);
  }
  const half = Math.sqrt(Math.max(0, rg * rg - surface * surface));
  if (pitch - rg - b.d / 2 < 0.4 || b.D / 2 - pitch - rg < 0.4) return err(`the balls are too big for ${b.number}'s rings: ${(pitch - rg - b.d / 2).toFixed(2)} mm under the groove of the inner ring, ${(b.D / 2 - pitch - rg).toFixed(2)} outside the outer`);
  if (b.B / 2 - half < 0.3) return err(`the groove is too wide for ${b.number}'s width`);
  if (balls * dw * 1.02 > 2 * Math.PI * pitch) return err(`${balls} balls of ${dw} mm do not fit round ${b.number}`);
  return ok({ pitch, dw, balls, rg, surface, half, typical: set.typical && override?.balls === undefined && override?.ball === undefined });
}

/** The shape of a bearing from its numbers (a model's): a catalogue bearing by its number, or (number 0) a bearing of the bore, outside diameter and width given and, if given, the inner ring's outside diameter; `detail` 0 makes two rings only, 1 the grooves and the balls too */
export interface BearingFromNums { bore: number; outer: number; width: number; balls: number; pitch: number; rb: number; rg: number; surface: number; half: number; typical: boolean; detail: boolean; number: number }
export function bearingFromNums(n: Record<string, number>): BearingFromNums | string {
  const num = Math.round(n.number!);
  let row: BearingRow | undefined;
  if (num === 0) {
    if (![n.bore, n.outer, n.width].every((v) => Number.isFinite(v) && v! > 0)) return "a bearing of your own needs a bore, an outside diameter and a width (the number is 0)";
    if (n.outer! <= n.bore!) return "the outside diameter must be more than the bore";
    row = { number: 0, d: n.bore!, D: n.outer!, B: n.width! };
  } else row = bearingRow(num);
  if (!row) return `${n.number} is not a bearing in the list: ${bearingNumbers()} (or 0 for one of your own)`;
  const sh = bearingShape(row, n.clearance!, { ...(n.balls ? { balls: Math.round(n.balls) } : {}), ...(n.ball ? { ball: n.ball } : {}), ...(num === 0 && n.ring ? { ring: n.ring } : {}) });
  return sh.ok ? { bore: row.d, outer: row.D, width: row.B, balls: sh.value.balls, pitch: sh.value.pitch, rb: sh.value.dw / 2, rg: sh.value.rg, surface: sh.value.surface, half: sh.value.half, typical: sh.value.typical, detail: !!n.detail, number: num } : sh.error;
}

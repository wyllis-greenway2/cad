// Straight-sided splines of ISO 14 (`dec_keyway_maker`, `in_1267`, `in_1270`): the table of the standard's light and medium series and the outline of the profile, common to the shaft and the hub (internal centering: the
// minor diameter d centres them). The table is ISO 14:1978 (one page) and ISO 14:1982 table 1, which agree in every row, and agrees with the norelem catalogue (medium 11 to 46) and a web copy of the table (`docs/sources/README.md`).
// Pure maths in the spline's own x and y, the axis on the origin, the first spline on the +x side.
import { bulgeOf, arcMid } from "./arcs.ts";
import type { P } from "./arcs.ts";

export type SplineSeries = "light" | "medium";
/** one row of the standard's table: the number of splines N, the minor diameter d, the outside diameter D and the width of a spline B (all mm) */
export interface SplineRow { series: SplineSeries; n: number; d: number; D: number; B: number }

// d, then the light series (N, D, B) if it has one, then the medium series (N, D, B)
const TABLE: [number, [number, number, number] | null, [number, number, number]][] = [
  [11, null, [6, 14, 3]], [13, null, [6, 16, 3.5]], [16, null, [6, 20, 4]], [18, null, [6, 22, 5]],
  [21, null, [6, 25, 5]], [23, [6, 26, 6], [6, 28, 6]], [26, [6, 30, 6], [6, 32, 6]], [28, [6, 32, 7], [6, 34, 7]],
  [32, [8, 36, 6], [8, 38, 6]], [36, [8, 40, 7], [8, 42, 7]], [42, [8, 46, 8], [8, 48, 8]], [46, [8, 50, 9], [8, 54, 9]],
  [52, [8, 58, 10], [8, 60, 10]], [56, [8, 62, 10], [8, 65, 10]], [62, [8, 68, 12], [8, 72, 12]],
  [72, [10, 78, 12], [10, 82, 12]], [82, [10, 88, 12], [10, 92, 12]], [92, [10, 98, 14], [10, 102, 14]],
  [102, [10, 108, 16], [10, 112, 16]], [112, [10, 120, 18], [10, 125, 18]],
];
/** every row of the standard: 20 sizes d, 15 of them in the light series and all 20 in the medium (35 rows) */
export const ISO14: readonly SplineRow[] = TABLE.flatMap(([d, light, medium]): SplineRow[] => [...(light ? [{ series: "light" as const, n: light[0], d, D: light[1], B: light[2] }] : []), { series: "medium" as const, n: medium[0], d, D: medium[1], B: medium[2] }]);
/** the designation of the standard: the number of splines, the minor and the outside diameter, N x d x D (6 x 23 x 26) */
export const splineName = (r: { n: number; d: number; D: number }): string => `${r.n} x ${r.d} x ${r.D}`;
/** the row of the standard with this designation and series, or null */
export const iso14 = (name: string, series?: SplineSeries): SplineRow | null => ISO14.find((r) => splineName(r) === name.replace(/\s*[x×]\s*/gi, " x ").trim() && (!series || r.series === series)) ?? null;

/** Why these numbers make no straight-sided spline, or null */
export function splineProblem(s: { n: number; d: number; D: number; B: number }): string | null {
  if (!(Number.isInteger(s.n) && s.n >= 3 && s.n <= 60)) return "a spline has 3 to 60 teeth";
  if (!(s.d > 0 && s.D > s.d)) return "the outside diameter must be more than the minor diameter";
  if (!(s.B > 0)) return "the width of a spline must be above 0";
  if (s.B >= s.d * Math.sin(Math.PI / s.n)) return "the splines are too wide for the minor circle: they would run into each other";
  return null;
}

/**
 * The outline of the profile: the minor circle with N lugs of width B (parallel flanks) out to the outside circle, counter-clockwise: the corners and, for the side from each to the next, its bulge (as `Line`). Each spline has four
 * sides: the flank out (straight), the arc of the outside circle across its tip, the flank back in (straight) and the arc of the minor circle to the next spline. A shaft is this outline extruded, a hub is it cut out: the nominal
 * dimensions are common to both, as the standard says (the fits' tolerances are not applied).
 */
export function splineOutline(s: { n: number; d: number; D: number; B: number }): { points: P[]; bulges: number[] } | null {
  if (splineProblem(s)) return null;
  const [rd, rD, b] = [s.d / 2, s.D / 2, s.B / 2];
  const [xd, xD] = [Math.sqrt(rd * rd - b * b), Math.sqrt(rD * rD - b * b)];
  const points: P[] = [], bulges: number[] = [];
  const at = (k: number, p: P): P => { const a = (2 * Math.PI * k) / s.n, [c, sn] = [Math.cos(a), Math.sin(a)]; return [p[0] * c - p[1] * sn, p[0] * sn + p[1] * c]; };
  const O: P = [0, 0];
  for (let k = 0; k < s.n; k++) {
    const [p1, p2, p3, p4, next] = [at(k, [xd, -b]), at(k, [xD, -b]), at(k, [xD, b]), at(k, [xd, b]), at(k + 1, [xd, -b])];
    points.push(p1, p2, p3, p4);
    bulges.push(0, bulgeOf(p2, arcMid(O, rD, p2, p3), p3), 0, bulgeOf(p4, arcMid(O, rd, p4, next), next));
  }
  return { points, bulges };
}

/** the row of a series whose minor diameter is nearest `d` (the smaller on a tie); with `atLeast`, the nearest that is not smaller than `d` (the least spline a bore of `d` can have), else the biggest */
export function nearestSpline(series: SplineSeries, d: number, atLeast = false): SplineRow {
  const rows = ISO14.filter((r) => r.series === series);
  if (atLeast) return rows.find((r) => r.d >= d - 1e-9) ?? rows[rows.length - 1]!;
  return rows.reduce((best, r) => (Math.abs(r.d - d) < Math.abs(best.d - d) - 1e-9 ? r : best), rows[0]!);
}

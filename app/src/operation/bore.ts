// The shapes of a gear's bore (`dec_gear_tool`, `in_589`): round (the default), with a D flat, or with a keyway. Pure maths in the gear's own x and y, the middle of the bore on the origin, the flat and the keyway on the +x side
// (the gear's turn takes them where it goes). The hole is a closed loop of an arc and straight sides (a round bore is a circle: `gearscene.ts` draws that one).
//
// A keyway is described the way a hub's is in DIN 6885 / ISO 773: a width b across the slot and the depth t2, measured so that the top of the slot is d + t2 from the far side of the bore, which is t2 beyond the bore's own
// surface. The standard's widths and depths by bore diameter (over 6 to 8: 2 x 1.0; to 10: 3 x 1.4; to 12: 4 x 1.8; to 17: 5 x 2.3; to 22: 6 x 2.8; to 30: 8 x 3.3; to 38: 10 x 3.3, mm; read from the tables the search results
// of the sources give: fasten.it, baouch, engineersedge, engineeringhardware agree) give the depth when it is not typed. A D flat is a flat cut `flat` mm deep into the round bore (the flat is r - flat from the middle).
import type { GearSpec } from "./gear.ts";

type P = [number, number];
/** the bores a keyway has a standard for: over `over` mm up to `upto`, the key's width b and the hub's depth t2 (DIN 6885 / ISO 773) */
export const KEYS: { over: number; upto: number; b: number; t2: number }[] = [
  { over: 6, upto: 8, b: 2, t2: 1.0 }, { over: 8, upto: 10, b: 3, t2: 1.4 }, { over: 10, upto: 12, b: 4, t2: 1.8 }, { over: 12, upto: 17, b: 5, t2: 2.3 },
  { over: 17, upto: 22, b: 6, t2: 2.8 }, { over: 22, upto: 30, b: 8, t2: 3.3 }, { over: 30, upto: 38, b: 10, t2: 3.3 },
];
/** the standard key for a bore of this diameter, if there is one */
export const standardKey = (bore: number): { b: number; t2: number } | null => KEYS.find((k) => bore > k.over && bore <= k.upto) ?? null;
/** the depth t2 of the keyway: as typed, else the standard's for the bore, else none */
export const keyDepthOf = (spec: GearSpec): number | null => spec.keyDepth || (spec.bore ? standardKey(spec.bore)?.t2 ?? fallbackDepth(spec.key ?? 0) : null);
/** the depth of a keyway for a bore the standard has no key for, from the key's width: the standard's depths are 0.33 to 0.5 of the width (2 x 1.0, 3 x 1.4, 5 x 2.3, 8 x 3.3, 10 x 3.3), 0.45 is taken, and the person adjusts it (`in_1263`) */
const fallbackDepth = (key: number): number | null => (key > 0 ? Math.max(0.1, Math.round(0.45 * key * 10) / 10) : null);

/** Why the bore of this shape cannot be in a gear whose root circle has this radius, or null. */
export function boreProblem(spec: GearSpec, root: number): string | null {
  const [bore, flat, key] = [spec.bore ?? 0, spec.flat ?? 0, spec.key ?? 0];
  if (!flat && !key && spec.keyDepth === undefined) return null;
  if (!(bore > 0)) return "a flat or a keyway needs a bore: give the bore's diameter";
  if (flat && key) return "a bore has a flat or a keyway, not both";
  const r = bore / 2;
  if (flat) {
    if (!(flat > 0 && flat < 1.8 * r)) return `the flat is cut from 0 to ${(1.8 * r).toFixed(2)} mm deep into this bore`;
    return null;
  }
  if (!(key > 0)) return "the keyway's depth needs its width: give the key's width";
  if (key >= bore * 0.9) return "the key is as wide as the bore";
  const t2 = keyDepthOf(spec);
  if (t2 === null) return "type the keyway's depth: this bore has none in the standard (over 6 to 38 mm has)";
  if (!(t2 > 0)) return "the keyway's depth must be above zero";
  if (r + t2 >= root * 0.95) return "the keyway would reach the gear's root: a smaller key, a thinner depth or a bigger gear";
  return null;
}

/** The loop of a bore with a flat or a keyway: its corners and, for each side to the next, how far its middle stands out (the bulge of `Line`); null for a round bore. */
export function boreLoop(spec: GearSpec): { points: P[]; bulges: number[] } | null {
  const [bore, flat, key] = [spec.bore ?? 0, spec.flat ?? 0, spec.key ?? 0];
  if (!(bore > 0) || (!flat && !key)) return null;
  const r = bore / 2;
  const bulgeOf = (a: P, m: P, b: P): number => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(dx, dy);
    const off = ((m[0] - (a[0] + b[0]) / 2) * -dy + (m[1] - (a[1] + b[1]) / 2) * dx) / len;
    return Math.abs(off) < 1e-12 ? 0 : off / len;
  };
  if (flat) { // the circle from one end of the flat the long way round to the other, then the flat
    const x0 = r - flat, s = Math.sqrt(Math.max(0, r * r - x0 * x0));
    const [A, B]: [P, P] = [[x0, s], [x0, -s]];
    return { points: [A, B], bulges: [bulgeOf(A, [-r, 0], B), 0] };
  }
  const x0 = Math.sqrt(r * r - (key / 2) ** 2), top = r + (keyDepthOf(spec) ?? 0);
  const [a, b, c, d]: [P, P, P, P] = [[x0, key / 2], [x0, -key / 2], [top, -key / 2], [top, key / 2]];
  return { points: [a, b, c, d], bulges: [bulgeOf(a, [-r, 0], b), 0, 0, 0] };
}

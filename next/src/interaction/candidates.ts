// What is under the pointer, as ONE ordered list (`in_1742`; the old app's `picking.ts`): corners and points of a drawing first, then edges and lines, circles and arcs of a drawing, then surfaces (a figure of a drawing, a face of a body), each class nearest
// first. Everything that can be picked is a candidate of this list, whatever it is a part of, and what is not there to be picked (behind a body's surface, hidden) is left out when the candidates are made. Hover is the first candidate and a click on
// the same place goes down the list. This module only orders; the page makes the candidates (bodies: `pick.ts`, drawings: `sketchcontrol.ts`) and dispatches what is chosen. Pure.

export type Rank = 0 | 1 | 2; // 0: a corner or a point, 1: an edge or a line, circle or arc, 2: a surface (a figure, a face)
export interface Ranked<T> {
  rank: Rank;
  /** how far (px) the pointer is from it (a surface: 0) */
  px: number;
  /** how far along the view it is (mm), what tells which surface is nearer */
  depth: number;
  /** a figure of a drawing: of two surfaces at the same depth it comes first (a drawing lies on the face it is drawn on) */
  figure?: boolean;
  item: T;
}
/** the same depth: to a hundredth of a mm and a ten thousandth of the distance */
const flush = (a: number, b: number): boolean => Math.abs(a - b) <= 0.01 + 1e-4 * Math.max(Math.abs(a), Math.abs(b));
/** the candidates in the order they are tried: by class; points and lines nearest the pointer first; surfaces nearest the eye first, a figure before the face it lies on */
export function orderCandidates<T>(list: readonly Ranked<T>[]): Ranked<T>[] {
  return [...list].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank < 2) return a.px - b.px || a.depth - b.depth;
    if (flush(a.depth, b.depth)) return Number(!!b.figure) - Number(!!a.figure);
    return a.depth - b.depth;
  });
}
/** which candidate a click takes: the first; a click again on the same place (`again`) the next after the one taken, round to the first (`MD-3`) */
export function chooseCandidate(count: number, taken: number | null, again: boolean): number {
  if (count < 1) return 0;
  return again && taken !== null ? (taken + 1) % count : 0;
}

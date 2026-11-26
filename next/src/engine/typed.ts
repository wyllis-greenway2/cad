// The place of a figure being drawn when numbers are typed (`dec_dimensions_measure_then_lock`, slice b; no kernel): the figure's free place is the one nearest the pointer that has those measures, found by Newton on the relation table's own residuals
// (the same ones the solver and the helpers read): a typed width alone keeps the pointer's height, a typed length goes along the pointer's direction, a typed diameter is a circle about the centre through the pointer's direction, and a width and a height together are the corner.
import type { Relation, System } from "./solver.ts";
import { figureOf, land, type Free, type Pt } from "./free.ts";

/** a measure with the number typed for it: the relation, the parts it names (the free ones by name), and the value (a signed distance keeps its sign) */
export interface TypedMeasure { kind: Relation; parts: string[]; value: number }

/** where the figure's free place goes: the pointer's place, moved to where every typed measure holds (null: there is no such place) */
export function placeTyped(S0: System, f: Free, pointer: Pt, typed: readonly TypedMeasure[]): Pt | null {
  if (!typed.length) return pointer;
  const fig = figureOf(S0, f), rows = typed.map((t) => fig.rows({ kind: t.kind, parts: t.parts, value: t.value }));
  return land((at) => rows.flatMap((r) => r(at)), pointer, Infinity, 20);
}
/** what a relation over the figure's parts measures at a place (a signed distance across or up is signed; a length or a radius is not) */
export function measureAt(S0: System, f: Free, at: Pt, kind: Relation, parts: string[]): number {
  return figureOf(S0, f).rows({ kind, parts, value: 0 })(at)[0] ?? 0;
}

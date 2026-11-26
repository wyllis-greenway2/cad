// What a relation can be said over, and where it stands in a sketch: the two questions the helper bar's suggestions (`interaction/suggest.ts`) and the helpers of drawing (`engine/helpers.ts`) both ask,
// answered here once (`dec_helpers_one_rule`: a helper is a relation that is applicable and within reach; nothing else about relations is decided in two places). Pure.
import { RELATIONS, residualsOf, tryAdd, type Constraint, type Relation, type System } from "./solver.ts";

export type PartKind = "point" | "line" | "circle";
/** whether a relation can be said over exactly these kinds of parts, in this order (level and upright take a line, or two points) */
export function fits(name: Relation, kinds: readonly string[]): boolean {
  if (name === "horizontal" || name === "vertical")
    return kinds.length === 1
      ? kinds[0] === "line"
      : kinds.length === 2 && kinds[0] === "point" && kinds[1] === "point";
  const def = RELATIONS[name];
  return (
    kinds.length === def.parts.length && def.parts.every((allowed, i) => (allowed as string[]).includes(kinds[i]!))
  );
}
/** every list of kinds a relation can be said over (the shapes to look for it in) */
export function kindTuples(name: Relation): PartKind[][] {
  if (name === "horizontal" || name === "vertical") return [["line"], ["point", "point"]];
  return RELATIONS[name].parts
    .reduce<PartKind[][]>(
      (acc, allowed) => (acc.length ? acc.flatMap((a) => allowed.map((k) => [...a, k])) : allowed.map((k) => [k])),
      [],
    )
    .filter((t) => fits(name, t));
}

export type Standing = "free" | "holds" | "already" | "refused";
/** where a constraint stands in a system: it already follows from what is there (`already`), the solver would refuse it (`refused`), it holds as the parts are but is not said (`holds`), or it would be new (`free`) */
export function standingOf(
  S: System,
  c: Constraint,
): { state: Standing; by: string[]; victims: string[]; holding: string[] } {
  const t = tryAdd(S, c);
  if (t.outcome === "already") return { state: "already", by: t.by, victims: t.victims, holding: t.holding };
  if (t.outcome === "refused") return { state: "refused", by: t.by, victims: t.victims, holding: t.holding };
  return {
    state: residualsOf(S, c).every((v) => Math.abs(v) < 1e-7) ? "holds" : "free",
    by: t.by,
    victims: t.victims,
    holding: t.holding,
  };
}
/** Whether a relation in this standing is worth offering, to the helpers of drawing and to the helper bar alike: it would add something (new, or true as drawn and not yet said), and the solver would accept it. Already said and refused are never offered. */
export const offerable = (s: Standing): boolean => s === "free" || s === "holds";

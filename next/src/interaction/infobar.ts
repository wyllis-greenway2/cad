// What a selection can be offered (`dec_three_surfaces`, `dec_marks_on_things`; this was the info bar's, now the marks' too: `marks.ts`) and the info bar's descriptions for operations and body picks: formerly the one place the page says what is so of what is selected (the left: its constraints and its numbers) and what could be added to it (the right: only what would be new and
// accepted, `offerable`). A click moves an item across: a suggestion clicked is applied and stands on the left, a fact clicked is taken away and, if still offerable, is on the right again. Pure: the solver's system and the selection in, descriptions out; `infobardraw.ts` draws them.
import type { Relation, System } from "../engine/solver.ts";
import { offerable } from "../engine/relations.ts";
import { offersFor } from "./suggest.ts";
import { RANGEABLE, RELATIONS, kindOf, residualsOf, type Constraint } from "../engine/solver.ts";
import { kindTuples, snapEstimate, standingOf } from "../engine/relations.ts";
import { iconOf, type Bubble } from "./bubbles.ts";

/** `free`: would be added; `holds`: already true as drawn (adding it makes it a rule) */
export type BarTone = "free" | "holds";
export interface BarItem {
  id: string;
  icon: string;
  label: string;
  tone: BarTone;
}
/** the buttons of the bar, in order (none: no bar) */
export type Bar = BarItem[];

/** what is true already first, then the rest */
const ORDER: Record<string, number> = { holds: 0, free: 1 };
/** The relations offered for a selection: those that fit exactly what is selected, and that the solver would add as something new (`offerable`: not already said, not refused; a number is on its bubble, not here). */
export function barFor(S: System, selection: string[]): Bar {
  if (!selection.length) return [];
  return offersFor(S, selection)
    .offers.filter((o) => offerable(o.state) && !o.dimensional)
    .sort((a, b) => ORDER[a.state]! - ORDER[b.state]!)
    .map((o) => ({ id: `rel:${o.kind}`, icon: iconOf(o.kind as Relation), label: o.label, tone: o.state as BarTone }));
}

/** a fact: a constraint that touches the subject, or a number (live with an open padlock, locked with a closed one) */
export type Fact = Bubble;
/** what the info bar says of its subject */
export interface Info {
  facts: Fact[];
  suggestions: BarItem[];
}
/** every way to put `k` parts, in order, into `n` slots */
function placements(n: number, k: number): number[][] {
  return k === 0
    ? [[]]
    : placements(n, k - 1).flatMap((p) => [...Array(n).keys()].filter((i) => !p.includes(i)).map((i) => [...p, i]));
}
export const NEAR_MAX = 2; // (the old app offered up to two "near" suggestions)

/** Relations between the selection and one other part that hold now, or (with `reachMm`) are within that many mm of holding, and would be new (`offerable`): a line that is level with one a long way off, a line tangent to a circle, a point on a line that was not made to be. Up to `max`; none for more than two parts selected. */
export function nearFor(S: System, selection: string[], max = NEAR_MAX, reachMm?: number): BarItem[] {
  if (!selection.length || selection.length > 2) return [];
  const pool: Record<string, string[]> = {
      point: S.points.map((p) => p.id),
      line: S.lines.map((l) => l.id),
      circle: S.circles.map((c) => c.id),
    },
    kinds = selection.map((id) => kindOf(id, S)),
    found: { other: string; item: BarItem }[] = [],
    seen = new Set<string>();
  for (const [name, def] of Object.entries(RELATIONS) as [Relation, (typeof RELATIONS)[Relation]][]) {
    if (!def.helper || RANGEABLE.has(name)) continue;
    for (const tuple of kindTuples(name)) {
      if (tuple.length !== selection.length + 1) continue;
      for (const pos of placements(tuple.length, selection.length)) {
        if (pos.some((slot, i) => tuple[slot] !== kinds[i])) continue;
        const spare = [...tuple.keys()].find((i) => !pos.includes(i))!;
        for (const other of pool[tuple[spare]!] ?? []) {
          if (selection.includes(other)) continue;
          const parts = new Array<string>(tuple.length);
          pos.forEach((slot, i) => {
            parts[slot] = selection[i]!;
          });
          parts[spare] = other;
          for (const variant of def.helper.variants ?? [undefined]) {
            const c: Constraint = { id: "near", kind: name, parts, ...(variant ?? {}) },
              key = `${name}|${[...parts].sort().join()}|${JSON.stringify(variant ?? {})}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const rows = residualsOf(S, c);
            if (
              !rows.length ||
              !rows.every(Number.isFinite) ||
              !(rows.every((v) => Math.abs(v) < 1e-7) || (reachMm !== undefined && snapEstimate(S, c) <= reachMm))
            )
              continue; // (it holds, or it is in range: `reachMm`, the helpers' reach: how it got there does not matter)
            const st = standingOf(S, c);
            if (!offerable(st.state)) continue;
            found.push({
              other,
              item: {
                id: `near:${name}:${parts.join(",")}${variant?.internal ? ":in" : ""}`,
                icon: iconOf(name),
                label: `${RELATIONS[name].label} with ${other}`,
                tone: st.state as BarTone,
              },
            });
            if (found.length >= 24) break; // (more than enough to choose from)
          }
        }
      }
    }
  }
  // the first of each other part before a second of any (so a line that is parallel to one and tangent to another says both)
  const out: BarItem[] = [],
    byOther = new Map<string, BarItem[]>();
  for (const f of found) byOther.set(f.other, [...(byOther.get(f.other) ?? []), f.item]);
  for (let round = 0; out.length < max; round++) {
    let any = false;
    for (const list of byOther.values())
      if (list[round] && out.length < max) {
        out.push(list[round]!);
        any = true;
      }
    if (!any) break;
  }
  return out;
}
/** a near suggestion as the constraint it makes (its id says the relation and the parts) */
export function nearConstraint(id: string): { kind: Relation; parts: string[]; internal: boolean } | null {
  const m = /^near:([A-Za-z]+):([^:]+)(:in)?$/.exec(id);
  return m ? { kind: m[1] as Relation, parts: m[2]!.split(","), internal: !!m[3] } : null;
}

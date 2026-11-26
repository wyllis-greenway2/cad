// What a selection can be offered, and the info bar's descriptions (`dec_three_surfaces`, `dec_marks_on_things`): `barFor` the relations that fit a selection and would be accepted, `nearFor` the relations with one other part that hold or are in range
// (`reach`); the marks (`marks.ts`) use both. The info bar itself (`infobardraw.ts`) is now only for an operation's number and the kinds of what is picked on a body. Pure.
import { adjusting, candidatesFor, displacements, inRange, type Arrow } from "../engine/probe.ts";
import { offerable } from "../engine/relations.ts";
import type { Relation, System } from "../engine/solver.ts";
import { RANGEABLE, RELATIONS } from "../engine/solver.ts";
import { iconOf, type Bubble } from "./bubbles.ts";
import { offersFor } from "./suggest.ts";

/** `free`: would be added; `holds`: already true as drawn (adding it makes it a rule) */
export type BarTone = "free" | "holds";
export interface BarItem {
  /** what taking it would move, and by how much (mm, in the sketch's axes): the points that would go (a relation that holds already moves nothing) */
  moves?: Arrow[];
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
export const NEAR_MAX = 2; // (the old app offered up to two "near" suggestions)

/** Relations between the selection and one other part that hold now, or (with `reach`) are within reach of holding, and would be new (`offerable`): a line that is level with one a long way off, a line tangent to a circle, a point on a line that was not made to be, a line a little off parallel. The parts at rest are a motion (each point free to move a little, a circle's radius too) and this is `inRange` over it, the same question the helpers ask of a part being drawn or dragged (`engine/probe.ts`): how it got there does not matter. Up to `max`, one for each other part before a second of any; none for more than two parts selected. */
export function nearFor(
  S: System,
  selection: string[],
  max = NEAR_MAX,
  reach?: { pointMm: number; lineMm: number },
): BarItem[] {
  if (!selection.length || selection.length > 2) return [];
  const points = new Set<string>(),
    radii: string[] = [];
  for (const id of selection) {
    const l = S.lines.find((x) => x.id === id),
      k = S.circles.find((x) => x.id === id);
    if (l) [l.a, l.b].forEach((x) => points.add(x));
    else if (k) {
      points.add(k.c);
      (k.ends ?? []).forEach((x) => points.add(x));
      radii.push(k.id);
    } else points.add(id);
  }
  const motion = adjusting(S, [...points], radii),
    cands = candidatesFor(S, motion.affected, selection, selection.length + 1).filter(
      (c) => !RANGEABLE.has(c.relation),
    ),
    exact = { pointMm: 1e-7, lineMm: 1e-7 };
  const found = inRange(S, motion, new Array(motion.dim).fill(0), cands, reach ?? exact)
    .slice(0, 24)
    .map((r) => {
      const other = r.cand.parts.find((x) => !selection.includes(x))!,
        parts = r.cand.parts,
        moves = displacements(S, motion.at(r.q), other);
      return {
        other,
        item: {
          id: `near:${r.cand.relation}:${parts.join(",")}${r.cand.variant?.internal ? ":in" : ""}`,
          icon: iconOf(r.cand.relation),
          label: `${RELATIONS[r.cand.relation].label} with ${other}`,
          tone: (r.moved < 1e-7 ? "holds" : "free") as BarTone,
          ...(moves.length ? { moves } : {}),
        },
      };
    });
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

// The helper bar (`q_lean_ui`, `in_1562`, `in_1597`): what pops up beside what was clicked: the relations that fit exactly what is selected and that would be added (level, parallel, tangent, ...), and nothing else. A selection is taken away by a click on nothing, Esc or Delete.
// It is the one place a suggestion appears. Pure: the solver's system and the selection in, descriptions out; `helperbardraw.ts` draws them, the controller does what a press says.
import type { Relation, System } from "../engine/solver.ts";
import { offerable } from "../engine/relations.ts";
import { offersFor } from "./suggest.ts";
import { iconOf } from "./bubbles.ts";

/** `free`: would be added; `holds`: already true as drawn (adding it makes it a rule) */
export type BarTone = "free" | "holds";
export interface BarItem { id: string; icon: string; label: string; tone: BarTone }
/** the buttons of the bar, in order (none: no bar) */
export type Bar = BarItem[];

/** what is true already first, then the rest */
const ORDER: Record<string, number> = { holds: 0, free: 1 };
/** The relations offered for a selection: those that fit exactly what is selected, and that the solver would add as something new (`offerable`: not already said, not refused; a number is on its bubble, not here). */
export function barFor(S: System, selection: string[]): Bar {
  if (!selection.length) return [];
  return offersFor(S, selection).offers.filter((o) => offerable(o.state) && !o.dimensional).sort((a, b) => ORDER[a.state]! - ORDER[b.state]!)
    .map((o) => ({ id: `rel:${o.kind}`, icon: iconOf(o.kind as Relation), label: o.label, tone: o.state as BarTone }));
}

// The helper bar (`q_lean_ui`, `in_1562`): what pops up beside what was clicked. On the right, the relations that fit exactly what is selected (a number to put on it, level, parallel, tangent, ...); on the left, what can be done with the selection
// itself (take it away, put the selection away). It is the one place a suggestion appears. Pure: the solver's system and the selection in, descriptions out; `helperbardraw.ts` draws them, the controller does what a press says.
import type { Relation, System } from "../engine/solver.ts";
import { offersFor } from "./suggest.ts";
import { iconOf } from "./bubbles.ts";

/** `free`: would be added; `holds`: already true as drawn (adding it makes it a rule); `refused`: cannot hold with what is there (pressing it flashes what holds it back) */
export type BarTone = "free" | "holds" | "refused" | "plain";
export interface BarItem { id: string; icon: string; label: string; tone: BarTone; /** the words under the label: what holds a refused one back */ note?: string }
export interface Bar { left: BarItem[]; right: BarItem[] }

/** the dimensions first (a number is the commonest thing to want), then what is true already, then the rest, the refused last */
const ORDER: Record<string, number> = { free: 1, holds: 0, refused: 2 };
export function barFor(S: System, selection: string[]): Bar {
  if (!selection.length) return { left: [], right: [] };
  const { offers } = offersFor(S, selection);
  const right: BarItem[] = offers.filter((o) => o.state !== "already").sort((a, b) => Number(b.dimensional) - Number(a.dimensional) || ORDER[a.state]! - ORDER[b.state]!).map((o) => ({
    id: `rel:${o.kind}`, icon: iconOf(o.kind as Relation), label: o.dimensional && o.measure !== null ? `${o.label} (${Math.round(o.measure * 1000) / 1000}${o.kind === "angle" ? "°" : ""})` : o.label,
    tone: o.state === "refused" ? "refused" : o.state === "holds" ? "holds" : "free", ...(o.state === "refused" && o.holding.length ? { note: `cannot hold with ${o.holding.join(", ")}` } : {}),
  }));
  const left: BarItem[] = [{ id: "delete", icon: "trash", label: "Delete", tone: "plain" }]; // (a click on nothing puts the selection away, as in the old app)
  return { left, right };
}

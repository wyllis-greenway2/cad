// How a helper is shown, and how it becomes a constraint to offer (`dec_helpers_one_rule`,. Pure: what `engine/helpers.ts` found in, lines and constraints out.
//   Sources are lit orange: a point as a ball, a line, circle or arc drawn over. Guides are dashed. Nothing else is drawn for a helper.
import type { Helped, Pt } from "../engine/helpers.ts";

export interface Shown {
  kind: "guide" | "tie" | "tieBall";
  pts: Pt[];
}
/** the lines of a placed helper: the guides of everything that holds, and every source lit (once) */
export function helpShown(h: Helped, shape: (part: string) => Pt[] | null, at: (point: string) => Pt | null): Shown[] {
  const out: Shown[] = [],
    lit = new Set<string>();
  for (const x of [...h.acted, ...h.holds.filter((y) => !h.acted.includes(y))]) {
    const g = h.guide(x);
    if (g && g.length > 1) out.push({ kind: "guide", pts: g });
    for (const s of x.sources) {
      if (lit.has(s)) continue;
      lit.add(s);
      const p = at(s);
      if (p) {
        out.push({ kind: "tieBall", pts: [p] });
        continue;
      }
      const line = shape(s);
      if (line) out.push({ kind: "tie", pts: line });
    }
  }
  return out;
}

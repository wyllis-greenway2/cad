// How a helper is shown, and how it becomes a constraint to offer (`dec_helpers_one_rule`, `dec_helper_constraint_bubble`). Pure: what `engine/helpers.ts` found in, lines and constraints out.
//   Sources are lit orange: a point as a ball, a line, circle or arc drawn over. Guides are dashed. Nothing else is drawn for a helper.
import { P, S, L, C, type Helped, type Held, type Pt } from "../engine/helpers.ts";
import { tryAdd, type Constraint, type System } from "../engine/solver.ts";

export interface Shown { kind: "guide" | "tie" | "tieBall"; pts: Pt[] }
/** the lines of a placed helper: the guides of everything that holds, and every source lit (once) */
export function helpShown(h: Helped, shape: (part: string) => Pt[] | null, at: (point: string) => Pt | null): Shown[] {
  const out: Shown[] = [], lit = new Set<string>();
  for (const x of [...h.acted, ...h.holds.filter((y) => !h.acted.includes(y))]) {
    const g = h.guide(x); if (g && g.length > 1) out.push({ kind: "guide", pts: g });
    for (const s of x.sources) {
      if (lit.has(s)) continue; lit.add(s);
      const p = at(s); if (p) { out.push({ kind: "tieBall", pts: [p] }); continue; }
      const line = shape(s); if (line) out.push({ kind: "tie", pts: line });
    }
  }
  return out;
}

/** the real names of the free parts of a figure once it is made: where each was put (`P`, `S`) and the line and circle between them */
export type Made = Partial<Record<typeof P | typeof S | typeof L | typeof C, string>>;
/** the constraints a placed figure could be given, from the helpers that held at its place: each with its free parts named for real, kept if the sketch still solves and it is not already said */
export function offersFrom(sys: System, h: Helped, made: Made, max = 4): Constraint[] {
  const out: Constraint[] = [], seen = new Set<string>(), all: Held[] = [...h.acted, ...h.holds.filter((y) => !h.acted.includes(y))];
  for (const x of all) {
    const parts = x.parts.map((p) => (p.startsWith("~") ? made[p as keyof Made] : p));
    if (parts.some((p) => !p) || new Set(parts).size !== parts.length) continue;
    const key = `${x.relation}|${[...parts as string[]].sort().join()}|${JSON.stringify(x.variant ?? {})}`; if (seen.has(key)) continue; seen.add(key);
    const c: Constraint = { id: `offer.${out.length}`, kind: x.relation, parts: parts as string[], ...(x.variant ?? {}) };
    if (tryAdd(sys, c).outcome === "added") out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

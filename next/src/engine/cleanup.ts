// The automatic cleanup of slivers (E33, `in_1487`, `in_1488`): when a step's result is valid but has a face thinner than the smallest feature (E27), the step's own number is moved to the nearest value
// that leaves none, **only if the move is under the smallest feature**, and the move is an ordinary change in the document's history marked automatic, so undoing it is the history's own undo (nothing is changed
// without a trace, E15). A number the person has undone is not moved again. The engine is only asked: each candidate is tried on a copy (`trial`), and a candidate that fails or makes something else worse is not applied.
import { MIN_FEATURE } from "./clean.ts";
import { type Doc, type History, editStep } from "./document.ts";
import { type Engine } from "./engine.ts";
import { trial } from "./failure.ts";
import { kinds } from "./steps.ts";

export interface Proposal {
  step: string;
  key: string;
  from: number;
  to: number;
  /** how thin the sliver was */ width: number;
  /** the face's name, in words */ sliver: string;
  change: { op: "edit"; step: string; params: Record<string, unknown> };
  text: string;
}
/** the move of a step's main number that would leave no sliver, if there is one smaller than the smallest feature; null when the step is clean, has no one number, or nothing of that size works */
export function propose(engine: Engine, step: string, min: number = MIN_FEATURE): Proposal | null {
  const st = engine.step(step),
    r = engine.result(step);
  if (r.status.kind !== "ok") return null;
  const slivers = r.notes.filter((n) => n.kind === "sliver");
  if (!slivers.length) return null;
  const key = kinds[st.kind]?.main;
  if (!key) return null;
  const v = engine.result(step) && (st.params[key] as unknown);
  if (typeof v !== "number") return null; // an expression is the person's: the number it comes to is not moved from here
  const width = Math.min(...slivers.map((n) => Number(/ ([0-9.]+) mm thick/.exec(n.text)?.[1] ?? min)));
  const deltas = [
    ...new Set([width, min / 4, min / 2, (3 * min) / 4, min * 0.99].map((d) => Math.round(d * 1e9) / 1e9)),
  ]
    .filter((d) => d > 0 && d < min)
    .sort((a, b) => a - b);
  for (const d of deltas)
    for (const sign of [1, -1]) {
      const to = v + sign * d,
        change = { op: "edit" as const, step, params: { ...st.params, [key]: to } },
        t = trial(engine, change);
      if (t.kind === "ok" && !t.notes.some((n) => /sliver/.test(n)))
        return {
          step,
          key,
          from: v,
          to,
          width,
          sliver: slivers[0]!.text,
          change,
          text: `cleaned a ${width.toFixed(4)} mm sliver: ${key} of ${step} ${v} → ${to} (undo to keep the sliver)`,
        };
    }
  return null;
}
/**
 * Clean what can be cleaned, one step at a time, until nothing more can: each move is a change in `history` (marked automatic) and the engine is told the new document. Returns what was done, in order.
 * A move the person undid (`history.declined`) is not made again.
 */
export function autoClean(engine: Engine, history: History, min: number = MIN_FEATURE, limit = 8): Proposal[] {
  const done: Proposal[] = [];
  for (let n = 0; n < limit; n++) {
    let next: Proposal | null = null;
    for (const id of engine.ids()) {
      const p = propose(engine, id, min);
      if (p && !history.declined(`${p.step}.${p.key}`)) {
        next = p;
        break;
      }
    }
    if (!next) break;
    const doc: Doc = editStep(history.doc, next.step, next.change.params);
    history.do(doc, next.text, { auto: `${next.step}.${next.key}` });
    engine.setRecipe(doc.steps as never, undefined, doc.parameters);
    done.push(next);
  }
  return done;
}

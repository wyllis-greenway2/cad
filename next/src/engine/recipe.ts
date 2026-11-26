// Edits to the shape of the recipe (E19): put a step in, take one out, move one, swap one with the step it works on. Each is a pure function from a list of steps to a list of steps;
// the engine takes the new list and works out what changed (`Engine.setRecipe`), so there is one rule for every kind of edit.
import { type Step, kinds } from "./steps.ts";

/** an input that points at nothing: what a dependent is left with when the step it worked on is taken out and there is nothing to put in its place */
export const MISSING = "∅";

/** the steps are in a valid order: ids are unique and every input is an earlier step (or MISSING) */
export function validateRecipe(steps: readonly Step[]): void {
  const at = new Map<string, number>();
  steps.forEach((s, i) => {
    if (at.has(s.id)) throw new Error(`two steps are called ${s.id}`);
    at.set(s.id, i);
  });
  steps.forEach((s, i) => {
    for (const inp of s.inputs)
      if (inp !== MISSING && !((at.get(inp) ?? Infinity) < i))
        throw new Error(`step ${s.id} works on ${inp}, which is not an earlier step`);
  });
}

const outputsOf = (steps: readonly Step[], id: string): "body" | "sketch" | null => {
  const s = steps.find((x) => x.id === id);
  return s ? (kinds[s.kind]?.outputs ?? null) : null;
};
const firstOfType = (steps: readonly Step[], s: Step, type: "body" | "sketch"): string | null =>
  s.inputs.find((i) => i !== MISSING && outputsOf(steps, i) === type) ?? null;

/**
 * Put `step` in after `after` (the end when not given). With `splice`, the steps that worked on the body `step` works on now work on `step`: it is put into the chain, not beside it.
 * Without, it is a branch (a second thing made from the same body).
 */
export function insertStep(
  steps: readonly Step[],
  step: Step,
  opts: { after?: string; splice?: boolean } = {},
): Step[] {
  const at = opts.after === undefined ? steps.length - 1 : steps.findIndex((s) => s.id === opts.after);
  if (opts.after !== undefined && at < 0) throw new Error(`no step ${opts.after}`);
  let out = [...steps.slice(0, at + 1), step, ...steps.slice(at + 1)];
  if (opts.splice) {
    const body = firstOfType(steps, step, "body");
    if (body)
      out = out.map((s) =>
        s.id === step.id
          ? s
          : {
              ...s,
              inputs: s.inputs.map((i) => (i === body && out.findIndex((x) => x.id === s.id) > at + 1 ? step.id : i)),
            },
      );
  }
  validateRecipe(out);
  return out;
}

/** Take a step out. The steps that worked on it work on what it worked on (of the same kind of thing), or on nothing when it worked on nothing like it; their references into what it made are then lost. */
export function removeStep(steps: readonly Step[], id: string): Step[] {
  const gone = steps.find((s) => s.id === id);
  if (!gone) throw new Error(`no step ${id}`);
  const type = kinds[gone.kind]?.outputs ?? "body",
    instead = firstOfType(steps, gone, type) ?? MISSING;
  const out = steps
    .filter((s) => s.id !== id)
    .map((s) => (s.inputs.includes(id) ? { ...s, inputs: s.inputs.map((i) => (i === id ? instead : i)) } : s));
  validateRecipe(out);
  return out;
}

/** Put a step after another (or first, when `after` is null); refused when that puts it before something it works on or after something that works on it. */
export function moveStep(steps: readonly Step[], id: string, after: string | null): Step[] {
  const s = steps.find((x) => x.id === id);
  if (!s) throw new Error(`no step ${id}`);
  const rest = steps.filter((x) => x.id !== id),
    at = after === null ? -1 : rest.findIndex((x) => x.id === after);
  if (after !== null && at < 0) throw new Error(`no step ${after}`);
  const out = [...rest.slice(0, at + 1), s, ...rest.slice(at + 1)];
  validateRecipe(out);
  return out;
}

/**
 * Do this step before the one it works on: the two change places in the chain. `id` then works on what its input worked on, its input works on `id`, and what worked on `id` works on its input.
 * This is the rescue for a step that fails after another (a shell after a hole): the same two steps in the other order.
 */
export function swapWithInput(steps: readonly Step[], id: string): Step[] {
  const s = steps.find((x) => x.id === id);
  if (!s) throw new Error(`no step ${id}`);
  const pid = firstOfType(steps, s, "body"),
    p = steps.find((x) => x.id === pid);
  if (!pid || !p) throw new Error(`${id} does not work on a body`);
  const qid = firstOfType(steps, p, "body");
  if (!qid) throw new Error(`${pid} does not work on a body, so ${id} cannot go before it`);
  const out = steps.map((x) => {
    if (x.id === id) return { ...x, inputs: x.inputs.map((i) => (i === pid ? qid : i)) };
    if (x.id === pid) return { ...x, inputs: x.inputs.map((i) => (i === qid ? id : i)) };
    return x.inputs.includes(id) ? { ...x, inputs: x.inputs.map((i) => (i === id ? pid : i)) } : x;
  });
  // `id` now goes where `pid` was, and `pid` right after it
  const pi = out.findIndex((x) => x.id === pid),
    si = out.findIndex((x) => x.id === id),
    moved = [...out];
  moved.splice(si, 1);
  moved.splice(pi, 0, out[si]!);
  validateRecipe(moved);
  return moved;
}

// Named parameters in the scene (`dec_named_parameters`): the commands that make, change and take away a parameter, and tie a number of a step to a formula.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene, Step } from "./scene.ts";
import { evaluate, evaluateAll, nameOk, usesOf } from "./parameters.ts";

/** The values of the scene's parameters. */
export const valuesOf = (s: Scene): Record<string, number> => evaluateAll(s.parameters ?? {}).values;

/** A step with the given keys no longer tied to a formula (the number it has stays). */
export function unlinked(st: Step, keys: readonly string[]): Step {
  if (!st.links || !keys.some((k) => k in st.links!)) return st;
  const links = Object.fromEntries(Object.entries(st.links).filter(([k]) => !keys.includes(k)));
  const { links: _old, ...rest } = st;
  return Object.keys(links).length ? { ...rest, links } : rest;
}

/** Every tied number of every step made again from the parameters. A formula that cannot be made leaves the number as it was. */
function refresh(s: Scene): Scene {
  const values = valuesOf(s);
  let changed = false;
  const steps = s.steps.map((st) => {
    if (!st.links) return st;
    const params = { ...st.params };
    for (const [k, f] of Object.entries(st.links)) { const v = evaluate(f, values); if (typeof v === "number") params[k] = v; }
    changed = true;
    return { ...st, params };
  });
  return changed ? { ...s, steps } : s;
}
const withParameters = (s: Scene, parameters: Record<string, string>): Scene => {
  const { parameters: _old, ...rest } = s;
  return Object.keys(parameters).length ? { ...rest, parameters } : rest;
};

export function setParameter(s: Scene, name: string, expr: string): Result<Scene> {
  if (!nameOk(name)) return err(`"${name}" cannot be a parameter's name: use a word of letters, digits and _ that does not start with a digit, and is not a function or pi`);
  const next = { ...(s.parameters ?? {}), [name]: expr.trim().replace(/^=/, "") };
  const { errors } = evaluateAll(next);
  const bad = Object.entries(errors)[0];
  if (bad) return err(`${bad[0]}: ${bad[1]}`);
  return ok(refresh(withParameters(s, next)));
}

export function removeParameter(s: Scene, name: string): Result<Scene> {
  if (!(name in (s.parameters ?? {}))) return err(`parameter ${name} does not exist`);
  const by = Object.entries(s.parameters!).find(([n, f]) => n !== name && usesOf(f).includes(name));
  if (by) return err(`${by[0]} uses ${name}`);
  const step = s.steps.find((st) => Object.values(st.links ?? {}).some((f) => usesOf(f).includes(name)));
  if (step) return err(`step ${step.id} uses ${name}`);
  const { [name]: _gone, ...rest } = s.parameters!;
  return ok(withParameters(s, rest));
}

export function linkParam(s: Scene, id: string, key: string, expr: string | null): Result<Scene> {
  const st = s.steps.find((x) => x.id === id);
  if (!st) return err(`step ${id} does not exist`);
  if (expr === null) return ok({ ...s, steps: s.steps.map((x) => (x.id === id ? unlinked(x, [key]) : x)) });
  if (typeof st.params[key] !== "number") return err(`step ${id} has no number ${key}`);
  const text = expr.trim().replace(/^=/, "");
  const v = evaluate(text, valuesOf(s));
  if (typeof v === "string") return err(v);
  return ok({ ...s, steps: s.steps.map((x) => (x.id === id ? { ...x, params: { ...x.params, [key]: v }, links: { ...(x.links ?? {}), [key]: text } } : x)) });
}

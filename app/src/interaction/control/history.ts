// The History panel's own actions (`dec_history_navigation`, `in_489`, `in_498`): go to a step, open the numbers of a step, change one of them.
import { scene as sceneOf, run, goToCursor, clearSelection } from "../session.ts";
import type { AppState } from "./state.ts";
import { withSession } from "./state.ts";

/** The cursor of the history after a step was made: the first point at which the step is in the scene. -1 when there is no such step. */
export function cursorOfStep(s: AppState, id: string): number {
  const h = s.session.history;
  for (let i = 0; i <= h.commands.length; i++) if ((h.snapshots[i] ?? h.base).steps.some((x) => x.id === id)) return i;
  return -1;
}

/** Go to a step: the model is shown as it was when the step had been made; the steps after it stay (faded in the list) and can be gone back to. */
export function doStepGo(s: AppState, id: string): AppState {
  if (s.repeat) return { ...s, menu: null, session: { ...s.session, message: "apply or cancel the repeat that is open first" } };
  const at = cursorOfStep(s, id);
  if (at < 0) return s;
  const moved = clearSelection(goToCursor(s.session, at));
  return withSession({ ...s, menu: null, op: null, tool: null, drag: null, stepEdit: null }, moved);
}

/** Open the numbers of a step, or close them. */
export const doStepEdit = (s: AppState, id: string | null): AppState => ({ ...s, stepEdit: id === s.stepEdit ? null : id });

/** Change one number of a step: the command `setStepParams`, at the last step only; the model is made again from there and one undo takes it back. */
export function doStepSet(s: AppState, id: string, key: string, value: number): AppState {
  const h = s.session.history;
  if (h.cursor < h.commands.length) return { ...s, session: { ...s.session, message: "go to the last step to change numbers" } };
  if (!Number.isFinite(value)) return s;
  const step = sceneOf(s.session).steps.find((x) => x.id === id);
  if (!step || (Number(step.params[key]) === value && !step.links?.[key])) return s;
  return withSession({ ...s, menu: null }, run(s.session, { type: "setStepParams", id, params: { [key]: value } }));
}

/** Tie one number of a step to a formula of named parameters (`dec_named_parameters`): the command `linkParam`, at the last step only. */
export function doStepLink(s: AppState, id: string, key: string, expr: string): AppState {
  const h = s.session.history;
  if (h.cursor < h.commands.length) return { ...s, session: { ...s.session, message: "go to the last step to change numbers" } };
  return withSession({ ...s, menu: null }, run(s.session, { type: "linkParam", id, key, expr }));
}
/** Give a parameter a formula (or make it), or take it away (`dec_named_parameters`). */
export function doParamSet(s: AppState, name: string, expr: string): AppState {
  const h = s.session.history;
  if (h.cursor < h.commands.length) return { ...s, session: { ...s.session, message: "go to the last step to change parameters" } };
  if (sceneOf(s.session).parameters?.[name] === expr.trim().replace(/^=/, "")) return s;
  return withSession({ ...s, menu: null }, run(s.session, { type: "setParameter", name, expr }));
}
export function doParamRemove(s: AppState, name: string): AppState {
  const h = s.session.history;
  if (h.cursor < h.commands.length) return { ...s, session: { ...s.session, message: "go to the last step to change parameters" } };
  return withSession({ ...s, menu: null }, run(s.session, { type: "removeParameter", name }));
}

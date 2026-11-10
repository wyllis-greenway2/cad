// Selecting by what a selection is like (`in_257`, `dec_selection_tools`): "Select similar" selects everything like the selected parts by a few rules, and the chip that follows loosens or tightens one rule at a time.
import { scene as sceneOf, selection as selectionOf } from "../session.ts";
import { similarTo, DEFAULT_RULES, SIMILAR_RULES } from "../similar.ts";
import type { SimilarRule } from "../similar.ts";
import type { AppState } from "./state.ts";

const say = (s: AppState, message: string): AppState => ({ ...s, session: { ...s.session, message } });
const plural = (n: number, noun: string) => `${n} similar ${noun}${n === 1 ? "" : "s"}`;

function apply(s: AppState, base: readonly string[], rules: SimilarRule[]): AppState {
  const r = similarTo(sceneOf(s.session), base as never, rules);
  if (!r.ok) return { ...say({ ...s, similar: null }, r.why) };
  const found = r.refs.length;
  return { ...s, similar: { base: [...base] as never, rules, refs: r.refs, noun: r.noun }, session: { ...s.session, click: { ...s.session.click, selection: r.refs }, message: `selected ${plural(found, r.noun)}` } };
}

/** The menu item: everything like what is selected. */
export function doSimilar(s: AppState): AppState {
  const base = selectionOf(s.session);
  return apply({ ...s, menu: null }, base, [...DEFAULT_RULES]);
}
/** A box of the chip: one rule on or off, then the same search again from the parts it began with. */
export function doSimilarRule(s: AppState, rule: SimilarRule): AppState {
  if (!s.similar || !SIMILAR_RULES.some((r) => r.id === rule)) return s;
  const rules = s.similar.rules.includes(rule) ? s.similar.rules.filter((r) => r !== rule) : [...s.similar.rules, rule];
  return apply(s, s.similar.base, rules);
}

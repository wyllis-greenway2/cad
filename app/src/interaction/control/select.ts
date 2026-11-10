// Selecting by what a selection is like (`in_257`, `dec_selection_tools`): "Select similar" selects everything like the selected parts by a few rules, and the chip that follows loosens or tightens one rule at a time.
import { scene as sceneOf, selection as selectionOf, run } from "../session.ts";
import { nextId } from "../../operation/scene.ts";
import { topItems, breakable } from "../../operation/groups.ts";
import { withSession } from "./state.ts";
import { similarTo, DEFAULT_RULES, SIMILAR_RULES } from "../similar.ts";
import type { SimilarRule } from "../similar.ts";
import type { AppState } from "./state.ts";
import type { Session } from "../session.ts";

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

/** Why the selection cannot be grouped, or null: two or more things (a group counts as one thing), none of them part of the world. */
export function whyNotGroup(session: Session): string | null {
  const sc = sceneOf(session);
  const sel = selectionOf(session);
  if (sel.some((r) => sc.parts[r]?.origin === "world")) return "the world's planes and axes cannot be grouped";
  return topItems(sc, sel).length >= 2 ? null : "select two or more things to group";
}
export const whyNotUngroup = (session: Session): string | null => (breakable(sceneOf(session), selectionOf(session)).length ? null : "select a whole group to break it");

/** Group what is selected (`in_257`): the selection stays as it is, and from now on selecting any of it selects all of it. */
export function doGroup(s: AppState): AppState {
  const why = whyNotGroup(s.session);
  if (why) return say({ ...s, menu: null }, why);
  const sc = sceneOf(s.session);
  const items = topItems(sc, selectionOf(s.session));
  const next = run(s.session, { type: "group", id: nextId(sc, "g"), items });
  return next.message ? say({ ...s, menu: null }, next.message) : { ...withSession(s, { ...next, message: `grouped ${items.length} things` }), menu: null };
}
/** Break the outermost group of the selection (one level: what was grouped inside it stays a group). */
export function doUngroup(s: AppState): AppState {
  const why = whyNotUngroup(s.session);
  if (why) return say({ ...s, menu: null }, why);
  const gs = breakable(sceneOf(s.session), selectionOf(s.session));
  const next = run(s.session, gs.length === 1 ? { type: "ungroup", id: gs[0]!.id } : { type: "batch", commands: gs.map((g) => ({ type: "ungroup" as const, id: g.id })) });
  return next.message ? say({ ...s, menu: null }, next.message) : { ...withSession(s, { ...next, message: gs.length === 1 ? "group broken" : `${gs.length} groups broken` }), menu: null };
}

/** Why the selection cannot be added or subtracted: two or more bodies are needed (`in_270`). */
export function whyNotCombine(session: Session): string | null {
  const sc = sceneOf(session);
  const bodies = selectionOf(session).filter((r) => sc.parts[r]?.kind === "body");
  return bodies.length >= 2 ? null : "select two or more bodies (click a body three times, or choose it in the Bodies list)";
}
/** Add the selected bodies into the first one selected, or take the others away from it (they are used up). */
export function doCombine(s: AppState, mode: "add" | "subtract" | "intersect", keep = false): AppState {
  const why = whyNotCombine(s.session);
  if (why) return say({ ...s, menu: null }, why);
  const sc = sceneOf(s.session);
  const bodies = selectionOf(s.session).filter((r) => sc.parts[r]?.kind === "body");
  const next = run(s.session, { type: "addStep", step: { id: nextId(sc, "s"), type: "combine", parts: bodies, params: { mode, ...(keep ? { keep: 1 } : {}) } } });
  if (next.message) return say({ ...s, menu: null, session: next }, next.message);
  return { ...withSession(s, { ...next, click: { ...next.click, selection: (keep ? bodies : [bodies[0]!]).filter((r) => r in sceneOf(next).parts) }, message: mode === "add" ? "bodies added together" : mode === "intersect" ? "what the bodies share is kept" : keep ? "bodies subtracted (the tools are kept)" : "bodies subtracted" }), menu: null };
}

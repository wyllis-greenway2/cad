// Selecting by what a selection is like (`in_257`, `dec_selection_tools`): "Select similar" selects everything like the selected parts by a few rules, and the chip that follows loosens or tightens one rule at a time.
import type { Intent } from "../../shared/input.ts";
import type { Ref } from "../../shared/ref.ts";
import { objectOf } from "../objects.ts";
import { faceEdges } from "../offsetbody.ts";
import type { Part } from "../../operation/part.ts";
import { startCut, cutStep, cutParts } from "../cut.ts";
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

/**
 * Select every face, every edge or every vertex that belongs to what is selected (`in_393`, `in_435`): the whole body selected, all of the body's; one face selected, that face's edges or corners; edges, the
 * faces they bound or their ends; a corner, the edges and faces that meet there; a flat sketch (a closed figure, a line, a circle), its own sides and corners. With nothing selected, the model's.
 */
export function doSelectAll(s: AppState, what: "faces" | "edges" | "vertices"): AppState {
  const sc = sceneOf(s.session);
  const sel = selectionOf(s.session);
  const flats = Object.values(sc.parts).filter((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !!p.mesh && p.mesh.length >= 9);
  const bodyEdges = Object.values(sc.parts).filter((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body");
  const out = new Set<Ref>();
  const add = (refs: readonly Ref[]) => refs.forEach((r) => { if (r in sc.parts) out.add(r); });
  const edgesOfFace = (f: Extract<Part, { kind: "plane" }>): Ref[] => faceEdges(sc, f).filter((r) => { const l = sc.parts[r]; return l?.kind === "line"; });
  const endsOf = (edges: readonly Ref[]): Ref[] => edges.flatMap((r) => { const l = sc.parts[r]; return l?.kind === "line" ? [l.a, l.b] : []; });
  const facesAround = (edges: ReadonlySet<Ref>): Ref[] => flats.filter((f) => edgesOfFace(f).some((e) => edges.has(e))).map((f) => f.ref);
  const scoped = (what2: typeof what, ref: Ref): void => {
    const p = sc.parts[ref];
    if (!p) return;
    const obj = objectOf(sc, ref);
    if (p.kind === "body" || (p.origin === "body" && obj === ref)) { // the whole body: all of its faces, edges or corners
      const mine = (q: Part) => q.origin === "body" && objectOf(sc, q.ref) === obj;
      add(Object.values(sc.parts).filter((q) => mine(q) && (what2 === "faces" ? q.kind === "plane" && !!q.mesh && q.mesh.length >= 9 : what2 === "edges" ? q.kind === "line" : q.kind === "corner")).map((q) => q.ref));
    } else if (p.kind === "plane" && p.origin === "body") { // one face: itself, its edges, its corners
      const e = edgesOfFace(p);
      add(what2 === "faces" ? [p.ref] : what2 === "edges" ? e : endsOf(e));
    } else if (p.kind === "line" && p.origin === "body") { // one edge: itself, its ends, the faces it bounds
      add(what2 === "edges" ? [p.ref] : what2 === "vertices" ? [p.a, p.b] : facesAround(new Set([p.ref])));
    } else if (p.kind === "corner" && p.origin === "body") { // one corner: itself, the edges that meet there, the faces round it
      const e = bodyEdges.filter((l) => l.a === p.ref || l.b === p.ref).map((l) => l.ref);
      add(what2 === "vertices" ? [p.ref] : what2 === "edges" ? e : facesAround(new Set(e)));
    } else if (p.kind === "face" && p.origin === "drawn") { // a closed sketch (it has no thickness): its own sides and corners
      const rings = [p, ...(p.holes ?? []).map((h) => sc.parts[h]).filter((h): h is Extract<Part, { kind: "face" }> => h?.kind === "face")];
      const sides = rings.flatMap((f) => (f.disk ? [f.disk] : f.loop));
      add(what2 === "faces" ? [p.ref] : what2 === "edges" ? sides : rings.flatMap((f) => f.corners));
    } else if (p.origin === "drawn" && (p.kind === "line" || p.kind === "circle" || p.kind === "corner")) { // a drawn side, circle or point
      add(what2 === "edges" ? (p.kind === "corner" ? [] : [p.ref]) : what2 === "vertices" ? (p.kind === "line" ? [p.a, p.b] : p.kind === "circle" ? [p.center] : [p.ref]) : []);
    }
  };
  if (sel.length) for (const r of sel) scoped(what, r);
  else for (const b of Object.values(sc.parts).filter((q) => q.kind === "body")) scoped(what, b.ref); // (nothing selected: the model's)
  const refs = [...out];
  if (!refs.length) return { ...s, menu: null, session: { ...s.session, message: sel.length ? `there are no ${what} that belong to what is selected` : `no ${what} to select: make a body first` } };
  return { ...s, menu: null, similar: null, session: { ...s.session, click: { ...s.session.click, selection: refs }, message: `selected ${refs.length} ${what}` } };
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
/** Cut: the selected bodies are shown as the parts they make, to keep or toss (`in_294`). */
export function doCutBegin(s: AppState): AppState {
  const why = whyNotCombine(s.session);
  if (why) return say({ ...s, menu: null }, why);
  const sc = sceneOf(s.session);
  const bodies = selectionOf(s.session).filter((r) => sc.parts[r]?.kind === "body");
  const start = startCut(bodies);
  const cut = { ...start, keep: cutParts(sc, start).map((p) => p.mask) }; // (it starts as an add: every part kept and joined; a part tapped is tossed, `in_298`)
  return { ...s, menu: null, op: null, tool: null, cut, session: { ...s.session, message: "every part is kept (+); click one to toss it (−); Enter or a right click makes it, Esc gives it up" } };
}
export function doCut(s: AppState, i: Extract<Intent, { type: "cut" }>): AppState {
  if (!s.cut) return s;
  if (i.act === "join") return { ...s, cut: { ...s.cut, join: !s.cut.join } };
  const keep = s.cut.keep.includes(i.mask) ? s.cut.keep.filter((m) => m !== i.mask) : [...s.cut.keep, i.mask];
  return { ...s, cut: { ...s.cut, keep } };
}
/** The kept parts are made, as one step that undoes in one. */
export function applyCut(s: AppState): AppState {
  if (!s.cut) return s;
  const sc = sceneOf(s.session);
  const cmd = cutStep(sc, s.cut);
  if (!cmd) return say({ ...s, cut: null }, "nothing was kept: the bodies would all be gone (Delete takes a body away)");
  const next = run(s.session, cmd);
  if (next.message) return say({ ...s, cut: null, session: next }, next.message);
  const after = sceneOf(next);
  return { ...withSession(s, { ...next, click: { ...next.click, selection: [] }, message: s.cut.keep.length > 1 && s.cut.join ? "the parts kept are joined where they touch" : null }), cut: null };
}

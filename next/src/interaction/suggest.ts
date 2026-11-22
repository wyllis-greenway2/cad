// What to offer for a selection (E51, E55, E57): the relations that exist for exactly the parts selected, in one table; which already hold (shown, not added), which are already in the sketch or follow from it (said, nothing added twice),
// which would be refused (with what holds them back named, so the screen can show them red and offer to delete), and which do not apply (with the reason). And what a relation ties the selection to (the amber).
// Dimensions are measure, then lock: the offer carries the number the parts are now. Pure; reads the system; changes nothing.
import { type Constraint, RANGEABLE, RELATIONS, type Relation, type System, kindOf, residualsOf, tryAdd } from "../engine/solver.ts";

export type PartKind = "point" | "line" | "circle";
export type OfferState = "free" | "holds" | "already" | "refused";
export interface Offer {
  kind: Relation; /** in the order the relation reads them */ parts: string[]; /** the one that moves when one must: the first selected (E51) */ moves: string;
  dimensional: boolean; /** for a dimension: what the parts are now (degrees for an angle) */ measure: number | null;
  state: OfferState; /** `already`: the constraints that say it; `refused`: those that cannot hold with it, and the ones that were there before */ by: string[]; victims: string[]; holding: string[];
  label: string;
}
export interface Inapplicable { kind: Relation; why: string }

const pos = (S: System, id: string): [number, number] => { const p = S.points.find((q) => q.id === id)!; return [p.x, p.y]; };
/** what the parts are now, as the number a dimension would lock (E51: measure, then lock) */
export function measure(S: System, kind: Relation, parts: string[]): number | null {
  if (!RANGEABLE.has(kind)) return null;
  if (kind === "angle") { const l = (id: string) => { const q = S.lines.find((x) => x.id === id)!, a = pos(S, q.a), b = pos(S, q.b); return [b[0] - a[0], b[1] - a[1]] as [number, number]; }; const u = l(parts[0]!), w = l(parts[1]!); return (Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1]) * 180) / Math.PI; }
  const r = residualsOf(S, { id: "?", kind, parts, value: 0 }); return r.length ? (kind === "pointLineDistance" || kind === "distance" || kind === "length" ? Math.abs(r[0]!) : r[0]!) : null;
}
/** the relations for exactly these parts, in the order the person selected them: the first moves */
export function offersFor(S: System, selection: string[]): { offers: Offer[]; inapplicable: Inapplicable[] } {
  const kinds = selection.map((id) => kindOf(id, S)), offers: Offer[] = [], inapplicable: Inapplicable[] = [];
  for (const [name, def] of Object.entries(RELATIONS) as [Relation, (typeof RELATIONS)[Relation]][]) {
    // horizontal and upright take a line, or two points
    const arity = name === "horizontal" || name === "vertical" ? (selection.length === 1 || selection.length === 2 ? selection.length : 1) : def.arity;
    if (arity !== selection.length) { inapplicable.push({ kind: name, why: `${RELATIONS[name].label} takes ${def.arity} part${def.arity === 1 ? "" : "s"}, ${selection.length} selected` }); continue; }
    let parts: string[] | null = null;
    const fits = (ks: string[]) => (name === "horizontal" || name === "vertical" ? (ks.length === 1 ? ks[0] === "line" : ks[0] === "point" && ks[1] === "point") : def.parts.every((allowed, i) => (allowed as string[]).includes(ks[i]!)));
    if (fits(kinds)) parts = [...selection]; else if (selection.length === 2 && fits([kinds[1]!, kinds[0]!])) parts = [selection[1]!, selection[0]!];
    if (!parts) { inapplicable.push({ kind: name, why: `${RELATIONS[name].label} needs ${(def.parts as string[][]).map((p) => p.join(" or ")).join(" and ")}, not ${kinds.join(" and ")}` }); continue; }
    const m = measure(S, name, parts), draft: Constraint = { id: `offer.${name}`, kind: name, parts, ...(RANGEABLE.has(name) && m !== null ? { value: name === "angle" ? Math.round(m * 1e6) / 1e6 : Math.round(m * 1e9) / 1e9 } : {}) };
    if (RANGEABLE.has(name)) { offers.push({ kind: name, parts, moves: selection[0]!, dimensional: true, measure: m, state: "free", by: [], victims: [], holding: [], label: RELATIONS[name].label }); continue; } // a number is asked of the person, then locked
    const holdsNow = residualsOf(S, draft).every((v) => Math.abs(v) < 1e-7), t = tryAdd(S, draft);
    offers.push({ kind: name, parts, moves: selection[0]!, dimensional: false, measure: null, state: t.outcome === "already" ? "already" : t.outcome === "refused" ? "refused" : holdsNow ? "holds" : "free", by: t.by, victims: t.victims, holding: t.holding, label: RELATIONS[name].label });
  }
  return { offers, inapplicable };
}
/** the constraints that touch the selection, and what each ties it to (the amber): shown only for what is selected, whatever else is drawn */
export function constraintsOn(S: System, selection: string[]): { constraint: Constraint; ties: string[] }[] {
  const reach = (id: string): string[] => { const k = kindOf(id, S); if (k === "line") { const l = S.lines.find((q) => q.id === id)!; return [id, l.a, l.b]; } if (k === "circle") { const c = S.circles.find((q) => q.id === id)!; return [id, c.c]; } return [id]; };
  const mine = new Set(selection.flatMap(reach));
  return S.constraints.filter((c) => c.parts.some((p) => reach(p).some((q) => mine.has(q)))).map((c) => ({ constraint: c, ties: c.parts.filter((p) => !selection.includes(p)) })); // what it ties the selection to: the other parts it names (by name: a corner two sides share does not make them the same part)
}

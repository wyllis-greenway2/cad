// What to offer for a selection (E51, E55, E57): the relations that exist for exactly the parts selected, in one table; which already hold (shown, not added), which are already in the sketch or follow from it (said, nothing added twice),
// which would be refused (with what holds them back named, so the screen can show them red and offer to delete), and which do not apply (with the reason). And what a relation ties the selection to (the amber).
// Dimensions are measure, then lock: the offer carries the number the parts are now. Pure; reads the system; changes nothing.
import { type Constraint, RANGEABLE, RELATIONS, type Relation, type System, kindOf, residualsOf } from "../engine/solver.ts";
import { fits, standingOf } from "../engine/relations.ts";

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
const memo = new WeakMap<System, Map<string, { offers: Offer[]; inapplicable: Inapplicable[] }>>(); // (the same system and selection are asked about by the bar, the bubbles and the drawing, every frame)
export function offersFor(S: System, selection: string[]): { offers: Offer[]; inapplicable: Inapplicable[] } {
  const key = selection.join("\u0000"), hit = memo.get(S)?.get(key); if (hit) return hit;
  const out = offersForUncached(S, selection); let m = memo.get(S); if (!m) memo.set(S, (m = new Map())); m.set(key, out); return out;
}
function offersForUncached(S: System, selection: string[]): { offers: Offer[]; inapplicable: Inapplicable[] } {
  const kinds = selection.map((id) => kindOf(id, S)), offers: Offer[] = [], inapplicable: Inapplicable[] = [];
  for (const [name, def] of Object.entries(RELATIONS) as [Relation, (typeof RELATIONS)[Relation]][]) {
    // horizontal and upright take a line, or two points
    const arity = name === "horizontal" || name === "vertical" ? (selection.length === 1 || selection.length === 2 ? selection.length : 1) : def.arity;
    if (arity !== selection.length) { inapplicable.push({ kind: name, why: `${RELATIONS[name].label} takes ${def.arity} part${def.arity === 1 ? "" : "s"}, ${selection.length} selected` }); continue; }
    let parts: string[] | null = null;
    if (fits(name, kinds)) parts = [...selection]; else if (selection.length === 2 && fits(name, [kinds[1]!, kinds[0]!])) parts = [selection[1]!, selection[0]!];
    if (!parts) { inapplicable.push({ kind: name, why: `${RELATIONS[name].label} needs ${(def.parts as string[][]).map((p) => p.join(" or ")).join(" and ")}, not ${kinds.join(" and ")}` }); continue; }
    const m = measure(S, name, parts), draft: Constraint = { id: `offer.${name}`, kind: name, parts, ...(name === "fixed" ? { at: pos(S, parts[0]!) } : {}), ...(RANGEABLE.has(name) && m !== null ? { value: name === "angle" ? Math.round(m * 1e6) / 1e6 : Math.round(m * 1e9) / 1e9 } : {}) };
    if (RANGEABLE.has(name)) { offers.push({ kind: name, parts, moves: selection[0]!, dimensional: true, measure: m, state: "free", by: [], victims: [], holding: [], label: RELATIONS[name].label }); continue; } // a number is asked of the person, then locked
    const t = standingOf(S, draft);
    offers.push({ kind: name, parts, moves: selection[0]!, dimensional: false, measure: null, state: t.state, by: t.by, victims: t.victims, holding: t.holding, label: RELATIONS[name].label });
  }
  return { offers, inapplicable };
}

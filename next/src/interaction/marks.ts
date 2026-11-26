// The marks of a sketch (`dec_marks_on_things`, `in_1611`): every constraint and number is one mark that stands on the part it is about, with one lock. Locked and green: it is applied. Unlocked and yellow: it is offered (true as drawn and near, `offerable`).
// Red: a change was refused and this is what held it back. ONE rule says which show: a locked mark when its part is selected; an offer when its part is selected, or for a short time (fading) after the part was made or moved, selected or not; a refused one always, while the
// refusal stands. Nothing else. Pure: the solver's system, the selection, the flash and the clock in; descriptions out (where on the sketch, what, which state). The page draws them (`markdraw.ts`).
import type { System } from "../engine/solver.ts";
import { anchorOf, bubblesOn, scopeOf, selectionAnchor, type Flash } from "./bubbles.ts";
import { barFor, nearConstraint, nearFor, type BarItem } from "./infobar.ts";
import type { Fact } from "./infobar.ts";
import { settings } from "../settings.ts";

export type MarkState = "locked" | "offer" | "refused";
/** a mark is a fact (what a bubble says) with its state, how much of it is left while it fades, and (an offer) the parts it is offered for: a click on it selects them and applies it */
export interface Mark extends Fact { state: MarkState; alpha: number; over?: string[] }
/** the parts a figure was just made of or dragged to: their offers show until `until` (ms on the page's clock), fading at the end */
export interface Recent { ids: readonly string[]; until: number }

/** how much of an offer is left at `now` (1 until the last `fadeMs`, then down to 0) */
export const alphaAt = (until: number, now: number): number => Math.max(0, Math.min(1, (until - now) / settings.marks.fadeMs));
/** what is offered for one selection: for a part alone, what is already true (`holds`: a line is level, a point is on a line) and the near ones (true now with another part), the rest is in the menu; for two or more parts chosen together, everything that fits them and would be accepted, true yet or not */
const memo = new WeakMap<System, Map<string, { item: BarItem; at: [number, number] }[]>>(); // (the same system and selection are asked about every frame)
function offersOf(S: System, selection: string[], reachMm?: number): { item: BarItem; at: [number, number] }[] {
  const key = `${selection.join("\u0000")}|${reachMm === undefined ? "" : reachMm.toFixed(3)}`, hit = memo.get(S)?.get(key); if (hit) return hit;
  const out = offersOfUncached(S, selection, reachMm); let m = memo.get(S); if (!m) memo.set(S, (m = new Map())); m.set(key, out); return out;
}
function offersOfUncached(S: System, selection: string[], reachMm?: number): { item: BarItem; at: [number, number] }[] {
  const where = selectionAnchor(S, selection); if (!where) return [];
  // ("fixed in place" is true of every point as drawn: it is a thing to ask for in the menu, not an offer) one part: only what is already true of it (the rest is in the menu); two or more: the person has paired them, so everything that fits the pair and would be accepted (a line and a circle: tangent; a point and a line: on the line)
  const own = barFor(S, selection).filter((b) => b.id !== "rel:fixed" && (selection.length >= 2 || b.tone === "holds")).map((item) => ({ item, at: where }));
  const near = nearFor(S, selection, undefined, reachMm).flatMap((item) => { const nc = nearConstraint(item.id); return nc ? [{ item, at: anchorOf(S, { id: "near", kind: nc.kind, parts: nc.parts }) }] : []; });
  return [...own, ...near];
}
/** the marks to show now */
export function marksFor(S: System, selection: string[], ctx: { flash?: Flash; recent?: Recent | null; now: number; /** how much of a constraint doing work shows, from 0 to 1 (a fade in and out) */ fade?: (id: string) => number; /** how far (mm) a relation may be from holding and still be offered (the helpers' reach in mm): in range, whatever moved things there */ reachMm?: number }): Mark[] {
  const out: Mark[] = [];
  // what is selected shows what it is made of too (a line, its ends; going down, never up: `scopeOf`)
  const scope = scopeOf(S, selection);
  for (const f of bubblesOn(S, selection, ctx.flash ?? {}, scope)) out.push({ ...f, state: f.tone === "refused" ? "refused" : f.locked === false ? "offer" : "locked", alpha: f.tone === "applied" ? ctx.fade?.(f.id) ?? 1 : 1 });
  // the near offers of what a single part is made of (a line's end on another line) are offered with it
  const kids = selection.length === 1 ? scope.filter((id) => id !== selection[0]) : [];
  const fresh = !selection.length && ctx.recent && ctx.now < ctx.recent.until ? ctx.recent : null;
  for (const sel of selection.length ? [selection] : fresh ? fresh.ids.map((id) => [id]) : []) {
    for (const { item, at } of [...offersOf(S, sel, ctx.reachMm), ...(sel === selection ? kids.flatMap((k) => offersOf(S, [k], ctx.reachMm).filter((o) => { const nc = nearConstraint(o.item.id); return !!nc && nc.parts.some((x) => !scope.includes(x)); })) : [])]) {
      const nc = nearConstraint(item.id), parts = nc ? nc.parts : sel;
      if (out.some((m) => m.id === item.id && m.over?.join() === sel.join())) continue;
      out.push({ id: item.id, kind: "constraint", relation: (nc?.kind ?? item.id.slice(4)) as Fact["relation"], icon: item.icon, at, tone: "offer", title: item.label, parts, state: "offer", alpha: fresh ? alphaAt(fresh.until, ctx.now) : 1, over: sel });
    }
  }
  return out;
}

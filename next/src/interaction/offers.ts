// The constraints a helper held, offered for a moment after a figure is placed (`dec_helper_constraint_bubble`). Pure: the state of the offers is a value; each function takes it and gives the next. The controller (`sketchcontrol.ts`) only keeps the value, says when
// the sketch changed, and draws what `offerBubbles` returns.
//   made: from the helpers that held and the figure as it was made, the constraints the solver would add (`helpshow.ts` `offersFrom`), each a bubble with a question mark for `stayMs`
//   waiting: while the pointer is on a bubble it stays at least `hoverMs`; the last `fadeMs` it fades
//   taken: a click makes the constraint (`keep`), the bubble shows a check for `takenMs`, then it fades
//   gone: when the sketch is not the one the offers were made on (the next figure, a drag, undo), when the plane is not the same, and when the time is up
import type { SketchParams } from "../engine/sketch.ts";
import { P, S, L, C, type Helped, type Pt } from "../engine/helpers.ts";
import { RELATIONS, type Constraint, type System } from "../engine/solver.ts";
import { anchorOf, iconOf, type Bubble } from "./bubbles.ts";
import { keep, nextId, type Kept, type Sol } from "./drawing.ts";
import { offersFrom, type Made } from "./helpshow.ts";

export interface OfferTimes { stayMs: number; takenMs: number; hoverMs: number; fadeMs: number }
export interface Offer { id: string; c: Constraint; state: "open" | "taken"; until: number }
/** the offers of one sketch: `base` is the definition they were made on (any other definition and they are gone) */
export interface Offers { key: string; base: SketchParams; items: Offer[] }

/** the names the free parts of a figure have once it is made: the points at the place and at the first place, the line between, the circle about the first place */
export function madeNames(p: SketchParams, sol: Sol, at: Pt, start: Pt | null): Made {
  const near = (q: Pt | null) => (q ? p.points.find((x) => Math.hypot(sol.points[x.id]![0] - q[0], sol.points[x.id]![1] - q[1]) < 1e-6)?.id : undefined);
  const made: Made = { [P]: near(at), [S]: near(start) };
  made[L] = (p.lines ?? []).find((l) => l.a === made[S] && l.b === made[P])?.id;
  made[C] = [...(p.circles ?? [])].reverse().find((k) => k.c === made[S])?.id;
  return made;
}

/** the offers for a figure just placed: `p` is the sketch with it in, `sys` its system, `help` what held at its place (null: nothing: no offers) */
export function newOffers(key: string, p: SketchParams, sys: System, sol: Sol, help: Helped | null, at: Pt, start: Pt | null, now: number, t: OfferTimes): Offers | null {
  if (!help) return null;
  const cs = offersFrom(sys, help, madeNames(p, sol, at, start));
  return cs.length ? { key, base: p, items: cs.map((c, i) => ({ id: `offer:${i}`, c, state: "open", until: now + t.stayMs })) } : null;
}

/** a click on an offer: the sketch with the constraint (the next offers, the bubble with a check), or why not */
export function takeOffer(o: Offers, id: string, current: { key: string; p: SketchParams }, now: number, t: OfferTimes): { ok: true; offers: Offers; params: SketchParams } | { ok: false; why: string; victims: string[] } | null {
  const item = o.items.find((i) => i.id === id);
  if (!item || item.state !== "open" || current.key !== o.key || current.p !== o.base) return null;
  const k: Kept = keep({ ...current.p, constraints: [...(current.p.constraints ?? []), { ...item.c, id: nextId(current.p, "c") }] });
  if (!k.ok) return { ok: false, why: k.why, victims: k.victims };
  return { ok: true, params: k.params, offers: { ...o, base: k.params, items: o.items.map((i) => (i === item ? { ...i, state: "taken", until: now + t.takenMs } : i)) } };
}

/** the bubbles to show now, and the offers that are left (null: none); `hovered`: the pointer is on a bubble */
export function offerBubbles(o: Offers | null, current: { key: string; p: SketchParams } | null, sys: System, hovered: boolean, now: number, t: OfferTimes): { offers: Offers | null; bubbles: Bubble[] } {
  if (!o || !current || o.key !== current.key || o.base !== current.p) return { offers: null, bubbles: [] };
  const items = o.items.map((i) => (hovered && i.state === "open" ? { ...i, until: Math.max(i.until, now + t.hoverMs) } : i)).filter((i) => now < i.until);
  if (!items.length) return { offers: null, bubbles: [] };
  return {
    offers: { ...o, items },
    bubbles: items.map((i): Bubble => ({
      id: i.id, kind: "constraint", relation: i.c.kind, icon: iconOf(i.c.kind), at: anchorOf(sys, i.c), tone: i.state === "taken" ? "applied" : "offer", offer: i.state,
      fade: Math.min(1, (i.until - now) / t.fadeMs), title: i.state === "taken" ? "made" : `${RELATIONS[i.c.kind].label}? Click to make it`, parts: i.c.parts,
    })),
  };
}

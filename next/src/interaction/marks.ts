// The marks of a sketch (`dec_marks_on_things`, `in_1611`): every constraint and number is one mark that stands on the part it is about, with one lock. Locked and green: it is applied. Unlocked and yellow: it is offered (true as drawn and near, `offerable`).
// Red: a change was refused and this is what held it back. ONE rule says which show: a locked mark when its part is selected; an offer when its part is selected, or for a short time (fading) after the part was made or moved, selected or not; a refused one always, while the
// refusal stands. Nothing else. Pure: the solver's system, the selection, the flash and the clock in; descriptions out (where on the sketch, what, which state). The page draws them (`markdraw.ts`).
import type { System } from "../engine/solver.ts";
import { settings } from "../settings.ts";
import { anchorOf, bubblesOn, scopeOf, selectionAnchor, type Flash } from "./bubbles.ts";
import type { Fact } from "./infobar.ts";
import { barFor, nearConstraint, nearFor, type BarItem } from "./infobar.ts";

export type MarkState = "locked" | "offer" | "refused";
/** a mark is a fact (what a bubble says) with its state, how much of it is left while it fades, and (an offer) the parts it is offered for: a click on it selects them and applies it */
export interface Mark extends Fact {
  /** an offer that would move something: each point that would go, from where it is to where it would be (the sketch's axes); the mark then stands in the middle of the longest */
  moves?: { from: [number, number]; to: [number, number] }[];
  state: MarkState;
  alpha: number;
  over?: string[];
}
/** the parts a figure was just made of or dragged to: their offers show until `until` (ms on the page's clock), fading at the end */
export interface Recent {
  ids: readonly string[];
  until: number;
}

/** how much of an offer is left at `now` (1 until the last `fadeMs`, then down to 0) */
export const alphaAt = (until: number, now: number): number =>
  Math.max(0, Math.min(1, (until - now) / settings.marks.fadeMs));
/** what is offered for one selection: for a part alone, what is already true (`holds`: a line is level, a point is on a line) and the near ones (true now with another part), the rest is in the menu; for two or more parts chosen together, everything that fits them and would be accepted, true yet or not */
type Offered = { item: BarItem; at: [number, number]; moves: { from: [number, number]; to: [number, number] }[] };
const memo = new WeakMap<System, Map<string, Offered[]>>(); // (the same system and selection are asked about every frame)
function offersOf(S: System, selection: string[], reach?: { pointMm: number; lineMm: number }): Offered[] {
  const key = `${selection.join("\u0000")}|${reach === undefined ? "" : `${reach.pointMm.toFixed(3)},${reach.lineMm.toFixed(3)}`}`,
    hit = memo.get(S)?.get(key);
  if (hit) return hit;
  const out = offersOfUncached(S, selection, reach);
  let m = memo.get(S);
  if (!m) memo.set(S, (m = new Map()));
  m.set(key, out);
  return out;
}
function offersOfUncached(S: System, selection: string[], reach?: { pointMm: number; lineMm: number }): Offered[] {
  const where = selectionAnchor(S, selection);
  if (!where) return [];
  // ("fixed in place" is true of every point as drawn: it is a thing to ask for in the menu, not an offer) one part: only what is already true of it (the rest is in the menu); two or more: the person has paired them, so everything that fits the pair and would be accepted (a line and a circle: tangent; a point and a line: on the line)
  const pair =
    selection.length >= 2
      ? nearFor(S, selection, 99, { pointMm: 1e9, lineMm: 1e9 }, true).flatMap((it) => {
          const n = nearConstraint(it.id);
          return n ? [{ kind: n.kind as string, parts: n.parts, moves: it.moves ?? [] }] : [];
        })
      : [];
  const own = barFor(S, selection)
    .filter((b) => b.id !== "rel:fixed" && (selection.length >= 2 || b.tone === "holds"))
    .map((item) => {
      // a pair the person chose is offered whether it is near or not: what it would move is worked out with no limit on the distance (`in_1631`)
      const k = item.id.startsWith("rel:") ? item.id.slice(4) : "",
        moves =
          selection.length >= 2 && item.tone !== "holds"
            ? (pair.find(
                (n) =>
                  n.kind === k && n.parts.length === selection.length && selection.every((x) => n.parts.includes(x)),
              )?.moves ?? [])
            : [];
      return { item, at: middleOf(moves) ?? where, moves };
    });
  const near = nearFor(S, selection, undefined, reach).flatMap((item) => {
    const nc = nearConstraint(item.id);
    if (!nc) return [];
    // what taking it would move, each part from where it is to where it would be; the mark stands in the middle of the longest (`in_1631`)
    const moves = item.moves ?? [];
    const at = middleOf(moves) ?? anchorOf(S, { id: "near", kind: nc.kind, parts: nc.parts });
    return [{ item, at, moves }];
  });
  return [...own, ...near];
}
/** the reach is in pixels, so zoomed far out it would cover the whole drawing: it is never more than a tenth of the size of what is selected (a circle's radius, a line's length), so zooming out does not make more things "near" (`in_1633`) */
function capReach(
  S: System,
  selection: string[],
  reach?: { pointMm: number; lineMm: number },
): { pointMm: number; lineMm: number } | undefined {
  if (!reach) return reach;
  const size = Math.max(
    0,
    ...selection.map((id) => {
      const k = S.circles.find((x) => x.id === id),
        l = S.lines.find((x) => x.id === id),
        a = l && S.points.find((x) => x.id === l.a),
        b = l && S.points.find((x) => x.id === l.b);
      return k ? k.r : a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    }),
  );
  return size > 0
    ? { pointMm: Math.min(reach.pointMm, size * 0.1), lineMm: Math.min(reach.lineMm, size * 0.05) }
    : reach;
}
/** the middle of the longest of some arrows (where the offer that makes them stands), null when there are none */
function middleOf(moves: readonly { from: [number, number]; to: [number, number] }[]): [number, number] | null {
  let best: (typeof moves)[number] | null = null,
    len = 0;
  for (const m of moves) {
    const d = Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1]);
    if (!best || d > len) ((best = m), (len = d));
  }
  return best ? [(best.from[0] + best.to[0]) / 2, (best.from[1] + best.to[1]) / 2] : null;
}
/** the marks to show now */
export function marksFor(
  S: System,
  selection: string[],
  ctx: {
    flash?: Flash;
    recent?: Recent | null;
    now: number;
    /** how much of a constraint doing work shows, from 0 to 1 (a fade in and out) */ fade?: (id: string) => number;
    /** how far (mm) a relation may be from holding and still be offered (the helpers' reach in mm): in range, whatever moved things there */ reach?: {
      pointMm: number;
      lineMm: number;
    };
  },
): Mark[] {
  const out: Mark[] = [];
  // what is selected shows what it is made of too (a line, its ends; going down, never up: `scopeOf`)
  const scope = scopeOf(S, selection);
  for (const f of bubblesOn(S, selection, ctx.flash ?? {}, scope))
    out.push({
      ...f,
      state: f.tone === "refused" ? "refused" : f.locked === false ? "offer" : "locked",
      alpha: f.tone === "applied" ? (ctx.fade?.(f.id) ?? 1) : 1,
    });
  // the near offers of what a single part is made of (a line's end on another line) are offered with it
  // (a circle's centre is not offered with the circle: "upright with that point" on a circle reads as an upright circle, and a centre on a point as a circle concentric with itself; select the centre to be offered them, `in_1633`)
  const centres = new Set(S.circles.map((k) => k.c)),
    kids =
      selection.length === 1
        ? scope.filter(
            (id) => id !== selection[0] && !(S.circles.some((k) => k.id === selection[0]) && centres.has(id)),
          )
        : [];
  const fresh = !selection.length && ctx.recent && ctx.now < ctx.recent.until ? ctx.recent : null;
  for (const sel of selection.length ? [selection] : fresh ? fresh.ids.map((id) => [id]) : []) {
    const reach = capReach(S, sel, ctx.reach);
    for (const { item, at, moves } of [
      ...offersOf(S, sel, reach),
      ...(sel === selection
        ? kids.flatMap((k) =>
            offersOf(S, [k], reach).filter((o) => {
              const nc = nearConstraint(o.item.id);
              return !!nc && nc.parts.some((x) => !scope.includes(x));
            }),
          )
        : []),
    ]) {
      const nc = nearConstraint(item.id),
        parts = nc ? nc.parts : sel;
      if (out.some((m) => m.id === item.id && m.over?.join() === sel.join())) continue;
      out.push({
        id: item.id,
        kind: "constraint",
        relation: (nc?.kind ?? item.id.slice(4)) as Fact["relation"],
        icon: item.icon,
        at,
        tone: "offer",
        title: item.label,
        parts,
        state: "offer",
        alpha: fresh ? alphaAt(fresh.until, ctx.now) : 1,
        over: sel,
        ...(moves.length ? { moves } : {}),
      });
    }
  }
  return out;
}

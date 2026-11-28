// The marks of a sketch (`dec_marks_on_things`, `in_1611`): every constraint and number is one mark that stands on the part it is about, with one lock. Locked and green: it is applied. Unlocked and yellow: it is offered (true as drawn and near, `offerable`).
// Red: a change was refused and this is what held it back. ONE rule says which show: a locked mark when its part is selected; an offer when its part is selected, or for a short time (fading) after the part was made or moved, selected or not; a refused one always, while the
// refusal stands. Nothing else. Pure: the solver's system, the selection, the flash and the clock in; descriptions out (where on the sketch, what, which state). The page draws them (`markdraw.ts`).
import type { Arrow } from "../engine/probe.ts";
import type { System } from "../engine/solver.ts";
import { settings } from "../settings.ts";
import {
  anchorOf,
  bubblesOn,
  alignLine,
  cornerOf,
  dimLine,
  scopeOf,
  selectionAnchor,
  type Bubble,
  type Corner,
  type DimLine,
  type Flash,
} from "./bubbles.ts";
import { barFor, nearConstraint, nearFor, type BarItem } from "./infobar.ts";

export type MarkState = "locked" | "offer" | "refused";
/** a mark is a fact (what a bubble says) with its state, how much of it is left while it fades, and (an offer) the parts it is offered for: a click on it selects them and applies it */
export interface Mark extends Bubble {
  /** an offer that would move something: each point that would go, from where it is to where it would be (the sketch's axes); the mark then stands in the middle of the longest */
  moves?: Arrow[];
  /** a measured number: the dimension line it is drawn on when it is pointed at, and the bubble stands on its middle (`in_1650`) */
  dim?: DimLine;
  /** what an alignment (level, upright, parallel) ties together: a dashed line through the two, drawn when it is pointed at (`in_1668`) */
  align?: { a: [number, number]; b: [number, number] };
  /** an angle or a square: it stands in its corner, drawn there when pointed at */ corner?: Corner;
  onSpot?: boolean;
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
type Offered = { item: BarItem; at: [number, number] };
const memo = new WeakMap<System, { key: string; out: Offered[] }>(); // (the same system and selection are asked about every frame; only the last answer is kept, so a zoom does not pile them up)
function offersOf(S: System, selection: string[], reach?: number): Offered[] {
  const key = `${selection.join("\u0000")}|${reach === undefined ? "" : reach.toFixed(3)}`,
    hit = memo.get(S);
  if (hit?.key === key) return hit.out;
  const out = offersOfUncached(S, selection, reach);
  memo.set(S, { key, out });
  return out;
}
function offersOfUncached(S: System, selection: string[], reach?: number): Offered[] {
  const where = selectionAnchor(S, selection);
  if (!where) return [];
  // ("fixed in place" is true of every point as drawn: it is a thing to ask for in the menu, not an offer) one part: only what is already true of it (the rest is in the menu); two or more: the person has paired them, so everything that fits the pair and would be accepted (a line and a circle: tangent; a point and a line: on the line)
  // a line alone is always offered the nearer of level and upright (one of them, whatever its angle; the preview shows the turn): the two constraints most often wanted (`in_1662`)
  const line = selection.length === 1 ? S.lines.find((l) => l.id === selection[0]) : undefined,
    pa = line && S.points.find((p) => p.id === line.a),
    pb = line && S.points.find((p) => p.id === line.b),
    nearer = pa && pb ? (Math.abs(pb.y - pa.y) <= Math.abs(pb.x - pa.x) ? "rel:horizontal" : "rel:vertical") : null;
  const own = barFor(S, selection)
    .filter((b) => b.id !== "rel:fixed" && (selection.length >= 2 || b.tone === "applied" || b.id === nearer))
    .map((item) => ({ item, at: where }));
  const near = nearFor(S, selection, 12, reach).flatMap((item) => {
    const nc = nearConstraint(item.id);
    if (!nc) return [];
    // (what is said of the selection alone is already among its own offers: not twice)
    if (nc.parts.length === 1 && nc.parts[0] === selection[0] && own.some((o) => o.item.id === `rel:${nc.kind}`))
      return [];
    return [{ item, at: anchorOf(S, { id: "near", kind: nc.kind, parts: nc.parts }) }];
  });
  return [...own, ...near];
}
/** the reach is in pixels, so zoomed far out it would cover the whole drawing: it is never more than a tenth of the size of what is selected (a circle's radius, a line's length), for every relation alike, so zooming out does not make more things "near" (`in_1633`) */
function capReach(S: System, selection: string[], reach?: number): number | undefined {
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
  return size > 0 ? Math.min(reach, size * 0.1) : reach;
}
interface Cand {
  item: BarItem;
  standing: [number, number];
  nc: ReturnType<typeof nearConstraint>;
  parts: string[];
  moves: Arrow[];
}
/** what a near offer wins over another by when they would move things alike: the stronger or more specific relation first (`dec_offer_rank`) */
const PRIORITY = ["tangent", "coincident", "on", "midpoint", "perpendicular", "parallel", "horizontal", "vertical"];
/** how many independent near offers one selection shows (the rest are in the menu) */
export const NEAR_SHOWN = 3;
/** two offers move things alike when the smaller is within a quarter of the larger */
const TOSS_UP = 1.25;
/** Which near offers to show (`in_1663`): offers for the same decision (the same other part, or the selection alone) are alternatives: the one that moves things least wins, with a relation that says more (a vertex put on a line's end, not only on the line) beating one it implies, and only a real toss-up (within a quarter) shows both; offers that can all hold together are independent, shown smallest movement first, at most `NEAR_SHOWN`, ties broken by the priority of the relation. */
export function rankNear(S: System, pool: Cand[], scope: readonly string[]): Cand[] {
  const move = (c: Cand) => c.moves.reduce((t, m) => t + Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1]), 0),
    rank = (c: Cand) => {
      const i = PRIORITY.indexOf(c.nc!.kind);
      return i < 0 ? PRIORITY.length : i;
    },
    cmp = (a: Cand, b: Cand) => move(a) - move(b) || rank(a) - rank(b);
  // a vertex put on a line or at its middle is implied by the vertex being coincident with one of its ends, and two points being level or upright by their being coincident, when that is offered too
  const ends = (id: string) => {
    const l = S.lines.find((x) => x.id === id);
    return l ? [l.a, l.b] : [];
  };
  const stronger = (c: Cand) => {
    const k = c.nc!.kind;
    if (k === "on" || k === "midpoint")
      return pool.some(
        (o) =>
          o.nc!.kind === "coincident" &&
          o.nc!.parts.includes(c.nc!.parts[0]!) &&
          ends(c.nc!.parts[1]!).some((e) => o.nc!.parts.includes(e)),
      );
    // two points together are also level and upright with each other
    if ((k === "horizontal" || k === "vertical") && c.nc!.parts.length === 2)
      return pool.some((o) => o.nc!.kind === "coincident" && c.nc!.parts.every((p) => o.nc!.parts.includes(p)));
    return false;
  };
  const groups = new Map<string, Cand[]>();
  for (const c of pool) {
    if (stronger(c)) continue;
    const other = c.nc!.parts.filter((p) => !scope.includes(p)).join(",") || "self";
    groups.set(other, [...(groups.get(other) ?? []), c]);
  }
  const kept: Cand[] = [];
  for (const g of groups.values()) {
    g.sort(cmp);
    const best = move(g[0]!);
    kept.push(...g.filter((c, i) => i === 0 || move(c) <= best * TOSS_UP + 1e-6));
  }
  return kept.sort(cmp).slice(0, NEAR_SHOWN);
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
    /** what applying an offer (its id, the parts it is offered for) would move: the arrows; none when nothing would move or it would be refused */ preview?: (
      id: string,
      over: string[],
    ) => Arrow[];
    /** how far (mm) a relation may be from holding and still be offered (the helpers' reach in mm): in range, whatever moved things there */ reach?: number;
  },
): Mark[] {
  const out: Mark[] = [];
  // what is selected shows what it is made of too (a line, its ends; going down, never up: `scopeOf`)
  const scope = scopeOf(S, selection);
  for (const f of bubblesOn(S, selection, ctx.flash ?? {}, scope)) {
    // a number stands on its own dimension line (drawn when it is pointed at), 24 px off what it measures where it stands off
    const mmPx = (ctx.reach ?? 0) / settings.helpers.reachPx,
      dim = f.kind === "dimension" && f.relation ? dimLine(S, f.relation, f.parts, (ctx.reach ?? 0) * 2) : null,
      mid: [number, number] | null = dim ? [(dim.a[0] + dim.b[0]) / 2, (dim.a[1] + dim.b[1]) / 2] : null,
      cn = f.relation && mmPx > 0 ? cornerOf(S, f.relation, f.parts, mmPx) : null,
      al = f.relation && mmPx > 0 && f.kind !== "dimension" ? alignLine(S, f.relation, f.parts, 20 * mmPx) : null;
    out.push({
      ...f,
      ...(dim && mid ? { dim, at: mid, onSpot: true } : {}),
      ...(cn ? { corner: cn.corner, at: cn.at, onSpot: true } : {}),
      ...(al ? { align: al } : {}),
      state: f.tone === "refused" ? "refused" : f.locked === false ? "offer" : "locked",
      alpha: f.tone === "applied" ? (ctx.fade?.(f.id) ?? 1) : 1,
    });
  }
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
    // the offers of this selection: the ones asked for (a picked pair, what is true) stand as they are; the near ones are ranked (`rankNear`, `in_1663`)
    const direct: Cand[] = [],
      pool: Cand[] = [];
    for (const { item, at: standing } of [
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
      const nc = nearConstraint(item.id);
      if (out.some((m) => m.id === item.id && m.over?.join() === sel.join())) continue;
      // what applying it would move (the preview is the apply itself, `sketchmarks.ts`)
      const moves = ctx.preview?.(item.id, sel) ?? [];
      // an offer is near when applying it moves nothing by more than the one distance (`in_1665`), whatever the parts it names are apart: a point 0.14 mm off a circle, on a tangent line's middle, turns the whole line (`in_1652`)
      if (nc && reach && moves.some((m) => Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1]) > reach)) continue;
      (nc ? pool : direct).push({ item, standing, nc, parts: nc ? nc.parts : sel, moves });
    }
    for (const c of [...direct, ...rankNear(S, pool, scopeOf(S, sel))]) {
      // a square or an angle's offer stands in its corner
      const rel = c.nc?.kind ?? c.item.id.slice(4),
        mmPx = ctx.reach ? ctx.reach / settings.helpers.reachPx : 0,
        cn = mmPx > 0 ? cornerOf(S, rel, c.parts, mmPx) : null,
        al = mmPx > 0 && !c.moves.length ? alignLine(S, rel, c.parts, 20 * mmPx) : null; // (an offer that would move something draws its arrows instead)
      out.push({
        id: c.item.id,
        kind: "constraint",
        relation: rel as Bubble["relation"],
        icon: c.item.icon,
        at: cn ? cn.at : c.standing, // (the bubble stands round its spot, in its corner for a square; what it would move is drawn when it is pointed at, `in_1655`)
        ...(cn ? { corner: cn.corner, onSpot: true } : {}),
        ...(al ? { align: al } : {}),
        tone: "offer",
        title: c.item.title,
        parts: c.parts,
        state: "offer",
        alpha: fresh ? alphaAt(fresh.until, ctx.now) : 1,
        over: sel,
        ...(c.moves.length ? { moves: c.moves } : {}),
      });
    }
  }
  return out;
}

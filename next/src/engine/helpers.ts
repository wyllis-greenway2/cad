// The helpers of drawing, read from the relation table (`dec_helpers_one_rule`, `in_1579`..`in_1583`; no kernel). A helper is a relation that is APPLICABLE and within REACH:
//   applicable: the same question the helper bar asks (`engine/relations.ts`): the relation fits the kinds of parts, and the solver would add it as something new (not already implied by the figure or the sketch, not refused)
//   within reach: the place being drawn nearly satisfies it, with parts already there; `reach.pointPx` if it says a point (two rows), `reach.linePx` if a line; the step is the Newton step on its residuals, so it is in mm whatever the unit of the row
// The free thing is the place `~P`, alone (`point`), or the end of a line from the figure's first place (`line`: `~L`), or the edge of a circle about it (`circle`: `~C`); the first place is a point of the sketch (`startId`) or only a place.
// The nearest acts (a point before a line, then a fixed order); one more, not parallel to it, within reach of that place: the place is where both hold. Everything that holds at the place is reported, to be shown and offered.
import { L, P, S, figureOf, type Free, type Pt } from "./free.ts";
import { candidatesFor, constraintOf, landN, type Cand, type Motion } from "./probe.ts";
import { offerable, standingOf } from "./relations.ts";
import { RELATIONS, residualsOf, type Constraint, type Relation, type System } from "./solver.ts";
export { C, L, P, S, type Free, type Pt } from "./free.ts";
/** how near (px) the pointer must be to a relation that says a point and to one that says a line, how far past its ends a guide runs, and the step it is traced in: the screen's settings (`settings.helpers`), given to each call so this file knows no screen */
export interface Reach {
  pointPx: number;
  linePx: number;
  overPx: number;
  stepPx: number;
}
/** a relation that holds or nearly holds: which parts (the free ones by their `~` names), where it puts the place, and how far it moved it */
export interface Held {
  relation: Relation;
  label: string;
  parts: string[];
  variant?: Partial<Constraint>;
  /** the sketch's own parts it names (the free ones are not): what is lit */ sources: string[];
  /** a relation that says a point, or a line (or a curve) */ says: "point" | "line";
  /** where it puts the place; `moved`: how far (mm) it moved the pointer */ at: Pt;
  moved: number;
  /** the direction of the line of places where it holds, at `at` (unit; null for a point) */ dir: Pt | null;
}
export interface Helped {
  at: Pt;
  /** what acted (the nearest, and the one it crosses) */ acted: Held[];
  /** everything that holds at `at` (acted included) */ holds: Held[];
  /** the dashed line of a helper, as points: along where it holds, from the nearest of its source to the place and 12 px past each end (null: it says a point, or it is the figure's own line) */ guide(
    h: Held,
  ): Pt[] | null;
}

const norm = (v: number[]) => Math.hypot(...v);

/** what the helpers look through (`dec_helpers_one_rule`): the relations to try, how each reads at a place, the whole sketch at a place, where the figure started (if it did), which parts move, and where a relation's dashed line passes (null: it says none) */
interface Fig {
  cands: Cand[];
  rows(c: Cand): (at: Pt) => number[];
  whole(at: Pt): System;
  startAt: Pt | null;
  isFree(id: string): boolean;
  guideShift(c: Cand): Pt | null;
}
/** a figure being drawn: a place alone, a corner, the end of a line, the edge of a circle (`free.ts`) */
function figOfFree(S0: System, f: Free): Fig {
  const fig = figureOf(S0, f);
  return {
    cands: candidatesFor(fig.whole([0, 0]), fig.affected, [], undefined, fig.startId ? [fig.startId] : [S]),
    rows: (c) => fig.rows({ kind: c.relation, parts: c.parts, ...(c.variant ?? {}) }),
    whole: fig.whole,
    startAt: fig.startAt,
    isFree: (id) => fig.affected.has(id) || id === S,
    guideShift: (c) => (c.parts.some((x) => fig.affected.has(x) && x !== P) ? null : [0, 0]),
  };
}
/** a part of the sketch being moved: `ref` is the place that stands for it (the place asked about is where `ref` is moved to); a relation is read with the parts moved by the difference */
function figOfMotion(S: System, m: Motion, ref: Pt): Fig {
  const off = (at: Pt) => [at[0] - ref[0], at[1] - ref[1]];
  return {
    cands: candidatesFor(S, m.affected),
    rows: (c) => {
      const k = constraintOf(c);
      return (at) => residualsOf(m.at(off(at)), k);
    },
    whole: (at) => m.at(off(at)),
    startAt: null,
    isFree: (id) => m.affected.has(id),
    guideShift: (c) => {
      if (c.parts.some((x) => m.affected.has(x) && !S.points.some((p) => p.id === x))) return null; // (a moving line or circle says no dashed line, only its ties)
      const mover = S.points.find((p) => c.parts.includes(p.id) && m.affected.has(p.id));
      return mover ? [mover.x - ref[0], mover.y - ref[1]] : null; // (the dashed line passes through where the moving point is, not through the place that stands for the whole)
    },
  };
}
/** The place the pointer `q` is drawn to, by what acts and what holds there; `mm` is the size of a pixel. */
export function helpersAt(S0: System, f: Free, q: Pt, mm: number, reach: Reach): Helped {
  return helpersWith(S0, figOfFree(S0, f), q, mm, reach);
}
/** the same for a part of the sketch dragged: `q` is where the pointer would put `ref` */
export function helpersForMotion(S: System, m: Motion, ref: Pt, q: Pt, mm: number, reach: Reach): Helped {
  return helpersWith(S, figOfMotion(S, m, ref), q, mm, reach);
}
function helpersWith(S0: System, fig: Fig, q: Pt, mm: number, reach: Reach): Helped {
  const pts = new Map(S0.points.map((p) => [p.id, p] as const)),
    lines = new Map(S0.lines.map((l) => [l.id, l] as const)),
    circles = new Map(S0.circles.map((c) => [c.id, c] as const)),
    startAt = fig.startAt,
    whole = fig.whole;
  const all = fig.cands,
    rowFn = fig.rows;
  const applicable = (c: Cand, at: Pt) => {
    return offerable(
      standingOf(whole(at), { id: "helper", kind: c.relation, parts: c.parts, ...(c.variant ?? {}) }).state,
    );
  };
  const make = (c: Cand, at: Pt, moved: number): Held => {
    const row = rowFn(c),
      r = row(at),
      says: "point" | "line" = r.length === 2 ? "point" : "line",
      h = 1e-5;
    let dir: Pt | null = null;
    if (says === "line") {
      const gx = (row([at[0] + h, at[1]])[0]! - row([at[0] - h, at[1]])[0]!) / (2 * h),
        gy = (row([at[0], at[1] + h])[0]! - row([at[0], at[1] - h])[0]!) / (2 * h),
        n = Math.hypot(gx, gy);
      if (n > 1e-12) dir = [-gy / n, gx / n];
    }
    return {
      relation: c.relation,
      label: RELATIONS[c.relation].label,
      parts: c.parts,
      ...(c.variant ? { variant: c.variant } : {}),
      sources: c.parts.filter((x) => !fig.isFree(x)),
      says,
      at,
      moved,
      dir,
    };
  };
  /** the place where two relations of one row each both hold, from `from` (the least-norm Newton step on both rows together) */
  const crossing = (a: (at: Pt) => number[], b: (at: Pt) => number[], from: Pt): Pt | null => {
    const q = landN((p) => [a([p[0]!, p[1]!])[0]!, b([p[0]!, p[1]!])[0]!], from, Infinity, 10);
    return q ? [q[0]!, q[1]!] : null;
  };
  /** whether a relation says anything about the place: one that is the same wherever the place is (a radius equal to another's, when the thing is only moved) is a fact about the thing, not a hint, and would win at no distance */
  const aboutPlace = (row: (at: Pt) => number[], at: Pt): boolean => {
    const h = 1e-4,
      a = row([at[0] + h, at[1]]),
      b = row([at[0] - h, at[1]]),
      c = row([at[0], at[1] + h]),
      d = row([at[0], at[1] - h]);
    return a.some((v, i) => Math.abs(v - b[i]!) > 1e-9 || Math.abs(c[i]! - d[i]!) > 1e-9);
  };
  /** what is within reach of a place (the nearest root, from the place itself) and that the solver would add */
  const near = (from: Pt, skip: Cand | null): { c: Cand; at: Pt; moved: number }[] => {
    const out: { c: Cand; at: Pt; moved: number }[] = [];
    for (const c of all) {
      if (skip && c === skip) continue;
      const row = rowFn(c),
        n0 = row(from);
      if (n0.length === 0 || !n0.every(Number.isFinite) || !aboutPlace(row, from)) continue;
      const within = (n0.length === 2 ? reach.pointPx : reach.linePx) * mm;
      const q = landN((p) => row([p[0]!, p[1]!]), from, within),
        at: Pt | null = q ? [q[0]!, q[1]!] : null;
      if (!at) continue;
      const moved = Math.hypot(at[0] - from[0], at[1] - from[1]);
      if (moved <= within && applicable(c, at)) out.push({ c, at, moved });
    }
    return out;
  };
  // a figure's own start: not within reach of itself, so a line near its first place takes nothing from it
  const startGap = startAt ? 2 * reach.linePx * mm : 0;
  const usable = (x: { c: Cand }) =>
    !(startGap && x.c.parts.includes(L) && Math.hypot(q[0] - startAt![0], q[1] - startAt![1]) < startGap);
  const found = near(q, null).filter(usable);
  const rank = (a: { c: Cand; moved: number }, b: { c: Cand; moved: number }) =>
    (rowFn(a.c)(q).length === 2 ? 0 : 1) - (rowFn(b.c)(q).length === 2 ? 0 : 1) ||
    a.moved - b.moved ||
    b.c.parts.filter((x) => !fig.isFree(x)).length - a.c.parts.filter((x) => !fig.isFree(x)).length ||
    a.c.order - b.c.order ||
    a.c.parts.join().localeCompare(b.c.parts.join());
  found.sort(rank);
  const acted: Held[] = [];
  let at: Pt = q;
  const first = found[0];
  if (first) {
    at = first.at;
    acted.push(make(first.c, at, first.moved));
    if (acted[0]!.says === "line") {
      const second = near(at, first.c)
        .filter(usable)
        .filter((x) => rowFn(x.c)(at).length === 1)
        .sort(rank)
        .find((x) => {
          const h = make(x.c, x.at, x.moved),
            d1 = acted[0]!.dir,
            d2 = h.dir;
          return !!d1 && !!d2 && Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) > 0.3;
        });
      if (second) {
        const p2 = crossing(rowFn(first.c), rowFn(second.c), at);
        if (p2 && Math.hypot(p2[0] - at[0], p2[1] - at[1]) <= reach.linePx * mm * 2) {
          const m = Math.hypot(p2[0] - q[0], p2[1] - q[1]);
          at = p2;
          acted.length = 0;
          acted.push(make(first.c, at, m), make(second.c, at, m));
        }
      }
    }
  }
  // everything that holds at the place, that the solver would add
  const holds: Held[] = [];
  for (const c of all) {
    const row = rowFn(c),
      r = row(at);
    if (
      r.length &&
      r.every(Number.isFinite) &&
      norm(r) < 1e-7 &&
      aboutPlace(row, at) &&
      usable({ c }) &&
      applicable(c, at)
    )
      holds.push(make(c, at, 0));
  }
  const byHeld = new Map<Held, Cand>();
  for (const h of [...acted, ...holds]) {
    const c = all.find(
      (x) => x.relation === h.relation && x.parts.join() === h.parts.join() && x.variant === h.variant,
    );
    if (c) byHeld.set(h, c);
  }
  const guide = (h: Held): Pt[] | null => {
    const c = byHeld.get(h);
    if (!c || h.says !== "line" || !h.dir) return null;
    const sh = fig.guideShift(c);
    if (!sh) return null;
    const row = rowFn(c),
      src = h.sources[0],
      over = reach.overPx * mm,
      ds = reach.stepPx * mm,
      ha: Pt = [h.at[0] + sh[0], h.at[1] + sh[1]];
    let anchor: Pt = ha;
    if (src) {
      if (pts.has(src)) anchor = [pts.get(src)!.x, pts.get(src)!.y];
      else if (lines.has(src)) {
        const l = lines.get(src)!,
          a = pts.get(l.a)!,
          b = pts.get(l.b)!,
          dx = b.x - a.x,
          dy = b.y - a.y,
          t = Math.max(0, Math.min(1, ((ha[0] - a.x) * dx + (ha[1] - a.y) * dy) / (dx * dx + dy * dy || 1)));
        anchor = [a.x + dx * t, a.y + dy * t];
      } else if (circles.has(src)) {
        const k = circles.get(src)!,
          m = pts.get(k.c)!,
          d = Math.hypot(ha[0] - m.x, ha[1] - m.y) || 1;
        anchor = [m.x + (k.r * (ha[0] - m.x)) / d, m.y + (k.r * (ha[1] - m.y)) / d];
      }
    }
    anchor = [anchor[0] - sh[0], anchor[1] - sh[1]]; // (in the space of the place asked about)
    const span = Math.hypot(anchor[0] - h.at[0], anchor[1] - h.at[1]);
    const walk = (sign: 1 | -1, length: number): Pt[] => {
      const out: Pt[] = [];
      let a: Pt = h.at,
        dir: Pt = [h.dir![0] * sign, h.dir![1] * sign];
      for (let done = 0; done < length - 1e-9;) {
        const step = Math.min(ds, length - done),
          next: Pt = [a[0] + dir[0] * step, a[1] + dir[1] * step],
          fixed = ((q) => (q ? ([q[0]!, q[1]!] as Pt) : null))(landN((p) => row([p[0]!, p[1]!]), next, 1e9, 3)) ?? next;
        const nd: Pt = [fixed[0] - a[0], fixed[1] - a[1]],
          n = Math.hypot(nd[0], nd[1]) || 1;
        dir = [nd[0] / n, nd[1] / n];
        a = fixed;
        out.push(a);
        done += step;
      }
      return out;
    };
    const toward = h.dir[0] * (anchor[0] - h.at[0]) + h.dir[1] * (anchor[1] - h.at[1]) >= 0 ? 1 : -1;
    const near2 = walk(toward, span + over),
      far = walk(toward === 1 ? -1 : 1, over);
    return [...far.reverse(), h.at, ...near2].map((q): Pt => [q[0] + sh[0], q[1] + sh[1]]);
  };
  return { at, acted, holds, guide };
}

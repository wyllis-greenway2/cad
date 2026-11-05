// The table of relations (`dec_relations_standard`, `in_089`, `in_090`, `in_092`): which relations exist for which kinds of selected parts, how each is measured,
// and how each becomes a constraint. Pure logic: no DOM, no three.js. The UI (a menu today, anything later) only asks `relationsFor(picks)` and shows the answer.
//
// Parts (kinds): "corner" (a point), "line" (a segment), "circle". A relation is either geometric (no number) or dimensional (a number: it can be measured, and locked at a value).
// The first part picked is the mover and the second the reference (`in_090`); the order of the parts is kept in `parts`, and a relation that does not care about the order of its
// kinds (a corner and a line) still names its parts in a fixed order inside the constraint, so the same constraint is found again whichever was picked first.
import { dist } from "./sketch.mjs";

export const partKindOf = (pick) => (pick.kind === "point" ? "corner" : pick.kind === "seg" ? "line" : pick.kind === "circle" ? "circle" : null);

const PARALLEL_SIN = 0.02; // two lines count as parallel for a distance when the sine of the angle between them is below this (about 1 degree)

const ends = (model, ref) => (model.segments[ref] ?? []).map((id) => model.points[id]);
/** Signed perpendicular distance of point q from the infinite line through a and b (positive on the left of a to b). */
const side = (a, b, q) => ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
const normalOf = (a, b) => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
};

/**
 * The rows. pair: the kinds of the parts, in the order the relation names them. anyOrder: the same relation for the kinds in either order.
 * make(refs, model, value): the stored constraint. measure(refs, model): the current value (dimensional ones). unavailable(refs, model): null, or why it cannot be set now.
 * spot(refs, model): where a chip for the number goes ({ pos, normal }).
 */
export const ROWS = [
  { id: "horizontal", label: "Horizontal", pair: ["line"], make: (r) => ({ type: "horizontal", seg: r[0] }) },
  { id: "vertical", label: "Vertical", pair: ["line"], make: (r) => ({ type: "vertical", seg: r[0] }) },
  { id: "fixed", label: "Fix in place", pair: ["corner"], make: (r, m) => ({ type: "fixed", p: r[0], at: m.points[r[0]].slice() }) },

  { id: "coincident", label: "Coincident", pair: ["corner", "corner"], make: (r) => ({ type: "coincident", a: r[0], b: r[1] }) },
  { id: "sameHeight", label: "Same height", pair: ["corner", "corner"], make: (r) => ({ type: "horizontal", a: r[0], b: r[1] }) },
  { id: "sameAcross", label: "Same position across", pair: ["corner", "corner"], make: (r) => ({ type: "vertical", a: r[0], b: r[1] }) },
  {
    id: "distance", label: "Distance", pair: ["corner", "corner"], dimensional: true, unit: "mm",
    measure: (r, m) => dist(m.points[r[0]], m.points[r[1]]),
    make: (r, m, v) => ({ type: "distance", a: r[0], b: r[1], d: v }),
    spot: (r, m) => {
      const [p, q] = [m.points[r[0]], m.points[r[1]]];
      return { pos: mid(p, q), normal: normalOf(p, q) };
    },
  },

  { id: "equalLength", label: "Equal length", pair: ["line", "line"], make: (r) => ({ type: "equalLength", seg1: r[0], seg2: r[1] }) },
  { id: "parallel", label: "Parallel", pair: ["line", "line"], make: (r) => ({ type: "parallel", seg1: r[0], seg2: r[1] }) },
  { id: "perpendicular", label: "Perpendicular", pair: ["line", "line"], make: (r) => ({ type: "perpendicular", seg1: r[0], seg2: r[1] }) },
  {
    // the perpendicular gap between two parallel lines (between the infinite lines they lie on); the lines must be parallel already, so they are made parallel first
    id: "distance", label: "Distance", pair: ["line", "line"], dimensional: true, unit: "mm",
    unavailable: (r, m) => {
      const [a, b] = ends(m, r[0]);
      const [c, d] = ends(m, r[1]);
      if (!a || !c) return "a line is missing";
      const u = [(b[0] - a[0]) / (dist(a, b) || 1), (b[1] - a[1]) / (dist(a, b) || 1)];
      const v = [(d[0] - c[0]) / (dist(c, d) || 1), (d[1] - c[1]) / (dist(c, d) || 1)];
      return Math.abs(u[0] * v[1] - u[1] * v[0]) > PARALLEL_SIN ? "the lines are not parallel: make them parallel first" : null;
    },
    measure: (r, m) => {
      const [a, b] = ends(m, r[0]);
      const [c, d] = ends(m, r[1]);
      return Math.abs((side(a, b, c) + side(a, b, d)) / 2);
    },
    make: (r, m, v) => {
      const [s1, s2] = [...r].sort(); // the same constraint whichever line was picked first
      const [a, b] = ends(m, s1);
      const [c, d] = ends(m, s2);
      const sg = (side(a, b, c) + side(a, b, d)) / 2 >= 0 ? 1 : -1; // which side of the first line the second lies on: kept, so the gap does not flip over
      return { type: "lineGap", seg1: s1, seg2: s2, d: v, side: sg };
    },
    spot: (r, m) => {
      const [a, b] = ends(m, r[0]);
      const [c, d] = ends(m, r[1]);
      const p = mid(a, b);
      const q = mid(c, d);
      return { pos: mid(p, q), normal: normalOf(a, b) };
    },
  },

  { id: "equalRadius", label: "Equal radius", pair: ["circle", "circle"], make: (r) => ({ type: "equalRadius", r: r[0], s: r[1] }) },

  {
    // the perpendicular distance from a corner to the infinite line a segment lies on
    id: "distance", label: "Distance", pair: ["corner", "line"], anyOrder: true, dimensional: true, unit: "mm",
    measure: (r, m) => {
      const [a, b] = ends(m, r[1]);
      return Math.abs(side(a, b, m.points[r[0]]));
    },
    make: (r, m, v) => {
      const [a, b] = ends(m, r[1]);
      return { type: "ptLineDist", p: r[0], seg: r[1], d: v, side: side(a, b, m.points[r[0]]) >= 0 ? 1 : -1 };
    },
    spot: (r, m) => {
      const [a, b] = ends(m, r[1]);
      const p = m.points[r[0]];
      const f = side(a, b, p); // the foot of the perpendicular from the corner
      const n = normalOf(a, b);
      const foot = [p[0] - n[0] * f, p[1] - n[1] * f];
      return { pos: mid(p, foot), normal: normalOf(p, foot) };
    },
  },
];

const permutations = (kinds) => (kinds.length === 2 ? [kinds, [kinds[1], kinds[0]]] : [kinds]);
const same = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);

/**
 * The relations that exist for the selected parts, in the order of the table: [{ id, label, dimensional, unit, refs, parts,
 *   unavailable(model) -> reason | null, measure(model) -> number | null, make(model, value?) -> constraint, spot(model) -> { pos, normal } | null }].
 * picks: the selected parts in the order they were picked ({ kind: "point" | "seg" | "circle", ref }); whole shapes ("entity") are not parts and are ignored.
 */
export function relationsFor(picks) {
  const parts = picks.filter((k) => partKindOf(k));
  if (!parts.length) return [];
  const kinds = parts.map(partKindOf);
  const out = [];
  for (const row of ROWS) {
    if (row.pair.length !== parts.length) continue;
    let refs = null;
    if (same(row.pair, kinds)) refs = parts.map((k) => k.ref);
    else if (row.anyOrder && same(row.pair, [...kinds].reverse())) refs = [...parts].reverse().map((k) => k.ref);
    if (!refs) continue;
    out.push({
      id: row.id,
      label: row.label,
      dimensional: !!row.dimensional,
      unit: row.unit ?? null,
      refs,
      parts: parts.map((k) => k.ref),
      unavailable: (model) => row.unavailable?.(refs, model) ?? null,
      measure: (model) => (row.measure ? row.measure(refs, model) : null),
      make: (model, value) => row.make(refs, model, value ?? row.measure?.(refs, model)),
      spot: (model) => row.spot?.(refs, model) ?? null,
    });
  }
  return out;
}

/** The dimensional relation (a number that can be measured and locked) for these parts, if there is one. */
export const dimensionalFor = (picks) => relationsFor(picks).find((r) => r.dimensional) ?? null;

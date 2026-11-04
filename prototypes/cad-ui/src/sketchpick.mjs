// Picking parts of a sketch (corners, lines, circles) and what constraints can be put on a pick. Pure (no DOM, no three.js, no kernel).
import { modelOf } from "./sketchsolve.mjs";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const distToSegment = (p, a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
};

/**
 * The part of a sketch under a point (mm), within tol: a corner or centre ("point"), a line ("seg") or a circle's outline ("circle"), in that order of priority.
 * Returns { kind, ref, shape } or null. (Clicking inside a shape, away from its outline, is handled by the caller.)
 */
export function elementAt(p, entities, tol) {
  const m = modelOf(entities);
  let best = null;
  for (const [ref, q] of Object.entries(m.points)) {
    const d = dist(p, q);
    if (d <= tol && (!best || d < best.d)) best = { kind: "point", ref, d };
  }
  if (best) return { kind: best.kind, ref: best.ref, shape: best.ref.slice(0, best.ref.lastIndexOf(".")) };
  for (const e of entities) {
    if (e.type !== "circle") continue;
    const d = Math.abs(dist(p, [e.cx, e.cy]) - e.r);
    if (d <= tol && (!best || d < best.d)) best = { kind: "circle", ref: `${e.id}.r`, d };
  }
  for (const [ref, [a, b]] of Object.entries(m.segments)) {
    const d = distToSegment(p, m.points[a], m.points[b]);
    if (d <= tol && (!best || d < best.d)) best = { kind: "seg", ref, d };
  }
  return best ? { kind: best.kind, ref: best.ref, shape: best.ref.slice(0, best.ref.lastIndexOf(".")) } : null;
}

/** The constraints that make sense for a set of picks: [{ label, make() -> constraint without an id }]. */
export function offersFor(picks) {
  if (!picks.length) return [];
  const kind = picks[0].kind;
  if (!picks.every((k) => k.kind === kind)) return [];
  const refs = picks.map((k) => k.ref);
  if (kind === "seg") {
    if (picks.length === 1) return [{ label: "Horizontal", make: () => ({ type: "horizontal", seg: refs[0] }) }, { label: "Vertical", make: () => ({ type: "vertical", seg: refs[0] }) }];
    if (picks.length === 2) {
      return [
        { label: "Equal length", make: () => ({ type: "equalLength", seg1: refs[0], seg2: refs[1] }) },
        { label: "Parallel", make: () => ({ type: "parallel", seg1: refs[0], seg2: refs[1] }) },
        { label: "Perpendicular", make: () => ({ type: "perpendicular", seg1: refs[0], seg2: refs[1] }) },
      ];
    }
  }
  if (kind === "point") {
    if (picks.length === 1) return [{ label: "Fix in place", make: (model) => ({ type: "fixed", p: refs[0], at: model.points[refs[0]].slice() }) }];
    if (picks.length === 2) {
      return [
        { label: "Coincident", make: () => ({ type: "coincident", a: refs[0], b: refs[1] }) },
        { label: "Same height", make: () => ({ type: "horizontal", a: refs[0], b: refs[1] }) },
        { label: "Same position across", make: () => ({ type: "vertical", a: refs[0], b: refs[1] }) },
      ];
    }
  }
  if (kind === "circle" && picks.length === 2) return [{ label: "Equal radius", make: () => ({ type: "equalRadius", r: refs[0], s: refs[1] }) }];
  return [];
}

const SYMBOL = { horizontal: "H", vertical: "V", equalLength: "=", equalRadius: "=", parallel: "∥", perpendicular: "⊥", coincident: "●", fixed: "fix" };
const round = (v) => Math.round(v * 100) / 100;

/** Marks to draw for the stored constraints: [{ id, text, pos: [u, v] }] (dimension constraints show their value). */
export function glyphsFor(entities, constraints) {
  const m = modelOf(entities);
  const mid = (seg) => {
    const pair = m.segments[seg];
    return pair ? [(m.points[pair[0]][0] + m.points[pair[1]][0]) / 2, (m.points[pair[0]][1] + m.points[pair[1]][1]) / 2] : null;
  };
  const out = [];
  for (const c of constraints) {
    let pos = null;
    let text = SYMBOL[c.type];
    if (c.seg) pos = mid(c.seg);
    else if (c.seg1) pos = mid(c.seg1);
    else if (c.a && m.points[c.a]) pos = m.points[c.a];
    else if (c.p && m.points[c.p]) pos = m.points[c.p];
    else if (c.r && c.r.endsWith(".r")) {
      const e = entities.find((x) => x.id === c.r.slice(0, -2));
      if (e) pos = [e.cx, e.cy];
    }
    if (c.type === "distance" || c.type === "hdist" || c.type === "vdist") text = `${round(Math.abs(c.d))}`;
    if (c.type === "radius") text = `R${round(c.value)}`;
    if (c.type === "equalRadius") text = "=";
    if (pos && text) out.push({ id: c.id, text, pos, dimension: ["distance", "hdist", "vdist", "radius"].includes(c.type) });
  }
  return out;
}

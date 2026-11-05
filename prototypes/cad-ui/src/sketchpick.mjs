// Picking parts of a sketch (corners, lines, circles) and what constraints can be put on a pick. Pure (no DOM, no three.js, no kernel).
import { relationsFor, dimensionalFor } from "./relations.mjs";
import { modelOf, sharedVertex, angleBetween, lengthOf } from "./sketchsolve.mjs";

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
/** Every corner, circle and line of a sketch within `tol` of a point (not just the nearest): corners first, then circles, then lines, each nearest first. For picking among things that overlap (`in_088`). */
export function elementsAt(p, entities, tol) {
  const m = modelOf(entities);
  const shapeOf = (ref) => ref.slice(0, ref.lastIndexOf("."));
  const out = [];
  for (const [ref, q] of Object.entries(m.points)) {
    const d = dist(p, q);
    if (d <= tol) out.push({ kind: "point", ref, shape: shapeOf(ref), d, rank: 0 });
  }
  for (const e of entities) {
    if (e.type !== "circle") continue;
    const d = Math.abs(dist(p, [e.cx, e.cy]) - e.r);
    if (d <= tol) out.push({ kind: "circle", ref: `${e.id}.r`, shape: e.id, d, rank: 1 });
  }
  for (const [ref, [a, b]] of Object.entries(m.segments)) {
    const d = distToSegment(p, m.points[a], m.points[b]);
    if (d <= tol) out.push({ kind: "seg", ref, shape: shapeOf(ref), d, rank: 2 });
  }
  return out.sort((x, y) => x.rank - y.rank || x.d - y.d).map(({ d, rank, ...el }) => el);
}
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
  return relationsFor(picks).map((r) => ({ label: r.label, relation: r, make: (model) => r.make(model) })); // the table of relations (`relations.mjs`) is the one place that says what exists for which parts
}

const SYMBOL = { angle: "∠", horizontal: "H", vertical: "V", equalLength: "=", equalRadius: "=", parallel: "∥", perpendicular: "⊥", coincident: "●", fixed: "fix" };
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
    if (c.type === "distance" || c.type === "hdist" || c.type === "vdist" || c.type === "ptLineDist" || c.type === "lineGap") text = `${round(Math.abs(c.d))}`;
    if (c.type === "radius") text = `R${round(c.value)}`;
    if (c.type === "angle") text = `∠${round(Math.abs(c.deg))}°`;
    if (c.type === "equalRadius") text = "=";
    if (pos && text) out.push({ id: c.id, text, pos, dimension: ["distance", "hdist", "vdist", "radius"].includes(c.type) });
  }
  return out;
}

/** A chip for a distance (a dimensional relation of the table): its value now and where it goes. */
function distanceChip(rel, m) {
  const value = rel.measure(m);
  const spot = rel.spot(m);
  return { kind: "distance", value, text: String(round(value)), pos: spot.pos, normal: spot.normal, rel };
}

/**
 * The value that can be typed for the current picks, shown at the pick: one line = its length, one circle = its radius, two lines that share a corner = the angle between them.
 * Returns { kind: "length" | "radius" | "angle", text, value, pos: [u, v], segs?, circle? } or null.
 */
export function valueFor(picks, entities) {
  const m = modelOf(entities);
  const live = picks.filter((k) => k.kind !== "entity");
  if (live.length === 1 && live[0].kind === "seg") {
    const pair = m.segments[live[0].ref];
    if (!pair) return null;
    const a = m.points[pair[0]];
    const b = m.points[pair[1]];
    const len = lengthOf(entities, live[0].ref);
    const nx = -(b[1] - a[1]) / (len || 1);
    const ny = (b[0] - a[0]) / (len || 1);
    return { kind: "length", value: len, text: String(round(len)), pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], normal: [nx, ny], segs: [live[0].ref] };
  }
  if (live.length === 1 && live[0].kind === "circle") {
    const e = entities.find((x) => x.id === live[0].shape);
    return e ? { kind: "radius", value: e.r, text: String(round(e.r)), pos: [e.cx, e.cy], normal: [0, 0], circle: e.id } : null;
  }
  if (live.length === 2 && live.every((k) => k.kind === "seg") && sharedVertex(m, live[0].ref, live[1].ref) === null) {
    // two lines that do not meet: the gap between them, when they are parallel
    const rel = dimensionalFor(live);
    if (rel && !rel.unavailable(m)) return distanceChip(rel, m);
    return null;
  }
  if (live.length === 2 && live.some((k) => k.kind === "point")) {
    const rel = dimensionalFor(live); // two corners, or a corner and a line: the distance
    return rel ? distanceChip(rel, m) : null;
  }
  if (live.length === 2 && live.every((k) => k.kind === "seg")) {
    const sh = sharedVertex(m, live[0].ref, live[1].ref);
    if (!sh) return null;
    const ang = Math.abs(angleBetween(entities, live[0].ref, live[1].ref));
    const v = m.points[sh.v];
    const p = m.points[sh.p];
    const q = m.points[sh.q];
    const bis = [(p[0] - v[0]) / (Math.hypot(p[0] - v[0], p[1] - v[1]) || 1) + (q[0] - v[0]) / (Math.hypot(q[0] - v[0], q[1] - v[1]) || 1), (p[1] - v[1]) / (Math.hypot(p[0] - v[0], p[1] - v[1]) || 1) + (q[1] - v[1]) / (Math.hypot(q[0] - v[0], q[1] - v[1]) || 1)];
    return { kind: "angle", value: ang, text: `${round(ang)}°`, pos: v, normal: bis, segs: [live[0].ref, live[1].ref] };
  }
  return null;
}

// Connects the sketch shapes (rectangles, circles, polylines) to the constraint solver. Pure (no DOM, no three.js, no kernel).
//
// Element ids used by constraints (id = a shape's id, e.g. "e_001"):
//   rectangle: points "e_001.a" (x0, y0), ".b" (x1, y0), ".c" (x1, y1), ".d" (x0, y1); segments ".s0" a-b, ".s1" b-c, ".s2" c-d, ".s3" d-a
//   circle:    point ".c" (centre), value ".r" (radius)
//   polyline:  points ".p0" .. ".pN", segments ".s0" p0-p1 ... (a closed one also has the last point back to p0)
// A rectangle stays a rectangle because it carries built-in horizontal and vertical constraints.
import { solve } from "./solver/solver.mjs";

const ELEM = /^(.+?)\.(\w+)$/;

/** The points, values, segments and built-in constraints of a list of shapes. */
export function modelOf(entities) {
  const points = {};
  const scalars = {};
  const segments = {}; // "e.s0" -> ["e.a", "e.b"]
  const builtin = [];
  for (const e of entities) {
    if (e.type === "rect") {
      const P = { a: [e.x0, e.y0], b: [e.x1, e.y0], c: [e.x1, e.y1], d: [e.x0, e.y1] };
      for (const [k, v] of Object.entries(P)) points[`${e.id}.${k}`] = v;
      [["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"]].forEach(([p, q], i) => (segments[`${e.id}.s${i}`] = [`${e.id}.${p}`, `${e.id}.${q}`]));
      builtin.push(
        { id: `${e.id}~h1`, type: "horizontal", a: `${e.id}.a`, b: `${e.id}.b` }, { id: `${e.id}~v1`, type: "vertical", a: `${e.id}.b`, b: `${e.id}.c` },
        { id: `${e.id}~h2`, type: "horizontal", a: `${e.id}.d`, b: `${e.id}.c` }, { id: `${e.id}~v2`, type: "vertical", a: `${e.id}.a`, b: `${e.id}.d` },
      );
    } else if (e.type === "circle") {
      points[`${e.id}.c`] = [e.cx, e.cy];
      scalars[`${e.id}.r`] = e.r;
    } else if (e.type === "poly") {
      e.points.forEach((p, i) => (points[`${e.id}.p${i}`] = [p[0], p[1]]));
      const n = e.points.length;
      for (let i = 0; i < (e.closed ? n : n - 1); i++) segments[`${e.id}.s${i}`] = [`${e.id}.p${i}`, `${e.id}.p${(i + 1) % n}`];
    }
  }
  return { points, scalars, segments, builtin };
}

/** A stored constraint in the solver's terms (segments become pairs of points). Returns null if something it refers to is gone. */
export function expand(c, model) {
  const seg = (ref) => model.segments[ref];
  const hasP = (id) => id in model.points;
  const hasS = (id) => id in model.scalars;
  switch (c.type) {
    case "horizontal":
    case "vertical":
    case "distance":
    case "hdist":
    case "vdist": {
      const pair = c.seg ? seg(c.seg) : [c.a, c.b];
      if (!pair || !hasP(pair[0]) || !hasP(pair[1])) return null;
      return { id: c.id, type: c.type, a: pair[0], b: pair[1], ...(c.d !== undefined ? { d: c.d } : {}) };
    }
    case "equalLength":
    case "parallel":
    case "perpendicular": {
      const s1 = seg(c.seg1);
      const s2 = seg(c.seg2);
      if (!s1 || !s2) return null;
      return { id: c.id, type: c.type, a: s1[0], b: s1[1], c: s2[0], d: s2[1] };
    }
    case "coincident": return hasP(c.a) && hasP(c.b) ? { id: c.id, type: "coincident", a: c.a, b: c.b } : null;
    case "fixed": return hasP(c.p) ? { id: c.id, type: "fixed", p: c.p, at: c.at } : null;
    case "radius": return hasS(c.r) ? { id: c.id, type: "radius", r: c.r, value: c.value } : null;
    case "equalRadius": return hasS(c.r) && hasS(c.s) ? { id: c.id, type: "equalRadius", r: c.r, s: c.s } : null;
    default: return null;
  }
}

/** The shapes after the solver's numbers are put back. */
export function applySolution(entities, sol) {
  return entities.map((e) => {
    if (e.type === "rect") {
      const a = sol.points[`${e.id}.a`];
      const c = sol.points[`${e.id}.c`];
      return { ...e, x0: a[0], y0: a[1], x1: c[0], y1: c[1] };
    }
    if (e.type === "circle") {
      const c = sol.points[`${e.id}.c`];
      return { ...e, cx: c[0], cy: c[1], r: sol.scalars[`${e.id}.r`] };
    }
    if (e.type === "poly") return { ...e, points: e.points.map((_, i) => sol.points[`${e.id}.p${i}`].slice()) };
    return e;
  });
}

const r6 = (v) => Math.round(v * 1e6) / 1e6 + 0; // + 0 turns -0 into 0
const roundEntity = (e) => {
  const o = { ...e };
  for (const k of ["x0", "y0", "x1", "y1", "cx", "cy", "r"]) if (typeof o[k] === "number") o[k] = r6(o[k]);
  if (o.points) o.points = o.points.map((p) => p.map(r6));
  return o;
};

/**
 * Solve a sketch: shapes + stored constraints (+ soft preferences: [{ p, at, w }] keep or pull a point).
 * Returns { status, entities (solved; the originals if conflict), dof, redundant, conflicts, dropped (constraints whose shapes are gone) }.
 */
export function solveSketch(entities, constraints, soft = []) {
  const model = modelOf(entities);
  const dropped = [];
  const stored = [];
  for (const c of constraints) {
    const x = expand(c, model);
    if (x) stored.push(x);
    else dropped.push(c.id);
  }
  // soft preferences: keep or pull a point ({ p, at, w }) or a radius ({ r, value, w })
  const prefs = soft
    .filter((s) => (s.p ? s.p in model.points : s.r in model.scalars))
    .map((s, i) => (s.p ? { id: `soft${i}`, type: "fixed", p: s.p, at: s.at, w: s.w ?? 0.1 } : { id: `soft${i}`, type: "radius", r: s.r, value: s.value, w: s.w ?? 0.1 }));
  const result = solve({ points: model.points, scalars: model.scalars }, [...model.builtin, ...stored, ...prefs]);
  const ids = (list) => list.filter((id) => !id.includes("~") && !id.startsWith("soft"));
  if (result.status !== "ok") return { status: "conflict", entities, dof: null, redundant: [], conflicts: ids(result.conflicts), dropped };
  return { status: "ok", entities: applySolution(entities, result).map(roundEntity), dof: result.dof, redundant: ids(result.redundant), conflicts: [], dropped };
}

/** Every element reference (point, segment or value id) a stored constraint mentions. */
export function refsOf(c) {
  return ["a", "b", "p", "r", "s", "seg", "seg1", "seg2"].map((k) => c[k]).filter((v) => typeof v === "string");
}
/** The shape a reference belongs to ("e_001.s0" -> "e_001"). */
export const shapeOfRef = (ref) => ref.slice(0, ref.lastIndexOf("."));

/** The constraint that a typed dimension means: key as in dimensions.mjs ("w", "h", "d", "s<i>"), value in mm. Null if it does not apply. */
export function dimensionConstraint(e, key, value) {
  if (e.type === "rect") {
    if (key === "w") return { type: "hdist", a: `${e.id}.a`, b: `${e.id}.b`, d: (e.x1 >= e.x0 ? 1 : -1) * value };
    if (key === "h") return { type: "vdist", a: `${e.id}.b`, b: `${e.id}.c`, d: (e.y1 >= e.y0 ? 1 : -1) * value };
  } else if (e.type === "circle" && key === "d") return { type: "radius", r: `${e.id}.r`, value: value / 2 };
  else if (e.type === "poly" && /^s\d+$/.test(key)) return { type: "distance", seg: `${e.id}.${key}`, d: value };
  return null;
}
/** Do these two describe the same dimension (same kind, same elements), whatever their values? */
export const sameDimension = (c, spec) => !!spec && c.type === spec.type && ["a", "b", "r", "seg"].every((k) => c[k] === spec[k]);
/** The points to keep roughly in place while a shape is resized: its first corner, its centre, or the start of the segment. */
export function anchorsOf(e, key) {
  if (e.type === "rect") return [{ p: `${e.id}.a`, at: [e.x0, e.y0], w: 0.5 }];
  if (e.type === "circle") return [{ p: `${e.id}.c`, at: [e.cx, e.cy], w: 0.5 }];
  if (e.type === "poly" && /^s\d+$/.test(key)) {
    const i = Number(key.slice(1));
    return [{ p: `${e.id}.p${i}`, at: e.points[i].slice(), w: 0.5 }];
  }
  return [];
}

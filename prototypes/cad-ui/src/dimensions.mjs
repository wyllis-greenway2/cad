// Dimensions of sketch shapes: what to show, and how typing a new number reshapes the shape. Pure (no DOM, no three.js).
// There is no constraint solver yet (q_constraint_solver is open): a dimension here is a direct edit, not a stored constraint.
// Anchors that stay put: a rectangle keeps its first corner (it grows toward where it already pointed), a circle keeps its
// centre, a polyline segment keeps its start point (an open polyline moves everything after it along, a closed one moves
// only the end vertex of that segment).
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * The dimensions of one entity, for display and hit-testing.
 * off = distance (mm) the dimension line sits away from the shape. Each item:
 * { key, label, value, a, b (dimension line ends), ext (extension lines [[from,to]...]), pos (label centre) }
 */
export function dimensionsOf(e, off) {
  const out = [];
  if (e.type === "rect") {
    const x0 = Math.min(e.x0, e.x1), x1 = Math.max(e.x0, e.x1), y0 = Math.min(e.y0, e.y1), y1 = Math.max(e.y0, e.y1);
    const yl = y0 - off;
    out.push({ key: "w", label: "W", value: x1 - x0, a: [x0, yl], b: [x1, yl], ext: [[[x0, y0], [x0, yl]], [[x1, y0], [x1, yl]]], pos: [(x0 + x1) / 2, yl] });
    const xl = x1 + off;
    out.push({ key: "h", label: "H", value: y1 - y0, a: [xl, y0], b: [xl, y1], ext: [[[x1, y0], [xl, y0]], [[x1, y1], [xl, y1]]], pos: [xl, (y0 + y1) / 2] });
  } else if (e.type === "circle") {
    out.push({ key: "d", label: "Ø", value: e.r * 2, a: [e.cx - e.r, e.cy], b: [e.cx + e.r, e.cy], ext: [], pos: [e.cx, e.cy] });
  } else if (e.type === "poly") {
    const n = e.points.length;
    const last = e.closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p = e.points[i];
      const q = e.points[(i + 1) % n];
      const len = dist(p, q);
      if (len < 1e-9) continue;
      const nx = (-(q[1] - p[1]) / len) * off;
      const ny = ((q[0] - p[0]) / len) * off;
      const a = [p[0] + nx, p[1] + ny];
      const b = [q[0] + nx, q[1] + ny];
      out.push({ key: `s${i}`, label: "L", value: len, a, b, ext: [[p, a], [q, b]], pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
    }
  }
  return out;
}

/** The entity after setting one dimension to `value` (mm), or null if that is not possible. */
export function applyDimension(e, key, value) {
  if (!Number.isFinite(value) || !(value > 1e-9)) return null;
  if (e.type === "rect") {
    const sx = e.x1 >= e.x0 ? 1 : -1;
    const sy = e.y1 >= e.y0 ? 1 : -1;
    if (key === "w") return { ...e, x1: r6(e.x0 + sx * value) };
    if (key === "h") return { ...e, y1: r6(e.y0 + sy * value) };
  } else if (e.type === "circle") {
    if (key === "d") return { ...e, r: r6(value / 2) };
  } else if (e.type === "poly" && /^s\d+$/.test(key)) {
    const i = Number(key.slice(1));
    const n = e.points.length;
    const j = (i + 1) % n;
    if (i >= n || (!e.closed && i >= n - 1)) return null;
    const p = e.points[i];
    const q = e.points[j];
    const len = dist(p, q);
    if (len < 1e-9) return null;
    const nq = [r6(p[0] + ((q[0] - p[0]) / len) * value), r6(p[1] + ((q[1] - p[1]) / len) * value)];
    const dx = nq[0] - q[0];
    const dy = nq[1] - q[1];
    const points = e.points.map((pt, k) => {
      if (k === j) return nq;
      if (!e.closed && k > j) return [r6(pt[0] + dx), r6(pt[1] + dy)]; // an open chain moves along rigidly
      return pt.slice();
    });
    return { ...e, points };
  }
  return null;
}

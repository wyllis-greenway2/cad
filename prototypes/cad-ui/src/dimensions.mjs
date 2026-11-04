// Dimensions of sketch shapes: what to show, and how typing a new number reshapes the shape. Pure (no DOM, no three.js).
// What to show for a shape's dimensions (the numbers and where their lines go). Typing a new number does not edit the shape directly: it becomes a stored
// constraint (sketchsolve.dimensionConstraint) and the solver moves the sketch the least it can (dec_constraint_solver_small).
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

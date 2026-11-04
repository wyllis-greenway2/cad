// Pure sketch geometry: no DOM, no three.js, no OCCT (inv_math_pure, inv_layer_adjacency).
// Entities: { id, type: "rect", x0, y0, x1, y1 } | { id, type: "circle", cx, cy, r } | { id, type: "poly", points, closed }

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const roundTo = (v, step) => (step > 0 ? Number((Math.round(v / step) * step).toFixed(6)) : v);

/** Points that snapping can lock onto, each with a kind. */
export function entityPoints(e) {
  const out = [];
  if (e.type === "rect") {
    const { x0, y0, x1, y1 } = e;
    const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    c.forEach((p) => out.push({ p, kind: "endpoint" }));
    c.forEach((p, i) => out.push({ p: [(p[0] + c[(i + 1) % 4][0]) / 2, (p[1] + c[(i + 1) % 4][1]) / 2], kind: "midpoint" }));
    out.push({ p: [(x0 + x1) / 2, (y0 + y1) / 2], kind: "center" });
  } else if (e.type === "circle") {
    out.push({ p: [e.cx, e.cy], kind: "center" });
    [[e.r, 0], [-e.r, 0], [0, e.r], [0, -e.r]].forEach(([dx, dy]) => out.push({ p: [e.cx + dx, e.cy + dy], kind: "quadrant" }));
  } else if (e.type === "poly") {
    const n = e.points.length;
    e.points.forEach((p) => out.push({ p, kind: "endpoint" }));
    const last = e.closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = e.points[i];
      const b = e.points[(i + 1) % n];
      out.push({ p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], kind: "midpoint" });
    }
  }
  return out;
}

/**
 * Snap a raw cursor position (model mm).
 * ctx: { entities, extra: [[x,y]] (in-progress points), anchor: [x,y]|null, scale: px per mm, settings, disabled }
 * Returns { point, kind: origin|endpoint|midpoint|center|quadrant|inference|grid|free, guides: [{axis:"v"|"h", value, from}] }
 */
export function snap(raw, ctx) {
  const s = ctx.settings.snap;
  const rnd = (p) => [roundTo(p[0], s.roundMm), roundTo(p[1], s.roundMm)];
  if (ctx.disabled || !s.enabled) return { point: rnd(raw), kind: "free", guides: [] };
  const th = s.thresholdPx / ctx.scale;
  const cands = [{ p: [0, 0], kind: "origin" }];
  for (const e of ctx.entities) cands.push(...entityPoints(e));
  for (const p of ctx.extra ?? []) cands.push({ p, kind: "endpoint" });

  let best = null;
  for (const c of cands) {
    const d = dist(raw, c.p);
    if (d <= th && (!best || d < best.d)) best = { ...c, d };
  }
  if (best) return { point: best.p.slice(), kind: best.kind, guides: [] };

  if (s.inference) {
    const refs = cands.map((c) => c.p);
    if (ctx.anchor) refs.push(ctx.anchor);
    let bx = null;
    let by = null;
    for (const p of refs) {
      const dx = Math.abs(raw[0] - p[0]);
      const dy = Math.abs(raw[1] - p[1]);
      if (dx <= th && (!bx || dx < bx.d)) bx = { d: dx, p };
      if (dy <= th && (!by || dy < by.d)) by = { d: dy, p };
    }
    if (bx || by) {
      const point = rnd(raw);
      const guides = [];
      if (bx) (point[0] = bx.p[0]), guides.push({ axis: "v", value: bx.p[0], from: bx.p });
      if (by) (point[1] = by.p[1]), guides.push({ axis: "h", value: by.p[1], from: by.p });
      return { point, kind: "inference", guides };
    }
  }
  if (s.gridEnabled) {
    const g = s.gridStepMm;
    return { point: [roundTo(raw[0], g), roundTo(raw[1], g)], kind: "grid", guides: [] };
  }
  return { point: rnd(raw), kind: "free", guides: [] };
}

const polygonArea = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};
const polygonCentroid = (pts) => {
  const A = polygonArea(pts);
  if (Math.abs(A) < 1e-12) return [pts[0][0], pts[0][1]];
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * A), cy / (6 * A)];
};
export const circlePolygon = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);

function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Closed regions in a sketch (rectangles, circles, closed polylines): what the user can extrude. */
export function regionsOf(entities, circleSegments = 64) {
  const out = [];
  for (const e of entities) {
    if (e.type === "rect") {
      const x0 = Math.min(e.x0, e.x1), x1 = Math.max(e.x0, e.x1), y0 = Math.min(e.y0, e.y1), y1 = Math.max(e.y0, e.y1);
      if (x1 - x0 < 1e-9 || y1 - y0 < 1e-9) continue;
      out.push({ id: e.id, kind: "rect", entity: e, area: (x1 - x0) * (y1 - y0), centroid: [(x0 + x1) / 2, (y0 + y1) / 2], polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], w: x1 - x0, d: y1 - y0 });
    } else if (e.type === "circle") {
      if (e.r < 1e-9) continue;
      out.push({ id: e.id, kind: "circle", entity: e, area: Math.PI * e.r * e.r, centroid: [e.cx, e.cy], polygon: circlePolygon(e.cx, e.cy, e.r, circleSegments), r: e.r });
    } else if (e.type === "poly" && e.closed && e.points.length >= 3) {
      const area = Math.abs(polygonArea(e.points));
      if (area < 1e-9) continue;
      out.push({ id: e.id, kind: "poly", entity: e, area, centroid: polygonCentroid(e.points), polygon: e.points });
    }
  }
  return out;
}

export function regionContains(region, p) {
  if (region.kind === "circle") return dist(p, region.centroid) <= region.r;
  return pointInPolygon(p, region.polygon);
}

/** Smallest region under the point (so a circle drawn inside a rectangle is pickable). */
export function hitRegion(p, regions) {
  let best = null;
  for (const r of regions) if (regionContains(r, p) && (!best || r.area < best.area)) best = r;
  return best;
}

/** Operation-graph sketch op for a region, on the XY plane at height z. Numbers are rounded to 1e-6 mm. */
export function regionToSketchOp(region, id, z, plane = "XY") {
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  const base = { id, type: "sketch", plane, origin: r6(z) };
  if (region.kind === "rect") return { ...base, shape: "rect", w: r6(region.w), d: r6(region.d), at: region.centroid.map(r6) };
  if (region.kind === "circle") return { ...base, shape: "circle", radius: r6(region.r), at: region.centroid.map(r6) };
  return { ...base, shape: "polygon", points: region.polygon.map((p) => p.map(r6)) };
}

/**
 * Closest point on a vertical line (through x,y) to a camera ray, as a z value.
 * ray: {o:[x,y,z], v:[x,y,z] (unit)}. Returns null if the ray is parallel to the line.
 */
export function zOnVerticalLineFromRay(ray, x, y) {
  const [ox, oy, oz] = ray.o;
  const [vx, vy, vz] = ray.v;
  const b = vz; // u = (0,0,1)
  const denom = 1 - b * b;
  if (denom < 1e-9) return null;
  const w0 = [x - ox, y - oy, -oz]; // P0 - O with P0 = (x, y, 0)
  const d = w0[2]; // u . w0
  const e = vx * w0[0] + vy * w0[1] + vz * w0[2]; // v . w0
  return (b * e - d) / denom;
}

/**
 * The parameter t of the point p0 + t*n (n a unit vector) on a line that is closest to a camera ray {o, v (unit)}.
 * Null if the ray is parallel to the line. Used to turn a mouse position into a distance along a plane's normal.
 */
export function paramOnAxisFromRay(ray, p0, n) {
  const w = [p0[0] - ray.o[0], p0[1] - ray.o[1], p0[2] - ray.o[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const b = dot(ray.v, n);
  const denom = 1 - b * b;
  if (denom < 1e-9) return null;
  return (b * dot(ray.v, w) - dot(n, w)) / denom;
}

const distToSegment = (p, a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
};

/** The entity under a point: nearest outline within tol (mm), else the smallest closed shape containing it. */
export function hitEntity(p, entities, tol) {
  let best = null;
  for (const e of entities) {
    let d = Infinity;
    if (e.type === "rect") {
      const c = [[e.x0, e.y0], [e.x1, e.y0], [e.x1, e.y1], [e.x0, e.y1]];
      for (let i = 0; i < 4; i++) d = Math.min(d, distToSegment(p, c[i], c[(i + 1) % 4]));
    } else if (e.type === "circle") d = Math.abs(dist(p, [e.cx, e.cy]) - e.r);
    else if (e.type === "poly") {
      const n = e.points.length;
      for (let i = 0; i < (e.closed ? n : n - 1); i++) d = Math.min(d, distToSegment(p, e.points[i], e.points[(i + 1) % n]));
    }
    if (d <= tol && (!best || d < best.d)) best = { e, d };
  }
  if (best) return best.e;
  const inside = regionsOf(entities);
  const hit = hitRegion(p, inside);
  return hit ? hit.entity : null;
}

// Prototype (thrown away, `in_761`): a tooth flank as ONE B-spline against a chain of arcs, for a spur gear: accuracy, faces, kernel time, mesh size.
// Run (from app/): node ../prototypes/gear-spline-flank/flank.mjs   (Z=20,40,100 teeth by env Z, e.g. Z=40)
import { makeThreePointArc, makeLine, makeBSplineApproximation, assembleWire, makeFace, basicFaceExtrusion, makeCylinder, measureVolume, Vector, makeCircle } from "../../app/node_modules/replicad/dist/replicad.js";
import { init } from "../../app/src/compiler/kernel/occt/evaluate.mjs";
await init();
const m = 2, alpha = (20 * Math.PI) / 180, W = 8, bore = 5;
const inv = (a) => Math.tan(a) - a;
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a), 0];
const ms = (f) => { const t0 = performance.now(); const v = f(); return [v, performance.now() - t0]; };

function gearMaker(z) {
  const rp = (m * z) / 2, rb = rp * Math.cos(alpha), ra = rp + m, rf = rp - 1.25 * m, r0 = Math.max(rb, rf), P = (2 * Math.PI) / z;
  const half0 = Math.PI / (2 * z); // half the tooth at the pitch circle, as an angle (no backlash, no shift)
  const half = (r) => half0 + inv(alpha) - inv(Math.acos(Math.min(1, rb / r)));
  const at = (r, centre, side) => polar(r, centre + side * half(r));
  const tOf = (r) => Math.sqrt(Math.max(0, (r / rb) ** 2 - 1));
  const rOf = (t) => rb * Math.sqrt(1 + t * t);
  // a flank from r0 to ra as points spaced evenly in the roll of the involute
  const pts = (centre, side, n) => Array.from({ length: n + 1 }, (_, j) => at(rOf(tOf(r0) + ((tOf(ra) - tOf(r0)) * j) / n), centre, side));
  const mids = (centre, side, n) => Array.from({ length: n }, (_, j) => at(rOf(tOf(r0) + ((tOf(ra) - tOf(r0)) * (j + 0.5)) / n), centre, side));
  /** the edges of the whole outline, counter-clockwise, the flanks as `arcs` arcs or one spline through `through` points */
  function outline(kind, n, tol = 1e-5, degMax = 5) {
    const edges = [];
    for (let k = 0; k < z; k++) {
      const c = k * P;
      const cw = pts(c, -1, kind === "arcs" ? n : n - 1), ccw = pts(c, 1, kind === "arcs" ? n : n - 1);
      const flank = (p, mid) => kind === "arcs" ? p.slice(1).map((q, j) => makeThreePointArc(p[j], mid[j], q)) : [makeBSplineApproximation(p, { tolerance: tol, degMin: 3, degMax, smoothing: null })];
      // foot (radial), flank up the cw side, tip arc, flank down the ccw side, foot, root arc to the next tooth
      if (rf < r0 - 1e-9) edges.push(makeLine(polar(rf, c - half(r0)), cw[0]));
      const up = flank(cw, kind === "arcs" ? mids(c, -1, n) : null);
      edges.push(...up);
      edges.push(makeThreePointArc(cw[cw.length - 1], polar(ra, c), ccw[ccw.length - 1]));
      const down = flank(ccw.slice().reverse(), kind === "arcs" ? mids(c, 1, n).reverse() : null);
      edges.push(...down);
      if (rf < r0 - 1e-9) edges.push(makeLine(ccw[0], polar(rf, c + half(r0))));
      edges.push(makeThreePointArc(polar(rf, c + (rf < r0 ? half(r0) : half(rf))), polar(rf, c + P / 2), polar(rf, c + P - (rf < r0 ? half(r0) : half(rf)))));
    }
    return edges;
  }
  return { rp, ra, rf, rb, r0, half, tOf, rOf, outline, at };
}

/** the exact outline as a dense polygon (for the area) and the largest distance of a sample of an edge from the true involute (mm, along the circle) */
function exactArea(g, z, dense = 400) {
  const P = (2 * Math.PI) / z, poly = [];
  for (let k = 0; k < z; k++) {
    const c = k * P;
    if (g.rf < g.r0) poly.push(polar(g.rf, c - g.half(g.r0)));
    for (let j = 0; j <= dense; j++) poly.push(g.at(g.rOf(g.tOf(g.r0) + ((g.tOf(g.ra) - g.tOf(g.r0)) * j) / dense), c, -1));
    for (let j = 0; j <= 6; j++) poly.push(polar(g.ra, c + g.half(g.ra) * (1 - (2 * j) / 6)));
    for (let j = dense; j >= 0; j--) poly.push(g.at(g.rOf(g.tOf(g.r0) + ((g.tOf(g.ra) - g.tOf(g.r0)) * j) / dense), c, 1));
    if (g.rf < g.r0) poly.push(polar(g.rf, c + g.half(g.r0)));
    const s = g.rf < g.r0 ? g.half(g.r0) : g.half(g.rf);
    for (let j = 0; j <= 8; j++) poly.push(polar(g.rf, c + s + ((P - 2 * s) * j) / 8));
  }
  return Math.abs(poly.reduce((t, p, i) => { const q = poly[(i + 1) % poly.length]; return t + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0));
}
function deviation(g, edges, z) {
  // every sample point of an edge whose radius is between r0 and ra: how far (mm along the circle) it is from the true flank of the tooth it belongs to
  let worst = 0;
  const P = (2 * Math.PI) / z;
  for (const e of edges) for (let i = 0; i <= 20; i++) {
    const p = e.pointAt(i / 20), r = Math.hypot(p.x, p.y);
    if (r < g.r0 + 1e-6 || r > g.ra - 1e-6 || Math.abs(r - g.rf) < 1e-6) continue;
    const a = Math.atan2(p.y, p.x);
    const k = Math.round(a / P), d0 = a - k * P; // the angle from the nearest tooth's middle
    worst = Math.max(worst, Math.abs(Math.abs(d0) - g.half(r)) * r);
  }
  return worst;
}

const rows = [];
for (const z of (process.env.Z ?? "40").split(",").map(Number)) {
  const g = gearMaker(z);
  const area = exactArea(g, z) - (Math.PI * (bore / 2) ** 2);
  for (const [kind, n, tol, deg] of [["arcs", 2], ["arcs", 4], ["arcs", 8], ["spline", 6, 1e-5, 5], ["spline", 6, 1e-3, 3], ["spline", 8, 1e-3, 3], ["spline", 12, 1e-3, 3], ["spline", 12, 1e-4, 3]]) {
    const row = { z, flank: kind === "arcs" ? `${n} arcs` : `spline, ${n} points, tol ${tol}, deg ${deg}` };
    const [edges, tEdges] = ms(() => g.outline(kind, n, tol, deg));
    row.edges = edges.length;
    row.dev = deviation(g, edges, z);
    try {
      const [wire, tWire] = ms(() => assembleWire(edges));
      const [solid, tSolid] = ms(() => { const face = makeFace(wire, [assembleWire([makeCircle(bore / 2)])]); return basicFaceExtrusion(face, new Vector([0, 0, W])); });
      row.build = tEdges + tWire + tSolid;
      row.faces = solid.faces.length;
      row.vol = measureVolume(solid);
      row.volErr = row.vol / W - area;
      const [, tMesh] = ms(() => { const me = solid.mesh({ tolerance: 0.01, angularTolerance: 0.1 }); row.tris = me.triangles.length / 3; });
      row.mesh = tMesh;
      // a meshing neighbour: the same gear turned half a pitch at the centre distance; how long the kernel takes to cut one from the other, and the overlap (should be near 0)
      const other = solid.clone().rotate((180 / z), [0, 0, 0], [0, 0, 1]).translate([2 * g.rp, 0, 0]);
      const [ov, tCut] = ms(() => { try { return measureVolume(solid.clone().intersect(other.clone())); } catch (e) { return NaN; } });
      row.cut = tCut; row.overlap = ov;
      // a cylinder of the bore cut away again and the gear cut by a plane (the usual later operations)
      const [, tHole] = ms(() => solid.clone().cut(makeCylinder(1.5, 3, [g.rp, 0, -1], [0, 0, 1])));
      row.hole = tHole;
    } catch (e) { row.error = String(e.message ?? e).slice(0, 80); }
    rows.push(row);
    console.log(JSON.stringify(row, (k, v) => (typeof v === "number" ? Math.round(v * 1e4) / 1e4 : v)));
  }
}

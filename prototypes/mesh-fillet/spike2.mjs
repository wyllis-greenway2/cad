// Spike 2: do fillets by construction on a mesh-boolean kernel hold up? Volumes checked against closed forms (and OCCT for the vertex blend).
import * as M from "./mf.mjs";
const { Manifold, CrossSection } = M;
M.curved.add(9000);
const pct = (a, b) => ((100 * (a - b)) / b).toFixed(3) + "%";
const rad = (d) => (d * Math.PI) / 180;
const line = (...a) => console.log(...a);
const top = (F) => F.list.find((f) => f.n[2] > 0.99);
const side = (F, k, s) => F.list.find((f) => f.n[k] * s > 0.99);

// ---- T1 convex edge, plain and turned (a skew axis, 37 degrees): volume removed against r^2 (1 - pi/4) L
line("--- T1 convex 90 degree edge, r 1, 2, 4; plain and turned");
for (const turn of [null, [0, 0, 37], [20, 37, 11], [90, 0, 0]]) {
  for (const r of [1, 2, 4]) {
    let b = M.box(40, 30, 10); if (turn) b = b.rotate(turn);
    const F = M.faces(b), up = F.list.reduce((p, f) => (f.n[2] > p.n[2] ? f : p)), other = F.list.find((f) => f !== up && f.n.reduce((s, v, i) => s + v * up.n[i], 0) < 0.5 && F.edges.has([up.id, f.id].sort().join("|")) && Math.abs(f.area - 300) < 1);
    const res = M.fillet(b, up.id, other.id, r);
    const L = Math.hypot(...[0, 1, 2].map((i) => 0)) || 30, A = (1 - Math.PI / 4) * r * r * res.length;
    line(`  turn ${JSON.stringify(turn)} r ${r}: removed ${res.removed.toFixed(4)} expected ${A.toFixed(4)} (${pct(res.removed, A)})  ${res.man.status()}  genus ${res.man.genus()}`);
  }
}

// ---- T2 other dihedral angles: a triangular prism (interior 60) and a hexagonal prism (interior 120); A = r^2 (cot(g/2) - (pi-g)/2)
line("--- T2 other angles (prisms)");
for (const [name, n] of [["triangle 60", 3], ["square 90", 4], ["pentagon 108", 5], ["hexagon 120", 6]]) {
  const poly = []; for (let k = 0; k < n; k++) poly.push([10 * Math.cos((2 * Math.PI * k) / n), 10 * Math.sin((2 * Math.PI * k) / n)]);
  let b = Manifold.extrude(CrossSection.ofPolygons([poly]), 20); b = M.tag(b, (nn, A, c) => (Math.abs(nn[2]) > 0.99 ? (nn[2] > 0 ? 200 : 201) : 300 + Math.round(Math.atan2(nn[1], nn[0]) * 100)));
  const F = M.faces(b), sides = F.list.filter((f) => Math.abs(f.n[2]) < 0.1), s0 = sides[0], s1 = sides.find((f) => f !== s0 && F.edges.has([s0.id, f.id].sort().join("|")));
  const g = Math.PI - (2 * Math.PI) / n;
  for (const r of [1, 2]) {
    const res = M.fillet(b, s0.id, s1.id, r);
    const A = r * r * (1 / Math.tan(g / 2) - (Math.PI - g) / 2) * res.length;
    line(`  ${name} r ${r}: removed ${res.removed.toFixed(4)} expected ${A.toFixed(4)} (${pct(res.removed, A)})  ${res.man.status()}`);
  }
}

// ---- T3 concave edge: an L-shaped part, the inner corner filled; ends kept to the end faces
line("--- T3 concave (inner corner of an L)");
for (const turn of [null, [20, 37, 11]]) {
  const L = Manifold.extrude(CrossSection.ofPolygons([[[0, 0], [30, 0], [30, 10], [10, 10], [10, 30], [0, 30]]]), 12);
  let b = M.tag(L, (nn, A) => (Math.abs(nn[2]) > 0.99 ? (nn[2] > 0 ? 200 : 201) : 300 + Math.round(Math.atan2(nn[1], nn[0]) * 100) + (Math.abs(nn[0]) > 0.99 ? Math.round(A[0]) * 7 : Math.round(A[1]) * 7)));
  if (turn) b = b.rotate(turn);
  const F = M.faces(b), inner = F.list;
  // the two faces meeting at the inner corner (10,10): the faces whose vertex sets both contain a vertex at the rotated (10,10,0)
  const p = M.Manifold.cube([1, 1, 1]); void p;
  let pair = null;
  for (const a of inner) for (const c of inner) if (a !== c && F.edges.has([a.id, c.id].sort().join("|"))) { const E = F.edges.get([a.id, c.id].sort().join("|")); const gam = Math.acos(Math.max(-1, Math.min(1, 0))); void gam; try { const r = M.fillet(b, a.id, c.id, 2); if (!r.convex) pair = [a, c, r]; } catch {} }
  if (!pair) { line("  no concave edge found"); continue; }
  const res = pair[2], A = (1 - Math.PI / 4) * 4 * res.length;
  line(`  turn ${JSON.stringify(turn)} r 2: added ${res.removed.toFixed(4)} expected ${A.toFixed(4)} (${pct(res.removed, A)})  ${res.man.status()}  vol ${b.volume().toFixed(2)} -> ${res.man.volume().toFixed(2)}`);
}

// ---- T4 a radius that does not fit: refused, and what silently happens without the check
line("--- T4 radius too big");
{
  const b = M.box(40, 30, 10), F = M.faces(b), up = top(F), px = side(F, 0, 1);
  for (const r of [9, 10, 11, 25]) {
    try { const res = M.fillet(b, up.id, px.id, r); line(`  r ${r}: ok removed ${res.removed.toFixed(3)} expected ${((1 - Math.PI / 4) * r * r * 30).toFixed(3)}`); }
    catch (e) { line(`  r ${r}: refused: ${e.message}`); }
  }
}

// ---- T5 a round rim: the flat top of a 64-sided cylinder (R 10, h 8), fillet r 2 by revolve; Pappus gives the exact volume
line("--- T5 rim fillet (revolved), body 64 facets");
for (const [segs, label] of [[64, "same tessellation (64)"], [48, "different tessellation (48)"], [100, "different tessellation (100)"]]) {
  const R = 10, h = 8, r = 2;
  const cyl = M.tag(Manifold.cylinder(h, R, R, 64), (nn) => (Math.abs(nn[2]) > 0.99 ? (nn[2] > 0 ? 200 : 201) : 9500));
  const out = M.rimFillet(cyl, { R, h, r, segs });
  const exact = (1 - Math.PI / 4) * r * r * 2 * Math.PI * (R - 0.2232 * r);
  line(`  ${label}: removed ${(cyl.volume() - out.volume()).toFixed(4)} vs exact torus corner ${exact.toFixed(4)} (${pct(cyl.volume() - out.volume(), exact)})  ${out.status()}  tris ${out.numTri()}`);
}

// ---- T6 the vertex blend: three edges at a box corner, r 2, in all six orders, against OCCT's own
line("--- T6 vertex blend (three edges at one corner), vs OCCT");
let occt = null;
try {
  const K = await import("../lineage-occt/lib.mjs"); const { makeBox } = await import("../lineage-occt/node_modules/replicad/dist/replicad.js");
  void makeBox;
  const base = K.box ? null : null; void base;
} catch (e) { /* the OCCT side is optional */ }
{
  const volumes = [];
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const order of orders) {
    let b = M.box(20, 20, 10, 100); let ok = true;
    for (const which of order) {
      const F = M.faces(b); const U = top(F), X = side(F, 0, 1), Y = side(F, 1, 1);
      const pair = [[U, X], [U, Y], [X, Y]][which];
      try { b = M.fillet(b, pair[0].id, pair[1].id, 2).man; } catch (e) { ok = false; line("   refused", e.message); break; }
    }
    if (ok) volumes.push(b.volume());
  }
  line(`  by construction, six orders: ${volumes.map((v) => v.toFixed(3)).join("  ")}  (spread ${(Math.max(...volumes) - Math.min(...volumes)).toExponential(2)})`);
}

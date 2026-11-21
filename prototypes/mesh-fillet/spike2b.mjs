// Spike 2, part two: the same fillets against OCCT's own; a random-operation fuzz (validity, volume identities, dust); a fillet chain with face ids replayed under edits.
import * as M from "./mf.mjs";
import * as K from "../lineage-occt/lib.mjs";
const { Manifold, CrossSection } = M;
M.curved.add(9000); M.curved.add(9100);
const { oc } = K;
const line = (...a) => console.log(...a);
const pct = (a, b) => ((100 * (a - b)) / b).toFixed(3) + "%";
const occtVol = (shape) => { const p = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(shape, p, false, false, false); return p.Mass(); };
const near = (a, b) => Math.abs(a - b) < 1e-2;

// ---- A. against OCCT
line("--- A. against OCCT (volume of the same filleted body)");
function occtFillet(shape, pick, r) {
  const mk = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  for (const e of K.edgesOf(shape)) if (pick(K.edgeMid(e))) mk.Add(r, K.downcast(e));
  mk.Build(K.pr());
  if (!mk.IsDone()) throw new Error("occt refused");
  return mk.Shape();
}
{
  // one convex edge, r 2
  const face = K.draw([0, 0]).lineTo([20, 0]).lineTo([20, 20]).lineTo([0, 20]).close().sketchOnPlane("XY").face().wrapped;
  const pr = K.prism(face, [0, 0, 10], () => "e", "A");
  const one = occtVol(occtFillet(pr.shape, (m) => near(m[0], 20) && near(m[2], 10), 2));
  let b = M.box(20, 20, 10); let F = M.faces(b);
  const m1 = M.fillet(b, M.faces(b).list.find((f) => f.n[2] > 0.9).id, M.faces(b).list.find((f) => f.n[0] > 0.9).id, 2).man.volume();
  line(`  one convex edge r 2:    OCCT ${one.toFixed(4)}  mesh ${m1.toFixed(4)}  (${pct(m1, one)})`);
  // three edges at a corner (the vertex blend)
  const three = occtVol(occtFillet(pr.shape, (m) => (near(m[0], 20) && near(m[2], 10)) || (near(m[1], 20) && near(m[2], 10)) || (near(m[0], 20) && near(m[1], 20)), 2));
  const mesh3 = (() => { let c = M.box(20, 20, 10); for (const w of [0, 1, 2]) { const G = M.faces(c), U = G.list.find((f) => f.n[2] > 0.9), X = G.list.find((f) => f.n[0] > 0.9), Y = G.list.find((f) => f.n[1] > 0.9); const [p, q] = [[U, X], [U, Y], [X, Y]][w]; c = M.fillet(c, p.id, q.id, 2).man; } return c.volume(); })();
  line(`  three at a corner r 2:  OCCT ${three.toFixed(4)}  mesh ${mesh3.toFixed(4)}  (${pct(mesh3, three)})  <- OCCT blends the corner with a sphere patch, the mesh version leaves the three cylinders meeting`);
  // an edge that ends on a slanted face
  const prof = K.draw([0, 0]).lineTo([30, 0]).lineTo([24, 10]).lineTo([0, 10]).close().sketchOnPlane("XZ").face().wrapped;
  const slant = K.prism(prof, [0, -20, 0], () => "s", "S");
  const o = occtVol(occtFillet(slant.shape, (m) => near(m[1], 0) && near(m[2], 10), 2));
  let sb = Manifold.extrude(CrossSection.ofPolygons([[[0, 0], [30, 0], [24, 10], [0, 10]]]), 20).rotate([90, 0, 0]);
  sb = M.tag(sb, (nn, A) => (Math.abs(nn[0]) > 0.99 ? (nn[0] > 0 ? 301 : 300) : Math.abs(nn[1]) > 0.99 ? (nn[1] > 0 ? 303 : 302) : Math.abs(nn[2]) > 0.99 ? (nn[2] > 0 ? 305 : 304) : 306));
  const SF = M.faces(sb), tf = SF.list.find((f) => f.n[2] > 0.99 && Math.abs(f.c[2] - 10) < 1e-3), ff = SF.list.find((f) => f.n[1] < -0.99);
  const ms = M.fillet(sb, tf.id, ff.id, 2);
  line(`  edge ending on a slanted face (top/front, r 2): OCCT ${o.toFixed(4)}  mesh ${(ms.man.volume()).toFixed(4)}  (${pct(ms.man.volume(), o)})  mesh removed ${ms.removed.toFixed(4)}  ${ms.man.status()}`);
}

// ---- B. a fuzz of random booleans: valid? do the volumes add up? is there dust?
line("--- B. random booleans: status, volume identities, dust");
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function prim(r) {
  const g = () => Math.round(r() * 40) / 2; // a half-millimetre grid, so flush and shared faces are common
  let m;
  const kind = r();
  if (kind < 0.5) m = Manifold.cube([1 + Math.round(r() * 20), 1 + Math.round(r() * 20), 1 + Math.round(r() * 20)]);
  else if (kind < 0.85) m = Manifold.cylinder(1 + Math.round(r() * 20), 1 + Math.round(r() * 8), 1 + Math.round(r() * 8), 6 + Math.floor(r() * 58));
  else m = Manifold.sphere(1 + Math.round(r() * 8), 8 + Math.floor(r() * 40));
  const rot = r();
  if (rot < 0.25) m = m.rotate([90 * Math.floor(r() * 4), 90 * Math.floor(r() * 4), 90 * Math.floor(r() * 4)]);
  else if (rot < 0.5) m = m.rotate([r() * 360, r() * 360, r() * 360]);
  const eps = r() < 0.2 ? 1e-9 * (r() < 0.5 ? 1 : -1) : 0;
  return m.translate([g() + eps, g(), g() - eps]);
}
{
  const N = 1500, steps = 8; let ops = 0, bad = { status: 0, ident: 0, dust: 0, empty: 0, nonfinite: 0, multi: 0 }; const worst = [];
  const t0 = performance.now();
  for (let seed = 1; seed <= N; seed++) {
    const r = rng(seed); let A = prim(r);
    for (let s = 0; s < steps; s++) {
      const B = prim(r), kind = ["add", "subtract", "intersect"][Math.floor(r() * 3)];
      const vA = A.volume(), vB = B.volume(), vI = A.intersect(B).volume();
      let C = A[kind](B); ops++;
      if (C.status() !== "NoError") { bad.status++; worst.push(`seed ${seed} step ${s} ${kind}: ${C.status()}`); break; }
      const v = C.volume(), want = kind === "add" ? vA + vB - vI : kind === "subtract" ? vA - vI : vI;
      if (!Number.isFinite(v)) { bad.nonfinite++; break; }
      if (Math.abs(v - want) > 1e-6 * Math.max(vA, vB, 1)) { bad.ident++; if (worst.length < 8) worst.push(`seed ${seed} step ${s} ${kind}: volume ${v.toFixed(6)} expected ${want.toFixed(6)}`); }
      const parts = C.decompose(); if (parts.length > 1) { const tiny = parts.filter((p) => Math.abs(p.volume()) < 1e-5).length; if (tiny) bad.dust++; else bad.multi++; }
      if (C.isEmpty()) { bad.empty++; break; }
      A = C;
    }
  }
  const dt = performance.now() - t0;
  line(`  ${ops} operations (${N} sequences of up to ${steps}) in ${(dt / 1000).toFixed(1)} s = ${(ops / (dt / 1000)).toFixed(0)} ops/s (the volume identity is checked with two extra booleans each)`);
  line(`  status errors ${bad.status}; volume identity violated ${bad.ident}; results with dust (a piece under 1e-5 mm3) ${bad.dust}; with several real pieces ${bad.multi}; ended empty ${bad.empty}; non-finite ${bad.nonfinite}`);
  if (worst.length) line("  worst:", worst.slice(0, 6).join(" | "));
}

// ---- C. a chain with ids, replayed under edits: box, fillet top|+x, a hole, fillet top|-y; face ids as the references
line("--- C. chain with face ids, replayed under edits");
const P0 = { w: 40, h: 30, d: 10, r: 2, hx: 20, hr: 4, r2: 1.5 };
function chain(p) {
  const status = [];
  let b = M.box(p.w, p.h, p.d, 100), F;
  const find = (G, f) => G.list.find(f);
  try { F = M.faces(b); b = M.fillet(b, find(F, (f) => f.n[2] > 0.99).id, find(F, (f) => f.n[0] > 0.99).id, p.r).man; status.push("fillet1 ok"); } catch (e) { status.push("fillet1 " + e.message); }
  try { const cyl = M.tag(Manifold.cylinder(p.d + 2, p.hr, p.hr, 48).translate([p.hx, p.h / 2, -1]), (nn) => (Math.abs(nn[2]) > 0.99 ? 401 : 400)); M.curved.add(400); b = b.subtract(cyl); status.push("hole ok"); } catch (e) { status.push("hole " + e.message); }
  try { F = M.faces(b); b = M.fillet(b, find(F, (f) => f.n[2] > 0.99 && f.id.startsWith("105")).id, find(F, (f) => f.n[1] < -0.99).id, p.r2, { roundId: 9100, toolId: 9101 }).man; status.push("fillet2 ok"); } catch (e) { status.push("fillet2 " + e.message); }
  const clean = M.clean(b); return { b: clean.man, status, dust: clean.dust };
}
const refs = [
  ["top (105.0)", "105.0", (f, p) => f.n[2] > 0.99 && near(f.c[2], p.d)],
  ["wall +x (101.0)", "101.0", (f, p) => f.n[0] > 0.99],
  ["round 1 (9000.0)", "9000.0", (f, p) => Math.abs(f.n[0]) > 0.3 && Math.abs(f.n[2]) > 0.3],
  ["hole wall (400.0)", "400.0", (f, p) => Math.abs(f.n[2]) < 0.2],
  ["round 2 (9100.0)", "9100.0", (f, p) => Math.abs(f.n[1]) > 0.3 && Math.abs(f.n[2]) > 0.3],
  ["wall -y (102.0)", "102.0", (f, p) => f.n[1] < -0.99],
];
let ok = 0, wrong = 0, lost = 0;
for (const [label, d] of [["original", {}], ["wider w 60", { w: 60 }], ["deeper h 44", { h: 44 }], ["taller d 14", { d: 14 }], ["fillet r 3", { r: 3 }], ["hole moved hx 30", { hx: 30 }], ["hole r 7", { hr: 7 }], ["second fillet r2 3", { r2: 3 }], ["everything", { w: 60, h: 44, d: 14, r: 3, hx: 30, hr: 7, r2: 3 }], ["hole breaks the wall hx 38 (w 40)", { hx: 38 }], ["thin d 1.2 with r 2", { d: 1.2 }], ["fillet too big r 12", { r: 12 }]]) {
  const p = { ...P0, ...d }, { b, status, dust } = chain(p), G = M.faces(b), row = [];
  for (const [name, id, pred] of refs) { const f = G.byId.get(id); if (!f) { row.push("∅ " + name.split(" ")[0] + name.split(" ")[1]); lost++; } else if (pred(f, p)) { row.push("✓ " + name.split(" ")[0] + name.split(" ")[1]); ok++; } else { row.push("✗ " + name.split(" ")[0] + name.split(" ")[1]); wrong++; } }
  line(`  ${label.padEnd(36)} ${status.join(", ").padEnd(36)} status ${b.status()} dust ${dust}  ${row.join("  ")}`);
}
line(`  TOTAL refs ok ${ok}, wrong ${wrong}, lost ${lost}`);

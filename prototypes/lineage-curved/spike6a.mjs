// Spike 6a: lineage through revolve, loft, shell and sweep (curved faces), replayed under edits, references checked against what a person would say they still mean.
import * as L from "../lineage-occt/lib.mjs";
import { assembleWire, makeLine, drawCircle, makeThreePointArc, makeCylinder } from "replicad";
const { oc } = L;
const near = (a, b, t = 1e-2) => Math.abs(a - b) < t;
const wireOf = (faceRaw) => assembleWire(L.edgesOf(faceRaw).map((e) => new L.Edge(L.downcast(e)))).wrapped;
const polyFace = (pts, plane, z = 0) => { let d = L.draw(pts[0]); for (const p of pts.slice(1)) d = d.lineTo(p); return d.close().sketchOnPlane(plane, z).face().wrapped; };
const rankByCentre = (items) => items.map((x) => ({ ...x, c: L.facts(x.raw).c })).sort((a, b) => a.c[0] - b.c[0] || a.c[1] - b.c[1] || a.c[2] - b.c[2]);

/** the segment of a profile an edge came from, by its midpoint (the profile is our own exact input) */
const segOf = (mids, m, tol = 1e-3) => mids.findIndex((q) => q.every((v, i) => Math.abs(v - m[i]) < tol));

// ---------------------------------------------------------------- revolve
function revolve(p) {
  const pts = [[0, 0], [p.r1, 0], [p.r1, p.h1], [p.r2, p.h1], [p.r2, p.H], [0, p.H]];
  const face = polyFace(pts, "XZ"), mids = pts.map((q, i) => { const n = pts[(i + 1) % pts.length]; return [(q[0] + n[0]) / 2, 0, (q[1] + n[1]) / 2]; });
  const mk = new oc.BRepPrimAPI_MakeRevol(face, new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(0, 0, 1)), (p.deg * Math.PI) / 180, false);
  const shape = mk.Shape(); if (!L.valid(shape)) throw new Error("revolve gave an invalid solid");
  const extra = [];
  for (const ed of L.edgesOf(face)) { const i = segOf(mids, L.edgeMid(ed)); for (const g of L.arr(mk.Generated(ed))) extra.push({ id: `R:side:e${i}`, raw: g }); }
  if (p.deg < 360) { extra.push({ id: "R:start", raw: mk.FirstShape() }, { id: "R:end", raw: mk.LastShape() }); }
  const m = L.carry(mk, [], shape, "R", extra);
  // OCCT reports no face for an edge that lies across the axis (the flat discs and rings): recover those from the step's own profile, exactly
  let recovered = 0;
  for (const e of m.entries) {
    if (!e.id.startsWith("R:gap")) continue;
    const f = L.facts(e.raw); if (f.type !== "PLANE" || Math.abs(Math.abs(f.n[2]) - 1) > 1e-6) continue;
    const rad = Math.max(Math.abs(f.hi[0]), Math.abs(f.lo[0]));
    const i = pts.findIndex((q, k) => { const n = pts[(k + 1) % pts.length]; return Math.abs(q[1] - n[1]) < 1e-9 && near(q[1], f.c[2], 1e-6) && Math.max(q[0], n[0]) >= rad - 1e-6 && Math.max(q[0], n[0]) > 1e-9 && near(Math.max(q[0], n[0]), rad, 1e-3 + 1e-6); });
    if (i >= 0) { e.id = `R:side:e${i}`; recovered++; }
  }
  m.log.push({ recovered }); m.gapsBeforeRecovery = m.log.filter((x) => x.gap).length;
  return m;
}
const revolveRefs = [
  ["bottom disc e0", "R:side:e0", (f, p) => f.type === "PLANE" && f.n[2] < -0.99 && near(f.c[2], 0)],
  ["outer cylinder e1", "R:side:e1", (f, p) => f.type !== "PLANE" && near(f.hi[0], p.r1)],
  ["shoulder ring e2", "R:side:e2", (f, p) => f.type === "PLANE" && f.n[2] > 0.99 && near(f.c[2], p.h1)],
  ["inner cylinder e3", "R:side:e3", (f, p) => f.type !== "PLANE" && near(f.hi[0], p.r2)],
  ["top disc e4", "R:side:e4", (f, p) => f.type === "PLANE" && f.n[2] > 0.99 && near(f.c[2], p.H)],
];

// ---------------------------------------------------------------- loft
function loft(p) {
  const a = polyFace([[-p.w1 / 2, -p.d1 / 2], [p.w1 / 2, -p.d1 / 2], [p.w1 / 2, p.d1 / 2], [-p.w1 / 2, p.d1 / 2]], "XY", 0);
  const b = polyFace([[-p.w2 / 2 + p.dx, -p.d2 / 2], [p.w2 / 2 + p.dx, -p.d2 / 2], [p.w2 / 2 + p.dx, p.d2 / 2], [-p.w2 / 2 + p.dx, p.d2 / 2]], "XY", p.H);
  const ts = new oc.BRepOffsetAPI_ThruSections(true, !!p.ruled, 1e-6), wa = wireOf(a); ts.AddWire(wa); ts.AddWire(wireOf(b)); ts.Build(L.pr());
  const shape = ts.Shape(); if (!L.valid(shape)) throw new Error("loft gave an invalid solid");
  const mids = [[0, -p.d1 / 2, 0], [p.w1 / 2, 0, 0], [0, p.d1 / 2, 0], [-p.w1 / 2, 0, 0]], extra = [];
  for (const ed of L.edgesOf(wa)) { const i = segOf(mids, L.edgeMid(ed)); extra.push({ id: `L:side:e${i}`, raw: ts.GeneratedFace(ed) }); }
  extra.push({ id: "L:start", raw: ts.FirstShape() }, { id: "L:end", raw: ts.LastShape() });
  return L.carry(ts, [], shape, "L", extra);
}
const loftRefs = [
  ["side e0 (the -y side)", "L:side:e0", (f) => f.c[1] < 0 && Math.abs(f.c[1]) > Math.abs(f.c[0] - 0) * 0.2],
  ["side e1 (the +x side)", "L:side:e1", (f) => f.c[0] > 0.1],
  ["side e2 (the +y side)", "L:side:e2", (f) => f.c[1] > 0],
  ["side e3 (the -x side)", "L:side:e3", (f) => f.c[0] < 0.1 && f.c[0] < Math.abs(f.c[1]) + 5],
  ["bottom", "L:start", (f, p) => f.type === "PLANE" && f.n[2] < -0.99 && near(f.c[2], 0)],
  ["top", "L:end", (f, p) => f.type === "PLANE" && f.n[2] > 0.99 && near(f.c[2], p.H)],
];

// ---------------------------------------------------------------- shell
function shellBox(p) {
  const base = polyFace([[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]], "XY", 0), mids = [[p.w / 2, 0], [p.w, p.h / 2], [p.w / 2, p.h], [0, p.h / 2]];
  const idOf = (ed) => { const m = L.edgeMid(ed); return "e" + mids.findIndex((q) => near(q[0], m[0]) && near(q[1], m[1])); };
  const pr = L.prism(base, [0, 0, p.d], idOf, "A"), A = L.carry(pr.mk, [], pr.shape, "A", pr.extra);
  return shellOf(A, "A:end", p.t, "S");
}
function shellOf(model, faceId, t, step) {
  const top = model.rawOf(faceId); if (!top) throw new Error(`ref ${faceId} not found`);
  const th = new oc.BRepOffsetAPI_MakeThickSolid();
  th.MakeThickSolidByJoin(model.shape, L.toList([top]), -t, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false);
  const shape = th.Shape(); if (!L.valid(shape)) throw new Error("shell gave an invalid solid");
  const extra = []; for (const e of model.entries) for (const g of L.arr(th.Generated(e.raw))) extra.push({ id: `${step}:in:${e.id}`, raw: g });
  return L.carry(th, [model.entries], shape, step, extra);
}
const shellRefs = [
  ["outer wall +x (A:side:e1)", "A:side:e1", (f, p) => f.n[0] > 0.99 && near(f.c[0], p.w)],
  ["inner wall of +x (S:in:A:side:e1)", "S:in:A:side:e1", (f, p) => f.n[0] < -0.99 && near(f.c[0], p.w - p.t)],
  ["inner floor (S:in:A:start)", "S:in:A:start", (f, p) => f.n[2] > 0.99 && near(f.c[2], p.t)],
  ["rim (A:end)", "A:end", (f, p) => f.n[2] > 0.99 && near(f.c[2], p.d)],
  ["outer floor (A:start)", "A:start", (f, p) => f.n[2] < -0.99 && near(f.c[2], 0)],
];

// ---------------------------------------------------------------- pipe (sweep along an L path)
function pipe(p) {
  const path = assembleWire([makeLine([0, 0, 0], [p.l1, 0, 0]), makeLine([p.l1, 0, 0], [p.l1, 0, p.l2])]);
  const prof = drawCircle(p.r).sketchOnPlane("YZ").face().wrapped;
  const mk = new oc.BRepOffsetAPI_MakePipe(path.wrapped, prof), shape = mk.Shape(); if (!L.valid(shape)) throw new Error("pipe gave an invalid solid");
  const extra = [{ id: "P:start", raw: mk.FirstShape() }, { id: "P:end", raw: mk.LastShape() }];
  const pe = L.edgesOf(prof).map((ed) => ({ ed, c: L.edgeMid(ed) })).sort((a, b) => a.c[1] - b.c[1] || a.c[2] - b.c[2]);
  pe.forEach((x, i) => { rankByCentre(L.arr(mk.Generated(x.ed)).map((raw) => ({ raw }))).forEach((g, k) => extra.push({ id: `P:side:${i}.${k}`, raw: g.raw })); });
  return L.carry(mk, [], shape, "P", extra);
}
const pipeRefs = [
  ["start cap", "P:start", (f, p) => f.type === "PLANE" && Math.abs(f.n[0]) > 0.99 && near(f.c[0], 0)],
  ["end cap", "P:end", (f, p) => f.type === "PLANE" && near(f.c[0], p.l1) && near(f.c[2], p.l2)],
];


// ---------------------------------------------------------------- pipe along a quarter arc
function arcPipe(p) {
  const R = p.R, s = Math.SQRT1_2;
  const path = assembleWire([makeThreePointArc([0, 0, 0], [R * s, 0, R * (1 - s)], [R, 0, R])]);
  const prof = drawCircle(p.r).sketchOnPlane("YZ").face().wrapped;
  const mk = new oc.BRepOffsetAPI_MakePipe(path.wrapped, prof), shape = mk.Shape(); if (!L.valid(shape)) throw new Error("pipe gave an invalid solid");
  const extra = [{ id: "P:start", raw: mk.FirstShape() }, { id: "P:end", raw: mk.LastShape() }];
  const pe = L.edgesOf(prof).map((ed) => ({ ed, c: L.edgeMid(ed) })).sort((a, b) => a.c[1] - b.c[1] || a.c[2] - b.c[2]);
  pe.forEach((x, i) => { rankByCentre(L.arr(mk.Generated(x.ed)).map((raw) => ({ raw }))).forEach((g, k) => extra.push({ id: `P:side:${i}.${k}`, raw: g.raw })); });
  return L.carry(mk, [], shape, "P", extra);
}
const arcPipeRefs = [
  ["start cap", "P:start", (f, p) => f.type === "PLANE" && near(f.c[0], 0) && near(f.c[2], 0) && Math.abs(f.n[0]) > 0.99],
  ["end cap", "P:end", (f, p) => f.type === "PLANE" && near(f.c[0], p.R) && near(f.c[2], p.R) && Math.abs(f.n[2]) > 0.99],
  ["side (the toroidal wall)", "P:side:0", (f, p) => f.type !== "PLANE"],
];

// ---------------------------------------------------------------- a chain on curved faces: revolve, cross hole, fillet of the curved edge by lineage, shell
function chainCurved(p) {
  let m = revolve(p); const status = ["R ok"];
  const step = (name, fn) => { try { m = fn(m); status.push(name + " ok"); } catch (e) { status.push(`${name} FLAG(${String(e.message ?? e).slice(0, 38)})`); } };
  step("H", (b) => {
    const cyl = makeCylinder(p.rh, 2 * (p.r1 + 2), [-(p.r1 + 2), 0, p.zh], [1, 0, 0]).wrapped;
    const tool = new L.Model(cyl, L.facesOf(cyl).map((raw) => ({ id: L.facts(raw).type === "PLANE" ? `H:cap${L.facts(raw).n[0] > 0 ? 1 : 0}` : "H:wall", raw })));
    return L.boolean("cut", b, tool, "H");
  });
  step("F", (b) => {
    const key = ["R:side:e0", "R:side:e1"].sort().join("|"), e = L.edgeIndex(b).find((x) => x.key === key); if (!e) throw new Error("edge not found");
    const mk = new oc.BRepFilletAPI_MakeFillet(b.shape, oc.ChFi3d_FilletShape.ChFi3d_Rational); mk.Add(p.rf, L.downcast(e.raw)); mk.Build(L.pr());
    if (!mk.IsDone()) throw new Error("fillet failed"); const shape = mk.Shape(); if (!L.valid(shape)) throw new Error("invalid solid");
    return L.carry(mk, [b.entries], shape, "F", L.arr(mk.Generated(e.raw)).map((raw) => ({ id: "F:round", raw })));
  });
  step("S", (b) => shellOf(b, "R:side:e4", p.t, "S"));
  m.status = status.join(" "); return m;
}
const chainRefs = [
  ["outer cylinder (R:side:e1)", "R:side:e1", (f, p) => f.type !== "PLANE" && near(f.hi[0], p.r1)],
  ["bottom disc (R:side:e0)", "R:side:e0", (f, p) => f.type === "PLANE" && f.n[2] < -0.99],
  ["hole wall (H:wall)", "H:wall", (f, p) => f.type !== "PLANE"],
  ["round (F:round)", "F:round", (f, p) => f.type !== "PLANE" && f.c[2] < p.rf + 1],
  ["inner of outer cyl (S:in:R:side:e1)", "S:in:R:side:e1", (f, p) => f.type !== "PLANE"],
];

// ---------------------------------------------------------------- the running of edits
function runCase(title, make, refs, base, edits, extraCheck) {
  console.log(`\n--- ${title}`);
  let ok = 0, wrong = 0, lost = 0, flagged = 0, gaps = 0, recovered = 0;
  for (const [label, d] of edits) {
    const p = { ...base, ...d };
    let m = null, err = "";
    try { m = make(p); } catch (e) { err = e.message; }
    if (!m) { flagged++; console.log(`  ${label.padEnd(44)} FLAGGED: ${err}`); continue; }
    const g = m.entries.filter((e) => e.id.includes(":gap")).length; gaps += g; recovered += m.log.find((x) => x.recovered !== undefined)?.recovered ?? 0;
    const row = refs.map(([name, id, pred]) => {
      const es = m.entries.filter((x) => x.id === id || x.id.startsWith(id + ".") || x.alias?.includes(id));
      if (!es.length) { lost++; return `∅ ${name.split(" ")[0]}`; }
      if (es.every((e) => pred(L.facts(e.raw), p))) { ok++; return `✓ ${name.split(" ")[0]}`; }
      wrong++; return `✗ ${name.split(" ")[0]}`;
    });
    console.log(`  ${label.padEnd(44)} faces ${String(m.entries.length).padStart(2)} gaps-left ${g}${m.gapsBeforeRecovery !== undefined ? ` (before recovery ${m.gapsBeforeRecovery})` : ""} valid ${L.valid(m.shape)}${m.status ? "  [" + m.status + "]" : ""}  ${row.join(" ")}`);
  }
  console.log(`  total refs ok ${ok}, wrong ${wrong}, lost ${lost}; edits flagged ${flagged}; faces with no id after the step ${gaps}${recovered ? `; ${recovered} faces recovered by rule` : ""}`);
  return { ok, wrong, lost, flagged, gaps };
}
const T = [];
T.push(runCase("revolve: a stepped shaft (profile of 6 edges, one on the axis, 3 flat ones across it)", revolve, revolveRefs, { r1: 10, h1: 6, r2: 6, H: 12, deg: 360 }, [
  ["original", {}], ["outer radius 14", { r1: 14 }], ["shoulder height 9", { h1: 9 }], ["inner radius 4", { r2: 4 }], ["taller H 18", { H: 18 }],
  ["everything: r1 15 h1 4 r2 9 H 20", { r1: 15, h1: 4, r2: 9, H: 20 }], ["partial revolve 270", { deg: 270 }], ["partial 90, r1 12", { deg: 90, r1: 12 }],
  ["inner radius bigger than outer (r2 12)", { r2: 12 }], ["shoulder above the top (h1 14)", { h1: 14 }],
]));
T.push(runCase("loft: two rectangles, 15 apart, smooth", loft, loftRefs, { w1: 20, d1: 10, w2: 12, d2: 6, dx: 0, H: 15, ruled: false }, [
  ["original", {}], ["bottom wider w1 30", { w1: 30 }], ["top smaller w2 8 d2 4", { w2: 8, d2: 4 }], ["top shifted dx 5", { dx: 5 }], ["taller H 25", { H: 25 }],
  ["ruled (straight sides)", { ruled: true }], ["everything", { w1: 26, d1: 14, w2: 10, d2: 5, dx: 3, H: 20 }], ["top bigger than bottom (w2 30)", { w2: 30, d2: 16 }],
]));
T.push(runCase("shell: a box, top removed, wall t", shellBox, shellRefs, { w: 40, h: 30, d: 20, t: 3 }, [
  ["original", {}], ["thicker t 5", { t: 5 }], ["wider w 60", { w: 60 }], ["deeper h 50", { h: 50 }], ["taller d 35", { d: 35 }], ["thin t 0.8", { t: 0.8 }],
  ["everything", { w: 55, h: 44, d: 28, t: 4 }], ["wall too thick (t 16: more than half of h)", { t: 16 }], ["t equals the height (t 20)", { t: 20 }],
]));
T.push(runCase("sweep: a circle along an L path (two straight legs)", pipe, pipeRefs, { r: 3, l1: 30, l2: 25 }, [
  ["original", {}], ["thicker r 5", { r: 5 }], ["longer first leg l1 50", { l1: 50 }], ["longer second leg l2 40", { l2: 40 }], ["everything", { r: 4, l1: 45, l2: 18 }], ["fat pipe on a short leg (r 12, l2 6)", { r: 12, l2: 6 }],
]));
T.push(runCase("sweep: a circle along a quarter arc", arcPipe, arcPipeRefs, { r: 3, R: 30 }, [
  ["original", {}], ["thicker r 5", { r: 5 }], ["bigger bend R 50", { R: 50 }], ["everything", { r: 4, R: 40 }], ["pipe fatter than the bend (r 12, R 8)", { r: 12, R: 8 }],
]));
T.push(runCase("chain on curved faces: revolve, a cross hole, a fillet of the curved edge, a shell of the top", chainCurved, chainRefs, { r1: 10, h1: 6, r2: 6, H: 24, deg: 360, rh: 1.5, zh: 3, rf: 1, t: 1.2 }, [
  ["original", {}], ["outer radius 14", { r1: 14 }], ["taller H 34", { H: 34 }], ["hole bigger rh 2", { rh: 2 }], ["hole higher zh 4", { zh: 4 }], ["fillet bigger rf 1.8", { rf: 1.8 }],
  ["thicker wall t 2", { t: 2 }], ["everything", { r1: 13, h1: 8, r2: 7, H: 30, rh: 2, zh: 4.5, rf: 1.4, t: 1.6 }],
  ["fillet too big rf 6", { rf: 6 }], ["hole through the fillet zone zh 0.8", { zh: 0.8 }], ["wall too thick t 9", { t: 9 }],
]));
console.log("\nTOTAL", T.reduce((s, t) => ({ ok: s.ok + t.ok, wrong: s.wrong + t.wrong, lost: s.lost + t.lost, flagged: s.flagged + t.flagged, gaps: s.gaps + t.gaps }), { ok: 0, wrong: 0, lost: 0, flagged: 0, gaps: 0 }));

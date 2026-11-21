// Spike 6b: a retry ladder on a reproducible OCCT failure (the shell of a revolved body with a cross hole and a fillet).
import * as L from "../lineage-occt/lib.mjs";
import { makeCylinder } from "replicad";
const { oc } = L;
const polyFace = (pts) => { let d = L.draw(pts[0]); for (const p of pts.slice(1)) d = d.lineTo(p); return d.close().sketchOnPlane("XZ", 0).face().wrapped; };
const revolveShape = (p) => { const pts = [[0, 0], [p.r1, 0], [p.r1, p.h1], [p.r2, p.h1], [p.r2, p.H], [0, p.H]]; const mk = new oc.BRepPrimAPI_MakeRevol(polyFace(pts), new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(0, 0, 1)), Math.PI * 2, false); return mk.Shape(); };
const topFaceOf = (shape, z) => L.facesOf(shape).find((f) => { const q = L.facts(f); return q.type === "PLANE" && q.n[2] > 0.99 && Math.abs(q.c[2] - z) < 1e-3; });
function shell(shape, top, t, { tol = 1e-3, join = "Arc", mode = "Skin" } = {}) {
  const th = new oc.BRepOffsetAPI_MakeThickSolid();
  th.MakeThickSolidByJoin(shape, L.toList([top]), -t, tol, oc.BRepOffset_Mode["BRepOffset_" + mode], false, false, oc.GeomAbs_JoinType["GeomAbs_" + join], false);
  const s = th.Shape(); if (!L.valid(s)) throw new Error("invalid solid"); return s;
}
const attempt = (fn) => { try { fn(); return true; } catch (e) { return false; } };
const p = { r1: 10, h1: 6, r2: 6, H: 24 };
const variants = (label, shape, top, t) => {
  const rungs = [
    ["as the step ran (tol 1e-3, arc join)", () => shell(shape, top, t)],
    ["tolerance 1e-2", () => shell(shape, top, t, { tol: 1e-2 })],
    ["tolerance 1e-4", () => shell(shape, top, t, { tol: 1e-4 })],
    ["tolerance 1e-5", () => shell(shape, top, t, { tol: 1e-5 })],
    ["intersection join", () => shell(shape, top, t, { join: "Intersection" })],
    ["pipe mode", () => shell(shape, top, t, { mode: "Pipe" })],
    ["thickness +1e-4", () => shell(shape, top, t + 1e-4)],
    ["thickness -1e-3", () => shell(shape, top, t - 1e-3)],
    ["thickness +1e-2", () => shell(shape, top, t + 1e-2)],
    ["thickness x1.05 (a visible change)", () => shell(shape, top, t * 1.05)],
  ];
  console.log(`\n${label}`);
  for (const [n, f] of rungs) console.log(`  ${attempt(f) ? "✓ works" : "✗ fails"}   ${n}`);
};
// 1. pure revolve, no hole, no fillet
{ const s = revolveShape(p); variants("shell of the plain revolved shaft, t 1.2", s, topFaceOf(s, p.H), 1.2); }
// 2. with the cross hole
let withHole;
{ const s = revolveShape(p), cyl = makeCylinder(1.5, 24, [-12, 0, 3], [1, 0, 0]).wrapped; const op = new oc.BRepAlgoAPI_Cut(s, cyl, L.pr()); withHole = op.Shape(); variants("shell after the cross hole, t 1.2", withHole, topFaceOf(withHole, p.H), 1.2); }
// 3. with the hole and the fillet at the base
{
  const ei = L.edgeIndex(new L.Model(withHole, L.facesOf(withHole).map((raw, i) => ({ id: "f" + i, raw }))));
  const circ = ei.filter((e) => Math.abs(e.mid[2]) < 1e-3 && e.faces.length === 2);
  const mk = new oc.BRepFilletAPI_MakeFillet(withHole, oc.ChFi3d_FilletShape.ChFi3d_Rational); mk.Add(1, L.downcast(circ[0].raw)); mk.Build(L.pr());
  const s = mk.Shape(); variants("shell after the hole and the base fillet, t 1.2", s, topFaceOf(s, p.H), 1.2);
}

// 4. the other order: shell the plain shaft first, then drill the cross hole through both walls, then the base fillet
{
  const s = revolveShape(p), top = topFaceOf(s, p.H);
  let ok = true, why = "";
  try {
    const shelled = shell(s, top, 1.2);
    const cyl = makeCylinder(1.5, 24, [-12, 0, 3], [1, 0, 0]).wrapped; const cut = new oc.BRepAlgoAPI_Cut(shelled, cyl, L.pr()); if (!cut.IsDone() || !L.valid(cut.Shape())) throw new Error("hole after the shell failed");
    const m = new L.Model(cut.Shape(), L.facesOf(cut.Shape()).map((raw, i) => ({ id: "f" + i, raw })));
    const circ = L.edgeIndex(m).filter((e) => Math.abs(e.mid[2]) < 1e-3 && e.faces.length === 2);
    const mk = new oc.BRepFilletAPI_MakeFillet(cut.Shape(), oc.ChFi3d_FilletShape.ChFi3d_Rational); mk.Add(1, L.downcast(circ[0].raw)); mk.Build(L.pr());
    if (!mk.IsDone() || !L.valid(mk.Shape())) throw new Error("fillet after the shell and hole failed");
  } catch (e) { ok = false; why = e.message; }
  console.log(`\nthe other order (shell, then the hole, then the fillet): ${ok ? "✓ every step works" : "✗ " + why}`);
}
// 5. how thick may the wall be before the hole case works: thinner than the hole's radius gives the offset room?
for (const t of [0.3, 0.6, 0.9, 1.2, 1.5, 2.0]) {
  const s = revolveShape(p), cyl = makeCylinder(1.5, 24, [-12, 0, 3], [1, 0, 0]).wrapped; const h = new oc.BRepAlgoAPI_Cut(s, cyl, L.pr()).Shape();
  console.log(`  shell after the hole, t ${t}: ${attempt(() => shell(h, topFaceOf(h, p.H), t)) ? "works" : "fails"}`);
}

import * as L from "../lineage-occt/lib.mjs";
import { assembleWire, makeLine, drawCircle } from "replicad";
const wireOf = (faceRaw) => assembleWire(L.edgesOf(faceRaw).map((e) => new L.Edge(L.downcast(e)))).wrapped;
const { oc } = L;
const sizes = (xs) => xs.map((x) => x.length).join(",");
const F = (s) => L.facesOf(s).length;
const typeOf = (raw) => L.facts(raw).type;
function profileFace(pts, plane = "XZ", z = 0) { let d = L.draw(pts[0]); for (const p of pts.slice(1)) d = d.lineTo(p); return d.close().sketchOnPlane(plane, z).face(); }

// ---- revolve of a stepped shaft profile
{
  const pts = [[0, 0], [10, 0], [10, 6], [6, 6], [6, 12], [0, 12]];
  const face = profileFace(pts).wrapped;
  const mk = new oc.BRepPrimAPI_MakeRevol(face, new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(0, 0, 1)), Math.PI * 2, false);
  const sh = mk.Shape(); console.log("revolve faces", F(sh), L.facesOf(sh).map(typeOf).join(","), "valid", L.valid(sh));
  for (const ed of L.edgesOf(face)) { const g = L.arr(mk.Generated(ed)); console.log("  edge mid", L.edgeMid(ed).join(","), "-> generated", g.length, g.map(typeOf).join(","), "deleted", mk.IsDeleted(ed)); }
  console.log("  first/last in solid:", L.facesOf(sh).some((f) => L.same(f, mk.FirstShape())), L.facesOf(sh).some((f) => L.same(f, mk.LastShape())));
}
// ---- loft through two rectangles
{
  const a = profileFace([[-10, -5], [10, -5], [10, 5], [-10, 5]], "XY", 0), b = profileFace([[-6, -3], [6, -3], [6, 3], [-6, 3]], "XY", 15);
  const ts = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
  const wa0 = wireOf(a.wrapped), wb0 = wireOf(b.wrapped); ts.AddWire(wa0); ts.AddWire(wb0); ts.Build(L.pr());
  const sh = ts.Shape(); console.log("loft faces", F(sh), "valid", L.valid(sh));
  const wa = wa0;
  for (const ed of L.edgesOf(wa)) { let g1 = []; try { g1 = L.arr(ts.Generated(ed)); } catch (e) { g1 = ["err " + e.message.slice(0, 40)]; } let g2 = null; try { g2 = ts.GeneratedFace(ed); } catch (e) { g2 = "err"; } console.log("  edge mid", L.edgeMid(ed).join(","), "-> Generated", g1.length, "GeneratedFace", g2 && g2.IsNull ? (g2.IsNull() ? "null" : typeOf(g2)) : g2); }
  console.log("  first/last", L.facesOf(sh).some((f) => L.same(f, ts.FirstShape())), L.facesOf(sh).some((f) => L.same(f, ts.LastShape())));
}
// ---- shell of a box, top removed
{
  const box = L.draw([0, 0]).lineTo([40, 0]).lineTo([40, 30]).lineTo([0, 30]).close().sketchOnPlane("XY").face().wrapped;
  const pr = L.prism(box, [0, 0, 20], () => "e", "A"); const solid = pr.shape; const ents = L.carry(pr.mk, [], solid, "A", pr.extra).entries;
  const top = ents.find((e) => e.id === "A:end").raw;
  const rm = L.toList([top]);
  const th = new oc.BRepOffsetAPI_MakeThickSolid(); th.MakeThickSolidByJoin(solid, rm, -3, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false);
  const sh = th.Shape(); console.log("shell faces", F(sh), "valid", L.valid(sh), "volume ok");
  for (const e of ents) { let m = [], g = []; try { m = L.arr(th.Modified(e.raw)); } catch (x) { m = ["err"]; } try { g = L.arr(th.Generated(e.raw)); } catch (x) { g = ["err " + x.message.slice(0, 30)]; } console.log("  ", e.id.padEnd(10), "modified", m.length, "generated", g.length, "deleted", (() => { try { return th.IsDeleted(e.raw); } catch { return "?"; } })(), "still in result as is", L.facesOf(sh).some((f) => L.same(f, e.raw))); }
}
// ---- pipe: a circle swept along an L path
{
  const path = assembleWire([makeLine([0, 0, 0], [30, 0, 0]), makeLine([30, 0, 0], [30, 0, 25])]);
  const prof = drawCircle(3).sketchOnPlane("YZ").face().wrapped;
  const mk = new oc.BRepOffsetAPI_MakePipe(path.wrapped, prof);
  const sh = mk.Shape(); console.log("pipe faces", F(sh), L.facesOf(sh).map(typeOf).join(","), "valid", L.valid(sh));
  for (const ed of L.edgesOf(prof)) { const g = L.arr(mk.Generated(ed)); console.log("  profile edge -> generated", g.length, g.map(typeOf).join(",")); }
  console.log("  first/last", L.facesOf(sh).some((f) => L.same(f, mk.FirstShape())), L.facesOf(sh).some((f) => L.same(f, mk.LastShape())));
}

// Spike 7C: a fillet whose size varies along the edge (the kernel's radius law).
//  (1) a straight block edge with sizes 1 -> 5 (and 1 -> 5 -> 1): the volume against the closed form;
//  (2) the crossed rods where constant sizes failed or were invalid: a size that follows the wedge angle at each point.
import * as L from "../lineage-occt/lib.mjs";
import { assembleWire, makeLine, Face, Edge } from "replicad";
const { oc } = L;
const vol = (s) => { const p = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(s, p, false, false, false); return p.Mass(); };
const wireOf = (pts) => assembleWire(pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return makeLine(p, q); })).wrapped;
const faceOf = (w) => new oc.BRepBuilderAPI_MakeFace(w, true).Face();
const rod = (r, h0, h1) => new oc.BRepPrimAPI_MakeRevol(faceOf(wireOf([[0, 0, h0], [r, 0, h0], [r, 0, h1], [0, 0, h1]])), new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(0, 0, 1)), 2 * Math.PI, false).Shape();
const turnX = (s, deg) => { const t = new oc.gp_Trsf(); t.SetRotation(new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(1, 0, 0)), (deg * Math.PI) / 180); return new oc.BRepBuilderAPI_Transform(s, t, true).Shape(); };
const fuse = (a, b) => new oc.BRepAlgoAPI_Fuse(a, b, new oc.Message_ProgressRange()).Shape();
const law = (s, edges, laws, mode = "fillet") => {
  const mk = new oc.BRepFilletAPI_MakeFillet(s, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  edges.forEach((e, i) => { const pts = laws[i], arr = new oc.NCollection_Array1_gp_Pnt2d(1, pts.length); pts.forEach((p, k) => arr.SetValue(k + 1, new oc.gp_Pnt2d(p[0], p[1]))); mk.Add(arr, L.downcast(e)); });
  return mk.Shape();
};
// ---- (1) block, edge along x at the top front: x 0..40, the edge between the top face and the front face
const block = new oc.BRepPrimAPI_MakePrism(faceOf(wireOf([[0, 0, 0], [40, 0, 0], [40, 0, 30], [0, 0, 30]])), new oc.gp_Vec(0, 10, 0), false, true).Shape();
const edge = L.edgesOf(block).find((e) => { const m = L.edgeMid(e); return Math.abs(m[2] - 30) < 1e-6 && Math.abs(m[1]) < 1e-6; }); // top edge at y=0 along x
const base = vol(block), k = 1 - Math.PI / 4;
const area = (f) => f; 
const cases = [["1 -> 5", [[0, 1], [1, 5]], (L_) => (L_ * (1 + 5 + 25)) / 3], ["1 -> 5 -> 1", [[0, 1], [0.5, 5], [1, 1]], null]];
console.log("(1) block edge 40 long, sizes along it");
for (const [name, pts, closed] of cases) {
  const out = law(block, [edge], [pts]), got = base - vol(out);
  // closed form for a straight edge with r(x): removed = (1 - pi/4) * integral r^2 dx (the cross-section is exact only when the ball stays in the plane across the edge; with a changing size it tilts a little)
  let want; if (closed) want = k * closed(40); else { const f = (u) => (u <= 0.5 ? 1 + 8 * u : 5 - 8 * (u - 0.5)); let a = 0; const n = 20000; for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; a += f(u) ** 2 * (40 / n); } want = k * a; }
  console.log("   ", name.padEnd(12), "valid", L.valid(out), " removed", got.toFixed(3), " closed form (flat cross-sections)", want.toFixed(3), " diff", ((got - want) / want * 100).toFixed(2) + "%");
}
// ---- (2) crossed rods
const junction = (s) => { const by = new Map(); for (const f of L.facesOf(s)) for (const e of L.edgesOf(f)) { const k = L.edgeMid(e).join(","); by.set(k, [...(by.get(k) ?? []), { e, f }]); } return [...by.values()].filter((v) => v.length === 2 && v.every((x) => L.facts(x.f).type === "CYLINDRE")).map((v) => ({ e: v[0].e, f1: v[0].f, f2: v[1].f })); };
const lawFollowing = (j, S, W) => { // the wedge (air) angle at 9 places along the edge: a = pi - angle between the outward normals; the size is capped so the contact band S/tan(a/2) stays <= W
  const E = new Edge(L.downcast(j.e)), F1 = new Face(L.downcast(j.f1)), F2 = new Face(L.downcast(j.f2)), pts = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8, p = E.pointAt(u), n1 = F1.normalAt(p), n2 = F2.normalAt(p);
    const dot = (n1.x * n2.x + n1.y * n2.y + n1.z * n2.z) / (Math.hypot(n1.x, n1.y, n1.z) * Math.hypot(n2.x, n2.y, n2.z)), a = Math.PI - Math.acos(Math.max(-1, Math.min(1, dot)));
    pts.push([u, Math.min(S, W * Math.tan(a / 2)), (a * 180) / Math.PI]);
  }
  return pts;
};
const status = (s, out) => { try { const d = vol(out) - vol(s); return !L.valid(out) ? "INVALID" : d > 1e-6 ? `ok +${d.toFixed(0)}` : "NOTHING"; } catch { return "fail"; } };
console.log("(2) crossed rods; constant size vs a size that follows the wedge angle (cap S, contact band at most W = 3)");
for (const [rb, alpha, S] of [[9, 30, 6], [9.9, 30, 4], [9.9, 30, 6], [10, 30, 1], [10, 30, 3], [10, 60, 3], [10, 90, 3]]) {
  const s = fuse(rod(10, -40, 40), turnX(rod(rb, -40, 40), alpha)), js = junction(s);
  let c; try { const mk = new oc.BRepFilletAPI_MakeFillet(s, oc.ChFi3d_FilletShape.ChFi3d_Rational); for (const j of js) mk.Add(S, L.downcast(j.e)); c = status(s, mk.Shape()); } catch { c = "fail"; }
  const laws = js.map((j) => lawFollowing(j, S, 3)), angs = laws.flat().map((p) => p[2]), sz = laws.flat().map((p) => p[1]);
  let v; try { v = status(s, law(s, js.map((j) => j.e), laws.map((l) => l.map((p) => [p[0], p[1]])))); } catch (e) { v = "fail"; }
  console.log(`   rb ${rb} alpha ${alpha} S ${S}: constant ${c.padEnd(12)} following wedge ${v.padEnd(12)} (wedge ${Math.min(...angs).toFixed(0)}-${Math.max(...angs).toFixed(0)} deg, size ${Math.min(...sz).toFixed(2)}-${Math.max(...sz).toFixed(2)}, ${js.length} edges)`);
}

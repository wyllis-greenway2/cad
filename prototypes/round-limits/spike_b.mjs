// Spike 7B: a rod crossed by another rod (axes meet at angle alpha; alpha = 90 is a T); the junction edges rounded with constant sizes and with a size that varies along the edge.
import * as L from "../lineage-occt/lib.mjs";
import { assembleWire, makeLine, Face, Edge } from "replicad";
const { oc } = L;
const vol = (s) => { const p = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(s, p, false, false, false); return p.Mass(); };
const rodShape = (r, h0, h1) => {
  const e = [[0, h0], [r, h0], [r, h1], [0, h1]].map((p, i, a) => { const q = a[(i + 1) % 4]; return makeLine([p[0], 0, p[1]], [q[0], 0, q[1]]); });
  const f = new oc.BRepBuilderAPI_MakeFace(assembleWire(e).wrapped, true).Face();
  return new oc.BRepPrimAPI_MakeRevol(f, new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(0, 0, 1)), 2 * Math.PI, false).Shape();
};
const turnX = (s, deg) => { const t = new oc.gp_Trsf(); t.SetRotation(new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(1, 0, 0)), (deg * Math.PI) / 180); return new oc.BRepBuilderAPI_Transform(s, t, true).Shape(); };
const fuse = (a, b) => new oc.BRepAlgoAPI_Fuse(a, b, new oc.Message_ProgressRange()).Shape();
const junction = (s) => { // edges between two cylinder faces
  const byEdge = new Map();
  for (const f of L.facesOf(s)) for (const e of L.edgesOf(f)) { const k = L.edgeMid(e).join(","); byEdge.set(k, [...(byEdge.get(k) ?? []), { e, f }]); }
  return [...byEdge.values()].filter((v) => v.length === 2 && v.every((x) => L.facts(x.f).type === "CYLINDRE")).map((v) => ({ e: v[0].e, f1: v[0].f, f2: v[1].f }));
};
const build = (alpha, rb = 6) => fuse(rodShape(10, -40, 40), turnX(rodShape(rb, -40, 40), alpha));
const constant = (s, js, size, chamfer) => {
  try {
    const mk = chamfer ? new oc.BRepFilletAPI_MakeChamfer(s) : new oc.BRepFilletAPI_MakeFillet(s, oc.ChFi3d_FilletShape.ChFi3d_Rational);
    for (const j of js) mk.Add(size, L.downcast(j.e)); const out = mk.Shape();
    const d = vol(out) - vol(s); return !L.valid(out) ? "INVALID" : d > 1e-6 ? "ok" : "NOTHING";
  } catch { return "fail"; }
};
console.log("constant sizes, fillet / chamfer, on the junction edges only (alpha = angle between the axes, 90 = a T; rb = the crossing rod's radius, the main rod is 10); ok = valid and material added");
const sizes = [0.5, 1, 2, 3, 4, 5, 6];
for (const rb of [6, 9, 9.9, 10]) for (const alpha of [90, 60, 30]) {
  const s = build(alpha, rb), js = junction(s);
  console.log(` rb ${rb}  alpha ${String(alpha).padStart(2)}  junction edges ${js.length}`);
  console.log("   fillet ", sizes.map((z) => z + ":" + constant(s, js, z, false)).join("  "));
  console.log("   chamfer", sizes.map((z) => z + ":" + constant(s, js, z, true)).join("  "));
}

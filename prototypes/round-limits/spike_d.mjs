// Spike 7D: what size does the kernel's radius law actually make between the points given? Section the filleted block edge at several places and measure the area taken off the corner (area = r^2 (1 - pi/4)).
import * as L from "../lineage-occt/lib.mjs";
import { assembleWire, makeLine } from "replicad";
const { oc } = L;
const vol = (s) => { const p = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(s, p, false, false, false); return p.Mass(); };
const wireOf = (pts) => assembleWire(pts.map((p, i) => makeLine(p, pts[(i + 1) % pts.length]))).wrapped;
const faceOf = (w) => new oc.BRepBuilderAPI_MakeFace(w, true).Face();
const block = new oc.BRepPrimAPI_MakePrism(faceOf(wireOf([[0, 0, 0], [40, 0, 0], [40, 0, 30], [0, 0, 30]])), new oc.gp_Vec(0, 10, 0), false, true).Shape();
const edge = L.edgesOf(block).find((e) => { const m = L.edgeMid(e); return Math.abs(m[2] - 30) < 1e-6 && Math.abs(m[1]) < 1e-6; });
const slab = (x, d) => new oc.BRepPrimAPI_MakePrism(faceOf(wireOf([[x - d, -1, -1], [x - d, 11, -1], [x - d, 11, 31], [x - d, -1, 31]])), new oc.gp_Vec(2 * d, 0, 0), false, true).Shape();
const common = (a, b) => new oc.BRepAlgoAPI_Common(a, b, new oc.Message_ProgressRange()).Shape();
const law = (pts) => { const mk = new oc.BRepFilletAPI_MakeFillet(block, oc.ChFi3d_FilletShape.ChFi3d_Rational); const arr = new oc.NCollection_Array1_gp_Pnt2d(1, pts.length); pts.forEach((p, k) => arr.SetValue(k + 1, new oc.gp_Pnt2d(p[0], p[1]))); mk.Add(arr, L.downcast(edge)); return mk.Shape(); };
const sizeAt = (out, x) => { const d = 0.05, taken = vol(common(block, slab(x, d))) - vol(common(out, slab(x, d))); return Math.sqrt(taken / (2 * d) / (1 - Math.PI / 4)); };
// the edge's start end: which end is u = 0? find by the sizes found at both ends of a 1 -> 5 law
for (const [name, pts] of [["1 -> 5", [[0, 1], [1, 5]]], ["1 -> 5 -> 1", [[0, 1], [0.5, 5], [1, 1]]], ["2 -> 2 -> 2 (constant)", [[0, 2], [0.5, 2], [1, 2]]], ["1 -> 3 -> 5", [[0, 1], [0.5, 3], [1, 5]]]]) {
  const out = law(pts), xs = [0.5, 5, 10, 15, 20, 25, 30, 35, 39.5];
  console.log(name.padEnd(24), "valid", L.valid(out), " size at x =", xs.map((x) => x + ":" + sizeAt(out, x).toFixed(2)).join("  "));
}

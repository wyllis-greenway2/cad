// Spike 7H: the fill as (both dilations) - body - tubes of radius s+eps round the spine. A tube of exactly s is tangent to both rods (a boolean the kernel does badly); a hair larger crosses them.
import * as L from "../lineage-occt/lib.mjs";
import { assembleWire, makeLine, Edge } from "replicad";
const { oc } = L;
const vol = (s) => { const p = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(s, p, false, false, false); return p.Mass(); };
const rodShape = (r, h0, h1) => { const e = [[0, h0], [r, h0], [r, h1], [0, h1]].map((p, i, a) => { const q = a[(i + 1) % 4]; return makeLine([p[0], 0, p[1]], [q[0], 0, q[1]]); }); const f = new oc.BRepBuilderAPI_MakeFace(assembleWire(e).wrapped, true).Face(); return new oc.BRepPrimAPI_MakeRevol(f, new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(0, 0, 1)), 2 * Math.PI, false).Shape(); };
const turnX = (s, deg) => { const t = new oc.gp_Trsf(); t.SetRotation(new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(1, 0, 0)), (deg * Math.PI) / 180); return new oc.BRepBuilderAPI_Transform(s, t, true).Shape(); };
const offset = (shape, d) => { const mk = new oc.BRepOffsetAPI_MakeOffsetShape(); mk.PerformByJoin(shape, d, 1e-6, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false, new oc.Message_ProgressRange()); return mk.Shape(); };
const op = (K, a, b) => new oc[`BRepAlgoAPI_${K}`](a, b, new oc.Message_ProgressRange()).Shape();
const junction = (s) => { const by = new Map(); for (const f of L.facesOf(s)) for (const e of L.edgesOf(f)) { const k = L.edgeMid(e).join(","); by.set(k, [...(by.get(k) ?? []), { e, f }]); } return [...by.values()].filter((v) => v.length === 2 && v.every((x) => L.facts(x.f).type === "CYLINDRE")).map((v) => v[0].e); };
const tube = (e, r) => { const E = new Edge(L.downcast(e)), p = E.startPoint, t = E.tangentAt(0), wire = assembleWire([E]).wrapped; const ax = new oc.gp_Ax2(new oc.gp_Pnt(p.x, p.y, p.z), new oc.gp_Dir(t.x, t.y, t.z)), w = new oc.BRepBuilderAPI_MakeWire(new oc.BRepBuilderAPI_MakeEdge(new oc.gp_Circ(ax, r)).Edge()).Wire(); const mk = new oc.BRepOffsetAPI_MakePipeShell(wire); mk.Add(w, false, false); mk.SetMode(true); mk.Build(new oc.Message_ProgressRange()); mk.MakeSolid(); return mk.Shape(); };
const kernel = (s, js, size) => { try { const mk = new oc.BRepFilletAPI_MakeFillet(s, oc.ChFi3d_FilletShape.ChFi3d_Rational); for (const e of js) mk.Add(size, L.downcast(e)); const o = mk.Shape(); return L.valid(o) ? (vol(o) - vol(s)).toFixed(2) : "INVALID"; } catch { return "fail"; } };
const cases = JSON.parse(process.env.CASES ?? "[[6,90,1]]"), eps = JSON.parse(process.env.EPS ?? "[0.001]");
console.log("rb alpha size | kernel fillet adds | by regions with tube radius s+eps: adds, valid, seconds");
for (const [rb, alpha, size] of cases) {
  const a = rodShape(10, -25, 25), b = turnX(rodShape(rb, -25, 25), alpha), body = op("Fuse", a, b), js0 = junction(body);
  for (const e of eps) {
    const t0 = Date.now();
    try {
      const I = op("Common", offset(a, size), offset(b, size)), spine = junction(I); let air = op("Cut", I, body);
      for (const sp of spine) air = op("Cut", air, tube(sp, size + e));
      const closed = op("Fuse", body, air);
      console.log(String(rb).padEnd(4), String(alpha).padEnd(5), String(size).padEnd(4), "|", kernel(body, js0, size).padEnd(9), `| eps ${e}: ${(vol(closed) - vol(body)).toFixed(2)} valid ${L.valid(closed)} faces ${L.facesOf(closed).length}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    } catch (x) { console.log(String(rb).padEnd(4), String(alpha).padEnd(5), String(size).padEnd(4), "|", kernel(body, js0, size).padEnd(9), `| eps ${e}: THROWS`); }
  }
}

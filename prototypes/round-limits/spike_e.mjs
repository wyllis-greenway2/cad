// Spike 7E (unfinished, kept as evidence): the concave round built without the kernel's rolling ball. First tried as a closing with two offsets (the erosion fails in this OCCT build); then as a region: the air within s of both surfaces (the two dilations, minus the body) minus a pipe of radius s round the spine. The pipe comes out invalid on one of the two spine curves and the result is 23% off the kernel's fillet; see README B4.
import * as L from "../lineage-occt/lib.mjs";
import { assembleWire, makeLine, Face, Edge } from "replicad";
const { oc } = L;
const vol = (s) => { const p = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(s, p, false, false, false); return p.Mass(); };
const rodShape = (r, h0, h1) => { const e = [[0, h0], [r, h0], [r, h1], [0, h1]].map((p, i, a) => { const q = a[(i + 1) % 4]; return makeLine([p[0], 0, p[1]], [q[0], 0, q[1]]); }); const f = new oc.BRepBuilderAPI_MakeFace(assembleWire(e).wrapped, true).Face(); return new oc.BRepPrimAPI_MakeRevol(f, new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(0, 0, 1)), 2 * Math.PI, false).Shape(); };
const turnX = (s, deg) => { const t = new oc.gp_Trsf(); t.SetRotation(new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(1, 0, 0)), (deg * Math.PI) / 180); return new oc.BRepBuilderAPI_Transform(s, t, true).Shape(); };
const fuse = (a, b) => new oc.BRepAlgoAPI_Fuse(a, b, new oc.Message_ProgressRange()).Shape();
const build = (alpha, rb) => { const a = rodShape(10, -25, 25), b = turnX(rodShape(rb, -25, 25), alpha), s = fuse(a, b); s.__parts = [a, b]; return s; };
const junction = (s) => { const by = new Map(); for (const f of L.facesOf(s)) for (const e of L.edgesOf(f)) { const k = L.edgeMid(e).join(","); by.set(k, [...(by.get(k) ?? []), { e, f }]); } return [...by.values()].filter((v) => v.length === 2 && v.every((x) => L.facts(x.f).type === "CYLINDRE")).map((v) => v[0].e); };
const offset = (shape, d) => { const mk = new oc.BRepOffsetAPI_MakeOffsetShape(); mk.PerformByJoin(shape, d, 1e-6, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false, new oc.Message_ProgressRange()); if (!mk.IsDone()) throw new Error("offset failed"); return mk.Shape(); };
const kernelFillet = (s, edges, size) => { try { const mk = new oc.BRepFilletAPI_MakeFillet(s, oc.ChFi3d_FilletShape.ChFi3d_Rational); for (const e of edges) mk.Add(size, L.downcast(e)); const o = mk.Shape(); return L.valid(o) ? vol(o) - vol(s) : "INVALID"; } catch { return "fail"; } };
const cut = (a, b) => new oc.BRepAlgoAPI_Cut(a, b, new oc.Message_ProgressRange()).Shape();
const common = (a, b) => new oc.BRepAlgoAPI_Common(a, b, new oc.Message_ProgressRange()).Shape();
const stage = (label, f) => { try { return f(); } catch (e) { return { err: label + ": " + String(e.message ?? e).slice(0, 50) }; } };
/**
 * the concave round as a region, made without the kernel's rolling ball: where two surfaces meet in a crease, the fill is what lies in the air within s of both surfaces (the intersection of the two
 * dilations, minus the body) minus the pipe of radius s round the spine, the curve of the ball's centres (where the two dilated surfaces meet).
 */
const filled = (s, size) => {
  const [a, b] = s.__parts;
  const fat1 = stage("dilate 1", () => offset(a, size)), fat2 = stage("dilate 2", () => offset(b, size)); if (fat1.err) return fat1; if (fat2.err) return fat2;
  const T = (l, f) => { const t = Date.now(), r = f(); if (process.env.DBG) console.log("   ", l, r, `${Date.now() - t} ms`); return r; };
  const I = stage("both dilations", () => common(fat1, fat2)); if (I.err) return I; T("vol fat1", () => vol(fat1).toFixed(1)); T("vol fat2", () => vol(fat2).toFixed(1)); T("vol I", () => vol(I).toFixed(1) + " valid " + L.valid(I));
  const spine = stage("spine", () => junction(I)); if (spine.err) return spine;
  let air = stage("air", () => cut(I, s)); if (air.err) return air; T("vol air (I - body)", () => vol(air).toFixed(2) + " valid " + L.valid(air)); T("spine edges", () => spine.length);
  for (const e of spine) {
    const tube = stage("pipe", () => { const E = new Edge(L.downcast(e)), p = E.startPoint, t = E.tangentAt(0), wire = assembleWire([E]).wrapped; const pl = new oc.gp_Ax2(new oc.gp_Pnt(p.x, p.y, p.z), new oc.gp_Dir(t.x, t.y, t.z)); const ed = new oc.BRepBuilderAPI_MakeEdge(new oc.gp_Circ(pl, size)).Edge(); const w = new oc.BRepBuilderAPI_MakeWire(ed).Wire();
      const mk = new oc.BRepOffsetAPI_MakePipeShell(wire); mk.Add(w, false, false); mk.SetMode(process.env.FRENET === "1"); mk.Build(new oc.Message_ProgressRange()); mk.MakeSolid(); let sh = mk.Shape(); if (!L.valid(sh) && typeof oc.ShapeFix_Shape === 'function') { const fx = new oc.ShapeFix_Shape(sh); fx.Perform(new oc.Message_ProgressRange()); sh = fx.Shape(); if (process.env.DBG) console.log('    fixed tube valid', L.valid(sh), vol(sh).toFixed(2)); } return sh; }); if (tube.err) return tube;
    T("vol tube", () => vol(tube).toFixed(2) + " valid " + L.valid(tube)); air = stage("cut pipe", () => cut(air, tube)); if (air.err) return air; T("vol air after pipe", () => vol(air).toFixed(2) + " valid " + L.valid(air));
  }
  return stage("measure", () => { const closed = fuse(s, air); return { valid: L.valid(closed), added: vol(closed) - vol(s), faces: L.facesOf(closed).length, spine: spine.length }; });
};
console.log("rb alpha size | kernel fillet adds | closing (offset +s then -s) adds, valid, faces");
for (const [rb, alpha] of (process.env.CASES ? JSON.parse(process.env.CASES) : [[6, 90]])) {
  const s = build(alpha, rb), js = junction(s);
  for (const size of (process.env.SIZES ? JSON.parse(process.env.SIZES) : [1])) { const t0 = Date.now(); const k = kernelFillet(s, js, size); { const c = filled(s, size); console.log(String(rb).padEnd(4), String(alpha).padEnd(5), String(size).padEnd(4), "|", (typeof k === "number" ? k.toFixed(2) : k).padEnd(10), "|", c.err ? "ERR " + c.err : `${c.added.toFixed(2)} valid ${c.valid} faces ${c.faces} spine edges ${c.spine} (${Date.now() - t0} ms)`); } }
}

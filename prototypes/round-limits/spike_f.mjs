// Spike 7F: how close to equal radii (and how shallow an angle) the kernel's constant round still works on the junction of two rods. ok = valid and material added (or taken).
import * as L from "../lineage-occt/lib.mjs";
import { assembleWire, makeLine } from "replicad";
const { oc } = L;
const vol = (s) => { const p = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(s, p, false, false, false); return p.Mass(); };
const rodShape = (r, h0, h1) => { const e = [[0, h0], [r, h0], [r, h1], [0, h1]].map((p, i, a) => { const q = a[(i + 1) % 4]; return makeLine([p[0], 0, p[1]], [q[0], 0, q[1]]); }); const f = new oc.BRepBuilderAPI_MakeFace(assembleWire(e).wrapped, true).Face(); return new oc.BRepPrimAPI_MakeRevol(f, new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(0, 0, 1)), 2 * Math.PI, false).Shape(); };
const turnX = (s, deg) => { const t = new oc.gp_Trsf(); t.SetRotation(new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(1, 0, 0)), (deg * Math.PI) / 180); return new oc.BRepBuilderAPI_Transform(s, t, true).Shape(); };
const fuse = (a, b) => new oc.BRepAlgoAPI_Fuse(a, b, new oc.Message_ProgressRange()).Shape();
const junction = (s) => { const by = new Map(); for (const f of L.facesOf(s)) for (const e of L.edgesOf(f)) { const k = L.edgeMid(e).join(","); by.set(k, [...(by.get(k) ?? []), { e, f }]); } return [...by.values()].filter((v) => v.length === 2 && v.every((x) => L.facts(x.f).type === "CYLINDRE")).map((v) => v[0].e); };
const round = (s, js, size, chamfer) => { try { const mk = chamfer ? new oc.BRepFilletAPI_MakeChamfer(s) : new oc.BRepFilletAPI_MakeFillet(s, oc.ChFi3d_FilletShape.ChFi3d_Rational); for (const e of js) mk.Add(size, L.downcast(e)); const o = mk.Shape(); const d = vol(o) - vol(s); return !L.valid(o) ? "I" : Math.abs(d) < 1e-6 ? "0" : "o"; } catch { return "f"; } };
const sizes = [0.5, 1, 2, 4];
console.log("legend: o = ok (valid, changed), I = invalid solid, f = failed, 0 = valid but nothing changed. Sizes", sizes.join(" "));
for (const kind of ["fillet", "chamfer"]) { console.log(kind); for (const alpha of [90, 60, 45, 30, 20]) { const cells = []; for (const delta of [1, 0.1, 0.01, 0.001, 0]) { const s = fuse(rodShape(10, -25, 25), turnX(rodShape(10 - delta, -25, 25), alpha)), js = junction(s); cells.push(`d=${delta}: ` + sizes.map((z) => round(s, js, z, kind === "chamfer")).join("")); } console.log("  alpha", String(alpha).padEnd(3), cells.join("   ")); } }

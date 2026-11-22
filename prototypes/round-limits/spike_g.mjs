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
const roundAll = (s, js, size, chamfer) => { try { const mk = chamfer ? new oc.BRepFilletAPI_MakeChamfer(s) : new oc.BRepFilletAPI_MakeFillet(s, oc.ChFi3d_FilletShape.ChFi3d_Rational); for (const e of js) mk.Add(size, L.downcast(e)); const o = mk.Shape(); const d = vol(o) - vol(s); return L.valid(o) && Math.abs(d) > 1e-6 ? o : null; } catch { return null; } };
/** one edge after the other, each on the result of the one before (the edges of the result are found again by the faces they lie between: here, by their middle point) */
const oneByOne = (s, js, size, chamfer) => { let cur = s; const mids = js.map((e) => L.edgeMid(e)); for (const m of mids) { const e = L.edgesOf(cur).find((x) => { const q = L.edgeMid(x); return Math.hypot(q[0] - m[0], q[1] - m[1], q[2] - m[2]) < 1e-3; }); if (!e) continue; const next = roundAll(cur, [e], size, chamfer); if (!next) return null; cur = next; } return cur === s ? null : cur; };
const sizes = [0.5, 1, 2, 4], nudges = [0.002, -0.002, 0.005, -0.005, 0.01, -0.01];
const total = { cells: 0, failing: 0, nudge: 0, oneByOne: 0, either: 0 }, by = {};
for (const kind of ["fillet", "chamfer"]) for (const alpha of [90, 60, 45, 30, 20]) for (const delta of [1, 0.1, 0.01, 0.001, 0]) {
  const s = fuse(rodShape(10, -25, 25), turnX(rodShape(10 - delta, -25, 25), alpha)), js = junction(s), ch = kind === "chamfer";
  for (const size of sizes) {
    total.cells++; if (roundAll(s, js, size, ch)) continue; total.failing++;
    const n = nudges.some((d) => roundAll(s, js, size + d, ch)), o = oneByOne(s, js, size, ch) !== null;
    if (n) total.nudge++; if (o) total.oneByOne++; if (n || o) total.either++;
    const key = `${kind} a${alpha} d${delta}`; by[key] = by[key] ?? { fail: 0, nudge: 0, one: 0 }; by[key].fail++; if (n) by[key].nudge++; if (o) by[key].one++;
  }
  console.error(kind, alpha, delta, "done");
}
console.log(JSON.stringify(total));
for (const [k, v] of Object.entries(by)) console.log(k.padEnd(24), `failing ${v.fail}  rescued by a size nudge of at most 0.01 mm: ${v.nudge}  by rounding one edge after the other: ${v.one}`);

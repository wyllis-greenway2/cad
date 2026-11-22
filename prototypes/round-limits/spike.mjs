// Spike 7: (A) the pointed rod end as a revolved profile, (B) a fillet whose size varies along the edge (the kernel's radius law).
// Throwaway (CLAUDE.md rule 9). Run: node spike.mjs
import * as L from "../lineage-occt/lib.mjs";
import { assembleWire, makeThreePointArc, makeLine } from "replicad";
const { oc } = L;
const vol = (s) => { const p = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(s, p, false, false, false); return p.Mass(); };
const wire = (edges) => assembleWire(edges).wrapped;
const faceOf = (w) => new oc.BRepBuilderAPI_MakeFace(w, true).Face();
const cyl = (r, h) => { const f = faceOf(wire([L.makeCircleEdge?.(r)].filter(Boolean))); return f; };
// a rod of radius r, height h on the Z axis: revolve of a rectangle (exact, simple)
const revolveXZ = (pts, mids = []) => {
  const edges = pts.map((p, i) => { const q = pts[(i + 1) % pts.length], m = mids[i]; return m ? makeThreePointArc([p[0], 0, p[1]], [m[0], 0, m[1]], [q[0], 0, q[1]]) : makeLine([p[0], 0, p[1]], [q[0], 0, q[1]]); });
  const mk = new oc.BRepPrimAPI_MakeRevol(faceOf(wire(edges)), new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(0, 0, 1)), 2 * Math.PI, false);
  return mk.Shape();
};
const cut = (a, b) => new oc.BRepAlgoAPI_Cut(a, b, new oc.Message_ProgressRange()).Shape();
const nfaces = (s) => L.facesOf(s).length;
const row = (...c) => console.log(...c);

// ------------------------------------------------------------------ A: the pointed end
const r = 10, h = 30, rod = revolveXZ([[0, 0], [r, 0], [r, h], [0, h]]);
const tipTool = (s) => { // the region between the rod's corner and the arc of radius s tangent to the wall, ending on the axis at the top
  const t = Math.sqrt(2 * r * s - r * r), c = [r - s, h - t], phi = Math.atan2(t, s - r), mid = [c[0] + s * Math.cos(phi / 2), c[1] + s * Math.sin(phi / 2)];
  const pts = [[r, h - t], [0, h], [0, h + 2], [r + 2, h + 2], [r + 2, h - t]], mids = [mid, null, null, null, null];
  return { tool: revolveXZ(pts, mids), t };
};
const analytic = (s) => { // volume taken off, by integrating the ring of rod outside the arc
  const t = Math.sqrt(2 * r * s - r * r), z0 = h - t, n = 20000; let v = 0;
  for (let i = 0; i < n; i++) { const dz = ((i + 0.5) / n) * t, rho = r - s + Math.sqrt(Math.max(0, s * s - dz * dz)); v += Math.PI * (r * r - rho * rho) * (t / n); }
  return v;
};
row("A. rod r=10 h=30; pointed end of arc radius s (s = r is the dome; limit s =", ((h * h + r * r) / (2 * r)).toFixed(1) + ")");
row("   s       t     removed(kernel) removed(analytic)  diff    valid faces");
const full = vol(rod);
for (const s of [10, 10.5, 12, 15, 20, 30, 45, 50, 50.1, 60]) {
  const { tool, t } = tipTool(s);
  if (t > h + 1e-9) { row("  ", String(s).padEnd(7), t.toFixed(2).padStart(6), " beyond the rod's height: refuse"); continue; }
  try { const res = cut(rod, tool), rem = full - vol(res), an = analytic(s); row("  ", String(s).padEnd(7), t.toFixed(2).padStart(6), rem.toFixed(3).padStart(14), an.toFixed(3).padStart(15), (rem - an).toExponential(1).padStart(10), String(L.valid(res)).padStart(6), String(nfaces(res)).padStart(4)); }
  catch (e) { row("  ", s, "failed:", e.message ?? e); }
}
// continuity with the kernel's own fillet at s <= r
row("   continuity: kernel fillet vs the same size built as a region (s <= r; the region for s<r is the tangent arc with the flat kept)");
const rimEdge = (s) => L.edgesOf(s).find((e) => { const m = L.edgeMid(e); return Math.abs(m[2] - h) < 1e-6 && Math.hypot(m[0], m[1]) > r - 1e-3; });
for (const s of [3, 6, 9.9, 10]) {
  let kv = "fail";
  try { const mk = new oc.BRepFilletAPI_MakeFillet(rod, oc.ChFi3d_FilletShape.ChFi3d_Rational); mk.Add(s, L.downcast(rimEdge(rod))); const out = mk.Shape(); kv = L.valid(out) ? (full - vol(out)).toFixed(3) : "INVALID"; } catch (e) { kv = "fail"; }
  const mid = [r - s + s * Math.SQRT1_2, h - s + s * Math.SQRT1_2];
  const reg = revolveXZ([[r, h - s], [r - s, h], [r - s, h + 2], [r + 2, h + 2], [r + 2, h - s]], [mid, null, null, null, null]);
  row("  ", "s=" + s, " kernel removes", kv, "  region removes", (full - vol(cut(rod, reg))).toFixed(3));
}

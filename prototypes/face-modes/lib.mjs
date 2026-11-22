// Spike 8 harness: a face moved with its neighbours (mode 3) and a curved face offset (mode 4), by regions: the slab (or ring) between the old and the new surface, bounded by the neighbours' planes.
import * as L from "../lineage-occt/lib.mjs";
import { assembleWire, makeLine, makeCircle } from "replicad";
export const { oc } = L;
export const vol = (s) => { const p = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(s, p, false, false, false); return p.Mass(); };
const wireOf = (pts) => assembleWire(pts.map((p, i) => makeLine(p, pts[(i + 1) % pts.length]))).wrapped;
const faceOf = (w) => new oc.BRepBuilderAPI_MakeFace(w, true).Face();
export const prismOf = (pts, v) => new oc.BRepPrimAPI_MakePrism(faceOf(wireOf(pts)), new oc.gp_Vec(...v), false, true).Shape();
export const box = (x0, y0, z0, x1, y1, z1) => prismOf([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, z1 - z0]);
export const cylinder = (c, r, z0, z1) => new oc.BRepPrimAPI_MakePrism(faceOf(assembleWire([makeCircle(r, [c[0], c[1], z0], [0, 0, 1])]).wrapped), new oc.gp_Vec(0, 0, z1 - z0), false, true).Shape();
export const fuse = (a, b) => new oc.BRepAlgoAPI_Fuse(a, b, new oc.Message_ProgressRange()).Shape();
export const cut = (a, b) => new oc.BRepAlgoAPI_Cut(a, b, new oc.Message_ProgressRange()).Shape();
export const common = (a, b) => new oc.BRepAlgoAPI_Common(a, b, new oc.Message_ProgressRange()).Shape();
export const valid = L.valid;
export const unify = (s) => { const u = new oc.ShapeUpgrade_UnifySameDomain(s, true, true, false); u.Build(); return u.Shape(); };
export const nfaces = (s) => L.facesOf(s).length;
/** the half-space on the side of the plane (point p, normal n) where `ref` lies */
export function halfSpace(p, n, ref) {
  const pl = new oc.gp_Pln(new oc.gp_Pnt(...p), new oc.gp_Dir(...n)), f = new oc.BRepBuilderAPI_MakeFace(pl, -1e4, 1e4, -1e4, 1e4).Face();
  return new oc.BRepPrimAPI_MakeHalfSpace(f, new oc.gp_Pnt(...ref)).Solid();
}
export const info = (face) => { const q = L.facts(face); return { type: q.type, n: q.ne, c: q.ce, area: (() => { const p = new oc.GProp_GProps(); oc.BRepGProp.SurfaceProperties(face, p, false, false); return p.Mass(); })() }; };
export const neighbours = (solid, face) => { const mine = L.edgesOf(face); return L.facesOf(solid).filter((g) => !g.IsSame(face) && L.edgesOf(g).some((e) => mine.some((m) => m.IsSame(e)))); };
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const faces = L.facesOf;
export const unitOf = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
export const cylinderOf = (face) => { const s = new oc.BRepAdaptor_Surface(L.downcast(face), true), c = s.Cylinder(), a = c.Axis(), p = a.Location(), d = a.Direction(); return { r: c.Radius(), p: [p.X(), p.Y(), p.Z()], d: [d.X(), d.Y(), d.Z()] }; };

/**
 * mode 3: the face moves by `d` along its outward normal; the faces beside it (all flat) are carried on as planes. The tool is the slab between the old and the new plane, kept on the side of each
 * neighbour's plane where the face lies; it is added (d > 0) or taken (d < 0). Refuses when a neighbour is not flat, when the tool is empty (the neighbours meet: the face has collapsed) or the result is invalid.
 */
export function moveFace(solid, face, d) {
  const f = info(face); if (f.type !== "PLANE") return { refused: `the face is ${f.type}, not flat` };
  const s = Math.sign(d), all = faces(solid).map((g) => L.facts(g)), lo = [0, 1, 2].map((i) => Math.min(...all.map((q) => q.lo[i]))), hi = [0, 1, 2].map((i) => Math.max(...all.map((q) => q.hi[i]))), pad = 10 * (Math.max(...hi.map((v, i) => v - lo[i])) + Math.abs(d));
  // the half-spaces are infinite and cannot be intersected with each other (the kernel gives garbage), so the slab starts as a finite box far larger than the body
  let tool = box(lo[0] - pad, lo[1] - pad, lo[2] - pad, hi[0] + pad, hi[1] + pad, hi[2] + pad);
  tool = common(tool, halfSpace(f.c, f.n.map((x) => x * s), f.c.map((x, i) => x + f.n[i] * s * Math.abs(d) * 0.5)));
  tool = common(tool, halfSpace(f.c.map((x, i) => x + f.n[i] * s * Math.abs(d)), f.n.map((x) => -x * s), f.c));
  for (const g of neighbours(solid, face)) {
    const q = info(g); if (q.type !== "PLANE") return { refused: `a neighbour is ${q.type}, not flat` };
    const side = dot(sub(f.c, q.c), q.n); if (Math.abs(side) < 1e-9) return { refused: "the face's centre lies on a neighbour's plane" };
    tool = common(tool, halfSpace(q.c, q.n, f.c));
    if (vol(tool) < 1e-9) return { refused: "collapsed: the neighbours meet before the face gets there", collapsed: true };
  }
  // the face at the new plane must still exist: past the distance where the neighbours meet the tool is a roof with no flat top, and nothing more is added
  const topPlane = f.c.map((x, i) => x + f.n[i] * d), here = faces(tool).some((g) => { const q = info(g); return q.type === "PLANE" && Math.abs(dot(q.n, f.n)) > 0.999 && Math.abs(dot(sub(q.c, topPlane), f.n)) < 1e-6 && q.area > 1e-6; });
  if (!here) return { refused: "collapsed: the neighbours meet before the face gets there", collapsed: true };
  const out = unify(d > 0 ? fuse(solid, tool) : cut(solid, tool));
  return valid(out) ? { solid: out, tool } : { refused: "the result is not valid" };
}
/** the distance at which the face collapses (the neighbours meet), by halving; null when it does not collapse within `max` */
export function collapseAt(solid, face, max = 500) {
  if (!moveFace(solid, face, max).collapsed) return null;
  let lo = 0, hi = max; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (moveFace(solid, face, mid).collapsed) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

import { Face, Edge } from "replicad";
/**
 * mode 4: a cylinder's wall moved by `d` along its outward normal, i.e. its radius changes (a boss's wall moved outward is a bigger boss; a hole's wall moved outward, into the part's material... see `add`).
 * The tool is the ring between the old and the new radius, kept on the side of each neighbour's plane where the wall lies, added (d > 0: material gained) or taken (d < 0). Axis along Z (the spike). Refuses when a neighbour is not flat.
 */
export function moveCylinder(solid, face, d) {
  const q = info(face); if (q.type !== "CYLINDRE") return { refused: `the face is ${q.type}, not a cylinder` };
  const cy = cylinderOf(face); if (Math.abs(Math.abs(cy.d[2]) - 1) > 1e-9) return { refused: "the axis is not along Z (the spike)" };
  // outward normal at a point of the wall (the middle of its first edge): away from the axis = a boss, toward it = a hole
  const m = L.edgeMid(L.edgesOf(face)[0]), pt = new oc.gp_Pnt(m[0], m[1], m[2]), nrm = new Face(L.downcast(face)).normalAt(pt), boss = (nrm.x * (m[0] - cy.p[0]) + nrm.y * (m[1] - cy.p[1])) > 0;
  const r2 = boss ? cy.r + d : cy.r - d; if (!(r2 > 1e-6)) return { refused: "the radius would not be above nothing" };
  const all = faces(solid).map((g) => L.facts(g)), z0 = Math.min(...all.map((x) => x.lo[2])) - 5, z1 = Math.max(...all.map((x) => x.hi[2])) + 5, R1 = Math.min(cy.r, r2), R2 = Math.max(cy.r, r2);
  let tool = cut(cylinder(cy.p, R2, z0, z1), cylinder(cy.p, R1, z0 - 1, z1 + 1));
  for (const g of neighbours(solid, face)) {
    const n = info(g);
    if (n.type === "CYLINDRE") { const o = cylinderOf(g); if (Math.abs(o.r - cy.r) < 1e-9 && Math.abs(o.p[0] - cy.p[0]) < 1e-9 && Math.abs(o.p[1] - cy.p[1]) < 1e-9) continue; } // another piece of the same wall (a wall the kernel split at its seam), moved with it
    if (n.type !== "PLANE") return { refused: `a neighbour is ${n.type}, not flat` };
    tool = common(tool, halfSpace(n.c, n.n, q.c));
  }
  if (vol(tool) < 1e-9) return { refused: "nothing between the old wall and the new one" };
  const out = unify(d > 0 ? fuse(solid, tool) : cut(solid, tool));
  return valid(out) ? { solid: out, boss, r: cy.r, r2 } : { refused: "the result is not valid" };
}

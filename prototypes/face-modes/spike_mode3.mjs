// Mode 3: a face moved with its neighbours. Node spike_mode3.mjs
import * as M from "./lib.mjs";
const near = (s, f) => M.faces(s).find((g) => f(M.info(g)));
const up = (q) => q.type === "PLANE" && q.n[2] > 0.99;
const W = 40, H = 30, D = 10, C = 3;
const row = (name, ...c) => console.log(name.padEnd(46), ...c);
// ---- 1. a plain block: moving the top = taller, exactly
const block = M.box(0, 0, 0, W, H, D);
for (const d of [5, -4]) { const r = M.moveFace(block, near(block, (q) => up(q) && Math.abs(q.c[2] - D) < 1e-6), d); row(`plain block, top moved ${d}`, r.refused ?? `volume ${M.vol(r.solid).toFixed(3)} (expected ${(W * H * (D + d)).toFixed(3)})  faces ${M.nfaces(r.solid)}`); }
// ---- 2. the chamfered block (top edges chamfered 3): the human's example
const topEdges = (b) => { const f = near(b, (q) => up(q)), out = [], ex = new M.oc.TopExp_Explorer(f, M.oc.TopAbs_ShapeEnum.TopAbs_EDGE, M.oc.TopAbs_ShapeEnum.TopAbs_SHAPE); const seen = []; for (; ex.More(); ex.Next()) { const e = ex.Current(); if (!seen.some((s) => s.IsSame(e))) { seen.push(e); out.push(M.oc.TopoDS.Edge(e)); } } return out; };
const chamfered = (() => { const mk = new M.oc.BRepFilletAPI_MakeChamfer(block); for (const e of topEdges(block)) mk.Add(C, e); return mk.Shape(); })();
console.log("chamfered block:", M.nfaces(chamfered), "faces, volume", M.vol(chamfered).toFixed(3), "valid", M.valid(chamfered));
const topOf = (s) => M.faces(s).filter((g) => up(M.info(g))).sort((a, b) => M.info(b).c[2] - M.info(a).c[2])[0];
const analytic = (d) => { const sec = (z) => (W - 2 * Math.max(0, z - D + C)) * (H - 2 * Math.max(0, z - D + C)); let v = W * H * (D - C); const n = 4000, z0 = D - C, z1 = D + d; for (let i = 0; i < n; i++) v += sec(z0 + ((i + 0.5) / n) * (z1 - z0)) * ((z1 - z0) / n); return v; };
for (const d of [2, 5, 10, 11.9, 12.5]) { const r = M.moveFace(chamfered, topOf(chamfered), d); row(`chamfered block, top moved +${d}`, r.refused ?? `volume ${M.vol(r.solid).toFixed(3)} (analytic ${analytic(d).toFixed(3)})  faces ${M.nfaces(r.solid)}  top area ${(topOf(r.solid) ? M.info(topOf(r.solid)).area : 0).toFixed(2)}`); }
row("collapse distance (expected 12)", M.collapseAt(chamfered, topOf(chamfered))?.toFixed(4));
for (const d of [-1, -3, -5]) { const r = M.moveFace(chamfered, topOf(chamfered), d); row(`chamfered block, top moved ${d}`, r.refused ?? `volume ${M.vol(r.solid).toFixed(3)}  faces ${M.nfaces(r.solid)}  top area ${(topOf(r.solid) ? M.info(topOf(r.solid)).area : 0).toFixed(2)}`); }
// ---- 3. a pocket's floor raised and lowered
const pocket = M.cut(block, M.box(15, 10, 4, 25, 20, 11)), floorOf = (s) => near(s, (q) => up(q) && Math.abs(q.c[2] - 4) < 1e-6);
for (const d of [2, -3]) { const r = M.moveFace(pocket, floorOf(pocket), d); row(`pocket floor moved ${d} (pocket 10x10, depth 6)`, r.refused ?? `volume ${M.vol(r.solid).toFixed(3)} (expected ${(M.vol(pocket) + 100 * d).toFixed(3)})  faces ${M.nfaces(r.solid)}`); }
// ---- 4. an L: a wall of the notch moved into the notch (the neighbours are concave and perpendicular)
const L = M.cut(M.box(0, 0, 0, 40, 40, 10), M.box(20, 20, -1, 41, 41, 11)), wall = near(L, (q) => q.type === "PLANE" && q.n[0] > 0.99 && Math.abs(q.c[0] - 20) < 1e-6);
for (const d of [5, -5]) { const r = M.moveFace(L, wall, d); row(`L-block, notch wall moved ${d}`, r.refused ?? `volume ${M.vol(L) + 0 > 0 ? M.vol(r.solid).toFixed(3) : ""} (expected ${(M.vol(L) + 200 * d).toFixed(3)})  faces ${M.nfaces(r.solid)}`); }
// ---- 5. refusals: a flat face beside a curved one
const slot = M.cut(block, M.cylinder([20, 15], 4, -1, 11)), topWithHole = near(slot, (q) => up(q) && Math.abs(q.c[2] - D) < 1e-6);
{ const r = M.moveFace(slot, topWithHole, 3); row("block with a round hole: top moved +3", r.refused ?? `volume ${M.vol(r.solid).toFixed(3)} (expected ${(M.vol(slot) + 3 * (W * H - Math.PI * 16)).toFixed(3)}) faces ${M.nfaces(r.solid)}`); }
{ const r = M.moveFace(slot, near(slot, (q) => q.type === "PLANE" && q.n[0] > 0.99), 3); row("block with a round hole: end wall moved +3 (the hole is not beside it)", r.refused ?? `volume ${M.vol(r.solid).toFixed(3)} (expected ${(M.vol(slot) + 3 * H * D).toFixed(3)}) faces ${M.nfaces(r.solid)}`); }

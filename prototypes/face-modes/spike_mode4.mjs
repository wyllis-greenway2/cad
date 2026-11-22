// Mode 4: a cylinder's wall moved (its radius changed) with its neighbours kept. Compared with the same part made fresh with the final radius. Node spike_mode4.mjs
import * as M from "./lib.mjs";
const W = 40, H = 30, D = 10;
const same = (a, b) => { const fa = M.faces(a).map(M.info), fb = M.faces(b).map(M.info), used = new Set(); let missing = 0; for (const f of fa) { const j = fb.findIndex((g, i) => !used.has(i) && g.type === f.type && Math.abs(g.area - f.area) < 1e-3 * Math.max(1, f.area) && g.c.every((v, k) => Math.abs(v - f.c[k]) < 1e-2)); if (j < 0) missing++; else used.add(j); } return { faces: `${fa.length}/${fb.length}`, unmatched: missing, dv: M.vol(a) - M.vol(b) }; };
const wallOf = (s, pred) => M.faces(s).find((g) => { const q = M.info(g); return q.type === "CYLINDRE" && pred(M.cylinderOf(g)); });
const run = (name, make, which, ds, fresh) => { const base = make(); for (const d of ds) { const f = which(base), r = M.moveCylinder(base, f, d); if (r.refused) { console.log(name.padEnd(34), String(d).padStart(6), r.refused); continue; } const s = same(r.solid, fresh(r.r2)); console.log(name.padEnd(34), String(d).padStart(6), `r ${r.r} -> ${r.r2.toFixed(2)}`.padEnd(16), `volume ${M.vol(r.solid).toFixed(3)}`, `vs fresh: faces ${s.faces}, unmatched ${s.unmatched}, volume diff ${s.dv.toExponential(1)}`); } };
const block = () => M.box(0, 0, 0, W, H, D);
const through = (r) => M.cut(block(), M.cylinder([20, 15], r, -1, 11)), blind = (r) => M.cut(block(), M.cylinder([20, 15], r, 4, 11)), boss = (r) => M.fuse(block(), M.cylinder([20, 15], r, D - 1, 20));
run("through hole r=4", () => through(4), (b) => wallOf(b, () => true), [1.5, -1.5, -8, -12, -13], through);
run("blind hole r=4, depth 6", () => blind(4), (b) => wallOf(b, () => true), [1.5, -1.5, -6], blind);
run("boss r=5 on the top", () => boss(5), (b) => wallOf(b, () => true), [1.5, -2, -4.9], boss);
run("hole broken out at the side (r 6)", () => M.cut(block(), M.cylinder([5, 15], 6, -1, 11)), (b) => wallOf(b, () => true), [-1, -4], (r) => M.cut(block(), M.cylinder([5, 15], r, -1, 11)));
console.log("OCCT's offset of ONE face: BRepOffset_MakeOffset (which has SetOffsetOnFace) is not in this build:", typeof M.oc.BRepOffset_MakeOffset);

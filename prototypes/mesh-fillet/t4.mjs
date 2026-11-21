import * as M from "./mf.mjs";
const { Manifold, CrossSection } = M;
M.curved.add(9000);
const W = 40, H = 30, rc = 6, h = 10, r = 2;
function body(segs) {
  const pts = []; const corner = (cx, cy, a0) => { for (let k = 0; k <= segs; k++) { const a = a0 + (Math.PI / 2) * k / segs; pts.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]); } };
  corner(W - rc, H - rc, 0); corner(rc, H - rc, Math.PI / 2); corner(rc, rc, Math.PI); corner(W - rc, rc, 1.5 * Math.PI);
  return M.tag(Manifold.extrude(CrossSection.ofPolygons([pts]), h), (nn) => (Math.abs(nn[2]) > 0.99 ? (nn[2] > 0 ? 200 : 201) : 600 + Math.round((Math.atan2(nn[1], nn[0]) * 180) / Math.PI / (90 / segs))));
}
const perim = 2 * (W - 2 * rc) + 2 * (H - 2 * rc), exact = (1 - Math.PI / 4) * r * r * (perim + 2 * Math.PI * (rc - 0.2232 * r));
for (const segs of [8, 16]) for (const ov of [0, 1e-6, 1e-4, 1e-3, 1e-2]) {
  const b = body(segs), topF = M.faces(b).list.find((f) => f.n[2] > 0.99 && f.fid === 200);
  const t0 = performance.now();
  const res = M.filletLoop(b, topF.id, r, { roundId: 9000, toolId: 9001 }, ov);
  const c = M.clean(res.man), G = M.faces(c.man);
  console.log(`facets/corner ${segs} overlap ${String(ov).padEnd(6)} removed ${(b.volume() - c.man.volume()).toFixed(3)} (exact ${exact.toFixed(3)}) pieces ${res.man.decompose().length} (dust ${c.dust}) genus ${c.man.genus()} round faces ${G.list.filter((f) => f.fid === 9000).length} status ${c.man.status()} ${(performance.now() - t0).toFixed(0)} ms`);
}

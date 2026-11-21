import * as M from "./mf.mjs";
const { Manifold, CrossSection } = M;
M.curved.add(9000);
// 1. does a split hide behind "101.0"?
{
  let b = M.box(40, 30, 10, 100);
  const cyl = M.tag(Manifold.cylinder(12, 4, 4, 48).translate([38, 15, -1]), () => 400);
  b = b.subtract(cyl);
  const G = M.faces(b); console.log("hole breaks the +x wall: faces of 101:", G.list.filter(f=>f.fid===101).map(f=>f.id+" area "+f.area.toFixed(1)).join(" , "));
}
// 2. a rounded rectangle (corner radius 6, 16 facets per corner), every top edge filleted r 2
for (const [segs, label] of [[16, "16 facets per corner"], [32, "32 facets per corner"]]) {
  const W = 40, H = 30, rc = 6, h = 10, r = 2;
  const pts = []; const corner = (cx, cy, a0) => { for (let k = 0; k <= segs; k++) { const a = a0 + (Math.PI / 2) * k / segs; pts.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]); } };
  corner(W - rc, H - rc, 0); corner(rc, H - rc, Math.PI / 2); corner(rc, rc, Math.PI); corner(W - rc, rc, 1.5 * Math.PI);
  let b = Manifold.extrude(CrossSection.ofPolygons([pts]), h);
  b = M.tag(b, (nn) => (Math.abs(nn[2]) > 0.99 ? (nn[2] > 0 ? 200 : 201) : 500));
  M.curved.add(500);
  // the wall is one curved-ish face of many facets only for the arcs; planar parts are coplanar: group by fid 500 would merge all walls, so tag walls by normal direction instead
  b = M.tag(b, (nn, A) => (Math.abs(nn[2]) > 0.99 ? (nn[2] > 0 ? 200 : 201) : 600 + Math.round((Math.atan2(nn[1], nn[0]) * 180) / Math.PI / (90 / segs))));
  const v0 = b.volume(), t0 = performance.now();
  const G0 = M.faces(b), topF = G0.list.find((f) => f.n[2] > 0.99 && f.fid === 200);
  const res = M.filletLoop(b, topF.id, r, { roundId: 9000, toolId: 9001 }); const cur = res.man, n = res.edges, refused = 0;
  const dt = performance.now() - t0;
  const perim = 2 * (W - 2 * rc) + 2 * (H - 2 * rc), exact = (1 - Math.PI / 4) * r * r * (perim + 2 * Math.PI * (rc - 0.2232 * r));
  const parts = cur.decompose();
  console.log(`${label}: ${n} fillets (${refused} refused) in ${(dt/1000).toFixed(1)} s; removed ${(v0 - cur.volume()).toFixed(3)} vs exact ${exact.toFixed(3)} (${(100*((v0-cur.volume())-exact)/exact).toFixed(2)}%); status ${cur.status()}; pieces ${parts.length}; tris ${cur.numTri()}; round faces ${M.faces(cur).list.filter(f=>f.fid===9000).length}`);
}
// inspect the pieces of the last result
{
  const W = 40, H = 30, rc = 6, h = 10, r = 2, segs = 16;
  const pts = []; const corner = (cx, cy, a0) => { for (let k = 0; k <= segs; k++) { const a = a0 + (Math.PI / 2) * k / segs; pts.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]); } };
  corner(W - rc, H - rc, 0); corner(rc, H - rc, Math.PI / 2); corner(rc, rc, Math.PI); corner(W - rc, rc, 1.5 * Math.PI);
  let b = Manifold.extrude(CrossSection.ofPolygons([pts]), h);
  b = M.tag(b, (nn, A) => (Math.abs(nn[2]) > 0.99 ? (nn[2] > 0 ? 200 : 201) : 600 + Math.round((Math.atan2(nn[1], nn[0]) * 180) / Math.PI / (90 / segs))));
  const topF = M.faces(b).list.find((f) => f.n[2] > 0.99 && f.fid === 200);
  const res = M.filletLoop(b, topF.id, r, { roundId: 9000, toolId: 9001 });
  const parts = res.man.decompose();
  console.log("pieces:", parts.map((p) => p.volume().toExponential(2)).sort().join(" "));
  const c = M.clean(res.man);
  const G = M.faces(c.man);
  console.log("after clean: dust", c.dust, "pieces", c.man.decompose().length, "round faces", G.list.filter((f) => f.fid === 9000).length, "tris", c.man.numTri(), "volume", c.man.volume().toFixed(3), "genus", c.man.genus());
  const rf = G.list.filter((f) => f.fid === 9000).slice(0, 4).map((f) => `${f.tris.length} tris area ${f.area.toFixed(2)}`); console.log(rf.join(" | "));
}

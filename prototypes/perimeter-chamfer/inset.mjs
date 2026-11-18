// Prototype (thrown away, `in_865`): a perimeter chamfer built in, by a ruled loft through four outlines: the outline inset by c at the bottom face, the full outline c above it, the full outline c below the top face, the inset outline at the top.
// The inset outline of an involute gear is a gear outline of the same shape: the offset of an involute is an involute of the same base circle, so it is the same gear with a profile shift of -c / m (tip and root radii each c less) and
// teeth thinner by 2 c / cos(alpha) on the pitch circle. A ring is the same with the signs the other way.
// Run (from app/): Z=20 C=0.4 node ../prototypes/perimeter-chamfer/inset.mjs      RING=1 for a ring
import { makeSolid, addHolesInFace, cast, makeThreePointArc, makeLine, assembleWire, makeFace, basicFaceExtrusion, makeCircle, measureVolume, Vector, loft, makeCylinder } from "../../app/node_modules/replicad/dist/replicad.js";
import { init } from "../../app/src/compiler/kernel/occt/evaluate.mjs";
import { isValidSolid } from "../../app/src/compiler/kernel/occt/interpreter.mjs";
import { gearOutline } from "../../app/src/operation/gear.ts";
await init();
const Z = Number(process.env.Z ?? 20), M = 2, W = 8, C = Number(process.env.C ?? 0.4), RING = !!process.env.RING, BORE = 5, ALPHA = (20 * Math.PI) / 180;
const ms = (f) => { const t0 = performance.now(); const v = f(); return [v, Math.round(performance.now() - t0)]; };
const base = { teeth: Z, module: M, bore: BORE, width: W };
// the inset outline: external: thinner teeth (backlash 2c (1 - sin a) / cos a with the shift -c/m taking the radii in by c); a ring: the material is outside the teeth, so its teeth (holes between them) get wider: the same with the sign of the shift reversed
const inset = { ...base, shift: -C / M, backlash: (2 * C * (1 - Math.sin(ALPHA))) / Math.cos(ALPHA) };
const [full, inn] = [gearOutline(base), gearOutline(inset)];
if (!full.ok || !inn.ok) throw new Error((full.error ?? inn.error));
const wireOf = (o, h) => assembleWire(o.value.points.map((a, i) => {
  const b = o.value.points[(i + 1) % o.value.points.length], k = o.value.bulges[i];
  const p = (q) => [q[0], q[1], h];
  if (!k) return makeLine(p(a), p(b));
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  return makeThreePointArc(p(a), [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k, h], p(b));
}));
console.log(`teeth ${Z}: ${full.value.points.length} points full, ${inn.value.points.length} inset; tip ${full.value.tipRadius.toFixed(3)} -> ${inn.value.tipRadius.toFixed(3)}, root ${full.value.rootRadius.toFixed(3)} -> ${inn.value.rootRadius.toFixed(3)}`);
if (full.value.points.length !== inn.value.points.length) throw new Error("the outlines have different numbers of sides: the loft cannot join them");
if (!RING) {
// the plain gear for the volume, and the ruled loft
const plain = basicFaceExtrusion(makeFace(wireOf(full, 0), [assembleWire([makeCircle(BORE / 2, [0, 0, 0], [0, 0, -1])])]), new Vector([0, 0, W]));
const [body, tLoft] = ms(() => loft([wireOf(inn, 0), wireOf(full, C), wireOf(full, W - C), wireOf(inn, W)], { ruled: true }));
console.log(`ruled loft through the four outlines: ${tLoft} ms, volume ${measureVolume(body).toFixed(1)} (plain with no bore ${(measureVolume(plain) + Math.PI * (BORE / 2) ** 2 * W).toFixed(1)}), faces ${body.faces.length}, valid ${isValidSolid(body)}`);
// the bore: a cutter that is the bore with its rim chamfered
const cutter = loft([makeCircle(BORE / 2 + C + 0.2, [0, 0, -0.2]), makeCircle(BORE / 2, [0, 0, C]), makeCircle(BORE / 2, [0, 0, W - C]), makeCircle(BORE / 2 + C + 0.2, [0, 0, W + 0.2])].map((e) => assembleWire([e])), { ruled: true });
const [made, tCut] = ms(() => body.clone().cut(cutter));
console.log(`bore cut: ${tCut} ms, volume ${measureVolume(made).toFixed(1)}, faces ${made.faces.length}, valid ${isValidSolid(made)}; total ${tLoft + tCut} ms`);
  // the same with no boolean: the loft's shell, the chamfered bore's shell turned the other way, and the two ends, sewn
  const innF = gearOutline({ ...base, shift: -C / M, backlash: (2 * C * (1 - Math.sin(ALPHA))) / Math.cos(ALPHA) }); // (the inset outline exactly at the face: the same as the loft's own first section)
  const [solid2, tSew] = ms(() => {
    const outer = loft([wireOf(inn, 0), wireOf(full, C), wireOf(full, W - C), wireOf(inn, W)], { ruled: true }, true);
    const bw = [BORE / 2 + C, BORE / 2, BORE / 2, BORE / 2 + C].map((r, i) => assembleWire([makeCircle(r, [0, 0, [0, C, W - C, W][i]])]));
    const inner = loft(bw, { ruled: true }, true);
    const cap = (k) => addHolesInFace(makeFace(wireOf(inn, k === 0 ? 0 : W)), [bw[k === 0 ? 0 : 3]]);
    return makeSolid([outer, cast(inner.wrapped.Reversed()), cap(0), cap(1)]);
  });
  console.log(`no boolean (shells sewn): ${tSew} ms, volume ${measureVolume(solid2).toFixed(1)}, faces ${solid2.faces.length}, valid ${isValidSolid(solid2)}`);

}

// ---- a ring: the hole's outline (teeth of the ring pointing in) and the outer wall ----
if (RING) {
  const P = (2 * Math.PI) / Z, polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  const inv = (a) => Math.tan(a) - a;
  /** the outline of the hole of a ring as the app draws it (`gear.ts`, internal branch), with the tip and root circles moved out by `d` and the teeth thinner by `d2` (mm on the pitch circle) */
  function hole(d, thin) {
    const [rp, clr, rim] = [(M * Z) / 2, 0.25, 2];
    const rb = rp * Math.cos(ALPHA);
    const half0 = (Math.PI / 2) * M / (2 * rp) - thin / (2 * rp);
    const half = (r) => half0 + inv(Math.acos(Math.min(1, rb / r))) - inv(ALPHA); // (an internal gear: the angle grows with the radius)
    const [rr, rt] = [rp + M * (1 + clr) + d, rp - M + d];
    const tOf = (r) => Math.sqrt(Math.max(0, (r / rb) ** 2 - 1)), rOf = (t) => rb * Math.sqrt(1 + t * t);
    const at = (r, c, side) => polar(r, c + side * half(r));
    const ARCS = 4, points = [], bulges = [];
    const bulgeOf = (a, m2, b) => { const [dx, dy] = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(dx, dy); const off = ((m2[0] - (a[0] + b[0]) / 2) * -dy + (m2[1] - (a[1] + b[1]) / 2) * dx) / len; return Math.abs(off) < 1e-12 ? 0 : off / len; };
    const edge = (a, m2, b) => bulges.push(bulgeOf(a, m2, b));
    const flank = (lo, hi, c, side) => { const [t0, t1] = [tOf(lo), tOf(hi)]; const p = [], mid = []; for (let j = 0; j <= ARCS; j++) p.push(at(rOf(t0 + ((t1 - t0) * j) / ARCS), c, side)); for (let j = 0; j < ARCS; j++) mid.push(at(rOf(t0 + ((t1 - t0) * (j + 0.5)) / ARCS), c, side)); return { p, mid }; };
    for (let k = 0; k < Z; k++) {
      const phi = k * P;
      const cw = flank(rt, rr, phi, -1), ccw = flank(rt, rr, phi, 1);
      for (let j = ARCS; j >= 0; j--) { points.push(cw.p[j]); if (j > 0) edge(cw.p[j], cw.mid[j - 1], cw.p[j - 1]); }
      edge(cw.p[0], polar(rt, phi), ccw.p[0]);
      for (let j = 0; j <= ARCS; j++) { points.push(ccw.p[j]); if (j < ARCS) edge(ccw.p[j], ccw.mid[j], ccw.p[j + 1]); }
      edge(ccw.p[ARCS], polar(rr, phi + P / 2), flank(rt, rr, (k + 1) * P, -1).p[ARCS]);
    }
    return { points, bulges, outer: rr + M * rim };
  }
  const thin = (2 * C) / Math.cos(ALPHA); // (each flank moves by c, along the base circle: the tooth is thinner by 2 c / cos(alpha) on the pitch circle)
  const E = 0.2; // (the tool reaches this far past each face along the same slope, so that its ends are not in the faces of the wall)
  const [h0, h1] = [hole(0, 0), hole(C + E, (2 * (C + E)) / Math.cos(ALPHA))];
  const h1c = hole(C, (2 * C) / Math.cos(ALPHA)); // (the inset outline exactly at the face)
  const ring = gearOutline({ teeth: Z, module: M, internal: true, width: W });
  console.log(`ring ${Z}: ${ring.value.points.length} points in the app's outline, ${h0.points.length} here; a point of each: ${JSON.stringify(ring.value.points[7].map((x) => +x.toFixed(4)))} ${JSON.stringify(h0.points[7].map((x) => +x.toFixed(4)))}`);
  const wireH = (o, z) => assembleWire(o.points.map((a, i) => { const b = o.points[(i + 1) % o.points.length], k = o.bulges[i]; const p = (q) => [q[0], q[1], z]; if (!k) return makeLine(p(a), p(b)); const [dx, dy] = [b[0] - a[0], b[1] - a[1]]; return makeThreePointArc(p(a), [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k, z], p(b)); }));
  const R = h0.outer;
  const [wall, tWall] = ms(() => loft([R - C, R, R, R - C].map((r, i) => assembleWire([makeCircle(r, [0, 0, [0, C, W - C, W][i]])])), { ruled: true }));
  const [tool, tTool] = ms(() => loft([wireH(h1, -E), wireH(h0, C), wireH(h0, W - C), wireH(h1, W + E)], { ruled: true }));
  const [made, tCut] = ms(() => wall.clone().cut(tool.clone()));
  console.log(`wall ${tWall} ms, hole tool (ruled loft) ${tTool} ms, cut ${tCut} ms, total ${tWall + tTool + tCut} ms; volume ${measureVolume(made).toFixed(1)}, faces ${made.faces.length}, valid ${isValidSolid(made)}`);
  // the same without a boolean: the faces of the outer chamfered wall, of the chamfered hole (turned the other way) and the two flat ends with their hole, sewn into one solid
  const [solid2, tSew] = ms(() => {
    const circles = [R - C, R, R, R - C].map((r, i) => assembleWire([makeCircle(r, [0, 0, [0, C, W - C, W][i]])]));
    const holes = [wireH(h1c, 0), wireH(h0, C), wireH(h0, W - C), wireH(h1c, W)];
    const outer = loft(circles, { ruled: true }, true);
    const inner = loft(holes, { ruled: true }, true);
    const cap = (k) => addHolesInFace(makeFace(circles[k === 0 ? 0 : 3]), [holes[k === 0 ? 0 : 3]]);
    return makeSolid([outer, cast(inner.wrapped.Reversed()), cap(0), cap(1)]);
  });
  console.log(`no boolean (shells sewn): ${tSew} ms, volume ${measureVolume(solid2).toFixed(1)}, faces ${solid2.faces.length}, valid ${isValidSolid(solid2)}`);
  // the plain ring for comparison, and the kernel's own chamfer of its two faces' edges
  const [plain] = ms(() => basicFaceExtrusion(makeFace(assembleWire([makeCircle(R)]), [wireH({ ...h0, points: h0.points.slice().reverse(), bulges: h0.bulges.slice().reverse().map((b) => -b) }, 0)]), new Vector([0, 0, W])));
  console.log(`plain ring volume ${measureVolume(plain).toFixed(1)}`);
}

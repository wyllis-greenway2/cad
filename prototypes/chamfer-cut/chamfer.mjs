// Prototype (thrown away, `in_798`): why the tooth chamfer's cut takes seconds, and whether cutting with sector pieces is quicker than one ring.
// Run (from app/): Z=40 node ../prototypes/chamfer-cut/chamfer.mjs
import { makeThreePointArc, makeLine, assembleWire, makeFace, basicFaceExtrusion, makeCircle, measureVolume, Vector, draw, makeCompound } from "../../app/node_modules/replicad/dist/replicad.js";
import { init } from "../../app/src/compiler/kernel/occt/evaluate.mjs";
import { gearOutline } from "../../app/src/operation/gear.ts";
await init();
const Z = Number(process.env.Z ?? 40), M = 2, W = 8, C = 0.6; // chamfer 0.3 module
const o = gearOutline({ teeth: Z, module: M, bore: 5, width: W });
if (!o.ok) throw new Error(o.error);
const { points: pts, bulges, tipRadius: tip } = o.value;
const edges = pts.map((a, i) => {
  const b = pts[(i + 1) % pts.length], k = bulges[i];
  const p = (q) => [q[0], q[1], 0];
  if (!k) return makeLine(p(a), p(b));
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(dx, dy);
  return makeThreePointArc(p(a), [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k, 0], p(b));
});
const ms = (f) => { const t0 = performance.now(); const v = f(); return [v, Math.round(performance.now() - t0)]; };
const face = makeFace(assembleWire(edges), [assembleWire([makeCircle(2.5, [0, 0, 0], [0, 0, -1])])]);
const body = basicFaceExtrusion(face, new Vector([0, 0, W]));
console.log("body faces", body.faces.length, "volume", Math.round(measureVolume(body)));
// the cutter: the profile (r, h) turned about Z; `angle` degrees of it
const low = -Math.max(4, W);
const prof = [[tip - C, low], [tip + 1, low], [tip + 1, W], [tip - C, W], [tip, W - C], [tip, C], [tip - C, 0]];
const cutter = (angle) => { const d = draw([prof[0][0], prof[0][1]]); for (const q of prof.slice(1)) d.lineTo(q); return d.close().sketchOnPlane("XZ").revolve([0, 0, 1], { angle }); };
const [ring, tRing] = ms(() => cutter(360));
console.log("build ring", tRing, "ms");
const [r1, t1] = ms(() => body.clone().cut(ring.clone()));
console.log("one ring: cut", t1, "ms, volume", Math.round(measureVolume(r1)), "faces", r1.faces.length);
for (const n of [Z]) {
  const [sector] = ms(() => cutter(360 / n));
  const mk = () => Array.from({ length: n }, (_, k) => sector.clone().rotate((360 * k) / n, [0, 0, 0], [0, 0, 1]));
  const [tool] = ms(() => makeCompound(mk()));
  const [r2, t2] = ms(() => body.clone().cut(tool));
  console.log(`${n} sector pieces in one cut: ${t2} ms, volume ${Math.round(measureVolume(r2))}, faces ${r2.faces.length}`);
}
// a flat chamfer on each tooth's tip instead of a cone: one wedge at each face of each tooth (a plane meets a cylinder in an ellipse the kernel knows exactly)
const wt = (Math.PI * tip) / Z;
const wedge = (top) => {
  const h = (v) => (top ? W - v : v);
  const d = draw([tip - C - 1, h(-1)]).lineTo([tip + 1, h(C + 1)]).lineTo([tip + 1, h(-1)]).close();
  return d.sketchOnPlane("XZ").extrude(2 * wt).translate([0, wt, 0]);
};
const [wb, wtop] = [wedge(false), wedge(true)];
const wedges = () => Array.from({ length: Z }, (_, k) => [wb.clone().rotate((360 * k) / Z, [0, 0, 0], [0, 0, 1]), wtop.clone().rotate((360 * k) / Z, [0, 0, 0], [0, 0, 1])]).flat();
const [tool2] = ms(() => makeCompound(wedges()));
const [r4, t4] = ms(() => body.clone().cut(tool2));
console.log(`${2 * Z} flat wedges in one cut: ${t4} ms, volume ${Math.round(measureVolume(r4))} (cone: ${Math.round(measureVolume(r1))}), faces ${r4.faces.length}`);

// Prototype (thrown away, `in_864`): a chamfer round the whole top and bottom perimeter of a gear (every edge of both faces, the bore's too), by the kernel's own edge chamfer, and by one cut with the gear's outline offset.
// Run (from app/): Z=20 C=0.4 node ../prototypes/perimeter-chamfer/perimeter.mjs
import { makeThreePointArc, makeLine, assembleWire, makeFace, basicFaceExtrusion, makeCircle, measureVolume, Vector, EdgeFinder } from "../../app/node_modules/replicad/dist/replicad.js";
import { init } from "../../app/src/compiler/kernel/occt/evaluate.mjs";
import { isValidSolid } from "../../app/src/compiler/kernel/occt/interpreter.mjs";
import { gearOutline } from "../../app/src/operation/gear.ts";
await init();
const Z = Number(process.env.Z ?? 20), M = 2, W = 8, C = Number(process.env.C ?? 0.4);
const o = gearOutline({ teeth: Z, module: M, bore: 5, width: W });
if (!o.ok) throw new Error(o.error);
const { points: pts, bulges } = o.value;
const edges = pts.map((a, i) => {
  const b = pts[(i + 1) % pts.length], k = bulges[i];
  const p = (q) => [q[0], q[1], 0];
  if (!k) return makeLine(p(a), p(b));
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  return makeThreePointArc(p(a), [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k, 0], p(b));
});
const ms = (f) => { const t0 = performance.now(); try { const v = f(); return [v, Math.round(performance.now() - t0)]; } catch (e) { return [e, Math.round(performance.now() - t0), true]; } };
const body = basicFaceExtrusion(makeFace(assembleWire(edges), [assembleWire([makeCircle(2.5, [0, 0, 0], [0, 0, -1])])]), new Vector([0, 0, W]));
console.log(`teeth ${Z}: body faces ${body.faces.length}, volume ${measureVolume(body).toFixed(1)}, chamfer ${C} mm`);
// the kernel's own chamfer on every edge of the bottom and the top face
for (const [name, find] of [["bottom face edges", (e) => e.inPlane("XY", 0)], ["top face edges", (e) => e.inPlane("XY", W)], ["both faces' edges", (e) => e.either([(f) => f.inPlane("XY", 0), (f) => f.inPlane("XY", W)])]]) {
  const [r, t, bad] = ms(() => body.clone().chamfer(C, find));
  if (bad) console.log(`${name}: FAILED after ${t} ms: ${String(r.message ?? r).slice(0, 100)}`);
  else console.log(`${name}: ${t} ms, volume ${measureVolume(r).toFixed(1)}, faces ${r.faces.length}, valid ${isValidSolid(r)}`);
}

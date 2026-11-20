// Prototype (thrown away, `in_1381`): does a cut whose corners lie ON a cylinder's rim mesh when the corner numbers reach the kernel at full precision, and when they are rounded to a millionth as the app sends them?
// Run (from app/): node ../prototypes/rim-corner-precision/rim.mjs
import { draw, measureVolume } from "../../app/node_modules/replicad/dist/replicad.js";
import { init } from "../../app/src/compiler/kernel/occt/evaluate.mjs";
await init();
const H = 25, DEPTH = 8;
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const enclosed = (m) => { const V = m.vertices, T = m.triangles; let v = 0; for (let t = 0; t < T.length / 3; t++) { const p = (i) => [V[3 * i], V[3 * i + 1], V[3 * i + 2]]; const [A, B, C] = [p(T[3 * t]), p(T[3 * t + 1]), p(T[3 * t + 2])]; v += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6; } return v; };
/** one cut: a cylinder of radius R, a triangle with its corners at radius R + delta (angles a0, a1, a2), cut DEPTH down from the top; true when the triangles of the result close (enclose the volume the kernel reports, to 1 %) */
function closes(R, delta, angles, round) {
  const body = draw().movePointerTo([R, 0]).threePointsArcTo([-R, 0], [0, R]).threePointsArcTo([R, 0], [0, -R]).close().sketchOnPlane("XY").extrude(H);
  const r = R + delta, q = (a) => [round(r * Math.cos(a)), round(r * Math.sin(a))];
  const pts = angles.map(q);
  const d = draw(pts[0]); for (const p of pts.slice(1)) d.lineTo(p);
  const tool = d.close().sketchOnPlane("XY", H - DEPTH).extrude(DEPTH + 1);
  const cut = body.cut(tool);
  const vol = measureVolume(cut), enc = enclosed(cut.mesh({ tolerance: 0.01, angularTolerance: 0.1 }));
  return Math.abs(enc - vol) < 0.01 * vol;
}
const id = (v) => v;
const angleSets = Array.from({ length: 40 }, (_, k) => [0.1 + k * 0.13, 0.1 + k * 0.13 + 1.9, 0.1 + k * 0.13 + 3.9]);
const row = (label, R, delta, round) => { let ok = 0; for (const a of angleSets) if (closes(R, delta, a, round)) ok++; console.log(label.padEnd(58), `${ok}/${angleSets.length} close`); };
for (const R of [12.5, 12.500019]) {
  console.log(`--- cylinder radius ${R}`);
  row("corners exactly on the rim, full precision", R, 0, id);
  row("corners exactly on the rim, rounded to 1e-6 (the app's send)", R, 0, r6);
  row("corners 2e-5 inside (the rounded rim of the old edge data)", R, -2e-5, id);
  row("corners 5e-7 inside, full precision", R, -5e-7, id);
  row("corners 1e-9 inside, full precision", R, -1e-9, id);
  row("corners 1e-9 outside, full precision", R, 1e-9, id);
}

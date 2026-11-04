// THROWAWAY: adversarial corpus for the OCCT kernel via replicad.
// Each case builds a solid; we record success/failure, OCCT's own validity check, volume vs a
// closed-form expectation (where one exists) and time. This is measurement, not pass/fail:
// it feeds q_kernel_choice. Run: node test/corpus.mjs   (writes corpus-results.md)
import { writeFileSync } from "node:fs";
import { loadOC } from "../src/oc.mjs";
import { getOC, FaceFinder, makeBox, makeCylinder, makeSphere, drawRoundedRectangle, measureVolume, EdgeFinder } from "replicad";

await loadOC();
const PI = Math.PI;
const box = (w, d, h, at = [0, 0, 0]) => makeBox([at[0] - w / 2, at[1] - d / 2, at[2]], [at[0] + w / 2, at[1] + d / 2, at[2] + h]);
const cyl = (r, h, at = [0, 0, 0], dir = [0, 0, 1]) => makeCylinder(r, h, at, dir);
const roundedBoxVolume = (w, d, h, r) => {
  const [a, b, c] = [w - 2 * r, d - 2 * r, h - 2 * r];
  return a * b * c + 2 * r * (a * b + b * c + c * a) + PI * r * r * (a + b + c) + (4 / 3) * PI * r ** 3;
};
const edgeFilletArea = (f) => (1 - PI / 4) * f * f;
const delta = (f) => f - f ** 3 / 6 / edgeFilletArea(f); // centroid distance of the removed corner region from the outer wall

const cases = [
  { upper: 40 * 30 * 20, name: "fillet all 12 edges of 40x30x20 box, r=2", build: () => box(40, 30, 20).fillet(2), expect: roundedBoxVolume(40, 30, 20, 2) },
  { name: "fillet all edges of 20 cube, r=9.9 (almost a sphere)", build: () => box(20, 20, 20).fillet(9.9), expect: roundedBoxVolume(20, 20, 20, 9.9) },
  { upper: 8000, name: "fillet all edges of 20 cube, r=11 (impossible)", build: () => box(20, 20, 20).fillet(11), expectFail: true },
  {
    name: "fillet top circular edge of cylinder R=10 h=20, f=3",
    build: () => cyl(10, 20).fillet(3, (e) => e.inPlane("XY", 20)),
    expect: PI * 100 * 20 - 2 * PI * ((10 - 3) * edgeFilletArea(3) + 27 / 6),
  },
  {
    name: "40x30x20 box, 5 mm hole 0.2 mm from the wall, fillet 4 corners r=3",
    build: () => box(40, 30, 20).cut(cyl(2.5, 30, [17.3, 0, -5])).fillet(3, (e) => e.inDirection("Z").when(({ element }) => Math.abs(element.boundingBox.bounds[1][2] - element.boundingBox.bounds[0][2] - 20) < 1e-6 && Math.abs(Math.abs(element.boundingBox.center[0]) - 20) < 1e-6 && Math.abs(Math.abs(element.boundingBox.center[1]) - 15) < 1e-6)),
    expect: (40 * 30 - PI * 2.5 ** 2 - 4 * edgeFilletArea(3)) * 20,
  },
  { name: "fuse two boxes sharing a face (coincident faces)", build: () => box(20, 20, 10).fuse(box(20, 20, 10, [0, 0, 10])), expect: 20 * 20 * 20 },
  { name: "cut a pocket flush with the top face", build: () => box(40, 30, 20).cut(box(10, 10, 5, [0, 0, 15])), expect: 40 * 30 * 20 - 500 },
  { name: "fuse cylinder tangent to a box side (line contact)", build: () => box(50, 30, 20).fuse(cyl(5, 20, [30, 0, 0])), expect: 50 * 30 * 20 + PI * 25 * 20 },
  { upper: 40 * 30 * 20, name: "chamfer all 12 edges of 40x30x20 box, c=2", build: () => box(40, 30, 20).chamfer(2) },
  { name: "shell 40x30x20 box to 2 mm, top face open", build: () => box(40, 30, 20).shell({ filter: new FaceFinder().inPlane("XY", 20), thickness: 2 }), expect: 40 * 30 * 20 - 36 * 26 * 18 },
  { name: "two perpendicular equal cylinders R=10 (Steinmetz)", build: () => cyl(10, 40, [0, 0, -20]).intersect(cyl(10, 40, [-20, 0, 0], [1, 0, 0])), expect: (16 / 3) * 1000 },
  {
    name: "fillet vertical edges r=5, then fillet the top loop r=2 (chained)",
    build: () => box(40, 40, 20).fillet(5, (e) => e.inDirection("Z")).fillet(2, (e) => e.inPlane("XY", 20)),
  },
  { name: "0.01 mm hole through 40x30x20 box", build: () => box(40, 30, 20).cut(cyl(0.005, 30, [3, 3, -5])), expect: 40 * 30 * 20 - PI * 0.005 ** 2 * 20 },
  {
    name: "50-hole grid (5x10, d=3) in 100x60x10 plate",
    build: () => {
      let s = box(100, 60, 10);
      for (let i = 0; i < 10; i++) for (let j = 0; j < 5; j++) s = s.cut(cyl(1.5, 20, [-45 + i * 10, -20 + j * 10, -5]));
      return s;
    },
    expect: 100 * 60 * 10 - 50 * PI * 2.25 * 10,
  },
  { name: "sphere R=10 intersect half-space box (hemisphere)", build: () => makeSphere(10).intersect(box(40, 40, 20, [0, 0, 0])), expect: (2 / 3) * PI * 1000 },
  {
    name: "rounded rect 40x30 r=6 extruded 15, fillet top edge r=3",
    build: () => drawRoundedRectangle(40, 30, 6).sketchOnPlane("XY").extrude(15).fillet(3, (e) => e.inPlane("XY", 15)),
    expect: (40 * 30 - (4 - PI) * 36) * 15 - edgeFilletArea(3) * (2 * (40 - 12) + 2 * (30 - 12) + 2 * PI * 6 - 2 * PI * delta(3)),
  },
  { name: "overlap by 1e-4 mm: fuse boxes", build: () => box(20, 20, 10).fuse(box(20, 20, 10, [0, 0, 9.9999])), expect: 20 * 20 * 19.9999 },
  { name: "gap of 1e-4 mm: fuse boxes (two bodies)", build: () => box(20, 20, 10).fuse(box(20, 20, 10, [0, 0, 10.0001])), expect: 20 * 20 * 20 },
  { name: "hole tangent to the outer wall (zero-thickness wall)", build: () => box(40, 30, 20).cut(cyl(5, 30, [15, 0, -5])), expect: 40 * 30 * 20 - PI * 25 * 20 },
];

function isValid(shape) {
  try {
    const oc = getOC();
    return new oc.BRepCheck_Analyzer(shape.wrapped, true, false).IsValid();
  } catch (e) {
    return `checker error: ${e.message ?? e}`;
  }
}

const rows = [];
for (const c of cases) {
  const t0 = performance.now();
  let row;
  try {
    const shape = c.build();
    const ms = performance.now() - t0;
    const vol = measureVolume(shape);
    const valid = isValid(shape);
    const err = c.expect ? Math.abs(vol - c.expect) / c.expect : null;
    const tooBig = c.upper !== undefined && vol > c.upper * (1 + 1e-9);
    const verdict =
      tooBig ? `IMPOSSIBLE RESULT (volume ${vol.toFixed(1)} > original ${c.upper}; solid valid=${valid})` : c.expectFail ? "UNEXPECTED SUCCESS" : valid !== true ? "INVALID SOLID" : err !== null && err > 1e-6 ? "WRONG VOLUME" : "ok";
    row = { name: c.name, verdict, vol, expect: c.expect ?? null, err, ms };
  } catch (e) {
    const ms = performance.now() - t0;
    row = { name: c.name, verdict: c.expectFail ? "failed as expected" : "THREW", note: String(e?.message ?? e).slice(0, 80), ms };
  }
  rows.push(row);
}

const fmt = (n, d = 3) => (n === null || n === undefined ? "-" : Number(n).toPrecision(d + 3));
let md = "# OCCT corpus results (replicad build, Node)\n\n| case | verdict | volume | expected | rel. error | ms |\n|---|---|---|---|---|---|\n";
for (const r of rows)
  md += `| ${r.name} | ${r.verdict}${r.note ? ` (${r.note})` : ""} | ${fmt(r.vol)} | ${fmt(r.expect)} | ${r.err === null || r.err === undefined ? "-" : r.err.toExponential(1)} | ${Math.round(r.ms)} |\n`;
const tally = rows.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
md += `\nTally: ${Object.entries(tally).map(([k, v]) => `${k}: ${v}`).join(", ")}\n`;
console.log(md);
writeFileSync(new URL("../corpus-results.md", import.meta.url), md);

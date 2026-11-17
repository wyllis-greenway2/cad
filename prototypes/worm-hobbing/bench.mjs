// Prototype (thrown away, `in_605`): how long does it take to make a throated worm wheel the exact way, by cutting a worm out of a blank at many positions?
// Run (from app/): node ../prototypes/worm-hobbing/bench.mjs [positions] [teeth]
import { makeCylinder, makePolygon, genericSweep, makeAx3, getOC, Wire, measureVolume } from "../../app/node_modules/replicad/dist/replicad.js";
import { init } from "../../app/src/compiler/kernel/occt/evaluate.mjs";
await init();
const POS = Number(process.argv[2] ?? 24), Z = Number(process.argv[3] ?? 30);
const say = (...a) => console.log(...a);
const T = (label, f) => { const t = performance.now(); const r = f(); say(`${label}: ${Math.round(performance.now() - t)} ms`); return r; };

function helix(pitch, height, radius, centre, dir, xDir) { // (as in the kernel's interpreter)
  const oc = getOC();
  const turns = height / pitch;
  const line = new oc.Geom2d_Line(new oc.gp_Pnt2d(0, 0), new oc.gp_Dir2d(2 * Math.PI, pitch));
  const seg = new oc.GC_MakeSegment2d(line.Value(0), line.Value(turns * Math.sqrt((2 * Math.PI) ** 2 + pitch ** 2)));
  const surface = new oc.Geom_CylindricalSurface(makeAx3(centre, dir, xDir), radius);
  const wire = new oc.BRepBuilderAPI_MakeWire(new oc.BRepBuilderAPI_MakeEdge(seg.Value(), surface).Edge()).Wire();
  oc.BRepLib.BuildCurves3d(wire);
  return new Wire(wire);
}

// a single start worm, axial module 2 (lead 2 pi), pitch radius 12, 20 degree flanks, 30 mm long; the wheel Z teeth of module 2
const m = 2, lead = Math.PI * m, rp = 12, add = m, ded = 1.25 * m, len = 30, a = Math.tan((20 * Math.PI) / 180);
const [rRoot, rTip] = [rp - ded, rp + add];
const half = (r) => (Math.PI * m) / 4 - (r - rp) * a; // (half the width of the thread at radius r, along the axis)
const profile = makePolygon([[rRoot - 0.5, 0, -half(rRoot - 0.5)], [rTip, 0, -half(rTip)], [rTip, 0, half(rTip)], [rRoot - 0.5, 0, half(rRoot - 0.5)]]).outerWire();
const worm = T("the worm (a core and a thread of 4.8 turns, fused)", () => {
  const thread = genericSweep(profile, helix(lead, len, rTip, [0, 0, 0], [0, 0, 1], [1, 0, 0]), { frenet: true });
  const core = makeCylinder(rRoot, len + 2 * lead, [0, 0, -lead], [0, 0, 1]);
  return core.fuse(thread);
});
say(`worm volume ${measureVolume(worm).toFixed(1)}`);
// worm along X, centre distance rp + rw from the wheel axis (Z through the origin)
const rw = (m * Z) / 2, cd = rw + rp;
const place = (shape, k) => { // position k of the hobbing: the worm turned k * 360 / POS degrees about its own axis, and carried round the wheel by that / Z the other way
  const dw = (360 * k) / POS;
  return shape.clone().rotate(dw, [0, 0, 0], [0, 0, 1]).rotate(90, [0, 0, 0], [0, 1, 0]).translate([0, -cd, 0]).rotate(-dw / Z, [0, 0, 0], [0, 0, 1]);
};
let blank = makeCylinder(rw + add, 12, [0, 0, -6], [0, 0, 1]);
say(`blank volume ${measureVolume(blank).toFixed(1)}; ${Z} teeth, ${POS} positions a tooth, centre distance ${cd}`);
const times = [];
const t0 = performance.now();
for (let k = 0; k < POS; k++) {
  const t = performance.now();
  blank = blank.cut(place(worm, k));
  times.push(performance.now() - t);
  say(`cut ${k + 1}/${POS}: ${Math.round(times[k])} ms, faces ${blank.faces.length}, volume ${measureVolume(blank).toFixed(1)}`);
}
say(`TOTAL for ${POS} cuts (the worm window of one tooth pitch): ${Math.round(performance.now() - t0)} ms; first ${Math.round(times[0])} ms, last ${Math.round(times[POS - 1])} ms`);

// Prototype (thrown away, `in_855`): the cost of the validity check of a worm wheel's loft with and without the geometric controls.
import { draw, getOC, cast } from "../../app/node_modules/replicad/dist/replicad.js";
import { init } from "../../app/src/compiler/kernel/occt/evaluate.mjs";
import { wheelSections } from "../../app/src/operation/wheelsections.ts";
await init();
const oc = getOC(); const Z = Number(process.env.Z ?? 100);
const secs = wheelSections({ teeth: Z, module: Number(process.env.M ?? 2), wheel: { diameter: 24, starts: 1, width: 10 } }).value;
const mid = (a, b, bu) => [(a[0] + b[0]) / 2 - bu * (b[1] - a[1]), (a[1] + b[1]) / 2 + bu * (b[0] - a[0])];
const sk = secs.map((s) => { const N = s.points.length; let pen = draw(s.points[0]); for (let i = 0; i < N; i++) { const [a, b] = [s.points[i], s.points[(i + 1) % N]]; if (i === N - 1) { pen = s.bulges[i] ? pen.threePointsArcTo(b, mid(a, b, s.bulges[i])) : pen.lineTo(b); } else pen = s.bulges[i] ? pen.threePointsArcTo(b, mid(a, b, s.bulges[i])) : pen.lineTo(b); } return pen.close().sketchOnPlane("XY", s.h); });
const b = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6); b.CheckCompatibility(false); for (const s of sk) b.AddWire(s.wire.wrapped); b.Build();
const solid = cast(b.Shape());
oc.BRepLib.SameParameter(solid.wrapped, 1e-5, false);
for (const g of [true, false, true, false]) { const t = performance.now(); const a = new oc.BRepCheck_Analyzer(solid.wrapped, g, false); const v = a.IsValid(); console.log("geom", g, "valid", v, Math.round(performance.now() - t), "ms"); }
// without SameParameter
const b2 = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6); b2.CheckCompatibility(false);
const sk2 = secs.map((s) => { const N = s.points.length; let pen = draw(s.points[0]); for (let i = 0; i < N; i++) { const [a, bb] = [s.points[i], s.points[(i + 1) % N]]; pen = s.bulges[i] ? pen.threePointsArcTo(bb, mid(a, bb, s.bulges[i])) : pen.lineTo(bb); } return pen.close().sketchOnPlane("XY", s.h); });
for (const s of sk2) b2.AddWire(s.wire.wrapped); b2.Build();
const s2 = cast(b2.Shape());
for (const g of [true, false]) { const t = performance.now(); const a = new oc.BRepCheck_Analyzer(s2.wrapped, g, false); console.log("no SameParameter: geom", g, "valid", a.IsValid(), Math.round(performance.now() - t), "ms"); }

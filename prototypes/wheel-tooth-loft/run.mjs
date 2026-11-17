// Prototype (thrown away, `in_824`): a worm wheel as one tooth's sector lofted and turned round, against the loft through the whole wheel's sections.
// Run (from app/): Z=60 node ../prototypes/wheel-tooth-loft/run.mjs
import { draw, Plane, getOC, measureVolume, cast, makeCompound } from "../../app/node_modules/replicad/dist/replicad.js";
import { init } from "../../app/src/compiler/kernel/occt/evaluate.mjs";
import { wheelSections } from "../../app/src/operation/wheelsections.ts";
await init();
const oc = getOC();
const Z = Number(process.env.Z ?? 60);
const T = (label, f) => { const t = performance.now(); const r = f(); console.log(`${label}: ${Math.round(performance.now() - t)} ms`); return r; };
const spec = { teeth: Z, module: 2, wheel: { diameter: 24, starts: 1, width: 10 } };
const secs = T("sections", () => wheelSections(spec)).value;
const per = secs[0].points.length / Z;
const mid = (a, b, bu) => [(a[0] + b[0]) / 2 - bu * (b[1] - a[1]), (a[1] + b[1]) / 2 + bu * (b[0] - a[0])];
/** the closed outline of the points i0 .. i0+n (n sides), each with its bulge, closed back along straight lines through `centre` if given */
function wire(sec, i0, n, centre) {
  const N = sec.points.length, pt = (i) => sec.points[((i % N) + N) % N], bu = (i) => sec.bulges[((i % N) + N) % N];
  let pen = draw(pt(i0));
  for (let i = i0; i < i0 + n; i++) { const [a, b] = [pt(i), pt(i + 1)]; pen = bu(i) ? pen.threePointsArcTo(b, mid(a, b, bu(i))) : pen.lineTo(b); }
  if (centre) pen = pen.lineTo(centre);
  return pen.close();
}
const sketchOf = (d, h) => d.sketchOnPlane("XY", h);
const wholeLoft = (check) => {
  const sk = secs.map((s) => sketchOf(wire(s, 0, s.points.length), s.h));
  if (check) return sk[0].loftWith(sk.slice(1), { ruled: false });
  const b = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
  b.CheckCompatibility(false);
  for (const s of sk) b.AddWire(s.wire.wrapped);
  b.Build();
  return cast(b.Shape());
};
const v0 = T("whole loft, no check", () => measureVolume(wholeLoft(false)));
console.log("volume whole", v0);
// one tooth's strip: the open outline of a tooth lofted as a shell, turned, sewn to its neighbours, and capped
const strip = () => {
  const sk = secs.map((s) => {
    const N = s.points.length; let pen = draw(s.points[0]);
    for (let i = 0; i < per; i++) { const [a, b] = [s.points[i], s.points[(i + 1) % N]]; pen = s.bulges[i] ? pen.threePointsArcTo(b, mid(a, b, s.bulges[i])) : pen.lineTo(b); }
    return pen.done().sketchOnPlane("XY", s.h);
  });
  const b = new oc.BRepOffsetAPI_ThruSections(false, false, 1e-6);
  b.CheckCompatibility(false);
  for (const s of sk) b.AddWire(s.wire.wrapped);
  b.Build();
  return cast(b.Shape());
};
const one = T("one strip loft", strip);
console.log("faces", one.faces.length);
const strips = T(`${Z} turned copies`, () => Array.from({ length: Z }, (_, k) => one.clone().rotate((360 * k) / Z, [0, 0, 0], [0, 0, 1])));
const cap = (s) => sketchOf(wire(s, 0, s.points.length), s.h);
const caps = T("caps", () => [secs[0], secs.at(-1)].map((s) => { const sk = cap(s); return sk.face ? sk.face() : sk; }));
const sewn = T("sew", () => {
  const sw = new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false);
  for (const st of strips) sw.Add(st.wrapped);
  for (const c of caps) sw.Add((c.wrapped ?? c));
  sw.Perform(new oc.Message_ProgressRange());
  return cast(sw.SewedShape());
});
console.log("sewn type", sewn.constructor.name, "faces", sewn.faces.length);
const solid = T("make solid", () => {
  const ms = new oc.BRepBuilderAPI_MakeSolid();
  ms.Add(sewn.wrapped);
  const sol = cast(ms.Solid());
  return sol;
});
console.log("valid?", (() => { const c = new oc.BRepCheck_Analyzer(solid.wrapped, true, false); return c.IsValid(); })(), "volume", measureVolume(solid), "whole", v0);

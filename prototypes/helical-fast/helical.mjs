// Prototype (thrown away, `in_800`): a helical gear body made by sweeping ONE tooth and copying it round, against sweeping the whole outline.
// Run (from app/): Z=40 node ../prototypes/helical-fast/helical.mjs
import { getOC, makeThreePointArc, makeLine, assembleWire, makeFace, makeSolid, addHolesInFace, makeCircle, measureVolume, Vector, twistExtrude, cast } from "../../app/node_modules/replicad/dist/replicad.js";
import { init } from "../../app/src/compiler/kernel/occt/evaluate.mjs";
import { isValidSolid } from "../../app/src/compiler/kernel/occt/interpreter.mjs";
import { gearOutline, helixTwist } from "../../app/src/operation/gear.ts";
await init();
const Z = Number(process.env.Z ?? 40), M = 2, W = 8, HELIX = Number(process.env.HELIX ?? 15), BORE = 5;
const spec = { teeth: Z, module: M, width: W, helix: HELIX, bore: BORE };
const o = gearOutline(spec);
if (!o.ok) throw new Error(o.error);
const twist = helixTwist(spec); // degrees
const { points: pts, bulges } = o.value;
const edges = pts.map((a, i) => {
  const b = pts[(i + 1) % pts.length], k = bulges[i];
  const p = (q) => [q[0], q[1], 0];
  if (!k) return makeLine(p(a), p(b));
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  return makeThreePointArc(p(a), [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k, 0], p(b));
});
const per = edges.length / Z;
console.log(`teeth ${Z}, ${edges.length} edges, ${per} to a tooth, twist ${twist.toFixed(3)} degrees over ${W} mm`);
const ms = (f) => { const t0 = performance.now(); const v = f(); return [v, Math.round(performance.now() - t0)]; };
const centre = [0, 0, 0], up = new Vector([0, 0, W]);
const boreWire = () => assembleWire([makeCircle(BORE / 2, [0, 0, 0], [0, 0, -1])]);
const report = (name, solid, t) => console.log(`${name}: ${t} ms, volume ${measureVolume(solid).toFixed(1)}, faces ${solid.faces.length}, valid ${isValidSolid(solid)}`);

// 1. the whole outline in one sweep (what the app does): the outline and the bore, joined as `twistedSolid` does
{
  const [solid, t] = ms(() => {
    const [[shell, start, end], tSweep] = ms(() => twistExtrude(assembleWire(edges), twist, centre, up, undefined, true));
    const [bshell, bstart, bend] = twistExtrude(boreWire(), twist, centre, up, undefined, true);
    const reversed = cast(bshell.wrapped.Reversed());
    const [fs, tFaces] = ms(() => [addHolesInFace(makeFace(start), [bstart]), addHolesInFace(makeFace(end), [bend])]);
    const [sol, tSew] = ms(() => makeSolid([fs[0], shell, reversed, fs[1]]));
    console.log("  whole: sweep", tSweep, "ms, end faces", tFaces, "ms, makeSolid", tSew, "ms");
    return sol;
  });
  report("whole outline, one sweep", solid, t);
}
// 2. one tooth swept, copied round (timed in parts)
{
  const T = {};
  const lap = (name, f) => { const [v, t] = ms(f); T[name] = t; return v; };
  const tooth = assembleWire(edges.slice(0, per));
  const shell = lap("sweep one tooth", () => twistExtrude(tooth, twist, centre, up, undefined, true)[0]);
  const faces = lap("turn copies", () => { const out = []; for (let k = 0; k < Z; k++) for (const f of shell.faces) out.push(f.clone().rotate((360 * k) / Z, [0, 0, 0], [0, 0, 1])); return out; });
  const [bshell, , bend] = lap("sweep bore", () => twistExtrude(boreWire(), twist, centre, up, undefined, true));
  const [bs] = lap("bore start", () => [twistExtrude(boreWire(), twist, centre, up, undefined, true)[1]]);
  const bottom = lap("bottom", () => addHolesInFace(makeFace(assembleWire(edges)), [bs]));
  const top = lap("top", () => addHolesInFace(makeFace(assembleWire(edges)).rotate(twist, [0, 0, 0], [0, 0, 1]).translate([0, 0, W]), [bend]));
  const solid = lap("makeSolid (sewing)", () => makeSolid([bottom, top, ...faces, ...bshell.faces.map((f) => cast(f.wrapped.Reversed()))]));
  console.log(JSON.stringify(T), "valid", lap("valid", () => isValidSolid(solid)), "volume", measureVolume(solid).toFixed(1));
  console.log(JSON.stringify(T));
}

// 3. the whole outline in one sweep, and the faces put into a shell by hand (they share their edges already: the sweep's end wires are the shell's own), with no sewing
{
  const oc = getOC();
  const [solid, t] = ms(() => {
    const [[shell, start, end], tSweep] = ms(() => twistExtrude(assembleWire(edges), twist, centre, up, undefined, true));
    const [bshell, bstart, bend] = twistExtrude(boreWire(), twist, centre, up, undefined, true);
    const reversed = cast(bshell.wrapped.Reversed());
    const [fs, tFaces] = ms(() => [addHolesInFace(makeFace(start), [bstart]), addHolesInFace(makeFace(end), [bend])]);
    const [sol, tBuild] = ms(() => {
      const builder = new oc.TopoDS_Builder();
      const sh = new oc.TopoDS_Shell();
      builder.MakeShell(sh);
      for (const f of [fs[0], ...shell.faces, ...reversed.faces, fs[1]]) builder.Add(sh, f.wrapped);
      const fixer = new oc.ShapeFix_Solid();
      return cast(fixer.SolidFromShell(sh));
    });
    console.log("  by hand: sweep", tSweep, "ms, end faces", tFaces, "ms, shell and solid", tBuild, "ms");
    return sol;
  });
  report("whole outline, shell built by hand", solid, t);
}

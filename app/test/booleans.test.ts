// The library's booleans are made once (`in_443`): the same result as the library's own way (build with the two shapes, then build again), for fuse, cut and intersect, with and without the glue.
import test from "node:test";
import assert from "node:assert/strict";
import { makeBox, makeCylinder, measureVolume, getOC, cast } from "replicad";
import { kernel } from "../src/compiler/kernel/index.ts";
// @ts-ignore (the kernel files are plain JavaScript)
import { facesOf, edgesOf } from "../src/compiler/kernel/occt/topo.mjs";
// @ts-ignore
import "../src/compiler/kernel/occt/booleans.mjs";

await kernel.init();
const oc: any = getOC();
const bodies = () => ({
  a: (makeBox as any)([0, 0, 0], [20, 20, 10]).cut((makeCylinder as any)(4, 30, [10, 10, -5], [0, 0, 1])),
  b: (makeBox as any)([10, 0, 10], [30, 20, 18]), // stands on the top of a (they share a face: the glue case)
  c: (makeBox as any)([5, 5, 2], [25, 15, 8]), // overlaps a
});
/** The library's own way: the two-shape constructor, then `Build()` again, then the merge. */
const old = (kind: "Fuse" | "Cut" | "Common", a: any, b: any, glue: boolean) => {
  const builder = new oc[`BRepAlgoAPI_${kind}`](a.clone().wrapped, b.clone().wrapped);
  if (glue) builder.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
  builder.Build();
  builder.SimplifyResult(true, true, 0.001);
  return cast(builder.Shape());
};
const same = (x: any, y: any) => {
  assert.ok(Math.abs(measureVolume(x) - measureVolume(y)) < 1e-6, `volumes ${measureVolume(x)} and ${measureVolume(y)}`);
  assert.equal(facesOf(x).length, facesOf(y).length, "faces");
  assert.equal(edgesOf(x).length, edgesOf(y).length, "edges");
};

test("fuse, cut and intersect give the library's result", () => {
  const { a, b, c } = bodies();
  same(a.clone().fuse(c.clone()), old("Fuse", a, c, false));
  same(a.clone().cut(c.clone()), old("Cut", a, c, false));
  same(a.clone().intersect(c.clone()), old("Common", a, c, false));
});

test("with the glue (two shapes that share only a face) the result is the library's too", () => {
  const { a, b } = bodies();
  same(a.clone().fuse(b.clone(), { optimisation: "commonFace" }), old("Fuse", a, b, true));
  assert.ok(Math.abs(measureVolume(a.clone().fuse(b.clone(), { optimisation: "commonFace" })) - (measureVolume(a) + measureVolume(b))) < 1e-6);
});

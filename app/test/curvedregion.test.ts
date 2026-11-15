// A round of an edge between two curved faces, made as an approximate region when the kernel cannot (`in_411`, `dec_edits_saturate` B).
import test from "node:test";
import assert from "node:assert/strict";
import { makeCylinder, measureVolume } from "replicad";
import { kernel } from "../src/compiler/kernel/index.ts";
// @ts-ignore (the kernel files are plain JavaScript)
import { edgesOf } from "../src/compiler/kernel/occt/topo.mjs";
// @ts-ignore
import { approximateRound } from "../src/compiler/kernel/occt/interpreter.mjs";

await kernel.init();
const vol = (s: unknown) => measureVolume(s as never);
const post = () => (makeCylinder as any)(10, 30, [0, 0, 0], [0, 0, 1]).cut((makeCylinder as any)(3, 40, [0, -20, 15], [0, 1, 0]));

test("the edges where a cross hole meets a post are rounded as a region, near the kernel's round at a small size", () => {
  const b = post();
  const set = new Set((edgesOf(b) as any[]).filter((e) => e.geomType === "BSPLINE_CURVE").map((e) => e.hashCode));
  assert.equal(set.size, 2);
  const kernelRemoved = vol(b) - vol(b.fillet(0.5, (f: any) => f.when(({ element }: any) => set.has(element.hashCode))));
  const made = approximateRound(b, set, 0.5, "fillet", undefined);
  assert.ok(made, "a region was made");
  const removed = vol(b) - vol(made);
  assert.ok(Math.abs(removed - kernelRemoved) / kernelRemoved < 0.15, `removed ${removed} against the kernel's ${kernelRemoved}`);
});

// Where three rounded edges meet at a corner of three faces at right angles, the region method gives the kernel's own corner: a piece of a sphere (`in_391`).
import test from "node:test";
import assert from "node:assert/strict";
import { makeBox, measureVolume } from "replicad";
import { kernel } from "../src/compiler/kernel/index.ts";
// @ts-ignore (the kernel files are plain JavaScript)
import { edgesOf } from "../src/compiler/kernel/occt/topo.mjs";
// @ts-ignore
import { regionRound } from "../src/compiler/kernel/occt/interpreter.mjs";

await kernel.init();
const box = () => makeBox([0, 0, 0], [20, 20, 20]);
const vol = (s: unknown) => measureVolume(s as never);

test("the three edges at one corner of a block, rounded as regions, are the kernel's round with its spherical corner", () => {
  const b = box();
  const set = new Set(edgesOf(b).filter((e: any) => [e.startPoint, e.endPoint].some((p: any) => Math.hypot(p.x, p.y, p.z) < 1e-6)).map((e: any) => e.hashCode));
  assert.equal(set.size, 3);
  for (const r of [2, 5, 9.9]) {
    const kernelRound = b.fillet(r, (f: any) => f.when(({ element }: any) => set.has(element.hashCode)));
    const region = regionRound(b, set, r, "fillet");
    assert.ok(region && region !== "empty");
    assert.ok(Math.abs(vol(region) - vol(kernelRound)) < 1e-6 * vol(kernelRound), `r ${r}: ${vol(region).toFixed(4)} against ${vol(kernelRound).toFixed(4)}`);
  }
});

test("all twelve edges of the block: the same as the kernel's, with eight spherical corners", () => {
  const b = box();
  const all = new Set(edgesOf(b).map((e: any) => e.hashCode));
  const kernelRound = b.fillet(4, (f: any) => f.when(({ element }: any) => all.has(element.hashCode)));
  const region = regionRound(b, all, 4, "fillet");
  assert.ok(region && region !== "empty");
  assert.ok(Math.abs(vol(region) - vol(kernelRound)) < 1e-6 * vol(kernelRound), `${vol(region).toFixed(4)} against ${vol(kernelRound).toFixed(4)}`);
});

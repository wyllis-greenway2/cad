// Where three rounded edges meet at a corner of three faces at right angles, the region method gives the kernel's own corner: a piece of a sphere (`in_410`).
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

test("a corner of three faces that are not at right angles: a block with a corner cut off by a slanted plane, its corners rounded as regions equal the kernel's", () => {
  // the cutter is a slab turned 30 degrees: the cut face meets the faces of the block at slanted angles
  const cutter = (makeBox as any)([-60, -60, 0], [60, 60, 60]).rotate(30, [0, 0, 0], [1, 0, 0]).translate([0, 0, 14]);
  const body = (box() as any).cut(cutter);
  assert.ok(vol(body) > 0 && vol(body) < 8000);
  const edges = edgesOf(body);
  // the vertices where exactly three straight edges meet, on flat faces, with no right angle between them
  const key = (p: any) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
  const at = new Map<string, any[]>();
  for (const e of edges as any[]) if (e.geomType === "LINE") for (const p of [e.startPoint, e.endPoint]) at.set(key(p), [...(at.get(key(p)) ?? []), e]);
  const corners = [...at.values()].filter((l) => l.length === 3);
  assert.ok(corners.length >= 2, "corners with three edges");
  let slanted = 0;
  for (const three of corners) {
    const set = new Set(three.map((e: any) => e.hashCode));
    const kernelRound = body.fillet(3, (f: any) => f.when(({ element }: any) => set.has(element.hashCode)));
    const region = regionRound(body, set, 3, "fillet");
    if (!region || region === "empty") continue;
    const dirs = three.map((e: any) => { const [a, b] = [e.startPoint, e.endPoint]; const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); return [(b.x - a.x) / l, (b.y - a.y) / l, (b.z - a.z) / l]; });
    const right = [[0, 1], [0, 2], [1, 2]].every(([i, j]) => Math.abs(dirs[i!]!.reduce((s: number, v: number, k: number) => s + v * dirs[j!]![k]!, 0)) < 1e-6);
    // without the corner's piece of a sphere the three rounds leave the corner creased: further from the kernel's
    process.env.NOPATCH = "1";
    const plain = regionRound(body, set, 3, "fillet");
    delete process.env.NOPATCH;
    const [off, offPlain] = [Math.abs(vol(region) - vol(kernelRound)), Math.abs(vol(plain) - vol(kernelRound))];
    assert.ok(off <= offPlain + 1e-9, `the sphere brings it nearer: ${off.toFixed(4)} against ${offPlain.toFixed(4)}`);
    if (!right) slanted++;
    // at right angles it is the kernel's corner; where they are not the kernel's own corner is an approximation of the sphere, and the two agree to a ten thousandth of the volume
    assert.ok(off < 2e-4 * vol(kernelRound), `${vol(region).toFixed(4)} against ${vol(kernelRound).toFixed(4)}`);
  }
  assert.ok(slanted >= 1, "at least one corner that is not at right angles was checked");
});

test("three chamfers at a corner of a block: the kernel's corner is a flat triangle, and the regions give it", () => {
  const b = box();
  const set = new Set(edgesOf(b).filter((e: any) => [e.startPoint, e.endPoint].some((p: any) => Math.hypot(p.x, p.y, p.z) < 1e-6)).map((e: any) => e.hashCode));
  for (const d of [2, 4, 8]) {
    const kernelChamfer = b.chamfer(d, (f: any) => f.when(({ element }: any) => set.has(element.hashCode)));
    const region = regionRound(b, set, d, "chamfer");
    assert.ok(region && region !== "empty");
    assert.ok(Math.abs(vol(region) - vol(kernelChamfer)) < 1e-6 * vol(kernelChamfer), `d ${d}: ${vol(region).toFixed(4)} against ${vol(kernelChamfer).toFixed(4)}`);
  }
  const all = new Set(edgesOf(b).map((e: any) => e.hashCode));
  const kernelAll = b.chamfer(3, (f: any) => f.when(({ element }: any) => all.has(element.hashCode)));
  const regionAll = regionRound(b, all, 3, "chamfer");
  assert.ok(regionAll && regionAll !== "empty");
  assert.ok(Math.abs(vol(regionAll) - vol(kernelAll)) < 1e-6 * vol(kernelAll), "all twelve edges");
});

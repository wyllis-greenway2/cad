// The mesh test for a body that passes through itself (`in_472`, `in_473`).
import test from "node:test";
import assert from "node:assert/strict";
import { makeBox, makeCylinder } from "replicad";
import { kernel } from "../src/compiler/kernel/index.ts";
import { findCrossing as find } from "../src/compiler/kernel/occt/selfcross.mjs";

await kernel.init();
const box = makeBox as never as (a: number[], b: number[]) => { mesh: (o: object) => { vertices: number[]; triangles: number[] } };
/** The meshes of several shapes as one mesh (the triangles of each after those of the ones before). */
const together = (...shapes: { mesh: (o: object) => { vertices: number[]; triangles: number[] } }[]) => {
  const vertices: number[] = [], triangles: number[] = [];
  for (const s of shapes) { const m = s.mesh({ tolerance: 0.01, angularTolerance: 0.3 }); const o = vertices.length / 3; vertices.push(...m.vertices); triangles.push(...m.triangles.map((i) => i + o)); }
  return { vertices, triangles };
};

test("a cavity that sticks out through the outer skin is a crossing; one inside, one touching a wall and one apart are not", () => {
  const outer = box([0, 0, 0], [10, 10, 10]);
  const sticks = together(outer, box([8, 8, 8], [12, 12, 12]));
  const hit = find(sticks.vertices, sticks.triangles, 0.05);
  assert.ok(hit, "the corner of the inner box is through the wall");
  assert.equal(hit.at.length, 3, "and says where");
  assert.equal(find(...Object.values(together(outer, box([2, 2, 2], [8, 8, 8]))) as [number[], number[]], 0.05), null, "inside");
  assert.equal(find(...Object.values(together(outer, box([0, 0, 0], [5, 5, 5]))) as [number[], number[]], 0.05), null, "faces lying on faces are a contact");
  assert.equal(find(...Object.values(together(outer, box([20, 20, 20], [30, 30, 30]))) as [number[], number[]], 0.05), null, "apart");
});

test("a plain box, a cylinder and a box with a round hole are not crossings (the meshing error of a curved face is not one)", () => {
  const cyl = (makeCylinder as never as (r: number, h: number) => { mesh: (o: object) => { vertices: number[]; triangles: number[] } })(5, 10);
  for (const [name, s] of [["box", box([0, 0, 0], [10, 10, 10])], ["cylinder", cyl]] as const) {
    const m = s.mesh({ tolerance: 0.05, angularTolerance: 0.5 });
    assert.equal(find(m.vertices, m.triangles, 0.15), null, name);
  }
});

test("a search that would take too long gives up and says nothing", () => {
  const m = together(box([0, 0, 0], [10, 10, 10]), box([8, 8, 8], [12, 12, 12]));
  assert.equal(find(m.vertices, m.triangles, 0.05, 3), null);
});

test("the kernel's check: separate bodies that overlap are not one body crossing itself; a closed hollow is fine; a box with a hollow that goes through its wall is found", async () => {
  const { makeCompound, getOC, cast } = await import("replicad");
  // @ts-expect-error (the kernel files are plain modules with no types)
  const { crossesItself } = await import("../src/compiler/kernel/occt/interpreter.mjs");
  // @ts-expect-error (the kernel files are plain modules with no types)
  const { shellsOf } = await import("../src/compiler/kernel/occt/topo.mjs");
  const bx = makeBox as never as (a: number[], b: number[]) => { cut: (o: unknown) => unknown };
  const solids = makeCompound as never as (l: unknown[]) => unknown;
  assert.equal(crossesItself(solids([bx([0, 0, 0], [10, 10, 10]), bx([8, 8, 8], [12, 12, 12])])), null, "two bodies that overlap are two bodies");
  assert.equal(crossesItself(bx([0, 0, 0], [10, 10, 10]).cut(bx([0.5, 0.5, 0.5], [9.5, 9.5, 9.5]))), null, "a closed hollow is fine");
  // one solid bounded by the shell of a box and, as its hollow, the shell of another that goes through it
  const oc = getOC() as unknown as { BRepBuilderAPI_MakeSolid: new (a: unknown, b: unknown) => { Solid(): unknown } };
  const outer = shellsOf(bx([0, 0, 0], [10, 10, 10]) as never)[0].wrapped, inner = shellsOf(bx([8, 8, 8], [12, 12, 12]) as never)[0].wrapped;
  const one = cast(new oc.BRepBuilderAPI_MakeSolid(outer, inner).Solid() as never);
  assert.ok(crossesItself(one), "a box with a hollow that goes through its wall, as one solid");
});

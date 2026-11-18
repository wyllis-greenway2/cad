// Per-body work (`dec_per_body_checks`, `in_726`): what is worked out of a body is worked out once for the body, so a model of many bodies costs what its new body costs, and the answers are the ones that working it all out again gives.
import test from "node:test";
import assert from "node:assert/strict";
import { makeBox, makeCompound } from "replicad";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { graphOf } from "../src/compiler/compile.ts";
import { isValidSolid } from "../src/compiler/kernel/occt/interpreter.mjs";
import { surfacesOf } from "../src/compiler/kernel/occt/facenames.mjs";

await kernel.init();
/** a gear of 20 teeth at `x`, extruded `depth` mm (a negative depth goes down from the plane), added to the session */
const withGear = (s: Session, id: string, x: number, depth = 6): Session => {
  const spec = { teeth: 20, module: 1 };
  const made = run(s, { type: "gear", id, plane: worldRef("XY"), at: [x, 0, 0], spec });
  const face = loopFaceRef(gearRefs({ id, plane: worldRef("XY"), at: [x, 0, 0], spec }).lines);
  return runOp(made, { ...(startOp(scene(made), [face as never], "extrude") as { op: Op }).op, value: depth })!.session;
};
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { volume?: number }[];

test("a compound of valid solids is valid, found so again from what was kept; a single solid is as before", () => {
  const compound = makeCompound([makeBox([0, 0, 0], [10, 10, 10]), makeBox([30, 0, 0], [35, 5, 5]), makeBox([0, 30, 0], [4, 34, 4])]);
  assert.equal(isValidSolid(compound), true);
  assert.equal(isValidSolid(compound), true, "again, with each solid known");
  assert.equal(isValidSolid(makeBox([0, 0, 0], [3, 3, 3])), true);
});

test("a gear put down apart from the others is a body of its own with the volume it has alone; one that touches another is joined to it", () => {
  const alone = withGear(createSession(kernel), "g_001", 0);
  const one = bodies(alone)[0]!.volume!;
  const apart = withGear(withGear(createSession(kernel), "g_001", 0), "g_002", 40);
  assert.equal(bodies(apart).length, 2, "two bodies");
  assert.ok(Math.abs(bodies(apart).reduce((t, b) => t + b.volume!, 0) - 2 * one) < 1e-3 * one, "the two volumes are the volume of one, twice");
  const touching = withGear(withGear(createSession(kernel), "g_001", 0), "g_002", 8, -6); // (under the first, sharing part of its face)
  assert.equal(bodies(touching).length, 1, "gears that share part of a face are one body");
  assert.ok(Math.abs(bodies(touching)[0]!.volume! - 2 * one) < 1e-3 * one, "joined along their shared face: the volumes add");
});

test("the names of the edges are the same when the faces' and edges' details were kept as when they were found", () => {
  const s = withGear(withGear(createSession(kernel), "g_001", 0), "g_002", 40);
  const graph = { ...graphOf(scene(s)), names: true } as Parameters<typeof kernel.evaluate>[0];
  const first = kernel.evaluate(graph, { tolerance: 0.05, angular: 0.3 });
  const second = kernel.evaluate(graph, { tolerance: 0.07, angular: 0.35 }); // (another mesh quality: not the kept whole answer, the edges named again from what was kept)
  assert.ok(first.edgeNames && first.edgeNames.length > 0, `${first.edgeNames?.length} edges named`);
  assert.deepEqual(second.edgeNames, first.edgeNames);
  assert.deepEqual(second.faceNames, first.faceNames);
});

test("the surfaces of a shape are the same found again from what was kept, and are not shared (changing one answer does not change the next)", () => {
  const box = makeBox([0, 0, 0], [10, 20, 30]);
  const strip = (l: object[]) => l.map((e) => { const { face: _f, ...rest } = e as { face?: unknown }; return rest; });
  const a = surfacesOf(box);
  const b = surfacesOf(box);
  assert.deepEqual(strip(b), strip(a));
  (a[0] as unknown as { n: number[] }).n[0] = 99;
  assert.notEqual((surfacesOf(box)[0] as unknown as { n: number[] }).n[0], 99);
});

test("the surfaces of several bodies are those of each body one after the other, and the names of the edges are those of each body's own faces", () => {
  const strip = (l: object[]) => l.map((e) => { const { face: _f, owner: _o, ...rest } = e as { face?: unknown; owner?: unknown }; return rest; });
  const [a, b] = [() => makeBox([0, 0, 0], [10, 20, 30]), () => makeBox([50, 0, 0], [60, 5, 5])]; // (a compound uses up the shapes it is made of: made again each time)
  const both = surfacesOf(makeCompound([a(), b()]));
  assert.deepEqual(strip(both), [...strip(surfacesOf(a())), ...strip(surfacesOf(b()))]);
  assert.equal(both.length, 12);
  assert.deepEqual(strip(surfacesOf(makeCompound([a(), b()]))), strip(both), "again, from what was kept");
});

test("a model of sixty plain parts does not make them all again at every step: what is kept is bounded by faces, not by a count of forty or so (`in_827`)", async () => {
  const { drawRectangle } = await import("../src/operation/build.ts");
  const { kernelStats } = await import("../src/compiler/kernel/occt/interpreter.mjs");
  const add = (s: Session, i: number): Session => {
    const r = drawRectangle(scene(s), worldRef("XY"), [(i % 10) * 12, Math.floor(i / 10) * 12, 0], [(i % 10) * 12 + 8, Math.floor(i / 10) * 12 + 8, 0], [1, 0, 0], [0, 1, 0]);
    const s2 = run(s, r.command);
    return runOp(s2, { ...(startOp(scene(s2), [loopFaceRef(r.lines) as never], "extrude") as { op: Op }).op, value: 5 + (i % 7) })!.session;
  };
  let s = createSession(kernel);
  for (let i = 0; i < 60; i++) s = add(s, i);
  const before = { ...kernelStats };
  s = add(s, 60);
  assert.ok(kernelStats.prismsBuilt - before.prismsBuilt <= 3, `the 61st part made ${kernelStats.prismsBuilt - before.prismsBuilt} prisms`);
  assert.equal(bodies(s).length, 61);
  const ops = (s.outcome as unknown as { kernel: { ops: { cached?: boolean }[] } }).kernel.ops;
  assert.ok(ops.filter((o) => o.cached).length >= 100, `only ${ops.filter((o) => o.cached).length} of ${ops.length} steps were taken from what was kept`);
});

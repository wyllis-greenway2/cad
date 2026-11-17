// A body's own solid is kept under what it was made from, not what came before it (`dec_per_body_checks`, `in_729`): a change to an earlier step builds that body again and leaves the others' solids as they were, and the answers are the ones that
// working everything out again gives.
import test from "node:test";
import assert from "node:assert/strict";
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
import { kernelStats, clearKernelCaches, isValidSolid } from "../src/compiler/kernel/occt/interpreter.mjs";
import { makeBox } from "replicad";

await kernel.init();
const withGear = (s: Session, id: string, x: number): Session => {
  const spec = { teeth: 16, module: 1 };
  const made = run(s, { type: "gear", id, plane: worldRef("XY"), at: [x, 0, 0], spec });
  const face = loopFaceRef(gearRefs({ id, plane: worldRef("XY"), at: [x, 0, 0], spec }).lines);
  return runOp(made, { ...(startOp(scene(made), [face as never], "extrude") as { op: Op }).op, value: 6 })!.session;
};
const four = (): Session => [0, 1, 2, 3].reduce((s, i) => withGear(s, `g_00${i}`, i * 30), createSession(kernel));
const turned = (s: Session, id: string, turn: number): Session => run(s, { type: "setGear", id, spec: { teeth: 16, module: 1 }, turn });

test("a change to an early body builds that body again and keeps the solids of the bodies after it", () => {
  const s = four();
  const [built, reused] = [kernelStats.prismsBuilt, kernelStats.prismsReused];
  const edited = turned(s, "g_000", 0.05);
  assert.equal(kernelStats.prismsBuilt - built, 1, "only the gear that changed is built again");
  assert.ok(kernelStats.prismsReused - reused >= 3, `${kernelStats.prismsReused - reused} kept solids found again`);
  assert.equal(Object.values(scene(edited).parts).filter((p) => p.kind === "body").length, 4);
});

test("the answer with kept solids is the answer worked out from nothing: volumes, the names of faces and of edges", () => {
  const s = turned(four(), "g_001", 0.07); // (an edit in the middle: the solids of the others are kept ones)
  const graph = { ...graphOf(scene(s)), names: true } as Parameters<typeof kernel.evaluate>[0];
  const kept = kernel.evaluate(graph, { tolerance: 0.05, angular: 0.3 });
  clearKernelCaches();
  const fresh = kernel.evaluate(graph, { tolerance: 0.06, angular: 0.35 }); // (another quality: not the kept whole answer)
  assert.deepEqual(fresh.ops.map((o) => o.error), kept.ops.map((o) => o.error));
  assert.deepEqual(fresh.bodies?.map((b) => [b.id, Math.round(b.volume * 1e3)]), kept.bodies?.map((b) => [b.id, Math.round(b.volume * 1e3)]));
  assert.ok((kept.bodies?.length ?? 0) === 4);
  assert.deepEqual(fresh.faceNames, kept.faceNames);
  assert.deepEqual(fresh.edgeNames, kept.edgeNames);
});

test("a solid that was found valid is found so again, and a compound is as before", () => {
  clearKernelCaches();
  const box = makeBox([0, 0, 0], [4, 4, 4]);
  assert.equal(isValidSolid(box), true);
  assert.equal(isValidSolid(box), true, "again, from what was kept");
});

const helicalSpec = { teeth: 14, module: 1, helix: 15, width: 8 };
const helicals = (): Session => [0, 1, 2].reduce((s, i) => run(s, { type: "gear", id: `g_00${i}`, plane: worldRef("XY"), at: [i * 30, 0, 0], spec: helicalSpec }), createSession(kernel));
const wormSpec = { teeth: 1, module: 2, worm: { diameter: 24, length: 24 } };
const worms = (n: number): Session => Array.from({ length: n }, (_, i) => i).reduce((s, i) => run(s, { type: "gear", id: `g_00${i}`, plane: worldRef("XY"), at: [i * 40, 0, 0], spec: wormSpec }), createSession(kernel));

test("a revolve (a helical gear's twist) is kept like an extrude: an early edit builds that body and finds the others' solids", () => {
  const s = helicals();
  const [built, reused] = [kernelStats.prismsBuilt, kernelStats.prismsReused];
  const edited = run(s, { type: "setGear", id: "g_000", spec: helicalSpec, turn: 0.05 });
  assert.equal(kernelStats.prismsBuilt - built, 1, "the gear that changed is built again, the others are not");
  assert.ok(kernelStats.prismsReused - reused >= 2, `${kernelStats.prismsReused - reused} kept solids found again`);
  assert.equal(Object.values(scene(edited).parts).filter((p) => p.kind === "body").length, 3);
});

test("a worm (its sweeps and its core) is kept too: an edit to the first of three builds only the first", () => {
  const one = kernelStats.prismsBuilt;
  worms(1);
  const perWorm = kernelStats.prismsBuilt - one;
  assert.ok(perWorm >= 1, `${perWorm} solids for a worm`);
  const s = worms(3);
  const [built, reused] = [kernelStats.prismsBuilt, kernelStats.prismsReused];
  run(s, { type: "setGear", id: "g_000", spec: wormSpec, turn: 0.05 });
  assert.ok(kernelStats.prismsBuilt - built <= perWorm, `${kernelStats.prismsBuilt - built} built for the worm that changed (a worm is ${perWorm})`);
  assert.ok(kernelStats.prismsReused - reused >= perWorm, `${kernelStats.prismsReused - reused} kept solids found again`);
});

test("the answers of revolves and sweeps with kept solids are those worked out from nothing: volumes and the names of faces and edges", () => {
  for (const s of [run(helicals(), { type: "setGear", id: "g_001", spec: helicalSpec, turn: 0.07 }), run(worms(3), { type: "setGear", id: "g_001", spec: wormSpec, turn: 0.07 })]) {
    const graph = { ...graphOf(scene(s)), names: true } as Parameters<typeof kernel.evaluate>[0];
    const kept = kernel.evaluate(graph, { tolerance: 0.05, angular: 0.3 });
    clearKernelCaches();
    const fresh = kernel.evaluate(graph, { tolerance: 0.06, angular: 0.35 });
    assert.deepEqual(fresh.ops.map((o) => o.error), kept.ops.map((o) => o.error));
    assert.deepEqual(fresh.bodies?.map((b) => [b.id, Math.round(b.volume * 1e3)]), kept.bodies?.map((b) => [b.id, Math.round(b.volume * 1e3)]));
    assert.deepEqual(fresh.faceNames, kept.faceNames);
    assert.deepEqual(fresh.edgeNames, kept.edgeNames);
    assert.ok((kept.bodies?.length ?? 0) >= 3);
  }
});

test("a worm wheel's loft is kept: an edit to the first of two wheels builds only the first", () => {
  const spec = { teeth: 12, module: 2, wheel: { diameter: 24, starts: 1, width: 10 } };
  const two = (): Session => [0, 1].reduce((s, i) => run(s, { type: "gear", id: `g_00${i}`, plane: worldRef("XY"), at: [i * 70, 0, 0], spec }), createSession(kernel));
  const s = two();
  const [built, reused] = [kernelStats.prismsBuilt, kernelStats.prismsReused];
  const edited = run(s, { type: "setGear", id: "g_000", spec, turn: 0.05 });
  assert.equal(kernelStats.prismsBuilt - built, 1, "the wheel that changed is built again");
  assert.ok(kernelStats.prismsReused - reused >= 1, "the other wheel's solid is found again");
  assert.equal(Object.values(scene(edited).parts).filter((p) => p.kind === "body").length, 2);
});

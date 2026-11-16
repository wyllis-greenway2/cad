// Names for flat faces that last through the steps (`dec_stable_reference_mechanism`, `in_559`): the kernel gives each flat face a name when it is made and carries it through the steps after.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";

await kernel.init();
type R = { ops: { id: string; error: string | null }[]; volume: number; bbox: { min: number[]; max: number[] }; faceNames?: { name: string; n: number[]; c: number[] }[] };
const rect = (w: number) => ({ id: "s_a", type: "sketch", shape: "polygon", points: [[0, 0], [w, 0], [w, 10], [0, 10]], plane: "XY", origin: 0 });
const ev = (ops: unknown[]) => kernel.evaluate({ params: {}, names: true, ops } as never) as unknown as R;
const nameAt = (r: R, n: number[], z: number) => r.faceNames!.find((f) => f.n.every((v, i) => Math.abs(v - n[i]!) < 1e-6) && Math.abs(f.c[2]! * (n[2] ? 1 : 0) - z * (n[2] ? 1 : 0)) < 1e-6)?.name;

test("an extruded block has six named faces, and the names are the same for any size", () => {
  const a = ev([rect(10), { id: "x_a", type: "extrude", profile: "s_a", distance: 10 }]);
  const b = ev([rect(14), { id: "x_a", type: "extrude", profile: "s_a", distance: 25 }]);
  assert.equal(a.faceNames!.length, 6);
  assert.deepEqual(a.faceNames!.map((f) => f.name).sort(), b.faceNames!.map((f) => f.name).sort());
  assert.equal(new Set(a.faceNames!.map((f) => f.name)).size, 6);
  assert.equal(nameAt(a, [0, 0, 1], 10), nameAt(b, [0, 0, 1], 25), "the top is the top, taller or not");
});

test("a push of the top face by its name follows the top when the extrusion is made taller", () => {
  const top = nameAt(ev([rect(10), { id: "x_a", type: "extrude", profile: "s_a", distance: 10 }]), [0, 0, 1], 10)!;
  const run = (depth: number) => ev([rect(10), { id: "x_a", type: "extrude", profile: "s_a", distance: depth }, { id: "p", type: "faceExtrude", target: "x_a", ref: { name: top, n: [0, 0, 1], d: 10, point: [5, 5, 10] }, distance: 3 }]);
  const r10 = run(10), r20 = run(20);
  assert.equal(r10.ops.find((o) => o.id === "p")!.error, null);
  assert.ok(Math.abs(r10.volume - 1300) < 1e-3);
  assert.equal(r20.ops.find((o) => o.id === "p")!.error, null);
  assert.ok(Math.abs(r20.volume - 2300) < 1e-3, `the top of the taller one was pushed: ${r20.volume}`);
});

test("a step put between two others does not change what a later step names", () => {
  const base = [rect(10), { id: "x_a", type: "extrude", profile: "s_a", distance: 10 }];
  const top = nameAt(ev(base), [0, 0, 1], 10)!;
  const later = { id: "p", type: "faceExtrude", target: "m", ref: { name: top, n: [0, 0, 1], d: 10, point: [5, 5, 10] }, distance: 2 };
  // the later step names the top of the block; a step that moves the block up by 7 is put between: the name still finds the top (now at 17)
  const without = ev([...base, { ...later, target: "x_a" }]);
  const withMove = ev([...base, { id: "m", type: "transform", mode: "move", target: "x_a", axis: 2, value: 7 }, later]);
  assert.equal(withMove.ops.find((o) => o.id === "p")!.error, null, withMove.ops.map((o) => o.error).join());
  assert.ok(Math.abs(without.volume - 1200) < 1e-3);
  assert.ok(Math.abs(withMove.volume - 1200) < 1e-3);
  assert.ok(Math.abs(withMove.bbox.max[2]! - 19) < 1e-6, `the pushed top is at 19: ${withMove.bbox.max[2]}`);
});

test("a name the body has lost is an error, never another face", () => {
  const r = ev([rect(10), { id: "x_a", type: "extrude", profile: "s_a", distance: 10 }, { id: "p", type: "faceExtrude", target: "x_a", ref: { name: "nothing:9", n: [0, 0, 1], d: 10, point: [5, 5, 10] }, distance: 3 }]);
  assert.match(r.ops.find((o) => o.id === "p")!.error ?? "", /not a face of the body/);
});

import { createSession, scene, run } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawRectangle } from "../src/operation/build.ts";

test("in the model: the faces of the body carry their lasting names, and a push keeps the top's name through a change of the depth", () => {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), worldRef("XY"), [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const planes = Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body") as unknown as { ref: string; stable?: string; at: number[] }[];
  assert.equal(planes.length, 6);
  assert.ok(planes.every((p) => p.stable), "every flat face has a lasting name");
  const top = planes.find((p) => Math.abs(p.at[2]! - 10) < 1e-6 && p.ref.includes("0,0,1"))!;
  s = run(s, { type: "addStep", step: { id: "s_101", type: "pushPull", parts: [top.ref], params: { depth: 3, nx: 0, ny: 0, nz: 1, fd: 10, px: 5, py: 5, pz: 10, fname: top.stable! } } } as never);
  assert.deepEqual(s.outcome.errors, {});
  s = run(s, { type: "setStepParams", id: "s_100", params: { depth: 20 } });
  assert.deepEqual(s.outcome.errors, {});
  const vol = (s.outcome.kernel as { volume: number }).volume;
  assert.ok(Math.abs(vol - 2300) < 1e-3, `the taller block with its top pushed by 3: ${vol}`);
});

// A face of the body stands for its edges in a fillet or chamfer (`in_257`, `dec_selection_tools` section 1): the same step as selecting those edges one by one.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { startOp, opCommand, autoOp } from "../src/interaction/operations.ts";
import { faceEdges } from "../src/interaction/offsetbody.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();

const box = (): Session => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), worldRef("XY"), [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
};
const faces = (s: Session) => Object.values(scene(s).parts).filter((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !!p.mesh);
const top = (s: Session) => faces(s).find((f) => f.mesh!.every((_, i) => i % 3 !== 2 || Math.abs(f.mesh![i]! - 20) < 1e-6))!;
const bottom = (s: Session) => faces(s).find((f) => f.mesh!.every((_, i) => i % 3 !== 2 || Math.abs(f.mesh![i]!) < 1e-6))!;

test("a selected face rounds or bevels all its edges in one step, the same as selecting the edges", () => {
  const s = box();
  const f = top(s);
  const edges = faceEdges(scene(s), f);
  assert.equal(edges.length, 4);
  const viaFace = startOp(scene(s), [f.ref], "edge");
  const viaEdges = startOp(scene(s), edges, "edge");
  assert.ok(viaFace.ok && viaEdges.ok);
  if (!viaFace.ok || !viaEdges.ok) return;
  assert.deepEqual([...viaFace.op.parts].sort(), [...edges].sort());
  assert.equal(viaFace.op.edges?.length, 4);
  const a = run(s, opCommand(scene(s), { ...viaFace.op, value: -2 })!);
  const b = run(s, opCommand(scene(s), { ...viaEdges.op, value: -2 })!);
  assert.equal(scene(a).steps.length, 2, "one step");
  assert.ok(Math.abs(a.outcome.kernel!.volume! - b.outcome.kernel!.volume!) < 1e-6);
  assert.ok(a.outcome.kernel!.volume! < 16000 - 200, `${a.outcome.kernel!.volume}`);
});

test("the top and the bottom face together: both outlines", () => {
  const s = box();
  const r = startOp(scene(s), [top(s).ref, bottom(s).ref], "edge");
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.op.parts.length, 8);
  const done = run(s, opCommand(scene(s), { ...r.op, value: 1 })!); // (rounded)
  assert.equal(scene(done).steps.length, 2);
  assert.ok(done.outcome.kernel!.volume! < 16000);
});

test("a face and a line of another face together; a selection with something else says what to select", () => {
  const s = box();
  const f = top(s);
  const other = faceEdges(scene(s), bottom(s))[0]!;
  const r = startOp(scene(s), [f.ref, other], "edge");
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.op.parts.length, 5);
  const bad = startOp(scene(s), [worldRef("XY")], "edge");
  assert.ok(!bad.ok);
  // the arrow that shows by itself for a face is still the push / pull one
  assert.equal(autoOp(scene(s), [f.ref])?.kind, "pushpull");
});

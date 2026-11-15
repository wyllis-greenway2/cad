// A corner of one of several bodies says which body it is a corner of, so selecting a vertex and moving, turning or scaling it works on that body and not on all of them (`in_457`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const XY = worldRef("XY");
function two() {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const b = drawRectangle(scene(s), XY, [30, 0, 0], [40, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: b.lines, params: { depth: 10, mode: "new" } } } as never);
  return s;
}
const bodies = (s: ReturnType<typeof two>) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: string; bbox: { min: number[]; max: number[] } }[];

test("a corner of one of two bodies names its body, and a move of it moves that body alone", () => {
  const s = two();
  const corners = Object.values(scene(s).parts).filter((p) => p.kind === "corner" && p.origin === "body") as unknown as { ref: string; at: number[]; of?: string }[];
  assert.ok(corners.every((c) => c.of), "every corner says its body");
  const far = corners.find((c) => c.at[0] === 40 && c.at[1] === 10 && c.at[2] === 10)!;
  assert.equal(far.of, "b/x_s_101/o");
  for (const kind of ["move", "rotate", "scale"] as const) {
    const st = startOp(scene(s), [far.ref as never], kind);
    assert.ok(st.ok);
    assert.deepEqual(st.ok && st.op.parts, ["b/x_s_101/o"], `${kind} works on the body of the corner only`);
  }
  const st = startOp(scene(s), [far.ref as never], "move");
  if (!st.ok) return;
  const moved = runOp(s, { ...st.op, axis: 0, value: 5 })!.session;
  const [a, b] = [...bodies(moved)].sort((p, q) => p.bbox.min[0]! - q.bbox.min[0]!);
  assert.deepEqual([a!.bbox.min[0], a!.bbox.max[0]], [0, 10], "the first body did not move");
  assert.deepEqual([b!.bbox.min[0], b!.bbox.max[0]], [35, 45], "the body of the corner moved by 5");
});

test("an edge and a face of one of two bodies work on that body too", () => {
  const s = two();
  const parts = Object.values(scene(s).parts) as unknown as { ref: string; kind: string; origin: string; a?: string; at: number[]; of?: string }[];
  const edge = parts.find((p) => p.kind === "line" && p.origin === "body" && p.of === "b/x_s_101/o")!;
  assert.ok(edge, "an edge says its body");
  const face = parts.find((p) => p.kind === "plane" && p.origin === "body" && p.of === "b/x_s_101/o")!;
  for (const r of [edge.ref, face.ref]) for (const kind of ["move", "rotate", "scale"] as const) {
    const st = startOp(scene(s), [r as never], kind);
    assert.ok(st.ok);
    assert.deepEqual(st.ok && st.op.parts, ["b/x_s_101/o"], `${kind} of ${r}`);
  }
});

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

const bodyOf = (s: ReturnType<typeof two>, id: string) => (Object.values(scene(s).parts).find((p) => p.kind === "body" && p.ref === id) as unknown as { volume: number; bbox: { min: number[]; max: number[] } });
const part = (s: ReturnType<typeof two>, f: (p: { ref: string; kind: string; origin: string; a?: string; at: number[]; of?: string }) => boolean) => (Object.values(scene(s).parts) as unknown as { ref: string; kind: string; origin: string; a?: string; at: number[]; of?: string }[]).find(f)!;

test("a corner of one of two bodies names its body; scale still works on that body, a move shapes it", () => {
  const s = two();
  const far = part(s, (p) => p.kind === "corner" && p.origin === "body" && p.at[0] === 40 && p.at[1] === 10 && p.at[2] === 10);
  assert.equal(far.of, "b/x_s_101/o");
  const sc = startOp(scene(s), [far.ref as never], "scale");
  assert.ok(sc.ok && sc.op.parts[0] === "b/x_s_101/o", "scale works on the body of the corner");
  const st = startOp(scene(s), [far.ref as never], "move");
  assert.ok(st.ok && st.op.target === "part", "a move of a corner shapes the body");
  if (!st.ok) return;
  const moved = runOp(s, { ...st.op, axis: 2, value: 5 })!.session;
  assert.equal(scene(moved).steps.at(-1)!.type, "reshape");
  const first = bodyOf(moved, "b/x_s_100/o");
  assert.equal(Math.round(first.volume), 1000, "the first body did not change");
  const second = bodyOf(moved, "b/x_s_101/o");
  assert.equal(Math.round(second.volume), 1083, "the corner went up 5: the top is two flat triangles, one of them tilted: 50 x 5 / 3 more");
  assert.equal(second.bbox.max[2], 15);
});

test("an edge, a face and a turn of a face shape the body they are in", () => {
  const s = two();
  const edge = part(s, (p) => p.kind === "line" && p.origin === "body" && p.of === "b/x_s_101/o" && false);
  void edge;
  const top = part(s, (p) => p.kind === "plane" && p.origin === "body" && p.of === "b/x_s_101/o");
  const st = startOp(scene(s), [top.ref as never], "move");
  assert.ok(st.ok && st.op.target === "part");
  const rot = startOp(scene(s), [top.ref as never], "rotate");
  assert.ok(rot.ok && rot.op.target === "part");
  const s2 = runOp(s, { ...(st.ok ? st.op : (null as never)), axis: 0, value: 4 })!.session;
  assert.equal(scene(s2).steps.at(-1)!.type, "reshape");
  assert.equal(Math.round(bodyOf(s2, "b/x_s_100/o").volume), 1000);
});

test("while a size is dragged (a rough mesh), a body that did not change keeps its fine mesh", () => {
  const cylinder = (s0: ReturnType<typeof two>) => s0;
  let s = cylinder(two());
  const tri = (x: ReturnType<typeof two>) => (x.outcome.kernel as unknown as { mesh: { triangles: unknown[] } }).mesh.triangles.length;
  const before = tri(s);
  kernel.draft = true;
  try {
    s = run(s, { type: "setStepParams", id: "s_101", params: { depth: 12 } } as never);
    const d = (s.outcome.kernel as unknown as { describe?: { bodies: number; reused: number } }).describe;
    assert.ok(d && d.reused >= 1, `the first body was not meshed again: ${JSON.stringify(d)}`);
    assert.equal(tri(s), before, "boxes mesh the same either way: nothing changed in the count");
  } finally { kernel.draft = false; }
});

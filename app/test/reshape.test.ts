// Shaping a body by its corners, edges and faces (`dec_direct_shape_editing`, `in_457`, `in_458`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
function block() {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), worldRef("XY"), [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  return run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
}
type P = { ref: string; kind: string; origin: string; at: number[]; a?: string; b?: string; mesh?: number[] };
const parts = (s: ReturnType<typeof block>) => Object.values(scene(s).parts) as unknown as P[];
const volume = (s: ReturnType<typeof block>) => (parts(s).find((p) => p.kind === "body") as unknown as { volume: number }).volume;
const move = (s: ReturnType<typeof block>, ref: string, axis: 0 | 1 | 2, value: number) => {
  const st = startOp(scene(s), [ref as never], "move");
  assert.ok(st.ok);
  return runOp(s, { ...st.op, axis, value, frame: undefined })!.session;
};

test("a face moved sideways slides, an edge raised makes a wedge, a face raised grows the body", () => {
  const s = block();
  const top = parts(s).find((p) => p.kind === "plane" && p.origin === "body" && p.mesh && p.mesh.every((v, i) => i % 3 !== 2 || v === 10))!;
  assert.equal(Math.round(volume(move(s, top.ref, 0, 4))), 1000, "slid");
  assert.equal(Math.round(volume(move(s, top.ref, 2, 5))), 1500, "raised");
  const c = (x: number, y: number, z: number) => parts(s).find((p) => p.kind === "corner" && p.origin === "body" && p.at[0] === x && p.at[1] === y && p.at[2] === z)!;
  const edge = parts(s).find((p) => p.kind === "line" && p.origin === "body" && [p.a, p.b].every((r) => [c(0, 0, 10).ref, c(10, 0, 10).ref].includes(r!)))!;
  assert.ok(edge);
  assert.equal(Math.round(volume(move(s, edge.ref, 2, 3))), 1150, "an edge raised: a wedge");
});

test("a move that would leave nothing, or break the body, is refused with the reason and the body stays as it was", () => {
  const s = block();
  const corner = parts(s).find((p) => p.kind === "corner" && p.origin === "body" && p.at[0] === 10 && p.at[1] === 10 && p.at[2] === 10)!;
  const bad = move(s, corner.ref, 2, -40);
  const errors = bad.message ?? "";
  assert.match(errors, /cross itself|inside out|body/, "the reason is given");
  assert.equal(Math.round(volume(bad)), 1000, "the body is as it was");
});

test("a round body and a corner that is not there are refused by the shape step with their reasons", async () => {
  const { makeCylinder, makeBox } = await import("replicad");
  // @ts-expect-error (the kernel files are plain modules with no types)
  const { reshape } = await import("../src/compiler/kernel/occt/reshape.mjs");
  assert.throws(() => reshape((makeCylinder as never as (r: number, h: number) => never)(5, 10), [{ from: [0, 0, 0], to: [0, 0, 3] }]), /round face/);
  const box = (makeBox as never as (a: number[], b: number[]) => never)([0, 0, 0], [10, 10, 10]);
  assert.throws(() => reshape(box, [{ from: [3, 3, 3], to: [3, 3, 4] }]), /not a corner of this body/);
});

test("a face turned about its middle twists the body: its sides split into flat triangles", () => {
  const s = block();
  const top = parts(s).find((p) => p.kind === "plane" && p.origin === "body" && p.mesh && p.mesh.every((v, i) => i % 3 !== 2 || v === 10))!;
  const st = startOp(scene(s), [top.ref as never], "rotate");
  assert.ok(st.ok && st.op.target === "part");
  const r = runOp(s, { ...st.op, axis: 2, value: 20, frame: undefined })!.session;
  assert.ok(!r.message, String(r.message));
  assert.equal(scene(r).steps.at(-1)!.type, "reshape");
  const v = volume(r);
  assert.ok(v > 800 && v < 1000, `the twisted body is a little smaller: ${v}`);
});

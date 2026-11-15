// Deleting a body that took part in a combine (`in_436`): a tool that was kept leaves the cut it made; the body that was cut takes the combine with it.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { createState, reduce } from "../src/interaction/controller.ts";

await kernel.init();
const XY = worldRef("XY");
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: string; volume: number }[];
/** a block 20 x 20 x 10 and a tool 10 x 10 x 6 inside it, the tool kept as a body of its own after it was subtracted */
function subtracted(): Session {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [20, 20, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const b = drawRectangle(scene(s), XY, [5, 5, 0], [15, 15, 0], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: b.lines, params: { depth: 6, mode: "new" } } } as never);
  return run(s, { type: "addStep", step: { id: "s_102", type: "combine", parts: ["b/x_s_100/o", "b/x_s_101/o"], params: { mode: "subtract", keep: 1 } } } as never);
}
const remove = (s: Session, ref: string): Session => reduce(createState({ ...s, click: { ...s.click, selection: [ref] as never } }), { type: "runAction", id: "delete" }, { w: 800, h: 600, now: 0 } as never).session;

test("deleting the tool that was kept leaves the cut it made in the block", () => {
  const s = subtracted();
  assert.deepEqual(bodies(s).map((b) => Math.round(b.volume)).sort(), [3400, 600]);
  const after = remove(s, "b/x_s_101/o");
  assert.deepEqual(after.outcome.errors, {});
  assert.equal(bodies(after).length, 1);
  assert.ok(Math.abs(bodies(after)[0]!.volume - 3400) < 1, `the block is still cut: ${bodies(after)[0]!.volume}`);
});

test("deleting the block that was cut takes the combine with it and leaves the tool", () => {
  const after = remove(subtracted(), "b/x_s_100/o");
  assert.deepEqual(after.outcome.errors, {});
  assert.deepEqual(scene(after).steps.map((x) => x.type), ["extrude"]);
  assert.equal(bodies(after).length, 1);
  assert.ok(Math.abs(bodies(after)[0]!.volume - 600) < 1);
});

test("a cut that took material from two bodies stays when one of them is deleted; a cut made in only the deleted one goes", () => {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [10, 20, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const b = drawRectangle(scene(s), XY, [12, 0, 0], [22, 20, 0], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: b.lines, params: { depth: 10, mode: "new" } } } as never);
  const both = drawRectangle(scene(s), XY, [5, 5, 0], [17, 15, 0], [1, 0, 0], [0, 1, 0]); s = run(s, both.command); // across both
  s = run(s, { type: "addStep", step: { id: "s_102", type: "extrude", parts: both.lines, params: { depth: 3, mode: "cut" } } } as never);
  const only = drawRectangle(scene(s), XY, [1, 1, 0], [3, 3, 0], [1, 0, 0], [0, 1, 0]); s = run(s, only.command); // in the first only
  s = run(s, { type: "addStep", step: { id: "s_103", type: "extrude", parts: only.lines, params: { depth: 2, mode: "cut" } } } as never);
  assert.deepEqual(s.outcome.errors, {});
  assert.deepEqual(scene(s).cutOf?.s_102?.slice().sort(), ["x_s_100", "x_s_101"]);
  assert.deepEqual(scene(s).cutOf?.s_103, ["x_s_100"]);
  const after = remove(s, "b/x_s_100/o");
  assert.deepEqual(after.outcome.errors, {});
  assert.deepEqual(scene(after).steps.map((x) => x.id), ["s_101", "s_102"], "the cut in the first only is gone with it; the one across both stays with the second");
  assert.equal(bodies(after).length, 1);
});

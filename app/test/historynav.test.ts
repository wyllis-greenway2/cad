// The History panel (`dec_history_navigation`, `in_489`, `in_498`): go to a step, the faded steps after it, change the numbers of a step at the last step.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { panelOf } from "../src/interaction/panels.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };
function three() {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const b = drawRectangle(scene(s), XY, [30, 0, 0], [40, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: b.lines, params: { depth: 10, mode: "new" } } } as never);
  s = run(s, { type: "addStep", step: { id: "s_102", type: "move", parts: ["b/x_s_100/o"], params: { axis: 1, value: 5, body: "x_s_100" } } } as never);
  return createState(s);
}
const rows = (st: ReturnType<typeof three>) => panelOf("history", scene(st.session), [], st.session.outcome.errors, null, st.session.history, st.stepEdit)!;
const bodies = (st: ReturnType<typeof three>) => Object.values(scene(st.session).parts).filter((p) => p.kind === "body").length;

test("go to a step shows the model as it was then; the later steps stay, faded, and redo goes back", () => {
  let st = three();
  assert.deepEqual(scene(st.session).steps.map((x) => x.id), ["s_100", "s_101", "s_102"]);
  st = reduce(st, { type: "stepGo", id: "s_100" }, env);
  assert.deepEqual(scene(st.session).steps.map((x) => x.id), ["s_100"], "the model as it was");
  assert.equal(bodies(st), 1);
  const p = rows(st);
  assert.deepEqual(p.rows.map((r) => [r.id, !!r.future, !!r.current]), [["s_100", false, true], ["s_101", true, false], ["s_102", true, false]]);
  assert.match(p.note ?? "", /earlier step/);
  assert.ok(p.rows.every((r) => !r.fields && !r.removable), "no numbers to change and nothing to take out at an earlier step");
  st = reduce(st, { type: "stepGo", id: "s_102" }, env);
  assert.deepEqual(scene(st.session).steps.map((x) => x.id), ["s_100", "s_101", "s_102"], "back at the last step");
  assert.equal(bodies(st), 2);
  assert.equal(rows(st).note, undefined);
});

test("the numbers of a step are changed at the last step: a command, undone with one undo; not at an earlier step", () => {
  let st = three();
  const p = rows(st);
  assert.deepEqual(p.rows.map((r) => r.fields?.map((f) => [f.key, f.value])), [[["depth", 10]], [["depth", 10]], [["value", 5]]], "each step offers its numbers");
  st = reduce(st, { type: "stepEdit", id: "s_101" }, env);
  assert.equal(rows(st).rows[1]!.open, true, "the numbers are open");
  const volume = () => Math.round((Object.values(scene(st.session).parts).find((q) => q.kind === "body" && q.ref.includes("s_101")) as unknown as { volume: number }).volume);
  assert.equal(volume(), 1000);
  st = reduce(st, { type: "stepSet", id: "s_101", key: "depth", value: 12 }, env);
  assert.equal(volume(), 1200, "the model is made again from the new number");
  assert.equal(scene(st.session).steps.find((x) => x.id === "s_101")!.params.depth, 12);
  st = reduce(st, { type: "undo" }, env);
  assert.equal(volume(), 1000, "one undo takes it back");
  st = reduce(st, { type: "stepGo", id: "s_100" }, env);
  st = reduce(st, { type: "stepSet", id: "s_100", key: "depth", value: 5 }, env);
  assert.match(st.session.message ?? "", /last step/, "refused at an earlier step");
  assert.equal(scene(st.session).steps.find((x) => x.id === "s_100")!.params.depth, 10, "nothing changed");
});

test("the steps a go-to leaves out are not lost: the commands after the cursor are kept and the list shows them faded", () => {
  let st = three();
  st = reduce(st, { type: "stepGo", id: "s_101" }, env);
  assert.equal(st.session.history.commands.length > st.session.history.cursor, true, "the commands after the cursor are kept");
  assert.deepEqual(rows(st).rows.map((r) => !!r.future), [false, false, true]);
});

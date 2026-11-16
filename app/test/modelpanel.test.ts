// The Model panel (`dec_model_panel`, `in_546`, `in_556`): one panel with the tabs Steps, Bodies, Sketches; the sketches are named and have a status.
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
const panel = (st: ReturnType<typeof three>) => panelOf(st.panel, scene(st.session), [], st.session.outcome.errors, st.showSketch, st.session.history, st.stepEdit)!;

test("the lists are the tabs of one panel called Model", () => {
  let st = three();
  st = reduce(st, { type: "panel", name: "history" }, env);
  assert.equal(panel(st).title, "Model");
  assert.deepEqual(panel(st).tabs!.map((t) => [t.label, t.on]), [["Steps", true], ["Bodies", false], ["Sketches", false], ["Parameters", false]]);
  st = reduce(st, { type: "panel", name: "sketches" }, env);
  assert.equal(st.panel, "sketches");
  assert.deepEqual(panel(st).tabs!.map((t) => t.on), [false, false, true, false]);
});

test("each figure is a sketch, named in the order of its steps, with its step and its status", () => {
  let st = three();
  st = reduce(st, { type: "panel", name: "sketches" }, env);
  const rows = panel(st).rows;
  assert.deepEqual(rows.map((r) => r.label), ["Sketch 1", "Sketch 2"]);
  assert.match(rows[0]!.detail!, /Extrude 10 mm · carried by Move Y 5 mm/);
  assert.match(rows[1]!.detail!, /Extrude 10 mm · as drawn/);
});

test("choosing a sketch's row shows the sketch of its extrusion, and again puts it away", () => {
  let st = three();
  st = reduce(st, { type: "panel", name: "sketches" }, env);
  st = reduce(st, { type: "panelRow", id: "s_101", act: "sketch" }, env);
  assert.equal(st.showSketch, "s_101");
  assert.equal(panel(st).rows[1]!.active, true);
  st = reduce(st, { type: "panelRow", id: "s_101", act: "sketch" }, env);
  assert.equal(st.showSketch, null);
});

test("the Parameters tab: make, change, tie a step's number by typing a formula, take away", () => {
  let st = three();
  st = reduce(st, { type: "panel", name: "parameters" }, env);
  assert.equal(panel(st).title, "Model");
  assert.deepEqual(panel(st).rows, []);
  st = reduce(st, { type: "paramSet", name: "wall", expr: "4" }, env);
  st = reduce(st, { type: "paramSet", name: "twice", expr: "wall * 2" }, env);
  assert.deepEqual(panel(st).rows.map((r) => [r.label, r.param!.expr, r.param!.value]), [["twice", "wall * 2", 8], ["wall", "4", 4]]);
  st = reduce(st, { type: "stepLink", id: "s_100", key: "depth", expr: "twice + 1" }, env);
  assert.equal(scene(st.session).steps[0]!.params.depth, 9);
  assert.match(panel(st).rows.find((r) => r.label === "twice")!.detail!, /1 number tied/);
  // the pencil's field shows the formula
  st = reduce(st, { type: "panel", name: "history" }, env);
  st = reduce(st, { type: "stepEdit", id: "s_100" }, env);
  assert.deepEqual(panel(st).rows[0]!.fields, [{ key: "depth", label: "Depth (mm)", value: 9, expr: "twice + 1" }]);
  // the parameter changes, the step follows
  st = reduce(st, { type: "paramSet", name: "wall", expr: "5" }, env);
  assert.equal(scene(st.session).steps[0]!.params.depth, 11);
  // a refusal shows as a message and changes nothing
  st = reduce(st, { type: "paramRemove", name: "wall" }, env);
  assert.match(st.session.message ?? "", /twice uses wall/);
  // a parameter of a refused number is not taken from an earlier step
  st = reduce(st, { type: "panel", name: "parameters" }, env);
  st = reduce(st, { type: "panelRow", id: "twice", act: "remove" }, env);
  assert.match(st.session.message ?? "", /step s_100 uses twice/);
});

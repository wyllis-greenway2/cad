// The Model panel (`dec_model_panel`, `in_546`, `in_556`): one panel with the tabs Steps, Bodies, Sketches; the sketches are named and have a status.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run, undoLast } from "../src/interaction/session.ts";
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
  s = run(s, { type: "addRelation", relation: { id: "r_900", kind: "horizontal", parts: [a.lines[0]!] } } as never);
  s = run(s, { type: "addRelation", relation: { id: "r_901", kind: "vertical", parts: [a.lines[1]!] } } as never);
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
  assert.deepEqual(panel(st).tabs!.map((t) => [t.label, t.on]), [["Steps", true], ["Bodies", false], ["Sketches", false], ["Constraints", false], ["Parameters", false], ["Measure", false]]);
  st = reduce(st, { type: "panel", name: "sketches" }, env);
  assert.equal(st.panel, "sketches");
  assert.deepEqual(panel(st).tabs!.map((t) => t.on), [false, false, true, false, false, false]);
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

test("the Steps tab shows what each step owns under it: its sketch, its constraints and the body it made", () => {
  let st = three();
  st = reduce(st, { type: "panel", name: "history" }, env);
  const rows = panel(st).rows;
  const at = rows.findIndex((r) => r.id === "s_100" && !r.child);
  assert.ok(at >= 0);
  const kids = [];
  for (let i = at + 1; i < rows.length && rows[i]!.child; i++) kids.push(rows[i]!);
  assert.deepEqual(kids.map((r) => r.label.replace(/\d+ constraints?/, "N constraints")), ["Sketch 1", "N constraints", "Body 1"]);
  assert.ok(kids.every((r) => r.child));
  // a body row selects the body; the constraints row selects the parts they tie
  const body = kids.find((r) => r.label === "Body 1")!;
  st = reduce(st, { type: "panelRow", id: body.id, act: "select" }, env);
  assert.deepEqual(st.session.click.selection, [body.id]);
  const rel = kids.find((r) => r.id === "rels:s_100")!;
  st = reduce(st, { type: "panelRow", id: rel.id, act: "select" }, env);
  assert.equal(st.session.click.selection.length, 2, "the two lines the constraints are on are selected");
  // a step with no sketch of its own (the move) has no children
  const move = rows.findIndex((r) => r.id === "s_102");
  assert.ok(move >= 0 && !rows[move + 1]?.child);
});

test("the Constraints tab lists every constraint with the step whose sketch it is on; choosing one selects its parts, the cross takes it away", () => {
  let st = three();
  const total = scene(st.session).relations.length;
  assert.ok(total > 0);
  st = reduce(st, { type: "panel", name: "constraints" }, env);
  const rows = panel(st).rows;
  assert.equal(rows.length, total);
  assert.ok(rows.every((r) => /on the sketch of Extrude 10 mm|on the sketch of Extrude 10 mm|on a sketch/.test(r.detail!)), rows.map((r) => r.detail).join(" / "));
  assert.ok(rows.some((r) => /on the sketch of Extrude 10 mm/.test(r.detail!)));
  st = reduce(st, { type: "panelRow", id: rows[0]!.id, act: "select" }, env);
  const rel = scene(st.session).relations.find((r) => r.id === rows[0]!.id)!;
  assert.deepEqual([...st.session.click.selection].sort(), [...new Set(rel.parts)].sort());
  st = reduce(st, { type: "panelRow", id: rows[0]!.id, act: "remove" }, env);
  assert.equal(scene(st.session).relations.length, total - 1);
});

test("sketch statuses: unused until a step takes it; detached when the face it was drawn on is gone", () => {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  const rowsOf = (sess: typeof s) => panelOf("sketches", scene(sess), [], {}, null, sess.history, null)!.rows;
  let rows = rowsOf(s);
  assert.deepEqual(rows.map((r) => [r.label, r.detail]), [["Sketch 1", "unused · drawn, not taken by a step yet"]]);
  assert.ok(rows[0]!.pickId);
  // choosing it selects the lines it is drawn with
  let st = createState(s);
  st = reduce(st, { type: "panel", name: "sketches" }, env);
  st = reduce(st, { type: "panelRow", id: rows[0]!.pickId!, act: "pick" }, env);
  assert.deepEqual([...st.session.click.selection].sort(), [...a.lines].sort());
  // a step takes it: no longer unused
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  rows = rowsOf(s);
  assert.deepEqual(rows.map((r) => r.label), ["Sketch 1"]);
  assert.match(rows[0]!.detail!, /as drawn/);
  // a second figure is drawn on the top face of the body, extruded; then the first body is made shorter: the face the second figure was drawn on is gone
  const top = (Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body") as unknown as { ref: string; at: number[] }[]).find((p) => Math.abs(p.at[2]! - 10) < 1e-6 && p.ref.includes("0,0,1"))!;
  const b = drawRectangle(scene(s), top.ref as never, [2, 2, 10], [6, 6, 10], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: b.lines, params: { depth: 3 } } } as never);
  rows = rowsOf(s);
  assert.deepEqual(rows.map((r) => r.label), ["Sketch 1", "Sketch 2"]);
  assert.doesNotMatch(rows[1]!.detail!, /detached/);
  s = run(s, { type: "setStepParams", id: "s_100", params: { depth: 5 } });
  rows = rowsOf(s);
  assert.match(rows[1]!.detail!, /detached: the face it was drawn on is gone/);
  assert.doesNotMatch(rows[0]!.detail!, /detached/);
});

import { saveText, openSession } from "../src/interaction/session.ts";
test("sketch names are kept for good: given when drawn, not by the order of the steps; not reused; the same after a save and open", () => {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  const b = drawRectangle(scene(s), XY, [30, 0, 0], [40, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  const rowsOf = (sess: typeof s) => panelOf("sketches", scene(sess), [], {}, null, sess.history, null)!.rows;
  assert.deepEqual(rowsOf(s).map((r) => r.label), ["Sketch 1", "Sketch 2"]);
  // B is extruded first, then A: the steps are in the other order, the names are not
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: b.lines, params: { depth: 10 } } } as never);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: a.lines, params: { depth: 10, mode: "new" } } } as never);
  let rows = rowsOf(s);
  assert.deepEqual(rows.map((r) => [r.label, r.id]), [["Sketch 1", "s_101"], ["Sketch 2", "s_100"]], "A drawn first is Sketch 1 although its step is the second");
  // the step of B is taken out: B is unused but is still Sketch 2; a new figure is Sketch 3, not 2 again
  s = run(s, { type: "removeStep", id: "s_100" });
  const c = drawRectangle(scene(s), XY, [60, 0, 0], [70, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, c.command);
  rows = rowsOf(s);
  assert.deepEqual(rows.map((r) => r.label), ["Sketch 1", "Sketch 2", "Sketch 3"]);
  assert.match(rows[1]!.detail!, /unused/);
  assert.match(rows[0]!.detail!, /as drawn/);
  // saved and opened again: the same
  const back = openSession(kernel, saveText(s));
  assert.ok(back.ok);
  assert.deepEqual(rowsOf(back.value).map((r) => [r.label, /unused/.test(r.detail!)]), rows.map((r) => [r.label, /unused/.test(r.detail!)]));
  // undone: the name goes with the figure that goes (and is given again if it is drawn again)
  s = undoLast(s);
  assert.deepEqual(rowsOf(s).map((r) => r.label), ["Sketch 1", "Sketch 2"]);
});

test("choosing a sketch's row selects the sketch and shows it: from the Sketches tab and from under its step", () => {
  let st = three();
  st = reduce(st, { type: "panel", name: "sketches" }, env);
  const rows = panel(st).rows;
  assert.deepEqual(rows.map((r) => r.pickId), ["fig:s_100:0", "fig:s_101:0"]);
  st = reduce(st, { type: "panelRow", id: rows[1]!.pickId!, act: "pick" }, env);
  const lines = scene(st.session).steps.find((x) => x.id === "s_101")!.parts;
  assert.deepEqual([...st.session.click.selection].sort(), [...lines].sort(), "the lines of the second sketch are selected");
  assert.equal(st.showSketch, "s_101", "and it is shown");
  // from under the step in the Steps tab
  st = reduce(st, { type: "panel", name: "history" }, env);
  const kid = panel(st).rows.find((r) => r.child === "pick" && r.id === "s_100")!;
  assert.equal(kid.pickId, "fig:s_100:0");
  st = reduce(st, { type: "panelRow", id: kid.pickId!, act: "pick" }, env);
  assert.deepEqual([...st.session.click.selection].sort(), [...scene(st.session).steps.find((x) => x.id === "s_100")!.parts].sort());
  assert.equal(st.showSketch, "s_100");
  // a figure with a hole: the hole is selected with it
  let s = createSession(kernel);
  const outer = drawRectangle(scene(s), XY, [0, 0, 0], [20, 20, 0], [1, 0, 0], [0, 1, 0]); s = run(s, outer.command);
  const hole = drawRectangle(scene(s), XY, [5, 5, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, hole.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: outer.lines, params: { depth: 5, holes: hole.lines.join(",") } } } as never);
  let st2 = createState(s);
  st2 = reduce(st2, { type: "panelRow", id: "fig:s_100:0", act: "pick" }, env);
  assert.deepEqual([...st2.session.click.selection].sort(), [...outer.lines, ...hole.lines].sort());
});

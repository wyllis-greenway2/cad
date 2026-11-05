import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, selection, undoLast, run } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { entryOf, previewFor } from "../src/interaction/entry.ts";
import { createRecognizer } from "../src/interaction/recognizer.ts";
import type { Intent } from "../src/shared/input.ts";
import { BODY_OBJECT } from "../src/compiler/body.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };
const near = (a: number, b: number, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

const top = (): AppState => ({ ...createState(createSession(kernel)), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [20, 15, 0] } });
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);
const click = (st: AppState, p: Vec3, count = 1) => reduce(st, { type: "click", x: px(st, p)[0], y: px(st, p)[1], count, shift: false }, env);
const move = (st: AppState, p: Vec3) => reduce(st, { type: "hover", x: px(st, p)[0], y: px(st, p)[1] }, env);
const key = (st: AppState, k: string) => reduce(st, { type: "typed", key: k, shift: false }, env);
const typeText = (st: AppState, text: string) => [...text].reduce((s, c) => key(s, c), st);
const corners = (st: AppState) => Object.values(scene(st.session).parts).filter((p) => p.origin === "drawn" && p.kind === "corner").map((p) => (p as { at: Vec3 }).at);
const volume = (st: AppState) => st.session.outcome.kernel?.volume ?? 0;

function drag(st: AppState, from: Vec3, to: Vec3, steps = 4): AppState {
  const [x0, y0] = px(st, from);
  const [x1, y1] = px(st, to);
  let [lx, ly] = [x0, y0];
  for (let k = 1; k <= steps; k++) {
    const x = x0 + ((x1 - x0) * k) / steps;
    const y = y0 + ((y1 - y0) * k) / steps;
    st = reduce(st, { type: "orbit", dx: k === 1 ? x - x0 : x - lx, dy: k === 1 ? y - y0 : y - ly, x, y }, env);
    [lx, ly] = [x, y];
  }
  return reduce(st, { type: "dragEnd" }, env);
}
const rounded = (cs: Vec3[]) => cs.map((c) => c.map((v) => Math.round(v * 100) / 100)).sort();

test("rectangle: the click makes it at once (10 by 10, selected); dragging its ball sets the size; one undo removes it all", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  assert.ok(st.tool && !st.tool.plane);
  st = click(st, [5, 5, 0]); // on the XY pane
  assert.equal(st.tool!.plane, XY);
  assert.ok(st.tool!.placed);
  assert.deepEqual(rounded(corners(st)), rounded([[5, 5, 0], [5, 15, 0], [15, 5, 0], [15, 15, 0]]), "the figure exists after the first click");
  assert.match(selection(st.session)[0]!, /^d\/loop@/);
  assert.equal(frameOf(st, { w: 800, h: 600 }).preview, null, "it is in the scene, nothing extra is previewed");
  st = drag(st, [15, 15, 0], [25, 15, 0]);
  assert.deepEqual(rounded(corners(st)), rounded([[5, 5, 0], [5, 15, 0], [25, 5, 0], [25, 15, 0]]));
  assert.equal(scene(st.session).relations.length, 4);
  assert.match(selection(st.session)[0]!, /^d\/loop@/);
  assert.ok(st.tool, "the ball stays for another drag");
  st = { ...st, session: undoLast(st.session) };
  assert.equal(corners(st).length, 0, "the whole rectangle goes in one undo");
  assert.equal(scene(st.session).relations.length, 0);
});

test("while the ball is dragged the figure is previewed; a click away ends the drawing and the figure stays selected", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [5, 5, 0]);
  const [x0, y0] = px(st, [15, 15, 0]);
  const [x1, y1] = px(st, [30, 20, 0]);
  st = reduce(st, { type: "orbit", dx: x1 - x0, dy: y1 - y0, x: x1, y: y1 }, env);
  assert.equal(previewFor(scene(st.session), st.tool)!.segments.length, 4);
  assert.equal(corners(st).length, 0, "lifted out of the scene while it is dragged");
  st = reduce(st, { type: "dragEnd" }, env);
  assert.equal(corners(st).length, 4);
  st = click(st, [300, 300, 0]);
  assert.equal(st.tool, null);
});

test("a rectangle stays a rectangle when a corner is dragged: its sides are kept level with the plane", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [5, 5, 0]);
  st = drag(st, [15, 15, 0], [25, 15, 0]);
  const some = Object.values(scene(st.session).parts).find((p) => p.kind === "corner" && p.origin === "drawn")!;
  const session = (applyCommand(st, { type: "movePart", ref: some.ref, to: [7, 9, 0] }));
  const cs = Object.values(scene(session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as unknown as { at: Vec3 }).at);
  const xs = new Set(cs.map((c) => Math.round(c[0] * 1e4)));
  const ys = new Set(cs.map((c) => Math.round(c[1] * 1e4)));
  assert.equal(xs.size, 2);
  assert.equal(ys.size, 2);
});

test("typed sizes make the placed figure again at that size, on the side the ball was dragged to; Enter ends the drawing", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [10, 10, 0]);
  st = drag(st, [20, 20, 0], [2, 4, 0]); // up-left of the first corner
  st = typeText(st, "40");
  st = key(st, "Tab");
  st = typeText(st, "2.5");
  assert.deepEqual(entryOf(scene(st.session), st.tool, null)!.fields.map((f) => [f.value, f.active]), [["40", false], ["2.5", true]]);
  st = key(st, "Enter");
  assert.equal(st.tool, null);
  const xs = corners(st).map((c) => c[0]);
  const ys = corners(st).map((c) => c[1]);
  assert.equal(corners(st).length, 4, "one figure, however often it was made again");
  near(Math.min(...xs), -30);
  near(Math.max(...xs), 10);
  near(Math.min(...ys), 7.5);
  near(Math.max(...ys), 10);
});

test("circle: the click makes it (diameter 10); the ball sets the radius; or a typed diameter", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "circle" }, env);
  st = click(st, [10, 10, 0]);
  const radius = () => (Object.values(scene(st.session).parts).filter((p) => p.kind === "circle") as { radius: number }[]).map((c) => c.radius);
  assert.deepEqual(radius(), [5]);
  assert.match(selection(st.session)[0]!, /^d\/disk@/);
  st = drag(st, [15, 10, 0], [16, 10, 0]);
  assert.deepEqual(radius(), [6]);
  st = typeText(st, "9");
  near(radius()[0]!, 4.5);
  assert.equal(radius().length, 1);
});

test("line: the click makes a segment (10 long along the plane); the ball at its end moves the end", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [5, 5, 0]);
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "drawn").length, 1);
  st = drag(st, [15, 5, 0], [15, 20, 0]);
  const pts = corners(st);
  assert.equal(pts.length, 2);
  assert.deepEqual(rounded(pts), rounded([[5, 5, 0], [15, 20, 0]]));
  st = typeText(st, "4");
  assert.equal(corners(st).length, 2);
  near(Math.hypot(pts[0]![0] - corners(st)[1]![0], 0), Math.hypot(pts[0]![0] - corners(st)[1]![0], 0));
});

test("a tool is armed again to put it away; Esc ends a drawing but keeps the figure; a click on a world plane takes the drawing", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = reduce(st, { type: "begin", name: "rect" }, env);
  assert.equal(st.tool, null);
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [300, 300, 0]);
  assert.equal(st.tool!.plane, XY, "the world planes are infinite: a click anywhere on one takes the drawing");
  st = reduce(st, { type: "escape" }, env);
  assert.equal(st.tool, null);
  assert.equal(corners(st).length, 4, "the figure was made by the click and stays");
});

test("the first point snaps to a corner that is already there; free points are rounded", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [5, 5, 0]);
  st = drag(st, [15, 15, 0], [25.003, 15.004, 0]);
  assert.ok(corners(st).some((c) => c[0] === 25 && c[1] === 15), "rounded to 0.01");
  st = reduce(st, { type: "escape" }, env);
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [5.05, 4.95, 0]); // within the snap distance of the corner at (5, 5)
  assert.deepEqual(st.tool!.points[0], [5, 5, 0]);
});

function drawBox(st: AppState, depth = 20): AppState {
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [3, 3, 0]);
  st = move(st, [30, 12, 0]);
  st = key(typeText(st, "40"), "Tab");
  st = key(typeText(st, "20"), "Enter");
  st = reduce(st, { type: "begin", name: "extrude" }, env);
  return depth === 0 ? st : key(typeText(st, String(depth)), "Enter");
}

test("extrude: pick a closed figure, type a distance, Enter: one step, the body appears, and one undo removes it", () => {
  let st = top();
  st = drawBox(st, 0);
  assert.equal(st.op!.kind, "extrude");
  assert.equal(entryOf(scene(st.session), null, st.op)!.fields[0]!.label, "Distance");
  st = typeText(st, "15");
  assert.equal(previewFor(scene(st.session), null) , null, "an extrude shows its real result, not a sketch of it");
  st = key(st, "Enter");
  assert.equal(st.op, null);
  near(volume(st), 40 * 20 * 15, 0.1);
  assert.deepEqual(selection(st.session), [], "an extrude leaves nothing selected: the new body shows as itself");
  assert.equal(scene(st.session).steps.length, 1);
  st = { ...st, session: undoLast(st.session) };
  assert.equal(st.session.outcome.kernel, null);
});

test("extrude: the pointer pulls the distance along the normal; a negative distance on a body cuts it", () => {
  let st = top();
  st = drawBox(st, 20);
  near(volume(st), 16000, 0.1);
  // draw a small rectangle on the top face (a face of the body takes the drawing) and cut it 5 mm into the body
  st = { ...st, cam: homeCamera() };
  const topPoint: Vec3 = [30, 10, 20];
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, topPoint);
  st = typeText(st, "10");
  st = key(st, "Tab");
  st = typeText(st, "10");
  st = key(st, "Enter");
  assert.ok(Object.values(scene(st.session).parts).some((p) => p.kind === "plane" && p.origin === "drawn"), "the face became a drawn plane");
  st = reduce(st, { type: "begin", name: "extrude" }, env);
  st = typeText(st, "-5");
  st = key(st, "Enter");
  assert.equal(st.session.message, null);
  near(volume(st), 16000 - 10 * 10 * 5, 0.5);
});

test("fillet or chamfer in one operation: lines of the body, a size (a minus makes a chamfer), Enter", () => {
  let st = top();
  st = drawBox(st, 20);
  st = { ...st, cam: homeCamera() };
  // select vertical edges by clicking them with Shift
  const edges: Vec3[] = [[43, 3, 10], [43, 23, 10], [3, 23, 10]]; // the three vertical edges seen from the home view (the fourth is behind the body)
  let sel = reduce(st, { type: "escape" }, env);
  for (const [i, p] of edges.entries()) {
    const [x, y] = px(sel, p);
    sel = reduce(sel, { type: "click", x, y, count: 1, shift: i > 0 }, env);
  }
  assert.equal(selection(sel.session).length, 3);
  st = reduce(sel, { type: "begin", name: "edge" }, env);
  assert.equal(st.op!.kind, "edge");
  assert.equal(entryOf(scene(st.session), null, st.op)!.fields[0]!.value, "", "no size yet: drag the double arrow or type one");
  st = key(st, "ArrowUp");
  assert.equal(entryOf(scene(st.session), null, st.op)!.fields[0]!.value, "0.1");
  st = typeText(st, "3");
  assert.deepEqual(entryOf(scene(st.session), null, st.op)!.fields[0]!.label, "Fillet");
  const chamfer = reduce({ ...st, op: { ...st.op!, typed: "-2" } }, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(entryOf(scene(st.session), null, { ...st.op!, typed: "-2" })!.fields[0]!.label, "Chamfer");
  near(volume(chamfer), 16000 - 3 * 0.5 * 4 * 20, 0.5); // a minus makes it a chamfer of that size
  st = key(st, "Enter");
  assert.equal(st.session.message, null);
  near(volume(st), 16000 - 3 * (1 - Math.PI / 4) * 9 * 20, 0.5);
  assert.equal(scene(st.session).steps.at(-1)!.type, "edgeMod");
});

test("move, rotate and scale the whole body: pick the body (three clicks), an axis with X Y Z, a number, Enter", () => {
  let st = top();
  st = drawBox(st, 20);
  st = { ...st, cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [BODY_OBJECT] } } };
  st = reduce(st, { type: "begin", name: "move" }, env);
  st = reduce(st, { type: "look", plane: "Y" }, env);
  st = typeText(st, "10");
  st = key(st, "Enter");
  const bb = st.session.outcome.kernel!.bbox!;
  near(bb.min[1], 3 + 10);
  near(bb.max[1], 23 + 10);
  st = reduce(st, { type: "begin", name: "scale" }, env);
  st = typeText(st, "2");
  st = key(st, "Enter");
  near(volume(st), 16000 * 8, 1);
  assert.equal(scene(st.session).steps.length, 3);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  assert.equal(st.op!.axis, 2, "rotate starts about Z");
});

test("an operation that cannot start says why and starts nothing", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "extrude" }, env);
  assert.match(st.session.message ?? "", /select a closed figure/);
  assert.equal(st.op, null);
  st = reduce(st, { type: "begin", name: "edge" }, env);
  assert.match(st.session.message ?? "", /lines of the body/);
  st = reduce(st, { type: "begin", name: "move" }, env);
  assert.match(st.session.message ?? "", /select the body/);
});

test("keys: R C L start the tools, digits and Enter are typed, F B E M T K start operations", () => {
  const r = createRecognizer();
  const k = (key: string): Intent[] => r.feed({ kind: "key", key, down: true, mods: { shift: false, ctrl: false, alt: false }, t: 1 });
  assert.deepEqual(k("r"), [{ type: "begin", name: "rect" }]);
  assert.deepEqual(k("c"), [{ type: "begin", name: "circle" }]);
  assert.deepEqual(k("l"), [{ type: "begin", name: "line" }]);
  assert.deepEqual(k("e"), [{ type: "begin", name: "extrude" }]);
  assert.deepEqual(k("f"), [{ type: "begin", name: "edge" }]);
  assert.deepEqual(k("b"), [{ type: "begin", name: "edge" }], "fillet and chamfer are one operation");
  assert.deepEqual(k("m"), [{ type: "begin", name: "move" }]);
  assert.deepEqual(k("t"), [{ type: "begin", name: "rotate" }]);
  assert.deepEqual(k("k"), [{ type: "begin", name: "scale" }]);
  assert.deepEqual(k("7"), [{ type: "typed", key: "7", shift: false }]);
  assert.deepEqual(k("Enter"), [{ type: "typed", key: "Enter", shift: false }]);
  assert.deepEqual(k("Backspace"), [{ type: "delete" }, { type: "typed", key: "Backspace", shift: false }]);
});

import type { Command } from "../src/interaction/api.ts";
function applyCommand(st: AppState, c: Command) {
  return run(st.session, c);
}

import { frameOf } from "../src/interaction/frame.ts";
test("while the distance is being set the picture is the real result: a body appears (gray, from the kernel) before the extrude is done, and the cut shows the hole", () => {
  let st = top();
  st = drawBox(st, 0);
  assert.equal(st.session.outcome.kernel, null, "nothing is extruded yet");
  const none = frameOf(st, { w: 800, h: 600 });
  assert.equal(none.mesh, null, "no number yet: nothing to show");
  st = typeText(st, "15");
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.mesh && f.mesh.triangles.length >= 36, "the body it would make");
  assert.ok(Object.values(f.scene.parts).some((p) => p.kind === "body"));
  assert.equal(st.session.outcome.kernel, null, "and still nothing is done");
  assert.equal(scene(st.session).steps.length, 0);
  // a ball sits on the placed figure's other defining point
  let t = top();
  t = reduce(t, { type: "begin", name: "rect" }, env);
  t = click(t, [5, 5, 0]);
  assert.deepEqual(frameOf(t, { w: 800, h: 600 }).gizmo!.handles.map((h) => [h.id, h.kind, h.points[0]]), [["sketch", "ball", [15, 15, 0]]]);
  // cut: draw on the top of a body and set a negative distance: the preview is the body with the hole
  let c = top();
  c = drawBox(c, 20);
  c = { ...c, cam: homeCamera() };
  c = reduce(c, { type: "begin", name: "rect" }, env);
  c = click(c, [30, 10, 20]);
  c = key(typeText(c, "10"), "Tab");
  c = key(typeText(c, "10"), "Enter");
  c = reduce(c, { type: "begin", name: "extrude" }, env);
  const solid = frameOf(typeText(c, "-5"), { w: 800, h: 600 }).mesh!.triangles.length;
  const plain = c.session.outcome.kernel!.mesh!.triangles.length;
  assert.ok(solid > plain, "the hole adds faces");
});

test("after an extrude nothing is selected and nothing is hovered or spreading from before", () => {
  let st = top();
  st = drawBox(st, 20);
  assert.deepEqual(selection(st.session), []);
  assert.equal(st.session.hover, undefined);
  assert.equal(st.spread, null);
});

test("the pencil: a selected plane offers it, it offers the shapes, and the shape's first click lands on that plane", () => {
  let st = top();
  st = reduce(st, { type: "look", plane: "Z" }, env); // the compass button selects the XY plane
  st = { ...st, anim: null, cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [20, 15, 0] } };
  assert.deepEqual(selection(st.session), [XY]);
  const modes = (s: AppState) => frameOf(s, { w: 800, h: 600 }).annotations.filter((a) => a.mode).map((a) => a.mode);
  assert.deepEqual(modes(st), ["sketch"]);
  st = reduce(st, { type: "begin", name: "sketch" }, env); // what a click on the pencil does
  assert.deepEqual(modes(st), ["rect", "circle", "line"]);
  st = reduce(st, { type: "begin", name: "circle" }, env);
  assert.equal(st.tool!.plane, XY);
  assert.equal(st.sketching, null);
  st = click(st, [30, 12, 0]);
  assert.ok(st.tool!.placed);
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "circle").length, 1);
});

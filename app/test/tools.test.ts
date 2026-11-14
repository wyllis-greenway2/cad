import { drawCircle, drawChain } from "../src/operation/build.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import test from "node:test";
import { flat } from "./helpers/menu.ts";
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
/** A figure is made and the tool stays on, ready on the same plane for the next (`in_193`); a right click puts it away. */
const stays = (st: AppState): AppState => {
  assert.ok(st.tool && st.tool.plane && st.tool.points.length === 0, "the tool is still on, ready for the next figure");
  const off = reduce(st, { type: "menu", x: 5, y: 5, button: false }, env);
  assert.equal(off.tool, null, "a right click puts it away");
  return off;
};
const volume = (st: AppState) => st.session.outcome.kernel?.volume ?? 0;

test("rectangle: arm, click a surface, click again: one rectangle kept level, selected as a closed figure, tool put away; one undo removes it all", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  assert.ok(st.tool && !st.tool.plane);
  st = click(st, [5, 5, 0]); // on the XY pane
  assert.equal(st.tool!.plane, XY);
  st = move(st, [25, 15, 0]);
  assert.equal(previewFor(scene(st.session), st.tool)!.segments.length, 4);
  assert.deepEqual(entryOf(scene(st.session), st.tool, null)!.fields.map((f) => f.value), ["20", "10"]);
  st = click(st, [25, 15, 0]);
  st = stays(st);
  assert.deepEqual(corners(st).map((c) => c.map((v) => Math.round(v * 100) / 100)).sort(), [[5, 5, 0], [5, 15, 0], [25, 5, 0], [25, 15, 0]].sort());
  assert.equal(scene(st.session).relations.length, 4);
  assert.match(selection(st.session)[0]!, /^d\/loop@/);
  st = { ...st, session: undoLast(st.session) };
  assert.equal(corners(st).length, 0, "the whole rectangle goes in one undo");
  assert.equal(scene(st.session).relations.length, 0);
});

test("a rectangle stays a rectangle when a corner is dragged: its sides are kept level with the plane", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [5, 5, 0]);
  st = click(st, [25, 15, 0]);
  const some = Object.values(scene(st.session).parts).find((p) => p.kind === "corner" && p.origin === "drawn")!;
  const session = (applyCommand(st, { type: "movePart", ref: some.ref, to: [7, 9, 0] }));
  const cs = Object.values(scene(session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as unknown as { at: Vec3 }).at);
  const xs = new Set(cs.map((c) => Math.round(c[0] * 1e4)));
  const ys = new Set(cs.map((c) => Math.round(c[1] * 1e4)));
  assert.equal(xs.size, 2);
  assert.equal(ys.size, 2);
});

test("typed sizes: width, Tab, height, Enter makes exactly that rectangle, on the side the cursor is", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [10, 10, 0]);
  st = move(st, [2, 4, 0]); // up-left of the first corner
  st = typeText(st, "40");
  st = key(st, "Tab");
  st = typeText(st, "2.5");
  assert.deepEqual(entryOf(scene(st.session), st.tool, null)!.fields.map((f) => [f.value, f.active]), [["40", false], ["2.5", true]]);
  st = key(st, "Enter");
  st = stays(st);
  const xs = corners(st).map((c) => c[0]);
  const ys = corners(st).map((c) => c[1]);
  near(Math.min(...xs), -30);
  near(Math.max(...xs), 10);
  near(Math.min(...ys), 7.5);
  near(Math.max(...ys), 10);
});

test("circle: centre then radius by click; or a typed diameter with Enter", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "circle" }, env);
  st = click(st, [10, 10, 0]);
  st = click(st, [16, 10, 0]);
  const circles = Object.values(scene(st.session).parts).filter((p) => p.kind === "circle") as { radius: number }[];
  near(circles[0]!.radius, 6);
  assert.match(selection(st.session)[0]!, /^d\/disk@/);
  st = reduce(st, { type: "begin", name: "circle" }, env);
  st = click(st, [20, 20, 0]);
  st = typeText(st, "9");
  st = key(st, "Enter");
  const radii = (Object.values(scene(st.session).parts).filter((p) => p.kind === "circle") as { radius: number }[]).map((c) => c.radius).sort();
  near(radii[0]!, 4.5);
});

test("line: two clicks make one segment and the tool is put away; an open line is fine; lines that meet at corners make a shape", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [5, 5, 0]);
  assert.ok(st.tool, "waiting for the end");
  st = click(st, [25, 5, 0]);
  st = stays(st);
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "drawn").length, 1);
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "face").length, 0, "an open sketch is just a line");
  // two more lines, each starting at a corner that is already there: a triangle, which is a shape
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [25, 5, 0]);
  st = click(st, [25, 15, 0]);
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [25, 15, 0]);
  st = click(st, [5, 5, 0]);
  assert.equal(corners(st).length, 3, "the lines share their corners");
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "face").length, 1, "the closed loop is a face");
  // a typed length
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [12, 2, 0]);
  st = move(st, [18, 2, 0]);
  st = typeText(st, "4");
  st = key(st, "Enter");
  st = stays(st);
  near(Math.max(...corners(st).filter((c) => c[1] < 4 && c[0] > 10).map((c) => c[0])), 16);
});

test("curve: two clicks for the ends, a third for how far it bows out; it is an arc about a centre point, it can close a shape, and the shape extrudes round", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "arc" }, env);
  st = click(st, [5, 5, 0]);
  st = click(st, [25, 5, 0]);
  assert.ok(st.tool && st.tool.points.length === 2, "the ends are down, the bow is next");
  st = move(st, [15, 12, 0]);
  assert.ok(previewFor(scene(st.session), st.tool)!.segments.length > 10, "the arc is previewed");
  assert.equal(entryOf(scene(st.session), st.tool, null)!.fields[0]!.value, "7", "the height of the bow");
  st = click(st, [15, 12, 0]);
  st = stays(st);
  const arc = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "drawn") as { center: string; ccw: boolean };
  assert.ok(arc.center, "an arc has a centre point of its own");
  const c = (scene(st.session).parts[arc.center as never] as { at: Vec3 }).at;
  near(c[0], 15, 1e-6); // on the middle line between the ends
  const radius = Math.hypot(c[0] - 5, c[1] - 5);
  assert.ok(radius > 7, "the radius: a circle through the ends and 7 out");
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "face").length, 0, "open");
  // close it with a straight line: a half-moon shape, extruded 10: more than a triangle, less than a rectangle
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [25, 5, 0]);
  st = click(st, [5, 5, 0]);
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "face")!;
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [face.ref] } } };
  st = reduce(st, { type: "begin", name: "extrude" }, env);
  st = key(typeText(st, "10"), "Enter");
  assert.equal(st.session.message, null);
  const v = st.session.outcome.kernel!.volume!;
  assert.ok(v > 20 * 7 * 10 * 0.6 && v < 20 * 7 * 10, `the volume of an arched shape (${v})`);
});

test("a tool is armed again to put it away; Esc cancels a figure half drawn; a click on nothing says where to click", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = reduce(st, { type: "begin", name: "rect" }, env);
  assert.equal(st.tool, null);
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [300, 300, 0]);
  assert.equal(st.tool!.plane, XY, "the world planes are infinite: a click anywhere on one takes the drawing");
  st = reduce(st, { type: "escape" }, env);
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [5, 5, 0]);
  st = reduce(st, { type: "escape" }, env);
  assert.equal(st.tool, null);
  assert.equal(corners(st).length, 0);
});

test("the first corner snaps to a corner that is already there; free points are rounded", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [5, 5, 0]);
  st = click(st, [25.003, 15.004, 0]);
  assert.ok(corners(st).some((c) => c[0] === 25 && c[1] === 15), "rounded to 0.01");
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
  assert.equal(entryOf(scene(st.session), null, st.op)!.fields[0]!.value, "0", "no size yet (it says 0, not a blank): drag the double arrow or type one");
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
  assert.match(st.session.message ?? "", /lines or flat faces of the body/);
  st = reduce(st, { type: "begin", name: "move" }, env);
  assert.match(st.session.message ?? "", /select the body/);
});

test("keys: no letter starts anything for now (in_131); digits and Enter are typed", () => {
  const r = createRecognizer();
  const k = (key: string): Intent[] => r.feed({ kind: "key", key, down: true, mods: { shift: false, ctrl: false, alt: false }, t: 1 });
  for (const letter of ["r", "c", "l", "e", "f", "b", "m", "t", "k", "d", "h", "x", "y", "z", "n"]) assert.deepEqual(k(letter), [], letter);
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
  // the pointer ball marks the cursor while drawing
  let t = top();
  t = reduce(t, { type: "begin", name: "rect" }, env);
  t = click(t, [5, 5, 0]);
  t = move(t, [20, 12, 0]);
  assert.deepEqual(previewFor(scene(t.session), t.tool)!.cursor, [20, 12, 0], "a ball marks where the pointer is on the plane");
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

test("the right-click ring offers all the operations around the click; nothing on the left click offers a mode (no pencil, no extrude bubble)", () => {
  let st = drawBox(top(), 20);
  st = reduce(st, { type: "escape" }, env);
  const topFace = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20)!;
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [topFace.ref] } } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(!f.annotations.some((a) => ["pushpull", "sketch", "edge", "rect"].includes(a.kind)), "a left click shows constraints and dimensions only");
  const ring = flat(reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items);
  assert.deepEqual(ring.map((i) => i.id), ["tool:rect", "tool:circle", "tool:line", "tool:arc", "tool:trim", "op:offset", "op:pushpull", "op:edge", "op:scale", "combine:add", "combine:cut", "op:move", "op:rotate", "op:copy", "op:linear", "op:circular", "repeat:edit", "repeat:break", "select:similar", "select:group", "select:ungroup", "look", "delete"]);
  assert.deepEqual(ring.filter((i) => !i.enabled).map((i) => i.id), ["combine:add", "combine:cut", "repeat:edit", "repeat:break", "select:group", "select:ungroup", "delete"], "one face is nothing to group and is no group to break; a face cannot be deleted (fillet / chamfer takes a flat face too now, `in_257`, as offset does, `in_199`)");
  assert.ok(ring.every((i) => i.icon));
  const drawing = reduce(st, { type: "runAction", id: "tool:circle" }, env);
  assert.equal(drawing.tool!.kind, "circle");
  const pushing = reduce(st, { type: "runAction", id: "op:pushpull" }, env);
  assert.equal(pushing.op!.kind, "pushpull");
});

test("while drawing, the pointer lines up with a corner that is level or upright with it, and a guide line shows it", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [5, 5, 0]);
  st = click(st, [25, 15, 0]);
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [40, 2, 0]);
  const [x, y] = px(st, [25.05, 22.03, 0]); // a hair off the upright through the corner (25, 15)
  st = reduce(st, { type: "hover", x, y }, env);
  near(st.tool!.cursor![0], 25, 1e-6);
  near(st.tool!.cursor![1], 22.03, 0.02);
  assert.ok(previewFor(scene(st.session), st.tool)!.segments.some(([a]) => a[0] === 25 && a[1] === 15), "a guide from the corner it lines up with");
});

test("a triple click on a sketch drawn on a face of a block turns to it, like a sketch in free space", () => {
  let st = drawBox(top(), 20); // 40 x 20 block from (3,3)
  st = { ...st, cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [10, 8, 20]);
  st = click(st, [30, 18, 20]);
  const fig = Object.values(scene(st.session).parts).find((p) => p.kind === "face" && p.origin === "drawn")!;
  assert.ok(fig);
  st = click({ ...st, tool: null, resume: null }, [16, 15.5, 20], 1);
  st = click(st, [16, 15.5, 20], 3); // (away from the arrow that shows by itself at the middle)
  assert.ok(st.anim, "the view is turning to the plane");
});

test("sketching goes on while you click on vertices: a line ending on an existing corner starts the next from it; ending anywhere else puts the tool away", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [5, 5, 0]);
  st = click(st, [25, 5, 0]);
  st = stays(st);
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [5, 5, 0]); // on the first corner
  st = click(st, [25, 5, 0]); // on a corner: goes on
  assert.ok(st.tool && st.tool.points.length === 1, "the next segment has started at that corner");
  assert.deepEqual(st.tool!.points[0], [25, 5, 0]);
  st = click(st, [25, 15, 0]); // empty space: the segment is made, the tool is put away
  st = stays(st);
});

test("the tool stays on after a figure, ready on the same plane for the next one, until a right click or the cancel icon (Escape) puts it away (`in_193`); a right click with no tool opens the menu", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [5, 5, 0]);
  st = click(st, [25, 5, 0]);
  assert.ok(st.tool && st.tool.kind === "line" && st.tool.plane === XY && st.tool.points.length === 0, "still the line tool, on the same plane, nothing started");
  st = click(st, [5, 15, 0]);
  st = click(st, [25, 15, 0]);
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "drawn").length, 2, "a second line without choosing the tool again");
  assert.ok(st.tool);
  st = reduce(st, { type: "menu", x: 5, y: 5, button: false }, env); // a right click
  assert.equal(st.tool, null);
  assert.equal(st.menu, null, "it puts the tool away, it does not open the menu");
  assert.ok(reduce(st, { type: "menu", x: 5, y: 5, button: false }, env).menu, "with no tool, a right click opens the menu");
  let c = reduce(top(), { type: "begin", name: "circle" }, env);
  c = click(click(c, [20, 20, 0]), [30, 20, 0]);
  assert.ok(c.tool && c.tool.kind === "circle" && c.tool.plane);
  assert.equal(reduce(c, { type: "escape" }, env).tool, null, "the cancel icon at the top is Escape");
});


test("hints while drawing a line: close to level it becomes level with a horizontal constraint; close to square to a line it becomes perpendicular; on another line it is put on it", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [5, 5, 0]);
  st = click(st, [25, 5.4, 0]); // nearly level
  let sc = scene(st.session);
  const rels = () => scene(st.session).relations.map((r) => r.kind);
  assert.deepEqual(rels(), ["horizontal"]);
  const ys = Object.values(sc.parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as { at: Vec3 }).at[1]);
  assert.deepEqual(ys, [5, 5], "both ends at the same height: it is exactly level");
  // an upright line from its end: square to the first, so it is vertical too and perpendicular
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [25, 5, 0]);
  st = click(st, [25.5, 20, 0]);
  assert.ok(rels().includes("vertical") && rels().includes("perpendicular"));
  // a line ending on the middle of the first
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [40, 30, 0]);
  st = click(st, [14, 5.1, 0]);
  assert.ok(rels().includes("onLine"));
  sc = scene(st.session);
  assert.ok(Object.values(sc.parts).some((p) => p.kind === "corner" && Math.abs(p.at[0] - 14) < 1e-6 && Math.abs(p.at[1] - 5) < 1e-6), "its end is exactly on the first line");
});

test("a line from the centre of a circle to its edge ends exactly on the circle with an 'on circle' constraint; at that spot repeated clicks cycle between the corner and the circle, and both can be constrained", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "circle" }, env);
  st = click(st, [20, 20, 0]);
  st = click(st, [30, 20, 0]);
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [20, 20, 0]);
  st = click(st, [29.8, 20.3, 0]); // near the edge, not on it
  assert.ok(scene(st.session).relations.some((r) => r.kind === "onCircle"));
  const ends = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as { at: Vec3 }).at);
  assert.ok(ends.some((p) => Math.abs(Math.hypot(p[0] - 20, p[1] - 20) - 10) < 1e-6), "the end is exactly on the circle");
  // clicking where the corner and the circle are one on the other: the first click, then the next cycle through them; it never selects the whole object
  const edge: Vec3 = ends.find((p) => Math.abs(Math.hypot(p[0] - 20, p[1] - 20) - 10) < 1e-6)!;
  st = reduce(st, { type: "escape" }, env); // (the next click on a vertex would start another line)
  st = click(st, [80, 80, 0]); // nothing
  const seen = new Set<string>();
  for (let n = 1; n <= 3; n++) { st = click(st, edge, n); for (const r of selection(st.session)) seen.add(r); assert.ok(!selection(st.session).includes(BODY_OBJECT)); }
  assert.ok([...seen].some((r) => r.startsWith("d/") && scene(st.session).parts[r]?.kind === "circle"), "the circle edge can be selected");
  assert.ok([...seen].some((r) => scene(st.session).parts[r]?.kind === "corner"), "and the corner");
});

test("a line finished by typing its length and Enter leaves the tool on: the next click starts the next line", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [5, 5, 0]);
  st = move(st, [20, 5, 0]);
  st = typeText(st, "12");
  st = key(st, "Enter");
  assert.ok(st.tool && st.tool.points.length === 0);
  st = click(st, [17, 5, 0]); // the vertex just made
  assert.ok(st.tool && st.tool.points.length === 1);
});


test("picking a vertex and then, quickly, the circle's edge beside it, or Shift-clicking it, is two selections: it never counts as a double click that takes the whole object", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "circle" }, env);
  st = click(st, [20, 20, 0]);
  st = click(st, [30, 20, 0]);
  st = reduce(st, { type: "menu", x: 5, y: 5, button: false }, env); // (a right click puts the tool away)
  const centre: Vec3 = [20, 20, 0];
  const edge: Vec3 = [30, 20, 0];
  st = click(st, centre, 1);
  assert.equal(scene(st.session).parts[selection(st.session)[0]!]?.kind, "corner");
  st = click(st, edge, 2); // a different spot, quickly: counted as a double click by time and place only
  assert.equal(scene(st.session).parts[selection(st.session)[0]!]?.kind, "circle", "the circle edge, not the object");
  st = click(st, centre, 1);
  st = reduce(st, { type: "click", x: px(st, edge)[0], y: px(st, edge)[1], count: 2, shift: true }, env);
  assert.deepEqual(selection(st.session).map((r) => scene(st.session).parts[r]?.kind), ["corner", "circle"], "Shift adds the edge to the vertex");
});

test("a small circle: pointing at its edge a few pixels from its centre point picks the edge, the centre point still picks itself when you point at it", () => {
  let st = top();
  const perMm = Math.hypot(...([0, 1] as const).map((k) => px(st, [k, 0, 0])[0] - px(st, [0, 0, 0])[0]));
  const r = 9 / perMm; // a circle 9 px in radius: its edge is within the corner's pick distance of its centre
  st = reduce(st, { type: "begin", name: "circle" }, env);
  st = click(st, [20, 20, 0]);
  st = click(st, [20 + r, 20, 0]);
  const kind = (s: AppState) => scene(s.session).parts[selection(s.session)[0]!]?.kind;
  const onEdge = click(reduce(st, { type: "escape" }, env), [20 + r, 20, 0]);
  assert.equal(kind(onEdge), "circle", "on the edge: the edge");
  const onCentre = click(reduce(st, { type: "escape" }, env), [20, 20, 0]);
  assert.equal(kind(onCentre), "corner", "on the centre: the centre point");
});

test("a circle drawn about another circle's centre: a concentric hint shows, and the new circle is made concentric; two circles can be made concentric by hand", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "circle" }, env);
  st = click(st, [20, 20, 0]);
  st = click(st, [30, 20, 0]);
  st = reduce(st, { type: "begin", name: "circle" }, env);
  st = move(st, [20.1, 20.05, 0]); // near the centre: it snaps to it
  assert.deepEqual(st.tool!.hints?.map((h) => h.kind), ["concentric"], "the hint shows while the centre is on the other centre");
  st = click(st, [20.1, 20.05, 0]);
  st = click(st, [25, 20, 0]);
  const circles = Object.values(scene(st.session).parts).filter((p) => p.kind === "circle" && p.origin === "drawn");
  assert.equal(circles.length, 2);
  assert.deepEqual(scene(st.session).relations.map((r) => r.kind), ["concentric"]);
  const centres = circles.map((c) => (scene(st.session).parts[(c as { center: string }).center] as { at: Vec3 }).at);
  assert.ok(Math.hypot(centres[0]![0] - centres[1]![0], centres[0]![1] - centres[1]![1]) < 1e-9, "the same centre");
  // by hand: two circles with different centres, then Concentric from the right-click list
  let s = createSession(kernel);
  const a = drawCircle(scene(s), XY, [0, 0, 0], 5);
  s = run(s, a.command);
  const b = drawCircle(scene(s), XY, [10, 4, 0], 3);
  s = run(s, b.command);
  const act = actionsFor(scene(s), [b.circle, a.circle]).find((x) => x.id === "concentric")!; // (b is picked first and moves to a, `in_229`)
  assert.ok(act && act.enabled);
  s = run(s, act.run());
  const moved = (scene(s).parts[(scene(s).parts[b.circle] as { center: string }).center] as { at: Vec3 }).at;
  near(Math.hypot(moved[0], moved[1]), 0, 1e-6);
});

test("offset: a rectangle gets a bigger or smaller one drawn about it, a circle a concentric one, a line a parallel one; an inward offset past the middle makes nothing", () => {
  const offset = (st: AppState, text: string) => { let s = reduce(st, { type: "runAction", id: "op:offset" }, env); s = typeText(s, text); return key(s, "Enter"); };
  const drawnCorners = (st: AppState) => corners(st);
  // a rectangle 20 x 10
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [10, 10, 0]);
  st = click(st, [30, 20, 0]);
  const rect = st;
  let out = offset(rect, "2");
  assert.equal(out.session.message, null);
  const xs = drawnCorners(out).map((c) => c[0]);
  const ys = drawnCorners(out).map((c) => c[1]);
  assert.equal(drawnCorners(out).length, 8, "the old four and the new four");
  near(Math.min(...xs), 8); near(Math.max(...xs), 32); near(Math.min(...ys), 8); near(Math.max(...ys), 22);
  const inner = offset(rect, "-3");
  const ix = drawnCorners(inner).map((c) => c[0]).sort((a, b) => a - b);
  near(ix[2]!, 13); near(ix[5]!, 27); // the new corners: 3 in from 10 and 30
  assert.equal(drawnCorners(offset(rect, "-6")).length, 4, "past the middle (the short side is 10): nothing is made");
  // a circle
  let c = top();
  c = reduce(c, { type: "begin", name: "circle" }, env);
  c = click(c, [20, 15, 0]);
  c = click(c, [26, 15, 0]);
  const cout = offset(c, "4");
  const radii = Object.values(scene(cout.session).parts).filter((p) => p.kind === "circle" && p.origin === "drawn").map((p) => (p as { radius: number }).radius).sort((a, b) => a - b);
  near(radii[0]!, 6); near(radii[1]!, 10);
  assert.deepEqual(scene(cout.session).relations.map((r) => r.kind), ["concentric"]);
  // a line
  let l = top();
  l = reduce(l, { type: "begin", name: "line" }, env);
  l = click(l, [10, 10, 0]);
  l = click(l, [30, 10, 0]);
  const line = Object.values(scene(l.session).parts).find((p) => p.kind === "line" && p.origin === "drawn")!;
  l = { ...l, session: { ...l.session, click: { selection: [line.ref], spot: "" } } };
  const lout = offset(l, "5");
  const ly = [...new Set(corners(lout).map((p) => Math.round(p[1] * 100) / 100))].sort((a, b) => a - b);
  assert.equal(ly.length, 2, "the new line is parallel at 5");
  near(Math.abs(ly[1]! - ly[0]!), 5);
});

test("every sketch tool, and the offset, turns the view straight to a selected plane, a face or a sketch line (the sketch group's rule, `in_229`)", () => {
  let base = drawBox(top(), 20); // a block with a face on top
  base = { ...base, cam: homeCamera(), tool: null, resume: null };
  const sc = scene(base.session);
  const top0 = Object.values(sc.parts).find((p) => p.kind === "plane" && p.origin === "body" && Math.abs(p.at[2] - 20) < 1e-6);
  assert.ok(top0, "the top face of the block");
  const names = ["rect", "circle", "line", "arc", "trim", "offset"] as const;
  for (const name of names) {
    const st: AppState = { ...base, session: { ...base.session, click: { ...base.session.click, selection: [top0!.ref] } } };
    if (name !== "offset") assert.ok(reduce(st, { type: "begin", name }, env).anim, `${name}: the view turns to the selected face`);
    const viaMenu = reduce({ ...st, menu: { x: 10, y: 10, plane: null, items: [] } as never }, { type: "runAction", id: name === "offset" ? "op:offset" : `tool:${name}` }, env);
    assert.ok(viaMenu.anim, `${name}: and so from the menu`);
  }
  // a line of a sketch that is selected: its plane is the one
  const fig = Object.values(sc.parts).find((p) => p.kind === "line" && p.origin === "drawn");
  assert.ok(fig);
  for (const id of ["tool:trim", "tool:line", "op:offset"]) {
    const st: AppState = { ...base, session: { ...base.session, click: { ...base.session.click, selection: [fig!.ref] } } };
    assert.ok(reduce(st, { type: "runAction", id }, env).anim, `${id}: the view turns to the plane of the selected sketch line`);
  }
});

test("a line being drawn takes its end onto an arc, or tangent to it, as it does for a circle, and says which arc (`in_230`)", async () => {
  const { readFileSync } = await import("node:fs");
  const { openSession } = await import("../src/interaction/session.ts");
  const opened = openSession(kernel, readFileSync(new URL("./fixtures/circle-diameter-locked.cad.json", import.meta.url), "utf8")) as unknown as { value: import("../src/interaction/session.ts").Session };
  let st: AppState = { ...createState(opened.value), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [22, 14, 0] } };
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [5, 28, 0]);
  // near the right-hand arc (centre 35.67, 15.09; radius 3.5): the end is on it
  st = move(st, [35.67 + 3.51 + 0.1, 15.09 + 0.3, 0]);
  assert.equal(st.tool!.hints?.[0]?.kind, "onCircle");
  assert.equal(st.tool!.hints?.[0]?.ref, "d/e_015.s0", "the arc itself, not the piece an extrusion cut from it");
  // beyond the end of the arc's span there is nothing to be on
  st = move(st, [35.67 - 3.5 + 0.05, 15.09, 0]);
  assert.ok(!st.tool!.hints?.some((h) => h.ref === "d/e_015.s0" && h.kind === "onCircle"), "the part of the circle where the arc is not");
});

test("a double click on a sketch on its own (no body under it) turns the view straight to it: there is no body for a double click to take (`in_235`)", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [5, 5, 0]);
  st = click(st, [25, 25, 0]);
  st = { ...st, tool: null, resume: null, cam: homeCamera() };
  st = click(st, [22, 8, 0], 1); // (away from the arrow that shows by itself at the middle)
  assert.equal(st.anim, null);
  st = click(st, [22, 8, 0], 2);
  assert.ok(st.anim, "the view is turning to the sketch");
  assert.equal(selection(st.session).length, 1);
  assert.equal(scene(st.session).parts[selection(st.session)[0]!]!.kind, "face");
});

test("typing with a side of a sketch selected sets its length (and Enter locks it); the figure itself still extrudes (`dec_typing_standard`, `in_235`)", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [5, 5, 0]);
  st = click(st, [25, 25, 0]); // 20 x 20
  st = reduce(st, { type: "escape" }, env);
  const sc0 = scene(st.session);
  const side = Object.values(sc0.parts).find((p) => p.kind === "line" && p.origin === "drawn" && !p.derived)!;
  // the figure itself is selected: typing extrudes
  assert.equal(reduce(st, { type: "typed", key: "1", shift: false }, env).op?.kind, "extrude");
  // a side of it
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [side.ref] } } };
  const typing = typeText(st, "10");
  assert.equal(typing.op?.kind, "dimension", "typing sets the side's number, it does not extrude the figure");
  assert.equal(entryOf(scene(typing.session), null, typing.op)!.fields[0]!.value, "10");
  const done = key(typing, "Enter");
  assert.equal(done.op, null);
  assert.equal(scene(done.session).steps.length, 0, "no extrusion");
  assert.equal(scene(done.session).relations.filter((r) => r.kind === "length").length, 1, "a locked length");
  const len = (s: AppState) => { const l = scene(s.session).parts[side.ref]! as unknown as { a: never; b: never }; const [a, b] = [scene(s.session).parts[l.a] as unknown as { at: Vec3 }, scene(s.session).parts[l.b] as unknown as { at: Vec3 }]; return Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1], a.at[2] - b.at[2]); };
  near(len(done), 10, 1e-6);
  // and one undo takes back the length, not the figure
  const back = reduce(done, { type: "undo" }, env);
  assert.equal(scene(back.session).relations.filter((r) => r.kind === "length").length, 0);
  near(len(back), 20, 1e-6);
  assert.ok(Object.values(scene(back.session).parts).some((p) => p.kind === "line" && p.origin === "drawn"), "the figure is still there");
});

test("one number for each kind of selection: a circle takes a diameter, an arc a radius, two sides an angle, a corner and a corner a distance", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [10, 10, 0], 4);
  s = run(s, c.command);
  const withSel = (refs: string[]): AppState => ({ ...createState(s), session: { ...s, click: { ...s.click, selection: refs as never } } });
  const circleSel = typeText(withSel([c.circle]), "6");
  assert.equal(circleSel.op?.kind, "dimension");
  assert.equal(entryOf(scene(circleSel.session), null, circleSel.op)!.fields[0]!.label.toLowerCase().includes("diam"), true, "a circle: its diameter");
  // a corner alone has no number: typing does nothing (it does not extrude the figure it belongs to)
  const centre = (scene(s).parts[c.circle] as unknown as { center: string }).center;
  assert.equal(typeText(withSel([centre]), "6").op, null);
});

test("typing standard, the rest of the table: an arc takes a radius, two sides that meet an angle, two corners a distance; a body's edge still takes a fillet size and a body's face a push (`dec_typing_standard`)", async () => {
  const { readFileSync } = await import("node:fs");
  const { openSession } = await import("../src/interaction/session.ts");
  const opened = (openSession(kernel, readFileSync(new URL("./fixtures/circle-diameter-locked.cad.json", import.meta.url), "utf8")) as unknown as { value: import("../src/interaction/session.ts").Session }).value;
  const sc = scene(opened);
  const withSel = (refs: string[]): AppState => ({ ...createState(opened), session: { ...opened, click: { ...opened.click, selection: refs as never } } });
  const label = (st: AppState) => entryOf(scene(st.session), null, st.op)?.fields[0]?.label ?? null;
  const arc = Object.values(sc.parts).find((p) => p.kind === "line" && p.origin === "drawn" && !p.derived && !!p.center)!;
  assert.match(label(typeText(withSel([arc.ref]), "3"))!, /radius/i, "an arc: its radius");
  const arcDone = key(typeText(withSel([arc.ref]), "3"), "Enter");
  assert.ok(scene(arcDone.session).relations.some((r) => r.kind === "radius" && r.parts.includes(arc.ref) && r.value === 3), "and Enter locks that radius, not the length of its chord");
  // two sides that meet
  let b = createSession(kernel);
  const ch = drawChain(scene(b), XY, [[0, 0, 0], [20, 0, 0], [20, 15, 0]]);
  b = run(b, ch.command);
  const bsel: AppState = { ...createState(b), session: { ...b, click: { ...b.click, selection: ch.lines as never } } };
  const two = typeText(bsel, "5");
  assert.equal(two.op?.kind, "dimension", "two sides: a number between them (their angle)");
  assert.match(label(two) ?? "", /angle/i);
  // a corner and a corner
  const corners = Object.values(sc.parts).filter((p) => p.kind === "corner" && p.origin === "drawn" && !p.derived && p.movable).slice(0, 2);
  assert.match(label(typeText(withSel(corners.map((c) => c.ref)), "5")) ?? "", /distance/i, "two corners: the distance");
});

test("draw a square, type 10, Enter, then undo: one undo takes back the extrusion and the square is still there; a second takes the square (`in_235`)", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = click(st, [5, 5, 0]);
  st = click(st, [25, 25, 0]);
  st = reduce(st, { type: "escape" }, env);
  st = key(typeText(st, "10"), "Enter");
  assert.equal(scene(st.session).steps.length, 1);
  const squares = (s: AppState) => Object.values(scene(s.session).parts).filter((p) => p.kind === "line" && p.origin === "drawn" && !p.derived).length;
  assert.equal(squares(st), 4);
  st = reduce(st, { type: "undo" }, env);
  assert.equal(scene(st.session).steps.length, 0, "the extrusion is gone");
  assert.equal(squares(st), 4, "the square is still there");
  st = reduce(st, { type: "undo" }, env);
  assert.equal(squares(st), 0, "the next undo takes the square");
  // typing without Enter and undoing: the pending number goes first, nothing is lost
  let t = top();
  t = reduce(t, { type: "begin", name: "rect" }, env);
  t = click(t, [5, 5, 0]);
  t = click(t, [25, 25, 0]);
  t = reduce(t, { type: "escape" }, env);
  t = typeText(t, "10");
  assert.equal(t.op?.kind, "extrude");
  t = reduce(t, { type: "undo" }, env);
  assert.equal(t.op, null);
  assert.equal(squares(t), 4, "the square is still there");
});

test("a long press on a face (a finger has no hover) opens the ring over it, and a sketch tool chosen there turns the view straight to it, as a right click does (`in_283`)", () => {
  let base = drawBox(top(), 20);
  base = { ...base, cam: homeCamera(), tool: null, resume: null, session: { ...base.session, hover: undefined, click: { ...base.session.click, selection: [] } } };
  const p = px(base, [23, 8, 20]); // (the middle of the block's top face)
  const long = reduce(base, { type: "menu", x: p[0], y: p[1] }, env);
  assert.ok(long.menu, "the ring is open");
  const chosen = reduce(long, { type: "runAction", id: "tool:rect" }, env);
  assert.ok(chosen.anim, "the view turns to the face under the finger");
});

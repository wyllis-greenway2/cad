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
  assert.equal(st.tool, null);
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
  assert.equal(st.tool, null);
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
  assert.equal(st.tool, null, "the line is made and the tool is gone: it does not go on adding lines");
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
  assert.equal(st.tool, null);
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
  assert.equal(st.tool, null);
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
  assert.match(st.session.message ?? "", /lines of the body/);
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
  assert.deepEqual(ring.map((i) => i.id), ["tool:rect", "tool:circle", "tool:line", "tool:arc", "op:pushpull", "op:edge", "op:scale", "op:move", "op:rotate", "op:copy", "op:linear", "op:circular", "delete"]);
  assert.deepEqual(ring.filter((i) => !i.enabled).map((i) => i.id), ["op:edge", "delete"], "fillet / chamfer needs lines of the body; a face cannot be deleted");
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
  st = click({ ...st, tool: null, resume: null }, [12, 9.5, 20], 3); // (away from the arrow that shows by itself at the middle)
  assert.ok(st.anim, "the view is turning to the plane");
});

test("sketching goes on while you click on vertices: a line ending on an existing corner starts the next from it; ending anywhere else puts the tool away", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [5, 5, 0]);
  st = click(st, [25, 5, 0]);
  assert.equal(st.tool, null, "ended in empty space: the tool is put away");
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [5, 5, 0]); // on the first corner
  st = click(st, [25, 5, 0]); // on a corner: goes on
  assert.ok(st.tool && st.tool.points.length === 1, "the next segment has started at that corner");
  assert.deepEqual(st.tool!.points[0], [25, 5, 0]);
  st = click(st, [25, 15, 0]); // empty space: the segment is made, the tool is put away
  assert.equal(st.tool, null);
});

test("sketching goes on right after a figure: a click on a vertex starts the next from it; any other click drops it", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [5, 5, 0]);
  st = click(st, [25, 5, 0]); // empty space: the line is made, the tool is put away but waits for a vertex
  assert.equal(st.tool, null);
  assert.equal(st.resume, "line");
  st = click(st, [25, 5, 0]); // the vertex just made: the next line starts from it
  assert.ok(st.tool && st.tool.points.length === 1);
  assert.deepEqual(st.tool!.points[0], [25, 5, 0]);
  st = click(st, [25, 15, 0]);
  assert.equal(st.resume, "line");
  st = click(st, [60, 60, 0]); // not a vertex: the mode is dropped
  assert.equal(st.resume, null);
  assert.equal(st.tool, null);
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

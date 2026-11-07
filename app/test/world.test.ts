import test from "node:test";
import { flat } from "./helpers/menu.ts";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, selection, run } from "../src/interaction/session.ts";
import { createState, reduce, gridPlaneOf } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { gridFor, niceStep } from "../src/interaction/grid.ts";
import { candidatesAt } from "../src/interaction/picking.ts";
import { paneCorners } from "../src/interaction/panes.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId, lookup } from "../src/operation/scene.ts";
import type { Plane } from "../src/operation/part.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };

test("grid steps are round numbers that put about thirty lines across the view", () => {
  assert.equal(niceStep(300, 30), 10);
  assert.equal(niceStep(75, 30), 2);
  assert.equal(niceStep(40, 30), 1);
  assert.equal(niceStep(3000, 30), 100);
});

test("the grid covers the view with every fifth line heavier when looking straight; seen from the side it is a patch of the plane about the view's middle (`in_190`)", () => {
  const xy = lookup(createSession(kernel).history.scene)(XY) as Plane;
  const side = gridFor(homeCamera(), xy, 800, 600)!;
  assert.ok(side && side.minor.length > 0 && side.major.length > 0, "there in 3D too");
  const g = gridFor(lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), xy, 800, 600)!;
  assert.ok(g.minor.length > 0 && g.major.length > 0);
  assert.ok(g.minor.length > g.major.length * 2);
  assert.equal(g.step, 2, "75 mm across the view: two millimetre lines");
  const back = gridFor(lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0], -1), xy, 800, 600);
  assert.ok(back, "also from behind");
  const xz = lookup(createSession(kernel).history.scene)(worldRef("XZ")) as Plane;
  assert.equal(gridFor(lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), xz, 800, 600)!.minor.length > 0, true, "a plane seen edge-on still gets its patch (it is a line then)");
});

test("the grid plane is the selected plane when it faces the camera while looking straight, else the world plane that is on", () => {
  let st = createState(createSession(kernel));
  assert.equal(gridPlaneOf(st)!.ref, XY, "the floor is on to begin with, seen from the side too");
  st = { ...st, cam: lookStraight(homeCamera(), [1, 0, 0], [0, 1, 0]) };
  assert.equal(gridPlaneOf(st)!.ref, XY, "looking along X without choosing that plane changes nothing");
  st = reduce(st, { type: "look", plane: "X" }, env);
  assert.equal(gridPlaneOf(st)!.ref, worldRef("YZ"), "the X button turns the YZ plane on");
  assert.equal(st.world, "YZ");
});

test("the little panes: one in each world plane, apart from the origin; clicking one turns that plane on and looks straight at it; only the plane that is on is found by the pointer", () => {
  let st = createState(createSession(kernel));
  assert.deepEqual(frameOf(st, { w: 800, h: 600 }).panes.map((p) => [p.name, p.active]), [["XY", true], ["XZ", false], ["YZ", false]]);
  const pr = projector(st.cam, 800, 600);
  const centre = (name: "XY" | "XZ" | "YZ") => { const q = paneCorners(name).map((p) => pr.project(p)); return [q.reduce((a, b) => a + b[0]!, 0) / 4, q.reduce((a, b) => a + b[1]!, 0) / 4] as const; };
  for (const name of ["XZ", "YZ"] as const) {
    const [x, y] = centre(name);
    const hovered = reduce(st, { type: "hover", x, y }, env);
    assert.equal(hovered.paneHover, name, `${name} lights up`);
    assert.equal(hovered.session.hover, undefined, "nothing behind it is hovered");
    const clicked = reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
    assert.equal(clicked.world, name);
    assert.ok(clicked.anim, "the view turns straight to it");
  }
  // the pane of the plane that is on is a pane too (it only lights): clicking it keeps it on
  const [x, y] = centre("XY");
  assert.equal(reduce(st, { type: "click", x, y, count: 1, shift: false }, env).world, "XY");
});


function withBody(): AppState {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [30, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 10 } } });
  return createState(s);
}

test("the world panes stay as the backdrop after there is a body", () => {
  const before = createSession(kernel);
  const pv = projector({ ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [10, 10, 0] }, 800, 600).view(400, 300);
  assert.ok(candidatesAt(scene(before), pv).some((c) => c.ref === XY));
  const st = withBody();
  const pv2 = projector({ ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [-15, 10, 0] }, 800, 600).view(400, 300);
  assert.ok(candidatesAt(scene(st.session), pv2).some((c) => c.ref.startsWith("w/") && c.ref.length === 4), "the pane is still there to land the ring on");
});

test("with a plane selected by the compass buttons, a tool draws on it without clicking a surface", () => {
  let st = withBody();
  st = reduce(st, { type: "look", plane: "Z" }, env);
  assert.deepEqual(selection(st.session), [XY]);
  st = { ...st, anim: null, cam: lookStraight(st.cam, [0, 0, 1], [1, 0, 0]) };
  st = reduce(st, { type: "begin", name: "rect" }, env);
  const [x, y] = projector(st.cam, 800, 600).project([60, 40, 0] as Vec3);
  st = reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
  assert.equal(st.tool!.plane, XY, "no surface under the click: the selected plane takes it");
});

test("the menu button acts on the selection, whatever is under it", () => {
  let st = withBody();
  st = reduce(st, { type: "look", plane: "Z" }, env);
  st = reduce(st, { type: "menu", x: 5, y: 5, button: true }, env);
  assert.ok(st.menu);
  assert.deepEqual(selection(st.session), [XY], "the selection did not change");
  assert.ok(flat(st.menu!.items).some((i) => i.id === "tool:rect"));
});

import { BODY_OBJECT } from "../src/compiler/body.ts";
import { undoLast } from "../src/interaction/session.ts";
import { drawCircle } from "../src/operation/build.ts";

const drawnParts = (st: AppState) => Object.values(scene(st.session).parts).filter((p) => p.origin === "drawn" && p.kind !== "face").length;
const select = (st: AppState, refs: string[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs as never } } });

test("delete a drawn figure: select it (its face), press Delete: the shape, its corners and its relations all go; one undo brings them back", () => {
  let st = withBody();
  // a second, separate figure to delete
  const c = drawCircle(scene(st.session), XY, [60, 60, 0], 5);
  st = { ...st, session: run(st.session, c.command) };
  const before = drawnParts(st);
  const disk = Object.values(scene(st.session).parts).find((p) => p.kind === "face" && p.disk)!.ref;
  st = select(st, [disk]);
  st = reduce(st, { type: "delete" }, env);
  assert.equal(drawnParts(st), before - 2, "the circle and its centre");
  st = { ...st, session: undoLast(st.session) };
  assert.equal(drawnParts(st), before);
});

test("delete a rectangle by its face: nothing is left behind, and its relations go", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [30, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  let st = createState(s);
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref;
  st = select(st, [face]);
  st = reduce(st, { type: "delete" }, env);
  assert.equal(drawnParts(st), 0);
  assert.equal(scene(st.session).relations.length, 0);
});

test("delete the body: select the object, Delete: the body goes as one step you can undo, with its steps and the sketches it was made from (`in_192`)", () => {
  let st = withBody();
  assert.ok(st.session.outcome.kernel);
  st = select(st, [BODY_OBJECT]);
  const items = reduce(st, { type: "menu", x: 5, y: 5, button: true }, env).menu!.items;
  assert.ok(items.find((i) => i.id === "delete")!.enabled);
  st = reduce(st, { type: "delete" }, env);
  assert.ok(!Object.values(scene(st.session).parts).some((p) => p.kind === "body"), "no body any more");
  assert.equal(consumed(scene(st.session)).size, 0, "nothing hidden is left behind");
  assert.deepEqual(Object.values(scene(st.session).parts).filter((p) => p.origin === "drawn" && p.kind !== "face"), [], "the rectangle it was made from is gone");
  assert.deepEqual(scene(st.session).steps, [], "and the steps that made the body");
  st = { ...st, session: undoLast(st.session) };
  assert.ok(Object.values(scene(st.session).parts).some((p) => p.kind === "body"), "undo brings the body back, with its sketch and steps");
  assert.equal(scene(st.session).steps.length, 1);
});

test("deleting a corner together with a line on it is not an error", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [30, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  let st = select(createState(s), [r.corners[0]!, r.lines[0]!]);
  st = reduce(st, { type: "delete" }, env);
  assert.equal(st.session.message, null);
  assert.equal(scene(st.session).parts[r.corners[0]!], undefined);
});

import { consumed } from "../src/operation/ownership.ts";
test("what an extrude has used up is neither drawn nor picked; undo and deleting the step bring it back", () => {
  let st = withBody();
  const used = consumed(scene(st.session));
  assert.ok(used.size >= 9, "the four lines, four corners and the face");
  assert.ok([...used].every((r) => r in scene(st.session).parts));
  const pv = projector({ ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [15, 10, 0] }, 800, 600);
  const [x, y] = pv.project([0, 0, 0] as Vec3); // the figure's corner
  assert.ok(!candidatesAt(scene(st.session), pv.view(x + 1, y + 1)).some((c) => used.has(c.ref)));
  st = { ...st, session: undoLast(st.session) };
  assert.equal(consumed(scene(st.session)).size, 0, "without the step it is a plain figure again");
});

import { frameOf } from "../src/interaction/frame.ts";
import { appRows, nextScrollMode, isScrollMode } from "../src/interaction/appmenu.ts";

test("the frame says what to draw: the cursor, the body, the selection; the small axes are always there and nothing flies into a corner", () => {
  const empty = frameOf(createState(createSession(kernel)), { w: 800, h: 600 });
  assert.equal(empty.mesh, null);
  assert.equal(empty.cursor, "");
  let st = withBody();
  assert.ok(frameOf(st, { w: 800, h: 600 }).mesh);
  st = reduce(st, { type: "begin", name: "rect" }, env);
  assert.equal(frameOf(st, { w: 800, h: 600 }).cursor, "crosshair");
  const sel = select(withBody(), [XY]);
  assert.deepEqual(frameOf(sel, { w: 800, h: 600 }).highlight.selection, [XY]);
});

test("the menu always ends with the lists, save, open, share state and the scroll mode, which cycles", () => {
  assert.deepEqual(appRows("auto").map((r) => r.id), ["undo", "redo", "bodies", "history", "save", "open", "share", "scrollMode"]);
  assert.match(appRows("pan")[7]!.label, /always pans/);
  assert.deepEqual(["auto", "pan", "zoom"].map((m) => nextScrollMode(m as never)), ["pan", "zoom", "auto"]);
  assert.ok(isScrollMode("zoom") && !isScrollMode("x") && !isScrollMode(null));
});

import { annotationsFor } from "../src/interaction/annotations.ts";
test("a line of the body shows its length (a block edge can be set, others are measurements only); a world plane is only a surface for the ring, never selected", () => {
  const st = withBody();
  const sc = scene(st.session);
  const line = Object.values(sc.parts).find((p) => p.kind === "line" && p.origin === "body")!;
  const sug = annotationsFor(sc, [line.ref], null).find((x) => x.id === "measure")!;
  assert.equal(sug.label, "Length");
  assert.equal(sug.readOnly, false, "a block edge: its length can be set (the face at its end moves)");
  assert.ok(sug.value! > 9);
  // before a body: a click anywhere on the infinite plane selects it, and an empty-space click lands on a plane
  let e = createState(createSession(kernel));
  e = { ...e, cam: lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]) };
  const [x, y] = projector(e.cam, 800, 600).project([300, 200, 0] as Vec3);
  e = reduce(e, { type: "hover", x, y }, env);
  assert.equal(e.session.hover, XY, "the ring lands on the plane anywhere on it");
  assert.ok(e.hoverPoint);
  e = reduce(e, { type: "click", x, y, count: 1, shift: false }, env);
  assert.deepEqual(selection(e.session), [], "but the world plane is not selectable: a click on it selects nothing");
  e = reduce(e, { type: "click", x, y, count: 2, shift: false }, env);
  assert.deepEqual(selection(e.session), [XY], "but a double click selects it and turns the view straight to it");
  assert.ok(e.anim || e.cam.straight);
  assert.equal(e.session.hover, XY, "and the ring stays");
});

test("a sketch tool chosen from the ring opened over a world plane turns the view straight to that plane", () => {
  let e = createState(createSession(kernel));
  e = { ...e, cam: homeCamera() };
  const [x, y] = projector(e.cam, 800, 600).project([30, 20, 0] as Vec3);
  e = reduce(e, { type: "hover", x, y }, env);
  assert.equal(e.session.hover, XY);
  e = reduce(e, { type: "menu", x, y }, env);
  assert.equal(e.menu!.plane, XY);
  e = reduce(e, { type: "runAction", id: "tool:rect" }, env);
  assert.ok(e.tool);
  assert.ok(e.anim, "the view turns");
});

import test from "node:test";
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

test("the grid exists only when looking straight at the plane, and covers the view with every fifth line heavier", () => {
  const xy = lookup(createSession(kernel).history.scene)(XY) as Plane;
  assert.equal(gridFor(homeCamera(), xy, 800, 600), null, "not in 3D");
  const g = gridFor(lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), xy, 800, 600)!;
  assert.ok(g.minor.length > 0 && g.major.length > 0);
  assert.ok(g.minor.length > g.major.length * 2);
  assert.equal(g.step, 2, "75 mm across the view: two millimetre lines");
  const back = gridFor(lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0], -1), xy, 800, 600);
  assert.ok(back, "also from behind");
  const xz = lookup(createSession(kernel).history.scene)(worldRef("XZ")) as Plane;
  assert.equal(gridFor(lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), xz, 800, 600), null, "a plane seen edge-on has none");
});

test("the grid plane is the selected plane when it faces the camera, else the world plane that does", () => {
  let st = createState(createSession(kernel));
  assert.equal(gridPlaneOf(st), null);
  st = { ...st, cam: lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]) };
  assert.equal(gridPlaneOf(st)!.ref, XY);
  st = { ...st, cam: lookStraight(homeCamera(), [1, 0, 0], [0, 1, 0]) };
  assert.equal(gridPlaneOf(st)!.ref, worldRef("YZ"));
});

function withBody(): AppState {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [30, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 10 } } });
  return createState(s);
}

test("the starter panes can be picked until there is a body; after that only the compass buttons and keys choose a world plane", () => {
  const before = createSession(kernel);
  const pv = projector({ ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [10, 10, 0] }, 800, 600).view(400, 300);
  assert.ok(candidatesAt(scene(before), pv).some((c) => c.ref === XY));
  const st = withBody();
  const pv2 = projector({ ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [-15, 10, 0] }, 800, 600).view(400, 300);
  assert.ok(!candidatesAt(scene(st.session), pv2).some((c) => c.ref.startsWith("w/") && c.ref.length === 4));
});

test("a click on the compass sends the axes back to the origin and again to return", () => {
  let st = withBody();
  assert.equal(st.axesBig, false);
  st = reduce(st, { type: "compass" }, env);
  assert.equal(st.axesBig, true);
  st = reduce(st, { type: "compass" }, env);
  assert.equal(st.axesBig, false);
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
  assert.ok(st.menu!.items.some((i) => i.id === "tool:rect"));
});

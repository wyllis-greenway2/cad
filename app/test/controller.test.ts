import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { dot } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, selection } from "../src/interaction/session.ts";
import { createState, reduce, advance, pivotOf } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { projector, basis, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { BODY_OBJECT, faceName } from "../src/compiler/body.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };
const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const nearV = (a: readonly number[], b: readonly number[], tol = 1e-6) => a.forEach((x, i) => near(x, b[i]!, tol));

function boxState(): AppState {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [-20, -10, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  return createState(s);
}
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);
const click = (st: AppState, p: Vec3, count = 1, shift = false, now = 0) => {
  const [x, y] = px(st, p);
  return reduce(st, { type: "click", x, y, count, shift }, { ...env, now });
};
const settle = (st: AppState) => advance(st, 1e9);
const SIDE: Vec3 = [20, 4, 8]; // a point on the +X face (away from the world pane inside the body, which is hidden behind the face)
const TOP: Vec3 = [0, 5, 20]; // a point on the top face
const OFF: Vec3 = [5000, 5000, 5000];

test("a click selects, a click on nothing lets go, Shift adds, Esc lets go", () => {
  let st = boxState();
  st = click(st, SIDE);
  assert.deepEqual(selection(st.session), [faceName([1, 0, 0], 20)]);
  st = click(st, TOP, 1, true);
  assert.equal(selection(st.session).length, 2);
  st = reduce(st, { type: "escape" }, env);
  assert.equal(selection(st.session).length, 0);
  st = click(st, SIDE);
  st = click({ ...st, cam: { ...st.cam } }, [3000, 3000, 3000]);
  assert.deepEqual(selection(st.session), []);
});

test("two clicks look straight at the plane clicked, from the side you are on, orthographic; the selection stays", () => {
  let st = boxState();
  st = click(st, SIDE, 1);
  st = click(st, SIDE, 2);
  assert.equal(st.anim, null, "not yet: a third click may be coming");
  assert.ok(st.pendingLook);
  st = advance(st, 10_000); // no third click: the camera starts to turn
  assert.ok(st.anim, "the camera turns smoothly");
  st = settle(st);
  assert.equal(st.cam.straight, true);
  nearV(basis(st.cam).forward, [-1, 0, 0], 1e-6);
  assert.deepEqual(selection(st.session), [faceName([1, 0, 0], 20)]);
});

test("three clicks select the whole object and the view never turns (no flash of the straight-on view on the way)", () => {
  let st = boxState();
  st = click(st, SIDE, 1);
  st = click(st, SIDE, 2, false, 100);
  st = click(st, SIDE, 3, false, 200);
  assert.deepEqual(selection(st.session), [BODY_OBJECT]);
  assert.equal(st.pendingLook, null, "the waiting turn is cancelled");
  assert.equal(st.anim, null);
  st = advance(st, 10_000);
  assert.equal(st.anim, null, "and it does not come later");
  assert.equal(st.cam.straight, false);
});

test("where things overlap, repeated clicks cycle with 'i of n' instead of looking or selecting the object", () => {
  let st = boxState();
  // a shape drawn on the top face with a corner exactly on the body's top corner: two corners at one spot
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20)!;
  let s = run(st.session, { type: "addPart", part: top });
  const r = drawRectangle(scene(s), top.ref, [20, 10, 20], [10, 0, 20], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  st = createState(s);
  const corner: Vec3 = [20, 10, 20];
  st = click(st, corner, 1);
  const first = selection(st.session)[0];
  st = click(st, corner, 2);
  assert.match(st.session.message ?? "", /^2 of \d+ here$/);
  assert.notEqual(selection(st.session)[0], first);
  assert.equal(st.anim, null, "no camera turn");
  assert.ok(!selection(st.session).includes(BODY_OBJECT));
});

test("a drawn closed shape: three clicks select its face; a corner of it first", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [40, 40, 0], [80, 70, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  let st = createState(s);
  st = { ...st, cam: lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]) };
  st = { ...st, cam: { ...st.cam, target: [60, 55, 0] } };
  st = click(st, [60, 55, 0], 1);
  const face = selection(st.session)[0]!;
  assert.match(face, /^d\/loop@/);
  st = click(st, [60, 55, 0], 3);
  assert.equal(selection(st.session)[0], face);
});

test("orbit keeps the model where it is on the screen; drag pan moves the picture; zoom stays bounded", () => {
  let st = boxState();
  st = reduce(st, { type: "pan", dx: 120, dy: -60 }, env);
  const c = pivotOf(st.session)!;
  const before = px(st, c);
  for (const [dx, dy] of [[30, 10], [-80, 25], [150, -40]] as const) st = reduce(st, { type: "orbit", dx, dy, x: 0, y: 0 }, env);
  nearV(px(st, c), before, 1e-6);
  st = reduce(st, { type: "zoom", factor: 1e-9, x: 400, y: 300 }, env);
  assert.ok(st.cam.distance >= 3);
});

test("zoom in toward the cursor keeps the point under it fixed; zoom out is about the view centre", () => {
  let st = boxState();
  const p: Vec3 = [20, 3, 7]; // a point on the +X face
  const [x, y] = px(st, p);
  const out = reduce(st, { type: "zoom", factor: 0.5, x, y }, env);
  nearV(px(out, p), [x, y], 1e-5);
  assert.ok(out.cam.distance < st.cam.distance);
  const back = reduce(st, { type: "zoom", factor: 2, x, y }, env);
  nearV(back.cam.target, st.cam.target);
});

test("X, Y, Z select that axis's plane and look along it, front then back then front", () => {
  let st = boxState();
  for (const [key, normal] of [["Z", [0, 0, 1]], ["X", [1, 0, 0]], ["Y", [0, -1, 0]]] as const) {
    st = reduce(st, { type: "look", plane: key }, env);
    st = settle(st);
    const side1 = dot(basis(st.cam).forward, normal);
    near(side1, -1);
    st = reduce(st, { type: "look", plane: key }, env);
    st = settle(st);
    near(dot(basis(st.cam).forward, normal), 1);
    st = reduce(st, { type: "look", plane: key }, env);
    st = settle(st);
    near(dot(basis(st.cam).forward, normal), -1);
    assert.deepEqual(selection(st.session), [worldRef({ Z: "XY", X: "YZ", Y: "XZ" }[key])]);
  }
});

test("N looks straight at the plane of the selection (a closed shape, a face), front then back; with nothing selected it says so", () => {
  let st = boxState();
  st = reduce(st, { type: "look", plane: "N" }, env);
  assert.match(st.session.message ?? "", /select something/);
  st = click(st, SIDE);
  st = reduce(st, { type: "look", plane: "N" }, env);
  st = settle(st);
  nearV(basis(st.cam).forward, [-1, 0, 0]);
  st = reduce(st, { type: "look", plane: "N" }, env);
  st = settle(st);
  nearV(basis(st.cam).forward, [1, 0, 0]);
});

test("the menu: a right click selects what is under it and offers the operations; running an item does it; undo undoes it", () => {
  let s = createSession(kernel);
  const a = drawCircle(scene(s), XY, [30, 0, 0], 3);
  s = run(s, a.command);
  const b = drawCircle(scene(s), XY, [60, 0, 0], 3);
  s = run(s, b.command);
  let st = createState(s);
  st = { ...st, cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [45, 0, 0] } };
  st = click(st, [33, 0, 0], 1); // the first circle's ring
  st = click(st, [63, 0, 0], 1, true); // and the second
  assert.deepEqual(selection(st.session), [a.circle, b.circle]);
  const [x, y] = px(st, [63, 0, 0]);
  st = reduce(st, { type: "menu", x, y }, env);
  assert.deepEqual(st.menu!.items.map((i) => i.label), ["Rectangle", "Circle", "Line", "Curve", "Push / pull", "Fillet / chamfer", "Move", "Rotate", "Scale", "Delete"], "the right click offers the operations (constraints are on the left click)");
  assert.ok(st.menu!.items.find((i) => i.id === "delete")!.enabled);
  const radiusBefore = (scene(st.session).parts[b.circle] as { radius: number }).radius;
  assert.equal(radiusBefore, 3);
  st = reduce(st, { type: "runAction", id: "equalRadius" }, env);
  assert.equal(st.menu, null);
  assert.equal(scene(st.session).relations.length, 1);
  st = reduce(st, { type: "undo" }, env);
  assert.equal(scene(st.session).relations.length, 0);
  st = reduce(st, { type: "redo" }, env);
  st = reduce(st, { type: "delete" }, env);
  assert.equal(scene(st.session).parts[a.circle], undefined);
  assert.equal(scene(st.session).relations.length, 0, "deleting a part takes its relations");
});

test("Esc closes the menu first, then lets go of the selection", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [30, 0, 0], 3);
  s = run(s, c.command);
  let st = createState(s);
  st = { ...st, cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [30, 0, 0] } };
  st = click(st, [33, 0, 0]);
  assert.deepEqual(selection(st.session), [c.circle]);
  const [x, y] = px(st, [33, 0, 0]);
  st = reduce(st, { type: "menu", x, y }, env);
  assert.ok(st.menu);
  st = reduce(st, { type: "escape" }, env);
  assert.equal(st.menu, null);
  assert.equal(selection(st.session).length, 1);
  st = reduce(st, { type: "escape" }, env);
  assert.equal(selection(st.session).length, 0);
});

test("hover finds the surface point for the ring; hover end clears it", () => {
  let st = boxState();
  const [x, y] = px(st, SIDE);
  st = reduce(st, { type: "hover", x, y }, env);
  assert.ok(st.session.hover);
  nearV(st.hoverPoint!, SIDE, 1e-3);
  st = reduce(st, { type: "hoverEnd" }, env);
  assert.equal(st.session.hover, undefined);
  assert.equal(st.hoverPoint, null);
});

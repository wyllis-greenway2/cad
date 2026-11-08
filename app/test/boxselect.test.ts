// Drag select with the right button (`in_230`).
import test from "node:test";
import assert from "node:assert/strict";
import type { Vec3 } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, selection } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { worldRef } from "../src/shared/ref.ts";
import { frameOf } from "../src/interaction/frame.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 };
const XY = worldRef("XY");
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);

function sketch(): AppState {
  let s = createSession(kernel);
  s = run(s, drawSquaredRectangle(scene(s), XY, [10, 10, 0], [50, 30, 0], [1, 0, 0], [0, 1, 0]).command);
  return { ...createState(s), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [30, 20, 0] } };
}
const drag = (st: AppState, from: Vec3, to: Vec3, shift = false, shown = true): AppState => {
  const [a, b] = [px(st, from), px(st, to)];
  st = reduce(st, { type: "box", x0: a[0], y0: a[1], x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, done: false, shift }, env);
  st = reduce(st, { type: "box", x0: a[0], y0: a[1], x: b[0], y: b[1], done: false, shift }, env);
  assert.equal(!!st.box, shown, "the rectangle is there while it is dragged");
  return reduce(st, { type: "box", x0: a[0], y0: a[1], x: b[0], y: b[1], done: true, shift }, env);
};
const lines = (st: AppState) => selection(st.session).filter((r) => scene(st.session).parts[r]?.kind === "line");

test("a rectangle dragged from the left round the whole sketch picks its four lines; one that holds only part of them picks nothing of those", () => {
  let st = drag(sketch(), [0, 0, 0], [60, 40, 0]);
  assert.equal(lines(st).length, 4);
  assert.equal(st.box, null, "the rectangle goes when it is let go");
  st = drag(sketch(), [0, 0, 0], [30, 20, 0]);
  assert.equal(lines(st).length, 0, "only what is wholly inside counts when dragged from the left");
});

test("dragged from the right to the left it picks what it touches too, and with only corners in it, the corners", () => {
  let st = drag(sketch(), [30, 40, 0], [0, 0, 0]);
  assert.ok(lines(st).length >= 3, "the lines it crosses");
  assert.ok(frameOf(reduce(sketch(), { type: "box", x0: 300, y0: 100, x: 100, y: 200, done: false, shift: false }, env), env).box!.touching, "drawn dashed");
  st = drag(sketch(), [5, 5, 0], [12, 12, 0]); // only the corner (10, 10) is in it (from the left: inside only)
  assert.deepEqual(selection(st.session).map((r) => scene(st.session).parts[r]!.kind), ["corner"]);
});

test("Shift adds to what is selected, and a drag that goes nowhere or a tool being on picks nothing", () => {
  let st = drag(sketch(), [5, 5, 0], [12, 12, 0]);
  const one = selection(st.session).length;
  st = drag(st, [48, 28, 0], [55, 35, 0], true);
  assert.equal(selection(st.session).length, one + 1);
  const small = reduce(sketch(), { type: "box", x0: 100, y0: 100, x: 101, y: 100, done: true, shift: false }, env);
  assert.equal(selection(small.session).length, 0);
  const tooling = drag(reduce(sketch(), { type: "begin", name: "line" }, env), [0, 0, 0], [60, 40, 0], false, false);
  assert.equal(selection(tooling.session).length, 0);
});

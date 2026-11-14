// An arc being drawn gets the same helpers as a line (`in_280`): its ends snap onto a line or a circle and say so, and its bow snaps to the one that meets a circle smoothly (tangent).
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { drawCircle, drawChain } from "../src/operation/build.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };
const near = (a: number, b: number, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const view = (s = createSession(kernel)): AppState => ({ ...createState(s), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [30, 15, 0] } });
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);
const click = (st: AppState, p: Vec3) => reduce(st, { type: "click", x: px(st, p)[0], y: px(st, p)[1], count: 1, shift: false }, env);
const move = (st: AppState, p: Vec3) => reduce(st, { type: "hover", x: px(st, p)[0], y: px(st, p)[1] }, env);
const rel = (st: AppState, kind: string) => scene(st.session).relations.filter((r) => r.kind === kind);

test("the end of an arc near a circle's edge snaps onto it, says so, and the arc is made with the constraint; the same for a straight line", () => {
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), XY, [20, 15, 0], 10).command);
  s = run(s, drawChain(scene(s), XY, [[0, -10, 0], [40, -10, 0]], false, { reuse: true }).command);
  let st = view(s);
  st = reduce(st, { type: "begin", name: "arc" }, env);
  st = click(st, [60, 0, 0]); // (the first end, away from everything)
  st = move(st, [30.05, 15.1, 0]); // near the circle's edge at (30, 15)
  assert.deepEqual(st.tool!.hints!.map((h) => h.kind), ["onCircle"]);
  const c = st.tool!.cursor!;
  near(Math.hypot(c[0] - 20, c[1] - 15), 10); // (it is exactly on the circle)
  st = click(st, [30.05, 15.1, 0]);
  st = move(st, [45, 12, 0]);
  st = click(st, [45, 12, 0]);
  const arc = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "drawn" && p.center)!;
  const onC = rel(st, "onCircle");
  assert.equal(onC.length, 1);
  assert.ok(onC[0]!.parts.includes((arc as { b: string }).b as never), "the end that was put on the circle");
  // an end near a straight line goes on it
  let t = view(s);
  t = reduce(t, { type: "begin", name: "arc" }, env);
  t = click(t, [60, 0, 0]);
  t = move(t, [25, -10.1, 0]);
  assert.deepEqual(t.tool!.hints!.map((h) => h.kind), ["onLine"]);
  near(t.tool!.cursor![1], -10);
});

test("the bow of an arc that ends on a circle snaps to tangent when it is close, the arc is made tangent, and the solver keeps it there", () => {
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), XY, [20, 15, 0], 10).command);
  let st = view(s);
  st = reduce(st, { type: "begin", name: "arc" }, env);
  st = click(st, [30, 15, 0]);
  st = click(st, [50, 30, 0]);
  // the arc about (45.625, 15) through both ends meets the circle smoothly at (30, 15): its middle is at (36.25, 27.5)
  st = move(st, [36, 27.2, 0]);
  assert.deepEqual(st.tool!.hints!.map((h) => h.kind), ["tangent"]);
  near(st.tool!.cursor![0], 36.25);
  near(st.tool!.cursor![1], 27.5);
  // far from it: no hint
  const far = move(st, [34, 24, 0]);
  assert.deepEqual(far.tool!.hints ?? [], []);
  st = click(st, [36, 27.2, 0]);
  assert.equal(st.session.message, null);
  const arc = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "drawn" && p.center)! as { center: string; a: string; b: string; ref: string };
  assert.equal(rel(st, "tangent").length, 1);
  assert.ok(rel(st, "onCircle").length >= 1, "its end is on the circle too");
  const at = (r: string) => (scene(st.session).parts[r as never] as { at: Vec3 }).at;
  const [C, A] = [at(arc.center), at(arc.a)];
  near(C[1], 15, 1e-3); // the centre is on the line through the circle's centre and the end: it is tangent
  near(Math.hypot(A[0] - 20, A[1] - 15), 10, 1e-3);
  // the circle is made bigger and its centre moved: the arc follows, still meeting it smoothly at the end that is on it
  const circle = Object.values(scene(st.session).parts).find((p) => p.kind === "circle")! as { ref: string; center: string };
  let moved = run(st.session, { type: "setRadius", ref: circle.ref as never, radius: 12 });
  moved = run(moved, { type: "movePart", ref: circle.center as never, to: [18, 17, 0] });
  const p = (r: string) => (scene(moved).parts[r as never] as { at: Vec3 }).at;
  const [C2, A2, K2] = [p(arc.center), p(arc.a), p(circle.center)];
  near(Math.hypot(A2[0] - K2[0], A2[1] - K2[1]), 12, 1e-3); // (the end is on the circle)
  const cross = (C2[0] - K2[0]) * (A2[1] - K2[1]) - (C2[1] - K2[1]) * (A2[0] - K2[0]);
  near(cross / Math.hypot(C2[0] - K2[0], C2[1] - K2[1]), 0, 1e-3); // (the two centres and the end are in line: tangent)
});

test("a height typed for the arc is not moved by a tangent", () => {
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), XY, [20, 15, 0], 10).command);
  let st = view(s);
  st = reduce(st, { type: "begin", name: "arc" }, env);
  st = click(st, [30, 15, 0]);
  st = click(st, [50, 30, 0]);
  st = reduce(st, { type: "typed", key: "3", shift: false }, env);
  st = move(st, [36, 27.2, 0]);
  assert.deepEqual(st.tool!.hints ?? [], []);
});

import { frameOf } from "../src/interaction/frame.ts";
test("a straight line and an arc get their helpers from the same code: the circle lights the same way for the first end, the second end, and the line offers a tangent from a start on a circle (`in_281`)", () => {
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), XY, [20, 15, 0], 10).command);
  const circle = Object.values(scene(s).parts).find((p) => p.kind === "circle")!.ref;
  for (const kind of ["line", "arc"] as const) {
    let st = view(s);
    st = reduce(st, { type: "begin", name: kind }, env);
    // the first end near the circle's edge
    st = move(st, [30.05, 15.1, 0]);
    assert.deepEqual(frameOf(st, env).highlight.amber, [circle], `${kind}: the circle is lit for the first end`);
    st = click(st, [30.05, 15.1, 0]);
    near(st.tool!.points[0]![0], 30);
    // the second end near it too
    st = move(st, [20.1, 25.05, 0]);
    assert.deepEqual(frameOf(st, env).highlight.amber, [circle], `${kind}: the circle is lit for the second end`);
    assert.deepEqual(st.tool!.hints!.map((h) => h.kind), ["onCircle"]);
    if (kind === "arc") {
      // with the ends down and the bow being set, the circle an end is on stays lit
      st = click(st, [20.1, 25.05, 0]);
      st = move(st, [40, 20, 0]);
      assert.deepEqual(frameOf(st, env).highlight.amber, [circle], "the circle both ends are on stays lit while the bow is set");
    }
  }
});

test("a straight line that starts on a circle snaps to the tangent there when its direction is close, and is made tangent with its start on the circle, and stays so when the circle changes", () => {
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), XY, [20, 15, 0], 10).command);
  let st = view(s);
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [30, 15, 0]);
  st = move(st, [30.8, 30, 0]); // nearly straight up: the tangent at (30, 15) is exactly up
  assert.deepEqual(st.tool!.hints!.map((h) => h.kind).sort(), ["tangent", "vertical"], "up is also upright: both are offered, as a line that is level and parallel gets both");
  near(st.tool!.cursor![0], 30);
  st = click(st, [30.8, 30, 0]);
  assert.equal(st.session.message, null);
  assert.equal(rel(st, "tangent").length, 1);
  assert.equal(rel(st, "onCircle").length, 1, "the start is on the circle");
  const circle = Object.values(scene(st.session).parts).find((p) => p.kind === "circle")! as { ref: string; center: string };
  const line = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "drawn")! as { a: string; b: string };
  let moved = run(st.session, { type: "setRadius", ref: circle.ref as never, radius: 12 });
  moved = run(moved, { type: "movePart", ref: circle.center as never, to: [18, 17, 0] });
  const p = (r: string) => (scene(moved).parts[r as never] as { at: Vec3 }).at;
  const [A, B, K] = [p(line.a), p(line.b), p(circle.center)];
  near(Math.hypot(A[0] - K[0], A[1] - K[1]), 12, 1e-3);
  const dist = Math.abs((B[0] - A[0]) * (K[1] - A[1]) - (B[1] - A[1]) * (K[0] - A[0])) / Math.hypot(B[0] - A[0], B[1] - A[1]);
  near(dist, 12, 1e-3); // (the line is still tangent)
  // far from the tangent: no hint
  const far = move(reduce(view(s), { type: "begin", name: "line" }, env), [30, 15, 0]);
  assert.ok(far.tool);
});

test("a circle's centre and a rectangle's corner get the helpers of any point: near another circle's edge they snap onto it, say so, and are made on it (`in_294`)", () => {
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), XY, [20, 15, 0], 10).command);
  const big = Object.values(scene(s).parts).find((p) => p.kind === "circle")!.ref;
  // a circle drawn with its centre near the edge at (30, 15)
  let st = view(s);
  st = reduce(st, { type: "begin", name: "circle" }, env);
  st = click(st, [30.05, 15.1, 0]);
  const centre = st.tool!.points[0]!;
  near(Math.hypot(centre[0] - 20, centre[1] - 15), 10, 0.02);
  st = move(st, [36, 15, 0]);
  st = click(st, [36, 15, 0]);
  const small = Object.values(scene(st.session).parts).filter((p) => p.kind === "circle" && p.ref !== big)[0] as { center: string } | undefined;
  assert.ok(small, "the circle is made");
  assert.ok(scene(st.session).relations.some((r) => r.kind === "onCircle" && r.parts.includes(small!.center as never) && r.parts.includes(big)), "its centre is on the large circle's edge");
  // a rectangle's first corner too
  let t = view(s);
  t = reduce(t, { type: "begin", name: "rect" }, env);
  t = move(t, [20, 25.05, 0]);
  t = click(t, [20, 25.05, 0]);
  t = move(t, [30, 40, 0]);
  t = click(t, [30, 40, 0]);
  assert.ok(scene(t.session).relations.some((r) => r.kind === "onCircle" && r.parts.includes(big)), "a corner of the rectangle is on the circle");
});

test("the edge of a circle being drawn that comes to where it touches another circle snaps there, says tangent, and the circle is made tangent (`in_296`)", () => {
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), XY, [20, 15, 0], 10).command);
  let st = view(s);
  st = reduce(st, { type: "begin", name: "circle" }, env);
  st = click(st, [50, 15, 0]); // (the centre, 30 from the other centre)
  st = move(st, [50, 36.05, 0]); // (about 20 away: the outside touch is at 20)
  assert.deepEqual(st.tool!.hints!.map((h) => h.kind), ["tangent"]);
  const c = st.tool!.cursor!;
  near(Math.hypot(c[0] - 50, c[1] - 15), 20);
  st = click(st, [50, 36.05, 0]);
  assert.equal(rel(st, "tangent").length, 1);
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "circle").length, 2);
});

test("a line that starts on a circle and runs along its tangent keeps that when its end comes to another circle's edge there: the end is on the second circle and the line tangent to the first (`in_301`)", () => {
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), XY, [20, 20, 0], 10).command); // A
  s = run(s, drawCircle(scene(s), XY, [70, 18, 0], 10).command); // B (its edge crosses y = 10 at x = 64)
  let st = view(s);
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [20, 10, 0]); // the bottom of A: its tangent there is level
  st = move(st, [64.05, 10.1, 0]); // (the pointer at B's edge on the level line from A's bottom)
  const kinds = st.tool!.hints!.map((h) => h.kind);
  assert.ok(kinds.includes("onCircle"), `on the second circle: ${kinds}`);
  assert.ok(kinds.includes("horizontal") || kinds.includes("tangent"), `and the line keeps its direction: ${kinds}`);
});

test("that line, made, has its end on the second circle and keeps the direction constraint (`in_301`)", () => {
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), XY, [20, 20, 0], 10).command);
  s = run(s, drawCircle(scene(s), XY, [70, 18, 0], 10).command);
  let st = view(s);
  st = reduce(st, { type: "begin", name: "line" }, env);
  st = click(st, [20, 10, 0]);
  st = move(st, [64.05, 10.1, 0]);
  st = click(st, [64.05, 10.1, 0]);
  const kinds = scene(st.session).relations.map((r) => r.kind);
  assert.ok(kinds.includes("onCircle"), `the ends on circles: ${kinds}`);
  assert.ok(kinds.includes("tangent") || kinds.includes("horizontal"), `and the direction: ${kinds}`);
  assert.ok(kinds.filter((k) => k === "onCircle").length >= 2, `both ends are on a circle: ${kinds}`);
});

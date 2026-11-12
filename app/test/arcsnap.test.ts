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

// The snapper (`in_1374`): a line that is level or upright keeps that on reaching another line (the end is where its direction meets the line); a circle's edge is snapped to from the middle.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { drawChain, drawCircle } from "../src/operation/build.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera, lookStraight, projector } from "../src/interaction/camera.ts";

await kernel.init();
const env = { w: 900, h: 700, now: 0 };
const start = (s: ReturnType<typeof createSession>) => {
  let st: any = { ...createState(s), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [10, 0, 0], distance: 120 } };
  st = reduce(st, { type: "begin", name: "line" }, env);
  const pr = projector(st.cam, env.w, env.h);
  const at = (x: number, y: number): [number, number] => pr.project([x, y, 0] as never) as [number, number];
  return { st, at };
};
const hover = (st: any, p: [number, number]) => reduce(st, { type: "hover", x: p[0], y: p[1] } as never, env);
const click = (st: any, p: [number, number]) => reduce(st, { type: "click", x: p[0], y: p[1], count: 1, shift: false }, env);

test("a level line keeps level on reaching an upright line: the end is where it meets it", () => {
  let s = createSession(kernel);
  s = run(s, drawChain(scene(s), worldRef("XY"), [[30, -20, 0], [30, 20, 0]]).command);
  let { st, at } = start(s);
  st = click(hover(st, at(0, 9)), at(0, 9));
  st = hover(st, at(29.3, 9.5)); // (near the line, a little off level, away from its middle)
  assert.ok(Math.abs(st.tool.cursor[0] - 30) < 1e-6 && Math.abs(st.tool.cursor[1] - 9) < 1e-6, `the end is (30, 9): ${st.tool.cursor}`);
  const kinds = st.tool.hints.map((h: { kind: string }) => h.kind);
  assert.ok(kinds.includes("horizontal") && kinds.includes("onLine"), kinds.join(","));
});

test("from the middle of a circle, its edge is snapped to on the way out", () => {
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), worldRef("XY"), [0, 0, 0], 20).command);
  let { st, at } = start(s);
  st = click(hover(st, at(0, 0)), at(0, 0));
  st = hover(st, at(14, 14.2));
  assert.ok(st.tool.hints.some((h: { kind: string }) => h.kind === "onCircle"), "on the circle");
  assert.ok(Math.abs(Math.hypot(st.tool.cursor[0], st.tool.cursor[1]) - 20) < 1e-6);
});

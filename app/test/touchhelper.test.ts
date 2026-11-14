// The touch helper (`in_283`, `in_284`): a finger taps an arrow to select it, then the drag icon drags it as a mouse would and the check applies.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera, projector } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 };

function oneBox(): AppState {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), worldRef("XY"), [0, 0, 0], [20, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 10 } } });
  const body = Object.values(scene(s).parts).find((p): p is Extract<Part, { kind: "body" }> => p.kind === "body")!;
  const st = createState(s);
  return { ...st, cam: homeCamera(), session: { ...st.session, click: { ...st.session.click, selection: [body.ref] } } };
}

test("an arrow of Move is tapped to select it; then the helper stands on it, the drag icon's proxy drag moves the body, and the check applies (`in_284`)", () => {
  let st = oneBox();
  st = reduce(st, { type: "begin", name: "move" }, env);
  let f = frameOf(st, { w: env.w, h: env.h });
  assert.equal(f.touchHelper?.points.length, 0, "three arrows and none chosen: no drag icon yet, but a tap on an arrow selects it and a tap elsewhere applies (`in_292`)");
  assert.equal(f.touchHelper?.handles.length, 3);
  const h = f.gizmo!.handles.find((x) => x.id === "move:x")!;
  const pr = projector(st.cam, env.w, env.h);
  const mid = pr.project([(h.points[0]![0] + h.points[1]![0]) / 2, (h.points[0]![1] + h.points[1]![1]) / 2, (h.points[0]![2] + h.points[1]![2]) / 2]);
  st = reduce(st, { type: "click", x: mid[0], y: mid[1], count: 1, shift: false }, env); // the tap
  f = frameOf(st, { w: env.w, h: env.h });
  assert.equal(f.touchHelper?.kind, "handle", "the arrow is chosen: the helper is offered");
  assert.equal(f.touchHelper?.applies, true, "an operation is open: the check applies it");
  const at = pr.project(f.touchHelper!.points[0]!.at);
  assert.ok(Math.hypot(at[0] - mid[0], at[1] - mid[1]) < 1, "the helper stands on the arrow");
  // the proxy drag: what the recogniser sends for a finger dragging the icon (the first move says where it began: the arrow)
  const before = Object.values(scene(st.session).parts).find((p) => p.kind === "body") as Extract<Part, { kind: "body" }>;
  const moves: [number, number][] = [[10, 0], [20, 0], [20, 0]];
  let [x, y] = at;
  for (const [dx, dy] of moves) { x += dx; y += dy; st = reduce(st, { type: "orbit", dx, dy, x, y }, env); }
  st = reduce(st, { type: "dragEnd" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env); // the check
  assert.equal(st.op, null, "applied");
  const after = Object.values(scene(st.session).parts).find((p) => p.kind === "body") as Extract<Part, { kind: "body" }>;
  assert.ok(Math.abs(after.bbox!.min[0] - before.bbox!.min[0]) > 1, `the body moved along x: ${before.bbox!.min[0]} to ${after.bbox!.min[0]}`);
  assert.ok(Math.abs(after.bbox!.min[1] - before.bbox!.min[1]) < 1e-6 && Math.abs(after.bbox!.min[2] - before.bbox!.min[2]) < 1e-6, "and only along x");
});

test("a single arrow (push / pull of a face) offers the helper at once once the operation is open; with a figure being drawn the helper is the cursor, and not with the first point not yet down", () => {
  let st = oneBox();
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!p.mesh && Math.abs(p.mesh[2]! - 10) < 1e-6 && Math.abs(p.mesh[5]! - 10) < 1e-6)!;
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [top.ref] } } };
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  const f = frameOf(st, { w: env.w, h: env.h });
  assert.equal(f.gizmo?.handles.length, 1);
  assert.equal(f.touchHelper?.kind, "handle");
  const t = reduce({ ...createState(createSession(kernel)), cam: homeCamera() }, { type: "begin", name: "rect" }, env);
  assert.equal(frameOf(t, { w: env.w, h: env.h }).touchHelper, null, "a tool armed, no point down: nothing to drag yet");
});

import { projector as proj, lookStraight } from "../src/interaction/camera.ts";
test("sketching with a finger (`in_288`): the first tap sets the first point where it is and the second is already held beside it, each with a drag icon; dragging the first icon moves the first point, dragging the other moves the held one, and a tap anywhere sets the held point: the figure is made", () => {
  let st: AppState = { ...createState(createSession(kernel)), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [20, 15, 0] } };
  const px = (p: [number, number, number]) => proj(st.cam, env.w, env.h).project(p);
  const f = () => frameOf(st, { w: env.w, h: env.h });
  st = reduce(st, { type: "begin", name: "rect" }, env);
  assert.equal(f().touchHelper, null, "nothing yet");
  const a = px([5, 5, 0]);
  st = reduce(st, { type: "tapAim", x: a[0], y: a[1] }, env);
  assert.equal(st.tool!.points.length, 1, "the first point is set where the tap is");
  assert.ok(st.tool!.held && st.tool!.cursor, "the second is held");
  assert.deepEqual(f().touchHelper!.points.map((p) => p.index), [0, -1], "an icon for each point: the first, and the held one");
  // the first icon moves the first point
  const m = px([7, 6, 0]);
  st = reduce(st, { type: "movePoint", index: 0, x: m[0], y: m[1] }, env);
  assert.ok(Math.abs(st.tool!.points[0]![0] - 7) < 0.3 && Math.abs(st.tool!.points[0]![1] - 6) < 0.3, `the first point moved: ${st.tool!.points[0]}`);
  // the held icon moves the held point
  const c = px([25, 14, 0]);
  st = reduce(st, { type: "hover", x: c[0], y: c[1] }, env);
  // a tap anywhere sets the held point where it is: the rectangle is made
  const far = px([0, 25, 0]);
  st = reduce(st, { type: "tapAim", x: far[0], y: far[1] }, env);
  const face = Object.values(scene(st.session).parts).filter((p) => p.kind === "face");
  assert.equal(face.length, 1, "one rectangle");
  const corners = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as unknown as { at: number[] }).at);
  assert.ok(corners.some((q) => Math.abs(q[0]! - 7) < 0.3 && Math.abs(q[1]! - 6) < 0.3) && corners.some((q) => Math.abs(q[0]! - 25) < 0.3 && Math.abs(q[1]! - 14) < 0.3), "from the moved first point to the held one");
  assert.ok(!st.tool?.held, "nothing is held after the figure");
  assert.equal(f().touchHelper, null);
});

test("an arc by touch: the first point set, the second held; setting it holds the bow; each point has an icon", () => {
  let st: AppState = { ...createState(createSession(kernel)), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [20, 15, 0] } };
  const px = (p: [number, number, number]) => proj(st.cam, env.w, env.h).project(p);
  st = reduce(st, { type: "begin", name: "arc" }, env);
  const a = px([5, 5, 0]);
  st = reduce(st, { type: "tapAim", x: a[0], y: a[1] }, env);
  assert.equal(st.tool!.points.length, 1);
  const b = px([25, 5, 0]);
  st = reduce(st, { type: "hover", x: b[0], y: b[1] }, env);
  st = reduce(st, { type: "tapAim", x: 10, y: 10 }, env); // sets the second end where it is held
  assert.equal(st.tool!.points.length, 2, "both ends are set");
  assert.ok(st.tool!.held, "the bow is held");
  assert.deepEqual(frameOf(st, { w: env.w, h: env.h }).touchHelper!.points.map((p) => p.index), [0, 1, -1], "an icon for each end and the bow");
  st = reduce(st, { type: "tapAim", x: 10, y: 10 }, env); // sets the bow: the arc is made
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "drawn" && p.center).length, 1, "an arc");
});

test("a circle by touch (`in_289`): the held point's icon sets the radius, the centre's icon moves the whole circle at that radius; a tap that sets it makes the circle and puts the tool away", () => {
  let st: AppState = { ...createState(createSession(kernel)), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [20, 15, 0] } };
  const px = (p: [number, number, number]) => proj(st.cam, env.w, env.h).project(p);
  st = reduce(st, { type: "begin", name: "circle" }, env);
  const a = px([10, 10, 0]);
  st = reduce(st, { type: "tapAim", x: a[0], y: a[1] }, env);
  // the held point sets the radius: take it to 6 along x
  const r = px([16, 10, 0]);
  st = reduce(st, { type: "hover", x: r[0], y: r[1] }, env);
  const radius = () => Math.hypot(st.tool!.cursor![0] - st.tool!.points[0]![0], st.tool!.cursor![1] - st.tool!.points[0]![1]);
  assert.ok(Math.abs(radius() - 6) < 0.3, `radius ${radius()}`);
  // the centre's icon moves the whole circle: the radius stays
  const m = px([20, 18, 0]);
  st = reduce(st, { type: "movePoint", index: 0, x: m[0], y: m[1] }, env);
  assert.ok(Math.abs(st.tool!.points[0]![0] - 20) < 0.3 && Math.abs(st.tool!.points[0]![1] - 18) < 0.3, "the centre moved");
  assert.ok(Math.abs(radius() - 6) < 0.3, `the radius is kept: ${radius()}`);
  const far = px([0, 25, 0]);
  st = reduce(st, { type: "tapAim", x: far[0], y: far[1] }, env);
  const circle = Object.values(scene(st.session).parts).find((p) => p.kind === "circle") as { radius: number } | undefined;
  assert.ok(circle && Math.abs(circle.radius - 6) < 0.3, "a circle of radius 6");
  assert.equal(st.tool, null, "the tool is put away with the tap that applied it");
});

import { drawCircle, drawChain } from "../src/operation/build.ts";
test("an applied drawing is moved with a finger (`in_290`): select a point, a line or a circle and its drag icon's proxy drag moves the point, moves the whole line, changes the circle's size", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), worldRef("XY"), [30, 20, 0], 6);
  s = run(s, c.command);
  const l = drawChain(scene(s), worldRef("XY"), [[5, 5, 0], [20, 5, 0]], false, { reuse: true });
  s = run(s, l.command);
  const base: AppState = { ...createState(s), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [20, 15, 0] } };
  const pick = (ref: string): AppState => ({ ...base, session: { ...base.session, click: { ...base.session.click, selection: [ref as never] } } });
  const prj = (st: AppState, p: readonly number[]) => proj(st.cam, env.w, env.h).project(p as [number, number, number]);
  // proxy drag from the helper's anchor by (dx, dy) pixels
  const proxy = (st: AppState, dx: number, dy: number): AppState => {
    const h = frameOf(st, { w: env.w, h: env.h }).touchHelper!;
    assert.equal(h.kind, "handle");
    let [x, y] = prj(st, h.points[0]!.at);
    for (let k = 1; k <= 4; k++) { st = reduce(st, { type: "orbit", dx: dx / 4, dy: dy / 4, x: (x += dx / 4), y: (y += dy / 4) }, env); }
    return reduce(st, { type: "dragEnd" }, env);
  };
  const corner = pick(l.corners[0]!);
  const moved = proxy(corner, 40, -40);
  const cAt = (scene(moved.session).parts[l.corners[0]!] as unknown as { at: number[] }).at;
  assert.ok(Math.hypot(cAt[0]! - 5, cAt[1]! - 5) > 1, `the point moved: ${cAt}`);
  const line = pick(l.lines[0]!);
  const whole = proxy(line, 0, -40);
  const [a2, b2] = l.corners.map((r) => (scene(whole.session).parts[r] as unknown as { at: number[] }).at);
  assert.ok(a2![1]! > 5.5 && Math.abs(a2![1]! - b2![1]!) < 1e-6, `both ends went up together: ${a2} ${b2}`);
  const circle = pick(c.circle);
  const bigger = proxy(circle, 40, 0);
  assert.ok((scene(bigger.session).parts[c.circle] as { radius: number }).radius > 7, "the circle is bigger");
});

import { drawChain as chain } from "../src/operation/build.ts";
test("the scissors by touch: a tap over a part that can be cut cuts it; a tap in free space puts the tool away (`in_292`)", () => {
  let s = createSession(kernel);
  s = run(s, chain(scene(s), worldRef("XY"), [[5, 15, 0], [35, 15, 0]], false, { reuse: true }).command);
  s = run(s, chain(scene(s), worldRef("XY"), [[20, 5, 0], [20, 25, 0]], false, { reuse: true }).command);
  let st: AppState = { ...createState(s), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [20, 15, 0] } };
  const px = (p: [number, number, number]) => proj(st.cam, env.w, env.h).project(p);
  st = reduce(st, { type: "begin", name: "trim" }, env);
  const free = px([45, 40, 0]);
  const away = reduce(st, { type: "tapAim", x: free[0], y: free[1] }, env);
  assert.equal(away.tool, null, "free space: the tool is put away");
  const on = px([10, 15, 0]);
  const cut = reduce(st, { type: "tapAim", x: on[0], y: on[1] }, env);
  assert.ok(cut.tool, "the tool stays while it cuts");
  assert.ok(cut.session.history.cursor > st.session.history.cursor, "and something was cut");
});

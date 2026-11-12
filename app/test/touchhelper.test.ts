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
  assert.equal(f.touchHelper, null, "three arrows and none chosen: nothing is offered yet");
  const h = f.gizmo!.handles.find((x) => x.id === "move:x")!;
  const pr = projector(st.cam, env.w, env.h);
  const mid = pr.project([(h.points[0]![0] + h.points[1]![0]) / 2, (h.points[0]![1] + h.points[1]![1]) / 2, (h.points[0]![2] + h.points[1]![2]) / 2]);
  st = reduce(st, { type: "click", x: mid[0], y: mid[1], count: 1, shift: false }, env); // the tap
  f = frameOf(st, { w: env.w, h: env.h });
  assert.equal(f.touchHelper?.kind, "handle", "the arrow is chosen: the helper is offered");
  assert.equal(f.touchHelper?.applies, true, "an operation is open: the check applies it");
  const at = pr.project(f.touchHelper!.at);
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

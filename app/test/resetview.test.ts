// Reset camera (`in_303`): offered when nothing of the model is in view; it goes back to the last thing that was in view, else to the last there is.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { advance } from "../src/interaction/control/viewing.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { appRows, nextPanScale } from "../src/interaction/appmenu.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };
function box(s: Session, x: number): Session {
  const r = drawSquaredRectangle(scene(s), XY, [x, 0, 0], [x + 10, 10, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 10 } } });
}
const frame = (st: AppState) => frameOf(st, env);
const away = (st: AppState): AppState => ({ ...st, cam: { ...st.cam, target: [5000, 5000, 5000] } });

test("no button while a body is in view; once the view is lost, the button; a click takes the view back to the body (`in_303`)", () => {
  const s = box(createSession(kernel), 0);
  let st: AppState = reduce({ ...createState(s), cam: { ...homeCamera(), target: [5, 5, 5], distance: 60 } }, { type: "hover", x: 10, y: 10 }, env);
  assert.equal(frame(st).resetView, false, "in view");
  st = reduce(away(st), { type: "hover", x: 11, y: 11 }, env);
  assert.equal(frame(st).resetView, true, "lost");
  st = reduce(st, { type: "resetView" }, env);
  st = advance(st, 100000);
  assert.equal(frame(st).resetView, false, "found again");
  assert.ok(Math.hypot(st.cam.target[0] - 5, st.cam.target[1] - 5, st.cam.target[2] - 5) < 1, `looking at the body: ${st.cam.target}`);
});

test("it goes to the body that was last in view; when that is gone, the last one there is (`in_303`)", () => {
  let s = box(box(createSession(kernel), 0), 60);
  const [a, b] = Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { id: string }[];
  // looking at the first body: it was the last in view
  let st: AppState = reduce({ ...createState(s), cam: { ...homeCamera(), target: [5, 5, 5], distance: 30 } }, { type: "hover", x: 10, y: 10 }, env);
  assert.equal(st.lastSeen, a!.id);
  st = reduce(away(st), { type: "resetView" }, env);
  st = advance(st, 100000);
  assert.ok(Math.abs(st.cam.target[0] - 5) < 1, `back to the first body: ${st.cam.target}`);
  // that body is gone: the last there is
  const sel = { ...st.session, click: { ...st.session.click, selection: [scene(st.session).parts[Object.keys(scene(st.session).parts).find((k) => (scene(st.session).parts[k] as { id?: string }).id === a!.id)!]!.ref] } };
  void sel; void b;
  const only = box(createSession(kernel), 60);
  const st2: AppState = { ...createState(only), lastSeen: a!.id, cam: { ...homeCamera(), target: [9000, 0, 0] } };
  const out = advance(reduce(st2, { type: "resetView" }, env), 100000);
  assert.ok(Math.abs(out.cam.target[0] - 65) < 1, `the last body there is: ${out.cam.target}`);
});

test("an empty model offers no reset; the pan speed row cycles low, medium, high (`in_303`)", () => {
  assert.equal(frame({ ...createState(createSession(kernel)), cam: { ...homeCamera(), target: [9999, 0, 0] } }).resetView, false);
  assert.match(appRows("auto", "", undefined, false, false, 0.3).find((r) => r.id === "panSpeed")!.label, /medium/);
  assert.equal(nextPanScale(0.5), 0.15);
});

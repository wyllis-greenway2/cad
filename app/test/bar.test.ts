// The helpful bar (`in_1160`): the icons of what is selected stand in one row with the suggested constraints, icons to the left; the icon of a body's constraints is only there once the body has been double clicked.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { projector, homeCamera } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 } as never;
const frame = (st: AppState) => frameOf(st, { w: 800, h: 600 });
function box(): AppState {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  return { ...createState(s), cam: homeCamera() };
}
const bodyOf = (st: AppState) => Object.values(scene(st.session).parts).find((p) => p.kind === "body")!.ref;
const select = (st: AppState, refs: string[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs as never } } });
const ids = (st: AppState) => frame(st).bar?.icons.map((i) => i.id) ?? [];

test("nothing selected, no bar; a body selected has its eye in it, and not the icon of its constraints", () => {
  const st = box();
  assert.equal(frame(st).bar, null);
  const sel = select(st, [bodyOf(st)]);
  assert.deepEqual(ids(sel), [`body:eye:${bodyOf(st)}`]);
});

test("a double click on a body adds the icon of its constraints; it goes when the body is no longer selected, and pressing it shows the constraints of the body", () => {
  let st = box();
  const b = bodyOf(st);
  const pr = projector(st.cam, 800, 600);
  const c: [number, number, number] = [32, 5, 20]; // (on the top face, away from the mover that comes up at its middle)
  const [x, y] = pr.project(c);
  st = reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
  st = reduce(st, { type: "click", x, y, count: 2, shift: false }, env);
  assert.equal(st.consFor, b, "double clicked");
  assert.ok(ids(st).includes(`body:constraints:${b}`), ids(st).join());
  st = reduce(st, { type: "runAction", id: `body:constraints:${b}` }, env);
  assert.deepEqual(st.bodyConstraints, [b]);
  assert.equal(frame(st).bar!.icons.find((i) => i.id === `body:constraints:${b}`)!.on, true, "lit while on");
  st = select(st, []);
  st = reduce(st, { type: "escape" }, env);
  assert.equal(st.consFor, null, "not selected any more: the icon goes");
});

test("a plane that is selected has its four icons in the bar, and not the ones of a body", () => {
  let st = reduce(box(), { type: "runAction", id: "view:section" }, env);
  const ref = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && !!p.section)!.ref;
  assert.deepEqual(ids(st), [`sheet:mode:${ref}`, `sheet:visible:${ref}`, "sheet:move", `sheet:delete:${ref}`]);
  st = reduce(st, { type: "runAction", id: "sheet:move" }, env);
  assert.equal(frame(st).bar!.icons[2]!.icon, "rotate");
});

// Every operation of the menu can be chosen whatever is selected; it waits for what it needs to be clicked (`in_464`).
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { drawRectangle, drawChain } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { nextId } from "../src/operation/scene.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera, projector } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const [XY, XZ] = [worldRef("XY"), worldRef("XZ")];
const px = (st: AppState, p: readonly [number, number, number]) => projector(st.cam, 800, 600).project([...p] as never);
const click = (st: AppState, x: number, y: number, shift = false) => reduce(st, { type: "click", x, y, count: 1, shift }, env);

function drawn() {
  let s = createSession(kernel);
  const sq = drawRectangle(scene(s), XY, [-2, -2, 0], [2, 2, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, sq.command);
  const p = drawChain(scene(s), XZ, [[0, 0, 0], [0, 0, 20]]);
  s = run(s, p.command);
  return { s, face: loopFaceRef(sq.lines), path: p };
}

test("the ring offers the sweep with nothing selected; choosing it waits, the shape and the path are clicked, Enter starts it and it is made", () => {
  const { s, path } = drawn();
  let st = { ...createState(s), cam: homeCamera() };
  const ring = reduce(st, { type: "menu", x: 400, y: 300 }, env).menu!.items.flatMap((c) => c.children ?? [c]);
  assert.ok(ring.find((i) => i.id === "op:sweep")!.enabled, "offered, not dimmed");
  st = reduce(st, { type: "runAction", id: "op:sweep" }, env);
  assert.equal(st.picking?.kind, "sweep");
  assert.equal(st.op, null);
  assert.match(st.session.message ?? "", /click/);
  assert.equal(frameOf(st, { w: 800, h: 600 }).confirm?.kind, "sweep", "the check and the cross are there");
  // the path's line, then the shape's face: each click is added
  const [lx, ly] = px(st, [0, 0, 12]);
  st = click(st, lx, ly);
  assert.ok(st.picking, "still waiting: a sweep needs the shape too");
  const [fx, fy] = px(st, [1.2, 1.2, 0]);
  st = click(st, fx, fy);
  assert.equal(st.picking?.kind, "sweep", "a sweep waits for Enter: more of the path may be clicked");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.picking, null);
  assert.equal(st.op?.kind, "sweep", "now it is open");
  void path;
});

test("an operation that needs one thing starts at once when it is clicked; Esc leaves the waiting; a click on nothing with nothing to start leaves it too", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  let st = { ...createState(s), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: "op:hollow" }, env); // nothing selected
  assert.equal(st.picking?.kind, "hollow");
  const esc = reduce(st, { type: "escape" }, env);
  assert.equal(esc.picking, null);
  const [bx, by] = px(st, [20, 10, 20]);
  const picked = click(st, bx, by); // the top face
  assert.equal(picked.picking, null, "it needed one thing: it began");
  assert.equal(picked.op?.kind, "hollow");
  const empty = click(st, 3, 3); // nothing there, nothing selected
  assert.equal(empty.picking, null, "let go");
  assert.equal(empty.op, null);
});

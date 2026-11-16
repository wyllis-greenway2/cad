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

test("while a sweep waits only a closed sketch and a line of an open path are lit and picked; a face of the body is not, and a click on it leaves it waiting with the reason", () => {
  let s = createSession(kernel);
  const sq = drawRectangle(scene(s), XY, [-2, -2, 0], [2, 2, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, sq.command);
  const p = drawChain(scene(s), XZ, [[0, 0, 0], [0, 0, 20]]);
  s = run(s, p.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: sq.lines, params: { depth: 4 } } }); // (the square is used: a body 4 x 4 x 4)
  let st = { ...createState(s), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: "op:sweep" }, env);
  const [bx, by] = px(st, [1.5, 1.5, 4]); // the top of the block, off the path
  const hovered = reduce(st, { type: "hover", x: bx, y: by }, env);
  assert.equal(hovered.session.hover, undefined, "a face of the body is not lit for a sweep");
  const clicked = click(st, bx, by);
  assert.equal(clicked.picking?.kind, "sweep", "still waiting");
  assert.match(clicked.session.message ?? "", /cannot be used/);
  assert.equal(selectionOfState(clicked), 0, "nothing was taken");
  const [lx, ly] = px(st, [0, 0, 12]);
  const line = reduce(st, { type: "hover", x: lx, y: ly }, env);
  assert.ok(line.session.hover, "the line of the path is lit");
});

const selectionOfState = (st: AppState): number => st.session.click.selection.length;

test("a sweep chosen first, then its shape and path clicked, shows what it would make as a wireframe before Enter or the check (`in_484`)", () => {
  const { s } = drawn();
  let st = { ...createState(s), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: "op:sweep" }, env);
  const bodies = (f: ReturnType<typeof frameOf>) => Object.values(f.scene.parts).filter((p) => p.kind === "body").length;
  assert.equal(bodies(frameOf(st, { w: 800, h: 600 })), 0, "nothing to show yet");
  const [lx, ly] = px(st, [0, 0, 12]);
  st = click(st, lx, ly);
  assert.equal(bodies(frameOf(st, { w: 800, h: 600 })), 0, "the path alone makes nothing");
  const [fx, fy] = px(st, [1.2, 1.2, 0]);
  st = click(st, fx, fy);
  assert.equal(st.picking?.kind, "sweep");
  assert.equal(st.op, null, "still waiting");
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(bodies(f), 1, "the body it would make is shown");
  assert.equal(f.wireframe, true, "as a wireframe");
  assert.equal(scene(st.session).steps.length, 0, "and nothing is made");
  // chosen after both are selected: the same, once it is open
  const open = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  const g = frameOf(open, { w: 800, h: 600 });
  assert.equal(open.op?.kind, "sweep");
  assert.equal(g.wireframe, true);
  assert.equal(bodies(g), 1);
});

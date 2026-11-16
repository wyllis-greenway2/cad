// The small things of `in_463`: a sketch click that wanders, an operation applied by a click in empty space, the world put away with its orb.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { createRecognizer } from "../src/interaction/recognizer.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { drawRectangle, drawChain } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { RawInput, Intent } from "../src/shared/input.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const mods = { shift: false, ctrl: false, alt: false };
const ptr = (kind: "down" | "move" | "up", x: number, y: number, t: number): RawInput => ({ kind, device: "mouse", id: 1, x, y, button: 0, mods, t } as unknown as RawInput);
const feed = (rec: ReturnType<typeof createRecognizer>, xs: RawInput[]): Intent[] => xs.flatMap((e) => rec.feed(e));

test("with a sketch tool in hand a click that wanders 25 px is still a click; in a straight view up to the drag that leaves it (60 px); without a tool it turns the view", () => {
  const rec = createRecognizer();
  rec.setDrawing(true, false);
  assert.ok(feed(rec, [ptr("down", 100, 100, 0), ptr("move", 125, 100, 20), ptr("up", 125, 100, 40)]).some((i) => i.type === "click"), "a click");
  rec.setDrawing(true, true);
  assert.ok(feed(rec, [ptr("down", 100, 100, 100), ptr("move", 150, 100, 120), ptr("up", 150, 100, 140)]).some((i) => i.type === "click"), "a click in a straight view");
  assert.ok(feed(rec, [ptr("down", 100, 100, 200), ptr("move", 190, 100, 220), ptr("up", 190, 100, 240)]).some((i) => i.type === "orbit"), "a bigger drag turns the view");
  rec.setDrawing(false, false);
  assert.ok(feed(rec, [ptr("down", 100, 100, 300), ptr("move", 125, 100, 320), ptr("up", 125, 100, 340)]).some((i) => i.type === "orbit"), "no tool: it turns the view");
});

test("an open sweep is applied by a click in empty space, not dropped", () => {
  let s = createSession(kernel);
  const sq = drawRectangle(scene(s), worldRef("XY"), [-2, -2, 0], [2, 2, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, sq.command);
  const p = drawChain(scene(s), worldRef("XZ"), [[0, 0, 0], [0, 0, 20]]);
  s = run(s, p.command);
  let st = { ...createState({ ...s, click: { ...s.click, selection: [loopFaceRef(sq.lines), ...p.lines] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "sweep" }, env);
  assert.equal(st.op?.kind, "sweep");
  st = reduce(st, { type: "click", x: 5, y: 5, count: 1, shift: false }, env); // empty space
  assert.equal(scene(st.session).steps.at(-1)?.type, "sweep", "the sweep was made");
  assert.equal(st.op, null);
});

test("the orb puts the axes and the panes away and brings them back", () => {
  let st = { ...createState(createSession(kernel)), cam: homeCamera() };
  assert.equal(frameOf(st, { w: 800, h: 600 }).panes.length, 3);
  st = reduce(st, { type: "runAction", id: "world:toggle" }, env);
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(f.worldHidden, true);
  assert.equal(f.panes.length, 0, "no panes");
  st = reduce(st, { type: "runAction", id: "world:toggle" }, env);
  assert.equal(frameOf(st, { w: 800, h: 600 }).panes.length, 3);
});

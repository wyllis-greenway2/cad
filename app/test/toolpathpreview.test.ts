// The toolpath preview (`in_570`): a toolpath is flattened into world lines, a position along it says what is done and where the head is, the scrubber and Esc work, and the laser route says where its toolpath is in the world.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { viewOf } from "../src/interaction/toolpathview.ts";
import { runLaser, laserDefaults } from "../src/interaction/manufacture.ts";
import type { Toolpath } from "../src/manufacturing/index.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const line: Toolpath = { units: "mm", operations: [{ id: "a", label: "Cut", layer: "cut", moves: [{ op: "travel", to: [0, 0, 0] }, { op: "cut", to: [10, 0, 0] }, { op: "travel", to: [10, 10, 0] }, { op: "cut", to: [0, 10, 0], feed: 100 }] }] };
const flat = (o: Record<string, number[]>) => Object.entries(o).map(([k, v]) => [k, v.length / 6]);

test("every move of a toolpath is a segment, drawn by the layer it was cut on, travel apart; the first travel only places the head", () => {
  const v = viewOf(line, 1);
  assert.deepEqual(flat(v.done).sort(), [["cut", 2], ["travel", 1]]);
  assert.deepEqual(flat(v.rest), []);
  assert.deepEqual(v.head, [0, 10, 0]);
});

test("the position splits the path by length: what is done, the segment the head is on cut in two, and what is still to come", () => {
  const half = viewOf(line, 0.5); // the whole is 10 + 10 + 10 = 30: halfway is 15, five into the travel
  assert.deepEqual(flat(half.done).sort(), [["cut", 1], ["travel", 1]]);
  assert.deepEqual(flat(half.rest).sort(), [["cut", 1], ["travel", 1]]);
  assert.deepEqual(half.head!.map((x) => +x.toFixed(9)), [10, 5, 0]);
  const start = viewOf(line, 0);
  assert.deepEqual(flat(start.done), []);
  assert.deepEqual(start.head, [0, 0, 0]);
  assert.deepEqual(viewOf(line, -3), start, "below 0 is 0");
  assert.deepEqual(viewOf(line, 7).head, [0, 10, 0], "above 1 is 1");
  assert.deepEqual(viewOf({ units: "mm", operations: [] }, 0.5), { done: {}, rest: {}, head: null, stock: [] });
});

test("an arc is drawn in steps along its curve, the right way round; a whole circle comes back to its start", () => {
  const arc = (clockwise: boolean): Toolpath => ({ units: "mm", operations: [{ id: "a", label: "A", layer: "cut", moves: [{ op: "travel", to: [10, 0, 0] }, { op: "arc", to: [0, 10, 0], center: [0, 0, 0], clockwise }] }] });
  const quarter = viewOf(arc(false), 1).done.cut!;
  assert.equal(quarter.length / 6, 18, "ninety degrees in steps of five");
  for (let i = 0; i < quarter.length; i += 3) assert.ok(Math.abs(Math.hypot(quarter[i]!, quarter[i + 1]!) - 10) < 1e-9, "every point on the circle");
  const threeQuarter = viewOf(arc(true), 1).done.cut!;
  assert.equal(threeQuarter.length / 6, 54, "clockwise from the east to the north is the long way: two hundred and seventy degrees");
  const whole: Toolpath = { units: "mm", operations: [{ id: "a", label: "A", layer: "cut", moves: [{ op: "travel", to: [10, 0, 0] }, { op: "arc", to: [10, 0, 0], center: [0, 0, 0], clockwise: false }] }] };
  assert.equal(viewOf(whole, 1).done.cut!.length / 6, 72);
});

test("the toolpath's frame lays it in the world: its zero, its x and its normal", () => {
  const framed: Toolpath = { ...line, frame: { origin: [100, 0, 50], xDir: [0, 1, 0], normal: [0, 0, 1] } };
  const v = viewOf(framed, 1);
  assert.deepEqual(v.head!.map((x) => +x.toFixed(9)), [100 - 10, 0, 50], "its y (the normal crossed with x) points along minus x of the world");
  assert.deepEqual(viewOf(framed, 0).head, [100, 0, 50]);
});

test("the laser route says where its toolpath is: the drawing moved to the corner, laid back over the drawing in the world", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), worldRef("XY"), [100, 50, 0], [140, 70, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const out = runLaser(s, { ...laserDefaults(), kerf: 0 });
  assert.ok(out.ok);
  if (!out.ok) return;
  const tp = out.value.run.toolpath!;
  assert.deepEqual(tp.frame!.origin, [100, 50, 0], "the machine's zero is the drawing's lower left corner");
  const v = viewOf(tp, 1);
  const xs = Object.values(v.done).flatMap((a) => a.filter((_, i) => i % 3 === 0)), ys = Object.values(v.done).flatMap((a) => a.filter((_, i) => i % 3 === 1));
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [100, 140, 50, 70], "drawn where the drawing is");
});

test("the scrubber moves the head and is held between 0 and 1; the cross and Esc end the preview; the frame has the lines and the bar only while it is open", () => {
  let s = createSession(kernel);
  s = run(s, drawRectangle(scene(s), worldRef("XY"), [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]).command);
  s = run(s, drawCircle(scene(s), worldRef("XY"), [10, 10, 0], 4).command);
  const out = runLaser(s, laserDefaults());
  assert.ok(out.ok);
  if (!out.ok) return;
  let st = { ...createState(s), cam: homeCamera() };
  assert.equal(frameOf(st, { w: 800, h: 600 }).toolpath, null);
  assert.equal(frameOf(st, { w: 800, h: 600 }).previewBar, null);
  st = { ...st, preview: { toolpath: out.value.run.toolpath!, at: 1 } };
  assert.match(frameOf(st, { w: 800, h: 600 }).previewBar!.label, /^100% of ~\d+ s$/);
  st = reduce(st, { type: "previewAt", at: 0.25 }, env);
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(f.previewBar!.at, 0.25);
  assert.ok(Object.keys(f.toolpath!.rest).length > 0 && f.toolpath!.head, "some is done, some to come");
  assert.equal(frameOf(st, { w: 800, h: 600 }).toolpath, f.toolpath, "the same lines are not made again for the same position");
  assert.equal(reduce(st, { type: "previewAt", at: 9 }, env).preview!.at, 1);
  assert.equal(reduce(st, { type: "previewAt", at: NaN }, env).preview!.at, 0);
  assert.equal(reduce(st, { type: "escape" }, env).preview, null, "Esc ends it");
  assert.equal(reduce(st, { type: "previewClose" }, env).preview, null, "and so does the cross");
  assert.equal(reduce(createState(s), { type: "previewAt", at: 0.5 }, env).preview, null, "with none open, nothing is made up");
});

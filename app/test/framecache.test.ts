// What a picture needs of a scene that does not change with the pointer is worked out once for the scene, not for every move of the pointer (`in_725`): a gear's outline is 400 arcs, 64 points each.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { createState } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { centreDots } from "../src/interaction/centredots.ts";

await kernel.init();
const gear = (teeth: number) => run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { teeth, module: 1 } });

test("the places a bubble should keep off are worked out once for a scene, and again for another", () => {
  const st = createState(gear(60));
  const a = frameOf(st, { w: 1000, h: 650 });
  const b = frameOf({ ...st, hoverPoint: [1, 2, 0] }, { w: 1000, h: 650 });
  assert.equal(b.avoid, a.avoid, "the very same answer for the same scene");
  assert.ok(a.avoid.segs.length > 1000 && a.avoid.pts.length >= 60, `${a.avoid.segs.length} pieces, ${a.avoid.pts.length} corners`);
  const other = frameOf(createState(gear(20)), { w: 1000, h: 650 });
  assert.notEqual(other.avoid, a.avoid);
  assert.ok(other.avoid.segs.length < a.avoid.segs.length);
});

test("the middle dots of a scene are worked out once", () => {
  const sc = scene(gear(30));
  assert.equal(centreDots(sc), centreDots(sc));
});

test("a frame of a gear of 60 teeth takes a few milliseconds, not ten", () => {
  const st = createState(gear(60));
  frameOf(st, { w: 1000, h: 650 });
  const t = performance.now();
  for (let i = 0; i < 40; i++) frameOf({ ...st, hoverPoint: [i, 1, 0] }, { w: 1000, h: 650 });
  const each = (performance.now() - t) / 40;
  assert.ok(each < 6, `${each.toFixed(1)} ms a frame`);
});

// What an extrusion used up is worked out once per scene, not once per ask (`in_246`: on a sketch of a few dozen curves it was most of the time of every frame).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import { consumed } from "../src/operation/ownership.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { createState } from "../src/interaction/controller.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/laggy.cad.json", import.meta.url), "utf8")) as unknown as { value: import("../src/interaction/session.ts").Session }).value;

test("asking again for the same scene gives the same answer without working it out again; a changed scene has its own", () => {
  const s = open();
  const sc = scene(s);
  assert.ok(consumed(sc).size > 0, "the extrusion used parts up");
  assert.equal(consumed(sc), consumed(sc), "the very same set");
  const other = { ...sc, counter: sc.counter + 1 };
  assert.notEqual(consumed(other), consumed(sc));
  assert.deepEqual([...consumed(other)].sort(), [...consumed(sc)].sort());
});

test("a picture of the sketch of a body with a lot of curves is quick to work out", () => {
  const st = createState(open());
  frameOf(st, { w: 1280, h: 687 });
  const t = performance.now();
  for (let i = 0; i < 20; i++) frameOf(st, { w: 1280, h: 687 });
  const each = (performance.now() - t) / 20;
  assert.ok(each < 40, `${each.toFixed(1)} ms a picture`);
});

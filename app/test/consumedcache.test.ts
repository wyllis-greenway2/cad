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

test("with a push / pull arrow still open (its step made), a picture does not take the step back and solve the sketch again each time (`in_247`)", async () => {
  const { startOp, opCommand } = await import("../src/interaction/operations.ts");
  const { run } = await import("../src/interaction/session.ts");
  const s0 = open();
  const face = Object.values(scene(s0).parts).find((p) => p.kind === "plane" && p.origin === "body" && Math.abs(p.at[2] - 3) < 1e-6)!;
  const r = startOp(scene(s0), [face.ref], "pushpull");
  if (!r.ok) throw new Error(r.why);
  const op = { ...r.op, value: 5, made: true };
  const s1 = run(s0, opCommand(scene(s0), op)!);
  const st = { ...createState({ ...s1, lagging: true }), op }; // (as in the browser, where the kernel answers later)
  frameOf(st, { w: 1280, h: 687 }); // (the first one works the preview out)
  const t = performance.now();
  for (let i = 0; i < 20; i++) frameOf({ ...st, cam: { ...st.cam, azimuth: st.cam.azimuth + i * 0.01 } }, { w: 1280, h: 687 });
  const each = (performance.now() - t) / 20;
  assert.ok(each < 40, `${each.toFixed(1)} ms a picture with the operation open`);
});

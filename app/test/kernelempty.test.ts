// A cut that takes all of the body away is an answer the kernel can give, not a failure of it (`in_254`): the step is refused with a reason. (The kernel used to throw from asking an empty shape for its box.)
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawSquaredRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";

await kernel.init();
const XY = worldRef("XY");

test("extruding a circle that covers the whole body, into the body, does not crash the kernel: it is made or refused with a reason, and the model stays sound", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [30, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 10 } } });
  const c = drawCircle(scene(s), XY, [-9.21, 2.52, 0], 61.29);
  s = run(s, c.command);
  const before = scene(s).steps.length;
  // (the circle is on the plane the box stands on and is bigger than it: extruded the other way it takes the whole box)
  const after = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: -12 } } });
  assert.ok(after.history.cursor >= s.history.cursor);
  const added = scene(after).steps.length > before;
  if (!added) assert.ok(after.message, "refused with a reason");
  assert.equal(Object.keys(after.outcome.errors).length, 0, "nothing is left broken");
});

test("the kernel answers for a graph whose body is empty with an error on the step that emptied it, instead of throwing", () => {
  const graph = {
    params: {},
    ops: [
      { id: "s_a", type: "sketch", shape: "polygon", points: [[0, 0], [30, 0], [30, 20], [0, 20]], plane: "XY", origin: 0, frame: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, 0, 1] } },
      { id: "x_a", type: "extrude", profile: "s_a", distance: 10, mode: "add" },
      { id: "s_b", type: "sketch", shape: "circle", radius: 61.290646, at: [-9.21, 2.52], plane: "XY", origin: 0, frame: { origin: [-4.845753077, -5.972811595, 0], xDir: [0.675590208, -0.737277337, 0], normal: [0, 0, 1] } },
      { id: "x_b", type: "extrude", profile: "s_b", distance: 12, target: "x_a", mode: "cutOrAdd" },
    ],
  };
  const r = kernel.evaluate(graph as never);
  assert.equal(r.finalId, null, "no body to show");
  assert.match(r.ops.find((o) => o.id === "x_b")!.error ?? "", /nothing would be left/);
});

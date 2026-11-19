// A body keeps its name when a push or pull makes it smaller, so a mate on it is not lost (`in_982`: a lid pushed in lost its mate and could be pulled off).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";

await kernel.init();
const XY = worldRef("XY");
const names = (s: ReturnType<typeof createSession>): string[] => Object.values(scene(s).parts).filter((p) => p.kind === "body").map((p) => p.ref).sort();

test("a body pushed in to a much thinner one keeps its name, and so do the bodies beside it", () => {
  let s = createSession(kernel);
  const a = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [100, 60, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: a.lines, params: { depth: 8 } } });
  const b = drawSquaredRectangle(scene(s), XY, [200, 0, 0], [220, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: b.lines, params: { depth: 30 } } });
  const before = names(s);
  assert.equal(before.length, 2);
  const top = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.endsWith("0,0,1,30"))!;
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "pushPull", parts: [top.ref], params: { depth: -26 } } });
  assert.deepEqual(names(s), before, "the same two bodies, under the same names");
});

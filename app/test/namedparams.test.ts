// Named parameters in a model (`dec_named_parameters`, `in_557`): a step's number tied to a formula follows the parameter, undo, save and load.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run, undoLast as undo } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { toJSON, fromJSON } from "../src/operation/scene.ts";

await kernel.init();
const XY = worldRef("XY");
function block() {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  return run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
}
const depth = (s: ReturnType<typeof block>) => scene(s).steps[0]!.params.depth;

test("a parameter is made, a step's depth is tied to a formula of it, and it follows when the parameter changes", () => {
  let s = block();
  s = run(s, { type: "setParameter", name: "wall", expr: "4" });
  s = run(s, { type: "linkParam", id: "s_100", key: "depth", expr: "wall * 2 + 1" });
  assert.equal(depth(s), 9);
  assert.deepEqual(scene(s).steps[0]!.links, { depth: "wall * 2 + 1" });
  s = run(s, { type: "setParameter", name: "wall", expr: "6" });
  assert.equal(depth(s), 13);
  s = undo(s);
  assert.equal(depth(s), 9, "one undo takes the change of the parameter back, and the step with it");
});

test("a number typed over a tied one lets it go; a refusal says why", () => {
  let s = block();
  s = run(s, { type: "setParameter", name: "w", expr: "5" });
  s = run(s, { type: "linkParam", id: "s_100", key: "depth", expr: "w" });
  s = run(s, { type: "setStepParams", id: "s_100", params: { depth: 7 } });
  assert.equal(scene(s).steps[0]!.links, undefined);
  s = run(s, { type: "setParameter", name: "w", expr: "8" });
  assert.equal(depth(s), 7, "no longer follows");
  const bad = run(s, { type: "setParameter", name: "w", expr: "w + 1" });
  assert.ok(bad.message && /circle/.test(bad.message), bad.message ?? "");
  assert.equal(scene(bad).parameters!.w, "8", "the refused change did not happen");
  const name = run(s, { type: "setParameter", name: "2w", expr: "1" });
  assert.ok(name.message && /cannot be a parameter/.test(name.message));
});

test("a parameter in use is not taken away; one that is not is", () => {
  let s = block();
  s = run(s, { type: "setParameter", name: "a", expr: "3" });
  s = run(s, { type: "setParameter", name: "b", expr: "a * 2" });
  s = run(s, { type: "linkParam", id: "s_100", key: "depth", expr: "b" });
  assert.match(run(s, { type: "removeParameter", name: "a" }).message ?? "", /b uses a/);
  assert.match(run(s, { type: "removeParameter", name: "b" }).message ?? "", /step s_100 uses b/);
  s = run(s, { type: "linkParam", id: "s_100", key: "depth", expr: null });
  s = run(s, { type: "removeParameter", name: "b" });
  s = run(s, { type: "removeParameter", name: "a" });
  assert.equal(scene(s).parameters, undefined);
});

test("parameters and ties are saved with the file and come back", () => {
  let s = block();
  s = run(s, { type: "setParameter", name: "wall", expr: "4" });
  s = run(s, { type: "linkParam", id: "s_100", key: "depth", expr: "wall + 1" });
  const back = fromJSON(JSON.parse(JSON.stringify(toJSON(scene(s)))));
  assert.deepEqual(back.parameters, { wall: "4" });
  assert.deepEqual(back.steps[0]!.links, { depth: "wall + 1" });
  assert.equal(back.steps[0]!.params.depth, 5);
});

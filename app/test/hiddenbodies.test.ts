// Hidden bodies (`dec_hidden_bodies`, `in_489`, `in_497`): the command, the saved file, what the pointer can reach.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run, openSession, saveText } from "../src/interaction/session.ts";
import { undoLast } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { candidatesAt } from "../src/interaction/picking.ts";
import { projector, homeCamera } from "../src/interaction/camera.ts";

await kernel.init();
const XY = worldRef("XY");
function two() {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const b = drawRectangle(scene(s), XY, [30, 0, 0], [40, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: b.lines, params: { depth: 10, mode: "new" } } } as never);
  return s;
}
const A = "b/x_s_100/o", B = "b/x_s_101/o";

test("hiding a body is a command that is kept, undone and saved with the file", () => {
  let s = two();
  assert.equal(scene(s).hiddenBodies, undefined);
  s = run(s, { type: "hideBodies", refs: [B], hidden: true } as never);
  assert.deepEqual(scene(s).hiddenBodies, [B]);
  assert.equal(scene(s).steps.length, 2, "no step is made");
  const again = openSession(kernel, saveText(s));
  assert.ok(again.ok);
  assert.deepEqual(again.ok && scene(again.value).hiddenBodies, [B], "it is in the file");
  s = run(s, { type: "hideBodies", refs: [A, B], hidden: true } as never);
  assert.deepEqual(scene(s).hiddenBodies, [A, B]);
  s = run(s, { type: "hideBodies", refs: [A], hidden: false } as never);
  assert.deepEqual(scene(s).hiddenBodies, [B]);
  s = run(s, { type: "hideBodies", refs: [B], hidden: false } as never);
  assert.equal(scene(s).hiddenBodies, undefined, "none hidden: no list");
  s = undoLast(s);
  assert.deepEqual(scene(s).hiddenBodies, [B], "undone");
});

test("a hidden body, and its faces, edges and corners, cannot be pointed at, and hides nothing behind it", () => {
  let s = two();
  const cam = { ...homeCamera(), target: [20, 5, 5] as [number, number, number], distance: 90 };
  const pr = projector(cam, 800, 600);
  const [x, y] = pr.project([40, 10, 10]); // a corner of the second body
  const [cx, cy] = pr.project([5, 5, 10]); // the middle of the top of the first
  const before = candidatesAt(scene(s), pr.view(x, y), { pointTol: 14, lineTol: 8 });
  assert.ok(before.some((c) => (scene(s).parts[c.ref] as { of?: string }).of === B), "the corner of the second body is under the pointer");
  s = run(s, { type: "hideBodies", refs: [B], hidden: true } as never);
  const after = candidatesAt(scene(s), pr.view(x, y), { pointTol: 14, lineTol: 8 });
  assert.ok(after.every((c) => (scene(s).parts[c.ref] as { of?: string }).of !== B && c.ref !== B), `nothing of the hidden body: ${after.map((c) => c.ref).join(" ")}`);
  const first = candidatesAt(scene(s), pr.view(cx, cy), { pointTol: 14, lineTol: 8 });
  assert.ok(first.some((c) => (scene(s).parts[c.ref] as { of?: string }).of === A), "the first body can still be pointed at");
});

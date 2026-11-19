// One rule for the number bubbles of an orb (`in_1127`, `dec_unified_orb`): only the axis chosen shows its number, whatever the tool; nothing chosen, nothing shown.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { gizmoOf } from "../src/interaction/control/handles.ts";
import { moveEntries } from "../src/interaction/entry.ts";
import { BODY_OBJECT } from "../src/compiler/body.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const box = (): AppState => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), worldRef("XY"), [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  return { ...createState(s), cam: homeCamera() };
};

test("a body dragged free shows the number of each axis chosen and no other", () => {
  let st = box();
  st = reduce({ ...st, session: { ...st.session, click: { ...st.session.click, selection: [BODY_OBJECT] } } }, { type: "begin", name: "move" }, env);
  const g = gizmoOf(st)!;
  const op = { ...st.op!, free: [5, 3, 2] as [number, number, number] };
  assert.equal(moveEntries(op, g, [5, 3, 2], []).length, 0, "nothing chosen: nothing shown");
  assert.deepEqual(moveEntries(op, g, [5, 3, 2], [1]).map((e) => e.fields[0]!.short), ["Y"]);
  assert.deepEqual(moveEntries(op, g, [5, 3, 2], [0, 2]).map((e) => e.fields[0]!.short), ["X", "Z"]);
});

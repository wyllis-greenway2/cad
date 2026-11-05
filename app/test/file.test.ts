import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, openSession, saveText, run, undoLast, redoLast, scene } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { actionsFor } from "../src/interaction/actions.ts";

await kernel.init();
const XY = worldRef("XY");

function project() {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, actionsFor(scene(s), [r.corners[0]!, r.corners[1]!]).find((a) => a.id === "distance")!.run(40));
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 15 } } });
  return { s, r };
}

test("a project saves as plain JSON without body parts or faces, and opens as the same model with the same undo history", () => {
  const { s } = project();
  const text = saveText(s);
  const j = JSON.parse(text);
  assert.equal(j.format, "cad-project");
  assert.ok(!text.includes("b/body"), "body parts are rebuilt, not saved");
  assert.ok(!text.includes("d/loop@"), "derived faces are rebuilt, not saved");
  const r = openSession(kernel, text);
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return;
  const o = r.value;
  assert.deepEqual(Object.keys(scene(o).parts).sort(), Object.keys(scene(s).parts).sort());
  assert.deepEqual(scene(o).relations, scene(s).relations);
  assert.ok(Math.abs(o.outcome.kernel!.volume! - 40 * 20 * 15) < 0.1);
  assert.equal(o.history.cursor, s.history.cursor);
  const back = undoLast(o);
  assert.equal(back.outcome.kernel, null, "undo works after opening");
  assert.ok(redoLast(back).outcome.kernel);
});

test("the cursor is saved: a project saved after an undo opens at the same point and can still redo", () => {
  const { s } = project();
  const undone = undoLast(s);
  const r = openSession(kernel, saveText(undone));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.outcome.kernel, null);
  assert.ok(redoLast(r.value).outcome.kernel);
});

test("a file that is not ours, damaged, or from a newer version is refused with the reason", () => {
  const bad = (text: string) => { const r = openSession(kernel, text); assert.equal(r.ok, false); return r.ok ? "" : r.error; };
  assert.match(bad("not json"), /not valid JSON/);
  assert.match(bad("{}"), /not a project file/);
  assert.match(bad(JSON.stringify({ format: "cad-project", version: 99 })), /newer version/);
  assert.match(bad(JSON.stringify({ format: "cad-project", version: 1 })), /damaged/);
  const { s } = project();
  const j = JSON.parse(saveText(s));
  j.commands.push({ type: "deletePart", ref: "d/e_099.p0" });
  j.cursor = j.commands.length;
  assert.match(bad(JSON.stringify(j)), /does not replay/);
});

// A material tag on bodies (`in_565`, `dec_manufacturing_definitions`): what a body is made of, as plain text for now. Set from the ⋯ menu's Material… row (a dialog asks the name), kept in the scene, shown in the Bodies list,
// saved with the project, one step to undo; the libraries will check the name once they exist.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene, saveText, openSession, undoLast } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { selectedBodies, materialOf, whyNoMaterial, materialStart, materialDialog, materialCommand } from "../src/interaction/material.ts";
import { panelOf } from "../src/interaction/panels.ts";
import { appRows } from "../src/interaction/appmenu.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { MATERIAL_MAX } from "../src/operation/commands.ts";

await kernel.init();
const XY = worldRef("XY");
const select = (s: Session, refs: string[]): Session => ({ ...s, click: { ...s.click, selection: refs as never } });

/** two blocks far apart: two bodies */
function twoBodies(): Session {
  let s = createSession(kernel);
  for (const [x0, x1] of [[0, 10], [50, 60]] as const) {
    const r = drawRectangle(scene(s), XY, [x0, 0, 0], [x1, 10, 0], [1, 0, 0], [0, 1, 0]);
    s = run(s, r.command);
    s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 5 } } });
  }
  return s;
}
const bodyRefs = (s: Session): string[] => Object.values(scene(s).parts).filter((p) => p.kind === "body").map((p) => p.ref);

test("a body is tagged from the dialog's answer: every selected body, one step to undo; empty takes it off", () => {
  let s = twoBodies();
  const [a, b] = bodyRefs(s);
  assert.equal(bodyRefs(s).length, 2);
  s = select(s, [a!]);
  assert.equal(whyNoMaterial(s), null);
  const c = materialCommand(s, "  PLA  ");
  assert.ok(c.ok);
  if (!c.ok) return;
  const tagged = run(s, c.value);
  const [ida, idb] = [selectedBodies(s)[0]!.id, selectedBodies(select(s, [b!]))[0]!.id];
  assert.equal(materialOf(scene(tagged), ida), "PLA", "trimmed");
  assert.equal(materialOf(scene(tagged), idb), undefined, "the other body is not tagged");
  const undone = undoLast(tagged);
  assert.equal(materialOf(scene(undone), ida), undefined, "one undo takes the tag off");
  const cleared = materialCommand(tagged, "");
  assert.ok(cleared.ok);
  if (cleared.ok) assert.equal(scene(run(tagged, cleared.value)).materials, undefined, "an empty answer takes it off, and nothing is left of it");
});

test("both selected bodies get the tag; the dialog starts with what they share, and says when they differ", () => {
  let s = twoBodies();
  const [a, b] = bodyRefs(s) as [string, string];
  s = select(s, [a, b]);
  assert.deepEqual(materialStart(s), { material: "" });
  const c = materialCommand(s, "birch plywood 3 mm");
  assert.ok(c.ok);
  if (!c.ok) return;
  s = run(s, c.value);
  assert.deepEqual(materialStart(s), { material: "birch plywood 3 mm" }, "they share it");
  const one = run(select(s, [a]), (materialCommand(select(s, [a]), "PLA") as { ok: true; value: never }).value);
  const both = select(one, [a, b]);
  assert.deepEqual(materialStart(both), { material: "" }, "they differ: no starting name");
  const d = materialDialog(both, { material: "" });
  assert.equal(d.title, "Material of 2 bodies");
  assert.match(d.fields[0]!.note!, /different materials/);
  assert.equal(materialDialog(select(s, [a]), { material: "x" }).title, "Material of the body");
});

test("the Bodies list shows the material after the name", () => {
  let s = twoBodies();
  const [a] = bodyRefs(s) as [string];
  s = select(s, [a]);
  s = run(s, (materialCommand(s, "PLA") as { ok: true; value: never }).value);
  const rows = panelOf("bodies", scene(s), [])!.rows.map((r) => r.label);
  assert.deepEqual(rows, ["Body 1 · PLA", "Body 2"]);
});

test("the tag is saved with the project and comes back", () => {
  let s = twoBodies();
  const [a] = bodyRefs(s) as [string];
  const id = selectedBodies(select(s, [a]))[0]!.id;
  s = select(s, [a]);
  s = run(s, (materialCommand(s, "PETG") as { ok: true; value: never }).value);
  const back = openSession(kernel, saveText(s));
  assert.ok(back.ok);
  if (back.ok) assert.equal(materialOf(scene(back.value), id), "PETG");
});

test("a name that is too long or has control characters is refused; nothing selected says what to do", () => {
  const s = select(twoBodies(), []);
  assert.equal(whyNoMaterial(s), "select a body first");
  const c = materialCommand(s, "PLA");
  assert.deepEqual(c, { ok: false, error: "select a body first" });
  const t = select(s, [bodyRefs(s)[0]!]);
  const long = materialCommand(t, "x".repeat(MATERIAL_MAX + 1));
  assert.equal(long.ok, false);
  const ctl = run(t, { type: "setMaterial", body: selectedBodies(t)[0]!.id, material: "bad\u0007name" });
  assert.equal(materialOf(scene(ctl), selectedBodies(t)[0]!.id), undefined, "the command refuses it; the scene is as it was");
  assert.ok(ctl.message, "and says why");
});

test("Material is under Shape, Fabricate in the ring (with the fastener tool), live with a body selected and dimmed with the reason without one (`in_1083`)", () => {
  const ring = (sess: Session) => reduce({ ...createState(sess), cam: homeCamera() }, { type: "menu", x: 400, y: 300, button: true }, { w: 800, h: 600, now: 0 }).menu!.items;
  const shape = ring(createSession(kernel)).find((i) => i.id === "shape")!;
  const fab = shape.children!.find((i) => i.id === "fabricate")!;
  assert.equal(fab.label, "Fabricate");
  assert.deepEqual(fab.children!.map((c) => c.id), ["fab:material", "tool:fasteners"]);
  const none = fab.children!.find((c) => c.id === "fab:material")!;
  assert.deepEqual([none.enabled, none.why], [false, "select a body first"]);
  const b = twoBodies();
  const withBody = ring(select(b, [bodyRefs(b)[0]!])).find((i) => i.id === "shape")!.children!.find((i) => i.id === "fabricate")!.children!.find((c) => c.id === "fab:material")!;
  assert.equal(withBody.enabled, true);
  assert.ok(!appRows().some((r) => r.id === "material"), "no longer a row of the ⋯ list");
});

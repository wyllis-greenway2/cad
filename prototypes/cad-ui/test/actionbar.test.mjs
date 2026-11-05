import test from "node:test";
import assert from "node:assert/strict";
import { settings } from "../src/settings.js";
import { barItems, keyLabel, barHint } from "../src/actionbar.mjs";

const keys = settings.input.keys;
const base = { keys, canUndo: true, canRedo: false, tool: "select", offers: [], sel: null, mode: "3d" };
const labels = (groups, id) => groups.find((g) => g.id === id)?.items.map((i) => `${i.label}${i.key ? ` (${i.key})` : ""}`);

test("key labels read the way they are typed", () => {
  assert.equal(keyLabel("mod+z"), "Ctrl+Z");
  assert.equal(keyLabel(["delete", "backspace"]), "Del");
  assert.equal(keyLabel("escape"), "Esc");
  assert.equal(keyLabel("shift+h"), "Shift+H");
  assert.equal(keyLabel("m"), "M");
});

test("3D view: the bar follows the selection and shows the hotkey of each action", () => {
  assert.deepEqual(labels(barItems({ ...base, sel: { kind: "face" } }), "selection"), ["Move face (M)", "Tilt face (R)", "Sketch on surface (S)"]);
  assert.deepEqual(labels(barItems({ ...base, sel: { kind: "face", round: true } }), "selection"), ["Change radius (M)", "Taper (R)"]);
  assert.deepEqual(labels(barItems({ ...base, sel: { kind: "edge" } }), "selection"), ["Fillet (F)", "Chamfer (B)"]);
  assert.deepEqual(labels(barItems({ ...base, sel: { kind: "body" } }), "selection"), ["Move (M)", "Rotate (R)", "Scale (K)", "Delete (Del)"]);
  assert.deepEqual(labels(barItems({ ...base, sel: { kind: "sketch" } }), "selection"), ["Extrude (E)", "Sketch on it (S)", "Delete (Del)"]);
  assert.deepEqual(labels(barItems(base), "selection"), ["Home view (H)", "Return to origin (O)"]); // nothing selected
  const undo = barItems(base).find((g) => g.id === "view").items.find((i) => i.label === "Undo");
  assert.equal(undo.enabled, true);
  assert.equal(barItems(base).find((g) => g.id === "view").items.find((i) => i.label === "Redo").enabled, false);
  assert.match(barHint(base), /double-click the body/);
});

test("sketch view: tools with the active one marked, then constraint buttons with their state and reasons", () => {
  const offers = [{ label: "Horizontal", enabled: true, active: true }, { label: "Vertical", enabled: false, reason: "it would shrink a line to nothing", active: false }];
  const g = barItems({ ...base, mode: "sketch", tool: "select", offers, sketchHasSelection: true });
  assert.deepEqual(labels(g, "tools"), ["Select (V)", "Line (L)", "Rectangle (R)", "Circle (C)", "Dimension (D)", "Extrude (E)"]);
  assert.equal(g.find((x) => x.id === "tools").items[0].active, true);
  const c = g.find((x) => x.id === "constraints").items;
  assert.deepEqual(c.map((i) => [i.label, i.key, i.enabled, i.active]), [["Horizontal", "Shift+H", true, true], ["Vertical", "Shift+V", false, false]]);
  assert.equal(c[1].reason, "it would shrink a line to nothing");
  assert.ok(labels(g, "edit").includes("Delete (Del)"));
  assert.ok(labels(g, "edit").includes("3D view (Esc)"));
});

test("drawing tools are not offered while editing a step's own sketch; an operation in progress shows Apply and Cancel", () => {
  const g = barItems({ ...base, mode: "sketch", editingStepSketch: true });
  const tools = g.find((x) => x.id === "tools").items;
  assert.equal(tools.find((i) => i.label === "Line").enabled, false);
  assert.equal(tools.find((i) => i.label === "Dimension").enabled, true);
  assert.deepEqual(labels(barItems({ ...base, mode: "op", op: { editing: true } }), "op"), ["Apply (Enter)", "Cancel (Esc)", "Delete step (Del)"]);
});

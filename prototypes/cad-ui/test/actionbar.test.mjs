import test from "node:test";
import assert from "node:assert/strict";
import { settings } from "../src/settings.js";
import { barItems, keyLabel, barHint } from "../src/actionbar.mjs";
import { hasIcon, keyShort } from "../src/icons.mjs";

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

test("sketch view: nothing picked shows the sketching tools; picking lines shows only what can be done with them", () => {
  const sketch = { ...base, mode: "sketch", tool: "select", offers: [] };
  const none = barItems(sketch);
  assert.deepEqual(labels(none, "tools"), ["Select (V)", "Line (L)", "Rectangle (R)", "Circle (C)", "Dimension (D)"]);
  assert.equal(none.find((x) => x.id === "tools").items[0].active, true);
  assert.ok(!JSON.stringify(none).includes("Extrude")); // extrusion needs a closed shape selected
  assert.ok(labels(none, "edit").includes("3D view (Esc)"));
  // a line picked: only its constraints and delete; no drawing tools, no extrude, no rectangle
  const offers = [{ label: "Horizontal", enabled: true, active: true }, { label: "Vertical", enabled: false, reason: "it would shrink a line to nothing", active: false }];
  const line = barItems({ ...sketch, offers, pickParts: true });
  const flat = JSON.stringify(line);
  assert.ok(!flat.includes("Rectangle") && !flat.includes("Extrude") && !flat.includes("Line (") && !flat.includes("Circle") && !flat.includes("3D view"));
  const c = line.find((x) => x.id === "constraints").items;
  assert.deepEqual(c.map((i) => [i.label, i.key, i.enabled, i.active]), [["Horizontal", "Shift+H", true, true], ["Vertical", "Shift+V", false, false]]);
  assert.equal(c[1].reason, "it would shrink a line to nothing");
  assert.deepEqual(labels(line, "edit"), ["Delete (Del)", "Undo (Ctrl+Z)", "Redo (Ctrl+Shift+Z)"]);
  // a whole closed shape picked: extrude, dimension, delete
  assert.deepEqual(labels(barItems({ ...sketch, pickShape: true, pickShapeClosed: true }), "shape"), ["Extrude (E)", "Dimension (D)", "Delete (Del)"]);
  assert.deepEqual(labels(barItems({ ...sketch, pickShape: true, pickShapeClosed: false }), "shape"), ["Dimension (D)", "Delete (Del)"]); // an open line: nothing to extrude
  // a drawing tool in use: the tools, with it lit
  const drawing = barItems({ ...sketch, tool: "rect" });
  assert.equal(drawing.find((x) => x.id === "tools").items.find((i) => i.label === "Rectangle").active, true);
});

test("drawing tools are not offered while editing a step's own sketch; an operation in progress shows Apply and Cancel", () => {
  const g = barItems({ ...base, mode: "sketch", editingStepSketch: true });
  const tools = g.find((x) => x.id === "tools").items;
  assert.equal(tools.find((i) => i.label === "Line").enabled, false);
  assert.equal(tools.find((i) => i.label === "Dimension").enabled, true);
  assert.deepEqual(labels(barItems({ ...base, mode: "op", op: { editing: true } }), "op"), ["Apply (Enter)", "Cancel (Esc)", "Delete step (Del)"]);
});

test("every action in every context has an icon and a help line (text is only for tooltips)", () => {
  const offers = ["Horizontal", "Vertical", "Equal length", "Equal radius", "Parallel", "Perpendicular", "Fix in place", "Coincident", "Same height", "Same position across"].map((label) => ({ label, enabled: true }));
  const contexts = [
    { ...base }, ...["sketch", "face", "edge", "body", "vertex"].map((kind) => ({ ...base, sel: { kind } })), { ...base, sel: { kind: "face", round: true } },
    { ...base, mode: "sketch", offers: [] }, { ...base, mode: "sketch", offers, pickParts: true }, { ...base, mode: "sketch", pickShape: true, pickShapeClosed: true },
    { ...base, mode: "op", op: { editing: true } },
  ];
  for (const ctx of contexts) {
    for (const g of barItems(ctx)) {
      for (const it of g.items) {
        assert.ok(hasIcon(it.icon), `${it.label} has no icon`);
        assert.ok(it.help, `${it.label} has no help text`);
      }
    }
  }
  assert.equal(keyShort("Shift+H"), "⇧H");
  assert.equal(keyShort("Ctrl+Shift+Z"), "⇧^Z");
});

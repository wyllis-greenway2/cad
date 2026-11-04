import test from "node:test";
import assert from "node:assert/strict";
import { settings } from "../src/settings.js";
import { SketchStore } from "../src/sketchstore.mjs";
import { ExtrudeSession } from "../src/extrude.mjs";
import { buildGraph } from "../src/features.mjs";
import { paramOnAxisFromRay } from "../src/sketch.mjs";

const rect = { type: "rect", x0: 0, y0: 0, x1: 40, y1: 30 };

test("dragging rounds to a step; near zero is zero; Shift is fine", () => {
  const e = new ExtrudeSession(settings, { plane: "XY", shape: rect });
  e.drag(12.4);
  assert.equal(e.distance, 12);
  e.drag(0.3);
  assert.equal(e.distance, 0);
  assert.equal(e.isEmpty(), true);
  e.drag(12.347, true);
  assert.equal(e.distance, 12.35);
});

test("typed distance replaces the dragged one; math works; bad text is invalid; mode is add or cut", () => {
  const e = new ExtrudeSession(settings, { plane: "XY", shape: rect, hasBody: true });
  e.drag(8);
  assert.equal(e.type("-"), true);
  assert.equal(e.type("5"), true);
  assert.equal(e.type("a"), false);
  assert.equal(e.value(), -5);
  assert.equal(e.mode(), "cut");
  e.backspace();
  e.backspace();
  assert.equal(e.value(), 8); // typed text is gone, the dragged value is back
  e.type("2"); e.type("*"); e.type("3");
  assert.equal(e.value(), 6);
  e.text = "2*"; // half-typed
  assert.equal(e.invalid(), true);
  const none = new ExtrudeSession(settings, { plane: "XY", shape: rect, hasBody: false });
  none.drag(-4);
  assert.equal(none.mode(), "add"); // nothing to cut yet
});

test("feature list: add, edit, remove, undo and redo share the sketch history", () => {
  const store = new SketchStore();
  const a = store.addFeature("XY", rect, 20);
  const b = store.addFeature("XZ", { type: "circle", cx: 0, cy: 0, r: 5 }, -10);
  assert.deepEqual(store.features.map((f) => f.id), ["f_001", "f_002"]);
  store.updateFeature(a.id, 25);
  assert.equal(store.features[0].distance, 25);
  store.removeFeature(a.id);
  assert.equal(store.features.length, 1);
  store.undo(); // un-remove restores the original position
  assert.deepEqual(store.features.map((f) => f.id), ["f_001", "f_002"]);
  store.undo(); // un-update
  assert.equal(store.features[0].distance, 20);
  store.undo(); // un-add f_002
  assert.equal(store.features.length, 1);
  store.redo();
  assert.equal(store.features.length, 2);
  assert.equal(b.id, "f_002");
});

test("graph: one sketch + one extrude per feature; negative cuts only when a body exists", () => {
  const g = buildGraph([
    { id: "f_001", plane: "XY", shape: rect, distance: -5 },
    { id: "f_002", plane: "XZ", shape: { type: "circle", cx: 1, cy: 2, r: 3 }, distance: -4 },
  ]);
  assert.deepEqual(g.ops.map((o) => o.id), ["s_f_001", "x_f_001", "s_f_002", "x_f_002"]);
  assert.equal(g.ops[1].mode, "add");
  assert.equal(g.ops[3].mode, "cut");
  assert.equal(g.ops[3].target, "x_f_001");
  assert.equal(g.ops[2].plane, "XZ");
  assert.deepEqual(g.ops[0].at, [20, 15]);
});

test("mouse ray to distance along an axis", () => {
  // camera at (100, 0, 50) looking at (0, 0, 20): the closest point on the Z axis to that ray is z = 20
  const o = [100, 0, 50];
  const d = [-100, 0, -30];
  const l = Math.hypot(...d);
  const t = paramOnAxisFromRay({ o, v: d.map((x) => x / l) }, [0, 0, 0], [0, 0, 1]);
  assert.ok(Math.abs(t - 20) < 1e-9);
  assert.equal(paramOnAxisFromRay({ o: [0, 0, 5], v: [0, 0, 1] }, [0, 0, 0], [0, 0, 1]), null);
});

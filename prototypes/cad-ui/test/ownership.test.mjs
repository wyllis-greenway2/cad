import test from "node:test";
import assert from "node:assert/strict";
import { settings } from "../src/settings.js";
import { SketchStore } from "../src/sketchstore.mjs";
import { SketchSession } from "../src/interaction.mjs";

const rect = { type: "rect", x0: 0, y0: 0, x1: 40, y1: 20 };

test("extruding consumes the loose sketch; undo brings it back; deleting the step releases it", () => {
  const store = new SketchStore();
  const e = store.add("XY", rect);
  const f = store.addFeature("XY", { ...rect }, 10, null, e);
  assert.equal(store.entities("XY").length, 0); // no loose sketch left on the plane
  assert.equal(store.features.length, 1);
  store.undo();
  assert.deepEqual(store.entities("XY").map((x) => x.id), [e.id]); // undo restores it
  assert.equal(store.features.length, 0);
  store.redo();
  assert.equal(store.entities("XY").length, 0);
  store.removeFeature(f.id); // deleting the step releases its sketch again
  assert.deepEqual(store.entities("XY").map((x) => x.id), [e.id]);
  store.undo();
  assert.equal(store.entities("XY").length, 0);
  assert.equal(store.features.length, 1);
});

test("restoring keeps the sketch where it was among the others", () => {
  const store = new SketchStore();
  const a = store.add("XY", rect);
  const b = store.add("XY", { type: "circle", cx: 5, cy: 5, r: 2 });
  const c = store.add("XY", rect);
  store.addFeature("XY", { ...rect }, 5, null, b);
  assert.deepEqual(store.entities("XY").map((x) => x.id), [a.id, c.id]);
  store.undo();
  assert.deepEqual(store.entities("XY").map((x) => x.id), [a.id, b.id, c.id]);
});

test("a step's own sketch can be resized (and undone) through its key, but not extended", () => {
  const store = new SketchStore();
  const e = store.add("XY", rect);
  const f = store.addFeature("XY", { ...rect }, 10, null, e);
  const key = `feat:${f.id}`;
  assert.equal(store.entities(key).length, 1);
  assert.equal(store.add(key, rect), null);
  assert.equal(store.remove(key, e.id), false);
  const s = new SketchSession(settings, store);
  s.setPlane("XY");
  s.editKey = key;
  s.scale = 4;
  s.setTool("dimension");
  s.click([20, 0], {}); // click the bottom edge: selects the shape
  assert.equal(s.selectedId, e.id);
  [..."60"].forEach((c) => s.type(c)); // width 60
  s.enter();
  assert.equal(store.features[0].shape.x1, 60);
  assert.equal(store.entities("XY").length, 0); // still not loose
  store.undo();
  assert.equal(store.features[0].shape.x1, 40);
});

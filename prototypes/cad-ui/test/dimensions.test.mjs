import test from "node:test";
import assert from "node:assert/strict";
import { settings } from "../src/settings.js";
import { SketchStore } from "../src/sketchstore.mjs";
import { SketchSession } from "../src/interaction.mjs";
import { dimensionsOf } from "../src/dimensions.mjs";

const make = () => {
  const store = new SketchStore();
  const s = new SketchSession(settings, store);
  s.setPlane("XY");
  s.scale = 4;
  return { store, s };
};
const typeText = (s, text) => [...text].forEach((ch) => s.type(ch));

test("dimensions of a rectangle, circle and polyline", () => {
  const r = dimensionsOf({ type: "rect", x0: 0, y0: 0, x1: 40, y1: 30 }, 5);
  assert.deepEqual(r.map((d) => [d.key, d.value]), [["w", 40], ["h", 30]]);
  assert.deepEqual(dimensionsOf({ type: "circle", cx: 1, cy: 2, r: 5 }, 5).map((d) => [d.key, d.value]), [["d", 10]]);
  const p = dimensionsOf({ type: "poly", points: [[0, 0], [3, 4], [3, 10]], closed: false }, 1);
  assert.deepEqual(p.map((d) => [d.key, d.value]), [["s0", 5], ["s1", 6]]);
});

test("dimension tool: click a shape, type W, Tab, H (math ok), Enter = one undoable change", () => {
  const { store, s } = make();
  store.add("XY", { type: "rect", x0: 0, y0: 0, x1: 40, y1: 30 });
  s.setTool("dimension");
  s.move([10, 30], {});
  assert.equal(s.hoverId, "e_001");
  assert.equal(s.dims(5).length, 2); // hovering already shows its dimensions
  s.click([10, 30], {});
  assert.equal(s.selectedId, "e_001");
  assert.equal(s.type("5"), true); // starts editing the first dimension
  typeText(s, "0/2");
  assert.equal(s.tab(), true);
  typeText(s, "12.5");
  assert.equal(s.enter(), true);
  assert.deepEqual(store.entities("XY")[0], { id: "e_001", type: "rect", x0: 0, y0: 0, x1: 25, y1: 12.5 });
  assert.equal(store.past.length, 2);
  store.undo();
  assert.equal(store.entities("XY")[0].x1, 40);
  store.redo();
  assert.equal(store.entities("XY")[0].x1, 25);
  assert.equal(s.dimEdit, null);
});

test("dimension tool: clicking a number edits that one; bad numbers are refused; Esc backs out one level at a time", () => {
  const { store, s } = make();
  store.add("XY", { type: "rect", x0: 0, y0: 0, x1: 40, y1: 30 });
  s.setTool("dimension");
  s.scale = 4;
  s.click([10, 30], {});
  const h = s.dims(settings.sketch.dimOffsetPx / 4).find((d) => d.key === "h");
  s.click(h.pos, {});
  assert.equal(s.dimEdit.active, "h");
  typeText(s, "9-"); // "9-" is not a valid number
  assert.match(s.enter(), /Check the typed numbers/);
  assert.equal(store.entities("XY")[0].y1, 30);
  assert.equal(s.escape(), true);
  assert.equal(s.dimEdit, null);
  assert.equal(s.escape(), true);
  assert.equal(s.selectedId, null);
  assert.equal(s.escape(), true);
  assert.equal(s.tool, "select");
});

test("dimension tool: Enter with nothing typed starts editing; letters are not swallowed", () => {
  const { store, s } = make();
  store.add("XY", { type: "circle", cx: 0, cy: 0, r: 5 });
  s.setTool("dimension");
  s.click([0, 5], {});
  assert.equal(s.type("l"), false); // hotkeys still work
  assert.equal(s.enter(), true);
  assert.equal(s.dimEdit.active, "d");
  typeText(s, "30");
  s.enter();
  assert.equal(store.entities("XY")[0].r, 15);
});

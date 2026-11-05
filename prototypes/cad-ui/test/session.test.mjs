import test from "node:test";
import assert from "node:assert/strict";
import { settings } from "../src/settings.js";
import { SketchStore } from "../src/sketchstore.mjs";
import { SketchSession } from "../src/interaction.mjs";

const make = () => {
  const store = new SketchStore();
  const s = new SketchSession(settings, store);
  s.setPlane("XY");
  s.scale = 4; // 4 px per mm
  return { store, s };
};
const SH = { shift: true }; // shift = snapping off, so coordinates are exactly what the test gives
const typeText = (s, text) => [...text].forEach((ch) => s.type(ch));

test("rectangle by two clicks; a second click on the same spot keeps the first corner and explains", () => {
  const { store, s } = make();
  s.setTool("rect");
  assert.equal(s.click([5, 5], SH), null);
  assert.match(s.click([5, 5], SH), /Move away/);
  assert.ok(s.draft);
  s.click([45, 35], SH);
  assert.equal(store.entities("XY").length, 1);
  assert.deepEqual(store.entities("XY")[0], { id: "e_001", type: "poly", closed: true, points: [[5, 5], [45, 5], [45, 35], [5, 35]] }); // a rectangle is four corners and lines
  assert.deepEqual(store.constraintsOf("XY").map((c) => c.type), ["horizontal", "vertical", "horizontal", "vertical"]);
  assert.equal(s.draft, null);
});

test("typed rectangle: width, Tab, height, math, direction follows the cursor quadrant", () => {
  const { store, s } = make();
  s.setTool("rect");
  s.click([10, 10], SH);
  s.move([-3, 20], SH); // cursor is to the left and above the first corner
  assert.equal(s.type("5"), true);
  typeText(s, "0/2"); // "50/2" = 25
  s.tab();
  typeText(s, "12.5");
  const r = s.resolve();
  assert.equal(r.valid, true);
  assert.deepEqual(r.values, { w: 25, h: 12.5 });
  assert.equal(s.enter(), true);
  assert.deepEqual(store.entities("XY")[0].points, [[10, 10], [-15, 10], [-15, 22.5], [10, 22.5]]);
  assert.equal(s.entry, null);
});

test("typing only width keeps the cursor's height; bad numbers are refused", () => {
  const { store, s } = make();
  s.setTool("rect");
  s.click([0, 0], SH);
  s.move([7, 9], SH);
  typeText(s, "20");
  assert.deepEqual(s.resolve().values, { w: 20, h: 9 });
  s.backspace();
  s.backspace();
  assert.equal(s.entry, null, "deleting every typed character leaves typing mode");
  typeText(s, "2");
  typeText(s, "*");
  assert.equal(s.resolve().valid, false);
  assert.match(s.enter(), /Check the typed numbers/);
  assert.equal(store.entities("XY").length, 0);
  assert.equal(s.type("x"), false, "letters are not consumed");
});

test("typed circle diameter", () => {
  const { store, s } = make();
  s.setTool("circle");
  assert.equal(s.type("5"), false, "no typing before the centre is placed");
  s.click([30, 30], SH);
  s.move([40, 30], SH);
  typeText(s, "12");
  assert.equal(s.resolve().values.d, 12);
  s.enter();
  assert.deepEqual(store.entities("XY")[0], { id: "e_001", type: "circle", cx: 30, cy: 30, r: 6 });
});

test("line tool: typed length and angle chain segments, Enter finishes an open polyline, clicking the start closes", () => {
  const { store, s } = make();
  s.setTool("line");
  s.click([0, 0], SH);
  s.move([5, 1], SH);
  typeText(s, "10");
  s.tab();
  typeText(s, "90");
  s.enter(); // adds the point (0,10)
  assert.deepEqual(s.draft.pts[1], [0, 10]);
  s.move([3, 12], SH);
  typeText(s, "10"); // length only: direction follows the cursor (from (0,10) toward (3,12))
  const next = s.resolve().next;
  assert.ok(Math.abs(Math.hypot(next[0], next[1] - 10) - 10) < 1e-3);
  s.escape(); // stop typing, keep the draft
  assert.ok(s.draft);
  s.click([10, 10], SH);
  s.click([0, 0]); // snaps to the first point -> closes
  assert.equal(store.entities("XY")[0].closed, true);
  assert.deepEqual(store.entities("XY")[0].points, [[0, 0], [0, 10], [10, 10]]);

  s.setTool("line");
  s.click([50, 50], SH);
  s.click([60, 50], SH);
  assert.equal(s.enter(), true);
  assert.equal(store.entities("XY")[1].closed, false);
});

test("Esc steps back one level: typing, then the shape, then the tool, then the selection, then out of the sketch", () => {
  const { s } = make();
  s.setTool("rect");
  s.click([0, 0], SH);
  s.type("4");
  assert.equal(s.escape(), true); assert.equal(s.entry, null); assert.ok(s.draft);
  assert.equal(s.escape(), true); assert.equal(s.draft, null); assert.equal(s.tool, "rect");
  assert.equal(s.escape(), true); assert.equal(s.tool, "select");
  s.click([0, 0], SH); // select tool on empty space
  assert.equal(s.escape(), false, "nothing left: the caller leaves the sketch");
});

test("select and delete, then undo restores it", () => {
  const { store, s } = make();
  s.setTool("rect");
  s.click([0, 0], SH);
  s.click([20, 10], SH);
  s.setTool("select");
  s.click([10, 0.5], SH); // near the bottom edge (within 8 px = 2 mm)
  assert.equal(s.selectedId, "e_001");
  s.click([10, 5], SH); // inside the rectangle also selects it
  assert.equal(s.selectedId, "e_001");
  s.click([100, 100], SH);
  assert.equal(s.selectedId, null);
  s.click([10, 0.5], SH);
  assert.equal(s.deleteSelected(), true);
  assert.equal(store.entities("XY").length, 0);
  store.undo();
  assert.equal(store.entities("XY").length, 1);
});

test("snapping to an existing corner within the pixel threshold; entities are per plane", () => {
  const { store, s } = make();
  s.setTool("rect");
  s.click([0, 0], SH);
  s.click([20, 10], SH);
  s.setTool("circle");
  s.move([21, 11]); // about 1.4 mm away < 3 mm
  assert.deepEqual(s.cursor, [20, 10]);
  s.setPlane("XZ");
  assert.equal(s.entities().length, 0, "another plane has its own sketch");
  assert.equal(store.entities("XY").length, 1);
});

test("an open line is kept when you stop drawing it (Esc, or another tool); a single point is not (`in_062`)", () => {
  const { store, s } = make();
  s.setTool("line");
  s.click([0, 0], SH);
  s.click([10, 0], SH);
  s.click([10, 8], SH);
  assert.equal(store.entities("XY").length, 0); // still being drawn
  s.escape();
  const e = store.entities("XY");
  assert.equal(e.length, 1);
  assert.equal(e[0].closed, false);
  assert.equal(e[0].points.length, 3);
  s.click([30, 30], SH); // one lonely point
  s.escape();
  s.setTool("rect");
  assert.equal(store.entities("XY").length, 1);
  s.setTool("line");
  s.click([0, 20], SH);
  s.click([5, 20], SH);
  s.setTool("select"); // switching tools keeps it too
  assert.equal(store.entities("XY").length, 2);
});

test("a drawing tool draws one figure and then hands back to the select tool (`in_079`)", () => {
  for (const tool of ["rect", "circle", "line"]) {
    const { store, s } = make();
    s.setTool(tool);
    if (tool === "line") (s.click([0, 0], SH), s.click([10, 0], SH), s.click([10, 8], SH), s.enter());
    else (s.click([0, 0], SH), s.click([10, 8], SH));
    assert.equal(store.entities("XY").length, 1, tool);
    assert.equal(s.tool, "select", `${tool} drops back to select`);
  }
  const { store, s } = make();
  s.s = { ...settings, sketch: { ...settings.sketch, oneShot: false } }; // the setting turns it off
  s.setTool("rect");
  s.click([0, 0], SH);
  s.click([10, 8], SH);
  assert.equal(s.tool, "rect");
  s.click([20, 0], SH);
  s.click([30, 8], SH);
  assert.equal(store.entities("XY").length, 2);
});

import test from "node:test";
import assert from "node:assert/strict";
import { settings } from "../src/settings.js";
import { SketchStore } from "../src/sketchstore.mjs";
import { SketchSession } from "../src/interaction.mjs";

const ONE = {}; // a plain click picks one thing; Shift adds another
const mk = () => {
  const store = new SketchStore();
  const s = new SketchSession(settings, store);
  s.setPlane("XY");
  s.scale = 4;
  return { store, s };
};
const typeText = (s, text) => [...text].forEach((c) => s.type(c));
const labels = (s) => Object.fromEntries(s.offers().map((o) => [o.label, o]));

test("click a line: it shows its length; typing a number sets it (a rectangle side is its width or height)", () => {
  const { store, s } = mk();
  store.add("XY", { type: "rect", x0: 0, y0: 0, x1: 40, y1: 20 });
  s.click([20, 0.2], ONE); // bottom line
  assert.deepEqual([s.valueChip().kind, s.valueChip().text], ["length", "40"]);
  typeText(s, "50");
  assert.equal(s.enter(), true);
  assert.equal(store.entities("XY")[0].x1, 50);
  assert.equal(store.constraintsOf("XY").length, 1);
  s.click([50.2, 10], ONE); // the right line: its height
  assert.equal(s.valueChip().text, "20");
  typeText(s, "30");
  s.enter();
  assert.equal(store.entities("XY")[0].y1, 30);
  s.click([25, 0.2], ONE);
  typeText(s, "60"); // set the bottom line again: replaces the dimension, still two constraints
  s.enter();
  assert.equal(store.entities("XY")[0].x1, 60);
  assert.equal(store.constraintsOf("XY").length, 2);
});

test("click a circle's outline: its radius can be typed", () => {
  const { store, s } = mk();
  store.add("XY", { type: "circle", cx: 0, cy: 0, r: 3 });
  s.click([3.1, 0], ONE);
  assert.deepEqual([s.valueChip().kind, s.valueChip().text], ["radius", "3"]);
  typeText(s, "7");
  s.enter();
  assert.equal(store.entities("XY")[0].r, 7);
});

test("a number that would collapse a line is refused, and nothing changes", () => {
  const { store, s } = mk();
  store.add("XY", { type: "rect", x0: 0, y0: 0, x1: 40, y1: 20 });
  s.click([20, 0.2], ONE);
  typeText(s, "0.0001");
  const msg = s.enter();
  assert.match(msg, /flatten the rectangle/);
  assert.equal(store.entities("XY")[0].x1, 40);
  assert.equal(store.constraintsOf("XY").length, 0);
});

test("two lines sharing a corner show the angle between them; typing sets it; out of range is refused", () => {
  const { store, s } = mk();
  store.add("XY", { type: "poly", closed: false, points: [[0, 0], [10, 0], [10, 8]] });
  s.click([5, 0.2], ONE);
  s.click([10.2, 4], { shift: true });
  const chip = s.valueChip();
  assert.deepEqual([chip.kind, chip.text], ["angle", "90°"]);
  typeText(s, "60");
  assert.equal(s.enter(), true);
  const [p0, p1, p2] = store.entities("XY")[0].points;
  const ang = (Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) - Math.atan2(p0[1] - p1[1], p0[0] - p1[0])) * 180 / Math.PI;
  assert.ok(Math.abs(Math.abs(ang) - 60) < 1e-3, `${ang}`);
  s.enter(); // start typing again
  typeText(s, "200");
  assert.match(s.enter(), /between 1° and 179°/);
});

test("a (legacy, built-in constraints) rectangle: its corner angle cannot be changed; parallel on adjacent sides is refused; perpendicular can be locked", () => {
  const { store, s } = mk();
  store.add("XY", { type: "rect", x0: 0, y0: 0, x1: 40, y1: 20 });
  s.click([20, 0.2], ONE); // bottom
  s.click([40.2, 10], { shift: true }); // right: they share a corner
  assert.equal(s.valueChip().kind, "angle");
  typeText(s, "60");
  assert.match(s.enter(), /contradicts the shape itself/);
  assert.equal(store.entities("XY")[0].x1, 40);
  const o = labels(s);
  assert.equal(o["Equal length"].enabled, true); // makes a square: fine
  assert.equal(o["Parallel"].enabled, false); // would fold the sides onto each other: refused
  assert.equal(o["Perpendicular"].enabled, true); // already true, but it can be locked
  assert.equal(s.applyOffer(2), null);
  assert.equal(store.constraintsOf("XY").length, 1);
  assert.equal(labels(s)["Perpendicular"].active, true); // now shown as on; asking again turns it off
  assert.equal(s.applyOffer(2), null);
  assert.equal(store.constraintsOf("XY").length, 0);
});

test("a drawn rectangle is four lines with real horizontal and vertical constraints you can turn off, and then it can shear", () => {
  const { store, s } = mk();
  s.setTool("rect");
  s.click([0, 0], ONE);
  s.click([40, 20], ONE);
  s.setTool("select");
  s.click([20, 0.2], ONE); // bottom line
  let o = labels(s);
  assert.equal(o["Horizontal"].active, true);
  assert.equal(o["Vertical"].enabled, false);
  assert.match(o["Vertical"].reason, /shrink a line to nothing/); // horizontal and vertical at once would squash it to a point
  s.applyOffer(0); // turn Horizontal off
  assert.equal(store.constraintsOf("XY").length, 3);
  s.dragStart({ kind: "point", ref: "e_001.p1", shape: "e_001" }, [40, 0]);
  s.dragMove([46, -6]); // pull the bottom-right corner down and out: the bottom line may now tilt
  s.dragEnd();
  const pts = store.entities("XY")[0].points;
  assert.ok(Math.abs(pts[1][1] - pts[0][1]) > 1); // no longer horizontal
  assert.ok(Math.abs(pts[1][0] - pts[2][0]) < 1e-4); // the right side stays vertical
  s.click([20, -2.5], ONE);
});

test("two lines that share no corner can be made parallel or perpendicular", () => {
  const { store, s } = mk();
  store.add("XY", { type: "poly", closed: false, points: [[0, 0], [10, 1]] });
  store.add("XY", { type: "poly", closed: false, points: [[0, 10], [9, 14]] });
  s.click([5, 0.5], ONE);
  s.click([4.5, 12], { shift: true });
  assert.equal(s.valueChip(), null);
  const o = labels(s);
  assert.equal(o["Parallel"].enabled, true);
  assert.equal(o["Perpendicular"].enabled, true);
  assert.equal(s.applyOffer(s.offers().findIndex((x) => x.label === "Parallel")), null);
  const [a, b] = [store.entities("XY")[0].points, store.entities("XY")[1].points];
  const cross = (b[1][0] - b[0][0]) * (a[1][1] - a[0][1]) - (b[1][1] - b[0][1]) * (a[1][0] - a[0][0]);
  assert.ok(Math.abs(cross) < 1e-3);
  store.undo();
  assert.equal(store.constraintsOf("XY").length, 0);
});

test("setting an angle turns the second line about the shared corner and leaves the first where it is", () => {
  const { store, s } = mk();
  store.add("XY", { type: "poly", closed: false, points: [[0, 0], [10, 0], [10, 8]] });
  s.click([5, 0.2], ONE);
  s.click([10.2, 4], { shift: true });
  typeText(s, "45");
  s.enter();
  const [p0, p1, p2] = store.entities("XY")[0].points;
  assert.ok(Math.hypot(p0[0], p0[1]) < 0.01 && Math.abs(p1[0] - 10) < 0.01 && Math.abs(p1[1]) < 0.01); // the first line did not move
  assert.ok(Math.abs(Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180 / Math.PI - 135) < 0.01); // 45 degrees between them (the second now points up and back)
  assert.ok(Math.abs(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) - 8) < 0.02); // and it keeps its length: it turned, it did not shrink
});

test("a thing's constraint marks show only while it is selected", () => {
  const { store, s } = mk();
  s.setTool("rect");
  s.click([0, 0], ONE);
  s.click([40, 20], ONE);
  store.add("XY", { type: "circle", cx: 80, cy: 10, r: 5 });
  s.setTool("select");
  assert.deepEqual(s.glyphs(), []); // nothing selected: no marks
  s.click([20, 0.2], ONE); // a line of the rectangle
  assert.deepEqual(s.glyphs().map((g) => g.text), ["H"]); // only the constraint on the line itself, not the whole rectangle's
  s.click([85.1, 10], ONE); // the circle: it has none
  assert.deepEqual(s.glyphs(), []);
});

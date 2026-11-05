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

test("a rectangle's corner angle cannot be changed, and its sides cannot be made parallel or perpendicular the wrong way", () => {
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
  assert.match(o["Parallel"].reason, /contradicts the shape itself|fold/);
  assert.equal(o["Perpendicular"].enabled, false);
  assert.match(o["Perpendicular"].reason, /already true/);
  assert.match(s.applyOffer(1), /cannot be set/);
  // opposite sides (no shared corner): parallel is already true, perpendicular would flatten it
  s.click([20, 0.2], ONE);
  s.click([20, 20.2], { shift: true });
  assert.equal(s.valueChip(), null); // no shared corner, so no angle
  const o2 = labels(s);
  assert.equal(o2["Parallel"].enabled, false);
  assert.match(o2["Parallel"].reason, /already true/);
  assert.equal(o2["Perpendicular"].enabled, false);
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

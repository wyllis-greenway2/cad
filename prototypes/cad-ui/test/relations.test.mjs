import test from "node:test";
import assert from "node:assert/strict";
import { settings } from "../src/settings.js";
import { SketchStore } from "../src/sketchstore.mjs";
import { SketchSession } from "../src/interaction.mjs";
import { relationsFor, dimensionalFor, partKindOf } from "../src/relations.mjs";
import { modelOf } from "../src/sketchsolve.mjs";

const corner = (ref) => ({ kind: "point", ref });
const line = (ref) => ({ kind: "seg", ref });
const circle = (ref) => ({ kind: "circle", ref });
const labels = (picks) => relationsFor(picks).map((r) => r.label);
const model = (ents) => modelOf(ents);
const poly = (id, pts) => ({ id, type: "poly", points: pts, closed: false });

test("the table: which relations exist for which pair of parts (the whole matrix of kinds)", () => {
  assert.equal(partKindOf({ kind: "entity" }), null);
  assert.deepEqual(labels([line("a.s0")]), ["Horizontal", "Vertical"]);
  assert.deepEqual(labels([corner("a.p0")]), ["Fix in place"]);
  assert.deepEqual(labels([corner("a.p0"), corner("b.p0")]), ["Coincident", "Same height", "Same position across", "Distance"]);
  assert.deepEqual(labels([line("a.s0"), line("b.s0")]), ["Equal length", "Parallel", "Perpendicular", "Distance"]);
  assert.deepEqual(labels([corner("a.p0"), line("b.s0")]), ["Distance"]);
  assert.deepEqual(labels([line("b.s0"), corner("a.p0")]), ["Distance"], "a corner and a line in either order");
  assert.deepEqual(labels([circle("a.r"), circle("b.r")]), ["Equal radius"]);
  assert.deepEqual(labels([line("a.s0"), circle("b.r")]), []);
  assert.deepEqual(labels([]), []);
  // exactly one dimensional relation per pair that has one, and it measures and locks the same way
  for (const picks of [[corner("a.p0"), corner("b.p0")], [line("a.s0"), line("b.s0")], [corner("a.p0"), line("b.s0")]]) {
    const dim = relationsFor(picks).filter((r) => r.dimensional);
    assert.equal(dim.length, 1);
    assert.equal(dim[0].unit, "mm");
  }
});

test("distance between two corners, a corner and a line, and two parallel lines: measured and made", () => {
  const ents = [poly("a", [[0, 0], [10, 0]]), poly("b", [[3, 4], [13, 4]]), poly("c", [[0, 0], [10, 3]])];
  const m = model(ents);
  const cc = dimensionalFor([corner("a.p0"), corner("b.p0")]);
  assert.equal(cc.measure(m), 5);
  assert.deepEqual(cc.make(m, 12), { type: "distance", a: "a.p0", b: "b.p0", d: 12 });
  const cl = dimensionalFor([corner("b.p0"), line("a.s0")]);
  assert.equal(cl.measure(m), 4); // from the corner to the infinite line the segment lies on
  const k = cl.make(m, 6);
  assert.equal(k.type, "ptLineDist");
  assert.equal(k.p, "b.p0");
  assert.equal(k.seg, "a.s0");
  const ll = dimensionalFor([line("a.s0"), line("b.s0")]);
  assert.equal(ll.unavailable(m), null);
  assert.equal(ll.measure(m), 4);
  const g1 = ll.make(m, 7);
  const g2 = dimensionalFor([line("b.s0"), line("a.s0")]).make(m, 7);
  assert.deepEqual(g1, g2, "the same constraint whichever line was picked first");
  const skew = dimensionalFor([line("a.s0"), line("c.s0")]);
  assert.match(skew.unavailable(m), /not parallel/);
});

const mk = (ents) => {
  const store = new SketchStore();
  const s = new SketchSession(settings, store);
  s.setPlane("XY");
  s.scale = 4;
  for (const e of ents) store.add("XY", { ...e });
  return { store, s };
};
const typeText = (s, text) => [...text].forEach((ch) => s.type(ch));

test("type a distance between two corners: the first picked moves, the second is the reference", () => {
  const { store, s } = mk([{ type: "poly", closed: false, points: [[0, 0], [10, 0]] }, { type: "poly", closed: false, points: [[30, 40], [40, 40]] }]);
  s.click([0, 0]);
  s.click([30, 40], { shift: true });
  const chip = s.valueChip();
  assert.equal(chip.kind, "distance");
  assert.equal(chip.value, 50);
  typeText(s, "20");
  assert.equal(s.enter(), true);
  const m = modelOf(store.entities("XY"));
  assert.ok(Math.abs(m.points["e_002.p0"][0] - 30) < 1e-3 && Math.abs(m.points["e_002.p0"][1] - 40) < 1e-3, "the reference did not move");
  assert.ok(Math.abs(Math.hypot(m.points["e_001.p0"][0] - 30, m.points["e_001.p0"][1] - 40) - 20) < 1e-3, "the mover is now 20 away");
  assert.equal(s.valueChip().locked, true);
});

test("type the gap between two parallel lines, and the distance from a corner to a line", () => {
  const a = mk([{ type: "poly", closed: false, points: [[0, 0], [10, 0]] }, { type: "poly", closed: false, points: [[2, 5], [12, 5]] }]);
  a.s.click([5, 0.1]);
  a.s.click([7, 5.1], { shift: true });
  assert.equal(a.s.valueChip().kind, "distance");
  assert.equal(a.s.valueChip().value, 5);
  typeText(a.s, "9");
  a.s.enter();
  const m = modelOf(a.store.entities("XY"));
  assert.ok(Math.abs(m.points["e_002.p0"][1] - 5) < 1e-3, "the reference line stayed");
  assert.ok(Math.abs(Math.abs(m.points["e_001.p0"][1] - 5) - 9) < 1e-3, "the other line is 9 away from it");
  assert.ok(Math.abs(m.points["e_001.p0"][1] - m.points["e_001.p1"][1]) < 1e-6, "and is still level");
  const b = mk([{ type: "poly", closed: false, points: [[0, 0], [10, 0]] }, { type: "poly", closed: false, points: [[3, 4], [13, 6]] }]);
  b.s.click([3, 4]); // the corner first (the mover)
  b.s.click([5, 0.1], { shift: true }); // then the line
  assert.equal(b.s.valueChip().value, 4);
  typeText(b.s, "7");
  b.s.enter();
  const m2 = modelOf(b.store.entities("XY"));
  assert.ok(Math.abs(m2.points["e_002.p0"][1] - 7) < 1e-3, "the corner is now 7 from the line");
  assert.ok(Math.abs(m2.points["e_001.p0"][1]) < 1e-3 && Math.abs(m2.points["e_001.p1"][1]) < 1e-3, "the line did not move");
});

test("two lines that are not parallel have no distance chip and the menu item says why", () => {
  const { s } = mk([{ type: "poly", closed: false, points: [[0, 0], [10, 0]] }, { type: "poly", closed: false, points: [[20, 0], [30, 10]] }]);
  s.click([5, 0.1]);
  s.click([25, 5], { shift: true });
  assert.equal(s.valueChip(), null);
  const off = s.offers().find((o) => o.label === "Distance");
  assert.equal(off.enabled, false);
  assert.match(off.reason, /not parallel/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { elementAt, offersFor, glyphsFor } from "../src/sketchpick.mjs";

const rect = { id: "e_1", type: "rect", x0: 0, y0: 0, x1: 40, y1: 20 };
const circle = { id: "e_2", type: "circle", cx: 60, cy: 10, r: 5 };

test("picking: corners first, then lines and circle outlines", () => {
  assert.deepEqual(elementAt([0.5, 0.5], [rect], 2), { kind: "point", ref: "e_1.a", shape: "e_1" });
  assert.deepEqual(elementAt([20, 0.5], [rect], 2), { kind: "seg", ref: "e_1.s0", shape: "e_1" });
  assert.deepEqual(elementAt([40.5, 10], [rect], 2), { kind: "seg", ref: "e_1.s1", shape: "e_1" });
  assert.equal(elementAt([20, 10], [rect], 2), null); // inside, away from the outline
  assert.deepEqual(elementAt([65, 10.5], [circle], 2), { kind: "circle", ref: "e_2.r", shape: "e_2" });
  assert.deepEqual(elementAt([60.5, 10], [circle], 2), { kind: "point", ref: "e_2.c", shape: "e_2" }); // the centre
});

test("offers depend on what is picked", () => {
  const seg = (ref) => ({ kind: "seg", ref });
  assert.deepEqual(offersFor([seg("e_1.s0")]).map((o) => o.label), ["Horizontal", "Vertical"]);
  assert.deepEqual(offersFor([seg("e_1.s0"), seg("e_1.s1")]).map((o) => o.label), ["Equal length", "Parallel", "Perpendicular"]);
  assert.deepEqual(offersFor([{ kind: "point", ref: "e_1.a" }]).map((o) => o.label), ["Fix in place"]);
  assert.deepEqual(offersFor([{ kind: "point", ref: "e_1.a" }, { kind: "point", ref: "e_2.c" }]).map((o) => o.label), ["Coincident", "Same height", "Same position across"]);
  assert.deepEqual(offersFor([{ kind: "circle", ref: "a.r" }, { kind: "circle", ref: "b.r" }]).map((o) => o.label), ["Equal radius"]);
  assert.deepEqual(offersFor([seg("e_1.s0"), { kind: "point", ref: "e_1.a" }]), []); // mixed picks: nothing
  assert.equal(offersFor([{ kind: "point", ref: "e_1.a" }])[0].make({ points: { "e_1.a": [3, 4] } }).at[1], 4);
});

test("glyphs: where each constraint is drawn and what it says", () => {
  const g = glyphsFor([rect, circle], [
    { id: "c1", type: "horizontal", seg: "e_1.s0" }, { id: "c2", type: "hdist", a: "e_1.a", b: "e_1.b", d: 40 },
    { id: "c3", type: "radius", r: "e_2.r", value: 5 }, { id: "c4", type: "gone", seg: "nope.s0" },
  ]);
  assert.deepEqual(g.map((x) => [x.id, x.text]), [["c1", "H"], ["c2", "40"], ["c3", "R5"]]);
  assert.deepEqual(g[0].pos, [20, 0]);
});

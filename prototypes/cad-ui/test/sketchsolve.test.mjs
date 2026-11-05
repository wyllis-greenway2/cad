import test from "node:test";
import assert from "node:assert/strict";
import { solveSketch, modelOf } from "../src/sketchsolve.mjs";

const rect = { id: "e_001", type: "rect", x0: 0, y0: 0, x1: 38, y1: 19 };

test("a rectangle width constraint resizes it, keeping the first corner (soft anchor)", () => {
  const cons = [{ id: "c1", type: "hdist", a: "e_001.a", b: "e_001.b", d: 40 }];
  const r = solveSketch([rect], cons, [{ p: "e_001.a", at: [0, 0], w: 0.5 }]);
  assert.equal(r.status, "ok");
  assert.deepEqual([r.entities[0].x0, r.entities[0].y0, r.entities[0].x1, r.entities[0].y1].map((v) => Math.round(v * 1000) / 1000), [0, 0, 40, 19]);
});

test("width and height together; it stays a rectangle; two segments equal", () => {
  const sq = [
    { id: "c1", type: "hdist", a: "e_001.a", b: "e_001.b", d: 30 },
    { id: "c2", type: "equalLength", seg1: "e_001.s0", seg2: "e_001.s1" },
  ];
  const r = solveSketch([rect], sq, [{ p: "e_001.a", at: [0, 0], w: 0.5 }]);
  assert.equal(r.status, "ok");
  const e = r.entities[0];
  assert.ok(Math.abs(e.x1 - e.x0 - 30) < 1e-5 && Math.abs(e.y1 - e.y0 - 30) < 1e-5); // a 30 x 30 square
});

test("a circle radius, and two circles equal", () => {
  const c1 = { id: "c_a", type: "circle", cx: 0, cy: 0, r: 3 };
  const c2 = { id: "c_b", type: "circle", cx: 20, cy: 0, r: 8 };
  const r = solveSketch([c1, c2], [{ id: "k1", type: "radius", r: "c_a.r", value: 5 }, { id: "k2", type: "equalRadius", r: "c_a.r", s: "c_b.r" }]);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.entities.map((e) => e.r), [5, 5]);
});

test("a polyline: horizontal segment, length, perpendicular next segment", () => {
  const poly = { id: "p_1", type: "poly", closed: false, points: [[0, 0], [9, 1], [10, 8]] };
  const cons = [
    { id: "a", type: "horizontal", seg: "p_1.s0" }, { id: "b", type: "distance", seg: "p_1.s0", d: 10 },
    { id: "c", type: "perpendicular", seg1: "p_1.s0", seg2: "p_1.s1" }, { id: "d", type: "fixed", p: "p_1.p0", at: [0, 0] },
  ];
  const r = solveSketch([poly], cons);
  assert.equal(r.status, "ok");
  const [p0, p1, p2] = r.entities[0].points;
  assert.deepEqual([p0[1], p1[1]].map(Math.abs), [0, 0]);
  assert.ok(Math.abs(p1[0] - 10) < 1e-5);
  assert.ok(Math.abs(p2[0] - p1[0]) < 1e-5); // vertical: perpendicular to the horizontal one
});

test("a conflict names the stored constraints (not the built-in ones) and changes nothing", () => {
  const cons = [{ id: "c1", type: "hdist", a: "e_001.a", b: "e_001.b", d: 40 }, { id: "c2", type: "hdist", a: "e_001.d", b: "e_001.c", d: 50 }];
  const r = solveSketch([rect], cons);
  assert.equal(r.status, "conflict");
  assert.ok(r.conflicts.includes("c1") && r.conflicts.includes("c2"));
  assert.equal(r.entities[0].x1, 38);
});

test("constraints whose shapes are gone are reported as dropped", () => {
  const r = solveSketch([rect], [{ id: "x", type: "radius", r: "gone.r", value: 3 }]);
  assert.deepEqual(r.dropped, ["x"]);
});

test("degrees of freedom: a free rectangle has 4 (position 2, size 2), anchored with sizes it has 0", () => {
  assert.equal(solveSketch([rect], []).dof, 4);
  const full = [{ id: "f", type: "fixed", p: "e_001.a", at: [0, 0] }, { id: "w", type: "hdist", a: "e_001.a", b: "e_001.b", d: 38 }, { id: "h", type: "vdist", a: "e_001.b", b: "e_001.c", d: 19 }];
  assert.equal(solveSketch([rect], full).dof, 0);
  assert.equal(modelOf([rect]).builtin.length, 4);
});

import { SketchStore } from "../src/sketchstore.mjs";
import { SketchSession } from "../src/interaction.mjs";
import { settings } from "../src/settings.js";

const SH = { shift: true };
const mk = () => {
  const store = new SketchStore();
  const s = new SketchSession(settings, store);
  s.setPlane("XY");
  s.scale = 4;
  return { store, s };
};

test("a typed dimension becomes a stored constraint, and stays when another dimension changes", () => {
  const { store, s } = mk();
  store.add("XY", { type: "rect", x0: 0, y0: 0, x1: 38, y1: 19 });
  s.setTool("dimension");
  s.click([10, 19], SH);
  [..."40"].forEach((c) => s.type(c));
  s.enter();
  assert.equal(store.constraintsOf("XY").length, 1);
  assert.equal(store.entities("XY")[0].x1, 40);
  s.click([10, 19], SH);
  s.type("9"); // the first dimension again: it is locked, a new value replaces it (still one constraint)
  s.enter();
  assert.equal(store.constraintsOf("XY").length, 1);
  assert.equal(store.entities("XY")[0].x1, 9);
  store.undo();
  assert.equal(store.entities("XY")[0].x1, 40);
});

test("select two lines, ask for Equal length: both change together, undo restores both; conflicts are refused", () => {
  const { store, s } = mk();
  store.add("XY", { type: "rect", x0: 0, y0: 0, x1: 40, y1: 20 });
  s.click([20, 0.2], SH); // bottom line
  s.click([40.2, 10], { shift: true }); // right line
  assert.deepEqual(s.picks.map((k) => k.ref), ["e_001.s0", "e_001.s1"]);
  const labels = s.offers().map((o) => o.label);
  assert.ok(labels.includes("Equal length"));
  assert.equal(s.applyOffer(labels.indexOf("Equal length")), null);
  const e = store.entities("XY")[0];
  assert.ok(Math.abs(Math.abs(e.x1 - e.x0) - Math.abs(e.y1 - e.y0)) < 1e-4); // a square now
  store.undo();
  assert.equal(store.entities("XY")[0].x1, 40);
  assert.equal(store.constraintsOf("XY").length, 0);
});

test("a horizontal drawn line is remembered as horizontal, and drags keep constraints true", () => {
  const { store, s } = mk();
  s.setTool("line");
  s.click([0, 0], SH);
  s.click([10, 0], SH); // exactly horizontal
  s.click([10, 8], SH); // exactly vertical
  s.enter();
  assert.deepEqual(store.constraintsOf("XY").map((c) => c.type), ["horizontal", "vertical"]);
  s.setTool("select");
  const pts = () => store.entities("XY")[0].points;
  s.dragStart({ kind: "point", ref: "e_001.p2", shape: "e_001" }, [10, 8]);
  s.dragMove([14, 20]); // pull the end up and to the right: the last segment must stay vertical and the first horizontal, so the middle corner slides right with it
  assert.equal(s.dragEnd(), true);
  assert.ok(Math.abs(pts()[2][0] - pts()[1][0]) < 1e-4); // still vertical
  assert.ok(Math.abs(pts()[1][1] - pts()[0][1]) < 1e-4); // still horizontal
  assert.ok(pts()[2][1] > 15); // it followed the mouse along the free direction
  store.undo();
  assert.deepEqual(pts()[2], [10, 8]);
  assert.equal(store.constraintsOf("XY").length, 2); // the constraints came with the shape
  store.undo(); // the line and its constraints go together
  assert.equal(store.entities("XY").length, 0);
  assert.equal(store.constraintsOf("XY").length, 0);
});

test("a constraint mark can be picked and deleted (undoable)", () => {
  const { store, s } = mk();
  store.add("XY", { type: "circle", cx: 0, cy: 0, r: 3 });
  s.setTool("dimension");
  s.click([3, 0], SH);
  [..."10"].forEach((c) => s.type(c));
  s.enter();
  assert.equal(store.entities("XY")[0].r, 5); // diameter 10
  s.setTool("select");
  assert.deepEqual(s.glyphs(), []); // marks show only for what is selected
  s.click([5.1, 0], {}); // the circle's outline
  assert.deepEqual(s.glyphs().map((g) => g.text), ["R5"]);
  s.pickConstraint("c_001");
  assert.equal(s.deleteSelected(), true);
  assert.equal(store.constraintsOf("XY").length, 0);
  store.undo();
  assert.equal(store.constraintsOf("XY").length, 1);
});

test("consuming a sketch moves its own constraints with it and releases ones that linked other shapes", () => {
  const { store } = mk();
  const a = store.add("XY", { type: "rect", x0: 0, y0: 0, x1: 40, y1: 20 });
  const b = store.add("XY", { type: "circle", cx: 60, cy: 10, r: 5 });
  store.edit("XY", { constraints: [{ id: "k1", type: "hdist", a: "e_001.a", b: "e_001.b", d: 40 }, { id: "k2", type: "radius", r: "e_002.r", value: 5 }, { id: "k3", type: "equalLength", seg1: "e_001.s0", seg2: "e_001.s1" }] });
  const f = store.addFeature("XY", { type: "rect", x0: 0, y0: 0, x1: 40, y1: 20 }, 10, null, a);
  assert.deepEqual(store.constraintsOf("XY").map((c) => c.id), ["k2"]); // the circle's stays loose
  assert.deepEqual(store.constraintsOf(`feat:${f.id}`).map((c) => c.id), ["k1", "k3"]); // the rectangle's went with it
  store.undo();
  assert.deepEqual(store.constraintsOf("XY").map((c) => c.id).sort(), ["k1", "k2", "k3"]);
  assert.ok(b);
});

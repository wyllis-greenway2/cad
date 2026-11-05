import test from "node:test";
import assert from "node:assert/strict";
import { buildMap, constraintsOn, dependentsOfShape, brokenConstraints, partExists } from "../src/constraintmap.mjs";
import { SketchStore } from "../src/sketchstore.mjs";

const poly = (id, pts) => ({ id, type: "poly", points: pts, closed: true });
const circle = (id) => ({ id, type: "circle", cx: 0, cy: 0, r: 5 });

test("the map says what touches each part and what a deletion would affect", () => {
  const entities = [poly("e_001", [[0, 0], [10, 0], [10, 10], [0, 10]]), circle("e_002")];
  const constraints = [
    { id: "c1", type: "horizontal", seg: "e_001.s0" },
    { id: "c2", type: "coincident", a: "e_001.p2", b: "e_002.c" },
    { id: "c3", type: "radius", r: "e_002.r", value: 5 },
  ];
  const map = buildMap([{ key: "XY", entities, constraints }]);
  assert.deepEqual(constraintsOn(map, "XY", "e_001.s0").map((c) => c.type), ["horizontal"]);
  const onCorner = constraintsOn(map, "XY", "e_001.p2");
  assert.equal(onCorner.length, 1);
  assert.deepEqual(onCorner[0].others, ["e_002.c"]); // what the corner is tied to
  assert.deepEqual(dependentsOfShape(map, "XY", "e_002").sort(), ["c2", "c3"]); // deleting the circle touches two constraints
  assert.deepEqual(dependentsOfShape(map, "XY", "e_001").sort(), ["c1", "c2"]);
  assert.equal(brokenConstraints(map).length, 0);
  assert.equal(constraintsOn(map, "XY", "e_002").length, 2, "a whole shape includes all its parts");
});

test("a constraint to something that no longer exists is reported as broken", () => {
  const map = buildMap([{ key: "XY", entities: [poly("e_001", [[0, 0], [10, 0], [10, 10]])], constraints: [{ id: "c9", type: "coincident", a: "e_001.p1", b: "e_005.c" }] }]);
  assert.deepEqual(brokenConstraints(map).map((c) => c.id), ["c9"]);
  assert.equal(partExists([circle("e_002")], "e_002.r"), true);
  assert.equal(partExists([circle("e_002")], "e_009.r"), false);
});

test("deleting a shape takes its constraints with it, and undo brings both back", () => {
  const store = new SketchStore();
  store.add("XY", poly("x", [[0, 0], [10, 0], [10, 10], [0, 10]]));
  const a = store.add("XY", poly("y", [[20, 0], [30, 0], [30, 10], [20, 10]]));
  store.edit("XY", { entities: [], constraints: [{ id: "k1", type: "horizontal", seg: `${a.id}.s0` }, { id: "k2", type: "coincident", a: `${a.id}.p0`, b: "e_001.p1" }] });
  const before = store.constraintsOf("XY").length;
  assert.ok(before >= 2);
  const dropped = store.dependentsOf("XY", a.id);
  assert.deepEqual(dropped.map((c) => c.id).sort(), ["k1", "k2"]);
  assert.ok(store.remove("XY", a.id));
  assert.equal(store.constraintsOf("XY").some((c) => c.id === "k1" || c.id === "k2"), false, "no dangling constraints");
  store.undo();
  assert.equal(store.entities("XY").some((e) => e.id === a.id), true);
  assert.equal(store.constraintsOf("XY").some((c) => c.id === "k1"), true, "undo restores them");
});

test("a pin to a body corner is listed under the body corner too", async () => {
  const { bodyRef } = await import("../src/constraintmap.mjs");
  const ext = { kind: "vertex", world: [25, 30, 0] };
  const map = buildMap([{ key: "F1", entities: [poly("e_001", [[0, 0], [10, 0], [10, 10]])], constraints: [{ id: "k1", type: "anchor", p: "e_001.p1", at: [25, 30], ext }] }]);
  assert.deepEqual(constraintsOn(map, "body", bodyRef(ext)).map((c) => c.id), ["k1"]);
  assert.deepEqual(constraintsOn(map, "F1", "e_001.p1").map((c) => c.id), ["k1"]);
  assert.equal(brokenConstraints(map).length, 0);
  const lost = buildMap([{ key: "F1", entities: [poly("e_001", [[0, 0], [10, 0], [10, 10]])], constraints: [{ id: "k1", type: "anchor", p: "e_001.p1", at: [25, 30], ext: { ...ext, lost: true } }] }]);
  assert.deepEqual(brokenConstraints(lost).map((c) => c.id), ["k1"]);
});

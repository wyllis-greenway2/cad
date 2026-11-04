// Prototype tests: operation graph -> OCCT, checked against closed-form volumes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadOC } from "../src/oc.mjs";
import { EdgeFinder } from "replicad";
import { compile, finalSolid, volume, selectEdges } from "../src/interpreter.mjs";

await loadOC();
const load = () => JSON.parse(readFileSync(new URL("../graphs/bracket.json", import.meta.url), "utf8"));
const expected = ({ w, d, h, hole_d, r }) => (w * d - (4 - Math.PI) * r * r - Math.PI * (hole_d / 2) ** 2) * h;
const close = (a, b, rel = 1e-6) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} vs ${b}`);

test("bracket graph matches the closed-form volume", () => {
  const g = load();
  const res = compile(g);
  assert.equal([...res.values()].filter((r) => r.error).length, 0);
  close(volume(finalSolid(g, res).shape), expected(g.params));
});

test("changing named parameters rebuilds correctly, no other edit needed", () => {
  const g = load();
  Object.assign(g.params, { w: 80, d: 45, h: 35, r: 5, hole_d: 10 });
  const res = compile(g);
  assert.equal([...res.values()].filter((r) => r.error).length, 0);
  close(volume(finalSolid(g, res).shape), expected(g.params));
});

test("a failing op is local: later ops report upstream failure, earlier ops survive", () => {
  const g = load();
  g.params.r = 40; // fillet radius larger than the part allows
  const res = compile(g);
  assert.ok(res.get("op_004").error, "fillet should fail");
  assert.ok(!res.get("op_003").error, "hole still built");
  assert.equal(finalSolid(g, res).id, "op_003");
});

// Measures how fragile "edge #N" references are compared with query references.
// Observed on OCCT 7.x via replicad: appending features usually keeps the index order
// (1-2 of 15 indices change), but an edit that cuts into existing boundary edges shifts about half.
function edgeCenters(shape) {
  return new EdgeFinder().find(shape).map((e) => e.boundingBox.center.map((v) => v.toFixed(1)).join(","));
}
function withEdit(edit) {
  const g = load();
  g.ops = g.ops.slice(0, 3);
  edit(g);
  return finalSolid(g, compile(g)).shape;
}
const insertCut = (x, y, w, d) => (g) => {
  g.ops.splice(
    2,
    0,
    { id: "p1", type: "sketch", shape: "rect", w, d, at: [x, y], plane: "XY", origin: 5 },
    { id: "p2", type: "extrude", profile: "p1", distance: 30, target: "op_002", mode: "cut" },
  );
  g.ops.find((o) => o.id === "op_003").target = "p2";
};

test("index references shift after boundary-cutting edits; the outer-corner query keeps its 4 corners", () => {
  const ref = edgeCenters(withEdit(() => {}));
  const notched = withEdit(insertCut(25, 0, 12, 8)); // notch through the side wall
  const now = edgeCenters(notched);
  let moved = 0;
  for (let i = 0; i < ref.length; i++) if (ref[i] !== now[i]) moved++;
  console.log(`# index refs: ${moved} of ${ref.length} edge indices changed after a side notch`);
  assert.ok(moved >= 5, "expected index-based references to be badly disturbed");
  const q = selectEdges(notched, { direction: "Z", within: "outer" });
  assert.equal(q.length, 4, "the geometric query still resolves to the four outer corners");
});

test("a corner notch exposes the limit of geometric queries (a 5 mm stub of the corner edge still matches)", () => {
  const s = withEdit(insertCut(25, 15, 10, 10)); // cuts the (25,15) corner from z=5 upward
  const q = selectEdges(s, { direction: "Z", within: "outer" });
  const heights = q.map((e) => +(e.boundingBox.bounds[1][2] - e.boundingBox.bounds[0][2]).toFixed(1)).sort((a, b) => a - b);
  console.log(`# corner notch: query matched ${q.length} edges with heights ${heights.join(", ")}`);
  assert.deepEqual(heights, [5, 20, 20, 20], "one match is the surviving 5 mm remnant, not the whole corner edge");
});

test("an op whose result OCCT flags invalid is treated as failed, not passed downstream", () => {
  // Filleting every edge of a 20 mm cube with r=11 makes OCCT return a non-empty but invalid solid (volume > the cube).
  const g = {
    params: { s: 20, r: 11 },
    ops: [
      { id: "a", type: "sketch", shape: "rect", w: "$s", d: "$s" },
      { id: "b", type: "extrude", profile: "a", distance: "$s" },
      { id: "c", type: "fillet", target: "b", radius: "$r", edges: { all: true } },
    ],
  };
  const res = compile(g);
  assert.ok(!res.get("b").error);
  assert.match(res.get("c").error, /invalid solid|Could not|fillet/i);
  assert.equal(finalSolid(g, res).id, "b");
});

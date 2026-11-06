import test from "node:test";
import assert from "node:assert/strict";
import { solve } from "../src/compiler/solver/solver.mjs";

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

test("a rectangle: horizontal, vertical, a width and a height, anchored at a corner", () => {
  const sys = { points: { a: [0, 0], b: [38, 1], c: [39, 19], d: [1, 18] }, scalars: {} };
  const cons = [
    { id: "h1", type: "horizontal", a: "a", b: "b" }, { id: "v1", type: "vertical", a: "b", b: "c" },
    { id: "h2", type: "horizontal", a: "d", b: "c" }, { id: "v2", type: "vertical", a: "a", b: "d" },
    { id: "w", type: "hdist", a: "a", b: "b", d: 40 }, { id: "ht", type: "vdist", a: "b", b: "c", d: 20 },
    { id: "fx", type: "fixed", p: "a", at: [0, 0] },
  ];
  const r = solve(sys, cons);
  assert.equal(r.status, "ok");
  assert.equal(r.dof, 0); // fully constrained
  assert.deepEqual(r.redundant, []);
  [["a", [0, 0]], ["b", [40, 0]], ["c", [40, 20]], ["d", [0, 20]]].forEach(([id, p]) => { near(r.points[id][0], p[0]); near(r.points[id][1], p[1]); });
});

test("without an anchor the whole sketch can still slide and turn: the free directions are counted", () => {
  const sys = { points: { a: [0, 0], b: [10, 1] }, scalars: {} };
  const r = solve(sys, [{ id: "d", type: "distance", a: "a", b: "b", d: 10 }]);
  assert.equal(r.status, "ok");
  assert.equal(r.dof, 3); // 4 numbers, 1 constraint
  near(dist(r.points.a, r.points.b), 10);
});

test("an equilateral triangle from three equal lengths, nearest to where it was", () => {
  const sys = { points: { a: [0, 0], b: [10, 0], c: [5, 7] }, scalars: {} };
  const cons = [
    { id: "f", type: "fixed", p: "a", at: [0, 0] }, { id: "h", type: "horizontal", a: "a", b: "b" }, { id: "d", type: "distance", a: "a", b: "b", d: 10 },
    { id: "e1", type: "equalLength", a: "a", b: "b", c: "b", d: "c" }, { id: "e2", type: "equalLength", a: "a", b: "b", c: "a", d: "c" },
  ];
  const r = solve(sys, cons);
  assert.equal(r.status, "ok");
  near(r.points.c[0], 5, 1e-5);
  near(r.points.c[1], 10 * Math.sqrt(3) / 2, 1e-5); // stayed on the side it started on
  assert.equal(r.dof, 0);
});

test("parallel and perpendicular", () => {
  const sys = { points: { a: [0, 0], b: [10, 0], c: [0, 5], d: [9, 9] }, scalars: {} };
  const r = solve(sys, [{ id: "p", type: "parallel", a: "a", b: "b", c: "c", d: "d" }, { id: "f1", type: "fixed", p: "a", at: [0, 0] }, { id: "f2", type: "fixed", p: "b", at: [10, 0] }, { id: "f3", type: "fixed", p: "c", at: [0, 5] }]);
  assert.equal(r.status, "ok");
  near(r.points.d[1], 5, 1e-6); // d slid to the line through c parallel to ab
  const r2 = solve(sys, [{ id: "q", type: "perpendicular", a: "a", b: "b", c: "c", d: "d" }, { id: "f1", type: "fixed", p: "a", at: [0, 0] }, { id: "f2", type: "fixed", p: "b", at: [10, 0] }, { id: "f3", type: "fixed", p: "c", at: [0, 5] }]);
  assert.equal(r2.status, "ok");
  near(r2.points.d[0], 0, 1e-6);
});

test("radii: a value and equal radii", () => {
  const sys = { points: {}, scalars: { r1: 3, r2: 8 } };
  const r = solve(sys, [{ id: "a", type: "radius", r: "r1", value: 5 }, { id: "b", type: "equalRadius", r: "r1", s: "r2" }]);
  assert.equal(r.status, "ok");
  near(r.scalars.r1, 5);
  near(r.scalars.r2, 5);
});

test("a conflict is reported, with the constraints that cause it, and the sketch is left as it was", () => {
  const sys = { points: { a: [0, 0], b: [10, 0] }, scalars: {} };
  const cons = [{ id: "f1", type: "fixed", p: "a", at: [0, 0] }, { id: "f2", type: "fixed", p: "b", at: [10, 0] }, { id: "d", type: "distance", a: "a", b: "b", d: 25 }];
  const r = solve(sys, cons);
  assert.equal(r.status, "conflict");
  assert.deepEqual([...r.conflicts].sort(), ["d", "f1", "f2"]);
  assert.deepEqual(r.points.b, [10, 0]);
});

test("a redundant constraint (satisfied but adding nothing) is named", () => {
  const sys = { points: { a: [0, 0], b: [10, 0] }, scalars: {} };
  const r = solve(sys, [{ id: "f", type: "fixed", p: "a", at: [0, 0] }, { id: "h", type: "horizontal", a: "a", b: "b" }, { id: "h2", type: "horizontal", a: "b", b: "a" }]);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.redundant, ["h2"]);
  assert.equal(r.dof, 1); // b can still slide along the line
});

test("a soft preference (dragging) loses to hard constraints but is followed where free", () => {
  const sys = { points: { a: [0, 0], b: [10, 0] }, scalars: {} };
  const hard = [{ id: "f", type: "fixed", p: "a", at: [0, 0] }, { id: "h", type: "horizontal", a: "a", b: "b" }];
  const r = solve(sys, [...hard, { id: "drag", type: "fixed", p: "b", at: [25, 7], w: 0.1 }]);
  assert.equal(r.status, "ok");
  near(r.points.b[1], 0, 1e-6); // the horizontal constraint won
  near(r.points.b[0], 25, 1e-3); // along the free direction it followed the mouse
});

test("angle: two lines from a shared corner at a set angle (signed), nearest to where they were", () => {
  const sys = { points: { o: [0, 0], a: [10, 0], b: [4, 7] }, scalars: {} };
  const hold = [{ id: "f", type: "fixed", p: "o", at: [0, 0] }, { id: "g", type: "fixed", p: "a", at: [10, 0] }];
  const r = solve(sys, [...hold, { id: "ang", type: "angle", a: "o", b: "a", c: "o", d: "b", value: Math.PI / 3 }]);
  assert.equal(r.status, "ok");
  near(Math.atan2(r.points.b[1], r.points.b[0]), Math.PI / 3, 1e-6); // 60 degrees above the first line
  assert.ok(r.points.b[1] > 0);
  const neg = solve(sys, [...hold, { id: "ang", type: "angle", a: "o", b: "a", c: "o", d: "b", value: -Math.PI / 3 }]);
  assert.ok(neg.points.b[1] < 0); // a negative angle puts it on the other side
});

test("independent groups are solved apart and the result is the same as one big solve: positions, and the free directions count what no constraint touches", () => {
  const sys = { points: { a: [0, 0], b: [3, 0], c: [10, 10], d: [14, 10], e: [50, 50] } };
  const cons = [{ id: "d1", type: "distance", a: "a", b: "b", d: 5 }, { id: "d2", type: "distance", a: "c", b: "d", d: 6 }];
  const r = solve(sys, cons);
  assert.equal(r.status, "ok");
  assert.ok(Math.abs(Math.hypot(r.points.b[0] - r.points.a[0], r.points.b[1] - r.points.a[1]) - 5) < 1e-6);
  assert.ok(Math.abs(Math.hypot(r.points.d[0] - r.points.c[0], r.points.d[1] - r.points.c[1]) - 6) < 1e-6);
  assert.deepEqual(r.points.e, [50, 50], "a point nothing touches stays");
  assert.equal(r.dof, 10 - 2, "ten numbers, two distances");
  const bad = solve(sys, [...cons, { id: "d3", type: "distance", a: "a", b: "b", d: 7 }]);
  assert.equal(bad.status, "conflict");
  assert.ok(bad.conflicts.length >= 1);
});

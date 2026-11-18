// The machine of the path repeat (`dec_path_repeat`): paths, the offset, the rules.
import test from "node:test";
import assert from "node:assert/strict";
import { pathOf, circlePath, lengthOf, pointAt, cornersOf, offsetPath, placeAlong, pathProblem, lifted } from "../src/operation/pathrepeat.ts";
import type { Path, Pt } from "../src/operation/pathrepeat.ts";

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} against ${b}`);
const nearPt = (a: Pt, b: Pt, tol = 1e-6) => { near(a[0], b[0], tol); near(a[1], b[1], tol); };
const line = (l: number): Path => pathOf([[0, 0], [l, 0]]);
const rect = (w: number, h: number): Path => pathOf([[0, 0], [w, 0], [w, h], [0, h]], true); // (counter-clockwise: its left is the inside)
const ss = (r: ReturnType<typeof placeAlong>): number[] => { assert.ok(r.ok, r.ok ? "" : r.error); return r.value.frames.map((f) => Math.round(f.s * 1e6) / 1e6); };

test("lengths: a line, a rectangle's outline, a circle (two half circles), a quarter arc", () => {
  near(lengthOf(line(100)), 100);
  near(lengthOf(rect(100, 60)), 320);
  near(lengthOf(circlePath([0, 0], 10)), 2 * Math.PI * 10);
  near(lengthOf(pathOf([[0, 0], [10, 10]], false, [-Math.tan(Math.PI / 8) / 2])), (Math.PI / 2) * 10, 1e-9); // (a quarter of a circle of radius 10, counter-clockwise: the bulge is -tan(angle / 4) / 2)
});
test("points along a line and a rectangle: the point, the way it runs, the way across (to the left)", () => {
  const a = pointAt(line(100), 30);
  nearPt(a.at, [30, 0]); nearPt(a.along, [1, 0]); nearPt(a.across, [0, 1]);
  const b = pointAt(rect(100, 60), 130);
  nearPt(b.at, [100, 30]); nearPt(b.along, [0, 1]); nearPt(b.across, [-1, 0]);
  nearPt(pointAt(rect(100, 60), 330).at, [10, 0], 1e-6); // (round a closed path)
  nearPt(pointAt(line(100), 500).at, [100, 0]); // (held to the end of an open one)
});
test("on a circle the copies stand on it, the way they run is square to the radius, counter-clockwise", () => {
  const c = circlePath([5, 5], 10);
  const f = pointAt(c, (Math.PI * 10) / 2); // (a quarter of the way round: the top)
  nearPt(f.at, [5, 15], 1e-6); nearPt(f.along, [-1, 0], 1e-6); nearPt(f.across, [0, -1], 1e-6);
});
test("corners: a line has its two ends; a rectangle its four; a circle none", () => {
  assert.deepEqual(cornersOf(line(100)), [0, 100]);
  assert.deepEqual(cornersOf(rect(100, 60)).map(Math.round), [0, 100, 160, 260]);
  assert.deepEqual(cornersOf(circlePath([0, 0], 10)), []);
});
test("an offset to the left of a counter-clockwise rectangle is the rectangle drawn in", () => {
  const r = offsetPath(rect(100, 60), 10);
  assert.ok(r.ok);
  const pts = r.value.segs.map((s) => s.a);
  nearPt(pts[0]!, [10, 10]); nearPt(pts[1]!, [90, 10]); nearPt(pts[2]!, [90, 50]); nearPt(pts[3]!, [10, 50]);
  const out = offsetPath(rect(100, 60), -10);
  assert.ok(out.ok);
  nearPt(out.value.segs[0]!.a, [-10, -10]);
});
test("an offset that is too much is refused with the reason", () => {
  const r = offsetPath(rect(100, 60), 35);
  assert.ok(!r.ok && r.error.includes("inside out"), r.ok ? "" : r.error);
  const c = offsetPath(circlePath([0, 0], 10), 12); // (the left of a counter-clockwise circle is inside it)
  assert.ok(!c.ok && c.error.includes("round"));
  assert.ok(!offsetPath(line(10), NaN).ok);
});
test("the offset of a circle is a circle of the radius changed, and of a line is a line moved sideways", () => {
  const c = offsetPath(circlePath([0, 0], 10), 3);
  assert.ok(c.ok);
  near(lengthOf(c.value), 2 * Math.PI * 7, 1e-6);
  const l = offsetPath(line(50), -4);
  assert.ok(l.ok);
  nearPt(l.value.segs[0]!.a, [0, -4]);
});
test("a rounded corner: an offset of a line and a quarter arc that meet smoothly keeps them joined", () => {
  const p = pathOf([[0, 0], [20, 0], [30, 10]], false, [0, -0.2071067811865476]); // (a line, then a quarter circle turning left)
  assert.equal(pathProblem(p), null);
  const r = offsetPath(p, 2);
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(lengthOf(r.value), 20 + (Math.PI / 2) * 8, 0.05); // (the quarter arc, radius 10, turns left: moving left makes it radius 8)
});
test("distance, no corner rule: the remainder at the end, the spacing fitted to the end, or the copies centred", () => {
  assert.deepEqual(ss(placeAlong(line(100), { spacing: { by: "distance", distance: 25 }, ends: "remainder" })), [0, 25, 50, 75, 100]);
  assert.deepEqual(ss(placeAlong(line(100), { spacing: { by: "distance", distance: 30 }, ends: "remainder" })), [0, 30, 60, 90]);
  const fit = placeAlong(line(100), { spacing: { by: "distance", distance: 30 } });
  assert.deepEqual(ss(fit), [0, 33.333333, 66.666667, 100]);
  assert.ok(fit.ok); near(fit.value.spacing!, 100 / 3);
  assert.deepEqual(ss(placeAlong(line(100), { spacing: { by: "distance", distance: 30 }, ends: "centre" })), [5, 35, 65, 95]);
});
test("a count equally divided: both ends and the points between, one copy in the middle, round a closed path", () => {
  assert.deepEqual(ss(placeAlong(line(100), { spacing: { by: "count", count: 5 } })), [0, 25, 50, 75, 100]);
  assert.deepEqual(ss(placeAlong(line(100), { spacing: { by: "count", count: 1 } })), [50]);
  assert.deepEqual(ss(placeAlong(rect(100, 60), { spacing: { by: "count", count: 8 } })), [0, 40, 80, 120, 160, 200, 240, 280]);
  const six = placeAlong(circlePath([0, 0], 10), { spacing: { by: "count", count: 6 } });
  assert.ok(six.ok);
  for (const f of six.value.frames) near(Math.hypot(f.at[0], f.at[1]), 10, 1e-6);
  near(Math.atan2(six.value.frames[1]!.at[1], six.value.frames[1]!.at[0]), Math.PI / 3, 1e-6);
});
test("insets: the first and last copy stand away from the ends of an open path", () => {
  assert.deepEqual(ss(placeAlong(line(100), { spacing: { by: "count", count: 3 }, startInset: 10, endInset: 10 })), [10, 50, 90]);
  assert.deepEqual(ss(placeAlong(line(100), { spacing: { by: "distance", distance: 20 }, startInset: 10, endInset: 10, ends: "remainder" })), [10, 30, 50, 70, 90]);
  assert.ok(!placeAlong(line(100), { spacing: { by: "count", count: 2 }, startInset: 60, endInset: 60 }).ok);
});
test("the offset first: copies stand on the path moved in, 10 mm in from a block's edge", () => {
  const r = placeAlong(rect(100, 60), { spacing: { by: "count", count: 4 }, offset: 10 });
  assert.ok(r.ok);
  for (const f of r.value.frames) assert.ok(f.at[0] >= 10 - 1e-9 && f.at[0] <= 90 + 1e-9 && f.at[1] >= 10 - 1e-9 && f.at[1] <= 50 + 1e-9);
  nearPt(r.value.frames[0]!.at, [10, 10]);
  near(lengthOf(r.value.path), 240);
});
test("corners each: a copy at every corner and each side divided so the spacing is never more than asked", () => {
  const r = placeAlong(rect(100, 60), { spacing: { by: "distance", distance: 30 }, corners: "each" });
  assert.ok(r.ok);
  assert.equal(r.value.frames.length, 12); // 4 corners, 3 between on each long side, 1 on each short side
  assert.equal(r.value.frames.filter((f) => f.corner).length, 4);
  assert.deepEqual(r.value.frames.map((f) => Math.round(f.s)), [0, 25, 50, 75, 100, 130, 160, 185, 210, 235, 260, 290]); // (a long side of 100 in four of 25; a short one of 60 in two of 30)
  near(r.value.spacing!, 25);
  const big = placeAlong(rect(100, 60), { spacing: { by: "distance", distance: 500 }, corners: "each" });
  assert.ok(big.ok);
  assert.equal(big.value.frames.length, 4, "a spacing bigger than a side leaves just the corners");
});
test("corners inward: copies at the corners and the distance asked in from each, the rest left in the middle of the side", () => {
  const r = placeAlong(rect(100, 60), { spacing: { by: "distance", distance: 30 }, corners: "inward" });
  assert.ok(r.ok);
  const onBottom = r.value.frames.filter((f) => Math.abs(f.at[1]) < 1e-9).map((f) => Math.round(f.at[0]));
  assert.deepEqual(onBottom, [0, 30, 70, 100]);
  const left = r.value.frames.filter((f) => Math.abs(f.at[0]) < 1e-9).map((f) => Math.round(f.at[1])).sort((a, b) => a - b);
  assert.deepEqual(left, [0, 30, 60]);
  assert.equal(r.value.frames.filter((f) => f.corner).length, 4);
});
test("corners on an open chain: its two ends and the joints between are the corners", () => {
  const p = pathOf([[0, 0], [60, 0], [60, 40]]);
  const r = placeAlong(p, { spacing: { by: "distance", distance: 20 }, corners: "each" });
  assert.ok(r.ok);
  assert.deepEqual(r.value.frames.map((f) => [Math.round(f.at[0]), Math.round(f.at[1])]), [[0, 0], [20, 0], [40, 0], [60, 0], [60, 20], [60, 40]]);
  assert.equal(r.value.frames.filter((f) => f.corner).length, 3);
});
test("a corner rule on a path with no corner (a circle) divides it evenly by the distance", () => {
  const r = placeAlong(circlePath([0, 0], 10), { spacing: { by: "distance", distance: 10 }, corners: "each" });
  assert.ok(r.ok);
  assert.equal(r.value.frames.length, 6); // 62.8 / 10 rounded
});
test("bad numbers are refused with a reason", () => {
  assert.ok(!placeAlong(line(100), { spacing: { by: "distance", distance: 0 } }).ok);
  assert.ok(!placeAlong(line(100), { spacing: { by: "count", count: 0 } }).ok);
  assert.ok(!placeAlong(line(100), { spacing: { by: "count", count: 2.5 } }).ok);
  assert.ok(!placeAlong(line(100), { spacing: { by: "distance", distance: NaN } }).ok);
  const e = placeAlong(rect(100, 60), { spacing: { by: "count", count: 3 }, corners: "each" });
  assert.ok(!e.ok && e.error.includes("distance"));
  assert.ok(!placeAlong({ segs: [{ a: [0, 0], b: [10, 0], bulge: 0 }, { a: [11, 0], b: [20, 0], bulge: 0 }], closed: false }, { spacing: { by: "count", count: 2 } }).ok, "sides that do not meet");
  assert.ok(!placeAlong({ segs: [], closed: false }, { spacing: { by: "count", count: 2 } }).ok);
});
test("a frame lifted onto a plane in space carries the point and the two ways", () => {
  const f = placeAlong(line(10), { spacing: { by: "count", count: 2 } });
  assert.ok(f.ok);
  const l = lifted(f.value.frames[1]!, { origin: [5, 5, 5], u: [0, 1, 0], v: [0, 0, 1] });
  assert.deepEqual(l.at.map((x) => Math.round(x * 1e6) / 1e6), [5, 15, 5]);
  assert.deepEqual(l.along.map((x) => Math.round(x * 1e6) / 1e6), [0, 1, 0]);
  assert.deepEqual(l.across.map((x) => Math.round(x * 1e6) / 1e6), [0, 0, 1]);
});

// ---- walking the row along the path (`in_887`) ----
test("a shift walks the whole row along an open line: the places move together, and those that go past an end are left out", () => {
  const base = placeAlong(line(100), { spacing: { by: "distance", distance: 20 }, ends: "remainder" });
  assert.deepEqual(ss(base), [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(ss(placeAlong(line(100), { spacing: { by: "distance", distance: 20 }, ends: "remainder", shift: 7 })), [7, 27, 47, 67, 87]);
  assert.deepEqual(ss(placeAlong(line(100), { spacing: { by: "distance", distance: 20 }, ends: "remainder", shift: -7 })), [13, 33, 53, 73, 93]);
  assert.ok(!placeAlong(line(100), { spacing: { by: "count", count: 2 }, shift: 500 }).ok);
  assert.ok(!placeAlong(line(100), { spacing: { by: "count", count: 2 }, shift: NaN }).ok);
});
test("on a closed loop a shift turns the places round it, none is lost, and the spacing stays", () => {
  const closed = placeAlong(rect(100, 60), { spacing: { by: "count", count: 8 }, shift: 10 });
  assert.ok(closed.ok);
  assert.deepEqual(closed.value.frames.map((f) => Math.round(f.s)), [10, 50, 90, 130, 170, 210, 250, 290]);
  const round = placeAlong(rect(100, 60), { spacing: { by: "count", count: 8 }, shift: 315 });
  assert.ok(round.ok);
  assert.deepEqual(round.value.frames.map((f) => Math.round(f.s)), [315, 35, 75, 115, 155, 195, 235, 275]);
  assert.equal(round.value.frames.length, 8);
  // a circle: the first place moves round by the angle of the shift
  const c = placeAlong(circlePath([0, 0], 10), { spacing: { by: "count", count: 4 }, shift: (Math.PI * 10) / 2 });
  assert.ok(c.ok);
  nearPt(c.value.frames[0]!.at, [0, 10], 1e-6);
});
test("the shift is one of the numbers a repeat keeps, and a record made before it reads as no shift", async () => {
  const { numbersOf, rulesFrom, PATH_NUMBERS } = await import("../src/operation/pathrepeat.ts");
  assert.equal(PATH_NUMBERS, 10);
  const n = numbersOf({ rules: { spacing: { by: "distance", distance: 20 }, ends: "fit", corners: "each", offset: 3, shift: 4 }, turn: true, reverse: false });
  assert.equal(n.length, 10);
  assert.equal(n[9], 4);
  const back = rulesFrom(n);
  assert.ok(back.ok && back.value.rules.shift === 4);
  const old = rulesFrom(n.slice(0, 9));
  assert.ok(old.ok && old.value.rules.shift === 0);
});

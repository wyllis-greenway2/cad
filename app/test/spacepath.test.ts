// A path in space (`dec_path_repeat`, `in_1301`): lines on different planes, a closed square, a curved edge, joined end to end.
import test from "node:test";
import assert from "node:assert/strict";
import type { Part } from "../src/operation/part.ts";
import { spacePlaces, readSpacePath } from "../src/operation/spacepath.ts";
import { numbersOf } from "../src/operation/pathrepeat.ts";
import type { Rules } from "../src/operation/pathrepeat.ts";
import { bodyPlaces } from "../src/operation/pathmaps.ts";
import { emptyScene } from "../src/operation/scene.ts";

const corner = (ref: string, at: [number, number, number]): Part => ({ kind: "corner", ref, origin: "body", plane: null, movable: false, at }) as unknown as Part;
const line = (ref: string, a: string, b: string, extra: object = {}): Part => ({ kind: "line", ref, origin: "body", plane: null, movable: false, a, b, ...extra }) as unknown as Part;
const world = (parts: Part[]) => { const m = new Map<string, Part>(parts.map((p) => [p.ref as unknown as string, p])); return (r: unknown) => m.get(r as string); };
const nums = (rules: Rules, turn = false) => numbersOf({ rules, turn, reverse: false });
const near = (a: number, b: number, t = 1e-6) => assert.ok(Math.abs(a - b) <= t, `${a} against ${b}`);

// four edges of a 10 mm square in the plane x = 0, then a straight leg up the z axis (all in space, none on a drawn plane)
const square = [corner("c1", [0, 0, 0]), corner("c2", [0, 10, 0]), corner("c3", [0, 10, 10]), corner("c4", [0, 0, 10]), line("l1", "c1", "c2"), line("l2", "c2", "c3"), line("l3", "c3", "c4"), line("l4", "c4", "c1")];

test("four touching lines in space are one closed path; the copies stand equally round it", () => {
  const get = world(square);
  const r = readSpacePath(get, ["l1", "l3", "l2", "l4"] as never);
  assert.ok(r.ok && r.value.closed);
  near(r.ok ? r.value.total : 0, 40);
  const p = spacePlaces(get, { path: ["l1", "l2", "l3", "l4"] as never, params: nums({ spacing: { by: "count", count: 8 } }) });
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.equal(p.value.count, 8);
  near(p.value.places[0]!.move[1], 5); // (5 mm round: the first copy is 5 along the first side)
  near(p.value.places[1]!.move[1], 10);
  near(p.value.places[1]!.move[2], 0);
  near(p.value.places[2]!.move[2], 5); // (round the corner and 5 up)
});

test("a copy at every corner and the sides between divided", () => {
  const p = spacePlaces(world(square), { path: ["l1", "l2", "l3", "l4"] as never, params: nums({ spacing: { by: "distance", distance: 5 }, corners: "each" }) });
  assert.ok(p.ok);
  assert.equal(p.ok ? p.value.count : 0, 8);
  const ends = p.ok ? p.value.places.map((x) => x.move.join(",")) : [];
  assert.ok(ends.includes("0,10,10"), ends.join(" | ")); // (the far corner is a place)
});

test("copies turn with the path in space, by the shortest turn", () => {
  const p = spacePlaces(world(square), { path: ["l1", "l2", "l3", "l4"] as never, params: nums({ spacing: { by: "count", count: 8 }, corners: "ignore" }, true) });
  assert.ok(p.ok);
  if (!p.ok) return;
  const quarter = p.value.places[2]!; // (15 mm on from the start: past the corner the way has turned from +y to +z, a quarter turn about x)
  assert.ok(quarter.turn);
  near(Math.abs(quarter.turn!.angle), 90);
  near(Math.abs(quarter.turn!.dir[0]), 1);
});

test("a curved edge in space is followed by its length; an offset is refused", () => {
  const curved = [corner("a", [0, 0, 0]), corner("b", [10, 0, 10]), line("e", "a", "b", { path: [[0, 0, 0] as never, [5, 5, 2], [10, 0, 10]] })];
  const get = world(curved);
  const len = Math.hypot(5, 5, 2) + Math.hypot(5, 5, 8);
  const r = readSpacePath(get, ["e"] as never);
  near(r.ok ? r.value.total : 0, len);
  const p = spacePlaces(get, { path: ["e"] as never, params: nums({ spacing: { by: "count", count: 3 } }) });
  assert.ok(p.ok);
  if (p.ok) { assert.equal(p.value.count, 3); near(p.value.places[1]!.move[0], 10); near(p.value.places[1]!.move[2], 10); }
  const off = spacePlaces(get, { path: ["e"] as never, params: nums({ spacing: { by: "count", count: 3 }, offset: 2 }) });
  assert.ok(!off.ok);
});

test("lines that do not join, or branch, are refused with the reason", () => {
  const get = world([...square, corner("x", [50, 50, 50]), corner("y", [60, 50, 50]), line("far", "x", "y")]);
  const apart = readSpacePath(get, ["l1", "far"] as never);
  assert.ok(!apart.ok);
  const branch = readSpacePath(world([corner("o", [0, 0, 0]), corner("p", [1, 0, 0]), corner("q", [0, 1, 0]), corner("r", [0, 0, 1]), line("a", "o", "p"), line("b", "o", "q"), line("c", "o", "r")]), ["a", "b", "c"] as never);
  assert.ok(!branch.ok && /branch/.test(branch.error));
});

test("bodyPlaces reaches a path in space when the lines are not on one plane", () => {
  const s = { ...emptyScene(), parts: Object.fromEntries(square.map((p) => [p.ref as unknown as string, p])) };
  const r = bodyPlaces(s as never, { path: ["l1", "l2", "l3", "l4"] as never, params: nums({ spacing: { by: "count", count: 4 } }) });
  assert.ok(r.ok, r.ok ? "" : r.error);
});

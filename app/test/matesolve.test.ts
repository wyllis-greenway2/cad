// The standing mates solved together (`in_329`).
import test from "node:test";
import assert from "node:assert/strict";
import { solvePoses, freeBodies } from "../src/operation/matesolve.ts";
import type { SolveMate, SolveBody } from "../src/operation/matesolve.ts";

const body = (id: string, order = 0): SolveBody => ({ id, pivot: [0, 0, 0], order });
const mate = (id: string, mode: SolveMate["mode"], mover: string, other: string, a: [number[], number[]], b: [number[], number[]], gap = 0): SolveMate =>
  ({ id, mode, gap, counts: true, mover, other, a: { point: a[0] as never, dir: a[1] as never }, b: { point: b[0] as never, dir: b[1] as never } });

test("two mates on one body are solved together: it ends where both hold, moved by no more than it has to (`in_329`)", () => {
  const mates = [
    mate("r1", "flush", "B", "A", [[3, 1, 0], [-1, 0, 0]], [[10, 0, 0], [1, 0, 0]]),
    mate("r2", "flush", "B", "P", [[4, -2, 0], [0, -1, 0]], [[0, 5, 0], [0, 1, 0]]),
  ];
  const s = solvePoses(mates, [body("A"), body("B"), body("P")]);
  assert.ok(s.ok, `at odds: ${s.atOdds}`);
  const p = s.poses.get("B")!;
  assert.ok(Math.abs(p.shift[0] - 7) < 1e-6 && Math.abs(p.shift[1] - 7) < 1e-6 && Math.abs(p.shift[2]) < 1e-6, `moved by the two distances: ${p.shift}`);
  assert.ok(Math.hypot(...p.turn) < 1e-6, "not turned");
  assert.ok(!s.poses.has("A") && !s.poses.has("P"), "what is only mated to stays");
});

test("a mate that leaves freedom leaves the body where it is in that freedom: a coaxial mate off by a sideways step is only moved sideways (`in_329`)", () => {
  const s = solvePoses([mate("c", "coaxial", "B", "A", [[3, 0, 5], [0, 0, 1]], [[0, 0, 0], [0, 0, 1]])], [body("A"), body("B")]);
  assert.ok(s.ok);
  const p = s.poses.get("B")!;
  assert.ok(Math.abs(p.shift[0] + 3) < 1e-6 && Math.abs(p.shift[1]) < 1e-4 && Math.abs(p.shift[2]) < 1e-4, `sideways only, not along the axis: ${p.shift}`);
});

test("mates that cannot all hold are said: a coaxial mate and a 120 degree angle between the same two directions (`in_329`)", () => {
  const mates = [
    mate("c", "coaxial", "B", "A", [[0, 0, 0], [0, 0, 1]], [[0, 0, 0], [0, 0, 1]]),
    mate("g", "angle", "B", "A", [[0, 0, 6], [0, 0, 1]], [[0, 0, 6], [0, 0, 1]], 120),
  ];
  const s = solvePoses(mates, [body("A"), body("B")]);
  assert.ok(!s.ok, "no pose makes both true");
  assert.ok(s.atOdds.length >= 1);
});

test("of bodies that only move each other, the one made first stays (`in_329`)", () => {
  const mates = [mate("m1", "flush", "A", "B", [[0, 0, 0], [1, 0, 0]], [[1, 0, 0], [-1, 0, 0]]), mate("m2", "flush", "B", "A", [[1, 0, 0], [-1, 0, 0]], [[0, 0, 0], [1, 0, 0]])];
  const free = freeBodies(mates, [body("A", 1), body("B", 2)]);
  assert.deepEqual([...free], ["B"], "A, made first, is the ground");
  assert.deepEqual([...freeBodies([mates[0]!], [body("A", 1), body("B", 2)])], ["A"], "a body that is only mated to is not free");
});

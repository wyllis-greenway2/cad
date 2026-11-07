import test from "node:test";
import assert from "node:assert/strict";
import { worldRef, bodyRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { newHistory, exec, undo } from "../src/operation/history.ts";
import type { History } from "../src/operation/history.ts";
import { drawChain, drawRectangle } from "../src/operation/build.ts";
import { lookup } from "../src/operation/scene.ts";
import { pointOf } from "../src/operation/part.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { solveScene } from "../src/compiler/solve.ts";

const XY = worldRef("XY");
const must = (r: ReturnType<typeof exec>): History => {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.value;
};
const near = (a: number, b: number, tol = 1e-5) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const at = (h: History, r: Ref): Vec3 => pointOf(lookup(h.scene), r)!;
/** Run the action `id` for the selection and then solve, as the app will. */
function relate(h: History, sel: Ref[], id: string, value?: number): History {
  const a = actionsFor(h.scene, sel).find((x) => x.id === id); // (the parts are listed mover first; the one selected first is the mover, `in_229`)
  assert.ok(a && a.enabled, `${id} is not available`);
  let n = must(exec(h, a.run(value)));
  const out = solveScene(n.scene);
  if (out.moves.length) n = must(exec(n, { type: "batch", commands: out.moves }));
  return n;
}
const chainFirst = (h: History, line: Ref): Ref => (h.scene.parts[line] as { a: Ref }).a;
const chain = (h: History, pts: Vec3[], plane = XY, closed = false) => {
  const d = drawChain(h.scene, plane, pts, closed);
  return { h: must(exec(h, d.command)), ...d };
};

test("horizontal makes a slanted line level and moves the corners the least", () => {
  const { h: h0, lines, corners } = chain(newHistory(), [[0, 0, 0], [10, 3, 0]]);
  const h = relate(h0, [lines[0]!], "horizontal");
  near(at(h, corners[0]!)[1], at(h, corners[1]!)[1]);
  near(at(h, corners[0]!)[1], 1.5);
});

test("the one picked last moves, the first stays: coincident of two drawn corners (listed mover first here)", () => {
  let { h, corners: a } = chain(newHistory(), [[0, 0, 0]]);
  const b = chain(h, [[7, 4, 0]]);
  h = relate(b.h, [a[0]!, b.corners[0]!], "coincident");
  near(at(h, a[0]!)[0], 7);
  near(at(h, a[0]!)[1], 4);
  assert.deepEqual(at(h, b.corners[0]!), [7, 4, 0], "the reference did not move");
});

test("a drawn corner goes to the world origin; the origin never moves", () => {
  const { h: h0, corners } = chain(newHistory(), [[5, 5, 0]]);
  const h = relate(h0, [worldRef("O"), corners[0]!], "coincident"); // picked first, but a reference always goes second
  near(at(h, corners[0]!)[0], 0);
  near(at(h, corners[0]!)[1], 0);
  assert.deepEqual(at(h, worldRef("O")), [0, 0, 0]);
});

test("a rectangle with typed width and height and one corner fixed is fully constrained", () => {
  const r = drawRectangle(newHistory().scene, XY, [0, 0, 0], [38, 19, 0], [1, 0, 0], [0, 1, 0]);
  let h = must(exec(newHistory(), r.command));
  for (const [i, kind] of [[0, "horizontal"], [1, "vertical"], [2, "horizontal"], [3, "vertical"]] as const) h = relate(h, [r.lines[i]!], kind);
  h = relate(h, [r.corners[0]!], "fixed");
  h = relate(h, [r.corners[0]!, r.corners[1]!], "distance", 40);
  h = relate(h, [r.corners[1]!, r.corners[2]!], "distance", 20);
  const out = solveScene(h.scene);
  assert.equal(out.planes[0]!.status, "ok");
  assert.equal(out.planes[0]!.dof, 0);
  assert.deepEqual(at(h, r.corners[2]!).map((x) => Math.round(x * 1e6) / 1e6), [40, 20, 0]);
});

test("a drawn line made parallel to a line of the body follows it (a body part is a fixed virtual part)", () => {
  let { h, lines } = chain(newHistory(), [[0, 0, 0], [10, 2, 0]]);
  // a body edge (a reference): from (0,0,0) to (10,10,0) in the world, as the kernel result will provide it
  const base = { origin: "body" as const, plane: null, movable: false };
  const ea = bodyRef("s_1", "a");
  const eb = bodyRef("s_1", "b");
  const edge = bodyRef("s_1", "edge");
  for (const part of [
    { ...base, ref: ea, kind: "corner" as const, at: [0, 0, 0] as Vec3 },
    { ...base, ref: eb, kind: "corner" as const, at: [10, 10, 0] as Vec3 },
    { ...base, ref: edge, kind: "line" as const, a: ea, b: eb },
  ]) h = must(exec(h, { type: "addPart", part }));
  h = relate(h, [lines[0]!, edge], "parallel");
  const l = h.scene.parts[lines[0]!]! as { a: Ref; b: Ref };
  const [p, q] = [at(h, l.a), at(h, l.b)];
  near((q[1] - p[1]) / (q[0] - p[0]), 1, 1e-4);
  assert.deepEqual(at(h, eb), [10, 10, 0]);
});

test("contradicting distances are a conflict: nothing moves and the relations are named", () => {
  const { h: h0, corners } = chain(newHistory(), [[0, 0, 0], [10, 0, 0]]);
  let h = relate(h0, [corners[0]!, corners[1]!], "distance", 10);
  const second = actionsFor(h.scene, [corners[0]!, corners[1]!]).find((x) => x.id === "distance")!.run(30);
  h = must(exec(h, second));
  const out = solveScene(h.scene);
  assert.equal(out.planes[0]!.status, "conflict");
  assert.equal(out.planes[0]!.conflicts.length, 2);
  assert.equal(out.moves.length, 0);
});

test("sketching on another plane: horizontal means along that plane's first axis", () => {
  const XZ = worldRef("XZ");
  const { h: h0, lines, corners } = chain(newHistory(), [[0, 0, 0], [10, 0, 4]], XZ);
  const h = relate(h0, [lines[0]!], "horizontal");
  near(at(h, corners[0]!)[2], at(h, corners[1]!)[2]);
  assert.equal(at(h, corners[0]!)[1], 0, "nothing moves out of the plane");
});

test("distance between parallel lines keeps its side; a corner to a line; an angle at a shared corner", () => {
  let { h, lines: la } = chain(newHistory(), [[0, 0, 0], [10, 0, 0]]);
  const b = chain(h, [[1, 3, 0], [11, 3, 0]]);
  h = relate(b.h, [la[0]!, b.lines[0]!], "distance", 5);
  assert.equal(Math.round(at(h, b.corners[0]!)[1] * 1e4) / 1e4, 3, "the second line is the reference and stays");
  assert.equal(Math.round(at(h, chainFirst(h, la[0]!))[1] * 1e4) / 1e4, -2, "the first line moves, and stays below the second, as it was");
  const c = chain(h, [[0, 20, 0], [10, 20, 0], [10, 28, 0]]);
  h = relate(c.h, c.lines, "angle", 60);
  const [v, p, q] = [at(h, c.corners[1]!), at(h, c.corners[0]!), at(h, c.corners[2]!)];
  const u: Vec3 = [p[0] - v[0], p[1] - v[1], 0];
  const w: Vec3 = [q[0] - v[0], q[1] - v[1], 0];
  const deg = (Math.acos((u[0] * w[0] + u[1] * w[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1]))) * 180) / Math.PI;
  near(deg, 60, 1e-3);
});

test("solved moves are ordinary commands: undo puts everything back", () => {
  const { h: h0, lines, corners } = chain(newHistory(), [[0, 0, 0], [10, 3, 0]]);
  const h = relate(h0, [lines[0]!], "horizontal");
  const back = undo(h);
  assert.deepEqual(at(back, corners[1]!), [10, 3, 0]);
  assert.equal(back.scene.relations.length, 1, "the relation stays; its solve was the undone step");
});

test("a relation with no part on a plane is reported, not solved", () => {
  let h = newHistory();
  h = must(exec(h, { type: "addRelation", relation: { id: "r_1", kind: "coincident", parts: [worldRef("O"), worldRef("O")] } }));
  assert.deepEqual(solveScene(h.scene).unplaced, ["r_1"]);
});

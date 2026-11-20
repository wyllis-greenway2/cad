// The edges of a body that lie in a sketch's plane are lines like any other: lines drawn across a face cut it into faces up to its edge (`in_1338`).
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { drawCircle, drawChain, drawRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { derivedFaces } from "../src/operation/loops.ts";

await kernel.init();
const XY = worldRef("XY");

function post() {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 20);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 10 } } } as never);
  return s;
}
import { planeForDrawing } from "../src/interaction/tools.ts";

/** a sketch on the top face of the post, with two lines across it that cross in the middle and end outside the rim */
function sketched() {
  let s = post();
  const top = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.startsWith("b/body/f@0,0,1"))!;
  const { plane, command } = planeForDrawing(scene(s), top.ref);
  if (command) s = run(s, command);
  const a = drawChain(scene(s), plane, [[-25, 0, 10], [25, 0, 10]]);
  s = run(s, a.command);
  const b = drawChain(scene(s), plane, [[0, -25, 10], [0, 25, 10]]);
  s = run(s, b.command);
  return { s, plane };
}

test("two lines across the top face of a post cut it into four faces up to its rim", () => {
  const { s, plane } = sketched();
  const { faces } = derivedFaces(scene(s));
  const mine = faces.filter((f) => f.plane === plane);
  assert.equal(mine.length, 4, `${faces.length} faces: ${mine.map((f) => f.ref)}`);
});

test("a line that ends on the rim and one that does not reach it leave no face where nothing closes", () => {
  let { s, plane } = sketched();
  const c = drawChain(scene(s), plane, [[5, 5, 10], [10, 5, 10]]); // (a loose line inside)
  s = run(s, c.command);
  const mine = derivedFaces(scene(s)).faces.filter((f) => f.plane === plane);
  assert.equal(mine.length, 4);
});

import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
test("a piece of the face can be extruded: a quarter of the post's top rises", () => {
  const { s, plane } = sketched();
  const faces = derivedFaces(scene(s)).faces.filter((f) => f.plane === plane);
  const op = startOp(scene(s), [faces[0]!.ref], "extrude");
  assert.ok(op.ok, op.ok ? "" : op.why);
  const made = runOp(s, { ...op.op, value: 5 });
  assert.ok(made && made.session.message === null, `${made?.session.message}`);
  assert.deepEqual(made!.session.outcome.errors, {});
  const vol = Object.values(scene(made!.session).parts).reduce((t, p) => t + (p.kind === "body" ? (p.volume ?? 0) : 0), 0);
  const post = Math.PI * 400 * 10;
  assert.ok(Math.abs(vol - (post + (Math.PI * 400 * 5) / 4)) < 30, `volume ${vol} vs ${post + (Math.PI * 400 * 5) / 4}`);
});

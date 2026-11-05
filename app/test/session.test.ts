import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, undoLast, redoLast, clickOn, scene, selection } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { cornerName } from "../src/compiler/body.ts";
import { pointOf } from "../src/operation/part.ts";
import { lookup } from "../src/operation/scene.ts";

await kernel.init();
const XY = worldRef("XY");

test("a session compiles after every command: the body appears, undo removes it, and a relation to a body corner is valid", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [-20, -10, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  assert.equal(s.outcome.kernel, null);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  assert.ok(Math.abs(s.outcome.kernel!.volume! - 16000) < 0.1);
  // a small circle off to the side, pinned to a corner of the body with a relation (the gap of Handoff 084)
  const c = drawCircle(scene(s), XY, [50, 50, 0], 3);
  s = run(s, c.command);
  const body = cornerName([20, 10, 20]);
  const coincide = actionsFor(scene(s), [c.centre, body]).find((a) => a.id === "coincident")!;
  assert.deepEqual(coincide.parts, [c.centre, body], "the drawn centre moves, the body corner is the reference");
  s = run(s, coincide.run());
  assert.equal(s.message, null);
  const at = pointOf(lookup(scene(s)), c.centre)!;
  assert.ok(Math.abs(at[0] - 20) < 1e-3 && Math.abs(at[1] - 10) < 1e-3, `the centre followed the corner: ${at}`);
  s = undoLast(s);
  assert.deepEqual(pointOf(lookup(scene(s)), c.centre), [50, 50, 0]);
  s = undoLast(s); s = undoLast(s); s = undoLast(s);
  assert.equal(s.outcome.kernel, null);
  s = redoLast(s);
  assert.ok(Object.keys(scene(s).parts).length > 7);
});

test("a refused command changes nothing and says why; a click keeps only parts that still exist after undo", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const before = s.history.cursor;
  s = run(s, { type: "deletePart", ref: worldRef("O") });
  assert.match(s.message ?? "", /reference/);
  assert.equal(s.history.cursor, before);
  s = clickOn(s, [r.corners[0]!]);
  assert.deepEqual(selection(s), [r.corners[0]]);
  s = undoLast(s);
  assert.deepEqual(selection(s), []);
});

test("clicking the same crowded spot says 'i of n here'", () => {
  let s = createSession(kernel);
  const refs = [worldRef("O"), worldRef("XY")];
  s = clickOn(s, refs);
  s = clickOn(s, refs);
  assert.equal(s.message, "2 of 2 here");
  assert.deepEqual(selection(s), [worldRef("XY")]);
});

import { surfaceTriangles, triangulate } from "../src/interaction/surfaces.ts";
test("surfaces as triangles: a pane is two, a rectangle face is two, a disk is a fan, a concave shape is cut into the right area", () => {
  const s = createSession(kernel);
  const get = lookup(scene(s));
  assert.equal(surfaceTriangles(get, get(XY)!)!.length, 18);
  assert.equal(surfaceTriangles(get, get(worldRef("O"))!), null);
  const L: [number, number][] = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]];
  const tris = triangulate(L);
  let area = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [L[tris[i]!]!, L[tris[i + 1]!]!, L[tris[i + 2]!]!];
    area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  }
  assert.equal(area, 7);
  let t = createSession(kernel);
  const c = drawCircle(scene(t), XY, [0, 0, 0], 5);
  t = run(t, c.command);
  const g2 = lookup(scene(t));
  const disk = Object.values(scene(t).parts).find((p) => p.kind === "face")!;
  assert.equal(surfaceTriangles(g2, disk)!.length, (64 - 2) * 9);
});

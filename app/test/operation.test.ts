import test from "node:test";
import assert from "node:assert/strict";
import { emptyScene, toJSON, fromJSON, lookup, nextId } from "../src/operation/scene.ts";
import type { Scene } from "../src/operation/scene.ts";
import { apply } from "../src/operation/commands.ts";
import type { Command } from "../src/operation/commands.ts";
import { newHistory, exec, undo, redo, canUndo, canRedo, replay } from "../src/operation/history.ts";
import type { History } from "../src/operation/history.ts";
import { drawChain, drawRectangle, drawCircle } from "../src/operation/build.ts";
import { buildMap, touching, deletionEffect, broken } from "../src/operation/ownership.ts";
import { hitPart, outlineOf, segmentOf, pointOf } from "../src/operation/part.ts";
import { worldRef } from "../src/shared/ref.ts";

const XY = worldRef("XY");
const must = (h: ReturnType<typeof exec>): History => {
  assert.ok(h.ok, h.ok ? "" : h.error);
  return h.value;
};
const rect = (h: History) => {
  const r = drawRectangle(h.scene, XY, [0, 0, 0], [10, 6, 0], [1, 0, 0], [0, 1, 0]);
  return { h: must(exec(h, r.command)), ...r };
};

test("a new scene has the world, and drawing adds parts with fresh names", () => {
  const s = emptyScene();
  for (const n of ["O", "X", "Y", "Z", "XY", "XZ", "YZ"]) assert.ok(worldRef(n) in s.parts);
  const { h, corners, lines } = rect(newHistory());
  assert.equal(corners.length, 4);
  assert.equal(lines.length, 4);
  assert.deepEqual(pointOf(lookup(h.scene), corners[2]!), [10, 6, 0]);
  assert.deepEqual(segmentOf(lookup(h.scene), lines[3]!), [[0, 6, 0], [0, 0, 0]]);
  const second = drawChain(h.scene, XY, [[0, 0, 0], [1, 0, 0]]);
  assert.notEqual(second.corners[0], corners[0], "names are not reused");
});

test("drawn parts move; world parts are references and refuse", () => {
  const { h, corners } = rect(newHistory());
  const moved = must(exec(h, { type: "movePart", ref: corners[0]!, to: [1, 1, 0] }));
  assert.deepEqual(pointOf(lookup(moved.scene), corners[0]!), [1, 1, 0]);
  const bad = exec(h, { type: "movePart", ref: worldRef("O"), to: [1, 1, 1] });
  assert.equal(bad.ok, false);
});

test("undo and redo move a cursor; a new command after undo drops the undone tail", () => {
  let { h } = rect(newHistory());
  assert.ok(canUndo(h));
  h = undo(h);
  assert.ok(!canUndo(h) && canRedo(h));
  assert.equal(Object.keys(h.scene.parts).length, 7);
  h = redo(h);
  assert.equal(Object.keys(h.scene.parts).length, 7 + 8);
  h = undo(h);
  h = must(exec(h, drawCircle(h.scene, XY, [0, 0, 0], 2).command));
  assert.ok(!canRedo(h));
});

test("deleting a corner takes the lines on it and the relations that used them, in one command; undo restores all", () => {
  let { h, corners, lines } = rect(newHistory());
  h = must(exec(h, { type: "addRelation", relation: { id: "r_900", kind: "horizontal", parts: [lines[0]!] } }));
  h = must(exec(h, { type: "addRelation", relation: { id: "r_901", kind: "coincident", parts: [corners[0]!, corners[2]!] } }));
  const before = Object.keys(h.scene.parts).length;
  const effect = deletionEffect(h.scene, corners[0]!);
  assert.deepEqual(effect.relations.sort(), ["r_900", "r_901"]);
  h = must(exec(h, { type: "deletePart", ref: corners[0]! }));
  assert.equal(h.scene.relations.length, 0);
  assert.equal(Object.keys(h.scene.parts).length, before - 3, "the corner and the two lines that used it");
  h = undo(h);
  assert.equal(h.scene.relations.length, 2);
  assert.equal(Object.keys(h.scene.parts).length, before);
});

test("a batch is all or nothing", () => {
  const { h } = rect(newHistory());
  const bad: Command = { type: "batch", commands: [{ type: "removeRelation", id: "nope" }] };
  assert.equal(apply(h.scene, bad).ok, false);
  assert.equal(exec(h, bad).ok, false);
});

test("scene JSON keeps drawn parts, relations and steps; the world is rebuilt", () => {
  let { h, lines } = rect(newHistory());
  h = must(exec(h, { type: "addRelation", relation: { id: "r_950", kind: "horizontal", parts: [lines[0]!] } }));
  h = must(exec(h, { type: "addStep", step: { id: "s_960", type: "extrude", parts: [lines[0]!], params: { depth: 5 } } }));
  const json = JSON.parse(JSON.stringify(toJSON(h.scene)));
  assert.equal(json.parts.length, 8);
  const back: Scene = fromJSON(json);
  assert.deepEqual(Object.keys(back.parts).sort(), Object.keys(h.scene.parts).sort());
  assert.deepEqual(back.relations, h.scene.relations);
  assert.equal(nextId(back, "e"), nextId(h.scene, "e"));
});

test("replaying the saved commands gives the same scene and the same cursor", () => {
  const { h, lines } = rect(newHistory());
  const h2 = must(exec(h, { type: "addRelation", relation: { id: "r_700", kind: "horizontal", parts: [lines[0]!] } }));
  const full = replay(h2.base, h2.commands);
  assert.ok(full.ok);
  if (full.ok) assert.deepEqual(full.value.scene, h2.scene);
  const back = replay(h2.base, h2.commands, 1);
  assert.ok(back.ok);
  if (back.ok) {
    assert.equal(back.value.cursor, 1);
    assert.equal(back.value.scene.relations.length, 0);
  }
});

test("ownership: what touches a line includes relations on its corners; steps that lose their parts are broken", () => {
  let { h, corners, lines } = rect(newHistory());
  h = must(exec(h, { type: "addRelation", relation: { id: "r_800", kind: "distance", parts: [corners[0]!, corners[1]!], value: 10 } }));
  h = must(exec(h, { type: "addStep", step: { id: "s_801", type: "extrude", parts: lines, params: { depth: 3 } } }));
  const map = buildMap(h.scene);
  const t = touching(h.scene, map, lines[0]!);
  assert.deepEqual(t.map((x) => x.id).sort(), ["r_800", "s_801"]);
  assert.equal(broken(map).length, 0);
  const gone = must(exec(h, { type: "deletePart", ref: corners[3]! }));
  const m2 = buildMap(gone.scene);
  assert.deepEqual(broken(m2).map((x) => x.id), ["s_801"], "the step stays and is reported broken");
});

test("per-kind functions answer the same questions for every kind", () => {
  const { h, corners, lines } = rect(newHistory());
  const get = lookup(h.scene);
  const pv = { x: 5, y: 0, project: (p: readonly [number, number, number]): [number, number] => [p[0], p[1]] };
  assert.equal(hitPart(get, get(lines[0]!)!, pv), 0);
  assert.equal(hitPart(get, get(corners[1]!)!, pv), 5);
  assert.deepEqual(outlineOf(get, get(corners[0]!)!), { shape: "point", at: [0, 0, 0] });
  const c = drawCircle(h.scene, XY, [20, 0, 0], 3);
  const h2 = must(exec(h, c.command));
  const g2 = lookup(h2.scene);
  assert.ok(Math.abs(hitPart(g2, g2(c.circle)!, { x: 23, y: 0, project: pv.project })!) < 1e-9);
  assert.equal(outlineOf(g2, g2(c.circle)!).shape, "circle");
  assert.equal(hitPart(g2, g2(worldRef("XY"))!, pv), null, "world parts are not hit by this kind of test yet");
});

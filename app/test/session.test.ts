import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { readFileSync } from "node:fs";
import { openSession } from "../src/interaction/session.ts";
import { panelOf } from "../src/interaction/panels.ts";
import { createSession, run, undoLast, redoLast, refresh, clickOn, scene, selection } from "../src/interaction/session.ts";
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

test("a kernel that answers later (its own thread): the picture lags, then refresh brings the body in; undo and redo stay right", () => {
  let ready = false;
  const empty = { ops: [], finalId: null, volume: null, bbox: null, mesh: null, faces: null, edges: null, vertices: null, totalMs: 0 };
  const slow = { ...kernel, lagging: true, evaluate: (g: Parameters<typeof kernel.evaluate>[0]) => (ready ? kernel.evaluate(g) : empty) };
  let s = createSession(slow);
  const r = drawRectangle(scene(s), XY, [-20, -10, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  assert.equal(s.outcome.kernel!.volume, null, "the answer has not come yet: no body");
  ready = true; // the worker answers
  s = refresh(s);
  assert.ok(Math.abs(s.outcome.kernel!.volume! - 16000) < 0.1);
  assert.ok(Object.values(scene(s).parts).some((p) => p.kind === "body"), "the body's parts are in the scene");
  s = undoLast(s);
  assert.equal(s.outcome.kernel, null);
  s = redoLast(s);
  assert.ok(Math.abs(s.outcome.kernel!.volume! - 16000) < 0.1, "redo shows the body again");
});

test("a step the kernel cannot make is refused when it is made, and not kept to break the steps after it", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 20 } } });
  const round = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.curved)!;
  const steps = scene(s).steps.length;
  // a post is pulled in by more than its radius: not a thing that can be made
  const bad = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "pushPull", parts: [round.ref], params: { depth: -12, cax: 2, ccx: 0, ccy: 0, ccz: 0, cr: 10, clo: 0, chi: 20, cconvex: 1 } } });
  assert.equal(scene(bad).steps.length, steps, "nothing was added");
  assert.match(bad.message ?? "", /radius must be positive/);
  assert.deepEqual(bad.outcome.errors, {}, "and nothing is left broken");
});

test("a kernel that answers later: a step is not made on the older model, and a step whose answer is an error is taken back", () => {
  let ready = false;
  const empty = { ops: [], finalId: null, volume: null, bbox: null, mesh: null, faces: null, edges: null, vertices: null, totalMs: 0 };
  const slow = { ...kernel, lagging: true, evaluate: (g: Parameters<typeof kernel.evaluate>[0]) => (ready ? kernel.evaluate(g) : { ...empty, stale: true }) };
  let s = createSession(slow);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 20 } } });
  assert.equal(s.outcome.kernel!.stale, true, "the answer has not come");
  const again = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 5 } } });
  assert.equal(scene(again).steps.length, 1, "a step is not made while what is shown is the older model");
  assert.match(again.message ?? "", /still being worked out/);
  ready = true;
  s = refresh(s);
  assert.equal(s.outcome.kernel!.stale, undefined);
  const round = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.curved)!;
  ready = false;
  // a bad step is accepted for now (the answer is not there), then the answer comes and it is taken back
  const stale = { ...s, outcome: { ...s.outcome, kernel: { ...s.outcome.kernel!, stale: false } } };
  const added = run(stale, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "pushPull", parts: [round.ref], params: { depth: -12, cax: 2, ccx: 0, ccy: 0, ccz: 0, cr: 10, clo: 0, chi: 20, cconvex: 1 } } });
  assert.equal(scene(added).steps.length, 2, "accepted while the answer is out");
  ready = true;
  const back = refresh(added);
  assert.equal(scene(back).steps.length, 1, "the answer is an error: the step is taken back");
  assert.match(back.message ?? "", /radius must be positive/);
});

test("the model with a broken history: the steps that could not be made are shown in the history list and can be taken out", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/hole-edits.cad.json", import.meta.url), "utf8"));
  assert.ok(r.ok);
  let s = r.value;
  assert.deepEqual(Object.keys(s.outcome.errors).sort(), ["s_025", "s_026", "s_027"]);
  const rows = panelOf("history", scene(s), [], s.outcome.errors)!.rows;
  assert.deepEqual(rows.filter((x) => x.error).map((x) => x.id), ["s_025", "s_026", "s_027"]);
  for (const id of ["s_027", "s_026", "s_025"]) s = run(s, { type: "removeStep", id });
  assert.deepEqual(s.outcome.errors, {});
  assert.ok(s.outcome.kernel!.volume! > 1000);
});

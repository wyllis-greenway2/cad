// Findings of the audit after the bore bug (`in_187`, `in_188`): things that were found again after a size changed by "the nearest one" and so could be the wrong one, and derived parts met by older code.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, openSession, undoLast } from "../src/interaction/session.ts";
import { drawCircle, drawChain, drawRectangle } from "../src/operation/build.ts";
import { startOp, opCommand, typeOp } from "../src/interaction/operations.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const XY = worldRef("XY");
const atOf = (p: unknown) => (p as { at: [number, number, number] }).at;
const parts = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts) as Part[];

test("a push or pull step on a round wall stays on that wall when the wall grows past its neighbour's size (a post is not taken for a hole)", () => {
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), XY, [0, 0, 0], 20).command);
  s = run(s, drawCircle(scene(s), XY, [0, 0, 0], 10).command);
  const ring = parts(s).find((p) => p.kind === "face" && p.holes?.length)!;
  const st = startOp(scene(s), [ring.ref], "extrude") as { ok: true; op: Parameters<typeof typeOp>[0] };
  s = run(s, opCommand(scene(s), { ...st.op, value: 10 })!);
  const wall = parts(s).find((p) => p.kind === "plane" && p.origin === "body" && p.curved?.convex)!;
  const r = startOp(scene(s), [wall.ref], "pushpull") as { ok: true; op: Parameters<typeof typeOp>[0] };
  s = run(s, opCommand(scene(s), { ...r.op, noEdit: true, value: 2 })!); // (a step on the wall itself, not on its circle)
  const outer = parts(s).find((p) => p.kind === "circle" && p.radius === 20)!;
  for (const ro of [25, 30, 40]) {
    const t = run(s, { type: "setRadius", ref: outer.ref, radius: ro });
    const radii = parts(t).filter((p) => p.kind === "plane" && p.origin === "body" && p.curved).map((p) => `${p.kind === "plane" && p.curved!.convex ? "post" : "hole"}${p.kind === "plane" ? p.curved!.radius : 0}`).sort();
    assert.deepEqual(radii, ["hole10", `post${ro + 2}`], `outer ${ro}`);
  }
});

test("a fillet on one edge of a block stays on that edge when the block is made much wider (found by the faces it lies between, not by nearness)", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [20, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: r.lines, params: { depth: 10 } } });
  const get = (ref: string) => ({ at: atOf(scene(s).parts[ref]) });
  const vert = parts(s).find((p) => p.kind === "line" && p.origin === "body" && get(p.a).at[2] !== get(p.b).at[2] && get(p.a).at[0] > 0 && get(p.a).at[1] > 0)!;
  const e = startOp(scene(s), [vert.ref], "edge") as { ok: true; op: Parameters<typeof typeOp>[0] };
  s = run(s, opCommand(scene(s), { ...e.op, value: 3 })!);
  for (const W of [30, 60, 100]) {
    let t = s;
    for (const c of parts(s).filter((p) => p.kind === "corner" && p.origin === "drawn" && Math.abs(atOf(p)[0] - 20) < 1e-6)) t = run(t, { type: "movePart", ref: c.ref, to: [W, atOf(c)[1], 0] });
    assert.deepEqual(t.outcome.errors, {}, `width ${W}`);
    const expect = W * 20 * 10 - (1 - Math.PI / 4) * 9 * 10;
    assert.ok(Math.abs(t.outcome.kernel!.volume! - expect) < 1, `width ${W}: ${t.outcome.kernel!.volume} vs ${expect}`);
  }
});

test("a line drawn from a crossing point of two curves starts on a real point, not on the derived one that goes when the crossing does", () => {
  let s = createSession(kernel);
  s = run(s, drawChain(scene(s), XY, [[-10, 0, 0], [10, 0, 0]]).command);
  s = run(s, drawChain(scene(s), XY, [[0, -10, 0], [0, 10, 0]]).command);
  s = run(s, drawCircle(scene(s), XY, [1, 1, 0], 6).command);
  const cross = parts(s).find((p) => p.kind === "corner" && p.derived)!;
  const t = run(s, drawChain(scene(s), XY, [atOf(cross), [5, 5, 0]], false, { reuse: true }).command);
  const line = parts(t).filter((p) => p.kind === "line" && !p.derived).pop()!;
  assert.ok(line.kind === "line" && !line.a.includes("@"), `the line starts on ${line.kind === "line" ? line.a : ""}`);
});

test("deleting one piece of a cut shape takes only what nothing else borders; where that is nothing, there is nothing to delete", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/pie-cuts.cad.json", import.meta.url), "utf8"));
  assert.ok(r.ok);
  const s = r.value;
  const piece = parts(s).find((p) => p.kind === "face" && p.loop.length === 3)!;
  assert.equal(actionsFor(scene(s), [piece.ref]).find((a) => a.id === "delete"), undefined, "the sides are shared with the other piece and the arc is part of the circle");
  // a square cut in two by a line: one half goes with the side only it has (and the corner points only it used)
  let q = createSession(kernel);
  q = run(q, drawChain(scene(q), XY, [[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0]], true).command);
  q = run(q, drawChain(scene(q), XY, [[0, 10, 0], [20, 10, 0]]).command);
  assert.equal(parts(q).filter((p) => p.kind === "face").length, 2);
  const half = parts(q).find((p) => p.kind === "face" && p.corners.some((c) => atOf(scene(q).parts[c])[1] === 0))!;
  const del = actionsFor(scene(q), [half.ref]).find((a) => a.id === "delete")!;
  assert.ok(del);
  const after = run(q, del.run());
  assert.equal(parts(after).filter((p) => p.kind === "face").length, 1, "the upper half is still closed by the cut line: only the bottom side, which the lower half alone had, is gone");
  assert.ok(parts(after).some((p) => p.kind === "line" && p.origin === "drawn" && !p.derived && scene(after).parts[p.a] && atOf(scene(after).parts[p.a])[1] === 10), "the cut line stays");
});

test("a piece of a cut shape cannot be moved, turned, scaled or repeated as one thing (it shares sides): it says so", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/pie-cuts.cad.json", import.meta.url), "utf8"));
  assert.ok(r.ok);
  const piece = parts(r.value).find((p) => p.kind === "face")!;
  for (const k of ["move", "rotate", "scale", "linear", "circular", "offset"] as const) {
    const st = startOp(scene(r.value), [piece.ref], k);
    assert.equal(st.ok, false, k);
  }
  assert.equal(startOp(scene(r.value), [piece.ref], "extrude").ok, true);
});

// ---- the rod model (`in_189`) ----
import { faceEdit, editCommand } from "../src/interaction/faceedit.ts";
import { consumed } from "../src/operation/ownership.ts";
const rod = () => { const r = openSession(kernel, readFileSync(new URL("./fixtures/rod-fillet.cad.json", import.meta.url), "utf8")); assert.ok(r.ok); return r.value; };

test("the rod model has no failing step (a wall made of two halves is one wall for the step that pulled it, not two rivals)", () => {
  assert.deepEqual(rod().outcome.errors, {});
});

test("the rod pulled taller after a fillet on its top: the length changes and the fillet goes up with the top (a rim of the same size on the same axis is the same rim)", () => {
  let s = rod();
  s = run(s, { type: "removeStep", id: "s_014" }); // (the prism the app made instead)
  const top = parts(s).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && !p.rounded && faceEdit(scene(s), p.ref)?.kind === "depth")!;
  const t = run(s, editCommand(scene(s), faceEdit(scene(s), top.ref)!, 22.5)!);
  assert.deepEqual(t.outcome.errors, {});
  assert.ok(Math.abs(t.outcome.kernel!.bbox!.max[2] - (41.5 + 22.5)) < 1e-6, `${t.outcome.kernel!.bbox!.max[2]}`);
  assert.ok(parts(t).some((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "TORUS"), "the fillet is still there");
});

test("a chamfer made now on the top rim of a post goes up with the top when the post is made taller, and the post's other rim is not taken for it", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: [c.circle], params: { depth: 20 } } });
  const top = parts(s).filter((p) => p.kind === "line" && p.origin === "body" && p.circle && p.circle.center[2] === 20).map((p) => p.ref);
  const e = startOp(scene(s), top, "edge") as { ok: true; op: Parameters<typeof typeOp>[0] };
  s = run(s, opCommand(scene(s), { ...e.op, value: -2 })!);
  for (const h of [8, 40, 200]) {
    const t = run(s, { type: "setStepParams", id: "s_100", params: { depth: h } });
    assert.deepEqual(t.outcome.errors, {}, `height ${h}`);
    near(Math.PI * 100 * h - t.outcome.kernel!.volume!, 2 * Math.PI * (10 - 2 / 3) * 2, 0.5);
  }
});

test("a circle drawn over a circle that has been extruded is one disk, not cut by the old one", () => {
  const s = rod();
  const faces = parts(s).filter((p) => p.kind === "face" && !consumed(scene(s)).has(p.ref));
  assert.equal(faces.length, 1);
  assert.ok(faces[0]!.kind === "face" && faces[0]!.disk, "the new circle's disk");
});

function near(a: number, b: number, tol = 1e-6) { assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`); }

test("a square with a diagonal: one triangle extruded, the other is still there to extrude (the diagonal is not used up with the first)", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [20, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const at = (x: number, y: number) => parts(s).find((p) => p.kind === "corner" && p.origin === "drawn" && Math.hypot(atOf(p)[0] - x, atOf(p)[1] - y) < 1e-6)!.ref;
  s = run(s, { type: "addPart", part: { origin: "drawn", plane: XY, movable: true, ref: "d/e_900.s0" as never, kind: "line", a: at(0, 0), b: at(20, 20) } });
  const faces = parts(s).filter((p) => p.kind === "face");
  assert.equal(faces.length, 2);
  const one = startOp(scene(s), [faces[0]!.ref], "extrude") as { ok: true; op: Parameters<typeof typeOp>[0] };
  s = run(s, opCommand(scene(s), { ...one.op, value: 5 })!);
  const left = parts(s).filter((p) => p.kind === "face" && p.ref !== faces[0]!.ref);
  assert.equal(left.length, 1);
  assert.ok(!consumed(scene(s)).has(left[0]!.ref));
  const two = startOp(scene(s), [left[0]!.ref], "extrude") as { ok: true; op: Parameters<typeof typeOp>[0] };
  s = run(s, opCommand(scene(s), { ...two.op, value: 5 })!);
  assert.deepEqual(s.outcome.errors, {});
  near(s.outcome.kernel!.volume!, 400 * 5, 0.5);
});

// ---- ghosts after a body is deleted (`in_191`) ----
import { circleCentredAt } from "../src/interaction/hints.ts";

test("nothing of a deleted body's sketches is suggested or snapped to: no concentric hint, no corner to snap to or join", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [3, 4, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: [c.circle], params: { depth: 5 } } });
  s = run(s, { type: "addStep", step: { id: "s_101", type: "delete", parts: ["b/body/o" as never], params: {} } });
  const xy = scene(s).parts[XY] as import("../src/operation/part.ts").Plane;
  assert.equal(circleCentredAt(scene(s), xy, [3, 4, 0]), null, "the circle of the deleted cylinder is not offered as a concentric one");
  assert.equal(parts(s).filter((p) => p.kind === "corner" && p.origin === "drawn").length, 1, "(the hidden corner is still in the scene: undo and the step list bring it back)");
  const t = run(s, drawChain(scene(s), XY, [[3, 4, 0], [10, 4, 0]], false, { reuse: true }).command);
  assert.equal(parts(t).filter((p) => p.kind === "corner" && p.origin === "drawn").length, 3, "a line started where the hidden corner is gets a corner of its own");
});

test("deleting the body removes the sketches it was made from; a drawing that was not used stays", () => {
  let s = createSession(kernel);
  const a = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: [a.circle], params: { depth: 5 } } });
  const free = drawChain(scene(s), XY, [[30, 30, 0], [40, 40, 0]]);
  s = run(s, free.command); // (a drawing that was not extruded)
  const del = actionsFor(scene(s), ["b/body/o" as never]).find((x) => x.id === "delete")!;
  const t = run(s, del.run());
  assert.deepEqual(scene(t).steps, []);
  assert.equal(parts(t).some((p) => p.kind === "circle"), false, "the circle and its centre are gone");
  assert.equal(parts(t).filter((p) => p.kind === "line" && p.origin === "drawn").length, 1, "the free line stays, with its points");
  assert.equal(parts(t).filter((p) => p.kind === "corner" && p.origin === "drawn").length, 2);
});

// ---- the sources of an extruded cut shape go with the body (`in_201`) ----
import { consumed as consumedOf } from "../src/operation/ownership.ts";
test("nothing of an extruded shape is left visible where the body was: the arcs and lines its pieces were cut from are the body's too", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/stadium-move.cad.json", import.meta.url), "utf8"));
  assert.ok(r.ok);
  const s = r.value;
  const used = consumedOf(scene(s));
  const visible = parts(s).filter((p) => p.origin === "drawn" && p.movable && (p.kind === "line" || p.kind === "corner" || p.kind === "circle") && !used.has(p.ref));
  assert.deepEqual(visible.map((p) => p.ref), [], "no sketch line or point is left showing");
  // and the two pieces of a circle cut by a line: the one extruded goes, the other is still there to extrude
  let q = createSession(kernel);
  q = run(q, drawCircle(scene(q), XY, [0, 0, 0], 10).command);
  q = run(q, drawChain(scene(q), XY, [[-15, 3, 0], [15, 3, 0]]).command);
  const faces = parts(q).filter((p) => p.kind === "face");
  const st = startOp(scene(q), [faces[0]!.ref], "extrude") as { ok: true; op: Parameters<typeof opCommand>[1] };
  q = run(q, opCommand(scene(q), { ...st.op, value: 5 })!);
  const left = parts(q).filter((p) => p.kind === "face" && p.ref !== faces[0]!.ref);
  assert.equal(left.length, 1);
  assert.ok(!consumedOf(scene(q)).has(left[0]!.ref), "the other piece is not used up");
  assert.ok(!consumedOf(scene(q)).has(parts(q).find((p) => p.kind === "circle")!.ref), "the circle is still there for the other piece");
});

// ---- the sketch follows the body (`in_204`) ----
test("moving or turning the body carries the sketches that made it, and the body is the same as a plain move: the sketch stays attached as a continuation of the recipe", () => {
  const make = () => {
    let s = createSession(kernel);
    const c = drawCircle(scene(s), XY, [5, 5, 0], 8);
    s = run(s, c.command);
    s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: [c.circle], params: { depth: 10 } } });
    return { s, c };
  };
  const { s, c } = make();
  const before = s.outcome.kernel!;
  const st = startOp(scene(s), ["b/body/o" as never], "move") as { ok: true; op: Parameters<typeof typeOp>[0] };
  const moved = run(s, opCommand(scene(s), { ...st.op, value: 30 })!);
  assert.deepEqual(moved.outcome.errors, {});
  const k = moved.outcome.kernel!;
  assert.ok(Math.abs(k.volume! - before.volume!) < 1e-6);
  assert.ok(Math.abs(k.bbox!.min[0] - (before.bbox!.min[0] + 30)) < 1e-6, "the body moved by 30");
  const corner = scene(moved).parts[(scene(moved).parts[c.circle] as unknown as { center: string }).center] as unknown as { at: number[] };
  assert.ok(Math.abs(corner.at[0]! - 35) < 1e-6 && Math.abs(corner.at[1]! - 5) < 1e-6, `the sketch's centre went with the body (${corner.at})`);
  // a turn about Z by 90 degrees: the sketch turned with it
  const r1 = startOp(scene(s), ["b/body/o" as never], "rotate") as { ok: true; op: Parameters<typeof typeOp>[0] };
  const turned = run(s, opCommand(scene(s), { ...r1.op, axis: 2, value: 90 })!);
  assert.deepEqual(turned.outcome.errors, {});
  const c2 = scene(turned).parts[(scene(turned).parts[c.circle] as unknown as { center: string }).center] as unknown as { at: number[] };
  const body = turned.outcome.kernel!.bbox!;
  const mid = [(body.min[0] + body.max[0]) / 2, (body.min[1] + body.max[1]) / 2];
  assert.ok(Math.hypot(c2.at[0]! - mid[0]!, c2.at[1]! - mid[1]!) < 1e-4, `the sketch's centre is at the middle of the turned body (${c2.at} vs ${mid})`);
  // the sketch is at the body, so pulling the body's wall changes the circle that is there (the edit by step finds it after a move)
  const wall = parts(moved).find((p) => p.kind === "plane" && p.origin === "body" && p.curved)!;
  assert.equal(faceEdit(scene(moved), wall.ref)?.kind, "radius", "the wall is the circle of the carried sketch");
  // a move made before this change (no follow mark) is not read back: files keep their meaning
  const old = run(s, { type: "addStep", step: { id: "s_101", type: "move", parts: ["b/body/o" as never], params: { axis: 0, value: 30 } } });
  assert.ok(Math.abs(old.outcome.kernel!.bbox!.min[0] - (before.bbox!.min[0] + 30)) < 1e-6);
});

test("the cut-shape file: moved and turned, the body is the same shape in a new place and every sketch part is still hidden with it", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/stadium-move.cad.json", import.meta.url), "utf8"));
  assert.ok(r.ok);
  const s = r.value;
  const v0 = s.outcome.kernel!.volume!;
  const mv = startOp(scene(s), ["b/body/o" as never], "move") as { ok: true; op: Parameters<typeof typeOp>[0] };
  const a = run(s, opCommand(scene(s), { ...mv.op, value: 30 })!);
  assert.deepEqual(a.outcome.errors, {});
  assert.ok(Math.abs(a.outcome.kernel!.volume! - v0) < 1e-3);
  const ro = startOp(scene(a), ["b/body/o" as never], "rotate") as { ok: true; op: Parameters<typeof typeOp>[0] };
  const b = run(a, opCommand(scene(a), { ...ro.op, axis: 2, value: 35 })!);
  assert.deepEqual(b.outcome.errors, {});
  assert.ok(Math.abs(b.outcome.kernel!.volume! - v0) < 1e-3, "a turned body is the same body");
  const used = consumedOf(scene(b));
  assert.deepEqual(parts(b).filter((p) => p.origin === "drawn" && p.movable && (p.kind === "line" || p.kind === "corner") && !used.has(p.ref)).map((p) => p.ref), []);
  // undo takes the whole motion back, the sketch too
  const back = undoLast(b);
  assert.ok(Math.abs(back.outcome.kernel!.bbox!.min[0] - a.outcome.kernel!.bbox!.min[0]) < 1e-6);
});

test("a constraint tying the body's sketch to something else stays a constraint of the whole body: a move that would break it is refused and the constraint flashes; one that keeps it holds, and a free drawing tied to it goes along", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 8);
  s = run(s, c.command);
  const act = actionsFor(scene(s), [worldRef("O"), c.centre]).find((a) => a.id === "coincident")!; // (the circle's centre on the world origin)
  s = run(s, act.run());
  assert.equal(scene(s).relations.length, 1);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: [c.circle], params: { depth: 10 } } });
  const mv = startOp(scene(s), ["b/body/o" as never], "move") as { ok: true; op: Parameters<typeof typeOp>[0] };
  const refused = run(s, opCommand(scene(s), { ...mv.op, value: 30 })!);
  assert.match(refused.message ?? "", /cannot be done without breaking/, "the body cannot leave the origin it is tied to");
  assert.ok(refused.conflict && refused.conflict.culprits.length + refused.conflict.victims.length > 0, "the constraint is named, so it can flash");
  assert.equal(scene(refused).steps.length, 1, "nothing was changed");
  // a free circle tied concentric to the body's circle goes along with the body
  let t = createSession(kernel);
  const a = drawCircle(scene(t), XY, [0, 0, 0], 8);
  t = run(t, a.command);
  const b = drawCircle(scene(t), XY, [20, 0, 0], 3);
  t = run(t, b.command);
  t = run(t, actionsFor(scene(t), [a.circle, b.circle]).find((x) => x.id === "concentric")!.run()); // (b moves to a: the first selected stays)
  t = run(t, { type: "addStep", step: { id: "s_100", type: "extrude", parts: [a.circle], params: { depth: 10 } } });
  const mv2 = startOp(scene(t), ["b/body/o" as never], "move") as { ok: true; op: Parameters<typeof typeOp>[0] };
  const moved = run(t, opCommand(scene(t), { ...mv2.op, value: 25 })!);
  assert.equal(moved.message, null);
  const bc = scene(moved).parts[(scene(moved).parts[b.circle] as unknown as { center: string }).center] as unknown as { at: number[] };
  assert.ok(Math.abs(bc.at[0]! - 25) < 1e-4, `the free circle went with the body (${bc.at})`);
});

test("scaling the body carries the sketch too (made as many times bigger, its locked sizes too) and the body is the same as a plain scale", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [5, 5, 0], 8);
  s = run(s, c.command);
  s = run(s, actionsFor(scene(s), [c.circle]).find((a) => a.id === "diameter")!.run(16)); // (a locked diameter of 16)
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: [c.circle], params: { depth: 10 } } });
  const v0 = s.outcome.kernel!.volume!;
  const st = startOp(scene(s), ["b/body/o" as never], "scale") as { ok: true; op: Parameters<typeof typeOp>[0] };
  const big = run(s, opCommand(scene(s), { ...st.op, value: 2 })!);
  assert.deepEqual(big.outcome.errors, {});
  assert.equal(big.message, null);
  assert.ok(Math.abs(big.outcome.kernel!.volume! - 8 * v0) < 1e-3, `${big.outcome.kernel!.volume} vs ${8 * v0}`);
  const circle = scene(big).parts[c.circle] as unknown as { radius: number; center: string };
  assert.ok(Math.abs(circle.radius - 16) < 1e-6, "the sketch's circle is twice as big");
  assert.equal(scene(big).relations.find((r) => r.kind === "diameter")!.value, 32, "and its locked diameter");
  // the same body as a scale made before this change (no follow: the sketch is left)
  const old = run(s, { type: "addStep", step: { id: "s_101", type: "scale", parts: ["b/body/o" as never], params: { axis: 0, value: 2 } } });
  assert.ok(Math.abs(old.outcome.kernel!.volume! - 8 * v0) < 1e-3);
  // moved then scaled then turned: still one body, the sketch is where the body is
  let t = big;
  const mv = startOp(scene(t), ["b/body/o" as never], "move") as { ok: true; op: Parameters<typeof typeOp>[0] };
  t = run(t, opCommand(scene(t), { ...mv.op, value: 7 })!);
  const ro = startOp(scene(t), ["b/body/o" as never], "rotate") as { ok: true; op: Parameters<typeof typeOp>[0] };
  t = run(t, opCommand(scene(t), { ...ro.op, axis: 2, value: 40 })!);
  assert.deepEqual(t.outcome.errors, {});
  assert.ok(Math.abs(t.outcome.kernel!.volume! - 8 * v0) < 1e-3);
  const cc = scene(t).parts[(scene(t).parts[c.circle] as unknown as { center: string }).center] as unknown as { at: number[] };
  const bb = t.outcome.kernel!.bbox!;
  assert.ok(Math.hypot(cc.at[0]! - (bb.min[0] + bb.max[0]) / 2, cc.at[1]! - (bb.min[1] + bb.max[1]) / 2) < 1e-3, "the sketch's centre is at the middle of the body");
});

test("offsetting a flat face of the body that has a hole moves every loop of it: in is the outer edge in and the hole out, as material is what is offset into (`in_228`)", async () => {
  const { offsetSource, offsetCommand } = await import("../src/interaction/offset.ts");
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), XY, [0, 0, 0], 20).command);
  s = run(s, drawCircle(scene(s), XY, [0, 0, 0], 10).command);
  const ring = parts(s).find((p) => p.kind === "face" && p.holes?.length)!;
  const st = startOp(scene(s), [ring.ref], "extrude") as { ok: true; op: Parameters<typeof typeOp>[0] };
  s = run(s, opCommand(scene(s), { ...st.op, value: 10 })!);
  const top = parts(s).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && !p.rounded && p.at[2] === 10)!;
  const src = offsetSource(scene(s), [top]);
  assert.equal(src?.kind, "outlines", "both loops of the face");
  assert.equal((src as { loops: unknown[] }).loops.length, 2);
  for (const [v, outer, inner] of [[-2, 18, 12], [3, 23, 7]] as const) {
    const cmd = offsetCommand(scene(s), src!, v);
    assert.ok(cmd, `offset ${v}`);
    const t = run(s, cmd!);
    const radii = parts(t).filter((p) => p.kind === "circle" && p.origin === "drawn" && p.plane !== undefined && Math.abs(atOf((scene(t).parts[p.center] as unknown as { at: [number, number, number] }))[2] - 10) < 1e-6).map((p) => (p.kind === "circle" ? p.radius : 0)).sort((a, b) => a - b);
    assert.deepEqual(radii.map((r) => Math.round(r * 1e3) / 1e3), [inner, outer].sort((a, b) => a - b), `offset ${v}: the outer edge ${outer} and the hole ${inner}`);
  }
});

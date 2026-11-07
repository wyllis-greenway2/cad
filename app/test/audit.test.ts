// Findings of the audit after the bore bug (`in_187`, `in_188`): things that were found again after a size changed by "the nearest one" and so could be the wrong one, and derived parts met by older code.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, openSession } from "../src/interaction/session.ts";
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

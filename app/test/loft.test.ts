// A loft through sketches (`in_431`, `in_432`, `dec_loft_sketches`).
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef, drawnRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { loopFaceRef, diskFaceRef } from "../src/operation/loops.ts";
import { nextId } from "../src/operation/scene.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const XY = worldRef("XY");
const volume = (s: Session): number => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? (p.volume ?? 0) : 0), 0);

/** a plane across Z at the height given, a sketch plane of its own */
function planeAt(s: Session, z: number): { s: Session; ref: string } {
  const ref = drawnRef(nextId(scene(s), "p"));
  const s2 = run(s, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, at: [0, 0, z], u: [1, 0, 0], v: [0, 1, 0] } } as never);
  return { s: s2, ref };
}
/** a square of side `a` on the base plane, a rectangle `b` x `b` at height `h` above it (centred on the same line) */
function twoSquares(a: number, b: number, h: number): { s: Session; faces: string[] } {
  let s = createSession(kernel);
  const r1 = drawRectangle(scene(s), XY, [-a / 2, -a / 2, 0], [a / 2, a / 2, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r1.command);
  const up = planeAt(s, h);
  s = up.s;
  const r2 = drawRectangle(scene(s), up.ref as never, [-b / 2, -b / 2, h], [b / 2, b / 2, h], [1, 0, 0], [0, 1, 0]);
  s = run(s, r2.command);
  return { s, faces: [loopFaceRef(r1.lines), loopFaceRef(r2.lines)] };
}
function begin(s: Session, faces: string[], extra: Partial<Op> = {}): Op {
  const st = startOp(scene(s), faces as never, "loft");
  assert.ok(st.ok, st.ok ? "" : st.why);
  return { ...(st as { op: Op }).op, ...extra };
}

test("two squares of different sizes at different heights are joined into a frustum: the volume is the prismatoid's (a + b)^2 / ... h / 3 (a^2 + ab + b^2)", () => {
  const { s, faces } = twoSquares(10, 4, 20);
  const r = runOp(s, begin(s, faces))!;
  assert.equal(r.session.message, null);
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - (20 / 3) * (100 + 40 + 16)) < 0.5, `volume ${volume(r.session)}`);
});

test("a ruled loft between two squares is the same frustum; the sketches are used up by it", () => {
  const { s, faces } = twoSquares(10, 4, 20);
  const r = runOp(s, begin(s, faces, { loftRuled: true }))!;
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - (20 / 3) * 156) < 0.5);
  assert.equal(scene(r.session).steps.at(-1)!.type, "loft");
});

test("sketches with different numbers of parts are refused with the reason, and joined when Split to match is on (a circle becomes arcs, a side is cut in two)", () => {
  let s = createSession(kernel);
  const r1 = drawRectangle(scene(s), XY, [-5, -5, 0], [5, 5, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r1.command);
  const up = planeAt(s, 15);
  s = up.s;
  const c = drawCircle(scene(s), up.ref as never, [0, 0, 15], 3);
  s = run(s, c.command);
  const faces = [loopFaceRef(r1.lines), diskFaceRef(c.circle)];
  const op = begin(s, faces);
  const refused = runOp(s, op)!;
  assert.ok(Object.values(refused.session.outcome.errors).some((e) => /different numbers of parts/.test(e)) || /different numbers of parts/.test(refused.session.message ?? ""), JSON.stringify(refused.session.outcome.errors));
  const ok = runOp(s, { ...op, loftSplit: true })!;
  assert.deepEqual(ok.session.outcome.errors, {});
  const v = volume(ok.session);
  assert.ok(v > (15 / 3) * (Math.PI * 9) && v < 15 * 100, `a body between a circle and a square: ${v}`);
});

test("the start point and the direction of a sketch can be changed: a square started a quarter further on is the same frustum turned, and reversed it still loft", () => {
  const { s, faces } = twoSquares(10, 4, 20);
  const a = runOp(s, begin(s, faces, { loftShift: [0, 1] }))!;
  assert.deepEqual(a.session.outcome.errors, {});
  assert.ok(Math.abs(volume(a.session) - (20 / 3) * 156) < 0.5, "a square started a quarter on is the same shape, joined to the same sides moved on");
  const b = runOp(s, begin(s, faces, { loftRev: [false, true] }))!;
  assert.equal(b.session.message, null);
});

test("one sketch is not enough to loft", () => {
  const { s, faces } = twoSquares(10, 4, 20);
  const st = startOp(scene(s), [faces[0]!] as never, "loft");
  assert.equal(st.ok, false);
});

import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { homeCamera } from "../src/interaction/camera.ts";
const env = { w: 800, h: 600, now: 0 } as never;

test("the Loft operation: with two sketches selected it opens with its chips and start dots, Split and the start point are chosen, Enter makes the one step", () => {
  const { s, faces } = twoSquares(10, 4, 20);
  let st = { ...createState({ ...s, click: { ...s.click, selection: faces as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "loft" }, env);
  assert.equal(st.op?.kind, "loft");
  const f = frameOf(st, { w: 800, h: 600 });
  assert.deepEqual(f.loftKinds!.map((k) => k.id), ["smooth", "ruled", "normal", "straight", "split", "start:0", "rev:0", "start:1", "rev:1"]);
  assert.equal(f.highlight.amber.length, 2, "a start dot on each sketch");
  st = reduce(st, { type: "loftKind", id: "start:1" }, env);
  st = reduce(st, { type: "loftKind", id: "ruled" }, env);
  assert.deepEqual(st.op!.loftShift, [0, 1]);
  assert.equal(st.op!.loftRuled, true);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const step = scene(st.session).steps.at(-1)!;
  assert.equal(step.type, "loft");
  assert.equal(step.params.ruled, 1);
  assert.equal(step.params.shift, "0,1");
  assert.ok(volume(st.session) > 400, `the body: ${volume(st.session)}`);
});

test("each sketch's start dot has a number bubble (the corner it starts at); a number typed moves the start, and it goes round (`in_488`, `in_489`)", () => {
  const { s, faces } = twoSquares(10, 4, 20);
  let st = { ...createState({ ...s, click: { ...s.click, selection: faces as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "loft" }, env);
  const e0 = frameOf(st, { w: 800, h: 600 }).entries;
  assert.deepEqual(e0.map((e) => [e.fields[0]!.index, e.fields[0]!.value]), [[0, "1"], [1, "1"], [10, "20"]], "a start on each sketch, at corner 1, and the distance between them");
  assert.ok(e0.every((e) => !!e.at), "each stands at its dot");
  st = reduce(st, { type: "entry", field: 1, text: "3" } as never, env);
  assert.deepEqual(st.op!.loftShift, [0, 2], "corner 3 is two on");
  assert.equal(frameOf(st, { w: 800, h: 600 }).entries[1]!.fields[0]!.value, "3");
  st = reduce(st, { type: "entry", field: 1, text: "6" } as never, env);
  assert.deepEqual(st.op!.loftShift, [0, 1], "6 of 4 sides goes round to corner 2");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(scene(st.session).steps.at(-1)!.params.shift, "0,1");
});

test("the distance between two sketches has a bubble; a number typed moves the later sketch along the line between their middles when the step is made, in one undo (`in_490`)", () => {
  const { s, faces } = twoSquares(10, 4, 20);
  let st = { ...createState({ ...s, click: { ...s.click, selection: faces as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "loft" }, env);
  st = reduce(st, { type: "entry", field: 10, text: "30" } as never, env);
  const e = frameOf(st, { w: 800, h: 600 }).entries.find((x) => x.fields[0]!.index === 10)!;
  assert.equal(e.fields[0]!.value, "30");
  assert.ok(e.fields[0]!.typed);
  assert.deepEqual(scene(st.session).steps, [], "nothing is made by typing");
  
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  assert.deepEqual(st.session.outcome.errors, {});
  assert.ok(Math.abs(volume(st.session) - (30 / 3) * (100 + 40 + 16)) < 1, `a frustum 30 high: ${volume(st.session)}`);
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "corner" && p.origin === "drawn" && Math.abs(p.at[2] - 30) < 1e-6);
  assert.ok(top, "the later sketch now stands at 30");
  const undone = reduce(st, { type: "undo" }, env);
  assert.equal(scene(undone.session).steps.length, 0, "one undo takes the step and the move");
  assert.ok(Object.values(scene(undone.session).parts).some((p) => p.kind === "corner" && p.origin === "drawn" && Math.abs(p.at[2] - 20) < 1e-6), "the sketch is back at 20");
});

test("a loft whose sketches have moved is made again, not taken from what the kernel kept for the same step name (the key held the sketches' names, not where they were)", () => {
  const a = twoSquares(10, 4, 20);
  const r1 = runOp(a.s, begin(a.s, a.faces))!;
  const b = twoSquares(10, 4, 30); // the same names, the second sketch higher
  const r2 = runOp(b.s, begin(b.s, b.faces))!;
  assert.ok(Math.abs(volume(r1.session) - (20 / 3) * 156) < 1);
  assert.ok(Math.abs(volume(r2.session) - (30 / 3) * 156) < 1, `volume ${volume(r2.session)}`);
});

test("the distance is measured along the normal of the earlier sketch's plane, so a sketch off to the side is the height apart, and typing moves it straight along the normal (`in_491`)", () => {
  let s = createSession(kernel);
  const r1 = drawRectangle(scene(s), XY, [-5, -5, 0], [5, 5, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r1.command);
  const up = planeAt(s, 20);
  s = up.s;
  const r2 = drawRectangle(scene(s), up.ref as never, [8, -2, 20], [12, 2, 20], [1, 0, 0], [0, 1, 0]); // 10 to the side, 20 up
  s = run(s, r2.command);
  const faces = [loopFaceRef(r1.lines), loopFaceRef(r2.lines)];
  let st = { ...createState({ ...s, click: { ...s.click, selection: faces as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "loft" }, env);
  const gap = () => frameOf(st, { w: 800, h: 600 }).entries.find((x) => x.fields[0]!.index === 10)!.fields[0]!;
  assert.equal(gap().value, "20", "the height apart, not the 22.36 between the middles");
  st = reduce(st, { type: "entry", field: 10, text: "30" } as never, env);
  assert.equal(gap().value, "30");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const top = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn" && Math.abs(p.at[2] - 30) < 1e-6).map((p) => (p as unknown as { at: number[] }).at[0]!);
  assert.equal(top.length, 4, "the second sketch is at 30");
  assert.ok(Math.min(...top) > 7.99 && Math.max(...top) < 12.01, "and still off to the side where it was");
});

test("the distance can be measured along the straight line between the middles instead, by a chip; typing then moves the sketch along that line (`in_492`)", () => {
  let s = createSession(kernel);
  const r1 = drawRectangle(scene(s), XY, [-5, -5, 0], [5, 5, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r1.command);
  const up = planeAt(s, 20);
  s = up.s;
  const r2 = drawRectangle(scene(s), up.ref as never, [8, -2, 20], [12, 2, 20], [1, 0, 0], [0, 1, 0]); // middle at (10, 0, 20)
  s = run(s, r2.command);
  const faces = [loopFaceRef(r1.lines), loopFaceRef(r2.lines)];
  let st = { ...createState({ ...s, click: { ...s.click, selection: faces as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "loft" }, env);
  const gap = () => frameOf(st, { w: 800, h: 600 }).entries.find((x) => x.fields[0]!.index === 10)!.fields[0]!;
  assert.equal(gap().value, "20");
  st = reduce(st, { type: "loftKind", id: "straight" }, env);
  assert.equal(st.op!.loftStraight, true);
  assert.equal(gap().value, "22.36", "the straight distance between the middles");
  st = reduce(st, { type: "entry", field: 10, text: "44.72" } as never, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const xs = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn" && p.at[2] > 30).map((p) => (p as unknown as { at: number[] }).at);
  assert.equal(xs.length, 4, "the second sketch went up the line: about 40 high");
  assert.ok(Math.abs(Math.max(...xs.map((a) => a[2]!)) - 40) < 0.1 && Math.min(...xs.map((a) => a[0]!)) > 17, "and out along it, twice as far");
  st = reduce(createState({ ...s, click: { ...s.click, selection: faces as never } }), { type: "begin", name: "loft" }, env);
  st = reduce(st, { type: "loftKind", id: "straight" }, env);
  st = reduce(st, { type: "loftKind", id: "normal" }, env);
  assert.equal(st.op!.loftStraight, false, "and back");
});

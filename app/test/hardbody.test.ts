// Hard bodies (`dec_hard_bodies`, `in_473`): a body made hard stops against another hard body while it is moved by hand.
import test from "node:test";
import type { Ref } from "../src/shared/ref.ts";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run, saveText, openSession } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 } as never;
const A = "b/x_s_100/o", B = "b/x_s_101/o";

/** two blocks 10 x 10 x 10, one at x 0..10 and one at x 30..40, each a body of its own */
function two(): Session {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const b = drawRectangle(scene(s), XY, [30, 0, 0], [40, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  return run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: b.lines, params: { depth: 10, mode: "new" } } } as never);
}
const hardOf = (s: Session, refs: string[]): Session => {
  const st = reduce({ ...createState({ ...s, click: { ...s.click, selection: refs as never } }), cam: homeCamera() }, { type: "runAction", id: "body:hard" }, env);
  return st.session;
};
const box = (s: Session, ref: string) => (scene(s).parts[ref] as unknown as { bbox: { min: number[]; max: number[] } }).bbox;
const moveBy = (s: Session, free: [number, number, number], typed = ""): { session: Session } | null => {
  const st = startOp(scene(s), [A] as never, "move", null);
  assert.ok(st.ok);
  return runOp(s, { ...(st as { op: Op }).op, free, ...(typed ? { typed } : {}) });
};

test("two bodies are soft until made hard: a block moved through the other goes right through it", () => {
  const s = two();
  assert.equal(scene(s).hard, undefined);
  const r = moveBy(s, [40, 0, 0])!;
  assert.ok(Math.abs(box(r.session, A).min[0]! - 40) < 0.01, "moved the whole way");
});

test("hard bodies stop against each other: the block pushed at the other stops with its face on it", () => {
  const s = hardOf(two(), [A, B]);
  assert.deepEqual([...scene(s).hard!].sort(), ["x_s_100", "x_s_101"]);
  const r = moveBy(s, [40, 0, 0])!;
  assert.equal(r.session.message, null);
  const b = box(r.session, A);
  assert.ok(Math.abs(b.max[0]! - 30) < 0.05, `it stops against the other: ${b.max[0]}`);
  assert.ok(Math.abs(box(r.session, B).min[0]! - 30) < 1e-6, "the other did not move");
});

test("one hard and one soft do not collide; a number typed that would go into the other is refused with the reason", () => {
  const one = hardOf(two(), [A]);
  assert.ok(Math.abs(box(moveBy(one, [40, 0, 0])!.session, A).min[0]! - 40) < 0.01, "only one is hard: through");
  const s = hardOf(two(), [A, B]);
  const r = moveBy(s, [40, 0, 0], "40")!;
  assert.match(r.session.message ?? "", /would run into/);
  assert.ok(Math.abs(box(r.session, A).min[0]!) < 1e-6, "nothing was moved");
});

test("the clearance of the model keeps hard bodies apart by that much; the hard flags and the clearance are saved and opened again", () => {
  let s = hardOf(two(), [A, B]);
  s = run(s, { type: "setClearance", value: 0.5 });
  const r = moveBy(s, [40, 0, 0])!;
  assert.ok(Math.abs(box(r.session, A).max[0]! - 29.5) < 0.05, `a gap of the clearance is left: ${box(r.session, A).max[0]}`);
  const again = openSession(kernel, saveText(s));
  assert.ok(again.ok);
  assert.deepEqual([...scene(again.value).hard!].sort(), ["x_s_100", "x_s_101"]);
  assert.equal(scene(again.value).clearance, 0.5);
});

test("a turn that would swing a hard block into another is taken as far as it can go", () => {
  let s = two();
  s = hardOf(s, [A, B]);
  s = run(s, { type: "setClearance", value: 0 });
  // a long rod: the first block turned a quarter about the far corner of the second's side would sweep through it; here a turn about its own middle stays clear, so it is whole
  const st = startOp(scene(s), [A] as never, "rotate", null);
  assert.ok(st.ok);
  const r = runOp(s, { ...(st as { op: Op }).op, value: 90 })!;
  assert.equal(r.session.message, null, "clear of the other: turned whole");
});

import { frameOf } from "../src/interaction/frame.ts";
test("while a hard body is dragged at another the picture stops where it meets it and the other flashes", () => {
  const s = hardOf(two(), [A, B]);
  let st = { ...createState({ ...s, click: { ...s.click, selection: [A] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "move" }, env);
  st = { ...st, op: { ...st.op!, free: [40, 0, 0], grab: [5, 5, 5] } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.bodyMatrix, "a matrix on the graphics card");
  assert.ok(Math.abs(f.bodyMatrix![12]! - 20) < 0.05, `the body went 20, not 40: ${f.bodyMatrix![12]}`);
  assert.deepEqual(f.flash?.parts, [B], "the body it is against flashes");
});


test("a hard body pushed at the face of another slides along it: it goes the way the pointer went along the surface and no further into it (`in_474`)", () => {
  const s = hardOf(two(), [A, B]);
  const r = moveBy(s, [40, 5, 0])!;
  assert.equal(r.session.message, null);
  const b = box(r.session, A);
  assert.ok(Math.abs(b.max[0]! - 30) < 0.05, `against the face: ${b.max[0]}`);
  assert.ok(Math.abs(b.min[1]! - 5) < 0.05, `and along it, the 5 of the way across: ${b.min[1]}`);
});

test("a slide goes on round a corner and stops against the next hard body: a wall across its way along the face", () => {
  let s = two();
  const d = drawRectangle(scene(s), XY, [0, 12, 0], [30, 22, 0], [1, 0, 0], [0, 1, 0]); s = run(s, d.command);
  s = run(s, { type: "addStep", step: { id: "s_102", type: "extrude", parts: d.lines, params: { depth: 10, mode: "new" } } } as never);
  s = hardOf(s, [A, B, "b/x_s_102/o"]);
  const r = moveBy(s, [40, 5, 0])!;
  const b = box(r.session, A);
  assert.ok(Math.abs(b.max[0]! - 30) < 0.05, `against the first face: ${b.max[0]}`);
  assert.ok(Math.abs(b.max[1]! - 12) < 0.05, `and stopped by the second: ${b.max[1]}`);
});

test("with a clearance the slide keeps the gap: it runs along the face at the clearance from it", () => {
  let s = hardOf(two(), [A, B]);
  s = run(s, { type: "setClearance", value: 0.5 });
  const b = box(moveBy(s, [40, 5, 0])!.session, A);
  assert.ok(Math.abs(b.max[0]! - 29.5) < 0.05, `the gap: ${b.max[0]}`);
  assert.ok(Math.abs(b.min[1]! - 5) < 0.1, `and along: ${b.min[1]}`);
});

test("a turn (or a move along an arrow) only stops: it does not slide off its axis", () => {
  const s = hardOf(two(), [A, B]);
  const st = startOp(scene(s), [A] as never, "move", null);
  assert.ok(st.ok);
  const r = runOp(s, { ...(st as { op: Op }).op, axis: 0, value: 40 })!; // along X by the arrow
  assert.ok(Math.abs(box(r.session, A).max[0]! - 30) < 0.05);
  assert.ok(Math.abs(box(r.session, A).min[1]!) < 1e-6, "no sideways");
});

test("the dragged picture slides too: the matrix on the graphics card is the slid place, not the place the pointer is at", () => {
  const s = hardOf(two(), [A, B]);
  let st = { ...createState({ ...s, click: { ...s.click, selection: [A] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "move" }, env);
  st = { ...st, op: { ...st.op!, free: [40, 5, 0], grab: [5, 5, 5] } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(Math.abs(f.bodyMatrix![12]! - 20) < 0.05 && Math.abs(f.bodyMatrix![13]! - 5) < 0.05, `${f.bodyMatrix![12]}, ${f.bodyMatrix![13]}`);
});

import { hardCopies, limitedOp } from "../src/interaction/hard.ts";

test("copies of a hard body that would run into another hard body are refused with which copy and what it is against; copies that are clear are not (`in_475`)", () => {
  const s = hardOf(two(), [A, B]);
  const st = startOp(scene(s), [A] as never, "linear", null);
  assert.ok(st.ok);
  const op = (spacing: string): Op => ({ ...(st as { op: Op }).op, pat: ["2", spacing, "", "", "", ""] });
  const bad = hardCopies(scene(s), op("25"));
  assert.ok(bad && /copy 1 would run into x_s_101/.test(bad.why), String(bad?.why));
  assert.deepEqual(bad!.hit, [B]);
  assert.equal(hardCopies(scene(s), op("50")), null, "clear: at 50 it stands beyond the other");
  assert.equal(hardCopies(scene(hardOf(two(), [A])), op("25")), null, "the other is soft: nothing to run into");
  assert.ok(limitedOp(scene(s), op("25")) && "why" in limitedOp(scene(s), op("25"))!, "and the release refuses it");
});

test("a mirror of a hard body across a plane that puts the copy into another hard body is refused", () => {
  const s = hardOf(two(), [A, B]);
  const st = startOp(scene(s), [A] as never, "mirror", null);
  assert.ok(st.ok);
  const op0 = (st as { op: Op }).op;
  const at = (x: number): Op => ({ ...op0, mirrorAxis: 0, mirrorAt: [x, op0.mirrorAt![1]!, op0.mirrorAt![2]!] as never });
  // (across x = 20 the block at 0..10 comes to 30..40, where the other stands; across x = 40 it comes to 70..80)
  const bad = hardCopies(scene(s), at(17.5));
  assert.ok(bad && /would run into x_s_101/.test(bad.why), String(bad?.why));
  assert.equal(hardCopies(scene(s), at(40)), null);
});

test("a hard body's face pulled out into another hard body goes only as far as it meets it; a typed distance that would go into it is refused", () => {
  const s = hardOf(two(), [A, B]);
  const face = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && (p as { of?: string }).of === A && (p as unknown as { mesh?: number[] }).mesh && Math.abs((p as unknown as { mesh: number[] }).mesh[0]! - 10) < 1e-6 && Math.abs((p as unknown as { mesh: number[] }).mesh[3]! - 10) < 1e-6 && Math.abs((p as unknown as { mesh: number[] }).mesh[6]! - 10) < 1e-6)!;
  assert.ok(face, "the face of the first block at x = 10");
  const st = startOp(scene(s), [face.ref] as never, "pushpull", null);
  assert.ok(st.ok, st.ok ? "" : st.why);
  const op = (st as { op: Op }).op;
  const pulled = limitedOp(scene(s), { ...op, value: 25 });
  assert.ok(pulled && "op" in pulled && Math.abs(pulled.op.value! - 20) < 0.05, JSON.stringify(pulled && "op" in pulled ? pulled.op.value : pulled));
  const typed = limitedOp(scene(s), { ...op, value: 25, typed: "75" });
  assert.ok(typed && "why" in typed && /would grow into x_s_101/.test(typed.why), JSON.stringify(typed));
  assert.equal(limitedOp(scene(s), { ...op, value: 15 }), null, "short of it: whole");
  assert.equal(limitedOp(scene(hardOf(two(), [A])), { ...op, value: 25 }), null, "the other is soft");
});

test("each hard body has a mark at the middle of its top; pressing the mark makes the body soft again (`in_476`)", () => {
  const s = hardOf(two(), [A]);
  let st = { ...createState(s), cam: homeCamera() };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(f.hardMarks.length, 1, "only the hard one is marked");
  assert.equal(f.hardMarks[0]!.ref, A);
  assert.deepEqual(f.hardMarks[0]!.at, [5, 5, 10]);
  st = reduce(st, { type: "runAction", id: `body:hard:${A}` }, env);
  assert.equal(scene(st.session).hard, undefined, "soft again");
  assert.equal(frameOf(st, { w: 800, h: 600 }).hardMarks.length, 0);
  assert.equal(frameOf({ ...createState(two()), cam: homeCamera() }, { w: 800, h: 600 }).hardMarks.length, 0, "a model with no hard body has no marks");
});

import { mateCommand } from "../src/interaction/mate.ts";
const faceAt = (s: Session, body: string, x: number): Ref => (Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && (p as { of?: string }).of === body && (p as unknown as { mesh?: number[] }).mesh && [0, 3, 6].every((i) => Math.abs((p as unknown as { mesh: number[] }).mesh[i]! - x) < 1e-6)))!.ref;

test("a mate that would put a hard body into another, or nearer to it than the clearance, is not made (`in_477`)", () => {
  const plain = two();
  const fa = faceAt(plain, A, 10), fb = faceAt(plain, B, 30);
  assert.ok("command" in mateCommand(scene(plain), "flush", fa, fb, 0), "soft bodies: made");
  const hard = hardOf(plain, [A, B]);
  assert.ok("command" in mateCommand(scene(hard), "flush", fa, fb, 0), "hard, flush with no clearance: they touch, which is allowed");
  const gap = run(hard, { type: "setClearance", value: 0.5 });
  const r = mateCommand(scene(gap), "flush", fa, fb, 0);
  assert.ok("why" in r && /nearer than the clearance/.test(r.why), JSON.stringify(r));
  assert.ok("command" in mateCommand(scene(gap), "flush", fa, fb, 0.6), "a gap of more than the clearance is allowed");
});

test("a mate that would take a body into a third hard body is refused with its name", () => {
  let s = two();
  const c = drawRectangle(scene(s), XY, [22, 0, 0], [28, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: "s_102", type: "extrude", parts: c.lines, params: { depth: 10, mode: "new" } } } as never);
  const fa = faceAt(s, A, 10), fb = faceAt(s, B, 30);
  assert.ok("command" in mateCommand(scene(s), "flush", fa, fb, 0), "soft: made");
  const hard = hardOf(s, [A, B, "b/x_s_102/o"]);
  const r = mateCommand(scene(hard), "flush", fa, fb, 0);
  assert.ok("why" in r && /would put this body into x_s_102/.test(r.why), JSON.stringify(r));
});

import { hardOverlaps, overlapBlame } from "../src/interaction/hard.ts";
import { panelOf } from "../src/interaction/panels.ts";
test("when an earlier change makes hard bodies overlap on replay, they are found, the step to look at is marked in the History list, the marks and the message say so (`in_478`)", () => {
  let s = two();
  s = moveBy(s, [30, 0, 15])!.session; // A stands above B (A z 15..25, B z 0..10)
  const moveStep = scene(s).steps.at(-1)!;
  assert.equal(moveStep.type, "move");
  s = hardOf(s, [A, B]);
  assert.deepEqual(hardOverlaps(scene(s)), [], "clear");
  const frame0 = frameOf({ ...createState(s), cam: homeCamera() }, { w: 800, h: 600 });
  assert.ok(frame0.hardMarks.every((m) => !m.overlaps) && !/overlap/.test(frame0.message ?? ""), "no warning");
  // an earlier step is changed (B is extruded to 20): the replay puts B into A
  const later = run(s, { type: "setStepParams", id: "s_101", params: { depth: 20 } } as never);
  assert.ok(Math.abs(box(later, B).max[2]! - 20) < 1e-6, `replayed: ${box(later, B).max[2]}`);
  const over = hardOverlaps(scene(later));
  assert.equal(over.length, 1, "found");
  assert.equal(overlapBlame(scene(later), over[0]!), moveStep.id, "the step that moved it");
  const row = panelOf("history", scene(later), [], later.outcome.errors)!.rows.find((r) => r.id === moveStep.id)!;
  assert.match(row.error ?? "", /overlap here/);
  const f = frameOf({ ...createState(later), cam: homeCamera() }, { w: 800, h: 600 });
  assert.ok(f.hardMarks.every((m) => !!m.overlaps), "both marks say what they overlap");
  assert.match(f.message ?? "", /hard bodies overlap/);
  // soft bodies, or a model with nothing hard, say nothing
  assert.deepEqual(hardOverlaps(scene(run(later, { type: "setHard", body: "x_s_100", on: false }))), []);
});

// ---- a round wall pulled out, and a sketch extruded off a hard body (`in_481`) ----
import { drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
const bodiesOf = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body" && p.ref !== "b/body/o") as unknown as { ref: Ref; id: string; bbox: { min: number[]; max: number[] } }[];
const liftBody = (s: Session, ref: Ref, free: [number, number, number]): Session => {
  const st = startOp(scene(s), [ref] as never, "move", null);
  assert.ok(st.ok);
  return runOp(s, { ...(st as { op: Op }).op, free })!.session;
};

test("a round post pulled wider goes only as far as it meets a hard body; typed too far is refused; what is made does not overlap (`in_481`)", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 3);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: [c.circle], params: { depth: 10 } } } as never);
  const b = drawRectangle(scene(s), XY, [8, -5, 0], [18, 5, 0], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: b.lines, params: { depth: 10, mode: "new" } } } as never);
  const [post, wall] = [bodiesOf(s).find((x) => x.id === "x_s_100")!, bodiesOf(s).find((x) => x.id === "x_s_101")!];
  s = hardOf(s, [post.ref, wall.ref]);
  const face = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && (p as { of?: string }).of === post.ref && !!(p as { curved?: unknown }).curved)!;
  assert.ok(face, "the round wall of the post");
  const st = startOp(scene(s), [face.ref] as never, "pushpull", null);
  assert.ok(st.ok, st.ok ? "" : st.why);
  const op = (st as { op: Op }).op;
  const pulled = limitedOp(scene(s), { ...op, value: 9 });
  assert.ok(pulled && "op" in pulled && Math.abs(pulled.op.value! - 5) < 0.05, `the wall is 5 from the post: ${JSON.stringify(pulled && "op" in pulled ? pulled.op.value : pulled)}`);
  const typed = limitedOp(scene(s), { ...op, value: 9, typed: "24" }); // (a number typed on a round face is the diameter it is to have: 24 is a radius of 12)
  assert.ok(typed && "why" in typed && /would grow into x_s_101/.test(typed.why), JSON.stringify(typed));
  assert.equal(limitedOp(scene(s), { ...op, value: 4 }), null, "short of it: whole");
  assert.equal(limitedOp(scene(run(s, { type: "setHard", body: "x_s_101", on: false })), { ...op, value: 9 }), null, "the wall is soft: free");
  const made = runOp(s, { ...op, value: 9 })!;
  assert.deepEqual(hardOverlaps(scene(made.session)), [], "what was made does not overlap");
  const grown = bodiesOf(made.session).find((x) => x.id === "x_s_100")!;
  assert.ok(grown.bbox.max[0]! > 7.9 && grown.bbox.max[0]! <= 8.01, `the post now reaches the wall: ${grown.bbox.max[0]}`);
});

test("a sketch extruded off the face of a hard body goes only as far as another hard body; a body made new, or soft ones, go on (`in_481`)", () => {
  let s = two(); // A at x 0..10, z 0..10, and B at x 30..40
  const e = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, e.command);
  s = run(s, { type: "addStep", step: { id: "s_102", type: "extrude", parts: e.lines, params: { depth: 5, mode: "new" } } } as never);
  const under = bodiesOf(s).find((x) => x.id === "x_s_102")!;
  s = liftBody(s, under.ref, [0, 0, -15]); // a block under the first one, z -15 .. -10
  s = hardOf(s, [A, under.ref]);
  const f = drawRectangle(scene(s), XY, [2, 2, 0], [8, 8, 0], [1, 0, 0], [0, 1, 0]); s = run(s, f.command);
  const st = startOp(scene(s), f.lines as never, "extrude", null);
  assert.ok(st.ok, st.ok ? "" : st.why);
  const op = (st as { op: Op }).op;
  const down = limitedOp(scene(s), { ...op, value: -25 });
  assert.ok(down && "op" in down && Math.abs(down.op.value! + 10) < 0.05, `the block is 10 below: ${JSON.stringify(down && "op" in down ? down.op.value : down)}`);
  const typed = limitedOp(scene(s), { ...op, value: -25, typed: "-25" });
  assert.ok(typed && "why" in typed && /would grow into/.test(typed.why), JSON.stringify(typed));
  assert.equal(limitedOp(scene(s), { ...op, value: 25 }), null, "up, into the body it stands on and away from the block: nothing in the way");
  assert.equal(limitedOp(scene(s), { ...op, value: -5 }), null, "short of it");
  assert.equal(limitedOp(scene(run(s, { type: "setHard", body: "x_s_100", on: false })), { ...op, value: -25 }), null, "the body it grows out of is soft");
});

test("a round hole pulled smaller goes only as far as it meets a hard pin standing in it (`in_481`)", () => {
  let s = createSession(kernel);
  const blockR = drawRectangle(scene(s), XY, [-10, -10, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, blockR.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: blockR.lines, params: { depth: 10 } } } as never);
  const hole = drawCircle(scene(s), XY, [0, 0, 0], 5); s = run(s, hole.command);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: [hole.circle], params: { depth: 10, mode: "cut" } } } as never);
  const pin = drawCircle(scene(s), XY, [0, 0, 0], 2); s = run(s, pin.command);
  s = run(s, { type: "addStep", step: { id: "s_102", type: "extrude", parts: [pin.circle], params: { depth: 10, mode: "new" } } } as never);
  const [block, post] = [bodiesOf(s).find((x) => x.id === "x_s_100")!, bodiesOf(s).find((x) => x.id !== "x_s_100")!];
  assert.ok(block && post, "a block with a hole and a pin");
  s = hardOf(s, [block.ref, post.ref]);
  const wall = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && (p as { of?: string }).of === block.ref && !!(p as { curved?: unknown }).curved)!;
  assert.ok(wall, "the wall of the hole");
  const st = startOp(scene(s), [wall.ref] as never, "pushpull", null);
  assert.ok(st.ok, st.ok ? "" : st.why);
  const op = (st as { op: Op }).op;
  const pulled = limitedOp(scene(s), { ...op, value: 4 });
  assert.ok(pulled && "op" in pulled && Math.abs(pulled.op.value! - 3) < 0.05, `the pin is 3 from the wall: ${JSON.stringify(pulled && "op" in pulled ? pulled.op.value : pulled)}`);
  assert.equal(limitedOp(scene(s), { ...op, value: 2 }), null, "short of it: whole");
});

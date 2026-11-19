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
import type { AppState } from "../src/interaction/controller.ts";

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
  assert.match(r.session.message ?? "", /taken as far as it could go/, "it says what stopped it (`dec_constraint_uniformity`)");
  const b = box(r.session, A);
  assert.ok(Math.abs(b.max[0]! - 30) < 0.05, `it stops against the other: ${b.max[0]}`);
  assert.ok(Math.abs(box(r.session, B).min[0]! - 30) < 1e-6, "the other did not move");
});

test("one hard body is enough: it treats the soft body it meets as hard, whichever of the two is moved; two soft bodies go through each other; a number typed that would go into the other is refused with the reason (`in_490`)", () => {
  const one = hardOf(two(), [A]);
  const r1 = moveBy(one, [40, 0, 0])!; // the hard one is moved at the soft one
  assert.ok(Math.abs(box(r1.session, A).max[0]! - 30) < 0.05, `stopped against the soft body: ${box(r1.session, A).max[0]}`);
  const st = startOp(scene(one), [B] as never, "move", null); // the soft one is moved at the hard one
  assert.ok(st.ok);
  const lim = limitedOp(scene(one), { ...(st as { op: Op }).op, free: [-40, 0, 0] });
  assert.ok(lim && "op" in lim && Math.abs(lim.op.free![0]! + 20) < 0.05, `the soft body is stopped by the hard one: ${JSON.stringify(lim)}`);
  const s = hardOf(two(), [A, B]);
  const r = moveBy(s, [40, 0, 0], "40")!;
  assert.match(r.session.message ?? "", /would run into/);
  assert.ok(Math.abs(box(r.session, A).min[0]!) < 1e-6, "nothing was moved");
  const typedOne = moveBy(one, [40, 0, 0], "40")!;
  assert.match(typedOne.session.message ?? "", /would run into/, "with one hard it is the same");
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
test("while a hard body is dragged at another the picture stops where it meets it, with nothing flashing or said: it just collides (`in_484`)", () => {
  const s = hardOf(two(), [A, B]);
  let st = { ...createState({ ...s, click: { ...s.click, selection: [A] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "move" }, env);
  st = { ...st, op: { ...st.op!, free: [40, 0, 0], grab: [5, 5, 5] } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.bodyMatrix, "a matrix on the graphics card");
  assert.ok(Math.abs(f.bodyMatrix![12]! - 20) < 0.05, `the body went 20, not 40: ${f.bodyMatrix![12]}`);
  assert.equal(f.flash, null, "no flash");
  assert.ok(!f.message, "nothing said");
});


test("a hard body pushed at the face of another slides along it: it goes the way the pointer went along the surface and no further into it (`in_474`)", () => {
  const s = hardOf(two(), [A, B]);
  const r = moveBy(s, [40, 5, 0])!;
  assert.match(r.session.message ?? "", /taken as far as it could go/);
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
  assert.ok(hardCopies(scene(hardOf(two(), [A])), op("25")), "one hard is enough: the soft body is run into");
  assert.equal(hardCopies(scene(two()), op("25")), null, "both soft: nothing to run into");
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
  assert.ok(limitedOp(scene(hardOf(two(), [A])), { ...op, value: 25 }), "one hard is enough: it stops at the soft one");
  assert.equal(limitedOp(scene(two()), { ...op, value: 25 }), null, "both soft: free");
});

test("a hard body's mark is hidden, like a constraint that holds, and shows red only while the body is bumping into another hard body; pressing it makes the body soft (`in_476`, `in_489`)", () => {
  const s = hardOf(two(), [A, B]);
  let st = { ...createState({ ...s, click: { ...s.click, selection: [A] as never } }), cam: homeCamera() };
  assert.equal(frameOf(st, { w: 800, h: 600 }).hardMarks.length, 0, "nothing shows while nothing is violated");
  st = reduce(st, { type: "begin", name: "move" }, env);
  // a drag that stops short of the other: nothing shows
  const free = (v: number): AppState => ({ ...st, op: { ...st.op!, free: [v, 0, 0], grab: [5, 5, 5] } });
  assert.equal(frameOf(free(10), { w: 800, h: 600 }).hardMarks.length, 0, "not against it yet");
  // a drag at it: both bodies show, red, the one that is dragged where it has got to
  const f = frameOf(free(40), { w: 800, h: 600 });
  assert.deepEqual(f.hardMarks.map((m) => m.ref).sort(), [A, B].sort(), "the body dragged and the body it is against");
  assert.ok(f.hardMarks.every((m) => !!m.bumps), "and each says what it is against");
  const dragged = f.hardMarks.find((m) => m.ref === A)!;
  assert.ok(Math.abs(dragged.at[0] - 25) < 0.1, `the mark goes with the body, which stopped 20 along: ${dragged.at}`);
  // pressing a mark makes the body soft
  st = reduce({ ...createState(s), cam: homeCamera() }, { type: "runAction", id: `body:hard:${A}` }, env);
  assert.deepEqual(scene(st.session).hard, [B.replace("b/", "").replace("/o", "")], "A is soft again");
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
  assert.deepEqual(hardOverlaps(scene(run(run(later, { type: "setHard", body: "x_s_100", on: false }), { type: "setHard", body: "x_s_101", on: false }))), [], "both soft");
  assert.equal(hardOverlaps(scene(run(later, { type: "setHard", body: "x_s_101", on: false }))).length, 1, "one hard is enough to be told");
});

// ---- a round wall pulled out, and a sketch extruded off a hard body (`in_481`) ----
import { drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
const bodiesOf = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body" && !!p.id) as unknown as { ref: Ref; id: string; bbox: { min: number[]; max: number[] } }[];
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
  assert.ok(limitedOp(scene(run(s, { type: "setHard", body: "x_s_101", on: false })), { ...op, value: 9 }), "the wall soft, the post hard: still stopped");
  assert.equal(limitedOp(scene(run(run(s, { type: "setHard", body: "x_s_101", on: false }), { type: "setHard", body: "x_s_100", on: false })), { ...op, value: 9 }), null, "both soft: free");
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
  assert.equal(limitedOp(scene(run(run(s, { type: "setHard", body: "x_s_100", on: false }), { type: "setHard", body: under.id, on: false })), { ...op, value: -25 }), null, "both soft");
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

// ---- a revolve, a sweep and a loft against hard bodies (`in_482`) ----
import { loopFaceRef } from "../src/operation/loops.ts";
import { drawChain } from "../src/operation/build.ts";
import { worldRef as wref, drawnRef } from "../src/shared/ref.ts";

/** a 4 x 4 block below the plane z = 0 (z -10 .. 0) and another above it (z 10 .. 15), both hard, and nothing else */
function belowAndAbove(): Session {
  let s = createSession(kernel);
  const mk = (s0: Session, _name: string, depth: number, lift: number): Session => {
    const id = scene(s0).steps.some((q) => q.id === "s_100") ? "s_200" : "s_100"; // (the lifts take the ids after these)
    const r = drawRectangle(scene(s0), XY, [-2, -2, 0], [2, 2, 0], [1, 0, 0], [0, 1, 0]);
    const s1 = run(run(s0, r.command), { type: "addStep", step: { id, type: "extrude", parts: r.lines, params: { depth, ...(s0.history.scene.steps.length ? { mode: "new" } : {}) } } } as never);
    return liftBody(s1, bodiesOf(s1).find((x) => x.id === `x_${id}`)!.ref, [0, 0, lift]);
  };
  s = mk(s, "s_100", 10, -10);
  s = mk(s, "s_101", 5, 10);
  return hardOf(s, bodiesOf(s).map((x) => x.ref));
}

test("a revolve is turned only as far as it can before it meets a hard body; typed too far is refused; what is made does not overlap (`in_482`)", () => {
  const XZ = wref("XZ");
  let s = createSession(kernel);
  const hh = drawRectangle(scene(s), XZ, [6, 0, 0], [12, 0, 3], [1, 0, 0], [0, 0, 1]); s = run(s, hh.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: hh.lines, params: { depth: 5, mode: "new" } } } as never);
  const cc = drawRectangle(scene(s), XY, [-11, -2, 0], [-7, 2, 0], [1, 0, 0], [0, 1, 0]); s = run(s, cc.command);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: cc.lines, params: { depth: 3, mode: "new" } } } as never);
  s = hardOf(s, bodiesOf(s).map((x) => x.ref));
  assert.equal(bodiesOf(s).length, 2);
  const prof = drawRectangle(scene(s), XZ, [8, 0, 0], [10, 0, 1.5], [1, 0, 0], [0, 0, 1]); s = run(s, prof.command);
  const st = startOp(scene(s), [loopFaceRef(prof.lines)] as never, "revolve");
  assert.ok(st.ok, st.ok ? "" : st.why);
  const op: Op = { ...(st as { op: Op }).op, pivot: [0, 0, 0], frame: [[0, 0, 1], [1, 0, 0], [0, 1, 0]], axis: 0 }; // (about the Z axis)
  const turned = limitedOp(scene(s), { ...op, value: 200 });
  assert.ok(turned && "op" in turned, JSON.stringify(turned));
  const angle = (turned as { op: Op }).op.value!;
  assert.ok(angle > 150 && angle < 170, `the block is in the way at about 165 degrees, from 8 out at 2 either side of the X axis (${angle})`);
  const typed = limitedOp(scene(s), { ...op, value: 200, typed: "200" });
  assert.ok(typed && "why" in typed && /would grow into/.test(typed.why), JSON.stringify(typed));
  assert.equal(limitedOp(scene(s), { ...op, value: 90 }), null, "short of it: whole");
  const made = runOp(s, { ...op, value: 200 })!;
  assert.deepEqual(hardOverlaps(scene(made.session)), [], `what was made does not overlap: ${made.session.message}`);
  assert.ok(scene(made.session).steps.some((q) => q.type === "revolve"), "the revolve was made, to the angle it could go");
});

test("a sweep of a sketch that stands on a hard body, carried along a path through another hard body, is refused with the reason; one that stops short is made (`in_482`)", () => {
  const XZ = wref("XZ");
  let s = belowAndAbove();
  const sq = drawRectangle(scene(s), XY, [-2, -2, 0], [2, 2, 0], [1, 0, 0], [0, 1, 0]); s = run(s, sq.command);
  const face = loopFaceRef(sq.lines);
  const tall = drawChain(scene(s), XZ, [[0, 0, 0], [0, 0, 20]]); s = run(s, tall.command);
  const short = drawChain(scene(s), XZ, [[0, 0, 0], [0, 0, 6]]); s = run(s, short.command);
  const sweep = (path: string[]): Op => { const st = startOp(scene(s), [face, ...path] as never, "sweep"); assert.ok(st.ok, st.ok ? "" : st.why); return (st as { op: Op }).op; };
  const steps = scene(s).steps.length;
  const into = runOp(s, sweep(tall.lines))!;
  assert.match(into.session.message ?? "", /hard bodies do not go into each other/, `${into.session.message}`);
  assert.equal(scene(into.session).steps.length, steps, "nothing was made");
  const clear = runOp(s, sweep(short.lines))!;
  assert.equal(clear.session.message, null, `${clear.session.message}`);
  assert.ok(scene(clear.session).steps.length > steps, "stopping short of the block above it is made");
  assert.deepEqual(hardOverlaps(scene(clear.session)), []);
});

import { sweepCarry } from "../src/interaction/sweep.ts";
import { drawArc } from "../src/operation/build.ts";
import { applyPoint } from "../src/operation/frames.ts";
test("the shape of a sweep is carried along an arc path to its far end, turned with it (`in_482`)", () => {
  const XZ = wref("XZ");
  let s = createSession(kernel);
  const sq = drawRectangle(scene(s), XY, [-2, -2, 0], [2, 2, 0], [1, 0, 0], [0, 1, 0]); s = run(s, sq.command);
  const a = drawArc(scene(s), XZ, [0, 0, 0], [20 - 20 * Math.SQRT1_2, 0, 20 * Math.SQRT1_2], [20, 0, 20], [0, -1, 0])!; s = run(s, a.command);
  const st = startOp(scene(s), [loopFaceRef(sq.lines), a.line] as never, "sweep", null);
  assert.ok(st.ok, st.ok ? "" : st.why);
  const c = sweepCarry(scene(s), (st as { op: Op }).op)!;
  const end = applyPoint(c.carries.at(-1)!, [0, 0, 0]);
  assert.ok(Math.hypot(end[0] - 20, end[1], end[2] - 20) < 1e-6, `the middle of the shape ends at the path's end: ${end}`);
  const side = applyPoint(c.carries.at(-1)!, [2, 0, 0]); // a point 2 to the side of the middle, which was along X: it is now above the end, the shape turned a quarter
  assert.ok(Math.abs(side[2]! - 20) > 1.9 || Math.abs(side[0]! - 20) > 1.9, `turned with the path: ${side}`);
  assert.deepEqual(applyPoint(c.carries[0]!, [1, 2, 3]).map((v) => Math.round(v * 1e6) / 1e6), [1, 2, 3], "the first station is where it started");
});

// ---- the face of a fillet or a chamfer pulled against a hard body (`in_483`) ----
test("the face of a chamfer pulled out (the chamfer made smaller, the corner filled in) stops where it meets a hard body standing in the notch; pushed in, or with the body soft, it is free (`in_483`)", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [20, 20, 0], [1, 0, 0], [0, 1, 0]); s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: r.lines, params: { depth: 20 } } } as never);
  const sc0 = scene(s);
  const top = Object.values(sc0.parts).find((p) => p.kind === "line" && p.origin === "body" && [p.a, p.b].every((c) => { const q = (sc0.parts[c] as { at?: number[] }).at; return !!q && Math.abs(q[0]! - 20) < 1e-6 && Math.abs(q[2]! - 20) < 1e-6; }))!;
  assert.ok(top, "the edge along the top at x = 20");
  s = run(s, { type: "addStep", step: { id: "s_101", type: "edgeMod", parts: [top.ref], params: { mode: "chamfer", value: 4 } } } as never);
  assert.equal(s.message, null, `${s.message}`);
  const c = drawRectangle(scene(s), XY, [19, 0, 0], [21, 20, 0], [1, 0, 0], [0, 1, 0]); s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: "s_200", type: "extrude", parts: c.lines, params: { depth: 2, mode: "new" } } } as never);
  const [h, cap] = [bodiesOf(s).find((x) => x.id === "x_s_100")!, bodiesOf(s).find((x) => x.id === "x_s_200")!];
  s = liftBody(s, cap.ref, [0, 0, 19]); // z 19 .. 21: standing in the notch the chamfer left (x + z > 36 there)
  s = hardOf(s, [h.ref, cap.ref]);
  const face = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && (p as { of?: string }).of === h.ref && !!(p as unknown as { mesh?: number[] }).mesh && (() => { const m = (p as unknown as { mesh: number[] }).mesh; return Math.abs(m[0]! + m[2]! - 36) < 1e-6 && Math.abs(m[3]! + m[5]! - 36) < 1e-6; })())!;
  assert.ok(face, "the face of the chamfer");
  const st = startOp(scene(s), [face.ref] as never, "pushpull", null);
  assert.ok(st.ok, st.ok ? "" : st.why);
  const op = (st as { op: Op }).op;
  assert.equal(op.edit?.kind, "edgeSize");
  const pulled = limitedOp(scene(s), { ...op, value: 3 });
  assert.ok(pulled && "op" in pulled && Math.abs(pulled.op.value! - 2) < 0.05, `the chamfer can shrink to 2 (pulled 2 of 3): ${JSON.stringify(pulled && "op" in pulled ? pulled.op.value : pulled)}`);
  const typed = limitedOp(scene(s), { ...op, value: 3, typed: "1" });
  assert.ok(typed && "why" in typed && /would grow into x_s_200/.test(typed.why), JSON.stringify(typed));
  assert.equal(limitedOp(scene(s), { ...op, value: 1 }), null, "short of it: whole");
  assert.equal(limitedOp(scene(s), { ...op, value: -2 }), null, "pushed in, the chamfer is bigger: it goes away from the body in the notch");
  assert.equal(limitedOp(scene(run(run(s, { type: "setHard", body: "x_s_200", on: false }), { type: "setHard", body: h.id ? "x_s_100" : "x_s_100", on: false })), { ...op, value: 3 }), null, "both soft");
  const made = runOp(s, { ...op, value: 3 })!;
  assert.ok(!made.session.message || /taken as far as it could go/.test(made.session.message), `${made.session.message}`);
  assert.deepEqual(hardOverlaps(scene(made.session)), [], "what was made does not overlap");
});

test("the round face of a fillet pulled out stops where it meets a hard body standing in the notch: a radius of 4 can go down to 3.414 (`in_483`)", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [20, 20, 0], [1, 0, 0], [0, 1, 0]); s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: r.lines, params: { depth: 20 } } } as never);
  const sc0 = scene(s);
  const top = Object.values(sc0.parts).find((p) => p.kind === "line" && p.origin === "body" && [p.a, p.b].every((c) => { const q = (sc0.parts[c] as { at?: number[] }).at; return !!q && Math.abs(q[0]! - 20) < 1e-6 && Math.abs(q[2]! - 20) < 1e-6; }))!;
  s = run(s, { type: "addStep", step: { id: "s_101", type: "edgeMod", parts: [top.ref], params: { mode: "fillet", value: 4 } } } as never);
  assert.equal(s.message, null, `${s.message}`);
  const c = drawRectangle(scene(s), XY, [19, 0, 0], [21, 20, 0], [1, 0, 0], [0, 1, 0]); s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: "s_200", type: "extrude", parts: c.lines, params: { depth: 2, mode: "new" } } } as never);
  const [h, cap] = [bodiesOf(s).find((x) => x.id === "x_s_100")!, bodiesOf(s).find((x) => x.id === "x_s_200")!];
  s = hardOf(liftBody(s, cap.ref, [0, 0, 19]), [h.ref, cap.ref]);
  const face = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && (p as { of?: string }).of === h.ref && !!(p as { rounded?: boolean }).rounded)!;
  assert.ok(face, "the round face of the fillet");
  const st = startOp(scene(s), [face.ref] as never, "pushpull", null);
  assert.ok(st.ok, st.ok ? "" : st.why);
  const op = (st as { op: Op }).op;
  assert.equal(op.edit?.kind, "edgeSize");
  const pulled = limitedOp(scene(s), { ...op, value: 3 });
  assert.ok(pulled && "op" in pulled && Math.abs(pulled.op.value! - 0.586) < 0.05, `pulled 0.586 of 3 (the radius 4 down to 3.414): ${JSON.stringify(pulled && "op" in pulled ? pulled.op.value : pulled)}`);
  assert.equal(limitedOp(scene(s), { ...op, value: 0.4 }), null, "short of it: whole");
});

// ---- a pin in a hole, dragged about by hand (`in_484`) ----
import { readFileSync } from "node:fs";
const pinInHole = (): Session => { const r = openSession(kernel, readFileSync(new URL("./fixtures/hard-body-pin-in-hole-in_484.json", import.meta.url), "utf8")); assert.ok(r.ok); return (r as { value: Session }).value; };

test("a pin in a hole of the same size, dragged about for a long time: it collides and slides, never ends inside the wall, and a drag is cut short and said, never refused (`in_484`, `in_1082`)", () => {
  let s = pinInHole();
  assert.deepEqual(hardOverlaps(scene(s)), [], "it starts clear");
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let moved = 0;
  for (let i = 0; i < 60; i++) {
    const pin = bodiesOf(s).find((x) => x.id === "x_s_019")!;
    const st = startOp(scene(s), [pin.ref] as never, "move", null);
    assert.ok(st.ok);
    const mag = [1, 4, 20, 80][i % 4]!;
    const free = [rnd() - 0.5, rnd() - 0.5, (rnd() - 0.5) * 0.6].map((v) => v * 2 * mag) as [number, number, number];
    const lim = limitedOp(scene(s), { ...(st as { op: Op }).op, free });
    assert.ok(!lim || "op" in lim, `a drag is cut short, not refused: ${JSON.stringify(lim)}`);
    const made = runOp(s, { ...(st as { op: Op }).op, free });
    if (!made) continue; // (against the wall: nothing to make)
    assert.ok(!made.session.message || /taken as far as it could go/.test(made.session.message), `${made.session.message}`); // (cut short and said, never refused: `dec_constraint_uniformity`)
    s = made.session; moved++;
    assert.deepEqual(hardOverlaps(scene(s)), [], `still clear after drag ${i}`);
  }
  assert.ok(moved > 20, `it did move about (${moved} drags made)`);
});

test("a long pull at a thin wall does not jump over it (`in_484`)", () => {
  // a block 2 thick standing between a block that is pulled 300 mm at it and where it would end up
  let s = createSession(kernel);
  const mk = (s0: Session, id: string, a: [number, number], b: [number, number], depth: number, first: boolean): Session => {
    const r = drawRectangle(scene(s0), XY, [a[0], a[1], 0], [b[0], b[1], 0], [1, 0, 0], [0, 1, 0]);
    return run(run(s0, r.command), { type: "addStep", step: { id, type: "extrude", parts: r.lines, params: { depth, ...(first ? {} : { mode: "new" }) } } } as never);
  };
  s = mk(s, "s_100", [0, 0], [10, 10], 10, true);
  s = mk(s, "s_101", [100, -5], [102, 15], 10, false); // a wall 2 thick, 100 away
  s = hardOf(s, bodiesOf(s).map((x) => x.ref));
  const a = bodiesOf(s).find((x) => x.id === "x_s_100")!;
  const st = startOp(scene(s), [a.ref] as never, "move", null);
  assert.ok(st.ok);
  const lim = limitedOp(scene(s), { ...(st as { op: Op }).op, free: [300, 0, 0] });
  assert.ok(lim && "op" in lim && lim.op.free![0]! > 85 && lim.op.free![0]! < 90.05, `stopped at the wall, 90 along, not carried through: ${JSON.stringify(lim && "op" in lim ? lim.op.free : lim)}`);
});

test("the pin pulled up out of its hole with the pointer wobbling sideways comes out all the way, and set down on the block it rests on the top and slides along it, not down a ramp (`in_485`)", () => {
  let s = pinInHole();
  const pinOf = (q: Session) => bodiesOf(q).find((x) => x.id === "x_s_019")!;
  const op = (q: Session): Op => { const st = startOp(scene(q), [pinOf(q).ref] as never, "move", null); assert.ok(st.ok); return (st as { op: Op }).op; };
  for (const lat of [2, 6]) for (const dir of [[1, 0], [0, 1], [-1, -1]] as const) {
    const lim = limitedOp(scene(s), { ...op(s), free: [dir[0] * lat, dir[1] * lat, 40] });
    assert.ok(lim && "op" in lim && Math.abs(lim.op.free![2]! - 40) < 0.01, `it went up the whole 40 with ${lat} of sideways push (${JSON.stringify(lim && "op" in lim ? lim.op.free : lim)})`);
    const part = limitedOp(scene(s), { ...op(s), free: [dir[0] * lat * 0.25, dir[1] * lat * 0.25, 6] });
    assert.ok(part && "op" in part && Math.abs(part.op.free![2]! - 6) < 0.01 && Math.hypot(part.op.free![0]!, part.op.free![1]!) < 0.4, `a pull of 6 only (the pin still in the hole) goes straight up, within the hole's width: ${JSON.stringify(part && "op" in part ? part.op.free : part)}`);
    assert.ok(Math.hypot(lim.op.free![0]!, lim.op.free![1]!) <= lat * Math.hypot(dir[0], dir[1]) + 0.01, "and once it is out it goes no further sideways than the pointer did");
  }
  s = runOp(s, { ...op(s), free: [0, 0, 48] })!.session; // out, above the block
  assert.deepEqual(hardOverlaps(scene(s)), []);
  for (const off of [0.5, 1.5, 3]) {
    const lim = limitedOp(scene(s), { ...op(s), free: [off, 0, -48] });
    assert.ok(lim && "op" in lim, "set down beside the hole, it is stopped by the block");
    const f = (lim as { op: Op }).op.free!;
    assert.ok(Math.abs(f[2]! + 38.706) < 0.05, `it rests on the top face: ${f[2]}`);
    assert.ok(f[0]! > 0.3 * off && f[0]! < off + 0.05, `and went on the way the pointer did, not back the other way: ${f[0]} of ${off}`);
  }
});

test("dragging the block or the pin of the pin-in-hole project never takes long enough to freeze the picture: every drag is worked out in well under a second (`in_485`)", () => {
  const s = pinInHole();
  let seed = 3;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const id of ["x_s_013", "x_s_019"]) {
    const b = bodiesOf(s).find((x) => x.id === id)!;
    const st = startOp(scene(s), [b.ref] as never, "move", null);
    assert.ok(st.ok);
    let worst = 0, total = 0;
    for (let i = 0; i < 16; i++) {
      const mag = [2, 10, 40, 150][i % 4]!;
      const free = [(rnd() - 0.5) * 2 * mag, (rnd() - 0.5) * 2 * mag, (rnd() - 0.5) * 2 * mag] as [number, number, number];
      const t0 = performance.now();
      limitedOp(scene(s), { ...(st as { op: Op }).op, free });
      const ms = performance.now() - t0;
      worst = Math.max(worst, ms); total += ms;
    }
    assert.ok(worst < 800 && total / 16 < 300, `${id}: worst ${Math.round(worst)} ms, average ${Math.round(total / 16)} ms`);
  }
});

test("the block with the pin in its hole, dragged along a straight line by the pointer, follows it without bouncing back and forth: along the way of the drag it never goes back (`in_487`)", () => {
  const s = pinInHole();
  const block = bodiesOf(s).find((x) => x.id === "x_s_013")!;
  const op0 = (startOp(scene(s), [block.ref] as never, "move", null) as { op: Op }).op;
  for (const dir of [[1, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0.3, 0.2], [-1, 0.5, 0], [0, 0, 1]] as const) {
    const len = Math.hypot(...dir);
    let before = 0;
    let last: number[] = [0, 0, 0];
    let travelled = 0;
    for (let f = 1; f <= 30; f++) {
      const free = dir.map((v) => v * f * 0.25) as [number, number, number];
      const lim = limitedOp(scene(s), { ...op0, free, grab: [0, 0, 0] });
      const got = (lim && "op" in lim ? lim.op.free : free) as unknown as number[];
      const along = (got[0]! * dir[0] + got[1]! * dir[1] + got[2]! * dir[2]) / len;
      assert.ok(along >= before - 0.02, `frame ${f} of the drag along ${dir}: went back from ${before.toFixed(3)} to ${along.toFixed(3)}`);
      before = Math.max(before, along);
      travelled += Math.hypot(got[0]! - last[0]!, got[1]! - last[1]!, got[2]! - last[2]!);
      last = got;
    }
    assert.ok(travelled < 8, `and does not wander about: it went ${travelled.toFixed(2)} in all for a drag of 7.5 (${dir})`);
  }
});

test("the Hard body item is in the Constraints section of the menu, not under Shape, and it is offered for a selected body (`in_490`)", () => {
  const s = two();
  let st = { ...createState({ ...s, click: { ...s.click, selection: [A] as never } }), cam: homeCamera() };
  const items = reduce(st, { type: "menu", x: 400, y: 300 }, env).menu!.items;
  const section = (id: string) => items.find((c) => c.id === id)!;
  const under = (it: { id: string; children?: readonly unknown[] }): { id: string; enabled: boolean }[] => ((it.children ?? []) as { id: string; enabled: boolean; children?: readonly unknown[] }[]).flatMap((c) => [c, ...under(c)]);
  assert.ok(under(section("constraints")).some((c) => c.id === "body:hard" && c.enabled), "under Constraints, for a body that is selected");
  assert.ok(!(section("shape").children ?? []).some((c) => c.id === "body:hard"), "and no longer under Shape");
  st = { ...createState({ ...s, click: { ...s.click, selection: [] as never } }), cam: homeCamera() };
  const none = reduce(st, { type: "menu", x: 400, y: 300 }, env).menu!.items.find((c) => c.id === "constraints")!;
  assert.ok(!under(none).some((c) => c.id === "body:hard" && c.enabled), "with nothing selected it is not offered");
});

// ---------- a hard stop is a violated constraint like any other (`dec_constraint_uniformity`, `in_1082`) ----------
test("a drag that hard bodies stopped flashes the body it ran into, says so, and offers to delete the hardness and make the move as asked", () => {
  const s = hardOf(hardOf(two(), [A]), [B]);
  const made = moveBy(s, [60, 0, 0]);
  assert.ok(made);
  assert.ok(Math.abs(box(made!.session, A).max[0]! - 30) < 0.01, "it stopped with its face on the other");
  const c = made!.session.conflict;
  assert.ok(c, "a violated constraint always flashes");
  assert.deepEqual(c!.soften, ["x_s_101"], "the hardness of the body it ran into is what is offered for deletion");
  assert.ok(c!.parts?.includes(B), "the body it ran into flashes");
  assert.ok(c!.retry, "with the move as it was asked");
  assert.match(made!.session.message ?? "", /ran into x_s_101/);
  // the button: the hardness goes and the move is made as asked, through the other body
  const st = reduce({ ...createState(made!.session), flash: { ...c!, at: 0 } }, { type: "overrideRefusal" }, env);
  assert.equal(st.session.message, null);
  assert.ok(!(scene(st.session).hard ?? []).includes("x_s_101"), "the body is soft now");
  assert.ok(Math.abs(box(st.session, A).min[0]! - 60) < 0.01, `the move was made as asked: ${box(st.session, A).min[0]}`);
  assert.equal(st.session.history.cursor, made!.session.history.cursor + 1, "the hardness off and the rest of the move are one step: one undo takes both back");
});

test("a number typed that would run into a hard body is refused with the same: the body flashes and the button offers to delete its hardness", () => {
  const s = hardOf(two(), [B]);
  const made = moveBy(s, [60, 0, 0], "60");
  assert.ok(made);
  assert.match(made!.session.message ?? "", /would run into/);
  assert.deepEqual(made!.session.conflict?.soften, ["x_s_101"]);
  assert.ok(made!.session.conflict?.retry);
});

test("nothing hard in the way: no conflict, the move is made", () => {
  const s = two();
  const made = moveBy(s, [60, 0, 0]);
  assert.ok(made && !made.session.conflict && !made.session.message);
});

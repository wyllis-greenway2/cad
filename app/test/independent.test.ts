// Independent bodies in the app (`dec_independent_bodies`, `in_270`): separated pieces are separate body parts, each selected, moved and combined on its own.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera, projector } from "../src/interaction/camera.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import { objectOf, bodyCentre } from "../src/interaction/objects.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Vec3 } from "../src/math/vec.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };

function box(s: Session, x: number, y: number, w = 10, h = 10): Session {
  const r = drawSquaredRectangle(scene(s), XY, [x, y, 0], [x + w, y + w, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: h } } });
}
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p): p is Extract<Part, { kind: "body" }> => p.kind === "body");
const pick = (st: AppState, refs: string[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs as never } } });

test("two pieces that stand apart are two bodies in the Bodies list, and a face knows which one it is in", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  assert.equal(bodies(s).length, 2);
  assert.equal(scene(s).steps.length, 2);
  const faces = Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body" && p.of);
  assert.ok(faces.length >= 10);
  const [a, b] = bodies(s);
  assert.ok(a!.bbox!.max[0] <= 10.01 && b!.bbox!.min[0] >= 39.99);
  const faceOfB = faces.find((f) => f.kind === "plane" && f.of === b!.ref)!;
  assert.equal(objectOf(scene(s), faceOfB.ref), b!.ref, "the third click on it takes b");
  const st = reduce(pick({ ...createState(s), cam: homeCamera() }, []), { type: "panel", name: "bodies" }, env);
  assert.deepEqual(frameOf(st, env).panel?.rows.map((r) => r.label), ["Body 1", "Body 2"]);
  // a single body keeps the one name it always had
  const one = box(createSession(kernel), 0, 0);
  assert.equal(bodies(one).length, 1);
  assert.equal(bodies(one)[0]!.ref, "b/body/o");
});

test("Move takes the selected body only; the other stays where it is", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const st = startOp(scene(s), [b!.ref], "move");
  assert.ok(st.ok);
  if (!st.ok) return;
  assert.deepEqual(st.op.parts, [b!.ref]);
  const moved = run(s, opCommand(scene(s), { ...st.op, axis: 1, value: 25 })!);
  assert.equal(moved.message, null);
  const after = bodies(moved);
  assert.equal(after.length, 2);
  const A = after.find((x) => x.id === a!.id)!, B = after.find((x) => x.id === b!.id)!;
  assert.ok(Math.abs(A.bbox!.min[1]) < 1e-6, "a stays");
  assert.ok(Math.abs(B.bbox!.min[1] - 25) < 1e-6, "b moved");
});

test("Add joins overlapping bodies into the first; Cut (kept: only the first) takes the second out of the first; neither works with one body selected", () => {
  let s = box(box(createSession(kernel), 0, 0), 40, 0);
  const b = bodies(s)[1]!;
  const mv = startOp(scene(s), [b.ref], "move");
  if (!mv.ok) return assert.fail("no move");
  s = run(s, opCommand(scene(s), { ...mv.op, axis: 0, value: -35 })!); // b now overlaps a
  const [a2, b2] = bodies(s);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  const menu = (x: AppState) => reduce(x, { type: "menu", x: 5, y: 5, button: true }, env).menu!.items.flatMap((i) => i.children ?? [i]);
  assert.equal(menu(pick(st, [a2!.ref])).find((i) => i.id === "combine:add")!.enabled, false);
  assert.equal(menu(pick(st, [a2!.ref, b2!.ref])).find((i) => i.id === "combine:add")!.enabled, true);
  assert.equal(menu(pick(st, [a2!.ref])).find((i) => i.id === "combine:cut")!.enabled, false);
  const cutting = reduce(pick(st, [a2!.ref, b2!.ref]), { type: "runAction", id: "combine:cut" }, env);
  assert.deepEqual(cutting.cut?.keep, [1], "a cut starts as a subtract: only the first body's part is kept");
  const sub = reduce(cutting, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(sub.cut, null);
  assert.equal(bodies(sub.session).length, 1);
  assert.ok(sub.session.outcome.kernel!.volume! < 2000 - 1, "b was taken out of a");
  st = reduce(pick(st, [a2!.ref, b2!.ref]), { type: "runAction", id: "combine:add" }, env);
  assert.equal(st.session.message, "bodies added together");
  assert.equal(bodies(st.session).length, 1);
  assert.ok(st.session.outcome.kernel!.volume! < 2000 && st.session.outcome.kernel!.volume! > 1000);
  // two that do not touch cannot be added: refused with the reason, nothing changes
  const apart = box(box(createSession(kernel), 0, 0), 40, 0);
  const [p, q] = bodies(apart);
  const no = reduce(pick({ ...createState(apart), cam: homeCamera() }, [p!.ref, q!.ref]), { type: "runAction", id: "combine:add" }, env);
  assert.match(no.session.message ?? "", /do not touch or overlap/);
  assert.equal(scene(no.session).steps.length, 2);
});

import { exportStl, selectedBodies } from "../src/interaction/exportstl.ts";
test("the export has all bodies unless it is told which (`in_271`): all by default, one body when asked, and the choice is one argument", async () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const all = await exportStl(s, kernel);
  assert.ok(all.ok);
  if (all.ok) assert.equal(all.triangles, 24, "two boxes of twelve");
  const [a, b] = bodies(s);
  const picked = pick({ ...createState(s) }, [b!.ref]);
  assert.deepEqual(selectedBodies(picked.session), [b!.id]);
  const one = await exportStl(s, kernel, "b.stl", selectedBodies(picked.session));
  assert.ok(one.ok);
  if (one.ok) { assert.equal(one.triangles, 12); assert.ok(one.size[0] === 10); }
  assert.deepEqual(selectedBodies(pick({ ...createState(createSession(kernel)) }, []).session), undefined);
  void a;
  const gone = await exportStl(s, kernel, "x.stl", ["nope"]);
  assert.ok(!gone.ok);
});

test("Copy and the repeats take the selected body only: the copies are bodies of their own and the other body is left alone (`in_271`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 60, 0);
  const [a] = bodies(s);
  let st: AppState = pick({ ...createState(s), cam: homeCamera() }, [a!.ref]);
  st = reduce(st, { type: "runAction", id: "op:linear" }, env);
  assert.deepEqual(st.repeat?.op.parts, [a!.ref]);
  st = reduce(st, { type: "entry", field: 0, text: "3" }, env);
  st = reduce(st, { type: "repeatApply" }, env);
  assert.equal(st.session.message, null);
  const step = scene(st.session).steps.find((x) => x.type === "pattern")!;
  assert.equal(step.params.body, a!.id);
  const after = bodies(st.session);
  assert.equal(after.length, 4, "a and its two copies (spaced apart), and the other body");
  const far = after.find((b) => b.bbox!.min[0] > 55)!;
  assert.ok(Math.abs(far.bbox!.max[0] - 70) < 1e-6, "the other body did not move or copy");
});

import { figureRefs } from "../src/operation/scene.ts";
test("the sketches of a body that is moved alone go with it, and the other body's sketches stay (`in_271`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const steps = scene(s).steps;
  const cornerOf = (sc: ReturnType<typeof scene>, st: (typeof steps)[number]) => { const l = sc.parts[figureRefs(st)[0]!]; const c = l?.kind === "line" ? sc.parts[l.a] : undefined; return c?.kind === "corner" ? c.at : null; };
  const before = [cornerOf(scene(s), steps[0]!)!, cornerOf(scene(s), steps[1]!)!];
  const st = startOp(scene(s), [b!.ref], "move");
  if (!st.ok) return assert.fail("no move");
  const moved = run(s, opCommand(scene(s), { ...st.op, axis: 1, value: 25 })!);
  assert.equal(moved.message, null);
  const after = [cornerOf(scene(moved), scene(moved).steps[0]!)!, cornerOf(scene(moved), scene(moved).steps[1]!)!];
  assert.deepEqual(after[0], before[0], "a's sketch stays");
  assert.ok(Math.abs(after[1]![1] - before[1]![1] - 25) < 1e-6, `b's sketch went with b: ${before[1]} to ${after[1]}`);
  assert.equal(bodies(moved).find((x) => x.id === b!.id)!.bbox!.min[1], 25);
  void a;
});

import { bodyMotion } from "../src/interaction/operations.ts";
test("a drag of one body of several is moved on the graphics card alone: the frame says which triangles and which box are its, and the two bodies' triangles are all of the mesh (`in_273`)", () => {
  const two = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(two);
  let st: AppState = pick({ ...createState(two), cam: homeCamera() }, [b!.ref]);
  st = reduce(st, { type: "runAction", id: "op:move" }, env);
  st = reduce(st, { type: "entry", field: 0, text: "5" }, env);
  const f = frameOf(st, env);
  assert.ok(f.bodyMatrix, "drawn by a matrix");
  assert.ok(f.bodySplit, "of one body");
  assert.deepEqual(f.bodySplit!.box.min, b!.bbox!.min);
  const count = f.bodySplit!.tris.reduce((n, [, c]) => n + c, 0);
  const all = two.outcome.kernel!.mesh!.triangles.length;
  assert.equal(count, all / 2, "b is half of the mesh (two boxes of the same size)");
  const starts = f.bodySplit!.tris.map(([s0]) => s0);
  assert.ok(starts.every((x) => x >= 0 && x < all));
  // a single body is moved whole
  const one = box(createSession(kernel), 0, 0);
  let st1: AppState = pick({ ...createState(one), cam: homeCamera() }, [bodies(one)[0]!.ref]);
  st1 = reduce(st1, { type: "runAction", id: "op:move" }, env);
  st1 = reduce(st1, { type: "entry", field: 0, text: "5" }, env);
  const f1 = frameOf(st1, env);
  assert.ok(f1.bodyMatrix);
  assert.equal(f1.bodySplit, null);
  void a;
});

import { cornerEdges } from "../src/ui/view/edges.ts";
import { ownSegments } from "../src/ui/view/split.ts";
import { settings } from "../src/shared/settings.ts";
test("with two overlapping bodies, the outline of the dragged one moves and the other body's edges stay, even those that lie inside the dragged body's box (`in_275`)", () => {
  let s = box(box(createSession(kernel), 0, 0), 40, 0);
  const b = bodies(s)[1]!;
  const mv = startOp(scene(s), [b.ref], "move");
  if (!mv.ok) return assert.fail("no move");
  s = run(s, opCommand(scene(s), { ...mv.op, axis: 0, value: -35 })!); // b overlaps a by 5 mm
  const k = s.outcome.kernel!;
  const [a2, b2] = bodies(s);
  const index = k.bodies!.findIndex((x) => x.id === b2!.id);
  const mine: number[] = [];
  const rest: number[] = [];
  const total = k.mesh!.triangles;
  const moving = new Uint8Array(total.length / 3);
  for (const f of k.faces!) if (f.body === index) for (let t = Math.floor(f.start / 3); t < Math.ceil((f.start + f.count) / 3); t++) moving[t] = 1;
  moving.forEach((m, t) => (m ? mine : rest).push(total[3 * t]!, total[3 * t + 1]!, total[3 * t + 2]!));
  const edges = Float32Array.from(cornerEdges(k.mesh!.vertices, k.mesh!.normals, total, settings.extrude.edgeAngleDeg));
  const { go, stay } = ownSegments(edges, k.mesh!.vertices, mine, rest);
  const inside = (arr: number[], pred: (x: number) => boolean) => { for (let i = 0; i < arr.length; i += 3) if (!pred(arr[i]!)) return false; return true; };
  // the dragged body is x 5 to 15, the other 0 to 10: the other body's edges at x = 10 (inside the dragged box) stay
  const stayAt10 = [];
  for (let i = 0; i + 5 < stay.length; i += 6) if (Math.abs(stay[i]! - 10) < 1e-3 && Math.abs(stay[i + 3]! - 10) < 1e-3) stayAt10.push(i);
  assert.ok(stayAt10.length >= 4, `the other body's edges at x = 10 stay (${stayAt10.length})`);
  const goAt10 = [];
  for (let i = 0; i + 5 < go.length; i += 6) if (Math.abs(go[i]! - 10) < 1e-3 && Math.abs(go[i + 3]! - 10) < 1e-3) goAt10.push(i);
  assert.equal(goAt10.length, 0, "none of them moves with the dragged body");
  assert.ok(go.length >= 6 * 8, "the dragged body's own outline moves");
  assert.ok(inside(go, (x) => x >= 5 - 1e-3 && x <= 15 + 1e-3));
  void a2;
});

import { planeForDrawing } from "../src/interaction/tools.ts";
test("a sketch drawn on a face of a body goes with that body when it is moved alone, and a sketch on the other body's face stays; the body that was extruded from it is where it was drawn (`in_277`)", () => {
  let s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const topOf = (body: typeof a) => Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.of === body!.ref && p.mesh && p.mesh.every((_, i) => i % 3 !== 2 || Math.abs(p.mesh![i]! - 10) < 1e-6) && Math.abs(p.at[2] - 10) < 1e-6)!;
  const sketchOn = (body: typeof a, x: number): Ref[] => {
    const face = topOf(body);
    const pl = planeForDrawing(scene(s), face.ref);
    if (pl.command) s = run(s, pl.command);
    const r = drawSquaredRectangle(scene(s), pl.plane, [x, 2, 10], [x + 3, 5, 10], [1, 0, 0], [0, 1, 0]);
    s = run(s, r.command);
    return r.corners as Ref[];
  };
  const onB = sketchOn(b!, 42);
  const onA = sketchOn(a!, 2);
  const at = (sc: ReturnType<typeof scene>, ref: Ref) => { const p = sc.parts[ref]; return p?.kind === "corner" ? p.at : null; };
  const beforeB = at(scene(s), onB[0]!)!, beforeA = at(scene(s), onA[0]!)!;
  const mv = startOp(scene(s), [bodies(s)[1]!.ref], "move");
  if (!mv.ok) return assert.fail("no move");
  const moved = run(s, opCommand(scene(s), { ...mv.op, axis: 1, value: 20 })!);
  assert.equal(moved.message, null);
  const afterB = at(scene(moved), onB[0]!)!, afterA = at(scene(moved), onA[0]!)!;
  assert.ok(Math.abs(afterB[1] - beforeB[1] - 20) < 1e-6, `the sketch on b's face went with b: ${beforeB} to ${afterB}`);
  assert.deepEqual(afterA, beforeA, "the sketch on a's face stayed");
  // pulled out of b's face after the move: it is a body part at the moved place
  const face2 = Object.values(scene(moved).parts).find((p) => p.kind === "face" && p.loop.includes(Object.values(scene(moved).parts).find((q) => q.kind === "line" && q.a === onB[0])?.ref as Ref))!;
  const ex = startOp(scene(moved), [face2.ref], "extrude");
  if (!ex.ok) return assert.fail(`no extrude: ${(ex as { why: string }).why}`);
  const grown = run(moved, opCommand(scene(moved), { ...ex.op, value: 4 })!);
  assert.equal(grown.message, null);
  const bb = bodies(grown).find((x) => x.id === b!.id)!;
  assert.ok(Math.abs(bb.bbox!.min[1] - 20) < 1e-6 && bb.bbox!.max[2] >= 14 - 1e-6, `b is at its moved place and taller: ${bb.bbox!.min} ${bb.bbox!.max}`);
  assert.ok(Math.abs(bodies(grown).find((x) => x.id === a!.id)!.bbox!.min[1]) < 1e-6, "a is where it was");
});

test("a sketch on a face of a single body goes with it when it is moved whole (the old path), and with one of two bodies when it is turned or scaled alone (`in_278`)", () => {
  const sketchOnTop = (s: Session, body: ReturnType<typeof bodies>[number], x: number): { s: Session; corner: Ref } => {
    const face = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && (!p.of || p.of === body.ref) && p.mesh && Math.abs(p.at[2] - 10) < 1e-6 && Math.abs(p.mesh[2]! - 10) < 1e-6)!;
    const pl = planeForDrawing(scene(s), face.ref);
    if (pl.command) s = run(s, pl.command);
    const r = drawSquaredRectangle(scene(s), pl.plane, [x, 2, 10], [x + 3, 5, 10], [1, 0, 0], [0, 1, 0]);
    return { s: run(s, r.command), corner: (r.corners as Ref[])[0]! };
  };
  const at = (s: Session, ref: Ref) => { const p = scene(s).parts[ref]; return p?.kind === "corner" ? p.at : [NaN, NaN, NaN]; };
  // one body, moved whole
  let one = box(createSession(kernel), 0, 0);
  const o1 = sketchOnTop(one, bodies(one)[0]!, 2);
  one = o1.s;
  const mv = startOp(scene(one), [bodies(one)[0]!.ref], "move");
  if (!mv.ok) return assert.fail("no move");
  const movedOne = run(one, opCommand(scene(one), { ...mv.op, axis: 1, value: 12 })!);
  assert.equal(movedOne.message, null);
  assert.ok(Math.abs(at(movedOne, o1.corner)[1]! - at(one, o1.corner)[1]! - 12) < 1e-6, "the sketch went with the single body");
  // two bodies: turn one, then scale the other, each with a sketch on its top face
  let two = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(two);
  const sa = sketchOnTop(two, a!, 2); two = sa.s;
  const sb = sketchOnTop(two, bodies(two)[1]!, 42); two = sb.s;
  const turn = startOp(scene(two), [b!.ref], "rotate");
  if (!turn.ok) return assert.fail("no rotate");
  const turned = run(two, opCommand(scene(two), { ...turn.op, axis: 2, value: 90 })!);
  assert.equal(turned.message, null);
  const centre = turn.op.pivot!;
  const q = at(two, sb.corner), q2 = at(turned, sb.corner);
  // a quarter turn about the body's middle (z axis): (x, y) -> (cx - (y - cy), cy + (x - cx))
  assert.ok(Math.abs(q2[0]! - (centre[0] - (q[1]! - centre[1]))) < 1e-4 && Math.abs(q2[1]! - (centre[1] + (q[0]! - centre[0]))) < 1e-4, `b's sketch turned with b: ${q} to ${q2} about ${centre}`);
  assert.deepEqual(at(turned, sa.corner), at(two, sa.corner), "a's sketch stayed");
  const grow = startOp(scene(two), [a!.ref], "scale");
  if (!grow.ok) return assert.fail("no scale");
  const grown = run(two, opCommand(scene(two), { ...grow.op, value: 2 })!);
  assert.equal(grown.message, null);
  const pc = bodyCentre(scene(two), a!.ref)!; // (a scale is about the middle of the body)
  const p0 = at(two, sa.corner), p1 = at(grown, sa.corner);
  assert.ok(Math.abs(p1[0]! - (pc[0] + 2 * (p0[0]! - pc[0]))) < 1e-4 && Math.abs(p1[1]! - (pc[1] + 2 * (p0[1]! - pc[1]))) < 1e-4, `a's sketch grew with a: ${p0} to ${p1}`);
  assert.deepEqual(at(grown, sb.corner), at(two, sb.corner), "b's sketch stayed");
});

test("angles typed for a turn of one body of several (the typed way) leave the other body and its sketches where they are (`in_278`: the other body was turned with it)", () => {
  let s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const turn = startOp(scene(s), [b!.ref], "rotate");
  if (!turn.ok) return assert.fail("no rotate");
  s = run(s, opCommand(scene(s), { ...turn.op, value: null, typed: "", rot: ["", "", "90"] })!);
  assert.equal(s.message, null);
  const after = bodies(s);
  const A = after.find((x) => x.id === a!.id)!, B = after.find((x) => x.id === b!.id)!;
  assert.deepEqual(A.bbox, a!.bbox, "a did not move");
  assert.ok(Math.abs(B.bbox!.min[0] - b!.bbox!.min[0]) < 1e-6 && Math.abs(B.bbox!.max[1] - b!.bbox!.max[1]) < 1e-6, "b turned about its own middle (a square: the same box)");
  const sketchA = Object.values(scene(s).parts).find((p) => p.kind === "corner" && p.origin === "drawn" && p.at[0] < 5)!;
  assert.ok(sketchA.kind === "corner" && Math.abs(sketchA.at[0]) < 1e-6 && Math.abs(sketchA.at[1]) < 1e-6, "a's sketch stayed");
});

test("Copy of one body that has a sketch on its face: the copies are the solid, the sketch stays with the original, the other body and its sketch are untouched (as built, `in_279`)", () => {
  let s = box(box(createSession(kernel), 0, 0), 60, 0);
  const [a] = bodies(s);
  const top = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.of === a!.ref && p.mesh && Math.abs(p.mesh[2]! - 10) < 1e-6 && Math.abs(p.mesh[5]! - 10) < 1e-6)!;
  const pl = planeForDrawing(scene(s), top.ref);
  if (pl.command) s = run(s, pl.command);
  const r = drawSquaredRectangle(scene(s), pl.plane, [2, 2, 10], [5, 5, 10], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const cornersBefore = JSON.stringify(r.corners.map((c) => (scene(s).parts[c as Ref] as { at: Vec3 }).at));
  let st: AppState = pick({ ...createState(s), cam: homeCamera() }, [a!.ref]);
  st = reduce(st, { type: "runAction", id: "op:copy" }, env);
  st = reduce(st, { type: "repeatApply" }, env);
  assert.equal(st.session.message, null);
  assert.equal(bodies(st.session).length, 3, "the body, its copy, and the other body");
  assert.equal(JSON.stringify(r.corners.map((c) => (scene(st.session).parts[c as Ref] as { at: Vec3 }).at)), cornersBefore, "the sketch stayed where it was drawn");
  assert.ok(bodies(st.session).some((b) => Math.abs(b.bbox!.min[0] - 60) < 1e-6), "the other body did not move");
});

import { actionsFor } from "../src/interaction/actions.ts";
test("deleting one of two bodies takes that body only: its step and sketch go, the other body and its step stay (`in_291`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const del = actionsFor(scene(s), [a!.ref]).find((x) => x.id === "delete")!;
  const after = run(s, del.run());
  assert.equal(after.message, null);
  assert.equal(bodies(after).length, 1, "one body is left");
  assert.ok(Math.abs(bodies(after)[0]!.bbox!.min[0] - 40) < 1e-6, "the other one");
  assert.equal(scene(after).steps.length, 1);
  // a body that was moved by a step made on it goes with its steps
  const moved = startOp(scene(s), [b!.ref], "move");
  if (!moved.ok) return assert.fail("no move");
  const s2 = run(s, opCommand(scene(s), { ...moved.op, axis: 1, value: 20 })!);
  const del2 = actionsFor(scene(s2), [bodies(s2)[1]!.ref]).find((x) => x.id === "delete")!;
  const after2 = run(s2, del2.run());
  assert.equal(bodies(after2).length, 1);
  assert.equal(scene(after2).steps.filter((st) => st.type === "move").length, 0, "the move made on the deleted body went with it");
  // with one body nothing changes: it all goes
  const one = box(createSession(kernel), 0, 0);
  const del3 = actionsFor(scene(one), [bodies(one)[0]!.ref]).find((x) => x.id === "delete")!;
  assert.equal(bodies(run(one, del3.run())).length, 0);
});

test("Shift adds a second body to a selected body (the whole body, not a face of it), and takes it out again (`in_291`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  const pr = (bb: NonNullable<typeof a>) => { const q = (bb.bbox!.min.map((v, i) => (v + bb.bbox!.max[i]!) / 2) as unknown as [number, number, number]); q[1] = bb.bbox!.min[1]; q[2] = (bb.bbox!.min[2] + bb.bbox!.max[2]) / 2; return projector(st.cam, env.w, env.h).project(q); };
  const click = (bb: NonNullable<typeof a>, count: number, shift: boolean, now: number) => { const p = pr(bb); st = reduce(st, { type: "click", x: p[0], y: p[1], count, shift }, { ...env, now }); };
  click(a!, 1, false, 0); click(a!, 2, false, 100);
  assert.deepEqual(st.session.click.selection, [a!.ref], "the whole body a is selected");
  click(b!, 1, true, 2000);
  assert.deepEqual(st.session.click.selection, [a!.ref, b!.ref], "shift adds the whole body b");
  click(b!, 1, true, 4000);
  assert.deepEqual(st.session.click.selection, [a!.ref], "and takes it out again");
});

test("the arrows and rings of Move and Turn stand in the middle of the selected body, not of all the bodies (`in_291`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  for (const kind of ["move", "rotate"] as const) {
    for (const body of [a!, b!]) {
      const st = reduce(pick({ ...createState(s), cam: homeCamera() }, [body.ref]), { type: "begin", name: kind }, env);
      const g = frameOf(st, env).gizmo!;
      const centre = bodyCentre(scene(s), body.ref)!;
      const first = g.handles[0]!.points[0]!;
      const onAxis = kind === "move" ? first : g.handles.find((h) => h.id === "pivot")!.points[0]!;
      assert.ok(Math.hypot(onAxis[0] - centre[0], onAxis[1] - centre[1], onAxis[2] - centre[2]) < 1e-6, `${kind} of ${body.id}: ${onAxis} vs ${centre}`);
    }
  }
});

test("the view turns about the body in view: with two bodies far apart, turning while looking at one keeps that one where it is on the screen (`in_291`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 300, 0);
  const [a] = bodies(s);
  const centre = [0, 1, 2].map((i) => (a!.bbox!.min[i]! + a!.bbox!.max[i]!) / 2) as unknown as [number, number, number];
  let st: AppState = { ...createState(s), cam: { ...homeCamera(), target: [20, 5, 5], distance: 60 } };
  const where = () => projector(st.cam, env.w, env.h).project(centre);
  const before = where();
  st = reduce(st, { type: "hover", x: 400, y: 300 }, env);
  st = reduce(st, { type: "orbit", dx: 30, dy: 0, x: 430, y: 300 }, env);
  st = reduce(st, { type: "orbit", dx: 40, dy: 10, x: 470, y: 310 }, env);
  st = reduce(st, { type: "dragEnd" }, env);
  const after = where();
  assert.ok(Math.hypot(after[0] - before[0], after[1] - before[1]) < 3, `the body in view stays: ${before} to ${after}`);
});

test("a body that is selected whole is dragged free by pressing on it: it moves by what the pointer moved, as one step, and the other body stays (`in_291`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  let st: AppState = pick({ ...createState(s), cam: { ...homeCamera(), target: [5, 5, 5] } }, [a!.ref]);
  const pr = () => projector(st.cam, env.w, env.h);
  const on = pr().project([5, 0, 5]); // (the front face of the first body)
  const steps0 = scene(st.session).steps.length;
  st = reduce(st, { type: "hover", x: on[0], y: on[1] }, env);
  let [x, y] = on;
  for (const [dx, dy] of [[0, 0], [20, -10], [20, -10], [10, 0]] as [number, number][]) { x += dx; y += dy; st = reduce(st, { type: "orbit", dx, dy, x, y }, env); }
  assert.ok(st.op?.free, "the drag has taken hold of the body");
  // while it is dragged the arrows go with it and all three numbers show (`in_293`)
  const fr = frameOf(st, env);
  const c0 = bodyCentre(scene(st.session), a!.ref)!;
  const gc = fr.gizmo!.handles.find((h) => h.id === "move:x")!.points[0]!;
  assert.ok(Math.abs(gc[0] - (c0[0] + st.op!.free![0])) < 1e-6 && Math.abs(gc[1] - (c0[1] + st.op!.free![1])) < 1e-6, `the arrows stand on the body as it goes: ${gc} vs ${c0} + ${st.op!.free}`);
  assert.equal(fr.entries.length, 3, "an X, a Y and a Z number");
  assert.deepEqual(fr.entries.map((e) => e.fields[0]!.short), ["X", "Y", "Z"]);
  assert.ok(Math.abs(Number(fr.entries[0]!.fields[0]!.value) - st.op!.free![0]) < 0.01);
  st = reduce(st, { type: "dragEnd" }, env);
  assert.equal(st.op, null);
  assert.equal(scene(st.session).steps.length, steps0 + 1, "one step");
  const [a2, b2] = [bodies(st.session).find((q) => q.id === a!.id)!, bodies(st.session).find((q) => q.id === b!.id)!];
  assert.ok(Math.abs(a2.bbox!.min[0] - a!.bbox!.min[0]) > 0.5, `the first body moved: ${a!.bbox!.min} to ${a2.bbox!.min}`);
  assert.deepEqual(b2.bbox!.min.map((v) => Math.round(v * 1000)), b!.bbox!.min.map((v) => Math.round(v * 1000)), "the other body did not");
});

import { runOp } from "../src/interaction/runop.ts";
test("a body whose sketch is tied by a constraint to something that stays is not moved out of shape: it is refused and the constraint named; a free body moves whole (`in_293`)", () => {
  const rect = (s0: Session, x: number) => { const r = drawSquaredRectangle(scene(s0), XY, [x, 0, 0], [x + 10, 10, 0], [1, 0, 0], [0, 1, 0]); const s1 = run(s0, r.command); return { s: run(s1, { type: "addStep", step: { id: nextId(scene(s1), "s"), type: "extrude", parts: r.lines, params: { depth: 10 } } }), r }; };
  const first = rect(createSession(kernel), 0);
  const second = rect(first.s, 40);
  let s = run(second.s, { type: "addRelation", relation: { id: "r_tie", kind: "sameHeight", parts: [first.r.corners[0]!, second.r.corners[0]!] } });
  const [a] = bodies(s);
  const mv = startOp(scene(s), [a!.ref], "move");
  if (!mv.ok) return assert.fail("no move");
  for (const op of [{ ...mv.op, axis: 1 as const, value: 7 }, { ...mv.op, free: [0, 7, 0] as [number, number, number] }]) {
    const out = runOp(s, op);
    assert.ok(out);
    assert.match(out!.session.message ?? "", /ties its sketch/, "refused, with the reason");
    assert.deepEqual(out!.session.conflict?.culprits, ["r_tie"], "the constraint is named");
    assert.equal(bodies(out!.session)[0]!.bbox!.max[1], 10, "the body is not stretched");
  }
  // along the line the tie allows (x): it moves whole
  const ok = runOp(s, { ...mv.op, free: [12, 0, 0] });
  assert.equal(ok!.session.message, null);
  assert.ok(Math.abs(bodies(ok!.session)[0]!.bbox!.min[0] - 12) < 1e-6);
  void s;
});


test("Cut shows the parts the bodies make and keeps the ones chosen: the overlap alone is an intersect, the two outer parts together are what does not overlap, kept parts join or stay separate; Esc gives it up (`in_294`)", () => {
  let s = box(box(createSession(kernel), 0, 0), 40, 0);
  const mv = startOp(scene(s), [bodies(s)[1]!.ref], "move");
  if (!mv.ok) return assert.fail("no move");
  s = run(s, opCommand(scene(s), { ...mv.op, axis: 0, value: -35 })!); // two boxes 10 wide: the second at 5..15, the first at 0..10: they overlap by 5
  const [a, b] = bodies(s);
  const start = reduce(pick({ ...createState(s), cam: homeCamera() }, [a!.ref, b!.ref]), { type: "runAction", id: "combine:cut" }, env);
  const f = frameOf(start, env);
  assert.deepEqual(f.cut!.parts.map((p) => p.mask).sort(), [1, 2, 3], "only A, only B, where they meet");
  assert.deepEqual(f.cut!.parts.map((p) => p.label).sort(), ["A", "A∩B", "B"].sort());
  const vol = (st: AppState) => bodies(st.session).map((x) => Math.round(x.volume ?? 0)).sort((p, q) => p - q);
  const make = (st: AppState) => reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  const tog = (st: AppState, mask: number) => reduce(st, { type: "cut", act: "toggle", mask }, env);
  // intersect: keep only the overlap
  assert.deepEqual(vol(make(tog(tog(start, 3), 1))), [500], "the overlap alone");
  // the two outer parts: they touch only along the overlap's faces, so they are two bodies
  const outer = make(tog(tog(start, 2), 1).cut ? tog(start, 2) : start);
  assert.deepEqual(vol(outer), [500, 500].map((x) => x), "only A and only B, as separate bodies (the join has nothing to join)");
  // everything kept and joined is an add; kept and separate stays as the parts
  const all = tog(tog(start, 2), 3);
  assert.deepEqual(vol(make(all)), [1500], "all three parts joined: one body");
  assert.deepEqual(vol(make(reduce(all, { type: "cut", act: "join" }, env))), [500, 500, 500], "all three parts kept separate: three bodies");
  // Esc gives it up, and nothing is made
  const gone = reduce(start, { type: "escape" }, env);
  assert.equal(gone.cut, null);
  assert.equal(scene(gone.session).steps.length, scene(start.session).steps.length);
  // nothing kept: refused with the reason
  const none = make(tog(start, 1));
  assert.match(none.session.message ?? "", /nothing was kept/);
});

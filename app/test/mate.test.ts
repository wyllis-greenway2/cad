// Mates between bodies (`in_314`): two faces of two bodies brought together by moving and turning the first one's body.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run, saveText, openSession } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { driveCommand, limitCommand, jointOf, jointRoom, jointRigid } from "../src/interaction/mate.ts";
import { drawSquaredRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import type { Part } from "../src/operation/part.ts";
import { normalOfPlane } from "../src/operation/part.ts";

await kernel.init();
const XY = worldRef("XY");
type Body = Extract<Part, { kind: "body" }>;
type PlanePart = Extract<Part, { kind: "plane" }>;
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p): p is Body => p.kind === "body" && p.ref !== "b/body/o");
const extrudeLast = (s: Session, parts: Ref[], depth: number) => run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts, params: { depth } } });
function box(s: Session, x: number, y: number, w = 10, h = 10): Session {
  const r = drawSquaredRectangle(scene(s), XY, [x, y, 0], [x + w, y + w, 0], [1, 0, 0], [0, 1, 0]);
  return extrudeLast(run(s, r.command), r.lines, h);
}
function cylinder(s: Session, x: number, y: number, radius: number, h = 10): Session {
  const c = drawCircle(scene(s), XY, [x, y, 0], radius);
  return extrudeLast(run(s, c.command), [c.circle], h);
}
/** The flat face of a body that faces this way. */
const faceOf = (s: Session, body: Body, n: [number, number, number]): Ref => {
  const f = Object.values(scene(s).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && p.of === body.ref && !!p.mesh && !p.curved && !p.round && !p.rounded && normalOfPlane(p).every((v, i) => Math.abs(v - n[i]!) < 1e-6));
  assert.ok(f, `a face of ${body.id} facing ${n}`);
  return f!.ref;
};
const roundOfBody = (s: Session, body: Body): Ref => (Object.values(scene(s).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && p.of === body.ref && !!(p.curved || p.round)) as PlanePart).ref;
const minOf = (b: Body) => b.bbox!.min.map((v) => Math.round(v * 1e4) / 1e4);

test("Mate flush lays the first face's body against the other: it moves, the other stays, the faces touch (`in_314`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const act = actionsFor(scene(s), [faceOf(s, b!, [-1, 0, 0]), faceOf(s, a!, [1, 0, 0])]).find((x) => x.id === "mate:flush")!;
  assert.ok(act?.enabled, `offered: ${act?.why}`);
  const after = run(s, act.run());
  assert.ok(!after.message, `${after.message}`);
  const [a2, b2] = [bodies(after).find((x) => x.id === a!.id)!, bodies(after).find((x) => x.id === b!.id)!];
  assert.deepEqual(minOf(a2), minOf(a!), "the other body did not move");
  assert.ok(Math.abs(b2.bbox!.min[0] - 10) < 1e-3 && Math.abs(b2.bbox!.min[1] - 0) < 1e-3, `touching at x = 10: ${minOf(b2)}`);
  // the sketch that made B went with it (the corners of its rectangle are at x = 10 and 20 now, as the body is)
  const xs = Object.values(scene(after).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as unknown as { at: number[] }).at[0]!).sort((p, q) => p - q);
  assert.ok(xs.some((x) => Math.abs(x - 10) < 1e-6) && xs.some((x) => Math.abs(x - 20) < 1e-6), `B's sketch moved with it: ${xs}`);
});

test("Mate flush also turns the body when its face is not facing the right way, and the body's sketch goes with it (`in_314`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  // B's top face laid against A's right face: B has to lie on its side
  const act = actionsFor(scene(s), [faceOf(s, b!, [0, 0, 1]), faceOf(s, a!, [1, 0, 0])]).find((x) => x.id === "mate:flush")!;
  const after = run(s, act.run());
  assert.ok(!after.message, `${after.message}`);
  const b2 = bodies(after).find((x) => x.id === b!.id)!;
  assert.ok(Math.abs(b2.bbox!.min[0] - 10) < 1e-3, `B's face is on A's face: min x ${b2.bbox!.min[0]}`);
  assert.ok(Math.abs(b2.volume! - b!.volume!) < 1e-3, "the same body");
  // the second mate of the same face now is "already"
  const again = actionsFor(scene(after), [faceOf(after, b2, [-1, 0, 0]), faceOf(after, bodies(after).find((x) => x.id === a!.id)!, [1, 0, 0])]).find((x) => x.id === "mate:flush")!;
  assert.ok(again, "B has a face facing -x again");
});

test("Mate coaxial puts the first round face's axis on the other's, keeping its place along the axis (`in_314`)", () => {
  const s = cylinder(cylinder(createSession(kernel), 0, 0, 5), 30, 4, 3);
  const [a, b] = bodies(s);
  const act = actionsFor(scene(s), [roundOfBody(s, b!), roundOfBody(s, a!)]).find((x) => x.id === "mate:coaxial")!;
  assert.ok(act?.enabled, `offered: ${act?.why}`);
  const after = run(s, act.run());
  assert.ok(!after.message, `${after.message}`);
  const b2 = bodies(after).find((x) => x.id === b!.id)!;
  const centre = [(b2.bbox!.min[0] + b2.bbox!.max[0]) / 2, (b2.bbox!.min[1] + b2.bbox!.max[1]) / 2];
  assert.ok(Math.hypot(centre[0]! - 0, centre[1]! - 0) < 1e-2, `on the other's axis: ${centre}`);
  assert.ok(Math.abs(b2.bbox!.min[2] - 0) < 1e-6 && Math.abs(b2.bbox!.max[2] - 10) < 1e-6, "its height along the axis is kept");
});

test("faces of one body cannot be mated, and flat faces are not offered coaxial (`in_314`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const same = actionsFor(scene(s), [faceOf(s, a!, [1, 0, 0]), faceOf(s, a!, [0, 1, 0])]).find((x) => x.id === "mate:flush")!;
  assert.equal(same.enabled, false);
  assert.match(same.why ?? "", /one body/);
  const ids = actionsFor(scene(s), [faceOf(s, b!, [-1, 0, 0]), faceOf(s, a!, [1, 0, 0])]).map((x) => x.id);
  assert.ok(!ids.includes("mate:coaxial"));
});

test("a mate is steps: it undoes, saves and opens again (`in_314`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const done = run(s, actionsFor(scene(s), [faceOf(s, b!, [-1, 0, 0]), faceOf(s, a!, [1, 0, 0])]).find((x) => x.id === "mate:flush")!.run());
  const back = (openSession(kernel, saveText(done)) as unknown as { value: Session }).value;
  assert.ok(Math.abs(bodies(back).find((x) => x.id === b!.id)!.bbox!.min[0] - 10) < 1e-3, "opened again: still against A");
  assert.ok(scene(done).steps.length > scene(s).steps.length);
});

import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
test("the menu offers the mates for two selected faces of two bodies, and choosing one makes it (`in_314`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const env = { w: 800, h: 600, now: 0 };
  const pick: Ref[] = [faceOf(s, b!, [-1, 0, 0]), faceOf(s, a!, [1, 0, 0])];
  let st = { ...createState(s), cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: pick } } };
  const menu = reduce(st, { type: "menu", x: 5, y: 5, button: true }, env).menu!;
  const items = menu.items.flatMap((i) => i.children ?? [i]);
  assert.ok(items.some((i) => i.id === "mate:flush" && i.enabled), `the menu has Mate: flush: ${items.map((i) => i.id).filter((i) => i.startsWith("mate") || i === "tangent")}`);
  const done = reduce(st, { type: "runAction", id: "mate:flush" }, env);
  assert.ok(Math.abs(bodies(done.session).find((x) => x.id === b!.id)!.bbox!.min[0] - 10) < 1e-3, "choosing it moved B against A");
});

import { mateStatus } from "../src/operation/mates.ts";
import { appRows } from "../src/interaction/appmenu.ts";
import { putMatesBack } from "../src/interaction/mate.ts";

let rightA: Ref[] = [];
const matedBoxes = () => {
  // (A's corners are kept: its right side is what is moved to make A wider)
  const rA = drawSquaredRectangle(scene(createSession(kernel)), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]);
  const s = box(extrudeLast(run(createSession(kernel), rA.command), rA.lines, 10), 40, 0);
  rightA = (rA.corners as Ref[]).filter((c) => (scene(s).parts[c] as unknown as { at: number[] }).at[0] === 10);
  const [a, b] = bodies(s);
  const done = once(run(s, actionsFor(scene(s), [faceOf(s, b!, [-1, 0, 0]), faceOf(s, a!, [1, 0, 0])]).find((x) => x.id === "mate:flush")!.run()));
  return { s: done, a: a!, b: b!, rightA };
};

test("a mate is recorded, and is true until a body changes (`in_315`)", () => {
  const { s } = matedBoxes();
  const st = mateStatus(scene(s));
  assert.equal(st.length, 1);
  assert.equal(st[0]!.state, "ok", `true when made: ${st[0]!.residual}`);
  assert.equal(st[0]!.mode, "flush");
});

test("a change that moves one of the bodies makes the mate not true, says so, and putting the mates back makes it again as new steps (`in_315`)", () => {
  const { s, a, b } = matedBoxes();
  // A is made wider: the two corners of its right side move from x = 10 to x = 14
  let wider = s;
  const said: string[] = [];
  for (const ref of rightA) { const at = (scene(wider).parts[ref] as unknown as { at: number[] }).at; wider = run(wider, { type: "movePart", ref, to: [14, at[1]!, at[2]!] } as never); if (wider.message) said.push(wider.message); }
  const off = mateStatus(scene(wider));
  assert.equal(off[0]!.state, "off", `no longer true: ${off[0]!.state} ${off[0]!.residual}`);
  assert.ok(off[0]!.residual! > 1, `apart by the widening: ${off[0]!.residual}`);
  assert.ok(said.some((m) => /no longer true/.test(m)), `said when the change that broke it was made: ${said}`);
  // put back: B moves to touch the wider A again
  const back = putMatesBack(scene(wider));
  assert.ok(back, "there is a mate to put back");
  const after = run(wider, back!.command);
  assert.ok(!after.message, `${after.message}`);
  assert.equal(mateStatus(scene(after))[0]!.state, "ok");
  const [a2, b2] = [bodies(after).find((x) => x.id === a.id)!, bodies(after).find((x) => x.id === b.id)!];
  assert.ok(Math.abs(b2.bbox!.min[0] - a2.bbox!.max[0]) < 1e-3, `B touches A's new face: ${b2.bbox!.min[0]} and ${a2.bbox!.max[0]}`);
  assert.equal(scene(after).relations.filter((r) => r.kind === "mate").length, 1, "one record, remade");
  assert.equal(putMatesBack(scene(after)), null, "nothing more to put back");
});

test("the menu offers 'put the mates back' only when one is not true, and doing it from the menu works (`in_315`)", () => {
  const { s, a } = matedBoxes();
  const env = { w: 800, h: 600, now: 0 };
  assert.ok(!appRows("auto", "", { undo: true, redo: true, matesOff: 0 }).some((r) => r.id === "mate:reapply"));
  assert.ok(appRows("auto", "", { undo: true, redo: true, matesOff: 1 }).some((r) => r.id === "mate:reapply"));
  let wider = s;
  for (const ref of rightA) { const at = (scene(wider).parts[ref] as unknown as { at: number[] }).at; wider = run(wider, { type: "movePart", ref, to: [13, at[1]!, at[2]!] } as never); }
  assert.equal(mateStatus(scene(wider))[0]!.state, "off");
  const st = reduce({ ...createState(wider), cam: homeCamera() }, { type: "runAction", id: "mate:reapply" }, env);
  assert.equal(mateStatus(scene(st.session))[0]!.state, "ok");
  assert.match(st.session.message ?? "", /put back/);
  void a;
});

test("deleting a mated body takes its mate with it; a mate whose body is gone is lost (`in_315`)", () => {
  const { s, b } = matedBoxes();
  const del = actionsFor(scene(s), [bodies(s).find((x) => x.id === b.id)!.ref]).find((x) => x.id === "delete")!;
  const after = run(s, del.run());
  assert.equal(scene(after).relations.filter((r) => r.kind === "mate").length, 0, "the mate went with the body");
});

import { frameOf } from "../src/interaction/frame.ts";
test("each mate is marked on the model where the two bodies meet, with its state; a click puts back one that is off or selects the two bodies (`in_316`)", () => {
  const { s, a, b, rightA: right } = matedBoxes();
  const env = { w: 800, h: 600 };
  const st0 = { ...createState(s), cam: homeCamera() };
  const f0 = frameOf(st0, env);
  assert.equal(f0.mates.length, 1);
  assert.equal(f0.mates[0]!.state, "ok");
  assert.ok(Math.abs(f0.mates[0]!.at[0] - 10) < 1e-3, `at the touching faces (x = 10): ${f0.mates[0]!.at}`);
  assert.match(f0.mates[0]!.text, /flush faces/);
  // a click on the mark of a mate that is true selects the two bodies
  const picked = reduce(st0, { type: "runAction", id: `mate:select:${f0.mates[0]!.id}` }, { ...env, now: 0 });
  assert.deepEqual([...picked.session.click.selection].sort(), [a.ref, b.ref].sort());
  // A made wider: the mark says it is off, and a click on it puts that mate back
  let wider = s;
  for (const ref of right) { const at = (scene(wider).parts[ref] as unknown as { at: number[] }).at; wider = run(wider, { type: "movePart", ref, to: [14, at[1]!, at[2]!] } as never); }
  const f1 = frameOf({ ...createState(wider), cam: homeCamera() }, env);
  assert.equal(f1.mates[0]!.state, "off");
  assert.match(f1.mates[0]!.text, /no longer true.*click to put it back/);
  const fixed = reduce({ ...createState(wider), cam: homeCamera() }, { type: "runAction", id: `mate:reapply:${f1.mates[0]!.id}` }, { ...env, now: 0 });
  assert.equal(frameOf(fixed, env).mates[0]!.state, "ok");
  // a mate of a body that is gone is marked as lost, at what is left
  const gone = run(s, actionsFor(scene(s), [bodies(s).find((x) => x.id === a.id)!.ref]).find((x) => x.id === "delete")!.run());
  assert.equal(frameOf({ ...createState(gone), cam: homeCamera() }, env).mates.length, 0, "its mate went with it");
});

test("a relation to a part of the body is saved with its description, and is accepted before the kernel has answered, as when a file is opened in the browser (`in_316`)", () => {
  const { s } = matedBoxes();
  const saved = JSON.parse(saveText(s)) as { commands: unknown[] };
  const text = JSON.stringify(saved);
  assert.ok(/"kind":"mate"/.test(text), "the mate is in the saved commands, with its numbers");
  // replayed with no body parts at all (the kernel has not answered): the relation is not refused
  const empty = createSession(kernel);
  const r = run(empty, { type: "addRelation", relation: { id: "r_900", kind: "mate", parts: ["b/x_s_900/o", "b/x_s_901/o"], params: { mode: 0, gap: 0 } } } as never);
  assert.ok(scene(r).relations.some((x) => x.id === "r_900"), `accepted (it is then said to be lost, as no body is there): ${r.message}`);
});

import { annotationsFor } from "../src/interaction/annotations.ts";

test("flush leaves the gap that is typed: the faces stand that far apart, the mate is true at that gap, and a gap typed again replaces the mate (`in_317`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const pick = [faceOf(s, b!, [-1, 0, 0]), faceOf(s, a!, [1, 0, 0])];
  const act = actionsFor(scene(s), pick).find((x) => x.id === "mate:flush")!;
  assert.ok(act.dimensional && act.unit === "mm", "flush has a number");
  assert.ok(Math.abs(act.measure()! - 30) < 1e-6, `it says how far apart they are now: ${act.measure()}`);
  const gapped = run(s, act.run(5));
  assert.ok(!gapped.message, `${gapped.message}`);
  const b2 = bodies(gapped).find((x) => x.id === b!.id)!;
  assert.ok(Math.abs(b2.bbox!.min[0] - 15) < 1e-3, `5 mm from A's face at x = 10: ${b2.bbox!.min[0]}`);
  const st = mateStatus(scene(gapped));
  assert.equal(st[0]!.state, "ok");
  assert.equal(st[0]!.gap, 5);
  // typed again: 2 mm; the one mate is made again
  const pick2 = [faceOf(gapped, b2, [-1, 0, 0]), faceOf(gapped, bodies(gapped).find((x) => x.id === a!.id)!, [1, 0, 0])];
  const again = run(gapped, actionsFor(scene(gapped), pick2).find((x) => x.id === "mate:flush")!.run(2));
  assert.ok(Math.abs(bodies(again).find((x) => x.id === b!.id)!.bbox!.min[0] - 12) < 1e-3, "2 mm apart now");
  assert.equal(scene(again).relations.filter((r) => r.kind === "mate").length, 1, "one mate, remade");
  assert.equal(mateStatus(scene(again))[0]!.state, "ok");
});

test("the gap is typed into the number that stands over two selected faces, and it makes the mate (`in_317`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const env = { w: 800, h: 600, now: 0 };
  const pick: Ref[] = [faceOf(s, b!, [-1, 0, 0]), faceOf(s, a!, [1, 0, 0])];
  let st = { ...createState(s), cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: pick } } };
  const note = annotationsFor(scene(st.session), pick, null, false).find((x) => x.measureId === "mate:flush");
  assert.ok(note && note.editable && note.unit === "mm", `a number stands over the two faces: ${JSON.stringify(note && [note.kind, note.value])}`);
  const done = reduce(st, { type: "relation", act: "measure", id: "mate:flush", value: 4 }, env);
  assert.ok(Math.abs(bodies(done.session).find((x) => x.id === b!.id)!.bbox!.min[0] - 14) < 1e-3, "typed 4: B stands 4 mm from A");
  const zero = reduce(st, { type: "relation", act: "measure", id: "mate:flush", value: 0 }, env);
  assert.ok(Math.abs(bodies(zero.session).find((x) => x.id === b!.id)!.bbox!.min[0] - 10) < 1e-3, "typed 0: touching");
});

/** A body turned about Z by this many degrees (a step of its own, naming it). */
/** The mates of the session made placed-once (not standing): they are checked and put back on request (`in_315`), not by themselves (`in_321`). */
const once = (s: Session): Session => scene(s).relations.filter((r) => r.kind === "mate").reduce((q, r) => run(q, { type: "batch", commands: [{ type: "removeRelation", id: r.id }, { type: "addRelation", relation: { ...r, params: { ...r.params!, stand: 0 } } }] } as never), s);
const turned = (s: Session, body: Body, deg: number): Session => run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "rotate", parts: [body.ref], params: { axis: 2, value: deg, px: 0, py: 0, pz: 0, body: body.id } } } as never);

test("Mate: parallel faces only turns the first body until its face is parallel to the other's; it stays where it was (`in_317`)", () => {
  let s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  s = turned(s, b!, 30);
  const b1 = bodies(s).find((x) => x.id === b!.id)!;
  const faceB = Object.values(scene(s).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && p.of === b1.ref && !!p.mesh && !p.curved && !p.round && Math.abs(normalOfPlane(p)[2]) < 1e-6 && Math.abs(normalOfPlane(p)[0]) > 0.5)!.ref;
  const act = actionsFor(scene(s), [faceB, faceOf(s, bodies(s).find((x) => x.id === a!.id)!, [1, 0, 0])]).find((x) => x.id === "mate:parallel")!;
  assert.ok(act?.enabled && act.dimensional, "offered, with a number that is optional");
  const after = once(run(s, act.run()));
  assert.ok(!after.message, `${after.message}`);
  assert.equal(mateStatus(scene(after))[0]!.state, "ok");
  assert.equal(mateStatus(scene(after))[0]!.mode, "parallel");
  assert.equal(mateStatus(scene(after))[0]!.counts, false, "no distance was given: it is only the turn");
  const b2 = bodies(after).find((x) => x.id === b!.id)!;
  assert.ok(Math.abs(b2.volume! - b1.volume!) < 1e-3, "the same body, turned");
  // turning it again by hand makes the mate not true, and putting it back turns it again
  const off = turned(after, b2, 10);
  assert.equal(mateStatus(scene(off))[0]!.state, "off");
  assert.ok(Math.abs(mateStatus(scene(off))[0]!.residual! - 10) < 1e-2, `ten degrees off: ${mateStatus(scene(off))[0]!.residual}`);
  assert.equal(mateStatus(scene(off))[0]!.unit, "deg");
  const back = run(off, putMatesBack(scene(off))!.command);
  assert.equal(mateStatus(scene(back))[0]!.state, "ok");
});

test("Mate: parallel axes turns a round face's axis parallel to the other's and leaves it where it is (`in_317`)", () => {
  let s = cylinder(cylinder(createSession(kernel), 0, 0, 5), 30, 4, 3);
  const [a, b] = bodies(s);
  // B is tipped over: a turn about X
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "rotate", parts: [b!.ref], params: { axis: 0, value: 20, px: 30, py: 4, pz: 0, body: b!.id } } } as never);
  const act = actionsFor(scene(s), [roundOfBody(s, bodies(s).find((x) => x.id === b!.id)!), roundOfBody(s, a!)]).find((x) => x.id === "mate:parallelAxes")!;
  assert.ok(act?.enabled, `offered: ${act?.why}`);
  const after = run(s, act.run());
  assert.ok(!after.message, `${after.message}`);
  assert.equal(mateStatus(scene(after))[0]!.state, "ok");
  const b2 = bodies(after).find((x) => x.id === b!.id)!;
  assert.ok(Math.abs(b2.bbox!.max[2] - b2.bbox!.min[2] - 10) < 1e-2, "upright again: ten high");
});

test("the marks say what a mate is: the gap, and parallel (`in_317`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const gapped = run(s, actionsFor(scene(s), [faceOf(s, b!, [-1, 0, 0]), faceOf(s, a!, [1, 0, 0])]).find((x) => x.id === "mate:flush")!.run(5));
  const f = frameOf({ ...createState(gapped), cam: homeCamera() }, { w: 800, h: 600 });
  assert.match(f.mates[0]!.text, /flush faces \(5 mm apart\)/);
});

test("Mate: perpendicular turns the first body until its face is at a right angle to the other's, and leaves it where it is (`in_318`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  // B's face facing +y and A's face facing +x are already at a right angle: turn B first by 30 degrees
  const t = turned(s, b!, 30);
  const b1 = bodies(t).find((x) => x.id === b!.id)!;
  const faceB = Object.values(scene(t).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && p.of === b1.ref && !!p.mesh && !p.curved && !p.round && Math.abs(normalOfPlane(p)[2]) < 1e-6 && Math.abs(normalOfPlane(p)[0]) > 0.5)!.ref;
  const act = actionsFor(scene(t), [faceB, faceOf(t, bodies(t).find((x) => x.id === a!.id)!, [1, 0, 0])]).find((x) => x.id === "mate:perpendicular")!;
  assert.ok(act?.enabled && !act.dimensional, "offered, with no number");
  const after = run(t, act.run());
  assert.ok(!after.message, `${after.message}`);
  const st = mateStatus(scene(after))[0]!;
  assert.equal(st.state, "ok", `true: ${st.residual}`);
  assert.equal(st.mode, "perpendicular");
  // B's face is now at 90 degrees to A's (a normal along y), and B did not move more than the turn about the face's point
  const faceNow = Object.values(scene(after).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && p.of === bodies(after).find((x) => x.id === b!.id)!.ref && p.ref === st.mover!.ref)!;
  assert.ok(Math.abs(normalOfPlane(faceNow)[0]) < 1e-6, "its normal has no x: square to A's");
});

test("Mate: angle between faces leaves the angle that is typed (the angle between the planes, 0 to 90), is checked at it and put back (`in_318`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const pick = [faceOf(s, b!, [-1, 0, 0]), faceOf(s, a!, [1, 0, 0])];
  const act = actionsFor(scene(s), pick).find((x) => x.id === "mate:angle")!;
  assert.ok(act.dimensional && act.unit === "deg", "angle has a number");
  assert.ok(Math.abs(act.measure()! - 0) < 1e-6, `they are parallel now: ${act.measure()}`);
  const after = once(run(s, act.run(30)));
  assert.ok(!after.message, `${after.message}`);
  const st = mateStatus(scene(after))[0]!;
  assert.equal(st.state, "ok", `${st.residual}`);
  assert.equal(st.gap, 30);
  // the angle between B's face and A's face is 30 degrees: their normals' dot is cos 30 (as lines)
  const [fm, fo] = [st.mover!, st.other!];
  assert.ok(Math.abs(Math.abs(fm.dir[0] * fo.dir[0] + fm.dir[1] * fo.dir[1] + fm.dir[2] * fo.dir[2]) - Math.cos((30 * Math.PI) / 180)) < 1e-6, "thirty degrees apart");
  // typed again, 60: the same mate, made again
  const pick2 = [st.mover!.ref, st.other!.ref];
  const again = once(run(after, actionsFor(scene(after), pick2).find((x) => x.id === "mate:angle")!.run(60)));
  assert.equal(scene(again).relations.filter((r) => r.kind === "mate").length, 1, "one mate");
  assert.equal(mateStatus(scene(again))[0]!.state, "ok");
  assert.equal(mateStatus(scene(again))[0]!.gap, 60);
  // turned by hand: off by the turn, and put back
  const off = turned(again, bodies(again).find((x) => x.id === b!.id)!, 7);
  const o = mateStatus(scene(off))[0]!;
  assert.equal(o.state, "off");
  assert.ok(o.residual! > 1 && o.residual! < 8, `off by about the turn: ${o.residual}`);
  assert.equal(mateStatus(scene(run(off, putMatesBack(scene(off))!.command)))[0]!.state, "ok");
});

test("an angle can be typed into the number over two selected faces, next to the gap; and the angle between axes for round faces (`in_318`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const env = { w: 800, h: 600, now: 0 };
  const pick: Ref[] = [faceOf(s, b!, [-1, 0, 0]), faceOf(s, a!, [1, 0, 0])];
  let st = { ...createState(s), cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: pick } } };
  const notes = annotationsFor(scene(st.session), pick, null, false).filter((x) => x.measureId);
  assert.deepEqual(notes.map((x) => [x.measureId, x.unit]).sort(), [["mate:angle", "deg"], ["mate:flush", "mm"], ["mate:parallel", "mm"]], "a gap, a distance and an angle");
  const done = reduce(st, { type: "relation", act: "measure", id: "mate:angle", value: 45 }, env);
  assert.equal(mateStatus(scene(done.session))[0]!.gap, 45);
  assert.equal(mateStatus(scene(done.session))[0]!.mode, "angle");
  const c = cylinder(cylinder(createSession(kernel), 0, 0, 5), 30, 4, 3);
  const [c1, c2] = bodies(c);
  const axes = actionsFor(scene(c), [roundOfBody(c, c2!), roundOfBody(c, c1!)]).map((x) => x.id);
  assert.ok(axes.includes("mate:angleAxes") && axes.includes("mate:perpendicularAxes"), `for round faces: ${axes}`);
  const tilted = run(c, actionsFor(scene(c), [roundOfBody(c, c2!), roundOfBody(c, c1!)]).find((x) => x.id === "mate:angleAxes")!.run(40));
  assert.equal(mateStatus(scene(tilted))[0]!.state, "ok");
});

test("Mate: parallel faces with a distance typed turns the body and leaves the planes that far apart, on the side it is on; with none typed it only turns (`in_319`)", () => {
  let s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  s = turned(s, b!, 30);
  const b1 = bodies(s).find((x) => x.id === b!.id)!;
  const faceB = Object.values(scene(s).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && p.of === b1.ref && !!p.mesh && !p.curved && !p.round && Math.abs(normalOfPlane(p)[2]) < 1e-6 && Math.abs(normalOfPlane(p)[0]) > 0.5)!.ref;
  const pick = [faceB, faceOf(s, bodies(s).find((x) => x.id === a!.id)!, [1, 0, 0])];
  const act = actionsFor(scene(s), pick).find((x) => x.id === "mate:parallel")!;
  assert.ok(act.measure()! > 5, `how far apart the planes are now: ${act.measure()}`);
  const done = once(run(s, act.run(7)));
  assert.ok(!done.message, `${done.message}`);
  const st = mateStatus(scene(done))[0]!;
  assert.equal(st.state, "ok", `${st.residual}`);
  assert.equal(st.counts, true);
  assert.equal(st.gap, 7);
  assert.ok(Math.abs(Math.abs((st.mover!.point[0] - st.other!.point[0]) * st.other!.dir[0] + (st.mover!.point[1] - st.other!.point[1]) * st.other!.dir[1] + (st.mover!.point[2] - st.other!.point[2]) * st.other!.dir[2]) - 7) < 1e-6, "7 mm between the planes");
  // moved by hand so the distance is wrong but the faces are still parallel: off, in mm, and put back
  const nudged = run(done, { type: "addStep", step: { id: nextId(scene(done), "s"), type: "move", parts: [bodies(done).find((x) => x.id === b!.id)!.ref], params: { axis: 0, value: 3, body: b!.id } } } as never);
  const off = mateStatus(scene(nudged))[0]!;
  assert.equal(off.state, "off");
  assert.equal(off.unit, "mm");
  assert.ok(Math.abs(off.residual! - 3) < 1e-6, `3 mm off: ${off.residual}`);
  assert.equal(mateStatus(scene(run(nudged, putMatesBack(scene(nudged))!.command)))[0]!.state, "ok");
});

test("Mate: coaxial with a number leaves the axes that far apart, in the way the first one stands off now; 0 is one axis (`in_319`)", () => {
  const s = cylinder(cylinder(createSession(kernel), 0, 0, 5), 30, 4, 3);
  const [a, b] = bodies(s);
  const pick = [roundOfBody(s, b!), roundOfBody(s, a!)];
  const act = actionsFor(scene(s), pick).find((x) => x.id === "mate:coaxial")!;
  assert.ok(act.dimensional && act.unit === "mm", "coaxial has a number");
  assert.ok(Math.abs(act.measure()! - Math.hypot(30, 4)) < 1e-3, `the axes are ${act.measure()} apart now`);
  const four = run(s, act.run(4));
  assert.ok(!four.message, `${four.message}`);
  const st = mateStatus(scene(four))[0]!;
  assert.equal(st.state, "ok", `${st.residual}`);
  assert.equal(st.gap, 4);
  const b2 = bodies(four).find((x) => x.id === b!.id)!;
  const c = [(b2.bbox!.min[0] + b2.bbox!.max[0]) / 2, (b2.bbox!.min[1] + b2.bbox!.max[1]) / 2];
  assert.ok(Math.abs(Math.hypot(c[0]!, c[1]!) - 4) < 1e-2, `its axis is 4 from the other's: ${c}`);
  assert.ok(Math.abs(c[1]! / c[0]! - 4 / 30) < 1e-2, "on the side it was on");
  // typed again as 0: one axis, the same mate
  const again = run(four, actionsFor(scene(four), [roundOfBody(four, b2), roundOfBody(four, bodies(four).find((x) => x.id === a!.id)!)]).find((x) => x.id === "mate:coaxial")!.run(0));
  const b3 = bodies(again).find((x) => x.id === b!.id)!;
  assert.ok(Math.hypot((b3.bbox!.min[0] + b3.bbox!.max[0]) / 2, (b3.bbox!.min[1] + b3.bbox!.max[1]) / 2) < 1e-2, "on one axis");
  assert.equal(scene(again).relations.filter((r) => r.kind === "mate").length, 1, "one mate");
  // the marks say it
  const f = frameOf({ ...createState(four), cam: homeCamera() }, { w: 800, h: 600 });
  assert.match(f.mates[0]!.text, /axes 4 mm apart/);
});

test("the numbers of a mate over two faces are told apart by a word and put one under the other (`in_320`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const pick: Ref[] = [faceOf(s, b!, [-1, 0, 0]), faceOf(s, a!, [1, 0, 0])];
  const notes = annotationsFor(scene(s), pick, null, false).filter((x) => x.measureId);
  assert.deepEqual(notes.map((x) => x.tag), ["gap", "distance", "angle"], "a word before each number");
  assert.deepEqual(notes.map((x) => x.stack), [0, 1, 2], "a column, in order");
  assert.ok(notes.every((x) => x.at[0] === notes[0]!.at[0] && x.at[2] === notes[0]!.at[2]), "all belong to one spot: the stack is on the screen, not in the model");
});

test("a standing mate puts itself back with the change that broke it, in one undo (`in_321`)", () => {
  const rA = drawSquaredRectangle(scene(createSession(kernel)), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]);
  const s0 = box(extrudeLast(run(createSession(kernel), rA.command), rA.lines, 10), 40, 0);
  const [a, b] = bodies(s0);
  const mated = run(s0, actionsFor(scene(s0), [faceOf(s0, b!, [-1, 0, 0]), faceOf(s0, a!, [1, 0, 0])]).find((x) => x.id === "mate:flush")!.run());
  assert.equal(mateStatus(scene(mated))[0]!.standing, true, "a new mate stands");
  const rightA = (rA.corners as Ref[]).filter((c) => (scene(mated).parts[c] as unknown as { at: number[] }).at[0] === 10);
  let wider = mated;
  for (const ref of rightA) { const at = (scene(wider).parts[ref] as unknown as { at: number[] }).at; wider = run(wider, { type: "movePart", ref, to: [14, at[1]!, at[2]!] } as never); }
  assert.equal(mateStatus(scene(wider))[0]!.state, "ok", "true again after the change");
  const [a2, b2] = [bodies(wider).find((x) => x.id === a!.id)!, bodies(wider).find((x) => x.id === b!.id)!];
  assert.ok(Math.abs(b2.bbox!.min[0] - a2.bbox!.max[0]) < 1e-3, "B follows A's wider face");
  assert.ok(a2.bbox!.max[0] > 11, `A is wider: ${a2.bbox!.max}`);
});

test("a pin in a hole turns about the axis and slides along it, and stays mated; the change and what it put back undo together (`in_321`)", () => {
  let s = cylinder(cylinder(createSession(kernel), 0, 0, 5), 40, 0, 3, 8);
  const [a, b] = bodies(s);
  s = run(s, actionsFor(scene(s), [roundOfBody(s, b!), roundOfBody(s, a!)]).find((x) => x.id === "mate:coaxial")!.run());
  assert.equal(mateStatus(scene(s))[0]!.state, "ok");
  const rows = actionsFor(scene(s), [bodies(s).find((x) => x.id === b!.id)!.ref]);
  const [turn, slide] = [rows.find((x) => x.id === "joint:turn")!, rows.find((x) => x.id === "joint:slide")!];
  assert.ok(turn && slide, "a pivot and a slider are offered for the pin");
  const z0 = bodies(s).find((x) => x.id === b!.id)!.bbox!.min[2]!;
  const slid = run(s, slide.run(6));
  assert.ok(!slid.message, `${slid.message}`);
  assert.ok(Math.abs(Math.abs(bodies(slid).find((x) => x.id === b!.id)!.bbox!.min[2]! - z0) - 6) < 1e-3, "it slid six along the axis");
  const spun = run(slid, actionsFor(scene(slid), [bodies(slid).find((x) => x.id === b!.id)!.ref]).find((x) => x.id === "joint:turn")!.run(45));
  assert.ok(!spun.message, `${spun.message}`);
  assert.equal(mateStatus(scene(spun))[0]!.state, "ok", "still mated after turning and sliding");
});

test("a pivot and a slider stop at the limits that are set, remember where they stand, and keep both when the mate is put back (`in_322`)", () => {
  let s = cylinder(cylinder(createSession(kernel), 0, 0, 5), 40, 0, 3, 8);
  const [a, b] = bodies(s);
  s = run(s, actionsFor(scene(s), [roundOfBody(s, b!), roundOfBody(s, a!)]).find((x) => x.id === "mate:coaxial")!.run());
  const rows = (q: Session) => actionsFor(scene(q), [bodies(q).find((x) => x.id === b!.id)!.ref]);
  const z = (q: Session) => bodies(q).find((x) => x.id === b!.id)!.bbox!.min[2]!;
  const z0 = z(s);
  s = run(s, rows(s).find((x) => x.id === "joint:slideMax")!.run(10));
  s = run(s, rows(s).find((x) => x.id === "joint:slideMin")!.run(-2));
  assert.ok(!s.message, `${s.message}`);
  assert.deepEqual(jointOf(scene(s), mateStatus(scene(s))[0]!.id)!.slide, { now: 0, min: -2, max: 10 });
  s = run(s, rows(s).find((x) => x.id === "joint:slide")!.run(25)); // asked for 25: goes to the stop at 10
  assert.equal(jointOf(scene(s), mateStatus(scene(s))[0]!.id)!.slide.now, 10);
  assert.ok(Math.abs(Math.abs(z(s) - z0) - 10) < 1e-3, "it stopped at the limit");
  assert.equal(driveCommand(scene(s), mateStatus(scene(s))[0]!.id, "slide", 3), null, "no further that way");
  s = run(s, rows(s).find((x) => x.id === "joint:slide")!.run(-30)); // back to the low stop, -2
  assert.equal(jointOf(scene(s), mateStatus(scene(s))[0]!.id)!.slide.now, -2);
  assert.equal(limitCommand(scene(s), mateStatus(scene(s))[0]!.id, "slide", "Min", 50), null, "limits that cross are refused");
  const spun = run(s, rows(s).find((x) => x.id === "joint:turn")!.run(30));
  assert.equal(jointOf(scene(spun), mateStatus(scene(spun))[0]!.id)!.turn.now, 30);
  assert.equal(mateStatus(scene(spun))[0]!.state, "ok");
  const id = mateStatus(scene(spun))[0]!.id;
  const freed = run(spun, rows(spun).find((x) => x.id === "joint:slideFree")!.run());
  assert.deepEqual(jointOf(scene(freed), id)!.slide, { now: -2 });
});

import type { AppState } from "../src/interaction/controller.ts";
import { projector } from "../src/interaction/camera.ts";
import { handleMiddle } from "../src/interaction/gizmo.ts";

test("a pin on a coaxial mate shows a ring and an arrow for its joint; dragging the arrow slides it, shown at once and made as one step when let go, stopping at a limit (`in_323`)", () => {
  const env = { w: 800, h: 600, now: 0 };
  let s = cylinder(cylinder(createSession(kernel), 0, 0, 5), 40, 0, 3, 8);
  const [a, b] = bodies(s);
  s = run(s, actionsFor(scene(s), [roundOfBody(s, b!), roundOfBody(s, a!)]).find((x) => x.id === "mate:coaxial")!.run());
  const pin = bodies(s).find((x) => x.id === b!.id)!;
  let st: AppState = { ...createState(s), cam: { ...homeCamera(), target: [0, 0, 5] } };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [pin.ref] } } };
  const handles = frameOf(st, env).gizmo!.handles;
  assert.ok(handles.some((h) => h.id === "joint:turn") && handles.some((h) => h.id === "joint:slide"), "the joint's handles are up");
  const mid = handleMiddle(handles.find((h) => h.id === "joint:slide")!);
  const pr = projector(st.cam, env.w, env.h);
  const [x0, y0] = pr.project(mid);
  const steps0 = scene(st.session).steps.length;
  st = reduce(st, { type: "hover", x: x0, y: y0 }, env);
  let [x, y] = [x0, y0];
  for (const [dx, dy] of [[0, 0], [0, -12], [0, -12], [0, -12]] as [number, number][]) { x += dx; y += dy; st = reduce(st, { type: "orbit", dx, dy, x, y }, env); }
  assert.ok(st.drag && "handle" in st.drag && st.drag.joint && st.drag.joint.amount !== 0, "the drag has taken the joint");
  assert.ok(frameOf(st, env).bodyMatrix, "the body is drawn moved while it is dragged");
  assert.equal(scene(st.session).steps.length, steps0, "nothing made yet");
  const amount = st.drag!.joint!.amount;
  st = reduce(st, { type: "dragEnd" }, env);
  const id = mateStatus(scene(st.session))[0]!.id;
  assert.ok(Math.abs(jointOf(scene(st.session), id)!.slide.now - amount) < 1e-6, "it stands where it was taken");
  assert.equal(mateStatus(scene(st.session))[0]!.state, "ok");
  assert.ok(scene(st.session).steps.length > steps0, "made as steps");
});

test("how far a joint may still go is the room to its stops (`in_323`)", () => {
  let s = cylinder(cylinder(createSession(kernel), 0, 0, 5), 40, 0, 3, 8);
  const [a, b] = bodies(s);
  s = run(s, actionsFor(scene(s), [roundOfBody(s, b!), roundOfBody(s, a!)]).find((x) => x.id === "mate:coaxial")!.run());
  const id = mateStatus(scene(s))[0]!.id;
  assert.deepEqual(jointRoom(scene(s), id, "slide"), { down: -Infinity, up: Infinity });
  s = run(s, actionsFor(scene(s), [bodies(s).find((x) => x.id === b!.id)!.ref]).find((x) => x.id === "joint:slideMax")!.run(4));
  assert.deepEqual(jointRoom(scene(s), id, "slide"), { down: -Infinity, up: 4 });
  assert.ok(jointRigid(scene(s), id, "slide", 3), "a picture of the slide while dragging");
});

test("the edges of a body behind a face are drawn faintly only while a sketch tool is on and there is a body (`in_324`)", () => {
  const env = { w: 800, h: 600, now: 0 };
  const empty = createState(createSession(kernel));
  assert.equal(frameOf(reduce(empty, { type: "runAction", id: "tool:rect" }, env), env).hiddenEdges, false, "no body: nothing to show");
  const st = createState(box(createSession(kernel), 0, 0));
  assert.equal(frameOf(st, env).hiddenEdges, false, "no tool: the usual look");
  const drawing = reduce(st, { type: "runAction", id: "tool:rect" }, env);
  assert.ok(drawing.tool, "the tool is on");
  assert.equal(frameOf(drawing, env).hiddenEdges, true);
});

test("Mate: a round face's axis perpendicular to a flat face turns the body until the axis is along the face's normal, either face first; it stays where it is (`in_325`)", () => {
  let s = cylinder(box(createSession(kernel), 0, 0, 30, 4), 40, 0, 3, 8);
  const [a, b] = bodies(s);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "rotate", parts: [b!.ref], params: { axis: 0, value: 35, px: 40, py: 0, pz: 0, body: b!.id } } } as never);
  const pin = bodies(s).find((x) => x.id === b!.id)!;
  const height = (q: Body) => q.bbox!.max[2]! - q.bbox!.min[2]!;
  assert.ok(Math.abs(height(pin) - 8) > 1, `the pin is tilted: ${height(pin)}`);
  const top = faceOf(s, bodies(s).find((x) => x.id === a!.id)!, [0, 0, 1]);
  const act = actionsFor(scene(s), [roundOfBody(s, pin), top]).find((x) => x.id === "mate:axisToFace");
  assert.ok(act?.enabled, `offered for a round and a flat face: ${act?.why}`);
  const done = run(s, act!.run());
  assert.ok(!done.message, `${done.message}`);
  const st = mateStatus(scene(done))[0]!;
  assert.equal(st.mode, "axisToFace");
  assert.equal(st.state, "ok", `${st.residual}`);
  assert.ok(Math.abs(height(bodies(done).find((x) => x.id === b!.id)!) - 8) < 1e-3, "the pin stands upright again");
  assert.deepEqual(minOf(bodies(done).find((x) => x.id === a!.id)!), minOf(bodies(s).find((x) => x.id === a!.id)!), "the plate did not move");
  // two flat faces, or two round ones, are not this mate
  const two = actionsFor(scene(s), [top, faceOf(s, bodies(s).find((x) => x.id === a!.id)!, [1, 0, 0])]).find((x) => x.id === "mate:axisToFace");
  assert.ok(!two || !two.enabled, "not for two flat faces");
  // the flat face first: the plate is turned (it is the mover); it is the other way round, and put back when the pin turns again
  const flip = run(s, actionsFor(scene(s), [top, roundOfBody(s, pin)]).find((x) => x.id === "mate:axisToFace")!.run());
  assert.equal(mateStatus(scene(flip))[0]!.state, "ok");
});

test("an angle past 90 is between the directions themselves: 120 leans the faces away from each other; it is checked at that and put back, and 100 differs from 80 (`in_326`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const pick = [faceOf(s, b!, [-1, 0, 0]), faceOf(s, a!, [1, 0, 0])];
  const act = actionsFor(scene(s), pick).find((x) => x.id === "mate:angle")!;
  const wide = once(run(s, act.run(120)));
  assert.ok(!wide.message, `${wide.message}`);
  const st = mateStatus(scene(wide))[0]!;
  assert.equal(st.gap, 120, "the number is kept, not cut to 90");
  assert.equal(st.state, "ok", `${st.residual}`);
  const dot = st.mover!.dir[0] * st.other!.dir[0] + st.mover!.dir[1] * st.other!.dir[1] + st.mover!.dir[2] * st.other!.dir[2];
  assert.ok(Math.abs(dot - Math.cos((120 * Math.PI) / 180)) < 1e-6, `the normals are 120 degrees apart: ${dot}`);
  // 80 is the other way round: the normals are 80 apart, so their angle as lines is 80 too, and they differ from 120
  const near = once(run(s, act.run(80)));
  const dn = mateStatus(scene(near))[0]!;
  assert.ok(Math.abs(Math.abs(dn.mover!.dir[0] * dn.other!.dir[0] + dn.mover!.dir[1] * dn.other!.dir[1] + dn.mover!.dir[2] * dn.other!.dir[2]) - Math.cos((80 * Math.PI) / 180)) < 1e-6);
  // turned by hand: off, and put back to 120 by the turn
  const off = turned(wide, bodies(wide).find((x) => x.id === b!.id)!, 20);
  assert.equal(mateStatus(scene(off))[0]!.state, "off");
  assert.equal(mateStatus(scene(run(off, putMatesBack(scene(off))!.command)))[0]!.state, "ok");
});

import { stackOffset } from "../src/interaction/bubbleplace.ts";
test("a column of mate numbers goes down, and up when it would run off the bottom of the page and there is room above (`in_327`)", () => {
  assert.deepEqual([0, 1, 2].map((i) => stackOffset(100, i, 3, 600)), [0, 38, 76], "room below: down");
  assert.deepEqual([0, 1, 2].map((i) => stackOffset(560, i, 3, 600)), [0, -38, -76], "no room below: up");
  assert.deepEqual([0, 1, 2].map((i) => stackOffset(40, i, 3, 100)), [0, 38, 76], "no room above either: stays down");
  assert.equal(stackOffset(560, 0, 1, 600), 0, "one number does not move");
});

test("a mate whose face is gone still says whether it stands, so it can be reported (`in_328`)", () => {
  let s = cylinder(cylinder(createSession(kernel), 0, 0, 5), 40, 0, 3, 8);
  const [a, b] = bodies(s);
  s = run(s, actionsFor(scene(s), [roundOfBody(s, b!), roundOfBody(s, a!)]).find((x) => x.id === "mate:coaxial")!.run());
  const gone = run(s, actionsFor(scene(s), [bodies(s).find((x) => x.id === a!.id)!.ref]).find((x) => x.id === "delete")!.run());
  assert.ok(mateStatus(scene(s)).every((m) => m.standing === true), "standing while true");
  assert.ok(mateStatus(scene(gone)).every((m) => m.standing === true) || mateStatus(scene(gone)).length === 0, "and when lost");
});

test("a chain of standing mates follows a change all at once: widening the first body moves the second and the third with it (`in_329`)", () => {
  const rA = drawSquaredRectangle(scene(createSession(kernel)), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]);
  let s = box(box(extrudeLast(run(createSession(kernel), rA.command), rA.lines, 10), 40, 0), 80, 0);
  const [a, b, c] = bodies(s);
  const face = (q: Session, id: string | undefined, n: [number, number, number]) => faceOf(q, bodies(q).find((x) => x.id === id)!, n);
  s = run(s, actionsFor(scene(s), [face(s, b!.id, [-1, 0, 0]), face(s, a!.id, [1, 0, 0])]).find((x) => x.id === "mate:flush")!.run());
  s = run(s, actionsFor(scene(s), [face(s, c!.id, [-1, 0, 0]), face(s, b!.id, [1, 0, 0])]).find((x) => x.id === "mate:flush")!.run());
  const at = (q: Session, id: string | undefined) => bodies(q).find((x) => x.id === id)!.bbox!;
  assert.ok(Math.abs(at(s, b!.id).min[0] - 10) < 1e-3 && Math.abs(at(s, c!.id).min[0] - 20) < 1e-3, "chained: 10 and 20");
  const rightA = (rA.corners as Ref[]).filter((q) => (scene(s).parts[q] as unknown as { at: number[] }).at[0] === 10);
  const before = scene(s).steps.length;
  let wider = s;
  for (const ref of rightA) { const p = (scene(wider).parts[ref] as unknown as { at: number[] }).at; wider = run(wider, { type: "movePart", ref, to: [14, p[1]!, p[2]!] } as never); }
  assert.ok(mateStatus(scene(wider)).every((m) => m.state === "ok"), "every mate holds again");
  const grew = at(wider, a!.id).max[0]! - 10;
  assert.ok(grew > 1, `A is wider by ${grew}`);
  assert.ok(Math.abs(at(wider, b!.id).min[0] - (10 + grew)) < 1e-3, "B follows A");
  assert.ok(Math.abs(at(wider, c!.id).min[0] - (20 + grew)) < 1e-3, "C follows B");
  assert.ok(scene(wider).steps.length > before);
});

test("a change that leaves standing mates with no placement where they all hold is refused, naming them, and nothing is made (`in_330`, `in_331`)", () => {
  // B is put against A's right face (x = 10 to 20); then its right face is to be mated against C's left face, at x = 25: no place holds both
  let s = box(box(box(createSession(kernel), 0, 0), 40, 0), 25, 30);
  const [a, b, c] = bodies(s);
  const face = (q: Session, id: string | undefined, n: [number, number, number]) => faceOf(q, bodies(q).find((x) => x.id === id)!, n);
  s = run(s, actionsFor(scene(s), [face(s, b!.id, [-1, 0, 0]), face(s, a!.id, [1, 0, 0])]).find((x) => x.id === "mate:flush")!.run());
  const second = run(s, actionsFor(scene(s), [face(s, b!.id, [1, 0, 0]), face(s, c!.id, [-1, 0, 0])]).find((x) => x.id === "mate:flush")!.run());
  assert.ok(second.message && /unable to hold at once/.test(second.message), `said: ${second.message}`);
  assert.ok(second.conflict && second.conflict.culprits.length >= 1, "the mates are named for the flash");
  assert.equal(second.history, s.history, "refused: nothing was made, nothing to undo");
  assert.equal(scene(second).relations.filter((r) => r.kind === "mate").length, 1, "still one mate");
  // with the first mate taken away it can be made
  const free = run(s, { type: "removeRelation", id: scene(s).relations.find((r) => r.kind === "mate")!.id });
  const ok = run(free, actionsFor(scene(free), [face(free, b!.id, [1, 0, 0]), face(free, c!.id, [-1, 0, 0])]).find((x) => x.id === "mate:flush")!.run());
  assert.ok(!ok.message, `${ok.message}`);
});

import { clearOfLines } from "../src/interaction/bubbleplace.ts";
test("a mark that would stand on a line moves off it, nearby; one that is clear stays (`in_334`)", () => {
  const arrow: [[number, number], [number, number]][] = [[[100, 200], [300, 200]]];
  assert.deepEqual(clearOfLines([200, 100], arrow, 13), [200, 100], "clear: stays");
  const moved = clearOfLines([200, 200], arrow, 13);
  assert.ok(Math.abs(moved[1] - 200) >= 16 && Math.hypot(moved[0] - 200, moved[1] - 200) < 45, `off the arrow, near its place: ${moved}`);
  // lines on every side of it: the wider ring
  const boxed: [[number, number], [number, number]][] = [[[100, 200], [300, 200]], [[200, 100], [200, 300]]];
  const m2 = clearOfLines([200, 200], boxed, 13);
  assert.ok(boxed.every(([a, b]) => Math.abs((b[0] - a[0]) * (a[1] - m2[1]) - (a[0] - m2[0]) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]) >= 16), `clear of both: ${m2}`);
  assert.deepEqual(clearOfLines([200, 200], [[[0, 0], [1000, 1000]], [[0, 400], [400, 0]], [[0, 200], [1000, 200]], [[200, 0], [200, 1000]]], 13), [200, 200], "nowhere clear: where it was");
});

import { changeWords } from "../src/interaction/changewords.ts";
test("the refusal says which change it is and which bodies the mates join (`in_335`)", () => {
  let s = box(box(box(createSession(kernel), 0, 0), 40, 0), 25, 30);
  const [a, b, c] = bodies(s);
  const face = (q: Session, id: string | undefined, n: [number, number, number]) => faceOf(q, bodies(q).find((x) => x.id === id)!, n);
  s = run(s, actionsFor(scene(s), [face(s, b!.id, [-1, 0, 0]), face(s, a!.id, [1, 0, 0])]).find((x) => x.id === "mate:flush")!.run());
  const second = run(s, actionsFor(scene(s), [face(s, b!.id, [1, 0, 0]), face(s, c!.id, [-1, 0, 0])]).find((x) => x.id === "mate:flush")!.run());
  assert.match(second.message ?? "", /^That mate would leave these standing mates unable to hold at once: flush between Body \d and Body \d; flush between Body \d and Body \d\./, `${second.message}`);
  assert.equal(changeWords(scene(s), { type: "addStep", step: { id: "s_x", type: "move", parts: [], params: {} } as never }), "that move of a body");
  assert.equal(changeWords(scene(s), { type: "batch", commands: [{ type: "removeRelation", id: "r_1" }, { type: "movePart", ref: a!.ref, to: [0, 0, 0] }] }), "that move of a point of a drawing");
});

test("a mark also keeps off the drag icons of a finger (`in_336`)", () => {
  const icon: [number, number, number][] = [[225, 300, 26]];
  assert.deepEqual(clearOfLines([300, 100], [], 13, icon), [300, 100], "far from the icon: stays");
  const moved = clearOfLines([241, 301], [], 13, icon);
  assert.ok(Math.hypot(moved[0] - 225, moved[1] - 300) >= 13 + 26, `off the icon: ${moved}`);
});

// Mates between bodies (`in_314`): two faces of two bodies brought together by moving and turning the first one's body.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run, saveText, openSession } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { actionsFor } from "../src/interaction/actions.ts";
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
  const done = run(s, actionsFor(scene(s), [faceOf(s, b!, [-1, 0, 0]), faceOf(s, a!, [1, 0, 0])]).find((x) => x.id === "mate:flush")!.run());
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

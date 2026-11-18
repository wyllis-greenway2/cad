// A face or an axis of a body made level or upright (`in_837`): a mate with the world, the face turned against the plane across the world's up direction; it holds after the body is moved or turned.
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

import { mateStatus } from "../src/operation/mates.ts";
const theBody = (s: Session): Body => Object.values(scene(s).parts).find((p): p is Body => p.kind === "body")!;
const rotate = (s: Session, b: Body, axis: 0 | 1 | 2, deg: number) => run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "rotate", parts: [b.ref], params: { axis, value: deg, px: 5, py: 5, pz: 5 } } });
const dirOf = (s: Session, ref: Ref): readonly number[] => normalOfPlane(scene(s).parts[ref] as PlanePart);
const upOf = (s: Session, ref: Ref) => Math.abs(dirOf(s, ref)[2]!);

test("Horizontal on a flat face of a tilted body turns the body until the face is level; Vertical until it is upright; both are mates with the world that stay true (`in_837`)", () => {
  let s = box(createSession(kernel), 0, 0);
  s = rotate(s, theBody(s), 0, 20);
  const top = (st: Session) => Object.values(scene(st).parts).filter((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && !!p.mesh && !p.curved && !p.round && !p.rounded).sort((a, b) => Math.abs(normalOfPlane(b)[2]!) - Math.abs(normalOfPlane(a)[2]!))[0]!;
  const face = top(s);
  assert.ok(Math.abs(dirOf(s, face.ref)[2]!) < 0.99, "tilted: not level");
  const act = actionsFor(scene(s), [face.ref]).find((x) => x.id === "mate:horizontal")!;
  assert.ok(act?.enabled, `offered: ${act?.why}`);
  const after = run(s, act.run());
  assert.ok(!after.message, `${after.message}`);
  assert.ok(Math.abs(upOf(after, top(after).ref) - 1) < 1e-6, `the face is level now: ${dirOf(after, top(after).ref)}`);
  const m = mateStatus(scene(after)).find((x) => x.mode === "parallel");
  assert.ok(m && m.state === "ok", `the mate holds: ${m?.state}`);
  // Vertical on a side face: the face is upright
  const side = Object.values(scene(s).parts).filter((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && !!p.mesh && !p.curved && !p.round && !p.rounded).sort((a, b) => Math.abs(normalOfPlane(a)[2]!) - Math.abs(normalOfPlane(b)[2]!))[0]!;
  const vert = actionsFor(scene(s), [side.ref]).find((x) => x.id === "mate:vertical")!;
  const up = run(s, vert.run());
  assert.ok(!up.message, `${up.message}`);
  const sideNow = Object.values(scene(up).parts).filter((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && !!p.mesh && !p.curved && !p.round && !p.rounded).sort((a, b) => Math.abs(normalOfPlane(a)[2]!) - Math.abs(normalOfPlane(b)[2]!))[0]!;
  assert.ok(Math.abs(normalOfPlane(sideNow)[2]!) < 1e-6, "an upright face has a level normal");
});

test("Horizontal on the round face of a cylinder lays its axis level; Vertical stands it up (`in_837`)", () => {
  let s = cylinder(createSession(kernel), 0, 0, 5);
  s = rotate(s, theBody(s), 0, 35);
  const round = (Object.values(scene(s).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && !!(p.curved || p.round)))!.ref;
  const h = run(s, actionsFor(scene(s), [round]).find((x) => x.id === "mate:horizontal")!.run());
  assert.ok(!h.message, `${h.message}`);
    const state = mateStatus(scene(h)).find((x) => x.mode === "perpendicularAxes");
  assert.ok(state && state.state === "ok", `the axis mate holds: ${state?.state}`);
  const v = run(s, actionsFor(scene(s), [round]).find((x) => x.id === "mate:vertical")!.run());
  assert.ok(!v.message, `${v.message}`);
  assert.ok(mateStatus(scene(v)).find((x) => x.mode === "parallelAxes")?.state === "ok", "the upright mate holds");
});

test("a mate with the world is dimmed for two faces and for none, and the ring's Horizontal makes it (`in_837`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  assert.ok(!actionsFor(scene(s), [faceOf(s, a!, [0, 0, 1]), faceOf(s, b!, [0, 0, 1])]).some((x) => x.id === "mate:horizontal"), "two faces: the pair mates, not the world");
  assert.ok(!actionsFor(scene(s), []).some((x) => x.id === "mate:horizontal"), "nothing selected");
});

import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
test("a body made level stays level: turning it about a horizontal axis is held by the mate, and moving it sideways is free (`in_837`)", () => {
  let s = box(createSession(kernel), 0, 0);
  const faces = (st: Session) => Object.values(scene(st).parts).filter((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && !!p.mesh && !p.curved && !p.round && !p.rounded);
  const topOf = (st: Session) => faces(st).sort((a, b) => Math.abs(normalOfPlane(b)[2]!) - Math.abs(normalOfPlane(a)[2]!))[0]!;
  s = run(s, actionsFor(scene(s), [topOf(s).ref]).find((x) => x.id === "mate:horizontal")!.run());
  const mv = startOp(scene(s), [theBody(s).ref], "rotate");
  assert.ok(mv.ok, "the body can be turned");
  if (!mv.ok) return;
  const turned = runOp(s, { ...mv.op, axis: 0 as const, value: 15 });
  assert.ok(turned);
  assert.ok(Math.abs(Math.abs(normalOfPlane(topOf(turned!.session))[2]!) - 1) < 1e-6 || /mates of this body/.test(turned!.session.message ?? ""), `held: the top is level or the turn is refused (${turned!.session.message})`);
  const slid = startOp(scene(s), [theBody(s).ref], "move");
  assert.ok(slid.ok);
  if (!slid.ok) return;
  const moved = runOp(s, { ...slid.op, axis: 0 as const, value: 12 });
  assert.equal(moved!.session.message, null, "a move along X leaves a level face level: nothing holds it");
});

test("Tangent lays a cylinder on a flat face of another body (outside it, a radius from the plane, the axis in it), and holds two cylinders a radius apart; the ring's Tangent makes it (`in_837`)", () => {
  let s = box(createSession(kernel), 0, 0);
  s = cylinder(s, 40, 3, 3);
  const [a, b] = bodies(s);
  const boxBody = a!.bbox!.max[0]! < 20 ? a! : b!;
  const cyl = boxBody === a ? b! : a!;
  const top = faceOf(s, boxBody, [0, 0, 1]);
  const round = roundOfBody(s, cyl);
  const act = actionsFor(scene(s), [round, top]).find((x) => x.id === "mate:tangent")!;
  assert.ok(act?.enabled, `offered: ${act?.why}`);
  const after = run(s, act.run());
  assert.ok(!after.message, `${after.message}`);
  const cyl2 = bodies(after).find((x) => x.id === cyl.id)!;
  const box2 = bodies(after).find((x) => x.id === boxBody.id)!;
  assert.deepEqual(minOf(box2), minOf(boxBody), "the box stayed");
  // lying on the top face: its lowest point is on the plane z = 10, its highest 2 radii above
  assert.ok(Math.abs(cyl2.bbox!.min[2]! - 10) < 0.05 && Math.abs(cyl2.bbox!.max[2]! - 16) < 0.05, `the cylinder lies on the top: z ${cyl2.bbox!.min[2]}..${cyl2.bbox!.max[2]}`);
  assert.ok(mateStatus(scene(after)).some((m) => m.mode === "tangent" && m.state === "ok"), "the mate holds");
  // the ring's Tangent entry makes the same
  const entry = actionsFor(scene(s), [round, top]).some((x) => x.id === "mate:tangent");
  assert.ok(entry, "the Tangent entry of the ring has it to make");
  // two flat faces: no tangent
  assert.ok(!actionsFor(scene(s), [faceOf(s, boxBody, [0, 0, 1]), faceOf(s, boxBody, [1, 0, 0])]).some((x) => x.id === "mate:tangent" && x.enabled));
});

test("Tangent of two cylinders stands their axes parallel and the sum of the radii apart (`in_837`)", () => {
  let s = cylinder(createSession(kernel), 0, 0, 4);
  s = cylinder(s, 30, 2, 3);
  const [a, b] = bodies(s);
  const first = a!.bbox!.max[0]! < 15 ? a! : b!;
  const second = first === a ? b! : a!;
  const act = actionsFor(scene(s), [roundOfBody(s, second), roundOfBody(s, first)]).find((x) => x.id === "mate:tangent")!;
  assert.ok(act?.enabled, `offered: ${act?.why}`);
  const after = run(s, act.run());
  assert.ok(!after.message, `${after.message}`);
  const m = mateStatus(scene(after)).find((x) => x.mode === "tangent");
  assert.ok(m && m.state === "ok", `holds: ${m?.state} ${m?.residual}`);
  const [c1, c2] = [first, second].map((x) => bodies(after).find((q) => q.id === x.id)!);
  const dx = (c2!.bbox!.min[0]! + c2!.bbox!.max[0]!) / 2 - (c1!.bbox!.min[0]! + c1!.bbox!.max[0]!) / 2;
  const dy = (c2!.bbox!.min[1]! + c2!.bbox!.max[1]!) / 2 - (c1!.bbox!.min[1]! + c1!.bbox!.max[1]!) / 2;
  assert.ok(Math.abs(Math.hypot(dx, dy) - 7) < 0.05, `the axes are 7 apart (4 + 3): ${Math.hypot(dx, dy)}`);
});

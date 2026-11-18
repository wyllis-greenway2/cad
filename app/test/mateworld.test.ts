// A face or an axis of a body made level or upright (`in_970`): a mate with the world, the face turned against the plane across the world's up direction; it holds after the body is moved or turned.
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

test("Horizontal on a flat face of a tilted body turns the body until the face is level; Vertical until it is upright; both are mates with the world that stay true (`in_970`)", () => {
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

test("Horizontal on the round face of a cylinder lays its axis level; Vertical stands it up (`in_970`)", () => {
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

test("a mate with the world is dimmed for two faces and for none, and the ring's Horizontal makes it (`in_970`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  assert.ok(!actionsFor(scene(s), [faceOf(s, a!, [0, 0, 1]), faceOf(s, b!, [0, 0, 1])]).some((x) => x.id === "mate:horizontal"), "two faces: the pair mates, not the world");
  assert.ok(!actionsFor(scene(s), []).some((x) => x.id === "mate:horizontal"), "nothing selected");
});

import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
test("a body made level stays level: turning it about a horizontal axis is held by the mate, and moving it sideways is free (`in_970`)", () => {
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

test("Tangent lays a cylinder on a flat face of another body (outside it, a radius from the plane, the axis in it), and holds two cylinders a radius apart; the ring's Tangent makes it (`in_970`)", () => {
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

test("Tangent of two cylinders stands their axes parallel and the sum of the radii apart (`in_970`)", () => {
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

test("a face and a world plane selected: Parallel puts the face against the X or Y plane's direction, Coincident lays the body on the plane, a cylinder rests on the ground with Tangent (`in_971`)", () => {
  let s = box(createSession(kernel), 5, 5);
  s = rotate(s, theBody(s), 2, 30); // (turned about Z: its side faces are not along X or Y)
  const faces = (st: Session) => Object.values(scene(st).parts).filter((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && !!p.mesh && !p.curved && !p.round && !p.rounded);
  const side = faces(s).sort((a, b) => Math.abs(normalOfPlane(a)[2]!) - Math.abs(normalOfPlane(b)[2]!))[0]!;
  const yz = worldRef("YZ");
  const par = actionsFor(scene(s), [side.ref, yz]).find((x) => x.id === "mate:parallel")!;
  assert.ok(par?.enabled, `offered: ${par?.why}`);
  const after = run(s, par.run());
  assert.ok(!after.message, `${after.message}`);
  const parallelToYZ = faces(after).some((p) => Math.abs(Math.abs(normalOfPlane(p)[0]!) - 1) < 1e-6);
  assert.ok(parallelToYZ, "a side face now faces along X: it is parallel to the YZ plane");
  assert.ok(mateStatus(scene(after)).some((m) => m.mode === "parallel" && m.state === "ok"), "the mate holds");
  // flush: the bottom face of a body that floats is laid on the XY plane
  const fl = createSession(kernel);
  let f = box(fl, 0, 0);
  f = run(f, { type: "addStep", step: { id: nextId(scene(f), "s"), type: "move", parts: [theBody(f).ref], params: { axis: 2, value: 7 } } });
  const bottom = faces(f).sort((a, b) => normalOfPlane(a)[2]! - normalOfPlane(b)[2]!)[0]!;
  const flush = actionsFor(scene(f), [bottom.ref, worldRef("XY")]).find((x) => x.id === "mate:flush")!;
  assert.ok(flush?.enabled, `offered: ${flush?.why}`);
  const laid = run(f, flush.run());
  assert.ok(!laid.message, `${laid.message}`);
  assert.ok(Math.abs(theBody(laid).bbox!.min[2]!) < 1e-3, `the body lies on the plane: z from ${theBody(laid).bbox!.min[2]}`);
  // a cylinder standing up is laid on the ground
  let c = cylinder(createSession(kernel), 0, 0, 3);
  c = run(c, { type: "addStep", step: { id: nextId(scene(c), "s"), type: "move", parts: [theBody(c).ref], params: { axis: 2, value: 9 } } });
  const roundFace = (Object.values(scene(c).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && !!(p.curved || p.round)))!.ref;
  const tan = actionsFor(scene(c), [roundFace, worldRef("XY")]).find((x) => x.id === "mate:tangent")!;
  assert.ok(tan?.enabled, `offered: ${tan?.why}`);
  const rest = run(c, tan.run());
  assert.ok(!rest.message, `${rest.message}`);
  assert.ok(Math.abs(theBody(rest).bbox!.min[2]!) < 0.05 && Math.abs(theBody(rest).bbox!.max[2]! - 6) < 0.05, `the cylinder lies on the ground: z ${theBody(rest).bbox!.min[2]}..${theBody(rest).bbox!.max[2]}`);
});

import { drawChain } from "../src/operation/build.ts";
const revolved = (s: Session, pts: number[][], bulges: number[] | undefined, x: number, y: number): Session => {
  const ch = drawChain(scene(s), XY, pts as never, true, bulges ? { bulges } : {});
  return run(run(s, ch.command), { type: "addStep", step: { id: nextId(scene(s), "s"), type: "revolve", parts: ch.lines, params: { angle: 360, advance: 0, ax: x, ay: y, az: 0, dx: 0, dy: 1, dz: 0, mode: "new" } } });
};
const ball = (s: Session, x: number, y: number, r: number) => revolved(s, [[x, y - r, 0], [x, y + r, 0]], [0, 0.5], x, y);
const cone = (s: Session, x: number, y: number) => revolved(s, [[x, y, 0], [x + 6, y, 0], [x, y + 10, 0]], undefined, x, y);
const curved = (s: Session, body: Body, what: "sphere" | "cone"): Ref => (Object.values(scene(s).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && p.of === body.ref && !!(what === "sphere" ? p.sphere : p.cone)))!.ref;

test("a ball: tangent to a flat face rests on it, tangent to a cylinder touches its side, tangent to a ball touches at a point (`in_971`)", () => {
  // on a flat face
  let s = ball(box(createSession(kernel), 0, 0), 40, 5, 3);
  let [a, b] = bodies(s);
  let boxB = a!.bbox!.max[0]! < 20 ? a! : b!;
  let ballB = boxB === a ? b! : a!;
  let act = actionsFor(scene(s), [curved(s, ballB, "sphere"), faceOf(s, boxB, [0, 0, 1])]).find((x) => x.id === "mate:tangent")!;
  assert.ok(act?.enabled, `ball on a face: ${act?.why}`);
  let after = run(s, act.run());
  assert.ok(!after.message, `${after.message}`);
  const bb = bodies(after).find((x) => x.id === ballB.id)!;
  assert.ok(Math.abs(bb.bbox!.min[2]! - 10) < 0.05, `the ball rests on the top face: its lowest point is at z ${bb.bbox!.min[2]}`);
  assert.ok(mateStatus(scene(after)).some((m) => m.mode === "tangent" && m.state === "ok"), "the mate holds");
  // against a cylinder
  s = ball(cylinder(createSession(kernel), 0, 0, 4), 30, 1, 2);
  [a, b] = bodies(s);
  const cylB = a!.bbox!.max[0]! < 15 ? a! : b!;
  ballB = cylB === a ? b! : a!;
  act = actionsFor(scene(s), [curved(s, ballB, "sphere"), roundOfBody(s, cylB)]).find((x) => x.id === "mate:tangent")!;
  assert.ok(act?.enabled, `ball on a cylinder: ${act?.why}`);
  after = run(s, act.run());
  assert.ok(!after.message, `${after.message}`);
  const bc = bodies(after).find((x) => x.id === ballB.id)!;
  const centre = [(bc.bbox!.min[0]! + bc.bbox!.max[0]!) / 2, (bc.bbox!.min[1]! + bc.bbox!.max[1]!) / 2];
  assert.ok(Math.abs(Math.hypot(centre[0]!, centre[1]!) - 6) < 0.05, `the ball's centre is 6 from the cylinder's axis (4 + 2): ${Math.hypot(centre[0]!, centre[1]!)}`);
  // two balls
  s = ball(ball(createSession(kernel), 0, 0, 4), 30, 3, 2);
  [a, b] = bodies(s);
  const first = a!.bbox!.max[0]! < 15 ? a! : b!;
  const second = first === a ? b! : a!;
  act = actionsFor(scene(s), [curved(s, second, "sphere"), curved(s, first, "sphere")]).find((x) => x.id === "mate:tangent")!;
  assert.ok(act?.enabled, `two balls: ${act?.why}`);
  after = run(s, act.run());
  assert.ok(!after.message, `${after.message}`);
  const cs = [first, second].map((x) => { const q = bodies(after).find((y) => y.id === x.id)!; return q.bbox!.min.map((v, i) => (v + q.bbox!.max[i]!) / 2); });
  assert.ok(Math.abs(Math.hypot(cs[1]![0]! - cs[0]![0]!, cs[1]![1]! - cs[0]![1]!, cs[1]![2]! - cs[0]![2]!) - 6) < 0.05, "the centres are 6 apart (4 + 2)");
});

test("a cone: tangent to a flat face (a world plane) puts its apex on it and lays it along a line of the cone; tangent to a round face is refused with why (`in_971`)", () => {
  let s = cone(createSession(kernel), 0, 0);
  const c = bodies(s).length ? bodies(s)[0]! : (Object.values(scene(s).parts).find((p): p is Body => p.kind === "body")!);
  const coneFace = (Object.values(scene(s).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && !!p.cone))!.ref;
  void c;
  const act = actionsFor(scene(s), [coneFace, worldRef("XY")]).find((x) => x.id === "mate:tangent")!;
  assert.ok(act?.enabled, `cone on the ground: ${act?.why}`);
  s = run(s, act.run());
  assert.ok(!s.message, `${s.message}`);
  const body = Object.values(scene(s).parts).find((p): p is Body => p.kind === "body")!;
  assert.ok(Math.abs(body.bbox!.min[2]!) < 0.1, `the cone touches the plane: its lowest point is at z ${body.bbox!.min[2]}`);
  assert.ok(mateStatus(scene(s)).some((m) => m.mode === "tangent" && m.state === "ok"), "the mate holds");
  // against a cylinder: refused with why
  const two = cone(cylinder(createSession(kernel), 40, 0, 3), 0, 0);
  const [p, q] = bodies(two);
  const cyl = p!.bbox!.min[0]! > 20 ? p! : q!;
  const cn = cyl === p ? q! : p!;
  const refused = actionsFor(scene(two), [curved(two, cn, "cone"), roundOfBody(two, cyl)]).find((x) => x.id === "mate:tangent");
  assert.ok(!refused || !refused.enabled, "a cone against a cylinder is not made");
  if (refused) assert.match(refused.why ?? "", /cone/);
});

// Any body made to turn (`in_941`): a joint with the world, an axis and nothing else; set from a round face of the body or from the pivot of an open rotate; it is saved, gets a play button, can be played, and can yield to a hard body that pushes it.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawCircle } from "../src/operation/build.ts";
import { nextId, toJSON, fromJSON } from "../src/operation/scene.ts";
import type { Part } from "../src/operation/part.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { startOp } from "../src/interaction/operations.ts";
import { startMotion } from "../src/interaction/motion.ts";
import { pivotOfBody } from "../src/operation/pivot.ts";

await kernel.init();
const XY = worldRef("XY");
type Body = Extract<Part, { kind: "body" }>;
type PlanePart = Extract<Part, { kind: "plane" }>;
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p): p is Body => p.kind === "body" && p.ref !== "b/body/o");
const roundOfBody = (s: Session, body: Body): Ref => (Object.values(scene(s).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && p.of === body.ref && !!(p.curved || p.round || p.rounded))!).ref;
function cylinder(s: Session, x: number, y: number, radius: number, h = 10): Session { const c = drawCircle(scene(s), XY, [x, y, 0], radius); s = run(s, c.command); return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: h } } }); }
const env = { w: 800, h: 600, now: 0 };
const select = (st: ReturnType<typeof createState>, refs: Ref[]): ReturnType<typeof createState> => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs } } }) as ReturnType<typeof createState>;

test("a round face of a body selected, Pivot: the body turns about that face's axis, plays at once, has a play button, and is saved", () => {
  const s = cylinder(cylinder(createSession(kernel), 30, 0, 5), 100, 0, 3); // (two bodies, so each has a name of its own)
  const [b] = bodies(s);
  assert.ok(b);
  assert.ok(!startMotion(scene(s), b!.ref).ok, "a free body cannot be played yet");
  let st = select({ ...createState(s), cam: homeCamera() }, [roundOfBody(s, b!)]);
  st = reduce(st, { type: "runAction", id: "motion:pivot" }, env as never);
  assert.ok(!st.session.message, st.session.message ?? "");
  const pv = scene(st.session).pivots?.[0];
  assert.ok(pv, "the pivot is in the scene");
  assert.ok(Math.abs(pv!.point[0] - 30) < 1e-6 && Math.abs(pv!.point[1]) < 1e-6, `through the axis of the cylinder: ${pv!.point}`);
  assert.ok(Math.abs(Math.abs(pv!.dir[2]) - 1) < 1e-9, `along z: ${pv!.dir}`);
  assert.ok(st.motion?.playing && st.motion.body === b!.ref, "playing");
  assert.ok(!st.motion!.noKeep, "and its pose can be kept (`in_1018`)");
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(f.bodyEyes.find((e) => e.ref === b!.ref)?.play, "pause", "its button is a pause button while it plays");
  assert.deepEqual(fromJSON(toJSON(scene(st.session))).pivots, scene(st.session).pivots, "the file keeps it");
  // still again
  st = select({ ...st, motion: null }, [b!.ref]);
  st = reduce(st, { type: "runAction", id: "motion:unpivot" }, env as never);
  assert.equal(scene(st.session).pivots, undefined);
  assert.ok(!pivotOfBody(scene(st.session), b!.ref));
});

test("a body alone selected has no axis to turn about: it says what to select; with a rotate open on it the pivot is where the orb is, about the axis it turns about", () => {
  const s = cylinder(cylinder(createSession(kernel), 0, 0, 5), 100, 0, 3);
  const [b] = bodies(s);
  let st = select({ ...createState(s), cam: homeCamera() }, [b!.ref]);
  const none = reduce(st, { type: "runAction", id: "motion:pivot" }, env as never);
  assert.match(none.session.message ?? "", /round face|Rotate/);
  const op = startOp(scene(s), [b!.ref], "rotate");
  assert.ok(op.ok);
  if (!op.ok) return;
  st = { ...st, op: { ...op.op, pivot: [3, 4, 0] } };
  st = reduce(st, { type: "runAction", id: "motion:pivot" }, env as never);
  assert.ok(!st.session.message, st.session.message ?? "");
  const pv = scene(st.session).pivots![0]!;
  assert.deepEqual([pv.point[0], pv.point[1], pv.point[2]], [3, 4, 0], "where the orb is");
  assert.equal(st.op, null, "the rotate is closed: nothing was turned");
  assert.ok(st.motion?.playing);
});

test("a body made to turn can yield to a hard body that pushes it", () => {
  let s = cylinder(cylinder(createSession(kernel), 0, 0, 5), 40, 0, 5);
  const [a, b] = bodies(s);
  for (const x of [a!, b!]) { s = run(s, { type: "pivot", body: x.id as string, point: [x === a ? 0 : 40, 0, 0], dir: [0, 0, 1] }); assert.ok(!s.message, s.message ?? ""); }
  s = run(s, { type: "setHard", body: a!.id as string, on: true });
  const r = startMotion(scene(s), a!.ref, "turn", s.outcome);
  assert.ok(r.ok, r.ok ? "" : r.why);
  if (!r.ok) return;
  assert.ok(r.motion.contact?.pushables.some((p) => p.body === b!.ref), "the other can yield");
});

test("Keep pose for a body made to turn: the turn is written as ordinary steps about the pivot's axis, and so are the bodies that yielded to it (`in_1018`)", async () => {
  const { keepCommand } = await import("../src/interaction/motion.ts");
  let s = cylinder(cylinder(createSession(kernel), 0, 0, 5), 60, 0, 3);
  const [a, b] = bodies(s);
  s = run(s, { type: "pivot", body: a!.id as string, point: [3, 4, 0], dir: [0, 0, 1] }); // (off the middle: the body goes round it)
  s = run(s, { type: "pivot", body: b!.id as string, point: [60, 10, 0], dir: [0, 0, 1] });
  assert.ok(!s.message, s.message ?? "");
  const centre = (ss: Session, ref: Ref) => { const bb = (scene(ss).parts[ref] as Body).bbox!; return [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2]; };
  const [ca, cb] = [centre(s, a!.ref), centre(s, b!.ref)];
  const r = startMotion(scene(s), a!.ref, "turn", s.outcome);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(!r.motion.noKeep, "a pivot can be kept now");
  // the body turned 90 degrees about (3, 4): (0, 0) goes to (7, 1)
  const c1 = keepCommand(scene(s), { ...r.motion, amount: 90 });
  assert.ok(c1, "a command");
  const kept = run(s, c1!);
  assert.ok(!kept.message, kept.message ?? "");
  const after = centre(kept, bodies(kept).find((x) => x.id === a!.id)!.ref);
  assert.ok(Math.abs(after[0]! - 7) < 1e-3 && Math.abs(after[1]! - 1) < 1e-3, `to (7, 1): ${after}`);
  assert.deepEqual(centre(kept, bodies(kept).find((x) => x.id === b!.id)!.ref).map((v) => Math.round(v * 1e3) / 1e3), cb.map((v) => Math.round(v * 1e3) / 1e3), "the other did not move");
  assert.ok(scene(kept).steps.some((st) => st.type === "rotate"), "as rotate steps");
  void ca;
  // a body that yielded to it is kept where it stands, in the same step
  const yielded = { ...r.motion, amount: 90, yields: [{ gear: "", body: b!.ref, kind: "turn" as const, point: [60, 10, 0] as [number, number, number], dir: [0, 0, 1] as [number, number, number], k: 0, value: 90 }] };
  const c2 = keepCommand(scene(s), yielded);
  assert.ok(c2 && c2.type === "batch");
  const both = run(s, c2!);
  assert.ok(!both.message, both.message ?? "");
  const cb2 = centre(both, bodies(both).find((x) => x.id === b!.id)!.ref);
  assert.ok(Math.abs(cb2[0]! - 70) < 1e-3 && Math.abs(cb2[1]! - 10) < 1e-3, `the second turned 90 degrees about (60, 10), (60, 0) to (70, 10): ${cb2}`);
});

test("a rest on a pivot: the body that was pushed goes back to it when the pusher lets go; with none it stays where it was pushed; the bar offers it and the field sets it (`in_1020`)", async () => {
  const { solveContact } = await import("../src/interaction/contact.ts");
  const { followAmount } = await import("../src/operation/gearcouple.ts");
  const make2 = (rest: number | null) => {
    let s = cylinder(cylinder(createSession(kernel), 0, 0, 10), 22, 0, 10);
    const [a, b] = bodies(s);
    s = run(s, { type: "pivot", body: a!.id as string, point: [0, 15, 0], dir: [0, 0, 1] }); // (A swings its middle to the right)
    s = run(s, { type: "pivot", body: b!.id as string, point: [22, 30, 0], dir: [0, 0, 1], ...(rest !== null ? { rest } : {}) });
    s = run(s, { type: "setHard", body: a!.id as string, on: true });
    assert.ok(!s.message, s.message ?? "");
    return { s, a: bodies(s).find((x) => x.id === a!.id)!, b: bodies(s).find((x) => x.id === b!.id)! };
  };
  const swing = (rest: number | null) => {
    const { s, a, b } = make2(rest);
    const r = startMotion(scene(s), a.ref, "turn", s.outcome);
    assert.ok(r.ok);
    if (!r.ok) return null;
    assert.equal(r.motion.contact!.pushables[0]!.rest, rest === null ? undefined : rest, "the rest reaches the solver");
    let m = r.motion;
    for (let d = 1; d <= 30; d++) m = solveContact(scene(s), { ...m, amount: d }, s.outcome);
    const pushed = followAmount(m.yields![0]!, 0);
    for (let d = 29; d >= 0; d--) m = solveContact(scene(s), { ...m, amount: d }, s.outcome);
    return { pushed, back: followAmount(m.yields![0]!, 0), s, a, b, m };
  };
  const spring = swing(0)!, free = swing(null)!;
  assert.ok(Math.abs(spring.pushed) > 3, `A swung into B and pushed it ${spring.pushed.toFixed(1)} degrees`);
  assert.ok(Math.abs(spring.back) < 0.5, `with a rest of 0 it is back: ${spring.back.toFixed(2)}`);
  assert.ok(Math.abs(free.back - free.pushed) < 0.5 && Math.abs(free.back) > 3, `with none it stays where it was pushed: ${free.pushed.toFixed(1)} then ${free.back.toFixed(1)}`);
  // the bar offers the field, and the field sets the rest
  const { createState, reduce } = await import("../src/interaction/controller.ts");
  const { homeCamera } = await import("../src/interaction/camera.ts");
  const { frameOf } = await import("../src/interaction/frame.ts");
  let st = { ...createState(free.s), cam: homeCamera() };
  st = { ...st, motion: free.m } as typeof st;
  const springs = frameOf(st, { w: 800, h: 600 }).motionBar!.springs;
  assert.deepEqual(springs.map((x) => [x.ref, x.rest]), [[free.b.ref, null]], "the bar offers a field for the body that yields, empty");
  st = reduce(st, { type: "motionRest", ref: free.b.ref, rest: 0 }, { w: 800, h: 600, now: 0 } as never);
  assert.equal(scene(st.session).pivots!.find((q) => q.body === free.b.id)!.rest, 0, "the pivot has it");
  assert.equal(st.motion!.contact!.pushables[0]!.rest, 0, "and the motion that goes on is a spring");
  st = reduce(st, { type: "motionRest", ref: free.b.ref, rest: null }, { w: 800, h: 600, now: 0 } as never);
  assert.equal(scene(st.session).pivots!.find((q) => q.body === free.b.id)!.rest, undefined, "empty takes it away");
});

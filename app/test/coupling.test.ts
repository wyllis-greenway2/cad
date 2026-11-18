// A hand-made link between two joints (`dec_mechanism_motion`, `in_833`): the second moves by a ratio of what the first does.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { mateStatus } from "../src/operation/mates.ts";
import { drawCircle } from "../src/operation/build.ts";
import { nextId, toJSON, fromJSON } from "../src/operation/scene.ts";
import type { Part } from "../src/operation/part.ts";
import { startMotion, keepCommand, followMatrix, reverseMotion } from "../src/interaction/motion.ts";
import { linksOf } from "../src/operation/coupling.ts";
import { matrixOf } from "../src/operation/frames.ts";
import { jointRigid } from "../src/interaction/mate.ts";

await kernel.init();
const XY = worldRef("XY");
type Body = Extract<Part, { kind: "body" }>;
type PlanePart = Extract<Part, { kind: "plane" }>;
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p): p is Body => p.kind === "body" && p.ref !== "b/body/o");
const extrudeLast = (s: Session, parts: Ref[], depth: number) => run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts, params: { depth } } });
function cylinder(s: Session, x: number, y: number, radius: number, h = 10): Session { const c = drawCircle(scene(s), XY, [x, y, 0], radius); return extrudeLast(run(s, c.command), [c.circle], h); }
const roundOfBody = (s: Session, body: Body): Ref => (Object.values(scene(s).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && p.of === body.ref && !!(p.curved || p.round || p.rounded))!).ref;
/** two pins, each in its own hole, far apart; returns the two pins and the two mates */
function twoPins(): { s: Session; pins: [Body, Body]; mates: [string, string] } {
  let s = cylinder(cylinder(cylinder(cylinder(createSession(kernel), 0, 0, 5), 40, 0, 3, 8), 100, 0, 5), 140, 0, 3, 8);
  const [h1, p1, h2, p2] = bodies(s);
  for (const [p, h] of [[p1, h1], [p2, h2]] as const) s = run(s, actionsFor(scene(s), [roundOfBody(s, p!), roundOfBody(s, h!)]).find((x) => x.id === "mate:coaxial")!.run());
  const ms = mateStatus(scene(s)).filter((m) => m.state === "ok" && m.mode === "coaxial");
  assert.equal(ms.length, 2);
  const now = bodies(s);
  return { s, pins: [now.find((x) => x.id === p1!.id)!, now.find((x) => x.id === p2!.id)!], mates: [ms.find((m) => m.mover?.body === p1!.ref)!.id, ms.find((m) => m.mover?.body === p2!.ref)!.id] };
}

test("a link: the second pin turns by the ratio of what the first does; links are refused when an end is not a joint, the ratio is nothing, or they are made twice", () => {
  const { s, pins, mates } = twoPins();
  const bad = run(s, { type: "couple", a: mates[0], b: mates[0], ka: "turn", kb: "turn", ratio: 1 });
  assert.match(bad.message ?? "", /itself/);
  assert.match(run(s, { type: "couple", a: mates[0], b: "nope", ka: "turn", kb: "turn", ratio: 1 }).message ?? "", /coaxial|pin|rod/);
  assert.match(run(s, { type: "couple", a: mates[0], b: mates[1], ka: "turn", kb: "turn", ratio: 0 }).message ?? "", /ratio/);
  const l = run(s, { type: "couple", a: mates[0], b: mates[1], ka: "turn", kb: "turn", ratio: -2 });
  assert.ok(!l.message, l.message ?? "");
  assert.match(run(l, { type: "couple", a: mates[1], b: mates[0], ka: "turn", kb: "turn", ratio: 3 }).message ?? "", /already/);
  const st = startMotion(scene(l), pins[0].ref, "turn");
  assert.ok(st.ok, st.ok ? "" : st.why);
  if (!st.ok) return;
  assert.equal(st.motion.follows.length, 1);
  const f = st.motion.follows[0]!;
  assert.equal(f.body, pins[1].ref);
  assert.equal(f.k, -2);
  const want = jointRigid(scene(l), mates[1], "turn", -60);
  assert.ok(want);
  matrixOf(want!).forEach((v, i) => assert.ok(Math.abs(v - followMatrix(f, 30)[i]!) < 1e-9, `${i}`));
  // from the other end the ratio is the inverse
  const back = startMotion(scene(l), pins[1].ref, "turn");
  assert.ok(back.ok && back.motion.follows[0]!.k === -0.5);
  assert.deepEqual(linksOf(scene(l), mates[0], "slide"), []);
  // keeping the pose drives both joints, in one step
  const kept = keepCommand(scene(l), { ...st.motion, amount: 30 });
  assert.ok(kept && kept.type === "batch");
  const after = run(l, kept!);
  assert.ok(!after.message, after.message ?? "");
  // the ratio changes, the link goes, the file keeps it
  const id = scene(l).couplings![0]!.id;
  assert.equal(scene(run(l, { type: "setCoupling", id, ratio: 4 })).couplings![0]!.ratio, 4);
  assert.equal(scene(run(l, { type: "deleteCoupling", id })).couplings, undefined);
  assert.deepEqual(fromJSON(toJSON(scene(l))).couplings, scene(l).couplings);
  void reverseMotion;
});

test("a turn that moves a slide: the rod goes the ratio in mm for each degree, and a chain multiplies", () => {
  const { s, pins, mates } = twoPins();
  const l = run(s, { type: "couple", a: mates[0], b: mates[1], ka: "turn", kb: "slide", ratio: 0.5 });
  assert.ok(!l.message, l.message ?? "");
  const st = startMotion(scene(l), pins[0].ref, "turn");
  assert.ok(st.ok);
  if (!st.ok) return;
  const f = st.motion.follows[0]!;
  assert.equal(f.kind, "slide");
  const want = jointRigid(scene(l), mates[1], "slide", 5);
  assert.ok(want);
  matrixOf(want!).forEach((v, i) => assert.ok(Math.abs(v - followMatrix(f, 10)[i]!) < 1e-9, `${i}`));
  // the slide end, played as a slide, turns the first by the inverse: 2 degrees for each mm
  const sl = startMotion(scene(l), pins[1].ref, "slide");
  assert.ok(sl.ok && sl.motion.follows[0]!.kind === "turn" && sl.motion.follows[0]!.k === 2);
  // played as a turn, the second pin has no link
  const tn = startMotion(scene(l), pins[1].ref, "turn");
  assert.ok(tn.ok && tn.motion.follows.length === 0);
});

test("through the app: Link joints on two selected pins links them and plays the first; the bar's links edit the ratio, what the other does, and take it away", async () => {
  const { createState, reduce } = await import("../src/interaction/controller.ts");
  const { homeCamera } = await import("../src/interaction/camera.ts");
  const { frameOf } = await import("../src/interaction/frame.ts");
  const { s, pins } = twoPins();
  const env = { w: 800, h: 600, now: 0 };
  let st = { ...createState(s), cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [pins[0].ref, pins[1].ref] } } };
  st = reduce(st, { type: "runAction", id: "motion:link" }, env as never);
  assert.ok(!st.session.message, st.session.message ?? "");
  assert.ok(st.motion && st.motion.follows.length === 1 && st.motion.follows[0]!.k === 1);
  let f = frameOf(st, { w: 800, h: 600 });
  assert.deepEqual(f.motionBar!.links.map((l) => [l.ratio, l.kind]), [[1, "turn"]]);
  const id = f.motionBar!.links[0]!.id;
  st = reduce(st, { type: "motionLink", id, ratio: 3 }, env as never);
  assert.equal(st.motion!.follows[0]!.k, 3);
  st = reduce(st, { type: "motionLink", id, kind: "slide" }, env as never);
  assert.equal(st.motion!.follows[0]!.kind, "slide");
  assert.equal(st.motion!.follows[0]!.k, 3);
  st = reduce(st, { type: "motionLink", id, remove: true }, env as never);
  assert.equal(st.motion!.follows.length, 0);
  f = frameOf(st, { w: 800, h: 600 });
  assert.deepEqual(f.motionBar!.links, []);
  // one body selected: Link joints says what it needs
  const one = reduce({ ...createState(s), cam: homeCamera(), session: { ...st.session, click: { ...st.session.click, selection: [pins[0].ref] } } }, { type: "runAction", id: "motion:link" }, env as never);
  assert.match(one.session.message ?? "", /two bodies/);
});

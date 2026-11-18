// Any body made to turn (`in_912`): a joint with the world, an axis and nothing else; set from a round face of the body or from the pivot of an open rotate; it is saved, gets a play button, can be played, and can yield to a hard body that pushes it.
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

test("a round face of a body selected, Make it turn: the body turns about that face's axis, plays at once, has a play button, and is saved", () => {
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
  assert.ok(st.motion!.noKeep);
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

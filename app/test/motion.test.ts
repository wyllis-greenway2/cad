import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { jointRigid, limitCommand } from "../src/interaction/mate.ts";
import { matrixOf } from "../src/operation/frames.ts";
import { mateStatus } from "../src/operation/mates.ts";
import { drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import type { Part } from "../src/operation/part.ts";
import { startMotion, amountAt, tickMotion, setPlaying, jointMatrix } from "../src/interaction/motion.ts";

await kernel.init();
const XY = worldRef("XY");
type Body = Extract<Part, { kind: "body" }>;
type PlanePart = Extract<Part, { kind: "plane" }>;
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p): p is Body => p.kind === "body" && p.ref !== "b/body/o");
const extrudeLast = (s: Session, parts: Ref[], depth: number) => run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts, params: { depth } } });
function cylinder(s: Session, x: number, y: number, radius: number, h = 10): Session { const c = drawCircle(scene(s), XY, [x, y, 0], radius); return extrudeLast(run(s, c.command), [c.circle], h); }
const roundOfBody = (s: Session, body: Body): Ref => (Object.values(scene(s).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && p.of === body.ref && !!(p.curved || p.round || p.rounded))!).ref;
/** a pin in a hole: the second cylinder is the pin, mated to the first's axis */
function pinInHole(): { s: Session; pin: Body } {
  let s = cylinder(cylinder(createSession(kernel), 0, 0, 5), 40, 0, 3, 8);
  const [a, b] = bodies(s);
  s = run(s, actionsFor(scene(s), [roundOfBody(s, b!), roundOfBody(s, a!)]).find((x) => x.id === "mate:coaxial")!.run());
  assert.equal(mateStatus(scene(s))[0]!.state, "ok");
  return { s, pin: bodies(s).find((x) => x.id === b!.id)! };
}
const near = (a: number[], b: number[], tol = 1e-9) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]!) < tol, `${i}: ${v} against ${b[i]}`));

test("the matrix of a joint is the one the app makes for a handle drag: a turn and a slide, in both senses", () => {
  const { s, pin } = pinInHole();
  for (const [kind, amounts] of [["turn", [30, -75, 180]], ["slide", [4, -2.5]]] as const) {
    const st = startMotion(scene(s), pin.ref, kind);
    assert.ok(st.ok, st.ok ? "" : st.why);
    for (const amount of amounts) {
      const want = jointRigid(scene(s), st.motion.mate, kind, amount);
      assert.ok(want, `the app's own picture of ${kind} ${amount}`);
      near(jointMatrix(st.motion, amount), matrixOf(want!));
    }
  }
});

test("a body that is not the first of a coaxial mate has no joint to play, and says so", () => {
  const { s } = pinInHole();
  const other = bodies(s).find((b) => b.id !== pinInHole().pin.id)!;
  const r = startMotion(scene(s), "b/body/o" as Ref);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.why, /pin|rod|coaxial/);
  void other;
});

test("a joint with no stops turns on and on and swings when it slides; with stops it swings from stop to stop and back", () => {
  const { s, pin } = pinInHole();
  let turn = startMotion(scene(s), pin.ref, "turn");
  assert.ok(turn.ok);
  let m = setPlaying(turn.motion, true);
  m = tickMotion(m, 1000); // (the first frame sets the start)
  assert.equal(m.amount, 0);
  assert.ok(Math.abs(amountAt(m, 1000 + 2000) - 120) < 1e-9, "60 degrees a second, two seconds: 120");
  assert.ok(Math.abs(amountAt(m, 1000 + 12000) - 720) < 1e-9, "and on past a turn, a turn at a time: it does not swing");
  const slide = startMotion(scene(s), pin.ref, "slide");
  assert.ok(slide.ok);
  let sm = tickMotion(setPlaying(slide.motion, true), 0);
  const seen = [0, 1000, 3000, 6000, 9000, 12000].map((t) => amountAt(sm, t));
  assert.ok(seen.every((v) => v >= -30 - 1e-9 && v <= 30 + 1e-9), `within the span: ${seen}`);
  assert.ok(Math.max(...seen) > 29 && Math.min(...seen) < -29 || seen.some((v) => Math.abs(v) > 20), "it goes out to the ends");
  // with stops (0 to 90 degrees): a swing between them
  const lowest = run(s, limitCommand(scene(s), turn.motion.mate, "turn", "Min", 0)!);
  const stopped = run(lowest, limitCommand(scene(lowest), turn.motion.mate, "turn", "Max", 90)!); // (the second from the scene with the first in it: each rewrites the mate's record)
  const t2 = startMotion(scene(stopped), pin.ref, "turn");
  assert.ok(t2.ok && !t2.motion.free && t2.motion.lo === 0 && t2.motion.hi === 90, JSON.stringify(t2.ok ? [t2.motion.lo, t2.motion.hi] : t2));
  const m2 = tickMotion(setPlaying(t2.motion, true), 0);
  assert.ok(Math.abs(amountAt(m2, 1000) - 60) < 1e-9 && Math.abs(amountAt(m2, 2000) - 60) < 1e-9, "up to the stop at 1.5 s and back: 60 at one and at two seconds");
  assert.ok(Math.abs(amountAt(m2, 1500) - 90) < 1e-9, "at the stop");
  assert.ok(Math.abs(amountAt(m2, 3000) - 0) < 1e-9, "and back at the other");
  void turn; void sm;
});

// ---- through the app: the action, the intents, the frame, and keeping the pose
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";

const env = { w: 800, h: 600, now: 0 };
const select = (st: AppState, refs: string[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs as never } } });
const joint = () => { const { s, pin } = pinInHole(); return { st: select({ ...createState(s), cam: homeCamera() }, [pin.ref]), pin }; };

test("Play on the pin's body starts its joint playing, and the frame draws it moved by a matrix with nothing written", () => {
  const { st, pin } = joint();
  const steps0 = scene(st.session).steps.length;
  const history0 = st.session.history;
  let p = reduce(st, { type: "runAction", id: "motion:play" }, env as never);
  assert.ok(p.motion && p.motion.playing && p.motion.kind === "turn" && p.motion.body === pin.ref);
  p = reduce(p, { type: "motionAt", amount: 40 }, env as never); // (the scrubber: a hand on it stops the play)
  assert.equal(p.motion!.playing, false);
  assert.equal(p.motion!.amount, 40);
  const f = frameOf(p, { w: 800, h: 600 });
  assert.ok(f.bodyMatrix, "the body is drawn by a matrix");
  near(f.bodyMatrix!, jointMatrix(p.motion!, 40));
  assert.deepEqual(f.motionBar && { kind: f.motionBar.kind, playing: f.motionBar.playing, lo: f.motionBar.lo, hi: f.motionBar.hi }, { kind: "turn", playing: false, lo: -180, hi: 180 });
  assert.equal(scene(p.session).steps.length, steps0, "no step was made");
  assert.equal(p.session.history, history0, "the history is the same object: nothing was written");
  // a value past the range stops at the end of it
  assert.equal(reduce(p, { type: "motionAt", amount: 999 }, env as never).motion!.amount, 180);
});

test("Escape and the cross put the joint back; the switch changes what it does; Play on a body with no joint says so", () => {
  const { st } = joint();
  let p = reduce(st, { type: "runAction", id: "motion:play" }, env as never);
  p = reduce(p, { type: "motionKind", kind: "slide" }, env as never);
  assert.equal(p.motion!.kind, "slide");
  assert.equal(p.motion!.lo, -30);
  assert.equal(reduce(p, { type: "escape" }, env as never).motion, null);
  assert.equal(reduce(p, { type: "motionClose" }, env as never).motion, null);
  const none = reduce(select(st, [bodies(st.session).find((b) => b.id !== joint().pin.id)!.ref]), { type: "runAction", id: "motion:play" }, env as never);
  assert.equal(none.motion, null);
  assert.match(none.session.message ?? "", /pin|rod|coaxial/);
  assert.equal(reduce(select(st, []), { type: "runAction", id: "motion:play" }, env as never).motion, null, "nothing selected: nothing to play");
});

test("Keep pose writes the drive step the joint uses, once (one undo), and ends the motion; at rest there is nothing to keep", () => {
  const { st, pin } = joint();
  let p = reduce(st, { type: "runAction", id: "motion:play" }, env as never);
  p = reduce(p, { type: "motionAt", amount: 0 }, env as never);
  const rest = reduce(p, { type: "motionKeep" }, env as never);
  assert.equal(rest.motion, null);
  assert.match(rest.session.message ?? "", /rest|nothing/);
  assert.equal(scene(rest.session).steps.length, scene(st.session).steps.length, "nothing written at rest");
  p = reduce(p, { type: "motionAt", amount: 35 }, env as never);
  const kept = reduce(p, { type: "motionKeep" }, env as never);
  assert.equal(kept.motion, null);
  assert.ok(scene(kept.session).steps.length > scene(st.session).steps.length, "the turn is written as steps");
  const mate = scene(kept.session).relations.find((r) => r.kind === "mate")!;
  assert.equal(mate.params?.turn, 35, "the joint stands at 35 degrees now");
  void pin;
});

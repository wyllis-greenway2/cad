// "Fix constraints" (`dec_collision_to_constraints`, `in_1122`): the joint that fits a pushed body, found from the places the push kept, and made one body at a time.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startMotion } from "../src/interaction/motion.ts";
import { solveContact } from "../src/interaction/contact.ts";
import { fitJoint, planFixes, canFix } from "../src/interaction/fixmotion.ts";
import type { Sample } from "../src/interaction/fixmotion.ts";
import { createState } from "../src/interaction/control/state.ts";
import type { AppState } from "../src/interaction/control/state.ts";
import { doMotionFix } from "../src/interaction/control/motion.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const openHeld = () => (openSession(kernel, readFileSync(new URL("./fixtures/lever-pivot-jam.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value; // (the sketch's Concentric on the pin holds the arm on it: the motion plays it as a carried joint, `in_1136`)
const open = () => run(openHeld(), { type: "removeRelation", id: "r_010" }); // (a lever that nothing holds: the free push is what these test)
const turnSamples = (about: [number, number], k: number, n = 60, wobble = 0): Sample[] => Array.from({ length: n }, (_, i) => {
  const spin = k * i, r = (spin * Math.PI) / 180, [c, s] = [Math.cos(r), Math.sin(r)];
  return { a: i, spin, t: [(1 - c) * about[0] + s * about[1] + (i % 2 ? wobble : 0), -s * about[0] + (1 - c) * about[1], 0] as Vec3 };
});

test("a body that turns about one place is found to, and the place, and a constant ratio", () => {
  const j = fitJoint(turnSamples([12, -7], 0.5), [0, 0, 0], [0, 0, 1]);
  assert.equal(j.kind, "turn");
  if (j.kind !== "turn") return;
  assert.ok(Math.hypot(j.point[0] - 12, j.point[1] + 7) < 1e-6, `at ${j.point}`);
  assert.ok(j.ratio !== null && Math.abs(j.ratio - 0.5) < 1e-6);
  assert.ok(j.err < 1e-6);
});
test("a turn that is not a constant ratio of the driver is a joint with no link", () => {
  const s = turnSamples([5, 5], 0.5).map((x, i) => ({ ...x, a: i + (i > 30 ? 30 : 0) })); // (the turn stops while the driver goes on)
  const j = fitJoint(s, [0, 0, 0], [0, 0, 1]);
  assert.equal(j.kind, "turn");
  if (j.kind === "turn") assert.equal(j.ratio, null);
});
test("a body that slides and turns about nothing in particular is not made a joint", () => {
  const j = fitJoint(turnSamples([12, -7], 0.5, 60, 3), [0, 0, 0], [0, 0, 1]);
  assert.equal(j.kind, "none");
});
test("a body that only slides along one line is a slide; along a bend it is not", () => {
  const line: Sample[] = Array.from({ length: 30 }, (_, i) => ({ a: i, spin: 0, t: [i * 0.3, i * 0.1, 0] as Vec3 }));
  assert.equal(fitJoint(line, [0, 0, 0], [0, 0, 1]).kind, "slide");
  const bend: Sample[] = line.map((s, i) => ({ ...s, t: [s.t[0], i > 15 ? (i - 15) * 0.6 : 0, 0] as Vec3 }));
  assert.equal(fitJoint(bend, [0, 0, 0], [0, 0, 1]).kind, "none");
});

test("the lever on the pin: after a play the offer is made, Apply makes a joint that turns it as the push did, and the motion then plays on the joint, far quicker", () => {
  const s = open();
  const sc = scene(s);
  const driver = Object.values(sc.parts).find((p) => p.kind === "body" && p.id === "x_s_083")!.ref;
  const r = startMotion(sc, driver, "turn", s.outcome);
  assert.ok(r.ok);
  if (!r.ok) return;
  const m0 = { ...r.motion, playing: true };
  assert.equal(planFixes(sc, s.outcome, m0), null, "nothing to go by before the play");
  assert.equal(canFix(m0), false);
  const t1 = performance.now();
  const m = solveContact(sc, { ...m0, amount: 120 }, s.outcome, Infinity);
  const pushMs = performance.now() - t1;
  assert.ok(canFix(m));
  const lever = m.contact!.pushables.find((p) => p.free)!;
  let st: AppState = { ...createState(s), motion: m };
  st = doMotionFix(st, "open");
  const plan = st.motion!.fix!.plan;
  assert.equal(plan.fixes.length, 1, JSON.stringify(plan.left));
  assert.equal(plan.fixes[0]!.joint.kind, "turn");
  assert.deepEqual(st.session.click.selection, [lever.body], "the body offered is lit");
  assert.equal(st.motion!.playing, false);
  st = doMotionFix(st, "apply");
  assert.equal(st.motion!.fix, null, `the walk is over after the only one: ${st.session.message}`);
  assert.match(st.session.message ?? "", /^fixed: x_s_084/);
  const reported = st.session.message ?? "";
  const made = st.session;
  const r2 = startMotion(scene(made), driver, "turn", made.outcome);
  assert.ok(r2.ok);
  if (!r2.ok) return;
  assert.ok(!r2.motion.contact?.pushables.some((p) => p.free), "the lever is no longer pushed with no joint");
  const t0 = performance.now();
  const m2 = solveContact(scene(made), { ...r2.motion, playing: true, amount: 120 }, made.outcome, Infinity);
  const ms = performance.now() - t0;
  assert.equal(m2.contact?.jam, null, m2.contact?.jam ?? "");
  const y = m2.yields?.find((f) => f.body === lever.body);
  const off = Math.abs(Math.abs(y!.value ?? 0) - Math.abs(lever.spin ?? 0));
  if (off > 3) assert.match(reported, /differently from the push/, "a difference from the push is said, not hidden");
  console.log(`play to 120: ${pushMs.toFixed(0)} ms by the push, ${ms.toFixed(0)} ms on the joint; lever ${lever.spin?.toFixed(1)} / ${y!.value?.toFixed(1)} deg`);
});
test("a refused offer is skipped, and close leaves the walk", () => {
  const s = open();
  const sc = scene(s);
  const driver = Object.values(sc.parts).find((p) => p.kind === "body" && p.id === "x_s_083")!.ref;
  const r = startMotion(sc, driver, "turn", s.outcome);
  if (!r.ok) throw new Error(r.why);
  const m = solveContact(sc, { ...r.motion, playing: true, amount: 60 }, s.outcome, Infinity);
  let st: AppState = { ...createState(s), motion: m };
  st = doMotionFix(st, "open");
  assert.ok(st.motion!.fix);
  st = doMotionFix(st, "skip");
  assert.equal(st.motion!.fix, null);
  assert.match(st.session.message ?? "", /nothing was changed/);
  st = doMotionFix(doMotionFix(st, "open"), "close");
  assert.equal(st.motion!.fix, null);
});
test("too little played: it asks for more play first", () => {
  const s = open();
  const sc = scene(s);
  const driver = Object.values(sc.parts).find((p) => p.kind === "body" && p.id === "x_s_083")!.ref;
  const r = startMotion(sc, driver, "turn", s.outcome);
  if (!r.ok) throw new Error(r.why);
  const m = solveContact(sc, { ...r.motion, playing: true, amount: 5 }, s.outcome, Infinity);
  const st = doMotionFix({ ...createState(s), motion: m }, "open");
  assert.match(st.session.message ?? "", /play the motion a little first/);
});

const pinFile = () => (openSession(kernel, readFileSync(new URL("./fixtures/lever-pin-jam.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
test("the lever hangs on the pin of the gear that is played but nothing holds it: it is pushed, no joint on the pin's resting axis is offered, and the walk says why", () => {
  const s = run(pinFile(), { type: "removeRelation", id: "r_010" });
  const sc = scene(s);
  const r = startMotion(sc, "b/x_s_002/o" as never, "turn", s.outcome);
  if (!r.ok) throw new Error(r.why);
  const m = solveContact(sc, { ...r.motion, playing: true, amount: 120 }, s.outcome, Infinity);
  const st = doMotionFix({ ...createState(s), motion: m }, "open");
  assert.equal(st.motion?.fix ?? null, null);
  assert.match(st.session.message ?? "", /hangs on a pin of x_s_002, which moves in this motion/);
});
test("the lever held on the pin by the sketch's Concentric is a joint carried round by the pin (`in_1136`): not pushed about, no search, turns about the pin as the gear carries it", () => {
  const s = pinFile();
  const sc = scene(s);
  const r = startMotion(sc, "b/x_s_002/o" as never, "turn", s.outcome);
  if (!r.ok) throw new Error(r.why);
  const lever = r.motion.contact!.pushables.find((p) => p.body === ("b/x_s_084/o" as never))!;
  assert.ok(lever && !lever.free && lever.after, "a joint with a carrier");
  assert.equal(lever.after!.k, 1);
  const t0 = performance.now();
  const m = solveContact(sc, { ...r.motion, playing: true, amount: 360 }, s.outcome, Infinity);
  const ms = performance.now() - t0;
  assert.equal(m.contact?.jam, null, m.contact?.jam ?? "");
  const f = m.yields!.find((x) => x.body === lever.body)!;
  assert.ok(f.after && f.kind === "turn", "drawn as a turn about the pin, then carried round");
  assert.ok(!canFix(m), "nothing is pushed with no joint: no offer");
  console.log(`carried lever, gear to 360: ${ms.toFixed(0)} ms`);
  assert.ok(ms < 3000);
});

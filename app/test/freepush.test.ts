// Free push (`dec_contact_push`, `in_1048`, `in_1049`): a hard body with no joint, no mate and no mark of being fixed is pushed aside by what it meets, any way in the plane across the turning axis, and goes back when it is clear; a body marked fixed stays a wall.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startMotion } from "../src/interaction/motion.ts";
import { solveContact } from "../src/interaction/contact.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/lever-pin-jam.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const GEAR = "b/x_s_002/o" as Ref, LEVER = "b/x_s_084/o" as Ref;

const play = (s: Session, to: number) => {
  const r = startMotion(scene(s), GEAR, "turn", s.outcome);
  if (!r.ok) throw new Error(r.why);
  return solveContact(scene(s), { ...r.motion, playing: true, amount: to }, s.outcome, Infinity);
};

test("the big gear with the pin turns: the lever, which has no joint, is pushed aside and swings out of the other bar's way, a whole turn", () => {
  const s = open();
  const r = startMotion(scene(s), GEAR, "turn", s.outcome);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(r.motion.contact?.pushables.some((p) => p.body === LEVER && p.free), "the lever can be pushed any way");
  // it slides while a slide clears it: it is turned only where no slide does (here against the other bar), never for its own sake
  const early = play(s, 30).contact!.pushables.find((p) => p.body === LEVER)!;
  assert.ok(Math.hypot(...early.free!) > 1 && Math.abs(early.spin ?? 0) < 1e-9, `slid ${early.free} and did not turn (${early.spin})`);
  const half = play(s, 100);
  assert.equal(half.contact?.jam, null, half.contact?.jam ?? "");
  const lever = half.contact!.pushables.find((p) => p.body === LEVER)!;
  assert.ok(lever.free && Math.hypot(...lever.free) > 1, "the lever was moved");
  assert.ok(Math.abs(lever.spin ?? 0) > 5, `and turned (${lever.spin} degrees): a body with no joint has the turn as well as the slide`);
  const whole = play(s, 360);
  assert.equal(whole.contact?.jam, null, whole.contact?.jam ?? "");
  assert.ok(Math.abs(whole.amount - 360) < 1e-6, "the gear made the whole turn");
});

test("a lever marked fixed stays a wall: the gear stops against it and says so", () => {
  const s = run(open(), { type: "setFixed", body: "x_s_084", on: true });
  assert.ok(!s.message, s.message ?? "");
  const r = startMotion(scene(s), GEAR, "turn", s.outcome);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(!r.motion.contact?.pushables.some((p) => p.body === LEVER), "it does not yield");
  const m = play(s, 180);
  assert.match(m.contact?.jam ?? "", /x_s_002 against x_s_084/);
});

test("a pushed body goes back toward where it is drawn when the push is over", () => {
  const s = open();
  const far = play(s, 60);
  const back = solveContact(scene(s), { ...far, playing: true, amount: 0 }, s.outcome, Infinity);
  assert.equal(back.contact?.jam, null, back.contact?.jam ?? "");
  const l = back.contact!.pushables.find((p) => p.body === LEVER)!;
  assert.ok(l.free && Math.hypot(...l.free) < Math.hypot(...far.contact!.pushables.find((p) => p.body === LEVER)!.free!), "it came back");
});

test("the ring offers Fixed body for a selected body, and it toggles to Free body", async () => {
  const { createState, reduce } = await import("../src/interaction/controller.ts");
  const env = { w: 800, h: 600, now: 0 };
  const s = open();
  const st = { ...createState({ ...s, click: { ...s.click, selection: [LEVER] as never } }) };
  const on = reduce(st, { type: "runAction", id: "body:fixed" }, env);
  assert.deepEqual(scene(on.session).fixed, ["x_s_084"]);
  const off = reduce(on, { type: "runAction", id: "body:fixed" }, env);
  assert.equal(scene(off.session).fixed, undefined);
});

test("the picture of a body that slid and turned is the same move as the one the solver made: a turn about another place, found from the slide and the turn about its middle", async () => {
  const { followMatrix } = await import("../src/interaction/motion.ts");
  const s = open();
  const m = play(s, 100);
  const p = m.contact!.pushables.find((q) => q.body === LEVER)!;
  const f = m.yields!.find((q) => q.body === LEVER)!;
  assert.equal(f.kind, "turn");
  const M = followMatrix(f, m.amount);
  const at = (mat: number[], x: number[]): number[] => [0, 1, 2].map((r) => mat[r]! * x[0]! + mat[4 + r]! * x[1]! + mat[8 + r]! * x[2]! + mat[12 + r]!);
  const r = ((p.spin ?? 0) * Math.PI) / 180, [c, sn] = [Math.cos(r), Math.sin(r)];
  for (const x of [[10, 20, 8], [30, 50, 6], [0, 0, 0]]) {
    const d = [x[0]! - p.point[0], x[1]! - p.point[1]];
    const want = [p.point[0] + c * d[0]! - sn * d[1]! + p.free![0], p.point[1] + sn * d[0]! + c * d[1]! + p.free![1], x[2]! + p.free![2]];
    const got = at(M, x);
    assert.ok(Math.hypot(got[0]! - want[0]!, got[1]! - want[1]!, got[2]! - want[2]!) < 1e-6, `${got} vs ${want}`);
  }
});

test("what a body with no joint does is smooth (it moves as little as the push asks, a step at a time) and a play from the start again goes through the places already worked out", () => {
  const s = open();
  const run1 = (): { m: ReturnType<typeof play>; ms: number; worstSlide: number; worstTurn: number } => {
    const r = startMotion(scene(s), GEAR, "turn", s.outcome);
    if (!r.ok) throw new Error(r.why);
    let m = r.motion, prev = { f: [0, 0, 0], s: 0 }, worstSlide = 0, worstTurn = 0;
    const t0 = performance.now();
    for (let a = 1; a <= 120; a++) {
      m = solveContact(scene(s), { ...m, playing: true, amount: a }, s.outcome, Infinity);
      const l = m.contact!.pushables.find((p) => p.body === LEVER)!;
      worstSlide = Math.max(worstSlide, Math.hypot(l.free![0] - prev.f[0]!, l.free![1] - prev.f[1]!));
      worstTurn = Math.max(worstTurn, Math.abs((l.spin ?? 0) - prev.s));
      prev = { f: [...l.free!], s: l.spin ?? 0 };
    }
    return { m, ms: performance.now() - t0, worstSlide, worstTurn };
  };
  const first = run1();
  assert.equal(first.m.contact?.jam, null);
  assert.ok(first.worstSlide < 0.5, `no slide of more than half a millimetre for a degree of the driver: ${first.worstSlide.toFixed(2)}`);
  assert.ok(first.worstTurn < 1.7, `no turn of more than a degree and a half for a degree of the driver: ${first.worstTurn.toFixed(2)}`);
  const again = run1();
  assert.deepEqual(again.m.contact!.pushables.map((p) => [p.free, p.spin]), first.m.contact!.pushables.map((p) => [p.free, p.spin]), "the same places the second time");
  assert.ok(again.ms < first.ms, `and quicker (${again.ms.toFixed(0)} ms against ${first.ms.toFixed(0)} ms)`);
});

test("the hints change only how soon the answer is found: with them off, every way looked at in full, the lever file plays the same turn within a millimetre and a few degrees", async () => {
  const { contactOptions } = await import("../src/interaction/contact.ts");
  const lever = (m: ReturnType<typeof play>) => m.contact!.pushables.find((p) => p.body === LEVER)!;
  try {
    contactOptions.hints = true;
    const on = lever(play(open(), 90));
    contactOptions.hints = false;
    const off = lever(play(open(), 90));
    assert.ok(Math.hypot(on.free![0] - off.free![0], on.free![1] - off.free![1]) < 1.5, `slides ${on.free} against ${off.free}`);
    assert.ok(Math.abs((on.spin ?? 0) - (off.spin ?? 0)) < 3, `turns ${on.spin} against ${off.spin}`);
  } finally { contactOptions.hints = true; }
});

test("a place between two worked out is blended, close to what working it out gives, and the places kept are used again", async () => {
  const { contactOptions } = await import("../src/interaction/contact.ts");
  const lever = (m: ReturnType<typeof play>) => m.contact!.pushables.find((p) => p.body === LEVER)!;
  const s = open();
  const start = startMotion(scene(s), GEAR, "turn", s.outcome);
  if (!start.ok) throw new Error(start.why);
  let m = start.motion;
  for (let a = 1; a <= 70; a++) m = solveContact(scene(s), { ...m, playing: true, amount: a }, s.outcome, Infinity); // (the path, worked out and kept)
  const at = (blend: boolean, a: number): ReturnType<typeof play> => {
    contactOptions.blend = blend;
    try {
      const r = startMotion(scene(s), GEAR, "turn", s.outcome);
      if (!r.ok) throw new Error(r.why);
      return solveContact(scene(s), { ...r.motion, playing: true, amount: a }, s.outcome, Infinity);
    } finally { contactOptions.blend = true; }
  };
  for (const a of [43.5, 55.25, 61.75]) {
    const [b, w] = [lever(at(true, a)), lever(at(false, a))];
    assert.ok(Math.hypot(b.free![0] - w.free![0], b.free![1] - w.free![1]) < 0.35 && Math.abs((b.spin ?? 0) - (w.spin ?? 0)) < 0.8, `at ${a}: blended ${b.free} ${b.spin}, worked out ${w.free} ${w.spin}`);
  }
});

test("what a body with no joint is drawn at is smooth: the stair of sliding until it is wedged and then turning a little is averaged over the places round it, and only where that is clear", async () => {
  const { contactOptions } = await import("../src/interaction/contact.ts");
  const { followMatrix } = await import("../src/interaction/motion.ts");
  const REF = [27.59, 25.5];
  const worst = (smooth: boolean): { jerk: number; big: number } => {
    contactOptions.smooth = smooth;
    try {
      const s = open();
      const r = startMotion(scene(s), GEAR, "turn", s.outcome);
      if (!r.ok) throw new Error(r.why);
      let m = r.motion;
      for (let a = 1; a <= 140; a++) m = solveContact(scene(s), { ...m, playing: true, amount: a }, s.outcome, Infinity); // (the places worked out)
      const r2 = startMotion(scene(s), GEAR, "turn", s.outcome);
      if (!r2.ok) throw new Error(r2.why);
      let mm = r2.motion, prev: [number, number] | null = null, before: [number, number] = [0, 0], jerk = 0, big = 0;
      for (let a = 1; a <= 100; a++) {
        mm = solveContact(scene(s), { ...mm, playing: true, amount: a }, s.outcome, Infinity);
        const f = mm.yields!.find((q) => q.body === LEVER)!, M = followMatrix(f, mm.amount);
        const at: [number, number] = [M[0]! * REF[0]! + M[4]! * REF[1]! + M[12]!, M[1]! * REF[0]! + M[5]! * REF[1]! + M[13]!];
        if (prev) { const d: [number, number] = [at[0] - prev[0], at[1] - prev[1]]; if (a > 2) { const j = Math.hypot(d[0] - before[0], d[1] - before[1]); jerk = Math.max(jerk, j); if (j > 0.15) big++; } before = d; }
        prev = at;
      }
      return { jerk, big };
    } finally { contactOptions.smooth = true; }
  };
  const [raw, smooth] = [worst(false), worst(true)];
  assert.ok(smooth.jerk < raw.jerk && smooth.big <= raw.big, `smoothed: worst change of the step ${smooth.jerk.toFixed(2)} mm, ${smooth.big} over 0.15; as worked out: ${raw.jerk.toFixed(2)} mm, ${raw.big}`);
  assert.ok(smooth.jerk < 0.3, `the worst change of the step from one degree to the next is under 0.3 mm: ${smooth.jerk.toFixed(2)}`);
});

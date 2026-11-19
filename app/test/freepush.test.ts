// Free push (`dec_contact_push`, `in_1028`, `in_1029`): a hard body with no joint, no mate and no mark of being fixed is pushed aside by what it meets, any way in the plane across the turning axis, and goes back when it is clear; a body marked fixed stays a wall.
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

test("the big gear with the pin turns: the lever, which has no joint, is pushed aside instead of stopping the motion, as far as it can go", () => {
  const s = open();
  const r = startMotion(scene(s), GEAR, "turn", s.outcome);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(r.motion.contact?.pushables.some((p) => p.body === LEVER && p.free), "the lever can be pushed any way");
  const m = play(s, 30);
  assert.equal(m.contact?.jam, null, m.contact?.jam ?? "");
  assert.ok(Math.abs(m.amount - 30) < 1e-6, "it went the whole way");
  const lever = m.contact!.pushables.find((p) => p.body === LEVER)!;
  assert.ok(lever.free && Math.hypot(...lever.free) > 1, "the lever was moved");
  // further on the lever is pushed against the other bar, which is in its way: the motion stops, and says which body is against which
  const far = play(s, 90);
  assert.equal(far.contact?.jam, "x_s_002 pushes x_s_084 against x_s_083");
  assert.ok(far.amount > 30 && far.amount < 90, "it stopped where the lever could go no further");
});

test("with the other bar hard as well it is pushed in turn, and the gear goes further", () => {
  const s = run(open(), { type: "setHard", body: "x_s_083", on: true });
  const before = play(run(open(), { type: "setHard", body: "x_s_083", on: false }), 90).amount;
  const m = play(s, 90);
  assert.ok(m.amount > before + 1, `${m.amount} against ${before}: ${m.contact?.jam}`);
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

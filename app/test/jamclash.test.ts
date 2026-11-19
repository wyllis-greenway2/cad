// A jam shows where the bodies are in each other, in red, and play pressed after it begins the motion again from the start (`in_1069`): the pin comes against a lever that is fixed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startMotion, setPlaying } from "../src/interaction/motion.ts";
import { solveContact } from "../src/interaction/contact.ts";
import { createState } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const openHeld = () => (openSession(kernel, readFileSync(new URL("./fixtures/lever-pivot-jam.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value; // (the sketch's Concentric on the pin holds the arm on it: the motion plays it as a carried joint, `in_1136`)
const open = () => run(openHeld(), { type: "removeRelation", id: "r_010" }); // (a lever that nothing holds: the free push is what these test)
const jammed = () => {
  const s = run(open(), { type: "setFixed", body: "x_s_084", on: true }); // (the lever stays where it is: the pin comes against it)
  const r = startMotion(scene(s), "b/x_s_002/o" as Ref, "turn", s.outcome);
  if (!r.ok) throw new Error(r.why);
  return { s, m: solveContact(scene(s), { ...r.motion, playing: true, amount: 120 }, s.outcome, Infinity) };
};

test("the motion stops at the collision, says what is against what, and keeps the places where they are in each other", () => {
  const { m } = jammed();
  assert.match(m.contact?.jam ?? "", /x_s_002 against x_s_084/);
  assert.equal(m.playing, false);
  assert.ok((m.contact?.clash?.length ?? 0) >= 9 && m.contact!.clash!.length % 9 === 0, "triangles of the two bodies where they cross");
});

test("the frame gives the places to draw in red while the motion is stopped by a jam, and nothing otherwise", () => {
  const { s, m } = jammed();
  const env = { w: 800, h: 600, now: 0 };
  assert.ok(frameOf({ ...createState(s), motion: m }, env).thin?.length, "red where they meet");
  assert.equal(frameOf({ ...createState(s), motion: setPlaying(m, true) }, env).thin, null, "gone when it plays again");
});

test("play pressed after a jam begins the motion again from the start, with every body that yielded back where it is drawn", () => {
  const { m } = jammed();
  assert.ok(m.amount > 0 && m.contact?.jam, "it went some way and stopped");
  const again = setPlaying(m, true);
  assert.equal(again.amount, 0);
  assert.equal(again.playing, true);
  assert.equal(again.contact?.jam, null);
  assert.equal(again.contact?.clash, null);
  assert.ok(again.contact!.pushables.every((p) => p.value === 0 && (!p.free || Math.hypot(...p.free) === 0)));
  // and pressing play on a motion that did not jam goes on from where it is, as before
  const going = setPlaying({ ...m, contact: { ...m.contact!, jam: null }, amount: 20, playing: false }, true);
  assert.equal(going.amount, 20);
});

test("a pivot in a project file is not refused while the kernel has not made the bodies yet (the file is replayed first): a body is also known by its step", async () => {
  const { setPivot } = await import("../src/operation/pivot.ts");
  const bare = { ...scene(open()), parts: {} };
  assert.equal(setPivot(bare, "x_s_083", [10, 58, 8], [0, 0, 1]).ok, true);
  assert.equal(setPivot(bare, "x_s_999", [10, 58, 8], [0, 0, 1]).ok, false);
});

test("a lever on a pin: the model says so, and the note suggests the coaxial mate once the play has moved it, or stopped", async () => {
  const { pinInHole } = await import("../src/interaction/pinhole.ts");
  const s = run(open(), { type: "setFixed", body: "x_s_084", on: false });
  const sc = scene(s);
  assert.match(pinInHole(sc, "b/x_s_002/o" as Ref, "b/x_s_084/o" as Ref) ?? "", /x_s_084 has a hole on a pin of x_s_002: select the pin and the hole and make Mate: coaxial/);
  assert.equal(pinInHole(sc, "b/x_s_002/o" as Ref, "b/x_s_083/o" as Ref), null, "the other bar is not on a pin");
  const r = startMotion(sc, "b/x_s_002/o" as Ref, "turn", s.outcome);
  if (!r.ok) throw new Error(r.why);
  assert.ok(r.motion.contact?.tip, "the motion knows");
  const env = { w: 800, h: 600, now: 0 };
  assert.equal(frameOf({ ...createState(s), motion: r.motion }, env).motionBar!.note, null, "nothing is said while the lever has not been moved");
  const moved = solveContact(sc, { ...r.motion, playing: true, amount: 60 }, s.outcome, Infinity);
  // nothing is said over the bar (`in_1131`), and no fix is offered: the pin goes round with the gear, so a joint on its axis would be wrong
  const fb = frameOf({ ...createState(s), motion: moved }, env).motionBar!;
  assert.equal(fb.fix.offer, false);
  assert.equal(fb.note, null);
  assert.match(moved.contact!.tip ?? "", /Mate: coaxial/);
});

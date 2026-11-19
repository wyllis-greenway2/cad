// A jam shows where the bodies are in each other, in red, and play pressed after it begins the motion again from the start (`in_1056`): the lever pushed by the pin comes against the bar that turns on a pivot and cannot turn clear of it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startMotion, setPlaying } from "../src/interaction/motion.ts";
import { solveContact } from "../src/interaction/contact.ts";
import { createState } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/lever-pivot-jam.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const jammed = () => {
  const s = open();
  const r = startMotion(scene(s), "b/x_s_002/o" as Ref, "turn", s.outcome);
  if (!r.ok) throw new Error(r.why);
  return { s, m: solveContact(scene(s), { ...r.motion, playing: true, amount: 120 }, s.outcome, Infinity) };
};

test("the motion stops at the collision, says what is against what and why the one that turns cannot get clear, and keeps the places where they are in each other", () => {
  const { m } = jammed();
  assert.match(m.contact?.jam ?? "", /x_s_084 against x_s_083 \(x_s_083 turns on its joint but cannot turn clear of it\)/);
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
  assert.ok(m.amount > 0 && m.contact!.pushables.some((p) => p.value !== 0 || (p.free && Math.hypot(...p.free) > 0)));
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

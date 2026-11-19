// The push worked out ahead, in a thread of its own (`in_1096`): the thread's work is the same solver, run on a copy of the scene and of what the kernel made of it, and what it sends back is put among the places the page keeps; the play, coming to
// them, takes them as they are, and never goes past them. Here the thread is a function that works on a copy, a few degrees at a time.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startMotion } from "../src/interaction/motion.ts";
import { solveContact, pathPlaces, placesExtent } from "../src/interaction/contact.ts";
import { createAhead } from "../src/contact-ahead.ts";
import type { AheadWorker } from "../src/contact-ahead.ts";
import { workAhead } from "../src/contact-worker.ts";
import type { AheadStart } from "../src/contact-worker.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const openHeld = () => (openSession(kernel, readFileSync(new URL("./fixtures/lever-pin-jam.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value; // (the sketch's Concentric on the pin holds the arm on it: the motion plays it as a carried joint, `in_1143`)
const open = () => run(openHeld(), { type: "removeRelation", id: "r_010" }); // (a lever that nothing holds: the free push is what these test)
const GEAR = "b/x_s_002/o" as Ref, LEVER = "b/x_s_084/o" as Ref;

/** A thread that is a function on a copy: it works when asked to and sends what it has by the same messages. */
const fakeThread = (): AheadWorker & { pump(): Promise<void>; sent: number } => {
  const listeners: ((e: { data: unknown }) => void)[] = [];
  let stopped = false, job: Promise<void> | null = null;
  const w = {
    sent: 0,
    postMessage(m: unknown) {
      const msg = m as AheadStart | { type: "stop" };
      if (msg.type === "stop") { stopped = true; return; }
      const copy = structuredClone({ scene: msg.scene, kernel: msg.kernel, motion: msg.motion }); // (what a thread gets: copies)
      stopped = false;
      job = workAhead({ ...copy, to: msg.to }, 5, (r) => { w.sent++; for (const l of listeners) l({ data: { id: msg.id, ...structuredClone(r) } }); }, () => stopped, () => Promise.resolve());
    },
    addEventListener(type: string, f: (e: { data: unknown }) => void) { if (type === "message") listeners.push(f); },
    terminate() { stopped = true; },
    async pump() { await job; },
  };
  return w as unknown as AheadWorker & { pump(): Promise<void>; sent: number };
};

test("the thread's places are put among the page's own, and a play over them takes them and is quick", async () => {
  const s = open();
  const start = startMotion(scene(s), GEAR, "turn", s.outcome);
  if (!start.ok) throw new Error(start.why);
  const m0 = { ...start.motion, playing: true };
  let thread!: ReturnType<typeof fakeThread>;
  const ahead = createAhead(() => (thread = fakeThread()));
  ahead.ensure(scene(s), s.outcome, m0);
  await thread.pump();
  const reach = ahead.extent(scene(s), s.outcome, m0);
  // the thread went on to the end of what it was asked (it is no longer holding the play back), and the places are there
  assert.equal(reach, null, "the thread has finished: it holds nothing back");
  const kept = pathPlaces(scene(s), s.outcome, m0)!;
  assert.ok(placesExtent(kept) >= 360, `places for a whole turn: ${placesExtent(kept)}`);
  // the play, over them
  let m = m0;
  const t0 = performance.now();
  for (let a = 1; a <= 360; a++) m = solveContact(scene(s), { ...m, amount: a }, s.outcome, Infinity);
  const ms = performance.now() - t0;
  assert.equal(m.contact?.jam, null);
  assert.ok(ms < 800, `the play over places already worked out took ${ms.toFixed(0)} ms`);
  // and what it shows is what the page would have worked out itself (a copy of the scene, the same answers)
  const s2 = open();
  const r2 = startMotion(scene(s2), GEAR, "turn", s2.outcome);
  if (!r2.ok) throw new Error(r2.why);
  let own = r2.motion;
  for (let a = 1; a <= 360; a++) own = solveContact(scene(s2), { ...own, playing: true, amount: a }, s2.outcome, Infinity);
  const [x, y] = [m.contact!.pushables.find((p) => p.body === LEVER)!, own.contact!.pushables.find((p) => p.body === LEVER)!];
  assert.ok(Math.hypot(x.free![0] - y.free![0], x.free![1] - y.free![1]) < 0.01 && Math.abs((x.spin ?? 0) - (y.spin ?? 0)) < 0.01, `the thread's ${x.free} ${x.spin} against the page's own ${y.free} ${y.spin}`);
});

test("while the thread has not got far, the play is held at the places it has (extent), and a thread for another scene or motion is stopped", async () => {
  const s = open();
  const start = startMotion(scene(s), GEAR, "turn", s.outcome);
  if (!start.ok) throw new Error(start.why);
  const m0 = { ...start.motion, playing: true };
  const threads: ReturnType<typeof fakeThread>[] = [];
  const ahead = createAhead(() => { const t = fakeThread(); threads.push(t); return t; });
  assert.equal(ahead.extent(scene(s), s.outcome, m0), null, "no thread yet: nothing holds the play");
  ahead.ensure(scene(s), s.outcome, m0);
  const reach = ahead.extent(scene(s), s.outcome, m0);
  assert.ok(reach !== null && reach <= 5, `the thread has begun and is held to ${reach}`);
  ahead.ensure(scene(s), s.outcome, m0);
  assert.equal(threads.length, 1, "the same motion does not start another");
  const other = open();
  ahead.ensure(scene(other), other.outcome, { ...m0 });
  assert.equal(threads.length, 2, "another scene starts its own");
  ahead.stop();
  assert.equal(ahead.extent(scene(other), other.outcome, m0), null);
});

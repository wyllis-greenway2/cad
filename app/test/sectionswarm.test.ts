// A wheel's sections are worked out in a thread of their own and the thing that needed them is done again (`in_899`).
import test from "node:test";
import assert from "node:assert/strict";
import { askBeforeWorking, sectionsKept, SectionsNeeded, wheelSections, keepSections } from "../src/operation/wheelsections.ts";
import { createWarmer } from "../src/sections-warm.ts";
import type { SectionsWorker } from "../src/sections-warm.ts";
import type { GearSpec } from "../src/operation/gear.ts";

const spec = (teeth: number): GearSpec => ({ teeth, module: 2.13, wheel: { diameter: 24, starts: 1, width: 10 } });
/** a worker that answers when told to, with what the real one would */
function fake(opts: { answer: boolean }) {
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const posted: { id: number; spec: GearSpec }[] = [];
  const w: SectionsWorker = { postMessage: (m) => { posted.push(m as { id: number; spec: GearSpec }); }, addEventListener: (t, f) => { if (t === "message") listeners.push(f); }, terminate: () => {} };
  return { w, posted, answer: () => { const m = posted[0]!; const computed = wheelSections(m.spec); void computed; for (const f of listeners) f({ data: { id: m.id, result: computed } }); }, fail: () => { for (const f of listeners) f({ data: { id: 1, failed: "x" } }); }, opts };
}

test("without the page asking, the sections are worked out in place; when it asks, a wheel that is not kept throws and one that is kept does not", () => {
  const s = spec(16);
  assert.ok(wheelSections(s).ok);
  assert.equal(sectionsKept(s), true);
  assert.doesNotThrow(() => askBeforeWorking(() => true, () => wheelSections(s)), "kept: not asked");
  const cold = spec(17);
  assert.equal(sectionsKept(cold), false);
  assert.throws(() => askBeforeWorking(() => true, () => wheelSections(cold)), SectionsNeeded);
  assert.equal(sectionsKept(cold), false, "nothing was worked out");
  assert.ok(askBeforeWorking(() => false, () => wheelSections(cold)).ok, "the page said not to wait: worked out in place");
});

test("the warmer asks a worker for a wheel that is not kept, keeps what it sends, and the second attempt goes through", async () => {
  const f = fake({ answer: true });
  const warmer = createWarmer(() => f.w);
  const s = spec(18);
  let ran = 0;
  const first = warmer.attempt(() => { ran++; return wheelSections(s); });
  assert.equal(first.ok, false);
  assert.equal(ran, 1, "it began and stopped at the wheel");
  assert.equal(f.posted.length, 1);
  assert.equal(f.posted[0]!.spec.teeth, 18);
  const again = warmer.attempt(() => wheelSections(s));
  assert.equal(again.ok, false, "still waiting: one request only");
  assert.equal(f.posted.length, 1, "not asked twice");
  keepSections(s, { ok: true, value: [] }); // (what the worker's answer is kept as)
  f.answer();
  if (!first.ok) await first.ready;
  const second = warmer.attempt(() => wheelSections(s));
  assert.equal(second.ok, true);
});

test("a worker that fails is given up for that wheel, and it is worked out in place", async () => {
  const f = fake({ answer: false });
  const warmer = createWarmer(() => f.w);
  const s = spec(19);
  const first = warmer.attempt(() => wheelSections(s));
  assert.equal(first.ok, false);
  f.fail();
  if (!first.ok) await first.ready;
  const second = warmer.attempt(() => wheelSections(s));
  assert.equal(second.ok, true, "worked out in place");
  assert.equal(sectionsKept(s), true);
});

test("a worker that cannot be made is given up for that wheel too", async () => {
  const warmer = createWarmer(() => { throw new Error("no workers"); });
  const s = spec(20);
  const first = warmer.attempt(() => wheelSections(s));
  assert.equal(first.ok, false);
  if (!first.ok) await first.ready;
  assert.equal(warmer.attempt(() => wheelSections(s)).ok, true);
});

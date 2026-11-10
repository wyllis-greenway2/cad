import test from "node:test";
import assert from "node:assert/strict";
import { createAsyncKernel } from "../src/kernel-async.ts";
import type { WorkerLike } from "../src/kernel-async.ts";
import type { KernelGraph, KernelResult } from "../src/compiler/kernel/adapter.ts";

const result = (volume: number): KernelResult => ({ ops: [], finalId: null, volume, bbox: null, mesh: null, faces: null, edges: null, vertices: null, totalMs: 0 });
const graph = (n: number): KernelGraph => ({ params: {}, ops: [{ id: `o${n}`, type: "x" }] });

/** A worker that answers only when told to. */
function fake() {
  const sent: { id: number; graph: KernelGraph }[] = [];
  let listener: (e: { data: unknown }) => void = () => {};
  const w: WorkerLike = {
    postMessage: (m) => void sent.push(m as { id: number; graph: KernelGraph }),
    addEventListener: (type, f) => { if (type === "message") listener = f as unknown as typeof listener; },
  };
  return { w, sent, say: (data: unknown) => listener({ data }), answer: (i: number, volume: number) => listener({ data: { id: sent[i]!.id, result: result(volume) } }) };
}

test("a kernel on its own thread: answers at once from the cache, else with the last finished result; only the newest request is kept", async () => {
  const f = fake();
  let changed = 0;
  const k = createAsyncKernel(() => changed++, f.w);
  f.say({ ready: true });
  await k.init();
  assert.equal(k.evaluate(graph(1)).volume, null, "nothing yet: an empty answer");
  assert.equal(f.sent.length, 1);
  k.evaluate(graph(2)); // asked while the first is being worked
  k.evaluate(graph(3)); // and again: only this one stays queued
  assert.equal(f.sent.length, 1);
  f.answer(0, 10); // the first answer comes
  assert.equal(changed, 1);
  assert.equal(f.sent.length, 2, "the newest request goes next");
  assert.deepEqual(f.sent[1]!.graph, graph(3));
  assert.equal(k.evaluate(graph(1)).volume, 10, "the known graph answers from the cache");
  assert.equal(k.evaluate(graph(3)).volume, 10, "being worked out: the last finished result stands in");
  f.answer(1, 30);
  assert.equal(k.evaluate(graph(3)).volume, 30);
  // the picture must not jump back: a miss gives the newest finished result, not the one of an old graph that was asked again
  assert.equal(k.evaluate(graph(1)).volume, 10);
  assert.equal(k.evaluate(graph(4)).volume, 30, "a new graph shows the newest finished result (30), not the old one that was just read from the cache (10)");
});

test("a draft (a rough mesh while a size is dragged) is asked for apart from the fine one, and the fine one is asked for again when the draft is over (`in_216`)", async () => {
  const f = fake();
  const k = createAsyncKernel(() => {}, f.w);
  f.say({ ready: true });
  await k.init();
  k.draft = true;
  k.evaluate(graph(1));
  assert.equal((f.sent[0] as unknown as { draft: boolean }).draft, true);
  f.answer(0, 10);
  assert.equal(k.evaluate(graph(1)).volume, 10, "the draft answers the draft");
  k.draft = false;
  const fine = k.evaluate(graph(1));
  assert.equal(fine.stale, true, "the fine mesh of the same graph is not known yet: the draft stands in until it comes");
  assert.equal(f.sent.length, 2);
  assert.equal((f.sent[1] as unknown as { draft: boolean }).draft, false);
});

test("a job the kernel does not come back from is given up after the limit: the thread is stopped and a new one started, the job is answered as an error on its last operation, and what is asked next is worked on (`in_255`)", async () => {
  const first = fake();
  const second = fake();
  let stopped = 0, changed = 0;
  first.w.terminate = () => { stopped++; };
  const k = createAsyncKernel(() => changed++, first.w, { limitMs: 30, respawn: () => second.w });
  first.say({ ready: true });
  await k.init();
  const g1: KernelGraph = { params: {}, ops: [{ id: "a", type: "sketch" }, { id: "b", type: "transform" }] };
  assert.equal(k.evaluate(g1).stale, true);
  assert.equal(first.sent.length, 1, "the job is with the first thread");
  k.evaluate(graph(2)); // asked meanwhile: waits behind it
  await new Promise((r) => setTimeout(r, 90)); // the thread never answers
  assert.equal(stopped, 1, "the thread was stopped");
  assert.ok(changed >= 1, "the page is told");
  const answer = k.evaluate(g1);
  assert.equal(answer.stale, undefined, "the job has an answer now");
  assert.equal(answer.ops[0]!.error, null);
  assert.match(answer.ops[1]!.error ?? "", /was stopped: it cannot be made/);
  // the new thread is not asked anything until it says it is ready, then it gets what was waiting
  assert.equal(second.sent.length, 0);
  second.say({ ready: true });
  assert.equal(second.sent.length, 1, "what was asked next is now with the new thread");
  second.answer(0, 7);
  assert.equal(k.evaluate(graph(2)).volume, 7);
  // an answer from the old thread that comes late is ignored
  first.answer(0, 99);
  assert.equal(k.evaluate(graph(2)).volume, 7);
});

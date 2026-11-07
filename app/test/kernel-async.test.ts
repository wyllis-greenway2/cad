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

// The kernel's answers kept between sessions (`dec_description_cache`): a kept answer is shown the moment it is found, the thread's own answer replaces it and is kept, a rough answer is not kept, and what is not an answer is ignored.
import test from "node:test";
import assert from "node:assert/strict";
import { createAsyncKernel } from "../src/kernel-async.ts";
import type { WorkerLike } from "../src/kernel-async.ts";
import { looksRight, sizeOf } from "../src/platform/result-store.ts";
import type { ResultStore } from "../src/platform/result-store.ts";
import type { KernelGraph, KernelResult } from "../src/compiler/kernel/adapter.ts";

const answer = (volume: number): KernelResult => ({ ops: [{ id: "a", type: "extrude", error: null, ms: 1 }], finalId: "a", volume, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, mesh: { vertices: new Float32Array(9), normals: new Float32Array(9), triangles: new Uint32Array(3) }, faces: [], edges: [], vertices: [], totalMs: 1 });
const graph: KernelGraph = { params: {}, ops: [{ id: "a", type: "extrude" }] };
function memoryStore(kept: Record<string, KernelResult> = {}) {
  const puts: string[] = [];
  const store: ResultStore = { get: async (t) => kept[t] ?? null, put: (t, r) => { kept[t] = r; puts.push(t); }, clear: async () => { for (const k of Object.keys(kept)) delete kept[k]; } };
  return { store, kept, puts };
}
function fakeWorker() {
  const sent: { id: number; graph: KernelGraph; draft?: boolean }[] = [];
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const worker: WorkerLike = { postMessage: (m) => { sent.push(m as never); }, addEventListener: (t, f) => { if (t === "message") { listeners.push(f); f({ data: { ready: true } }); } } };
  return { worker, sent, reply: (id: number, result: KernelResult) => { for (const f of listeners) f({ data: { id, result } }); } };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test("a kept answer is shown as soon as it is found, before the thread has answered, and the thread's own answer replaces it", async () => {
  const text = JSON.stringify(graph);
  const { store } = memoryStore({ [text]: answer(7) });
  const w = fakeWorker();
  let changes = 0;
  const k = createAsyncKernel(() => { changes++; }, w.worker, { store });
  const first = k.evaluate(graph);
  assert.equal(first.stale, true, "nothing is known yet");
  await tick();
  assert.equal(changes, 1, "the app is told");
  const shown = k.evaluate(graph);
  assert.equal(shown.stale, undefined);
  assert.equal(shown.fromCache, true);
  assert.equal(shown.volume, 7);
  w.reply(w.sent[0]!.id, answer(7.5)); // the thread's own answer
  const now = k.evaluate(graph);
  assert.equal(now.volume, 7.5);
  assert.equal(now.fromCache, undefined);
});

test("the thread's whole answer is kept; a rough one (a size being dragged) is not", async () => {
  const { store, puts } = memoryStore();
  const w = fakeWorker();
  const k = createAsyncKernel(() => {}, w.worker, { store });
  k.draft = true;
  k.evaluate(graph);
  w.reply(w.sent[0]!.id, answer(1));
  assert.deepEqual(puts, [], "a draft is not kept");
  k.draft = false;
  const other: KernelGraph = { params: {}, ops: [{ id: "b", type: "extrude" }] };
  k.evaluate(other);
  w.reply(w.sent[1]!.id, answer(2));
  assert.deepEqual(puts, [JSON.stringify(other)]);
});

test("a graph is asked of the store once, however often it is evaluated", async () => {
  let asks = 0;
  const store: ResultStore = { get: async () => { asks++; return null; }, put: () => {}, clear: async () => {} };
  const k = createAsyncKernel(() => {}, fakeWorker().worker, { store });
  for (let i = 0; i < 5; i++) k.evaluate(graph);
  await tick();
  assert.equal(asks, 1);
});

test("what is not an answer is ignored, and the size of an answer is its arrays", () => {
  assert.equal(looksRight(answer(1)), true);
  assert.equal(looksRight(null), false);
  assert.equal(looksRight({ ops: [], totalMs: 1, mesh: { vertices: [1, 2], normals: [], triangles: [] } }), false, "plain arrays where the numbers should be typed");
  assert.equal(looksRight({ ops: "no", totalMs: 1 }), false);
  assert.ok(sizeOf(answer(1)) >= 9 * 4 * 2 + 3 * 4);
});

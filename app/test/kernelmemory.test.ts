// The kernel's thread is restarted when its memory has grown big (`in_805`): the memory of a kernel only grows, so after a heavy model it stays big for the session and later edits add to it, until the browser stops it.
import test from "node:test";
import assert from "node:assert/strict";
import { createAsyncKernel } from "../src/kernel-async.ts";
import type { WorkerLike } from "../src/kernel-async.ts";
import type { KernelGraph, KernelResult } from "../src/compiler/kernel/adapter.ts";

const EMPTY: KernelResult = { ops: [], finalId: null, volume: null, bbox: null, mesh: null, faces: null, edges: null, vertices: null, totalMs: 0 };
const graph = (n: number): KernelGraph => ({ ops: [{ id: `o${n}`, type: "box" }] } as unknown as KernelGraph);

function rig(opts: { restartMb?: number; hardMb?: number } = {}) {
  const workers: { posted: { id: number }[]; terminated: boolean; listeners: ((e: { data: unknown }) => void)[]; ready(): void; answer(heapMB?: number): void; w: WorkerLike }[] = [];
  const make = () => {
    const rec = { posted: [] as { id: number }[], terminated: false, listeners: [] as ((e: { data: unknown }) => void)[], ready() { for (const f of rec.listeners) f({ data: { ready: true } }); }, answer(heapMB?: number) { const job = rec.posted.shift()!; for (const f of rec.listeners) f({ data: { id: job.id, result: { ...EMPTY }, ...(heapMB === undefined ? {} : { heapMB }) } }); }, w: undefined as unknown as WorkerLike };
    rec.w = { postMessage: (m) => { rec.posted.push(m as { id: number }); }, addEventListener: (t, f) => { if (t === "message") rec.listeners.push(f); }, terminate: () => { rec.terminated = true; } };
    workers.push(rec);
    return rec;
  };
  const first = make();
  const k = createAsyncKernel(() => {}, first.w, { respawn: () => make().w, ...opts });
  first.ready();
  return { k, workers };
}

test("a thread whose memory has grown past the limit is restarted when nothing waits, and the next job goes to the new one", () => {
  const { k, workers } = rig({ restartMb: 1000 });
  k.evaluate(graph(1));
  workers[0]!.answer(1500);
  assert.equal(workers.length, 2, "a new thread was started");
  assert.equal(workers[0]!.terminated, true, "and the old one stopped");
  k.evaluate(graph(2));
  assert.equal(workers[1]!.posted.length, 0, "the new thread is not ready: the job waits");
  workers[1]!.ready();
  assert.equal(workers[1]!.posted.length, 1, "and goes to it when it is");
});

test("a thread that has not grown past the limit is left alone", () => {
  const { k, workers } = rig({ restartMb: 1000 });
  k.evaluate(graph(1));
  workers[0]!.answer(600);
  k.evaluate(graph(2));
  assert.equal(workers.length, 1);
  assert.equal(workers[0]!.posted.length, 1, "the next job goes to the same thread");
  workers[0]!.answer();
  assert.equal(workers.length, 1, "an answer that does not say its size does not restart it");
});

test("with a job waiting the thread is not restarted for the soft limit, but is when nothing waits any more", () => {
  const { k, workers } = rig({ restartMb: 1000, hardMb: 3000 });
  k.evaluate(graph(1));
  k.evaluate(graph(2)); // (the newest request is kept while the first is worked on)
  workers[0]!.answer(1500);
  assert.equal(workers.length, 1, "a job waits: the thread goes on with it");
  assert.equal(workers[0]!.posted.length, 1);
  workers[0]!.answer(1600);
  assert.equal(workers.length, 2, "nothing waits: now it is restarted");
});

test("past the hard limit the thread is restarted even though a job waits, and the job goes to the new one", () => {
  const { k, workers } = rig({ restartMb: 1000, hardMb: 2000 });
  k.evaluate(graph(1));
  k.evaluate(graph(2));
  workers[0]!.answer(2500);
  assert.equal(workers.length, 2, "restarted with a job waiting");
  assert.equal(workers[0]!.posted.length, 0);
  workers[1]!.ready();
  assert.equal(workers[1]!.posted.length, 1, "the waiting job was given to the new thread");
});

// The kernel's thread is restarted when its memory has grown big (`in_848`): the memory of a kernel only grows, so after a heavy model it stays big for the session and later edits add to it, until the browser stops it.
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
  k.evaluate(graph(0));
  workers[0]!.answer(300); // (its first answer: what the model takes from nothing)
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
  k.evaluate(graph(0));
  workers[0]!.answer(300);
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
  k.evaluate(graph(0));
  workers[0]!.answer(300);
  k.evaluate(graph(1));
  k.evaluate(graph(2));
  workers[0]!.answer(2500);
  assert.equal(workers.length, 2, "restarted with a job waiting");
  assert.equal(workers[0]!.posted.length, 0);
  workers[1]!.ready();
  assert.equal(workers[1]!.posted.length, 1, "the waiting job was given to the new thread");
});

test("a model that needs more than the limit from the start does not have its thread restarted after every answer (`in_857`): only when it has grown well beyond what making it takes", () => {
  const { k, workers } = rig({ restartMb: 1000, hardMb: 3000 });
  k.evaluate(graph(1));
  workers[0]!.answer(1500); // (the first answer: already over the limit)
  assert.equal(workers.length, 1);
  k.evaluate(graph(2));
  workers[0]!.answer(1600);
  assert.equal(workers.length, 1, "a little more: left alone");
  k.evaluate(graph(3));
  workers[0]!.answer(2200);
  assert.equal(workers.length, 2, "grown by more than two fifths of its first answer: restarted");
});

test("the thread the page started while the app was still loading is the one the kernel uses, once (`in_987`)", () => {
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const posted: unknown[] = [];
  const early: WorkerLike = { postMessage: (m) => { posted.push(m); }, addEventListener: (t, f) => { if (t === "message") listeners.push(f); } };
  (globalThis as unknown as { __earlyKernel?: WorkerLike }).__earlyKernel = early;
  const k = createAsyncKernel(() => {});
  assert.equal((globalThis as unknown as { __earlyKernel?: WorkerLike }).__earlyKernel, undefined, "taken: a restart does not get it again");
  for (const f of listeners) f({ data: { ready: true } });
  k.evaluate(graph(1));
  assert.equal(posted.length, 1, "its first job went to the early thread");
});

test("a step the kernel cannot make leaves the picture of the model as it was, with the error on the step (`in_994`)", () => {
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const posted: { id: number }[] = [];
  const w: WorkerLike = { postMessage: (m) => { posted.push(m as { id: number }); }, addEventListener: (t, f) => { if (t === "message") listeners.push(f); } };
  const k = createAsyncKernel(() => {}, w);
  for (const f of listeners) f({ data: { ready: true } });
  const mesh = { vertices: new Float32Array([0, 0, 0]), normals: new Float32Array([0, 0, 1]), triangles: new Uint32Array([0, 0, 0]) };
  k.evaluate(graph(1));
  for (const f of listeners) f({ data: { id: posted.shift()!.id, result: { ...EMPTY, mesh, bodies: [{ id: "x_a", min: [0, 0, 0], max: [1, 1, 1], volume: 1 }] } } });
  const good = k.evaluate(graph(1));
  assert.ok(good.mesh && !good.stale);
  k.evaluate(graph(2));
  for (const f of listeners) f({ data: { id: posted.shift()!.id, failed: "out of memory" } });
  const failed = k.evaluate(graph(2));
  assert.equal(failed.mesh, mesh, "the picture is the one before");
  assert.equal(failed.bodies?.length, 1);
  assert.equal(failed.ops.at(-1)?.error, "out of memory", "the error is on the step");
});

test("the kernel's steps stop when its memory is full, and say so, instead of going on until the page dies (`in_994`)", async () => {
  const { kernel } = await import("../src/compiler/kernel/index.ts");
  const { setMemoryStop, clearKernelCaches } = await import("../src/compiler/kernel/occt/interpreter.mjs");
  await kernel.init();
  const sk = (id: string, x: number) => ({ id, type: "sketch", shape: "rect", w: 4, d: 4, at: [x, 0], plane: "XY", origin: 0 });
  const g = { params: {}, ops: [sk("s_a", 0), { id: "x_a", type: "extrude", profile: "s_a", distance: 3, mode: "add" }, sk("s_b", 20), { id: "x_b", type: "extrude", profile: "s_b", distance: 3, target: "x_a", mode: "new" }] };
  clearKernelCaches();
  const fine = kernel.evaluate(g as never) as unknown as { ops: { error: string | null }[] };
  assert.deepEqual(fine.ops.map((o) => o.error), [null, null, null, null]);
  clearKernelCaches();
  setMemoryStop(1); // (any memory is too much)
  try {
    const full = kernel.evaluate(g as never) as unknown as { ops: { id: string; error: string | null }[] };
    assert.ok(full.ops.every((o) => o.error && /too big for the kernel's memory/.test(o.error)), JSON.stringify(full.ops.map((o) => o.error)));
  } finally { setMemoryStop(3300); clearKernelCaches(); }
});

test("a thread at the kernel's own stop size is restarted even when it was that big at its first answer (`in_994`)", () => {
  const { k, workers } = rig({ restartMb: 1000, hardMb: 3000 });
  k.evaluate(graph(1));
  workers[0]!.answer(3400); // (its first answer, above what the kernel makes steps at)
  assert.equal(workers.length, 2, "restarted: otherwise every step after it says the memory is full");
});

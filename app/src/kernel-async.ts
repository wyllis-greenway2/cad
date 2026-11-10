// The kernel as the app sees it, but worked out on its own thread (`in_132`). `evaluate` stays the same call: it answers at once with the result for this graph if it is known
// (the cache), else with the last result there was (the picture lags a little) and asks the worker, newest request first, one at a time. When an answer comes `onChange` is called
// so the app compiles again and picks the new result up from the cache. A heavy model therefore never freezes the page; it just takes a moment to appear.
import type { Kernel, KernelGraph, KernelResult } from "./compiler/kernel/adapter.ts";

const EMPTY: KernelResult = { ops: [], finalId: null, volume: null, bbox: null, mesh: null, faces: null, edges: null, vertices: null, totalMs: 0 };
const KEEP = 24; // results kept, newest last

export interface AsyncKernel extends Kernel {
  draft: boolean;
  /** is the worker still working something out */
  readonly pending: boolean;
}

/** The part of a worker this needs (so a test can stand in for it). */
export interface WorkerLike { postMessage(m: unknown): void; addEventListener(type: "message" | "error", f: (e: any) => void): void; /** stop it at once (a real worker can; a stand-in need not) */ terminate?(): void } // eslint-disable-line @typescript-eslint/no-explicit-any
const spawn = (): WorkerLike => new Worker(new URL("./kernel-worker.ts", import.meta.url), { type: "module" });

/** What the kernel says when a job cannot be answered: an error on the last operation of the graph, so the step that asked for it is the one that is reported (and is taken back). */
const failedResult = (graph: KernelGraph, error: string, ms = 0): KernelResult => ({ ...EMPTY, ops: graph.ops.map((o, i) => ({ id: o.id, type: o.type, error: i === graph.ops.length - 1 ? error : null, ms: i === graph.ops.length - 1 ? ms : 0 })) });

/**
 * `limitMs`: how long a job may take (`in_255`: a body scaled to half a million times its size did not come back from the kernel, and with the worker stuck on it nothing after it was ever answered). A job that
 * takes longer is given up: the worker is stopped and a new one started, and the job is answered as an error, so the step that asked for it is refused and the page works again.
 */
export function createAsyncKernel(onChange: () => void, first: WorkerLike = spawn(), opts: { limitMs?: number; respawn?: () => WorkerLike } = {}): AsyncKernel {
  const limit = opts.limitMs ?? 60000;
  const respawn = opts.respawn ?? spawn;
  let worker = first;
  let up = false; // (the current worker has said it is ready)
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cache = new Map<string, KernelResult>();
  let last: KernelResult = EMPTY;
  let busy: { id: number; key: string; graph: KernelGraph } | null = null;
  let queued: { key: string; graph: KernelGraph; draft: boolean } | null = null;
  let counter = 0;
  const pump = () => {
    if (busy || !queued || !up) return;
    const { key, graph, draft } = queued;
    queued = null;
    const job = { id: ++counter, key, graph };
    busy = job;
    worker.postMessage({ id: job.id, graph, draft });
    timer = setTimeout(() => stuck(job.id), limit);
    (timer as { unref?: () => void }).unref?.(); // (a timer must not keep a process alive that has nothing else to do)
  };
  const stuck = (id: number) => {
    if (!busy || busy.id !== id) return;
    const job = busy;
    busy = null;
    up = false;
    try { worker.terminate?.(); } catch { /* (already gone) */ }
    console.error(`the kernel's thread was stopped after ${Math.round(limit / 1000)} seconds on a job`);
    cache.set(job.key, failedResult(job.graph, `the kernel was still working on that after ${Math.round(limit / 1000)} seconds and was stopped: it cannot be made (try something smaller)`, limit));
    worker = respawn();
    attach(worker);
    onChange();
  };
  let resolveReady: () => void = () => {};
  let rejectReady: (e: Error) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const onMessage = (e: MessageEvent<{ ready?: boolean; failed?: string; id?: number; result?: KernelResult }>) => {
    const m = e.data;
    if (m.ready) { up = true; resolveReady(); pump(); return; }
    if (m.id === undefined) return void rejectReady(new Error(m.failed ?? "the kernel could not start"));
    const job = busy;
    if (!job || job.id !== m.id) return; // (the answer to a job that was given up)
    busy = null;
    if (timer) clearTimeout(timer);
    if (m.failed) {
      console.error("the kernel's thread failed on a job:", m.failed);
      cache.set(job.key, failedResult(job.graph, m.failed)); // (an answer, so what waits for it is not held up for ever, and the step that asked is reported)
      onChange();
    }
    if (m.result) {
      cache.set(job.key, m.result);
      if (cache.size > KEEP) cache.delete(cache.keys().next().value as string);
      last = m.result;
      onChange();
    }
    pump();
  };
  const attach = (w: WorkerLike) => {
    w.addEventListener("message", onMessage);
    w.addEventListener("error", (e: ErrorEvent) => rejectReady(new Error(e.message || "the kernel's thread failed")));
  };
  attach(worker);
  const self: AsyncKernel = {
    name: "occt (worker)",
    lagging: true,
    draft: false,
    init: () => ready,
    get pending() { return busy !== null || queued !== null; },
    evaluate(graph: KernelGraph): KernelResult {
      const draft = self.draft; // (a rough mesh while a size is dragged, `in_216`: asked for and kept apart from the fine one)
      const key = (draft ? "draft:" : "") + JSON.stringify(graph);
      const hit = cache.get(key);
      if (hit) { cache.delete(key); cache.set(key, hit); return hit; } // (`last` is only what the worker finished last: a hit on an old graph must not make the picture jump back to it)
      if (busy?.key === key) return { ...last, stale: true }; // already being worked out
      queued = { key, graph, draft }; // only the newest request is kept: what was asked before it is no longer wanted
      pump();
      return { ...last, stale: true }; // (what is shown meanwhile is marked, so nothing is built on it)
    },
  };
  return self;
}

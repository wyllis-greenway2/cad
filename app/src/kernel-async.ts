// The kernel as the app sees it, but worked out on its own thread (`in_132`). `evaluate` stays the same call: it answers at once with the result for this graph if it is known
// (the cache), else with the last result there was (the picture lags a little) and asks the worker, newest request first, one at a time. When an answer comes `onChange` is called
// so the app compiles again and picks the new result up from the cache. A heavy model therefore never freezes the page; it just takes a moment to appear.
import type { Kernel, KernelGraph, KernelResult } from "./compiler/kernel/adapter.ts";

const EMPTY: KernelResult = { ops: [], finalId: null, volume: null, bbox: null, mesh: null, faces: null, edges: null, vertices: null, totalMs: 0 };
const KEEP = 24; // results kept, newest last

export interface AsyncKernel extends Kernel {
  /** is the worker still working something out */
  readonly pending: boolean;
}

export function createAsyncKernel(onChange: () => void): AsyncKernel {
  const worker = new Worker(new URL("./kernel-worker.ts", import.meta.url), { type: "module" });
  const cache = new Map<string, KernelResult>();
  let last: KernelResult = EMPTY;
  let busy: { id: number; key: string } | null = null;
  let queued: { key: string; graph: KernelGraph } | null = null;
  let counter = 0;
  const pump = () => {
    if (busy || !queued) return;
    const { key, graph } = queued;
    queued = null;
    busy = { id: ++counter, key };
    worker.postMessage({ id: busy.id, graph });
  };
  const ready = new Promise<void>((resolve, reject) => {
    worker.addEventListener("message", (e: MessageEvent<{ ready?: boolean; failed?: string; id?: number; result?: KernelResult }>) => {
      const m = e.data;
      if (m.ready) return void resolve();
      if (m.id === undefined) return void reject(new Error(m.failed ?? "the kernel could not start"));
      const job = busy;
      busy = null;
      if (m.failed) console.error("the kernel's thread failed on a job:", m.failed);
      if (job && job.id === m.id && m.result) {
        cache.set(job.key, m.result);
        if (cache.size > KEEP) cache.delete(cache.keys().next().value as string);
        last = m.result;
        onChange();
      }
      pump();
    });
    worker.addEventListener("error", (e) => reject(new Error(e.message || "the kernel's thread failed")));
  });
  return {
    name: "occt (worker)",
    lagging: true,
    init: () => ready,
    get pending() { return busy !== null || queued !== null; },
    evaluate(graph: KernelGraph): KernelResult {
      const key = JSON.stringify(graph);
      const hit = cache.get(key);
      if (hit) { cache.delete(key); cache.set(key, hit); last = hit; return hit; }
      if (busy?.key === key) return last; // already being worked out
      queued = { key, graph }; // only the newest request is kept: what was asked before it is no longer wanted
      pump();
      return last;
    },
  };
}

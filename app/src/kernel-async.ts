// The kernel as the app sees it, but worked out on its own thread (`in_132`). `evaluate` stays the same call: it answers at once with the result for this graph if it is known
// (the cache), else with the last result there was (the picture lags a little) and asks the worker, newest request first, one at a time. When an answer comes `onChange` is called
// so the app compiles again and picks the new result up from the cache. A heavy model therefore never freezes the page; it just takes a moment to appear.
import type { ExportQuality, ExportResult, Kernel, KernelGraph, KernelResult, StepResult, ExactFormat, Vec } from "./compiler/kernel/adapter.ts";
import type { ResultStore as Store } from "./platform/result-store.ts";
type ResultStore = Store<KernelResult>; // (the store is made for the kernel's answer without knowing it: the platform layer does not import the compiler)

/** The size (MB) of its memory above which the kernel makes no more steps (`memoryStopMb` in `interpreter.mjs`): a thread this big is restarted before the next job, whatever it was at its first answer (`in_997`). */
const KERNEL_MEMORY_STOP_MB = 3300;
const EMPTY: KernelResult = { ops: [], finalId: null, volume: null, bbox: null, mesh: null, faces: null, edges: null, vertices: null, totalMs: 0 };
const KEEP = 24; // results kept, newest last

export interface AsyncKernel extends Kernel {
  draft: boolean;
  lite: boolean;
  /** is the worker still working something out */
  readonly pending: boolean;
}

/** The part of a worker this needs (so a test can stand in for it). */
export interface WorkerLike { postMessage(m: unknown): void; addEventListener(type: "message" | "error", f: (e: any) => void): void; /** stop it at once (a real worker can; a stand-in need not) */ terminate?(): void } // eslint-disable-line @typescript-eslint/no-explicit-any
/** The thread `early.ts` started while the app was still loading, once (a restart makes its own). */
const takeEarlyKernel = (): WorkerLike | null => { const w = (globalThis as unknown as { __earlyKernel?: WorkerLike }).__earlyKernel ?? null; (globalThis as unknown as { __earlyKernel?: WorkerLike }).__earlyKernel = undefined; return w; };
const spawn = (): WorkerLike => takeEarlyKernel() ?? new Worker(new URL("./kernel-worker.ts", import.meta.url), { type: "module" });

/** What the kernel says when a job cannot be answered: an error on the last operation of the graph, so the step that asked for it is the one that is reported (and is taken back). */
/** The answer to a job that could not be made: the step that asked has the error. What was drawn before stays drawn (`shown`: the last answer that was made; a model of hundreds of parts whose newest step cannot be made was a blank screen, `in_997`). */
const failedResult = (graph: KernelGraph, error: string, ms = 0, shown: KernelResult = EMPTY): KernelResult => ({ ...shown, stale: undefined, ops: graph.ops.map((o, i) => ({ id: o.id, type: o.type, error: i === graph.ops.length - 1 ? error : null, ms: i === graph.ops.length - 1 ? ms : 0 })) });

/**
 * `limitMs`: how long a job may take (`in_255`: a body scaled to half a million times its size did not come back from the kernel, and with the worker stuck on it nothing after it was ever answered). A job that
 * takes longer is given up: the worker is stopped and a new one started, and the job is answered as an error, so the step that asked for it is refused and the page works again.
 */
export function createAsyncKernel(onChange: () => void, first: WorkerLike = spawn(), opts: { limitMs?: number; respawn?: () => WorkerLike; /** the size (MB) the thread's memory may grow to before it is restarted when nothing waits (default 1800), and before it is restarted even though jobs wait (default 3000; the most the kernel can have is 4096) */ restartMb?: number; hardMb?: number; /** answers kept from earlier sessions (`dec_description_cache`) */ store?: ResultStore | null } = {}): AsyncKernel {
  const store = opts.store ?? null;
  const asked = new Set<string>(); // (the graphs the store has been asked for: once each)
  const limit = opts.limitMs ?? 60000;
  const respawn = opts.respawn ?? spawn;
  const [restartMb, hardMb] = [opts.restartMb ?? 1800, opts.hardMb ?? 3000];
  let heapMb = 0; // (how big the thread's memory has grown, as its last answer said)
  let baseMb = 0; // (how big it was at its first answer: what making the model from nothing takes. A thread is restarted only when it has grown well beyond this: a model that needs more than the limit would otherwise be restarted after every answer and made again from nothing each time, `in_857`)
  const grown = () => heapMb > baseMb * 1.4;
  // how much the memory has grown by a job after the first (the biggest lately, a little over): a job begun with less room than that would be refused part way, so the thread is restarted before it, not in the middle of it (`in_1275`)
  let jobStartMb = 0, maxGrow = 0;
  const headroom = (): number => Math.min(1500, Math.round(maxGrow * 1.25));
  const tooFull = (): boolean => baseMb > 0 && maxGrow > 0 && heapMb > baseMb * 1.2 && heapMb + headroom() > KERNEL_MEMORY_STOP_MB;
  let lastDone: { key: string; graph: KernelGraph } | null = null; // (the last whole answer: a new thread makes it again at once when it has nothing else to do, so the model is warm for the next edit, `in_1275`)
  let warm: { key: string; graph: KernelGraph } | null = null;
  const retried = new Set<string>(); // (the jobs that were refused for want of memory and are made again once on a new thread)
  let worker = first;
  let up = false; // (the current worker has said it is ready)
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cache = new Map<string, KernelResult>();
  let last: KernelResult = EMPTY;
  let busy: { id: number; key: string; graph: KernelGraph; asked?: { resolve: (r: ExportResult | StepResult) => void }; at?: number; posted?: number; /** the answers so far of a model made in pieces have begun to come (`dec_progressive_open`) */ pieces?: boolean; /** and the thread has been asked to stop (a newer question is waiting) */ stopping?: boolean } | null = null;
  const exports: { graph: KernelGraph; quality: ExportQuality; resolve: (r: ExportResult | StepResult) => void }[] = []; // (the exports waiting: each is answered, none is dropped for a newer one)
  let queued: { key: string; graph: KernelGraph; draft: boolean; lite: boolean; at: number; eye?: Vec } | null = null;
  let counter = 0;
  /** A thread whose memory has grown big is stopped and a new one started (the memory of a kernel only grows: a heavy model leaves it big for the rest of the session, and the next edits add to it until the browser stops it). What it kept is lost: the next answer is worked out from nothing, and the answers the page has kept (the last few) are still shown. */
  const restart = (why: string) => {
    console.warn(`the kernel's thread is restarted: its memory has grown to ${heapMb} MB (${why})`);
    warm = lastDone && baseMb > 0 && baseMb < KERNEL_MEMORY_STOP_MB * 0.8 ? lastDone : null; // (not for a model that is over the limit from its start: that would be made again for ever)
    heapMb = 0;
    baseMb = 0;
    jobStartMb = 0;
    maxGrow = 0;
    up = false;
    try { worker.terminate?.(); } catch { /* (already gone) */ }
    worker = respawn();
    attach(worker);
  };
  const pump = () => {
    if (busy) return;
    if ((heapMb > KERNEL_MEMORY_STOP_MB || (heapMb > hardMb && grown()) || tooFull()) && up) { restart(tooFull() && heapMb <= KERNEL_MEMORY_STOP_MB ? "no room for the next job" : "too big to go on"); return; } // (the jobs wait for the new thread: it says when it is ready, and the next pump posts them)
    if (!up) return;
    const wanted = exports.shift();
    if (wanted) {
      const job = { id: ++counter, key: "", graph: wanted.graph, asked: { resolve: wanted.resolve } };
      busy = job;
      worker.postMessage({ id: job.id, graph: wanted.graph, export: wanted.quality });
      timer = setTimeout(() => stuck(job.id), limit);
      (timer as { unref?: () => void }).unref?.();
      return;
    }
    if (!queued) return;
    const { key, graph, draft, lite, at, eye } = queued;
    queued = null;
    const job = { id: ++counter, key, graph, at, posted: performance.now() };
    jobStartMb = baseMb ? heapMb : 0; // (the first job of a thread makes the whole model: its growth says nothing of what an edit costs)
    busy = job;
    worker.postMessage({ id: job.id, graph, draft, lite, ...(eye ? { eye } : {}) });
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
    if (job.asked) { job.asked.resolve({ ok: false, error: `the kernel was still working on the export after ${Math.round(limit / 1000)} seconds and was stopped` }); worker = respawn(); attach(worker); pump(); return; }
    cache.set(job.key, failedResult(job.graph, `the kernel was still working on that after ${Math.round(limit / 1000)} seconds and was stopped: it cannot be made (try something smaller)`, limit, last));
    worker = respawn();
    attach(worker);
    onChange();
  };
  let resolveReady: () => void = () => {};
  let rejectReady: (e: Error) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const onMessage = (e: MessageEvent<{ ready?: boolean; failed?: string; id?: number; heapMB?: number; partial?: boolean; cancelled?: boolean; result?: KernelResult; exported?: ExportResult | StepResult; at?: { started: number; sent: number } }>) => {
    const received = performance.timeOrigin + performance.now();
    const m = e.data;
    if (m.ready) {
      up = true; resolveReady();
      if (!queued && !busy && warm) { queued = { key: warm.key, graph: warm.graph, draft: false, lite: false, at: performance.now() }; } // (nothing is asked yet: the model is made again while the page is idle, so the next edit finds it warm)
      warm = null;
      pump();
      return;
    }
    if (m.id === undefined) return void rejectReady(new Error(m.failed ?? "the kernel could not start"));
    const job = busy;
    if (!job || job.id !== m.id) return; // (the answer to a job that was given up)
    if (m.partial && m.result) { // the parts made so far of a model made in pieces: shown at once, the job goes on (`dec_progressive_open`); each answer is a sign that it is alive, so its time starts again
      job.pieces = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => stuck(job.id), limit);
      (timer as { unref?: () => void }).unref?.();
      last = { ...m.result, stale: true };
      onChange();
      return;
    }
    busy = null;
    if (m.cancelled) { if (timer) clearTimeout(timer); if (typeof m.heapMB === "number") heapMb = m.heapMB; pump(); return; } // (stopped for a newer question: what was made stays on the screen)
    if (timer) clearTimeout(timer);
    if (typeof m.heapMB === "number") { if (jobStartMb > 0) maxGrow = Math.max(maxGrow * 0.9, m.heapMB - jobStartMb); heapMb = m.heapMB; if (!baseMb) baseMb = heapMb; }
    if (job.asked) {
      job.asked.resolve(m.exported ?? { ok: false, error: m.failed ?? "the kernel could not make the mesh" });
      pump();
      return;
    }
    if (m.failed) {
      console.error("the kernel's thread failed on a job:", m.failed);
      cache.set(job.key, failedResult(job.graph, m.failed, 0, last)); // (an answer, so what waits for it is not held up for ever, and the step that asked is reported)
      onChange();
    }
    if (m.result && !job.asked && !retried.has(job.key) && m.result.ops.some((o) => /too big for the kernel's memory/.test(o.error ?? ""))) { // a step was refused for want of memory: not shown; the thread is restarted and the job made again once (`in_1275`)
      retried.add(job.key);
      if (!queued) queued = { key: job.key, graph: job.graph, draft: job.key.startsWith("draft:"), lite: job.key.startsWith("lite:"), at: performance.now() };
      restart("a step was refused for want of memory");
      return;
    }
    if (m.result) {
      retried.delete(job.key);
      if (!job.key.startsWith("draft:") && !job.key.startsWith("lite:") && !m.result.stale) lastDone = { key: job.key, graph: job.graph };
      if (job.at !== undefined && job.posted !== undefined) { const now = performance.now(); const tripMs = now - job.posted; m.result.trip = { waitMs: job.posted - job.at, tripMs, messageMs: tripMs - (m.result.totalMs ?? 0), ...(m.at ? { toThreadMs: m.at.started - (performance.timeOrigin + job.posted), threadMs: m.at.sent - m.at.started, backMs: received - m.at.sent } : {}) }; }
      cache.set(job.key, m.result);
      if (store && !job.key.startsWith("draft:") && !job.key.startsWith("lite:") && !m.result.stale) store.put(job.key, m.result); // (the whole answers only: a rough one made while a size is dragged is not kept)
      if (cache.size > KEEP) cache.delete(cache.keys().next().value as string);
      last = m.result;
      onChange();
    }
    if ((heapMb > KERNEL_MEMORY_STOP_MB || (heapMb > restartMb && grown()) || tooFull()) && !queued && exports.length === 0) { restart("nothing is waiting"); return; }
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
    lite: false,
    eye: undefined as Vec | undefined,
    init: () => ready,
    clear() { last = EMPTY; },
    get pending() { return busy !== null || queued !== null || exports.length > 0; },
    exportMesh(graph: KernelGraph, quality: ExportQuality): Promise<ExportResult> {
      return new Promise((resolve) => { exports.push({ graph, quality, resolve: (r) => resolve(r as ExportResult) }); pump(); });
    },
    exportStep(graph: KernelGraph, bodies?: string[], unit?: "in", schema?: ExactFormat): Promise<StepResult> {
      // the same queue as the mesh exports (one at a time, none dropped); the answer is a STEP result and is handed back as one
      return new Promise((resolve) => { exports.push({ graph, quality: { tolerance: 0, angular: 0, step: true, ...(unit ? { unit } : {}), ...(schema ? { schema } : {}), ...(bodies ? { bodies } : {}) }, resolve: (r) => resolve(r as StepResult) }); pump(); });
    },
    evaluate(graph: KernelGraph): KernelResult {
      const [draft, lite] = [self.draft, self.lite]; // (a rough mesh while a size is dragged, `in_216`, and with no faces and edges, `in_358`: asked for and kept apart from the fine and whole one)
      const key = (draft ? "draft:" : "") + (lite ? "lite:" : "") + JSON.stringify(graph);
      const hit = cache.get(key);
      if (hit) { cache.delete(key); cache.set(key, hit); return hit; } // (`last` is only what the worker finished last: a hit on an old graph must not make the picture jump back to it)
      if (store && !draft && !lite && !asked.has(key)) {
        // an answer kept from an earlier session: shown the moment it is found, while the thread works the model out (and its own answer replaces it)
        asked.add(key);
        if (asked.size > 200) asked.delete(asked.values().next().value as string);
        void store.get(key).then((kept) => { if (kept && !cache.has(key)) { cache.set(key, { ...kept, fromCache: true }); onChange(); } });
      }
      // what is shown meanwhile is the last finished result, unless it has a body that this graph no longer makes (a gear that was deleted): that one is not shown, nothing is, until the answer comes (`in_951`)
      const shown = (): KernelResult => (last.bodies?.some((b) => !graph.ops.some((o) => o.id === b.id)) ? EMPTY : last);
      if (busy?.key === key) return { ...shown(), stale: true }; // already being worked out
      queued = { key, graph, draft, lite, at: performance.now(), ...(self.eye ? { eye: self.eye } : {}) }; // only the newest request is kept: what was asked before it is no longer wanted
      if (busy?.pieces && !busy.stopping) { busy.stopping = true; worker.postMessage({ cancel: busy.id }); } // (a model being made in pieces is not finished for a question that has been overtaken: the parts made are kept)
      pump();
      return { ...shown(), stale: true }; // (what is shown meanwhile is marked, so nothing is built on it)
    },
  };
  return self;
}

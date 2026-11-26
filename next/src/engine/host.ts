// The host (E16, E17): the caller's side of the kernel's worker. It sends a recipe and gets a snapshot back, and it keeps three promises the engine alone cannot:
//  - a step that runs past the time limit is stopped, flagged "ran past the time limit", and the rest of the recipe still runs (the model is never blanked);
//  - a kernel that stops (a crash, running out of memory) does the same for the step it was in;
//  - the worker is restarted between requests once it holds more than the memory budget, and the recipe is sent again, so the memory the kernel does not give back cannot grow without end.
// The last good snapshot is kept and returned when nothing better can be made.
import type { Ask, Reply, Request, Snapshot } from "./protocol.ts";
import type { Step } from "./steps.ts";

/** how the host talks to a worker; Node's worker thread and a browser's Web Worker each make one */
export interface Transport {
  post(msg: Request): void;
  onMessage(cb: (r: Reply) => void): void;
  onExit(cb: (why: string) => void): void;
  terminate(): void;
}
export type Spawn = () => Transport;
export interface HostOptions {
  timeoutMs: number;
  memoryMb: number;
  attempts?: number;
}
export interface Outcome {
  snapshot: Snapshot;
  /** what the host did on the way, in words (a restart, a step held back) */ events: string[];
  /** false when the recipe could not be made and this is the last good picture */ fresh: boolean;
}

export class EngineHost {
  private spawn: Spawn;
  private opts: HostOptions;
  private worker: Transport | null = null;
  private serial = 0;
  private running: string | null = null;
  private exited: string | null = null;
  private waiting: ((r: Reply | { type: "gone"; why: string }) => void) | null = null;
  private rss = 0;
  private lastGood: Snapshot | null = null;
  /** steps held back, with the step as it was when it was (a step that is changed is tried again) */
  private held = new Map<string, { why: string; sig: string }>();
  constructor(spawn: Spawn, opts: HostOptions) {
    this.spawn = spawn;
    this.opts = opts;
  }

  load(steps: Step[], parameters: Record<string, number | string> = {}): Promise<Outcome> {
    return this.go("load", steps, parameters);
  }
  apply(steps: Step[], parameters: Record<string, number | string> = {}): Promise<Outcome> {
    return this.go("apply", steps, parameters);
  }
  /**
   * Ask about the recipe the worker holds (a trial, where a number works, the options for a failed step: E28, E35). The answer is plain data. The same limits hold: a question that runs past the time limit
   * or stops the kernel is given up (the worker is restarted, the next recipe is sent whole) and the answer says so; nothing in the recipe or in the picture changes.
   */
  async ask(q: Ask): Promise<{ ok: true; data: unknown } | { ok: false; why: string }> {
    const w = this.worker;
    if (!w) return { ok: false, why: "no recipe is loaded" };
    const reply = await this.ask1(w, { id: ++this.serial, type: "ask", ask: q });
    if (reply.type === "answer") return { ok: true, data: reply.data };
    if (reply.type === "error") return { ok: false, why: reply.message };
    this.stop();
    return {
      ok: false,
      why:
        reply.type === "gone"
          ? `the kernel stopped while this was tried (${reply.why}); it is restarted`
          : `this took longer than the time limit (${this.opts.timeoutMs / 1000} s) and was given up`,
    };
  }
  get last(): Snapshot | null {
    return this.lastGood;
  }
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private start(): Transport {
    const w = this.spawn();
    // only what the worker that is current says counts: one that was stopped sends its last words late
    w.onMessage((r) => {
      if (this.worker !== w) return;
      if (r.type === "running") this.running = r.step;
      else this.waiting?.(r);
    });
    w.onExit((why) => {
      if (this.worker !== w) return;
      this.exited = why;
      this.waiting?.({ type: "gone", why });
    });
    this.worker = w;
    this.running = null;
    this.exited = null;
    return w;
  }
  private stop(): void {
    const w = this.worker;
    this.worker = null;
    w?.terminate();
  }

  private async go(
    mode: "load" | "apply",
    steps: Step[],
    parameters: Record<string, number | string>,
  ): Promise<Outcome> {
    const events: string[] = [],
      pj = JSON.stringify(parameters),
      sig = (id: string) => JSON.stringify([steps.find((s) => s.id === id) ?? null, pj]); // a held-back step is tried again when its numbers or a parameter change
    for (const [id, h] of [...this.held]) if (h.sig !== sig(id)) this.held.delete(id); // a step that was changed gets another try
    if (this.worker && this.rss > this.opts.memoryMb) {
      events.push(
        `the kernel held ${this.rss} MB, over the ${this.opts.memoryMb} MB budget: restarted before this recipe`,
      );
      this.stop();
    }
    for (let attempt = 0; attempt < (this.opts.attempts ?? 4); attempt++) {
      this.running = null;
      const fresh = !this.worker,
        w = this.worker ?? this.start(),
        forced = Object.fromEntries([...this.held].map(([id, h]) => [id, h.why]));
      const reply = await this.ask1(w, { id: ++this.serial, type: fresh ? "load" : mode, steps, forced, parameters });
      if (reply.type === "done") {
        this.rss = reply.snapshot.rssMb;
        this.lastGood = reply.snapshot;
        return { snapshot: reply.snapshot, events, fresh: true };
      }
      if (reply.type === "error") {
        events.push(`this recipe was refused: ${reply.message}; this is the last good picture`);
        return { snapshot: this.lastGood ?? { steps: [], computes: 0, ms: 0, rssMb: 0 }, events, fresh: false };
      }
      // it did not answer: which step was it in?
      const step = this.running,
        why =
          reply.type === "gone"
            ? `the kernel stopped (${reply.why})`
            : `ran past the time limit (${this.opts.timeoutMs / 1000} s)`;
      this.stop();
      if (!step || !steps.some((s) => s.id === step)) {
        events.push(`${why}; no step to hold back`);
        continue;
      }
      this.held.set(step, { why: reply.type === "timeout" ? why : `${why} in this step`, sig: sig(step) });
      events.push(`step ${step} held back: ${why}; the kernel restarted and the recipe is sent again`);
    }
    events.push("this recipe could not be made: this is the last good picture");
    return { snapshot: this.lastGood ?? { steps: [], computes: 0, ms: 0, rssMb: 0 }, events, fresh: false };
  }

  private ask1(w: Transport, req: Request): Promise<Reply | { type: "gone"; why: string } | { type: "timeout" }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        resolve({ type: "timeout" });
      }, this.opts.timeoutMs);
      this.waiting = (r) => {
        clearTimeout(timer);
        this.waiting = null;
        if ((r.type === "done" || r.type === "answer") && r.id !== req.id) return;
        resolve(r);
      };
      if (this.exited) {
        this.waiting({ type: "gone", why: this.exited });
        return;
      }
      w.post(req);
    });
  }
}

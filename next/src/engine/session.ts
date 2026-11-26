// What the worker does with a request (E16, E17): hold one engine, run the recipe it is sent, and answer with a snapshot. Kept apart from the worker's own plumbing so it can be driven in one process.
import * as K from "./kernel.ts";
import { Engine } from "./engine.ts";
import { Body } from "./lineage.ts";
import { idKey, show } from "./id.ts";
import { NoBody } from "./steps.ts";
import { bodyVolumes } from "./scope.ts";
import { answer } from "./asks.ts";
import type { Reply, Request, Snapshot, StepSnap } from "./protocol.ts";

export class Session {
  private engine: Engine | null = null;
  private post: (r: Reply) => void;
  constructor(post: (r: Reply) => void) {
    this.post = post;
  }

  async handle(req: Request): Promise<void> {
    try {
      await K.initKernel();
      if (req.type === "ping") {
        this.post({ type: "done", id: req.id, snapshot: this.snapshot(0, 0) });
        return;
      }
      if (req.type === "ask") {
        if (!this.engine) {
          this.post({ type: "error", id: req.id, message: "no recipe is loaded" });
          return;
        }
        const data = answer(this.engine, req.ask);
        this.post({ type: "answer", id: req.id, data: JSON.parse(JSON.stringify(data)) });
        return;
      }
      const t0 = performance.now(),
        watch = (step: string) => this.post({ type: "running", step });
      let base = this.engine?.computes ?? 0;
      if (req.type === "load" || !this.engine) {
        this.engine?.release();
        this.engine = new Engine(req.steps, { forced: req.forced, watch, parameters: req.parameters });
        base = 0;
        this.engine.build();
      } else {
        this.engine.watch = watch;
        this.engine.setRecipe(req.steps, req.forced, req.parameters ?? {});
      }
      this.post({
        type: "done",
        id: req.id,
        snapshot: this.snapshot(this.engine.computes - base, performance.now() - t0),
      });
    } catch (e) {
      this.post({ type: "error", id: req.id, message: e instanceof Error ? e.message : String(e) });
    }
  }

  private snapshot(computes: number, ms: number): Snapshot {
    const steps: StepSnap[] = [],
      e = this.engine;
    if (e)
      for (const id of e.ids()) {
        const r = e.result(id),
          v = r.value;
        steps.push(
          K.scoped(() => ({
            id,
            kind: e.step(id).kind,
            status: r.status,
            fingerprint: r.fingerprint,
            notes: r.notes,
            output:
              v instanceof Body ? ("body" as const) : v instanceof NoBody ? ("empty" as const) : ("sketch" as const),
            faces:
              v instanceof Body
                ? v.faces.map((f) => {
                    const q = K.facts(f.h);
                    return {
                      id: idKey(f.id),
                      label: show(f.id),
                      alias: f.alias.map(idKey),
                      defect: f.defect,
                      type: q.type,
                      area: q.area,
                      ce: q.ce,
                      ne: q.ne,
                    };
                  })
                : [],
            bodies:
              v instanceof Body
                ? (() => {
                    const vols = bodyVolumes(v);
                    return v.bodies.map((b, i) => ({
                      id: idKey(b.id),
                      label: show(b.id),
                      alias: b.alias.map(idKey),
                      faces: b.faces.map((f) => idKey(f.id)),
                      volume: vols[i]!,
                    }));
                  })()
                : [],
            lines: e.lines(id).map((l) => ({ id: l.id, ends: l.ends ?? null, from: l.from })),
          })),
        );
      }
    return {
      steps,
      computes,
      ms,
      rssMb:
        typeof process !== "undefined" && process.memoryUsage
          ? Math.round(process.memoryUsage().rss / 1e6)
          : Math.round(
              ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6,
            ),
    };
  }
}

// Working out a wheel's sections off the page's thread (`in_899`). `attempt` runs something that needs them; if the sections are not kept it gets no answer, a worker is asked for them, and `ready` says when to try again.
import { askBeforeWorking, keepSections, SectionsNeeded } from "./operation/wheelsections.ts";
import type { Section } from "./operation/wheelsections.ts";
import type { GearSpec } from "./operation/gear.ts";
import type { Result } from "./shared/result.ts";

export interface SectionsWorker { postMessage(m: unknown): void; addEventListener(type: "message" | "error", f: (e: any) => void): void; terminate?(): void } // eslint-disable-line @typescript-eslint/no-explicit-any
const spawn = (): SectionsWorker => new Worker(new URL("./sections-worker.ts", import.meta.url), { type: "module" });
const keyOf = (spec: GearSpec): string => JSON.stringify([spec.teeth, spec.module, spec.pressure ?? 20, spec.wheel]);

export type Attempt<T> = { ok: true; value: T } | { ok: false; ready: Promise<void> };

/** `limitMs`: a worker that has not answered by then is given up and the sections are worked out in place, as they were. */
export function createWarmer(make: () => SectionsWorker = spawn, limitMs = 60000) {
  const inFlight = new Map<string, Promise<void>>();
  const gaveUp = new Set<string>(); // (specs the worker could not do: worked out in place)
  const warm = (spec: GearSpec): Promise<void> => {
    const key = keyOf(spec);
    let p = inFlight.get(key);
    if (p) return p;
    p = new Promise<void>((resolve) => {
      let w: SectionsWorker;
      const done = (r?: Result<Section[]>): void => {
        clearTimeout(timer);
        if (r) keepSections(spec, r); else gaveUp.add(key);
        try { w?.terminate?.(); } catch { /* (already gone) */ }
        inFlight.delete(key);
        resolve();
      };
      const timer = setTimeout(() => done(), limitMs);
      try {
        w = make();
        w.addEventListener("message", (e) => { if (e.data?.result) done(e.data.result as Result<Section[]>); else done(); });
        w.addEventListener("error", () => done());
        w.postMessage({ id: 1, spec });
      } catch { done(); }
    });
    inFlight.set(key, p);
    return p;
  };
  return {
    /** Run `fn`; if it needs a wheel's sections that are not kept, ask for them and say `{ ok: false, ready }`. */
    attempt<T>(fn: () => T): Attempt<T> {
      try { return { ok: true, value: askBeforeWorking((spec) => !gaveUp.has(keyOf(spec)), fn) }; }
      catch (e) {
        if (e instanceof SectionsNeeded) return { ok: false, ready: warm(e.spec) };
        throw e;
      }
    },
  };
}

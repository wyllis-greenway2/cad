// The page's end of the push worked out ahead (`in_1096`, `contact-worker.ts`): it starts the thread for a motion that is playing along the path, puts the places it sends back in the places kept for the page's own scene, and says how far they go, so the play
// never asks the page's thread to work out what the other has not yet: it waits, evenly, for the thread (`clamp`). Nothing of it is saved or shown; without a worker (a test, a browser without them) the play works its steps out itself, as before.
import type { Scene } from "./operation/scene.ts";
import type { CompileOutcome } from "./compiler/compile.ts";
import type { Motion } from "./interaction/motion.ts";
import { pathPlaces, placesExtent, SMOOTH_STEPS } from "./interaction/contact.ts";
import type { AheadReply, AheadStart } from "./contact-worker.ts";

export interface AheadWorker { postMessage(m: unknown): void; addEventListener(type: "message" | "error", f: (e: any) => void): void; terminate?(): void } // eslint-disable-line @typescript-eslint/no-explicit-any
const LIMIT_TURN = 1080, LIMIT_SLIDE = 400; // (how far ahead of the start the thread goes: three turns)

export function createAhead(make: () => AheadWorker, send: (scene: Scene, outcome: CompileOutcome | undefined, m: Motion) => AheadStart["kernel"] = (_s, o) => (o?.kernel ? { mesh: o.kernel.mesh, faces: o.kernel.faces, bodies: o.kernel.bodies } : null)) {
  let cur: { scene: Scene; outcome: CompileOutcome | undefined; motion: Motion; worker: AheadWorker; id: number; reached: number; done: boolean; jam: string | null; failed: boolean } | null = null;
  let ids = 0;
  const stop = (): void => { if (cur) { try { cur.worker.postMessage({ type: "stop" }); cur.worker.terminate?.(); } catch { /* (already gone) */ } cur = null; } };
  const same = (a: Motion, b: Motion): boolean => a.body === b.body && a.kind === b.kind && a.mate === b.mate && a.follows.length === b.follows.length && a.follows.every((f, i) => f.body === b.follows[i]!.body);
  return {
    /** Start the thread for this motion if it has none (a motion playing forward along the path, in a scene and kernel answer it has not been started for), and stop the one for another. */
    ensure(scene: Scene, outcome: CompileOutcome | undefined, m: Motion): void {
      const wanted = !!m.contact && m.playing && m.speed >= 0 && m.contact.path === true && !m.contact.jam && m.contact.target == null;
      if (cur && (cur.scene !== scene || cur.outcome !== outcome || !same(cur.motion, m))) stop();
      if (cur || !wanted) return;
      try {
        const worker = make();
        const id = ++ids;
        cur = { scene, outcome, motion: m, worker, id, reached: m.amount, done: false, jam: null, failed: false };
        const here = cur;
        worker.addEventListener("message", (e) => {
          const r = e.data as AheadReply;
          if (cur !== here || r.id !== here.id) return;
          const kept = pathPlaces(scene, outcome, m);
          if (kept) for (const [g, p] of r.places) kept.places.set(g, p);
          here.reached = r.reached; here.done = r.done; here.jam = r.jam ?? null;
        });
        worker.addEventListener("error", () => { here.failed = true; });
        worker.postMessage({ type: "start", id, scene, kernel: send(scene, outcome, m), motion: m, to: m.amount + (m.kind === "turn" ? LIMIT_TURN : LIMIT_SLIDE) } satisfies AheadStart);
      } catch { cur = null; }
    },
    /** How far the thread's places go for this motion (the driver's own unit), or null when there is no thread working for it (the play works its own steps out). A thread that has finished, or failed, no longer holds the play back. */
    extent(scene: Scene, outcome: CompileOutcome | undefined, m: Motion): number | null {
      if (!cur || cur.scene !== scene || cur.outcome !== outcome || !same(cur.motion, m) || cur.failed || cur.done) return null;
      const kept = pathPlaces(scene, outcome, m);
      return kept ? Math.max(0, placesExtent(kept) - SMOOTH_STEPS * kept.step) : null; // (the picture of a body with no joint is averaged over the places either side: the play stays that far behind what the thread has sent)
    },
    stop,
  };
}

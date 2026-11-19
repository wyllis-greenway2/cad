// The push worked out ahead of the picture, in a thread of its own (`in_1096`, `dec_contact_push`): the page hands over the scene, what the kernel made of it and the motion as it stands, and this goes on from there a few degrees at a time, sending
// back the places it has worked out (`contactahead.ts` is the other end). The page never waits for it: a play that comes to places not yet here goes slower, evenly, until they are.
import { solveContact, pathPlaces } from "./interaction/contact.ts";
import type { Place } from "./interaction/contact.ts";
import type { Motion } from "./interaction/motion.ts";
import type { Scene } from "./operation/scene.ts";
import type { CompileOutcome } from "./compiler/compile.ts";

export interface AheadStart { type: "start"; id: number; scene: Scene; kernel: unknown; motion: Motion; to: number }
export interface AheadReply { id: number; places: [number, Place][]; reached: number; done: boolean; jam?: string }
/** The work, as a function (the thread's loop and the tests both run it): from the motion as it stands to `to`, `chunk` of the driver's unit at a time; `give` is told of each new places. Returns when there is no more to do or `stopped()`. */
export async function workAhead(start: { scene: Scene; kernel: unknown; motion: Motion; to: number }, chunk: number, give: (r: Omit<AheadReply, "id">) => void, stopped: () => boolean, pause: () => Promise<void>): Promise<void> {
  const outcome = { kernel: start.kernel } as unknown as CompileOutcome;
  let m: Motion = { ...start.motion, playing: true };
  let sent = -1;
  for (;;) {
    if (stopped()) return;
    const target = Math.min(start.to, m.amount + chunk);
    m = solveContact(start.scene, { ...m, amount: target }, outcome, Infinity);
    const kept = pathPlaces(start.scene, outcome, m);
    const fresh: [number, Place][] = kept ? [...kept.places].filter(([g]) => g > sent) : [];
    if (fresh.length) sent = Math.max(...fresh.map(([g]) => g));
    const done = !!m.contact?.jam || m.amount >= start.to - 1e-9;
    give({ places: fresh, reached: m.amount, done, ...(m.contact?.jam ? { jam: m.contact.jam } : {}) });
    if (done) return;
    await pause();
  }
}

declare const WorkerGlobalScope: unknown;
if (typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof (WorkerGlobalScope as new () => unknown)) {
  let current = 0;
  (self as unknown as { onmessage: (e: MessageEvent<AheadStart | { type: "stop" }>) => void }).onmessage = (e) => {
    if (e.data.type === "stop") { current = 0; return; }
    const msg = e.data, id = (current = msg.id);
    const post = (self as unknown as { postMessage(m: unknown): void }).postMessage.bind(self);
    void workAhead(msg, msg.motion.kind === "turn" ? 5 : 2.5, (r) => post({ id, ...r }), () => current !== id, () => new Promise((r) => setTimeout(r, 0)))
      .catch((err) => post({ id, places: [], reached: 0, done: true, jam: `the work ahead failed: ${String(err)}` }));
  };
}

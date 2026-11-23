// A browser's Web Worker as the host's transport (`host-node.ts` is the same for Node).
import type { Spawn, Transport } from "./host.ts";
import type { Reply, Request } from "./protocol.ts";

export function webWorker(): Spawn {
  return () => {
    const w = new Worker(new URL("./webworker.ts", import.meta.url), { type: "module" });
    const t: Transport = {
      post: (m: Request) => w.postMessage(m),
      onMessage: (cb: (r: Reply) => void) => { w.addEventListener("message", (e) => cb(e.data as Reply)); },
      onExit: (cb: (why: string) => void) => { w.addEventListener("error", (e) => cb(`the worker stopped: ${e.message || "no message"} (${e.filename}:${e.lineno})`)); },
      terminate: () => w.terminate(),
    };
    return t;
  };
}

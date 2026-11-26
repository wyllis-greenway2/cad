// A Node worker thread as the host's transport. (A browser will make one from a Web Worker; the host does not care which.)
import { Worker } from "node:worker_threads";
import type { Spawn, Transport } from "./host.ts";
import type { Reply, Request } from "./protocol.ts";

export function nodeWorker(opts: { debug?: boolean } = {}): Spawn {
  return () => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), {
      execArgv: ["--experimental-strip-types", "--no-warnings"],
      workerData: { debug: !!opts.debug },
    });
    const t: Transport = {
      post: (m: Request) => w.postMessage(m),
      onMessage: (cb: (r: Reply) => void) => {
        w.on("message", cb);
      },
      onExit: (cb: (why: string) => void) => {
        w.on("exit", (code) => cb(`exit code ${code}`));
        w.on("error", (e: unknown) => cb(String((e as Error)?.message ?? e)));
      },
      terminate: () => {
        void w.terminate();
      },
    };
    return t;
  };
}

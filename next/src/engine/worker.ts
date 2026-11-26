// The worker's entry (Node worker thread): the kernel lives here, apart from the caller (E17). In a browser the same Session sits behind a Web Worker's `onmessage`.
import { parentPort, workerData } from "node:worker_threads";
import { Session } from "./session.ts";

if (workerData?.debug) await import("./debug-kinds.ts"); // faults for testing the host: a hang, a crash
const session = new Session((r) => parentPort!.postMessage(r));
parentPort!.on("message", (req) => {
  void session.handle(req);
});

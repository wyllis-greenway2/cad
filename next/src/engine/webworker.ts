// The worker's entry in a browser (a Web Worker): the same Session as the Node worker's, behind `onmessage`. The kernel's WebAssembly file is found by the bundler (`?url`).
import wasm from "../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm?url";
import { initKernel } from "./kernel.ts";
import { Session } from "./session.ts";

const ready = initKernel(wasm);
const session = new Session((r) => (self as unknown as { postMessage(m: unknown): void }).postMessage(r));
self.onmessage = (e: MessageEvent) => { void ready.then(() => session.handle(e.data)); };

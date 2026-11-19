// The kernel's own thread (`in_132`): the geometry kernel runs here so that a heavy model does not freeze the page while it is being worked out. It takes an operation graph,
// answers with the result, and keeps nothing between jobs. `kernel-async.ts` is the other end.
import { kernel } from "./compiler/kernel/index.ts";
import { initWeb, heapBytes } from "./compiler/kernel/occt/web.mjs";
import type { ExportQuality, KernelGraph, KernelResult, Vec } from "./compiler/kernel/adapter.ts";
import { evaluateInPieces } from "./kernel-pieces.ts";

const post = (message: unknown, transfer: Transferable[] = []) => (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(message, transfer);

const buffers = (r: KernelResult): Transferable[] => {
  const out: Transferable[] = [];
  if (r.mesh) out.push(r.mesh.vertices.buffer, r.mesh.normals.buffer, r.mesh.triangles.buffer);
  if (r.mesh?.sharp) out.push(r.mesh.sharp.buffer);
  for (const e of r.edges ?? []) out.push(e.pts.buffer);
  return out;
};

initWeb().then(
  () => post({ ready: true }),
  (e: unknown) => post({ failed: String(e) }),
);
let stopId = -1; // (the job the page has asked to stop: a newer question is waiting, `dec_progressive_open`)
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
self.onmessage = (e: MessageEvent<{ id: number; graph: KernelGraph; draft?: boolean; lite?: boolean; eye?: Vec; cancel?: number; export?: ExportQuality }>) => {
  if (e.data.cancel !== undefined) { stopId = e.data.cancel; return; }
  try {
    if (e.data.export?.step) {
      void kernel.exportStep(e.data.graph, e.data.export.bodies, e.data.export.unit).then((exported) => post({ id: e.data.id, exported }, exported.ok ? [exported.bytes.buffer] : []), (err: unknown) => post({ id: e.data.id, failed: String(err) }));
      return;
    }
    if (e.data.export) {
      void kernel.exportMesh(e.data.graph, e.data.export).then((exported) => post({ id: e.data.id, exported }, exported.ok ? [exported.vertices.buffer, exported.triangles.buffer] : []), (err: unknown) => post({ id: e.data.id, failed: String(err) }));
      return;
    }
    const started = performance.timeOrigin + performance.now(); // (the time on one clock for both threads, to tell where a trip's time went)
    kernel.draft = !!e.data.draft;
    kernel.lite = !!e.data.lite;
    const id = e.data.id;
    stopId = -1;
    // a model of many parts apart is made in pieces, nearest the eye first, and what is made so far is sent as it goes (the page draws it, and ghosts for the rest); anything else is made whole, as it always was
    if (!e.data.draft && !e.data.lite) {
      void evaluateInPieces(kernel, e.data.graph, e.data.eye, {
        partial: (r) => post({ id, partial: true, result: r }, buffers(r)),
        stopped: () => stopId === id,
        yieldNow: tick,
        now: () => performance.now(),
      }).then((r) => {
        if (r === "stopped") { post({ id, cancelled: true, heapMB: Math.round(heapBytes() / 1048576) }); return; }
        if (r === null) { try { whole(); } catch (err) { post({ id, failed: String(err) }); } return; }
        post({ id, result: r, heapMB: Math.round(heapBytes() / 1048576), at: { started, sent: performance.timeOrigin + performance.now() } }, buffers(r));
      }, (err: unknown) => post({ id, failed: String(err) }));
      return;
    }
    whole();
    function whole() {
    const result = kernel.evaluate(e.data.graph);
    post({ id: e.data.id, result, heapMB: Math.round(heapBytes() / 1048576), at: { started, sent: performance.timeOrigin + performance.now() } }, buffers(result)); // (`heapMB`: how big its memory has grown: the page restarts it when that is high and nothing waits)
    }
  } catch (err) {
    post({ id: e.data.id, failed: String(err) });
  }
};

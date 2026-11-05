// The kernel's own thread (`in_132`): the geometry kernel runs here so that a heavy model does not freeze the page while it is being worked out. It takes an operation graph,
// answers with the result, and keeps nothing between jobs. `kernel-async.ts` is the other end.
import { kernel } from "./compiler/kernel/index.ts";
import { initWeb } from "./compiler/kernel/occt/web.mjs";
import type { KernelGraph, KernelResult } from "./compiler/kernel/adapter.ts";

const post = (message: unknown, transfer: Transferable[] = []) => (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(message, transfer);

const buffers = (r: KernelResult): Transferable[] => {
  const out: Transferable[] = [];
  if (r.mesh) out.push(r.mesh.vertices.buffer, r.mesh.normals.buffer, r.mesh.triangles.buffer);
  for (const e of r.edges ?? []) out.push(e.pts.buffer);
  return out;
};

initWeb().then(
  () => post({ ready: true }),
  (e: unknown) => post({ failed: String(e) }),
);
self.onmessage = (e: MessageEvent<{ id: number; graph: KernelGraph }>) => {
  try {
    const result = kernel.evaluate(e.data.graph);
    post({ id: e.data.id, result }, buffers(result));
  } catch (err) {
    post({ id: e.data.id, failed: String(err) });
  }
};

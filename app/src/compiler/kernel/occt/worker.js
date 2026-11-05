// The OCCT kernel in a web worker, off the UI thread. Requests are processed in order; the UI coalesces during drags.
import wasmUrl from "replicad-opencascadejs/wasm?url";
import { init, evaluate } from "./evaluate.mjs";

const ready = init({ locateFile: () => wasmUrl });

self.onmessage = async ({ data }) => {
  const { id, graph, tess } = data;
  try {
    await ready;
    const result = evaluate(graph, tess);
    const { mesh } = result;
    self.postMessage({ id, ...result }, mesh ? [mesh.vertices.buffer, mesh.normals.buffer, mesh.triangles.buffer] : []);
  } catch (e) {
    self.postMessage({ id, fatal: String(e?.message ?? e) });
  }
};

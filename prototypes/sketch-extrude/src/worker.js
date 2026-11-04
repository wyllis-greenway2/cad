// Geometry runs here, off the UI thread. Requests are processed in order; the UI coalesces during drags.
import wasmUrl from "replicad-opencascadejs/wasm?url";
import { loadOC } from "./oc.mjs";
import { compile, finalSolid, volume, bounds } from "./interpreter.mjs";

const ready = loadOC({ locateFile: () => wasmUrl });

self.onmessage = async ({ data }) => {
  const { id, graph, tess } = data;
  try {
    await ready;
    const t0 = performance.now();
    const results = compile(graph);
    const ops = graph.ops.map((o) => {
      const r = results.get(o.id);
      return { id: o.id, type: o.type, error: r.error ?? null, ms: r.ms };
    });
    const fin = finalSolid(graph, results);
    let mesh = null;
    let vol = null;
    let bbox = null;
    if (fin) {
      const m = fin.shape.mesh({ tolerance: tess.tolerance, angularTolerance: tess.angular });
      mesh = { vertices: new Float32Array(m.vertices), normals: new Float32Array(m.normals), triangles: new Uint32Array(m.triangles) };
      vol = volume(fin.shape);
      bbox = bounds(fin.shape);
    }
    const msg = { id, ops, finalId: fin?.id ?? null, volume: vol, bbox, totalMs: performance.now() - t0, mesh };
    self.postMessage(msg, mesh ? [mesh.vertices.buffer, mesh.normals.buffer, mesh.triangles.buffer] : []);
  } catch (e) {
    self.postMessage({ id, fatal: String(e?.message ?? e) });
  }
};

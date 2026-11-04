// Starts the kernel in a web worker. The worker takes { id, graph, tess } and answers { id, ...result } or { id, fatal } (see README.md).
export function spawnKernel() {
  return new Worker(new URL("./occt/worker.js", import.meta.url), { type: "module" });
}

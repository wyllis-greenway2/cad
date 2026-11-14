// The one place the app gets a kernel from. To switch kernels, change this file (and the worker entry), nothing else.
import type { Kernel } from "./adapter.ts";
import { KERNEL_NAME, init, evaluate, exportMesh } from "./occt/evaluate.mjs";

export const kernel: Kernel = { name: KERNEL_NAME, init, draft: false, lite: false, evaluate: (graph, tess) => evaluate(graph, kernel.draft || kernel.lite ? { tolerance: 0.05, angular: 0.3, ...tess, ...(kernel.draft ? { draft: true } : {}), ...(kernel.lite ? { lite: true } : {}) } : tess), exportMesh: (graph, quality) => Promise.resolve(exportMesh(graph, quality)) };

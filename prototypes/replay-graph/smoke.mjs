import { makeEngine, makeRecipe } from "./engine.mjs";
import { meshKernel, occtKernel } from "./kernels.mjs";
for (const k of [meshKernel, occtKernel]) {
  const { steps } = makeRecipe(8, 7);
  const e = makeEngine(k, steps);
  const t0 = performance.now(); e.buildAll(); const dt = performance.now() - t0;
  console.log(k.name, steps.length, "steps built in", dt.toFixed(0), "ms; flagged", e.flaggedCount(), "; notes", [...new Set([...e.res.values()].filter(r=>r.flagged).map(r=>r.note))].join(" / "));
  const last = steps[steps.length-1].id; console.log("  final hash", e.res.get(last).hash);
}

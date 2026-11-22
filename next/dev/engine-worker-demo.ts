// The worker and the host by hand: node --experimental-strip-types dev/engine-worker-demo.ts
import { EngineHost } from "../src/engine/host.ts";
import { nodeWorker } from "../src/engine/host-node.ts";
import type { Outcome } from "../src/engine/host.ts";
import { P0, recipe } from "./recipe.ts";

const host = new EngineHost(nodeWorker({ debug: true }), { timeoutMs: 4000, memoryMb: 100000 });
const show = (label: string, o: Outcome) => {
  console.log(`\n${label}\n   ${o.snapshot.steps.map((s) => `${s.id}:${s.status.kind === "ok" ? "ok" : s.status.kind.toUpperCase()}`).join(" ")}   (${o.snapshot.computes} steps run, ${o.snapshot.ms.toFixed(0)} ms, kernel ${o.snapshot.rssMb} MB${o.fresh ? "" : "; LAST GOOD PICTURE"})`);
  for (const s of o.snapshot.steps) if (s.status.kind !== "ok") console.log(`      ${s.id}: ${"why" in s.status ? s.status.why : ""}`);
  for (const e of o.events) console.log(`   · ${e}`);
};
let steps = recipe(P0);
let t0 = performance.now(); show("load the recipe (the worker starts, the kernel loads)", await host.load(steps)); console.log(`   ${(performance.now() - t0).toFixed(0)} ms in all`);
steps = steps.map((s) => (s.id === "C" ? { ...s, params: { ...s.params, t: 9 } } : s));
t0 = performance.now(); show("the tower is taller: an incremental edit in the same worker", await host.apply(steps)); console.log(`   ${(performance.now() - t0).toFixed(0)} ms in all`);

// a step that hangs, after B: put in with the chain
const hang = { id: "H", kind: "debugHang", params: { ms: 60000 }, inputs: ["B"] };
const withHang = steps.flatMap((s) => (s.id === "B" ? [s, hang] : [s])).map((s) => (s.id === "C" ? { ...s, inputs: ["H"] } : s));
t0 = performance.now(); show("a step that never finishes, in the chain (time limit 4 s)", await host.apply(withHang)); console.log(`   ${(performance.now() - t0).toFixed(0)} ms in all`);
show("the same recipe again: the held step stays held, the rest is answered at once", await host.apply(withHang));
const fixed = withHang.map((s) => (s.id === "H" ? { ...s, params: { ms: 0 } } : s));
show("the step is changed (no hang): it is tried again", await host.apply(fixed));

// a step that takes the kernel down
const crash = { id: "X", kind: "debugCrash", params: {}, inputs: ["D"] };
show("a step that stops the kernel (a crash or out of memory), before E", await host.apply([...fixed.slice(0, 7), crash, ...fixed.slice(7).map((s) => (s.id === "E" ? { ...s, inputs: ["X"] } : s))]));
show("a recipe that is not valid (a step before the one it works on): refused, the picture stays", await host.apply([crash, ...fixed]));
host.dispose();

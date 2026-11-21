// One body, one long chain of features: the case a dependency graph cannot shorten. How does a replay grow with the chain and the body?
import { makeEngine } from "./engine.mjs";
import { meshKernel, occtKernel } from "./kernels.mjs";
const which = process.argv[2] ?? "mesh", kernel = which === "occt" ? occtKernel : meshKernel;
const sizes = (process.argv[3] ?? "50,100,200,400").split(",").map(Number);
let a = 7; const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
console.log(`kernel: ${kernel.name}`);
console.log("steps | build total | per step, first 10 | per step, last 10 | replay after editing step 1 | replay after editing the last step");
for (const n of sizes) {
  const steps = [{ id: "s0", kind: "box", params: { x: 0, w: 300, h: 300, d: 10 }, inputs: [] }];
  for (let j = 1; j < n; j++) steps.push(j % 3 === 0
    ? { id: `s${j}`, kind: "boss", params: { x: 5 + rnd() * 280, y: 5 + rnd() * 280, w: 6, h: 6, t: 2, d: 10 }, inputs: [`s${j - 1}`] }
    : { id: `s${j}`, kind: "hole", params: { x: 5 + rnd() * 290, y: 5 + rnd() * 290, r: 1 + rnd() * 2, d: 10 }, inputs: [`s${j - 1}`] });
  const e = makeEngine(kernel, steps);
  const times = [];
  const orig = e.edit; void orig;
  let t0 = performance.now(); e.buildAll(); const build = performance.now() - t0;
  // time per step from a second full replay with per-step timing
  const per = []; for (let j = 0; j < n; j++) { const t = performance.now(); e.byId.get(`s${j}`).params = { ...e.byId.get(`s${j}`).params }; e.edit(`s${j}`, "graph"); per.push(performance.now() - t); if (j >= 10 && j < n - 10) { /* only the head and tail are shown */ } break; }
  // replay cost of editing the first step, and the last
  e.byId.get("s0").params.w = 310; const r1 = e.edit("s0", "graph");
  e.byId.get(`s${n - 1}`).params.r = 2.5; const r2 = e.edit(`s${n - 1}`, "graph");
  // per-step cost at the head and the tail of a full replay: edit step 1 and time each recomputed step by wrapping the kernel
  const cost = []; const wrapped = { ...kernel, run: (k, p, i) => { const t = performance.now(); const v = kernel.run(k, p, i); cost.push(performance.now() - t); return v; }, hash: (v) => { const t = performance.now(); const h = kernel.hash(v); cost[cost.length - 1] += performance.now() - t; return h; } }; // (Manifold evaluates a boolean lazily: the work shows up when the answer is first asked for, so the hash is timed with its step)
  const e2 = makeEngine(wrapped, steps); e2.buildAll();
  const head = cost.slice(1, 11).reduce((s, x) => s + x, 0) / 10, tail = cost.slice(-10).reduce((s, x) => s + x, 0) / 10;
  console.log(`${String(n).padStart(5)} | ${(build / 1000).toFixed(2).padStart(7)} s | ${head.toFixed(1).padStart(7)} ms | ${tail.toFixed(1).padStart(7)} ms | ${(r1.ms / 1000).toFixed(2)} s (${r1.computes} steps) | ${r2.ms.toFixed(0)} ms (${r2.computes} step)`);
  e.dispose(); e2.dispose();
}

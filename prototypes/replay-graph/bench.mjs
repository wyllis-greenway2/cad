import { makeEngine, makeRecipe } from "./engine.mjs";
import { meshKernel, occtKernel } from "./kernels.mjs";
const which = process.argv[2] ?? "mesh", sizes = (process.argv[3] ?? "10x10,20x15,40x25").split(",").map((s) => s.split("x").map(Number));
const kernel = which === "occt" ? occtKernel : meshKernel;
const DRAG = Number(process.argv[4] ?? 10);
const patchFor = (s, k) => (s.kind === "hole" ? { r: s.params.r + 0.01 * k } : s.kind === "boss" ? { t: 3 + 0.01 * k } : s.kind === "fillet" ? { r: 0.5 + 0.01 * k } : { w: 40 + 0.01 * k });
const f = (n) => n.toFixed(0).padStart(6);
console.log(`kernel: ${kernel.name}; drag = ${DRAG} edits`);
for (const [B, per] of sizes) {
  console.log(`\n=== ${B} bodies x ${per} steps  (${makeRecipe(B, per).steps.length} steps in all)`);
  console.log("mode    | build ms | E1 first step, body 0 | E2 last step, last body | E3 middle step, middle body | E4 no-op change | E5 drag, per edit");
  for (const mode of ["flat", "graph", "cutoff"]) {
    const { steps, chains } = makeRecipe(B, per);
    const e = makeEngine(kernel, steps);
    const rss0 = process.memoryUsage().rss;
    let t0 = performance.now(); e.buildAll(); const build = performance.now() - t0;
    const rss1 = process.memoryUsage().rss;
    const set = (id, patch) => Object.assign(e.byId.get(id).params, patch);
    const row = [];
    const run = (id, patch) => { set(id, patch); return e.edit(id, mode); };
    // E1
    let r = run(chains[0][0].id, { w: 44 }); row.push(`${String(r.computes).padStart(4)} steps ${f(r.ms)} ms`);
    // E2: last step of the last body (a fillet or boss or hole)
    const last = chains[B - 1][per - 1]; r = run(last.id, patchFor(last, 3)); row.push(`${String(r.computes).padStart(4)} steps ${f(r.ms)} ms`);
    // E3
    const mid = chains[Math.floor(B / 2)][Math.floor(per / 2)]; r = run(mid.id, patchFor(mid, 5)); row.push(`${String(r.computes).padStart(4)} steps ${f(r.ms)} ms`);
    // E4: a hole of body 1 moved far outside the body (changes the answer), then its radius changed while outside (does not)
    const hole = chains[1][1]; set(hole.id, { x: 500 }); e.edit(hole.id, mode); r = run(hole.id, { r: hole.params.r + 0.3 }); row.push(`${String(r.computes).padStart(4)} steps ${f(r.ms)} ms`);
    // E5: a drag of the middle step
    let tot = 0, n = 0; for (let k = 0; k < DRAG; k++) { const q = run(mid.id, patchFor(mid, 10 + k)); tot += q.ms; n += q.computes; }
    row.push(`${String((n / DRAG).toFixed(0)).padStart(4)} steps ${f(tot / DRAG)} ms`);
    console.log(`${mode.padEnd(7)} | ${f(build)} | ${row.join(" | ")}   (flagged ${e.flaggedCount()}, rss +${((rss1 - rss0) / 1e6).toFixed(0)} MB for ${steps.length} cached results)`);
    e.dispose();
  }
}

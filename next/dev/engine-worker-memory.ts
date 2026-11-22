// The memory budget by hand: edit the recipe again and again against a low budget; the host restarts the worker between requests, the recipe is sent again,
// and the answers stay the same across the restart.  node --experimental-strip-types dev/engine-worker-memory.ts [budget MB]
import { EngineHost } from "../src/engine/host.ts";
import { nodeWorker } from "../src/engine/host-node.ts";
import { P0, recipe } from "./recipe.ts";

const budget = Number(process.argv[2] ?? 420), host = new EngineHost(nodeWorker(), { timeoutMs: 30000, memoryMb: budget });
const fp = (o: Awaited<ReturnType<EngineHost["load"]>>) => o.snapshot.steps.map((s) => s.fingerprint).join("|");
const seen = new Map<number, string>(); let restarts = 0, edits = 0;
console.log(`budget ${budget} MB`);
const first = await host.load(recipe(P0)); seen.set(P0.t, fp(first)); console.log(`  load: kernel ${first.snapshot.rssMb} MB`);
for (let i = 0; i < 60 && restarts < 3; i++) {
  const t = [5, 6, 7, 8, 9][i % 5]!, steps = recipe({ ...P0, t });
  const o = await host.apply(steps); edits++;
  const same = seen.has(t) ? seen.get(t) === fp(o) : (seen.set(t, fp(o)), true);
  const restarted = o.events.some((e) => e.includes("restarted"));
  if (restarted) restarts++;
  if (restarted || i % 8 === 0) console.log(`  edit ${String(edits).padStart(2)} (t=${t}): kernel ${String(o.snapshot.rssMb).padStart(3)} MB, ${o.snapshot.computes} steps run${restarted ? "  <- " + o.events[0] : ""}${same ? "" : "   ANSWER DIFFERS FROM THE SAME RECIPE BEFORE"}`);
  if (!same) { console.log("  FAILED: the answers changed across a restart"); process.exit(1); }
}
console.log(`${edits} edits, ${restarts} restarts, every answer the same as for the same recipe earlier`);
host.dispose();

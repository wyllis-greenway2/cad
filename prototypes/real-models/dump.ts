// Stage 1 of the converter (in the old app): one model's kernel operation list and what the old kernel made of it, as a plain file.   node dump.ts <fixture.cad.json>
import { readFileSync, writeFileSync } from "node:fs";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { openSession } from "../../app/src/interaction/session.ts";
import { buildGraph } from "../../app/src/compiler/graph.ts";
await kernel.init();
const f = process.argv[2]!, o: any = openSession(kernel, readFileSync(new URL(`../../app/test/fixtures/${f}`, import.meta.url), "utf8"));
if (!o.ok) { console.log(f, "did not open"); process.exit(0); }
const g = buildGraph(o.value.history.scene).graph; if (!g.ops.length) process.exit(0);
const t0 = performance.now(), r: any = kernel.evaluate(JSON.parse(JSON.stringify(g)));
const out = { name: f.replace(".cad.json", ""), graph: g, old: { volume: r.volume, bbox: r.bbox, bodies: (r.bodies ?? []).map((b: any) => ({ min: b.min, max: b.max, volume: b.volume })), errors: r.ops.filter((x: any) => x.error).map((x: any) => [x.id, x.type, String(x.error).slice(0, 120)]), ms: Math.round(performance.now() - t0) } };
writeFileSync(new URL(`./dump/${out.name}.json`, import.meta.url), JSON.stringify(out));
console.log(`${out.name}: ${g.ops.length} ops, volume ${r.volume?.toFixed?.(3)}, ${out.old.bodies.length} bodies, ${out.old.errors.length} errors`);

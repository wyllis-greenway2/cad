import { readFileSync } from "node:fs";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { openSession } from "../../app/src/interaction/session.ts";
import { buildGraph } from "../../app/src/compiler/graph.ts";
await kernel.init();
const f = process.argv[2]!;
const o: any = openSession(kernel, readFileSync(new URL(`../../app/test/fixtures/${f}`, import.meta.url), "utf8"));
const g = buildGraph(o.value.history.scene).graph;
const seen = new Set<string>();
for (const op of g.ops) { const k = op.type + ":" + (op.mode ?? ""); if (seen.has(k)) continue; seen.add(k); console.log(JSON.stringify(op).slice(0, 900)); console.log(); }

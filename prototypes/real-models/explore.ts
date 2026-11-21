import { readFileSync } from "node:fs";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { openSession } from "../../app/src/interaction/session.ts";
import { buildGraph } from "../../app/src/compiler/graph.ts";
await kernel.init();
const name = process.argv[2] ?? "hollow-pushed.cad.json";
const o = openSession(kernel, readFileSync(new URL(`../../app/test/fixtures/${name}`, import.meta.url), "utf8"));
if (!o.ok) { console.log("open failed", o); process.exit(1); }
const s = o.value; const g = buildGraph(s.history.scene);
console.log(name, "ops", g.graph.ops.length, "params", Object.keys(g.graph.params).length, "errors", Object.keys(g.errors).length);
for (const op of g.graph.ops.slice(0, 12)) console.log(JSON.stringify(op).slice(0, 260));
console.log("types:", [...new Set(g.graph.ops.map((o: any) => o.type))].join(" "));

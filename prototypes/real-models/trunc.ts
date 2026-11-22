// what the old kernel makes of a model's first n operations: node trunc.ts <model> <last op id>
import { readFileSync } from "node:fs";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
await kernel.init();
const d = JSON.parse(readFileSync(new URL(`./dump/${process.argv[2]}.json`, import.meta.url), "utf8")), last = process.argv[3]!;
const i = d.graph.ops.findIndex((o: any) => o.id === last), g = { ...d.graph, ops: d.graph.ops.slice(0, i + 1) };
const r: any = kernel.evaluate(JSON.parse(JSON.stringify(g)));
console.log(process.argv[2], "up to", last, "volume", r.volume?.toFixed?.(4), "bbox", JSON.stringify(r.bbox), "errors", JSON.stringify(r.ops.filter((o: any) => o.error).map((o: any) => [o.id, o.error])), "bodies", (r.bodies ?? []).length);

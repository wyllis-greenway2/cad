// What the old app's operations are, across the human's saved models: kinds, modes, which fields, how many models use each.
import { readFileSync, readdirSync } from "node:fs";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { openSession } from "../../app/src/interaction/session.ts";
import { buildGraph } from "../../app/src/compiler/graph.ts";
await kernel.init();
const dir = new URL("../../app/test/fixtures/", import.meta.url);
const count = new Map<string, number>(), models = new Map<string, Set<string>>(), fields = new Map<string, Map<string, number>>(), perModel = new Map<string, string[]>();
let total = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".cad.json")).sort()) {
  let g: any; try { const o: any = openSession(kernel, readFileSync(new URL(f, dir), "utf8")); if (!o.ok) continue; g = buildGraph(o.value.history.scene).graph; } catch { continue; }
  if (!g.ops.length) continue; total++;
  const kinds: string[] = [];
  for (const op of g.ops) {
    const k = op.mode ? `${op.type}:${op.mode}` : op.type; kinds.push(k);
    count.set(k, (count.get(k) ?? 0) + 1); (models.get(k) ?? models.set(k, new Set()).get(k)!).add(f);
    const fm = fields.get(op.type) ?? fields.set(op.type, new Map()).get(op.type)!; for (const key of Object.keys(op)) fm.set(key, (fm.get(key) ?? 0) + 1);
  }
  perModel.set(f, kinds);
}
console.log(`${total} models with operations\n`);
for (const [k, n] of [...count].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(4)} ops in ${String(models.get(k)!.size).padStart(3)} models   ${k}`);
console.log("\nfields by type:"); for (const [t, fm] of fields) console.log(`  ${t.padEnd(12)} ${[...fm].map(([k, n]) => `${k}:${n}`).join(" ")}`);
const only = (set: string[]) => [...perModel].filter(([, ks]) => ks.every((k) => set.includes(k.split(":")[0]!))).length;
console.log("\nmodels made only of: sketch+extrude", only(["sketch", "extrude"]), "| + edgeMod", only(["sketch", "extrude", "edgeMod"]), "| + transform", only(["sketch", "extrude", "edgeMod", "transform"]), "| + faceExtrude", only(["sketch", "extrude", "edgeMod", "transform", "faceExtrude"]));

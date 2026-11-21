// Run the first slice by hand: node --experimental-strip-types dev/engine-demo.ts
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { show } from "../src/engine/id.ts";
import { P0, recipe } from "./recipe.ts";

await initKernel();
const e = new Engine(recipe(P0));
let t0 = performance.now(); e.build(); console.log(`built ${e.ids().length} steps in ${(performance.now() - t0).toFixed(0)} ms`);
const dump = () => {
  for (const id of e.ids()) {
    const r = e.result(id), v = r.value;
    console.log(`  ${id.padEnd(4)} ${r.status.kind.padEnd(8)}${"why" in r.status ? " " + r.status.why : ""}  ${v instanceof Body ? v.faces.length + " faces" : "kind" in v ? (v as any).lines.length + " lines" : "empty"}${r.notes.length ? "  [" + r.notes.map((n) => n.kind).join(",") + "]" : ""}`);
  }
};
dump();
const last = e.result("E").value as Body;
console.log("final faces:"); for (const f of last.faces) console.log("   ", show(f.id), f.alias.length ? "(= " + f.alias.map(show).join(", ") + ")" : "", f.defect ? "DEFECT" : "");
console.log("lines:", e.lines("E").length, "(body edges) +", e.lines("sk1").length, "(sketch)");
const edits: [string, string, (p: any) => any][] = [
  ["the line moves to 20 from the right", "sk1", (p) => ({ ...p, lines: [{ from: { ...p.lines[0].from, dist: 20 } }] })],
  ["the body is wider (60)", "sk0", () => ({ points: [[0, 0], [60, 0], [60, 30], [0, 30]] })],
  ["the tower is taller (9)", "C", (p) => ({ ...p, t: 9 })],
  ["a line that crosses nothing (off 45)", "sk1", (p) => ({ ...p, lines: [{ from: { ...p.lines[0].from, dist: 45 } }] })],
];
for (const [label, id, f] of edits) {
  const r = e.edit(id, f(e.step(id).params)); console.log(`\n${label}: recomputed ${r.recomputed.join(" ")}; changed ${r.changed.join(" ")}`); dump();
}
e.release();

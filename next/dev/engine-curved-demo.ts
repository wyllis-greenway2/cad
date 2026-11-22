// The curved step kinds by hand: node --experimental-strip-types dev/engine-curved-demo.ts
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { show } from "../src/engine/id.ts";
import { C0, families } from "./curved-recipe.ts";
import * as K from "../src/engine/kernel.ts";

await initKernel();
for (const [name, make] of Object.entries(families)) {
  const e = new Engine(make(C0)); e.build();
  console.log(`\n${name}: ${e.ids().map((id) => `${id}:${e.result(id).status.kind}`).join(" ")}`);
  for (const id of e.ids()) { const r = e.result(id); if (r.status.kind !== "ok") console.log(`   ${id}: ${"why" in r.status ? r.status.why : ""}`); }
  const last = e.result(e.ids()[e.ids().length - 1]!).value;
  if (last instanceof Body) for (const f of last.faces) { const q = K.facts(f.h); console.log(`   ${q.type.padEnd(9)} ${show(f.id)}${f.alias.length ? " (= " + f.alias.map(show).join(", ") + ")" : ""}${f.defect ? "  DEFECT" : ""}`); }
  e.release();
}

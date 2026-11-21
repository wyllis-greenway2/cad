// Structural edits by hand: node --experimental-strip-types dev/engine-structure-demo.ts
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { idKey } from "../src/engine/id.ts";
import { P0, recipe } from "./recipe.ts";

await initKernel();
const fresh = () => { const e = new Engine(recipe(P0)); e.build(); return e; };
const faces = (e: Engine, id: string) => { const v = e.result(id).value; return v instanceof Body ? v.faces.map((f) => idKey(f.id)).sort() : []; };
const line = (e: Engine) => e.ids().map((id) => `${id}:${e.result(id).status.kind === "ok" ? "ok" : e.result(id).status.kind.toUpperCase()}`).join(" ");
const why = (e: Engine) => e.ids().filter((i) => e.result(i).status.kind !== "ok").map((i) => { const s = e.result(i).status; return `      ${i}: ${"why" in s ? s.why : ""}`; }).join("\n");
const show = (label: string, e: Engine, ch?: { recomputed: string[]; changed: string[] }) => console.log(`\n${label}\n   ${line(e)}${ch ? `\n   recomputed ${ch.recomputed.join(" ") || "-"}; changed ${ch.changed.join(" ") || "-"}` : ""}${why(e) ? "\n" + why(e) : ""}`);

let e = fresh(); const before = faces(e, "E"); show("the recipe as made", e);
show("take out D (the dimension): the fillet after it now works on C", e, (e.remove("D"), { recomputed: [], changed: [] }));
e.release(); e = fresh();
let ch = e.remove("B"); show("take out B (the imprint): the region C pulled up is no longer there", e, ch);
e.release(); e = fresh();
ch = e.insert({ id: "T", kind: "turn", params: { axis: [0.3, 0.5, 0.8], deg: 37 }, inputs: ["A"] }, { after: "A", splice: true });
show("put a turn of 37 degrees in after A, in the chain: everything after works on the turned body", e, ch);
console.log(`   the final faces keep their ids through the turn: ${JSON.stringify(faces(e, "E")) === JSON.stringify(before) ? "yes (same ids as before)" : "NO"}`);
e.release(); e = fresh();
ch = e.swapWithInput("D"); show("do D (the dimension) before C (the region): the two change places", e, ch);
e.release(); e = fresh();
try { e.move("E", "B"); } catch (x) { console.log(`\nmove E to just after B: refused (${(x as Error).message}); the recipe is as it was: ${line(e)}`); }
e.edit("E", { ...e.step("E").params, r: 12 }); show("a fillet of 12 (too big)", e);
const t = e.trySwap("E"); console.log(`   would doing E before D help? ${t.worked ? "yes" : "no"} (steps not ok: ${t.now} now, ${t.after} after)${t.why ? "; E then: " + t.why : ""}`);
e.release();

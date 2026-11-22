// A dev check (not a test, `in_1444`): random structural edits (put a step in, take one out, move one, swap one with its input) and number edits, with the engine's promises checked after each.
//   node --experimental-strip-types dev/engine-structure.ts [sequences] [seed]
// 1. incremental equals fresh: the engine's answers equal those of an engine built in one go from the same recipe (the diff and the cutoff are sound), whatever the edit did
// 2. a refused edit (a step put before its input) changes nothing
// 3. nothing escapes; a step that is not ok says why; no ok step has a face without an id; no two faces of a body share an id
// 4. the same recipe built twice gives the same answers (pure)
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { edgeRef, idKey, mint, piece } from "../src/engine/id.ts";
import { kinds, type Step } from "../src/engine/steps.ts";
import { P0, recipe } from "./recipe.ts";

await initKernel();
const N = Number(process.argv[2] ?? 8), seed0 = Number(process.argv[3] ?? 1), OPS = 12;
let s = seed0; const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const line = (i: number) => mint("sk0", "line", i), top = mint("A", "end"), side = (i: number) => mint("A", "side", line(i));

/** a new body step to put in: what a person might add, working on `input` */
function newStep(id: string, input: string): Step {
  switch (pick(["turn", "push", "fillet", "dimension", "push", "turn"])) {
    case "turn": return { id, kind: "turn", params: { axis: pick([[0, 0, 1], [0.3, 0.5, 0.8], [1, 0, 0]]), deg: pick([10, 37, 90]) }, inputs: [input] };
    case "push": return { id, kind: "push", params: { face: pick([side(0), side(1), side(2), side(3), top]), dist: pick([2, 5, -2, -4, 12]) }, inputs: [input] };
    case "fillet": return { id, kind: "round", params: { edges: [edgeRef(pick([top, piece(top, 0)]), pick([side(0), side(1), side(2), side(3)]))], size: pick([0.5, 1.5, 4, 9]) }, inputs: [input] };
    default: return { id, kind: "dimension", params: { a: side(3), b: side(1), value: pick([30, 50, 80]) }, inputs: [input] };
  }
}
const bodySteps = (e: Engine) => e.recipe().filter((st) => kinds[st.kind]?.outputs === "body");
const numeric = (e: Engine): { id: string; key: string }[] => e.recipe().flatMap((st) => Object.entries(st.params).filter(([, v]) => typeof v === "number").map(([key]) => ({ id: st.id, key })));

const tally: Record<string, number> = {}, ops: Record<string, number> = {}; const bad: string[] = []; let checks = 0, ms = 0;
const status = (e: Engine) => e.ids().map((id) => { const r = e.result(id); return `${id}:${r.status.kind}:${"why" in r.status ? r.status.why : ""}:${r.fingerprint}`; });
for (let n = 0; n < N; n++) {
  const e = new Engine(recipe(P0)); e.build(); let counter = 0;
  for (let k = 0; k < OPS; k++) {
    const label = `sequence ${n} op ${k}`, kind = pick(["insert", "insert", "remove", "move", "swap", "number"]), before = JSON.stringify(e.recipe()), t0 = performance.now();
    let refused = "";
    try {
      if (kind === "insert") { const after = pick(bodySteps(e)).id; e.insert(newStep(`X${++counter}`, after), { after, splice: rnd() < 0.7 }); }
      else if (kind === "remove") { const ids = e.ids().filter((i) => i !== "sk0"); e.remove(pick(ids)); }
      else if (kind === "move") { const ids = e.ids(); e.move(pick(ids), rnd() < 0.1 ? null : pick(ids)); }
      else if (kind === "swap") { e.swapWithInput(pick(bodySteps(e)).id); }
      else { const t = pick(numeric(e)); const st = e.step(t.id); e.edit(t.id, { ...st.params, [t.key]: (st.params[t.key] as number) * pick([0.5, 0.8, 1.2, 2]) }); }
    } catch (x) { refused = x instanceof Error ? x.message : String(x); }
    ms += performance.now() - t0; checks++;
    if (refused) {
      // a refusal is a clear sentence, and the engine is as it was
      ops[`${kind} refused`] = (ops[`${kind} refused`] ?? 0) + 1;
      if (JSON.stringify(e.recipe()) !== before) bad.push(`${label}: ${kind} was refused (${refused}) but changed the recipe`);
      if (/undefined|Cannot read|\[object/.test(refused)) bad.push(`${label}: ${kind} failed with an engine error, not a refusal: ${refused}`);
    } else ops[kind] = (ops[kind] ?? 0) + 1;
    for (const id of e.ids()) {
      const r = e.result(id); tally[r.status.kind] = (tally[r.status.kind] ?? 0) + 1;
      if (r.status.kind !== "ok" && !("why" in r.status && r.status.why)) bad.push(`${label}: ${id} is ${r.status.kind} with no reason`);
      if (r.status.kind === "flagged" && /undefined|Cannot read|\[object/.test((r.status as { why: string }).why)) bad.push(`${label}: ${id} was flagged by an engine error: ${(r.status as { why: string }).why}`);
      if (r.value instanceof Body) { const seen = new Set<string>(); for (const f of r.value.faces) { const key = idKey(f.id); if (seen.has(key)) bad.push(`${label}: ${id} has two faces with the id ${key}` + (process.env.DBG ? " RECIPE " + JSON.stringify(e.recipe().map((s) => [s.id, s.kind, s.params, s.inputs])) : "")); seen.add(key); if (f.defect && r.status.kind === "ok" && process.env.DEBUG_DEFECT && !globalThis.__dumped) { (globalThis as any).__dumped = true; const K = await import("../src/engine/kernel.ts"); console.log("RECIPE", e.recipe().map((st) => `${st.id}:${st.kind}(${st.inputs.join(",")})`).join("  ")); const ed = r.value.edges(); for (const g of r.value.faces) { const q = K.facts(g.h); console.log(g.defect ? "  DEFECT" : "        ", q.type.padEnd(9), "area", q.area.toFixed(2).padStart(8), "centre", q.ce.map((v) => v.toFixed(2)).join(","), "next to", ed.filter((x) => x.faces.includes(g)).flatMap((x) => x.faces.filter((h) => h !== g).map((h) => h.defect ? "?" : h.id.step + "." + h.id.role)).join(" ")); } }
      if (f.defect && r.status.kind === "ok") bad.push(`${label}: ${id} (${e.step(id).kind} ${JSON.stringify(e.step(id).params).slice(0, 110)}) is ok but a face has no id; notes: ${r.value.notes.filter((x) => x.kind === "defect" || x.kind === "dropped").map((x) => x.text).join(" | ").slice(0, 200)}`); } }
    }
    const fresh = new Engine(e.recipe()); fresh.build();
    const a = status(e), b = status(fresh);
    if (a.join("\n") !== b.join("\n")) { const i = a.findIndex((x, j) => x !== b[j]), x = a[i]!, y = b[i]!; let c = 0; while (c < x.length && x[c] === y[c]) c++; bad.push(`${label}: after ${kind}${refused ? " (refused)" : ""}, the edited engine and a fresh one differ at ${e.ids()[i]} (${e.step(e.ids()[i]!).kind}) from character ${c}\n      edited: ...${x.slice(Math.max(0, c - 60), c + 110)}\n      fresh:  ...${y.slice(Math.max(0, c - 60), c + 110)}`); }
    if (k % 3 === 0) { const again = new Engine(e.recipe()); again.build(); if (status(again).join("\n") !== b.join("\n")) bad.push(`${label}: the same recipe built twice differs`); again.release(); }
    fresh.release();
  }
  e.release();
}
console.log(`${N} sequences, ${checks} structural edits, ${(ms / Math.max(1, checks)).toFixed(0)} ms per edit; ops ${JSON.stringify(ops)}`);
console.log("statuses over all checks:", JSON.stringify(tally));
console.log(bad.length ? `${bad.length} VIOLATIONS:\n  ` + bad.slice(0, 10).join("\n  ") : "no violation");
process.exit(bad.length ? 1 : 0);

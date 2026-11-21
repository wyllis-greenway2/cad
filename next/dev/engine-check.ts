// A dev check (not a test: the human has not approved the engine yet, `in_1444`): random edits of the first slice's recipe, with the engine's own promises checked after every one.
//   node --experimental-strip-types dev/engine-check.ts [sequences] [seed]
// 1. incremental equals fresh: after any run of edits, every step's answer equals the answer of an engine built from the same recipe in one go (the cutoff is sound)
// 2. the same recipe built twice gives the same answers and the same ids (steps are pure)
// 3. nothing escapes: no exception leaves the engine; a step that is not ok says why; the model is shown (a body, not nothing) whenever the first body step is fine
// 4. no face of an ok step is without an id (a defect); no two faces of a body share an id
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { idKey } from "../src/engine/id.ts";
import { P0, recipe, type P } from "./recipe.ts";

await initKernel();
const N = Number(process.argv[2] ?? 60), seed0 = Number(process.argv[3] ?? 1);
let s = seed0; const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
// numbers that a person might type, and some a person should not: zero, huge, a line past the edge, a fillet bigger than the face
const choose: Record<keyof P, number[]> = { w: [10, 20, 30, 40, 60, 90], h: [10, 20, 30, 44], d: [2, 5, 8, 12, 20], off: [0, 3, 6, 12, 20, 38, 45], t: [1, 5, 9, 14], width: [20, 35, 50, 70, 100], r: [0.3, 1.5, 3, 6, 12] };
const keys = Object.keys(choose) as (keyof P)[];

const tally: Record<string, number> = {}; const bad: string[] = []; let edits = 0, steps = 0, ms = 0;
const status = (e: Engine) => e.ids().map((id) => { const r = e.result(id); return `${id}:${r.status.kind}:${"why" in r.status ? r.status.why : ""}:${r.fingerprint}`; });
function invariants(e: Engine, label: string, p: P) {
  for (const id of e.ids()) {
    const r = e.result(id); tally[r.status.kind] = (tally[r.status.kind] ?? 0) + 1; steps++;
    if (r.status.kind !== "ok" && !("why" in r.status && r.status.why)) bad.push(`${label}: ${id} is ${r.status.kind} with no reason`);
    if (r.value instanceof Body) {
      const keysSeen = new Set<string>();
      for (const f of r.value.faces) { const k = idKey(f.id); if (keysSeen.has(k)) bad.push(`${label}: ${id} has two faces with the id ${k}`); keysSeen.add(k); if (f.defect && r.status.kind === "ok") bad.push(`${label}: ${id} is ok but a face has no id`); }
    }
  }
  if (e.result("A").status.kind === "ok" && !(e.result("E").value instanceof Body)) bad.push(`${label}: A is fine but the model is blank at E (${JSON.stringify(p)})`);
}
for (let n = 0; n < N; n++) {
  const p: P = { ...P0 }, e = new Engine(recipe(p));
  try { e.build(); } catch (x) { bad.push(`sequence ${n}: build threw ${String(x)}`); continue; }
  invariants(e, `sequence ${n} build`, p);
  for (let k = 0; k < 6; k++) {
    const q: P = { ...p }; for (let j = 0; j < 1 + Math.floor(rnd() * 2); j++) { const key = pick(keys); q[key] = pick(choose[key]); }
    const next = recipe(q), t0 = performance.now();
    try { for (const st of next) if (JSON.stringify(st.params) !== JSON.stringify(e.step(st.id).params)) e.edit(st.id, st.params); } catch (x) { bad.push(`sequence ${n} edit ${k}: threw ${String(x)} (${JSON.stringify(q)})`); break; }
    ms += performance.now() - t0; edits++; Object.assign(p, q);
    invariants(e, `sequence ${n} edit ${k}`, p);
    // 1. incremental equals fresh
    const fresh = new Engine(recipe(p)); fresh.build();
    const a = status(e), b = status(fresh);
    if (a.join("\n") !== b.join("\n")) { const i = a.findIndex((x, j) => x !== b[j]); bad.push(`sequence ${n} edit ${k}: the edited engine and a fresh one differ at ${e.ids()[i]} (${JSON.stringify(p)})\n      edited: ${a[i]!.slice(0, 160)}\n      fresh:  ${b[i]!.slice(0, 160)}`); }
    // 2. purity: a second fresh build equals the first
    const again = new Engine(recipe(p)); again.build(); if (status(again).join("\n") !== b.join("\n")) bad.push(`sequence ${n} edit ${k}: the same recipe built twice differs (${JSON.stringify(p)})`);
    fresh.release(); again.release();
  }
  e.release();
}
console.log(`${N} sequences, ${edits} edits, ${steps} step results checked; ${(ms / Math.max(1, edits)).toFixed(0)} ms per edit (all its steps)`);
console.log("statuses:", JSON.stringify(tally));
console.log(bad.length ? `${bad.length} VIOLATIONS:\n  ` + bad.slice(0, 12).join("\n  ") : "no violation");
process.exit(bad.length ? 1 : 0);

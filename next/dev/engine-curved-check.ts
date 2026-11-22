// A dev check (not a test, `in_1444`): random number edits of the curved recipes, with the engine's promises checked after each, and the meaning of the ids (what spike 6 checked by hand):
// after an edit, does `R.side(line 1)` still name the outer cylinder, does `L.end` still name the top?
//   node --experimental-strip-types dev/engine-curved-check.ts [sequences] [seed]
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { idKey, mint, type Id } from "../src/engine/id.ts";
import { C0, families, type C } from "./curved-recipe.ts";

await initKernel();
const N = Number(process.argv[2] ?? 8), seed0 = Number(process.argv[3] ?? 1);
let s = seed0; const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const choose: { [k in keyof C]: readonly C[k][] } = {
  r1: [6, 10, 14], h1: [3, 6, 9, 14], r2: [3, 6, 9, 12], H: [8, 12, 18], deg: [360, 360, 270, 90], w1: [14, 20, 30], d1: [6, 10, 14], w2: [8, 12, 20, 30], d2: [4, 6, 12], dx: [0, 3, 6], LH: [8, 15, 25], ruled: [false, false, true],
  w: [20, 40, 60], h: [20, 30, 44], d: [10, 20, 35], t: [0.8, 3, 5, 10, 16], r: [2, 3, 5, 12], l1: [20, 30, 50], l2: [6, 25, 40], R: [8, 30, 50], rf: [0.5, 1, 1.8, 6],
};
const used: Record<string, (keyof C)[]> = { revolve: ["r1", "h1", "r2", "H", "deg"], loft: ["w1", "d1", "w2", "d2", "dx", "LH", "ruled"], shell: ["w", "h", "d", "t"], sweep: ["r", "l1", "l2"], chain: ["r1", "h1", "r2", "H", "t", "rf"] };
const near = (a: number, b: number, t = 1e-2) => Math.abs(a - b) < t;

/** the meaning of ids, after an edit: [name, id, test of the face]; checked only for a recipe that is sound (the numbers make the shape the recipe means) */
function meanings(fam: string, c: C): [string, Id, (f: K.Facts) => boolean][] {
  const line = (sk: string, i: number) => mint(sk, "line", i);
  if (fam === "revolve" && c.deg === 360 && c.r2 < c.r1 && c.h1 < c.H) return [
    ["bottom disc", mint("R", "side", line("sk", 0)), (f) => f.type === "PLANE" && f.ne[2] < -0.99 && near(f.ce[2], 0)],
    ["outer cylinder", mint("R", "side", line("sk", 1)), (f) => f.type !== "PLANE" && near(f.hi[0], c.r1)],
    ["shoulder", mint("R", "side", line("sk", 2)), (f) => f.type === "PLANE" && f.ne[2] > 0.99 && near(f.ce[2], c.h1)],
    ["inner cylinder", mint("R", "side", line("sk", 3)), (f) => f.type !== "PLANE" && near(f.hi[0], c.r2)],
    ["top disc", mint("R", "side", line("sk", 4)), (f) => f.type === "PLANE" && f.ne[2] > 0.99 && near(f.ce[2], c.H)],
  ];
  if (fam === "loft") return [
    ["the -y side", mint("L", "side", line("a", 0)), (f) => f.ce[1] < 0], ["the +x side", mint("L", "side", line("a", 1)), (f) => f.ce[0] > 0],
    ["the +y side", mint("L", "side", line("a", 2)), (f) => f.ce[1] > 0], ["the -x side", mint("L", "side", line("a", 3)), (f) => f.ce[0] < 0],
    ["bottom", mint("L", "start"), (f) => f.type === "PLANE" && f.ne[2] < -0.99 && near(f.ce[2], 0)], ["top", mint("L", "end"), (f) => f.type === "PLANE" && f.ne[2] > 0.99 && near(f.ce[2], c.LH)],
  ];
  if (fam === "shell") return [
    ["outer +x wall", mint("A", "side", line("sk", 1)), (f) => f.ne[0] > 0.99 && near(f.ce[0], c.w)],
    ["inner +x wall", mint("S", "inner", mint("A", "side", line("sk", 1)), 0), (f) => f.ne[0] < -0.99 && near(f.ce[0], c.w - c.t)],
    ["inner floor", mint("S", "inner", mint("A", "start"), 0), (f) => f.ne[2] > 0.99 && near(f.ce[2], c.t)],
  ];
  if (fam === "sweep") return [
    ["start cap", mint("P", "start"), (f) => f.type === "PLANE" && near(f.ce[0], 0) && near(f.ce[2], 0)],
    ["end cap", mint("P", "end"), (f) => f.type === "PLANE" && near(f.ce[0], c.l1) && near(f.ce[2], c.l2)],
  ];
  return [];
}

const tally: Record<string, number> = {}, bad: string[] = []; let checks = 0, ok = 0, wrong = 0, lost = 0, ms = 0;
const status = (e: Engine) => e.ids().map((id) => { const r = e.result(id); return `${id}:${r.status.kind}:${"why" in r.status ? r.status.why : ""}:${r.fingerprint}`; });
for (let n = 0; n < N; n++) {
  const fam = Object.keys(families)[n % Object.keys(families).length]!, make = families[fam]!, c: C = { ...C0 }, e = new Engine(make(c)); e.build();
  for (let k = 0; k < 8; k++) {
    const label = `${fam} sequence ${n} edit ${k}`, q: C = { ...c };
    for (let j = 0; j < 1 + Math.floor(rnd() * 2); j++) { const key = pick(used[fam]!); (q as any)[key] = pick(choose[key] as readonly unknown[]); }
    const t0 = performance.now();
    try { e.setRecipe(make(q)); } catch (x) { bad.push(`${label}: threw ${String(x)}`); break; }
    ms += performance.now() - t0; checks++; Object.assign(c, q);
    for (const id of e.ids()) {
      const r = e.result(id); tally[r.status.kind] = (tally[r.status.kind] ?? 0) + 1;
      if (r.status.kind !== "ok" && !("why" in r.status && r.status.why)) bad.push(`${label}: ${id} ${r.status.kind} with no reason`);
      if (r.status.kind === "flagged" && /undefined|Cannot read|\[object/.test((r.status as { why: string }).why)) bad.push(`${label}: ${id} flagged by an engine error: ${(r.status as { why: string }).why}`);
      if (r.value instanceof Body) { const seen = new Set<string>(); for (const f of r.value.faces) { const key = idKey(f.id); if (seen.has(key)) bad.push(`${label}: ${id} two faces with the id ${key}`); seen.add(key); if (f.defect && r.status.kind === "ok") bad.push(`${label}: ${id} (${e.step(id).kind}) is ok but a face has no id; ${JSON.stringify(c)}`); } }
    }
    const fresh = new Engine(make(c)); fresh.build(); const a = status(e), b = status(fresh);
    if (a.join("\n") !== b.join("\n")) { const i = a.findIndex((x, j) => x !== b[j]), x = a[i]!, y = b[i]!; let d = 0; while (d < x.length && x[d] === y[d]) d++; bad.push(`${label}: edited and fresh engines differ at ${e.ids()[i]} from character ${d}: ${JSON.stringify(c)}\n      edited: ...${x.slice(Math.max(0, d - 50), d + 120)}\n      fresh:  ...${y.slice(Math.max(0, d - 50), d + 120)}`); }
    // the meaning of ids: only when every step is ok
    if (e.ids().every((id) => e.result(id).status.kind === "ok")) {
      const body = e.result(e.ids()[e.ids().length - 1]!).value;
      if (body instanceof Body) for (const [name, id, test] of meanings(fam, c)) { const fs = body.find(id); if (!fs.length) { lost++; bad.push(`${label}: ${name} (${id.step}.${id.role}) is lost: ${JSON.stringify(c)}`); } else if (fs.every((f) => test(K.facts(f.h)))) ok++; else { wrong++; bad.push(`${label}: ${name} no longer means what it did: ${JSON.stringify(c)}`); } }
    }
    fresh.release();
  }
  e.release();
}
console.log(`${N} sequences, ${checks} edits, ${(ms / Math.max(1, checks)).toFixed(0)} ms per edit; statuses ${JSON.stringify(tally)}; meaning checks: ${ok} right, ${wrong} wrong, ${lost} lost`);
console.log(bad.length ? `${bad.length} VIOLATIONS:\n  ` + bad.slice(0, 10).join("\n  ") : "no violation");
process.exit(bad.length ? 1 : 0);

// Spike 5: the human's saved models (the old app's fixtures) as real recipes. (A) their dependency structure; (B) random edits of their numbers, replayed on OCCT, to see how often a real part fails.
// Throwaway (CLAUDE.md rule 9).
import { readFileSync, readdirSync, appendFileSync, writeFileSync } from "node:fs";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { openSession } from "../../app/src/interaction/session.ts";
import { buildGraph } from "../../app/src/compiler/graph.ts";

await kernel.init();
const dir = new URL("../../app/test/fixtures/", import.meta.url);
const budgetMs = Number(process.argv[2] ?? 300000), EDITS = Number(process.argv[3] ?? 12), only = process.argv[4];
const out = new URL("./results.jsonl", import.meta.url); writeFileSync(out, "");

let seed = 12345; const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** which ops an op refers to: any string in it that is another op's id */
function deps(ops: any[]): Map<string, string[]> {
  const ids = new Set(ops.map((o) => o.id)), m = new Map<string, string[]>();
  for (const op of ops) {
    const found = new Set<string>();
    const walk = (v: any) => { if (typeof v === "string") { if (ids.has(v) && v !== op.id) found.add(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
    for (const [k, v] of Object.entries(op)) if (k !== "id") walk(v);
    m.set(op.id, [...found]);
  }
  return m;
}

/** numbers that a person edits: an extrude's distance, an edge mod's size, a transform's amount, a sketch's corners */
function editable(ops: any[]): { op: any; key: string }[] {
  const out: { op: any; key: string }[] = [];
  for (const op of ops) {
    for (const key of ["distance", "value", "radius", "size", "wall", "angle", "amount", "depth"]) if (typeof op[key] === "number" && Number.isFinite(op[key]) && op[key] !== 0) out.push({ op, key });
    if (Array.isArray(op.points) && op.points.length) out.push({ op, key: "points" });
  }
  return out;
}
function perturb(g: any): { op: string; type: string; key: string; before: any; after: any } | null {
  const c = editable(g.ops); if (!c.length) return null;
  const { op, key } = c[Math.floor(rnd() * c.length)];
  const before = clone(op[key]);
  if (key === "points") {
    const xs = op.points.map((p: number[]) => p[0]), ys = op.points.map((p: number[]) => p[1]);
    const ext = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1e-6), k = 0.1 * ext;
    const i = Math.floor(rnd() * op.points.length);
    op.points[i] = [op.points[i][0] + (rnd() - 0.5) * 2 * k, op.points[i][1] + (rnd() - 0.5) * 2 * k];
  } else op[key] = op[key] * (0.5 + rnd());
  return { op: op.id, type: op.type, key, before, after: clone(op[key]) };
}

const files = readdirSync(dir).filter((f) => f.endsWith(".cad.json") && (!only || f.includes(only))).sort();
const t0 = performance.now();
const structure: any[] = []; let edits = 0, byOutcome: Record<string, number> = {}; const failByType: Record<string, number> = {}, editByType: Record<string, number> = {};
console.log(`${files.length} fixtures`);
for (const f of files) {
  if (performance.now() - t0 > budgetMs) { console.log("time budget reached at", f); break; }
  let g: any;
  try { const o: any = openSession(kernel, readFileSync(new URL(f, dir), "utf8")); if (!o.ok) { console.log(f, "did not open"); continue; } g = buildGraph(o.value.history.scene).graph; } catch (e: any) { console.log(f, "build error", String(e.message).slice(0, 80)); continue; }
  const n = g.ops.length; if (!n) continue;
  const D = deps(g.ops), dependents = new Map<string, string[]>(g.ops.map((o: any) => [o.id, []]));
  for (const [id, ds] of D) for (const d of ds) dependents.get(d)!.push(id);
  // (A) structure: how much of a replay an edit at each op needs, flat from that op on or only its dependents
  const idx = new Map<string, number>(g.ops.map((o: any, i: number) => [o.id, i]));
  let flatSum = 0, graphSum = 0, depth = 0; const dep = new Map<string, number>();
  for (const op of g.ops) { const d = 1 + Math.max(0, ...D.get(op.id)!.map((x) => dep.get(x) ?? 0)); dep.set(op.id, d); depth = Math.max(depth, d); }
  for (const op of g.ops) {
    flatSum += n - idx.get(op.id)!;
    const seen = new Set([op.id]), stack = [op.id]; while (stack.length) for (const x of dependents.get(stack.pop()!)!) if (!seen.has(x)) { seen.add(x); stack.push(x); }
    graphSum += seen.size;
  }
  const roots = g.ops.filter((o: any) => !D.get(o.id)!.length).length;
  // baseline
  let base: any; const tb = performance.now();
  try { base = kernel.evaluate(clone(g)); } catch (e: any) { console.log(f, "baseline crash", String(e.message).slice(0, 80)); continue; }
  const baseMs = performance.now() - tb;
  const baseErr = base.ops.filter((o: any) => o.error).length;
  structure.push({ f, n, roots, depth, flatAvg: flatSum / n, graphAvg: graphSum / n, baseMs, baseErr });
  console.log(`${f.padEnd(46)} ops ${String(n).padStart(3)} roots ${String(roots).padStart(2)} depth ${String(depth).padStart(3)}  avg replay after an edit: flat ${(flatSum / n).toFixed(1).padStart(5)} graph ${(graphSum / n).toFixed(1).padStart(5)}   baseline ${baseMs.toFixed(0).padStart(5)} ms, ${baseErr} op errors`);
  if (baseErr || baseMs > 4000 || n < 2) continue;
  // (B) edits
  for (let k = 0; k < EDITS; k++) {
    if (performance.now() - t0 > budgetMs) break;
    const g2 = clone(g), ed = perturb(g2); if (!ed) break;
    const ts = performance.now(); let res: any, crash = "";
    try { res = kernel.evaluate(g2); } catch (e: any) { crash = String(e.message).slice(0, 80); }
    const ms = performance.now() - ts; edits++;
    let outcome = "ok", errs: any[] = [], blank = false;
    if (crash) outcome = "crash";
    else { errs = res.ops.filter((o: any) => o.error); blank = !res.finalId || res.volume == null || !(res.volume > 0) ; outcome = errs.length ? (blank ? "failed, model blank" : "failed, model shown") : (blank ? "no error but blank" : "ok"); }
    byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1; editByType[ed.type] = (editByType[ed.type] ?? 0) + 1;
    if (errs.length) { const firstType = errs[0].type; failByType[firstType] = (failByType[firstType] ?? 0) + 1; }
    appendFileSync(out, JSON.stringify({ f, edit: ed, outcome, errors: errs.map((e: any) => [e.id, e.type, String(e.error).slice(0, 90)]), nOps: n, ms: Math.round(ms), crash }) + "\n");
  }
}
const tot = structure.length;
console.log(`\n=== structure of ${tot} real recipes: ops ${structure.reduce((s, x) => s + x.n, 0)}; median ops ${structure.map((x) => x.n).sort((a, b) => a - b)[Math.floor(tot / 2)]}; median depth ${structure.map((x) => x.depth).sort((a, b) => a - b)[Math.floor(tot / 2)]}`);
const fl = structure.reduce((s, x) => s + x.flatAvg * x.n, 0), gr = structure.reduce((s, x) => s + x.graphAvg * x.n, 0), ops = structure.reduce((s, x) => s + x.n, 0);
console.log(`average ops replayed after an edit at a random op: flat ${(fl / ops).toFixed(1)}, graph ${(gr / ops).toFixed(1)}`);
console.log(`=== ${edits} random edits: ${JSON.stringify(byOutcome)}`);
console.log("edits by op type:", JSON.stringify(editByType)); console.log("first failing op by type:", JSON.stringify(failByType));

// Spike 6b on the real failures of spike 5: of the edits that made OCCT itself fail on a valid shape, how many does a retry rescue? Rungs: a tiny nudge of the edited number; the inputs snapped to a grid.
import { readFileSync, readdirSync } from "node:fs";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { openSession } from "../../app/src/interaction/session.ts";
import { buildGraph } from "../../app/src/compiler/graph.ts";
await kernel.init();
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const rows: any[] = [];
for (const f of readdirSync(new URL("./results/", import.meta.url))) for (const l of readFileSync(new URL(`./results/${f}`, import.meta.url), "utf8").split("\n")) if (l.trim()) rows.push(JSON.parse(l));
const isKernel = (m: string) => /invalid solid|could not be joined|loft could not|could not make this step|has not type|nothing in common/.test(m);
const failing = rows.filter((r) => r.outcome !== "ok" && r.errors.length && isKernel(String(r.errors[0][2])));
console.log(`${failing.length} kernel failures of ${rows.length} edits (the sketch-crossing-itself ones are excluded below)`);
const cache = new Map<string, any>();
const graphOf = (f: string) => { if (!cache.has(f)) { const o: any = openSession(kernel, readFileSync(new URL(`../../app/test/fixtures/${f}.cad.json`.replace(".cad.json.cad.json", ".cad.json"), import.meta.url), "utf8")); cache.set(f, buildGraph(o.value.history.scene).graph); } return clone(cache.get(f)); };
const ev = (g: any) => { try { const r: any = kernel.evaluate(g); const errs = r.ops.filter((o: any) => o.error); return { ok: !errs.length && r.volume > 0, vol: r.volume, err: errs[0]?.error ? String(errs[0].error).slice(0, 50) : "" }; } catch (e: any) { return { ok: false, vol: 0, err: "crash " + String(e.message).slice(0, 30) }; } };
function simple(pts: number[][]) { const o = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); const n = pts.length; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue; const a = pts[i], b = pts[(i + 1) % n], c = pts[j], d = pts[(j + 1) % n]; if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return false; } return true; }
const snapNumbers = (g: any, grid: number) => { const s = (v: number) => Math.round(v / grid) * grid; for (const op of g.ops) { for (const k of ["distance", "value", "radius", "size", "wall", "angle", "amount", "depth"]) if (typeof op[k] === "number") op[k] = s(op[k]); if (Array.isArray(op.points)) op.points = op.points.map((p: number[]) => p.map(s)); } return g; };
const nudge = (g: any, op: string, key: string, rel: number, sign: number) => { const o = g.ops.find((x: any) => x.id === op); if (key === "points") { const xs = o.points.map((p: number[]) => p[0]), ys = o.points.map((p: number[]) => p[1]); const ext = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1e-6); o.points = o.points.map((p: number[], i: number) => [p[0] + sign * rel * ext * (i % 2 ? 1 : -1), p[1] + sign * rel * ext * (i % 3 ? -1 : 1)]); } else o[key] = o[key] * (1 + sign * rel); return g; };
const rungs: [string, (g: any, r: any) => any][] = [
  ["nudge the edited number by 1e-6", (g, r) => nudge(g, r.edit.op, r.edit.key, 1e-6, 1)],
  ["nudge the edited number by 1e-4", (g, r) => nudge(g, r.edit.op, r.edit.key, 1e-4, 1)],
  ["nudge the edited number by -1e-4", (g, r) => nudge(g, r.edit.op, r.edit.key, 1e-4, -1)],
  ["nudge the edited number by 1e-3", (g, r) => nudge(g, r.edit.op, r.edit.key, 1e-3, 1)],
  ["nudge the edited number by -1e-3", (g, r) => nudge(g, r.edit.op, r.edit.key, 1e-3, -1)],
  ["snap every input to 0.001", (g) => snapNumbers(g, 1e-3)],
  ["snap every input to 0.01", (g) => snapNumbers(g, 1e-2)],
  ["snap every input to 0.1", (g) => snapNumbers(g, 1e-1)],
];
const rescued = new Map<string, number>(), union = new Set<number>(); let reproduced = 0, considered = 0; const byCause: Record<string, [number, number]> = {};
failing.forEach((r, i) => {
  if (r.edit.key === "points" && r.edit.after.length >= 4 && !simple(r.edit.after)) return; // my edit crossed the sketch: not a fair case
  considered++;
  const g0 = graphOf(r.f); const o = g0.ops.find((x: any) => x.id === r.edit.op); o[r.edit.key] = clone(r.edit.after);
  const base = ev(clone(g0)); if (base.ok) { return; } reproduced++;
  const cause = String(r.errors[0][2]).slice(0, 28); byCause[cause] ??= [0, 0]; byCause[cause][0]++;
  let any = false;
  for (const [name, f] of rungs) { const g = f(clone(g0), r); const e = ev(g); if (e.ok) { rescued.set(name, (rescued.get(name) ?? 0) + 1); any = true; } }
  if (any) { union.add(i); byCause[cause][1]++; }
});
console.log(`fair kernel failures: ${considered}; failed again when replayed: ${reproduced}`);
for (const [n] of rungs) console.log(`  rescued by "${n}": ${rescued.get(n) ?? 0}`);
console.log(`rescued by at least one rung: ${union.size} of ${reproduced}`);
console.log("by cause (failures, rescued):", JSON.stringify(byCause));

// A dev check (not a test, `in_1444`) that hints and constraints are one thing (`dec_helpers_one_rule`): if the helper bar can offer a constraint on the figure being drawn, and it is applied and solved, then the helpers at the place it puts the figure show that same constraint as holding.
// Random sketches are drawn as a person does; for random selections that include the free place (or the line from a first place), `offersFor` (the bar's way) says what would be new; each such helper relation is put on, the solver moves only the free part,
// and `helpersAt` (the drawing's way) is asked at that place.   node --experimental-strip-types dev/helpers-roundtrip-check.ts [trials] [seed]
import { addCircle, addLine, addRect, emptySketch, keep, refOf, viewSystem, type Sol } from "../src/interaction/drawing.ts";
import { solveDefinition } from "../src/engine/definition.ts";
import { helpersAt, type Free } from "../src/engine/helpers.ts";
import { RELATIONS, solve, tryAdd, type System } from "../src/engine/solver.ts";
import { offersFor } from "../src/interaction/suggest.ts";
import type { SketchParams } from "../src/engine/sketch.ts";
const N = Number(process.argv[2] ?? 60), SEED = Number(process.argv[3] ?? 1); let seed = SEED;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const sol = (p: SketchParams): Sol => { const s = solveDefinition(p); return { points: s.points, radii: s.radii }; };
const problems: string[] = []; let checked = 0, kinds: Record<string, number> = {};
for (let t = 0; t < N; t++) {
  seed = (SEED * 7919 + t * 104729) | 0;
  let p = emptySketch();
  for (let i = 0; i < 4 + Math.floor(rnd() * 4); i++) {
    const s = sol(p), spot = (): [number, number] => [Math.round(rnd() * 60), Math.round(rnd() * 60)], r = () => refOf(p, s, spot(), 0.3), roll = rnd();
    const next = roll < 0.5 ? addLine(p, s, r(), r()) : roll < 0.8 ? addRect(p, s, r(), r()) : addCircle(p, s, r(), spot());
    const k = next && keep(next); if (k && k.ok) p = k.params;
  }
  if (!p.points.length) continue;
  const s = sol(p), real = viewSystem(p, s);
  const fixedReal: System = { ...real, points: real.points.map((q) => ({ ...q, fixed: true })), circles: real.circles.map((c) => ({ ...c, fixedR: true })), constraints: [] };
  const start = pick(real.points), q: [number, number] = [start.x + 5 + rnd() * 40, start.y + 5 + rnd() * 40], shape: Free = rnd() < 0.5 ? { shape: "line", from: [start.x, start.y], startId: start.id } : { shape: "point" };
  const temp: System = { ...fixedReal, points: [...fixedReal.points, { id: "~P", x: q[0], y: q[1] }], lines: shape.shape === "line" ? [...fixedReal.lines, { id: "~L", a: start.id, b: "~P" }] : fixedReal.lines };
  const others = [...real.points.map((x) => x.id), ...real.lines.map((x) => x.id), ...real.circles.map((x) => x.id)].filter((id) => id !== (shape.shape === "line" ? start.id : ""));
  const frees = shape.shape === "line" ? ["~L", "~P"] : ["~P"];
  for (let trial = 0; trial < 6; trial++) {
    const sel = [pick(frees), ...(rnd() < 0.7 ? [pick(others)] : [])].filter((x, i, a) => a.indexOf(x) === i);
    for (const o of offersFor(temp, sel).offers) {
      if (o.state !== "free" || o.dimensional || !RELATIONS[o.kind].helper) continue;
      const r = tryAdd(temp, { id: "k", kind: o.kind, parts: o.parts }); if (r.outcome !== "added") continue;
      const solved = solve(r.system, {}); if (!solved.verdict.ok) continue;
      const at = solved.solution.points["~P"]!; if (Math.hypot(at[0] - (shape.shape === "line" ? shape.from[0] : q[0]), at[1] - (shape.shape === "line" ? shape.from[1] : q[1])) < 0.5) continue; // (a line of nothing is not a figure)
      const mm = 1e-4, h = helpersAt(real, shape, [at[0], at[1]], mm), key = (x: { relation: string; parts: string[] }) => `${x.relation}|${[...x.parts].sort().join()}`;
      checked++; kinds[o.kind] = (kinds[o.kind] ?? 0) + 1;
      if (!h.holds.some((x) => key(x) === key({ relation: o.kind, parts: o.parts }))) problems.push(`trial ${t}: the bar offers ${o.kind} on ${o.parts.join(",")} (${shape.shape}); applied, the figure is at ${at.map((v) => v.toFixed(3))}, and the helpers say only ${h.holds.map(key).join(" ; ") || "nothing"}`);
    }
  }
}
console.log(`${checked} constraints the bar offers were applied and looked for as helpers; by kind: ${JSON.stringify(kinds)}`);
console.log(problems.length ? `${problems.length} not found:\n${problems.slice(0, 12).join("\n")}` : "every one was found as a helper");
process.exit(problems.length ? 1 : 0);

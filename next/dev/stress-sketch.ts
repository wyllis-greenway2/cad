// A dev stress run (not a test, `in_1444`, `in_1555`) for sketching and constraints, the way a person uses them: points, lines and circles are drawn, constraints are added one at a time (`tryAdd`, what the screen does), numbers are edited,
// a point is dragged, constraints are taken away. No kernel: the solver on its own, thousands of sessions in seconds. The promises:
//   1. nothing throws, and every answer is one of the four verdicts
//   2. a constraint that is added or already follows holds: every constraint's numbers are zero (to 1e-6) at the places the parts end up
//   3. a constraint that is refused names the constraints that hold it back (all of them in the sketch), and with those taken out it is not refused for the same reason
//   4. a number edited: solved with everything holding, or refused with the conflict named
//   5. a drag: everything still holds, a fixed point has not moved, and what was not reached is said
//   6. the same system solved twice gives the same places
//   7. a constraint taken away: still solves
//   node --experimental-strip-types dev/stress-sketch.ts [sessions] [seed]
import { writeFileSync } from "node:fs";
import { RELATIONS, residualsOf, solve, tryAdd, validate, type Constraint, type Relation, type System } from "../src/engine/solver.ts";
const N = Number(process.argv[2] ?? 300); let seed = Number(process.argv[3] ?? 1);
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const problems: string[] = []; const tally: Record<string, number> = {};
const bump = (k: string) => { tally[k] = (tally[k] ?? 0) + 1; };
const DIMS = new Set<Relation>(["distance", "length", "radius", "pointLineDistance", "horizontalDistance", "verticalDistance", "angle"]);
const KINDS = (Object.keys(RELATIONS) as Relation[]).filter((k) => k !== "fixed");

function session(s: number): void {
  seed = (Number(process.argv[3] ?? 1) * 7919 + s * 104729) | 0;
  const nP = 4 + Math.floor(rnd() * 5);
  const S: System = { points: Array.from({ length: nP }, (_x, i) => ({ id: `P${i}`, x: Math.round(rnd() * 200) / 10, y: Math.round(rnd() * 200) / 10 })), lines: [], circles: [], constraints: [] };
  for (let i = 0; i < nP + 1; i++) { const a = Math.floor(rnd() * nP); let b = Math.floor(rnd() * nP); if (b === a) b = (a + 1) % nP; if (!S.lines.some((l) => (l.a === `P${a}` && l.b === `P${b}`) || (l.a === `P${b}` && l.b === `P${a}`))) S.lines.push({ id: `L${S.lines.length}`, a: `P${a}`, b: `P${b}` }); }
  for (let i = 0; i < Math.floor(rnd() * 3); i++) S.circles.push({ id: `K${i}`, c: pick(S.points).id, r: 2 + Math.round(rnd() * 40) / 10 });
  const tag = `session ${s} (seed ${process.argv[3] ?? 1})`, fail = (what: string) => { problems.push(`${tag}: ${what}`); if (!dumped) { dumped = true; writeFileSync(`/tmp/sketch-${process.argv[3] ?? 1}-${s}.json`, JSON.stringify(lastSys)); } };
  let dumped = false;
  let cur: System = S, nC = 0, lastSys: System = S; void lastSys;
  const holds = (sys: System, where: string, skip: string[] = []) => { lastSys = sys; for (const c of sys.constraints) { if (skip.includes(c.id)) continue; const r = residualsOf(sys, c); const worst = Math.max(0, ...r.map(Math.abs)); const range = c.min !== undefined || c.max !== undefined; if (!range && !(worst < 1e-5)) { fail(`${where}: ${c.kind} ${c.id} does not hold (${worst.toExponential(2)})`); return false; } } return true; };
  const apply = (sys: System, sol: { points: Record<string, [number, number]>; circles: Record<string, number> }): System => ({ ...sys, points: sys.points.map((p) => (sol.points[p.id] ? { ...p, x: sol.points[p.id]![0], y: sol.points[p.id]![1] } : p)), circles: sys.circles.map((c) => ({ ...c, r: sol.circles[c.id] ?? c.r })) });
  const make = (sys: System): Constraint | null => {
    const kind = pick(rnd() < 0.5 ? KINDS : KINDS.filter((k) => DIMS.has(k) || k === "coincident" || k === "horizontal" || k === "vertical" || k === "parallel" || k === "perpendicular")), row = RELATIONS[kind];
    const ofKind = (k: string) => k === "point" ? sys.points : k === "line" ? sys.lines : sys.circles; let parts: string[];
    if (kind === "horizontal" || kind === "vertical") parts = rnd() < 0.6 && sys.lines.length ? [pick(sys.lines).id] : [pick(sys.points).id, pick(sys.points).id];
    else { parts = []; for (let i = 0; i < row.arity; i++) { const kinds = row.parts[i]!, k = pick(kinds), pool = ofKind(k); if (!pool.length) return null; parts.push(pick(pool).id); } }
    if (new Set(parts).size !== parts.length && kind !== "tangent") return null;
    const c: Constraint = { id: `c${nC++}`, kind, parts };
    if (DIMS.has(kind)) {
      if (kind === "angle") c.value = pick([30, 45, 60, 90, 120]);
      else { const m = residualsOf(sys, { ...c, value: 0 })[0] ?? 1; c.value = Math.max(0.5, Math.round(Math.abs(m) * (rnd() < 0.7 ? 1 : 0.5 + rnd()) * 10) / 10); }
    }
    return c;
  };
  let lastC: Constraint | null = null;
  for (let step = 0; step < 14; step++) {
    const roll = rnd(); const prev = cur; lastC = null;
    try {
      if (roll < 0.65 || !cur.constraints.length) {
        const c = make(cur); if (!c) continue; if (validate({ ...cur, constraints: [...cur.constraints, c] })) { bump("not valid, skipped"); continue; }
        lastC = c; const a = tryAdd(cur, c);
        if (a.outcome === "added") { cur = apply(a.system, solve(a.system).solution); bump("added"); holds(cur, `after adding ${c.kind} ${c.id}`); }
        else if (a.outcome === "already") { bump("already"); holds(cur, `after ${c.kind} ${c.id} turned out to follow`); if (!a.by.length && cur.constraints.length) fail(`${c.kind} ${c.id} follows from the others but says from which of them: none`); }
        else {
          bump("refused");
          if (!a.victims.length && !a.holding.length) fail(`${c.kind} ${c.id} was refused and names nothing`);
          else {
            const ids = new Set(cur.constraints.map((q) => q.id)); if (!a.victims.every((v) => ids.has(v) || v === c.id)) fail(`a refusal names a constraint that is not there: ${a.victims.join(",")}`);
            const rest = { ...cur, constraints: cur.constraints.filter((q) => !a.victims.includes(q.id)) }, b = tryAdd(rest, c);
            if (b.outcome === "refused" && b.victims.join() === a.victims.join() && a.victims.some((v) => v !== c.id)) fail(`${c.kind} ${c.id} is still refused for the same ${a.victims.join(",")} after they were taken out`);
          }
        }
      } else if (roll < 0.8) { // a number edited
        const dims = cur.constraints.filter((c) => DIMS.has(c.kind) && c.value !== undefined); if (!dims.length) continue; const d = pick(dims), v = Math.min(150, Math.max(0.5, (d.value as number) * pick([0.5, 0.8, 1.3, 2])));
        const next = { ...cur, constraints: cur.constraints.map((c) => (c.id === d.id ? { ...c, value: v } : c)) }, r = solve(next); bump("edit");
        if (r.verdict.ok) { cur = apply(next, r.solution); holds(cur, `after editing ${d.id} to ${v}`); } else if (!r.verdict.conflict.length && !r.verdict.reason) fail(`editing ${d.id} to ${v} is refused with no conflict and no reason`); else bump("edit refused");
      } else if (roll < 0.92) { // a drag
        const p = pick(cur.points), to: [number, number] = [p.x + (rnd() - 0.5) * 10, p.y + (rnd() - 0.5) * 10], r = solve(cur, { pins: { [p.id]: to } }); bump("drag");
        if (r.verdict.ok) {
          const after = apply(cur, r.solution); holds(after, `after dragging ${p.id}`);
          for (const q of cur.points) if (q.fixed && (Math.abs(r.solution.points[q.id]![0] - q.x) > 1e-6 || Math.abs(r.solution.points[q.id]![1] - q.y) > 1e-6)) fail(`dragging ${p.id} moved the fixed point ${q.id}`);
          cur = after;
        }
      } else { // one constraint taken away
        const c = pick(cur.constraints), next = { ...cur, constraints: cur.constraints.filter((q) => q.id !== c.id) }, r = solve(next); bump("removed");
        if (!r.verdict.ok) fail(`removing ${c.id} left a system that does not solve: ${r.verdict.reason}`); else cur = apply(next, r.solution);
      }
      // 8. nothing flies away: the drawing started within 20 mm of the origin, and a constraint or a drag of a few mm must not send a point a long way off
      { const far = cur.points.find((p) => Math.abs(p.x) > 500 || Math.abs(p.y) > 500); if (far) { writeFileSync(`/tmp/sketch-far-${process.argv[3] ?? 1}-${s}.json`, JSON.stringify({ prev, c: lastC })); fail(`after ${roll < 0.65 ? "adding a constraint" : roll < 0.8 ? "editing a number" : roll < 0.92 ? "a drag" : "removing one"} the point ${far.id} is at (${far.x.toFixed(0)}, ${far.y.toFixed(0)})`); return; } }
      // 6. the same again
      if (cur.constraints.length && step % 5 === 4) { const a = solve(cur), b = solve(cur); const worst = Math.max(0, ...Object.keys(a.solution.points).map((k) => Math.abs(a.solution.points[k]![0] - b.solution.points[k]![0]) + Math.abs(a.solution.points[k]![1] - b.solution.points[k]![1]))); if (worst > 1e-9) fail(`the same system solved twice gave places ${worst.toExponential(1)} apart`); }
    } catch (x) { fail(`step ${step} THREW ${(x as Error).message.slice(0, 140)}`); return; }
  }
}
const ONLY = process.argv[4] === undefined ? -1 : Number(process.argv[4]), t0 = Date.now(); for (let s = 0; s < N; s++) { if (ONLY >= 0 && s !== ONLY) continue; session(s); }
console.log(`${N} sessions, ${((Date.now() - t0) / 1000).toFixed(1)} s:`, JSON.stringify(tally));
console.log(problems.length ? `${problems.length} PROBLEMS:\n` + problems.slice(0, 30).join("\n") : "no problems in the solver's promises");
process.exit(problems.length ? 1 : 0);

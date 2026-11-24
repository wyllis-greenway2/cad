// A dev stress run (not a test, `in_1444`) of drawing as a person does it, through `interaction/drawing.ts`: random clicks make lines, rectangles and circles (on grid crossings, on points, on curves), numbers and relations are put on random selections,
// numbers are retyped, parts are deleted, curves are trimmed. The promises: nothing throws; a definition that was kept solves; a refusal says why; what a trim leaves solves; a deleted part leaves no constraint that names it.
//   node --experimental-strip-types dev/stress-drawing.ts [sessions] [seed]
import { addCircle, addLine, addRect, constrain, emptySketch, hitAt, keep, refOf, removeParts, retype, type Sol } from "../src/interaction/drawing.ts";
import { solveDefinition } from "../src/engine/definition.ts";
import { trimAt } from "../src/engine/trim.ts";
import { RELATIONS, type Relation } from "../src/engine/solver.ts";
import type { SketchParams } from "../src/engine/sketch.ts";
const N = Number(process.argv[2] ?? 200), SEED = Number(process.argv[3] ?? 1); let seed = SEED;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const problems: string[] = [], tally: Record<string, number> = {}; const bump = (k: string) => { tally[k] = (tally[k] ?? 0) + 1; };
const KINDS = (Object.keys(RELATIONS) as Relation[]).filter((k) => k !== "fixed");
const solOf = (p: SketchParams): Sol => { const s = solveDefinition(p); return { points: s.points, radii: s.radii }; };

for (let s = 0; s < N; s++) {
  seed = (SEED * 7919 + s * 104729) | 0; const tag = `session ${s} (seed ${SEED})`; let p = emptySketch(); const fail = (w: string) => problems.push(`${tag}: ${w}`);
  try {
    for (let step = 0; step < 25; step++) {
      const sol = solOf(p), spot = (): [number, number] => (rnd() < 0.5 && p.points.length ? (() => { const q = pick(p.points); return [q.x + (rnd() - 0.5) * 0.2, q.y + (rnd() - 0.5) * 0.2] as [number, number]; })() : [Math.round(rnd() * 60 - 10), Math.round(rnd() * 40 - 5)]);
      const roll = rnd(), ref = () => refOf(p, sol, spot(), 0.6, 1);
      let next: SketchParams | null = null, what = "";
      if (roll < 0.25) { next = addLine(p, sol, ref(), ref()); what = "line"; }
      else if (roll < 0.4) { next = addRect(p, sol, ref(), ref()); what = "rect"; }
      else if (roll < 0.5) { const c = spot(); next = addCircle(p, sol, refOf(p, sol, c, 0.6, 1), spot()); what = "circle"; }
      else if (roll < 0.7) {
        const parts = [...p.points.map((x) => x.id), ...(p.lines ?? []).map((x) => x.id), ...(p.circles ?? []).map((x) => x.id), ...(p.arcs ?? []).map((x) => x.id)]; if (!parts.length) continue;
        const sel = [pick(parts), ...(rnd() < 0.5 ? [pick(parts)] : [])].filter((x, i, a) => a.indexOf(x) === i), kind = rnd() < 0.4 ? "dimension" as const : pick(KINDS);
        const r = constrain(p, sol, sel, kind); bump(`constrain ${r.ok ? "kept" : "said no"}`);
        if (r.ok) p = r.params; else if (!r.why) fail(`${kind} on ${sel} was refused with no words`);
        continue;
      } else if (roll < 0.8) {
        const dims = (p.constraints ?? []).filter((c) => c.value !== undefined); if (!dims.length) continue;
        const r = retype(p, pick(dims).id, 1 + rnd() * 50); bump(`retype ${r.ok ? "kept" : "said no"}`); if (r.ok) p = r.params; else if (!r.why) fail("a retype was refused with no words");
        continue;
      } else if (roll < 0.86) { // a drag: a point, or both ends of a line, pinned somewhere else, as the screen does it
        const ids = [...p.points.map((x) => x.id), ...(p.lines ?? []).map((x) => x.id)]; if (!ids.length) continue;
        const id = pick(ids), pins = (p.lines ?? []).find((l) => l.id === id) ? [(p.lines ?? []).find((l) => l.id === id)!.a, (p.lines ?? []).find((l) => l.id === id)!.b] : [id], dx = (rnd() - 0.5) * 30, dy = (rnd() - 0.5) * 30;
        const pinned = Object.fromEntries(pins.map((q) => [q, [sol.points[q]![0] + dx, sol.points[q]![1] + dy] as [number, number]]));
        try { const r = solveDefinition(p, { pins: pinned }); bump("dragged"); const k = keep({ ...p, points: p.points.map((x) => (r.points[x.id] ? { ...x, x: r.points[x.id]![0], y: r.points[x.id]![1] } : x)) }); if (!k.ok) fail(`after a drag of ${id} the sketch does not solve: ${k.why}`); else p = k.params; }
        catch (x) { bump("drag said no"); if (!(x as Error).message) fail("a drag was refused with no words"); }
        continue;
      } else if (roll < 0.9) {
        const ids = [...(p.lines ?? []), ...(p.circles ?? []), ...(p.arcs ?? []), ...p.points]; if (!ids.length) continue;
        const gone = pick(ids).id, q = removeParts(p, [gone]); bump("removed");
        if ((q.constraints ?? []).some((c) => c.parts.includes(gone))) fail(`a constraint still names the deleted ${gone}`);
        const k = keep(q); if (!k.ok) { fail(`after deleting ${gone} the sketch does not solve: ${k.why}`); continue; } p = k.params; continue;
      } else {
        const h = hitAt(p, sol, spot(), 3); if (!h || h.kind !== "curve") continue;
        try { const t = trimAt(p, h.id, h.at); const k = keep(t.params); bump("trimmed"); if (!k.ok) fail(`a trim of ${h.id} leaves a sketch that does not solve: ${k.why}`); else p = k.params; }
        catch (x) { const m = (x as Error).message; if (/crossed|cannot be made|cannot be trimmed|not a line|no part|nothing/.test(m)) bump("trim said no"); else fail(`trim of ${h.id} threw ${m.slice(0, 120)}`); }
        continue;
      }
      if (!next) { bump("nothing drawn"); continue; }
      const k = keep(next); bump(`${what} ${k.ok ? "kept" : "said no"}`); if (k.ok) p = k.params; else if (!k.why) fail(`${what} refused with no words`);
    }
    solOf(p);
  } catch (x) { fail(`THREW ${(x as Error).stack?.split("\n").slice(0, 3).join(" | ").slice(0, 240)}`); }
}
console.log(`${N} sessions:`, JSON.stringify(tally));
console.log(problems.length ? `${problems.length} PROBLEMS:\n` + problems.slice(0, 20).join("\n") : "no problems in drawing's promises");
process.exit(problems.length ? 1 : 0);

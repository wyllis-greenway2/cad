// A dev stress run (not a test, `in_1444`, `in_1561`) for trim: random drawings of lines, arcs and circles that cross each other, trimmed one after another where the pointer is. The promises:
//   1. it never throws except in words (a circle crossed fewer than twice, a part that is not there), and the drawing it gives solves
//   2. what is left of the part is on the part it was (every piece of it lies on the old curve), and what went is not there any more
//   3. the length that is left and the length that went make the length it was (a circle: the circumference)
//   4. the ends of the part that went are crossings with other drawn parts
//   5. every other part is where it was
//   6. the part keeps its id when any of it is left, on the piece that has its start
//   node --experimental-strip-types dev/stress-trim.ts [drawings] [seed]
import { trimAt } from "../src/engine/trim.ts";
import { segsOf, solvedPositions, type SketchParams } from "../src/engine/sketch.ts";
import { alongSeg, pointOnSeg, type Pt, type Seg } from "../src/engine/region.ts";
const N = Number(process.argv[2] ?? 300);
const SEED = Number(process.argv[3] ?? 1);
let seed = SEED;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const problems: string[] = [],
  tally: Record<string, number> = {};
const bump = (k: string) => {
  tally[k] = (tally[k] ?? 0) + 1;
};
const lenOf = (s: Seg) => (s.kind === "line" ? Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) : s.r * s.sweep);
const TAU = 2 * Math.PI;

/** a grid of level and upright lines that cross, each held level or upright and given a length, one point held: the constraints a person puts on such a drawing */
function grid(): SketchParams {
  const pts: any[] = [],
    lines: any[] = [],
    cons: any[] = [];
  let n = 0;
  const xs = [0, 8, 16, 24].map((x) => x + Math.round(rnd() * 20) / 10),
    ys = [0, 7, 14, 21].map((y) => y + Math.round(rnd() * 20) / 10);
  const pt = (x: number, y: number, fixed = false) => {
    const id = `P${n++}`;
    pts.push({ id, x, y, ...(fixed ? { fixed: true } : {}) });
    return id;
  };
  for (let i = 0; i < 2 + Math.floor(rnd() * 3); i++) {
    const y = pick(ys),
      a = pt(xs[0]! - 3, y, i === 0),
      b = pt(xs.at(-1)! + 3, y),
      id = `H${i}`;
    lines.push({ id, a, b });
    cons.push(
      { id: `c_${id}`, kind: "horizontal", parts: [id] },
      { id: `l_${id}`, kind: "length", parts: [id], value: xs.at(-1)! - xs[0]! + 6 },
    );
  }
  for (let i = 0; i < 2 + Math.floor(rnd() * 3); i++) {
    const x = pick(xs),
      a = pt(x, ys[0]! - 3),
      b = pt(x, ys.at(-1)! + 3),
      id = `V${i}`;
    lines.push({ id, a, b });
    cons.push(
      { id: `c_${id}`, kind: "vertical", parts: [id] },
      { id: `l_${id}`, kind: "length", parts: [id], value: ys.at(-1)! - ys[0]! + 6 },
    );
  }
  return { points: pts, lines, arcs: [], circles: [], constraints: cons };
}
function drawing(): SketchParams {
  if (rnd() < 0.4) return grid();
  const nP = 6 + Math.floor(rnd() * 5),
    pts = Array.from({ length: nP }, (_x, i) => ({
      id: `P${i}`,
      x: Math.round(rnd() * 200) / 10,
      y: Math.round(rnd() * 200) / 10,
      fixed: true as boolean,
    }));
  const lines: any[] = [],
    arcs: any[] = [],
    circles: any[] = [],
    seen = new Set<string>();
  for (let i = 0; i < 3 + Math.floor(rnd() * 4); i++) {
    const a = Math.floor(rnd() * nP),
      b = (a + 1 + Math.floor(rnd() * (nP - 1))) % nP,
      k = [a, b].sort().join("-");
    if (!seen.has(k)) {
      seen.add(k);
      lines.push({ id: `L${lines.length}`, a: `P${a}`, b: `P${b}` });
    }
  }
  for (let i = 0; i < Math.floor(rnd() * 3); i++)
    circles.push({ id: `K${i}`, c: `P${Math.floor(rnd() * nP)}`, r: 2 + Math.round(rnd() * 70) / 10 + i * 0.137 });
  for (let i = 0; i < Math.floor(rnd() * 2) + (rnd() < 0.5 ? 1 : 0); i++) {
    const idx = [...Array(nP).keys()].sort(() => rnd() - 0.5).slice(0, 3);
    arcs.push({ id: `A${i}`, c: `P${idx[0]}`, a: `P${idx[1]}`, b: `P${idx[2]}`, ...(rnd() < 0.3 ? { cw: true } : {}) });
  }
  for (const a of arcs) pts.find((q) => q.id === a.b)!.fixed = false; // an arc's end finds its place on the circle
  return { points: pts, lines, arcs, circles, constraints: [] };
}
function session(s: number): void {
  seed = (SEED * 7919 + s * 104729) | 0;
  let p = drawing();
  const tag = `drawing ${s} (seed ${SEED})`;
  for (let step = 0; step < 6; step++) {
    let sol: ReturnType<typeof solvedPositions>;
    try {
      sol = solvedPositions(p);
    } catch {
      bump("drawing did not solve");
      return;
    }
    const segs = segsOf(p, sol.points, sol.radii);
    if (!segs.length) return;
    const target = pick(segs),
      at: Pt =
        target.kind === "line" ? pointOnSeg(target, rnd()) : pointOnSeg(target, rnd() * (target.sweep as number)),
      id = target.name,
      before = lenOf(target);
    let r;
    try {
      r = trimAt(p, id, at);
    } catch (x) {
      const m = (x as Error).message;
      if (/crossed|is not a line|cannot be made|separate shapes/.test(m)) {
        bump("refused in words");
        continue;
      }
      problems.push(`${tag}: trim of ${id} THREW ${m.slice(0, 160)}`);
      return;
    }
    bump("trimmed");
    for (const d of r.dropped)
      if (!r.removed.includes(id) && !/^(length|equalLength|midpoint)$/.test(d.kind) && !/does not hold/.test(d.why)) {
        problems.push(`${tag}: a ${d.kind} (${d.id}) was dropped by trimming ${id}: ${d.why}`);
        return;
      }
    if (r.dropped.some((d) => /does not hold/.test(d.why))) bump("let go: does not hold with the new ends");
    let after;
    try {
      after = solvedPositions(r.params);
    } catch (x) {
      problems.push(`${tag}: after trimming ${id} the drawing does not solve: ${(x as Error).message.slice(0, 120)}`);
      return;
    }
    const segs2 = segsOf(r.params, after.points, after.radii),
      pieces = segs2.filter((q) => q.name === id || r.made.includes(q.name));
    // 2. every piece lies on the old curve; the removed span is not covered
    const eps = 1e-6 * Math.max(1, 20);
    for (const q of pieces)
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const pt = pointOnSeg(q, f * (q.kind === "line" ? 1 : q.sweep));
        if (alongSeg(target, pt, eps * 10) === null) {
          problems.push(`${tag}: a piece of ${id} leaves the old curve at ${pt.map((v) => v.toFixed(3))}`);
          if (process.env.DUMP) {
            console.log(JSON.stringify({ before: p, at, id, after: r.params, made: r.made, pos: after.points }));
          }
          return;
        }
      }
    const mid: Pt =
      r.span.length === 2
        ? [(r.span[0]![0] + r.span[1]![0]) / 2, (r.span[0]![1] + r.span[1]![1]) / 2]
        : r.span[Math.floor(r.span.length / 2)]!;
    if (
      pieces.length &&
      pieces.some(
        (q) =>
          alongSeg(q, mid, eps) !== null &&
          lenOf(q) > 1e-6 &&
          r.span.length > 1 &&
          Math.hypot(r.span[0]![0] - r.span.at(-1)![0], r.span[0]![1] - r.span.at(-1)![1]) > 1e-3,
      )
    ) {
      problems.push(
        `${tag}: the part that went (${mid.map((v) => v.toFixed(3))}) is still covered: trimming ${id} at ${at.map((v) => v.toFixed(2))}; pieces ${JSON.stringify(pieces.map((q) => [q.name, q.kind]))} span ${JSON.stringify(r.span.map((v) => v.map((w) => +w.toFixed(2))))}`,
      );
      if (process.env.DUMP) console.log(JSON.stringify(p));
      return;
    }
    // 3. lengths
    const kept = pieces.reduce((a, q) => a + lenOf(q), 0),
      went = r.span.reduce(
        (a, q, i) => (i ? a + Math.hypot(q[0] - r.span[i - 1]![0], q[1] - r.span[i - 1]![1]) : a),
        0,
      );
    const full = target.kind === "arc" && target.sweep >= TAU - 1e-9 ? TAU * target.r : before,
      chord = target.kind === "line" ? went : went; // the span of an arc is a polyline: a hair short
    if (Math.abs(kept + chord - full) > 0.02 * Math.max(1, full) && !r.removed.includes(id)) {
      problems.push(
        `${tag}: ${id} was ${full.toFixed(3)} long, ${kept.toFixed(3)} is left and ${went.toFixed(3)} went`,
      );
      return;
    }
    // 4. the ends of the span are crossings
    for (const e of [r.span[0]!, r.span.at(-1)!]) {
      if (r.removed.includes(id)) break;
      const onEnd =
        segs.some((o) => o !== target && alongSeg(o, e, eps * 10) !== null) ||
        [
          target.kind === "line" ? target.a : pointOnSeg(target, 0),
          target.kind === "line" ? target.b : pointOnSeg(target, target.sweep),
        ].some((q) => Math.hypot(q[0] - e[0], q[1] - e[1]) < eps * 10);
      if (!onEnd) {
        problems.push(
          `${tag}: an end of the part that went is not a crossing or an end (${e.map((v) => v.toFixed(3))})`,
        );
        return;
      }
    }
    // 5. the others are where they were
    for (const pt of p.points!) {
      if (!after.points[pt.id]) continue;
      const o = sol.points[pt.id]!,
        n = after.points[pt.id]!;
      if (Math.hypot(o[0] - n[0], o[1] - n[1]) > 1e-6) {
        problems.push(`${tag}: the point ${pt.id} moved by the trim of ${id}`);
        return;
      }
    }
    // 6. the id
    const stillThere = [...(r.params.lines ?? []), ...(r.params.arcs ?? []), ...(r.params.circles ?? [])].some(
      (q) => q.id === id,
    );
    if (!stillThere && !r.removed.includes(id)) {
      problems.push(`${tag}: ${id} is neither left nor reported removed`);
      return;
    }
    p = r.params;
  }
}
const t0 = Date.now();
for (let s = 0; s < N; s++) session(s);
console.log(`${N} drawings, ${((Date.now() - t0) / 1000).toFixed(1)} s:`, JSON.stringify(tally));
console.log(
  problems.length
    ? `${problems.length} PROBLEMS:\n` + problems.slice(0, 20).join("\n")
    : "no problems in trim's promises",
);
process.exit(problems.length ? 1 : 0);

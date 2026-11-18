// Prototype (thrown away, `in_914`): Phase 1 of `q_progressive_load` on a project of many parts apart.
// Open the project, make a ghost (a box) of every part from the commands alone, group the parts by where their boxes are, then build each group alone in the order of its distance from a camera, and see
// when the first picture, the nearest parts and the last part are there, against the whole project built in one go.
// Run (from app/): FILE=/tmp/synth-300.cad.json [WHOLE=1] node --test ../prototypes/progressive-load/run.test.ts
import test from "node:test";
import { readFileSync } from "node:fs";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { clearKernelCaches } from "../../app/src/compiler/kernel/occt/interpreter.mjs";
import { openSession, scene } from "../../app/src/interaction/session.ts";
import { graphOf } from "../../app/src/compiler/compile.ts";
import type { Kernel } from "../../app/src/compiler/kernel/adapter.ts";

await kernel.init();
const EMPTY = { ops: [], finalId: null, volume: null, bbox: null, mesh: null, faces: null, edges: null, vertices: null, totalMs: 0 };
const nokernel: Kernel = { name: "none", init: async () => ({}), evaluate: () => ({ ...EMPTY, stale: true }) as never, exportMesh: async () => ({ ok: false, error: "no" }), exportStep: async () => ({ ok: false, error: "no" }), lagging: true } as never;
type Op = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Box = { min: number[]; max: number[] };
const ms = (t: number) => Math.round(performance.now() - t);

/** The box of a part from the commands alone: its sketch carried along its normal by the depth. */
function ghostOf(sk: Op, x: Op): Box | null {
  const f = sk.frame; if (!f || !sk.points) return null;
  const n = f.normal as number[], u = f.xDir as number[];
  const v = [n[1]! * u[2]! - n[2]! * u[1]!, n[2]! * u[0]! - n[0]! * u[2]!, n[0]! * u[1]! - n[1]! * u[0]!];
  const d = Number(x.distance ?? 0);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of sk.points as number[][]) for (const h of [0, d]) for (let k = 0; k < 3; k++) { const c = f.origin[k] + p[0]! * u[k]! + p[1]! * v[k]! + h * n[k]!; min[k] = Math.min(min[k]!, c); max[k] = Math.max(max[k]!, c); }
  return { min, max };
}
const overlap = (a: Box, b: Box): boolean => [0, 1, 2].every((i) => a.min[i]! - 0.01 <= b.max[i]! && b.min[i]! - 0.01 <= a.max[i]!);

/** Ghosts straight from the saved commands, with no scene made at all: the corners drawn, the lines that join them, the push of each figure. */
function ghostsFromCommands(text: string): { step: string; box: Box }[] {
  const cmds: any[] = JSON.parse(text).commands; // eslint-disable-line @typescript-eslint/no-explicit-any
  const corner = new Map<string, number[]>(), line = new Map<string, [string, string]>();
  const steps: { id: string; parts: string[]; depth: number; type: string }[] = [];
  const walk = (c: any): void => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (c.type === "batch") for (const x of c.commands) walk(x);
    else if (c.type === "addPart") { const p = c.part; if (p.kind === "corner") corner.set(p.ref, p.at); else if (p.kind === "line" && !p.bulge) line.set(p.ref, [p.a, p.b]); }
    else if (c.type === "addStep" && c.step.type === "extrude") steps.push({ id: c.step.id, parts: c.step.parts, depth: Number(c.step.params.depth), type: "extrude" });
  };
  for (const c of cmds) walk(c);
  const out: { step: string; box: Box }[] = [];
  for (const st of steps) {
    const pts = st.parts.flatMap((r) => (line.get(r) ?? []).map((c) => corner.get(c)!)).filter(Boolean);
    if (!pts.length) continue;
    const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]!))), max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k]!)));
    max[2] = min[2]! + st.depth;
    out.push({ step: st.id, box: { min, max } });
  }
  return out;
}

test("progressive build of a project of many parts apart", () => {
  const file = process.env.FILE!;
  const text = readFileSync(file, "utf8");
  const T0 = performance.now();
  let t = performance.now();
  const early = ghostsFromCommands(text);
  console.log(`# PL ghosts straight from the saved commands, no scene made: ${early.length} boxes after ${ms(t)} ms`);
  t = performance.now();
  const opened: any = openSession(nokernel, text); // eslint-disable-line @typescript-eslint/no-explicit-any
  const tOpen = ms(t);
  const sc = scene(opened.value);
  t = performance.now();
  const g: any = { ...graphOf(sc), names: true }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const tGraph = ms(t);
  t = performance.now();
  const sketches = new Map<string, Op>(g.ops.filter((o: Op) => o.type === "sketch").map((o: Op) => [o.id, o]));
  const parts = g.ops.filter((o: Op) => o.type === "extrude").map((x: Op) => ({ step: String(x.id).slice(2), x, box: ghostOf(sketches.get(x.profile)!, x) })).filter((p: { box: Box | null }) => p.box);
  // groups: parts whose boxes meet are one group (union-find), by a grid of cells so that it is not a square of the parts
  const parent = parts.map((_: unknown, i: number) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const cell = (v: number) => Math.floor(v / 20);
  const grid = new Map<string, number[]>();
  parts.forEach((p: { box: Box }, i: number) => { for (let cx = cell(p.box.min[0]!); cx <= cell(p.box.max[0]!); cx++) for (let cy = cell(p.box.min[1]!); cy <= cell(p.box.max[1]!); cy++) { const k = `${cx},${cy}`; for (const j of grid.get(k) ?? []) if (overlap(p.box, parts[j].box)) parent[find(i)] = find(j); grid.set(k, [...(grid.get(k) ?? []), i]); } });
  const byGroup = new Map<number, number[]>();
  parts.forEach((_: unknown, i: number) => byGroup.set(find(i), [...(byGroup.get(find(i)) ?? []), i]));
  const camera = [0, 0, 30];
  const groups = [...byGroup.values()].map((ix) => { const bs = ix.map((i) => parts[i].box as Box); const c = [0, 1, 2].map((k) => (Math.min(...bs.map((b) => b.min[k]!)) + Math.max(...bs.map((b) => b.max[k]!))) / 2); return { ix, dist: Math.hypot(c[0]! - camera[0]!, c[1]! - camera[1]!, c[2]! - camera[2]!) }; }).sort((a, b) => a.dist - b.dist);
  const tGhosts = ms(t);
  console.log(`# PL ${file.split("/").pop()}: ${parts.length} parts, ${groups.length} groups. Page only: open ${tOpen} ms, the graph ${tGraph} ms, the ghosts and groups ${tGhosts} ms: a picture of every part after ${tOpen + tGraph + tGhosts} ms`);
  // build the groups alone, nearest first
  clearKernelCaches();
  const marks = [1, 10, Math.ceil(groups.length / 4), Math.ceil(groups.length / 2), groups.length];
  const done: string[] = [];
  t = performance.now();
  let built = 0, bodies = 0, volume = 0;
  for (const grp of groups) {
    const steps = new Set(grp.ix.map((i: number) => parts[i].step));
    let prev: string | null = null;
    const ops = g.ops.filter((o: Op) => [...steps].some((s) => o.id === `s_${s}` || String(o.id).startsWith(`s_${s}h`) || o.id === `x_${s}`)).map((o: Op) => {
      if (o.type !== "extrude") return o;
      const r = { ...o, ...(prev ? { target: prev } : { mode: "add" }) }; if (!prev) delete r.target; prev = o.id; return r;
    });
    const r: any = kernel.evaluate({ ...g, ops } as never); // eslint-disable-line @typescript-eslint/no-explicit-any
    built++; bodies += (r.bodies ?? []).length; volume += r.volume ?? 0;
    if (marks.includes(built)) done.push(`${built} groups ${ms(t)} ms`);
  }
  const tAll = ms(t);
  console.log(`# PL pieces built nearest first: ${done.join("; ")}; bodies ${bodies}, volume ${Math.round(volume)}; the first picture of a real part after ${tOpen + tGraph + tGhosts + 0} ms + the first group`);
  if (process.env.WHOLE) {
    clearKernelCaches();
    t = performance.now();
    const w: any = kernel.evaluate(g); // eslint-disable-line @typescript-eslint/no-explicit-any
    const tWhole = ms(t);
    console.log(`# PL the whole in one go (cold): ${tWhole} ms; bodies ${(w.bodies ?? []).length}, volume ${Math.round(w.volume ?? 0)}; pieces in all ${tAll} ms = ${(tWhole / Math.max(1, tAll)).toFixed(1)} times quicker`);
  }
  console.log(`# PL total wall ${ms(T0)} ms`);
});

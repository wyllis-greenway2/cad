// A dev stress run (not a test, `in_1444`, `in_1541`): random models built the way a person builds them (a profile, an extrude, then many operations on faces and edges picked from the part as it is),
// with the engine's promises checked after every step and after random edits:
//   1. nothing throws; every step is ok, flagged or orphaned, and a flagged or orphaned step says why
//   2. an ok body is a valid solid with a positive finite volume
//   3. a fresh build of the same recipe gives the same fingerprints as the live engine (edit equals fresh build)
//   4. a number edited and put back gives the first fingerprints again
//   5. time per step, and how it grows with the length of the chain
// A model that fails is written to the output with its seed so it can be replayed.
//   node --experimental-strip-types dev/stress.ts [models] [seed] [steps]
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
const MODELS = Number(process.argv[2] ?? 20), SEED = Number(process.argv[3] ?? 1), LEN = Number(process.argv[4] ?? 12);

let s = SEED; const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const num = (lo: number, hi: number) => Math.round((lo + rnd() * (hi - lo)) * 4) / 4;

type Ev = { model: number; op: string; ms: number; kind: string; why: string };
const tally: Record<string, { ok: number; flagged: number; orphaned: number; ms: number; whys: Record<string, number> }> = {};
const problems: string[] = [];
const events: Ev[] = [];
const note = (op: string, kind: string, why: string, ms: number) => {
  const t = (tally[op] ??= { ok: 0, flagged: 0, orphaned: 0, ms: 0, whys: {} }); (t as any)[kind]++; t.ms += ms;
  if (kind !== "ok") { const k = why.replace(/[-\d.]+/g, "#").slice(0, 90); t.whys[k] = (t.whys[k] ?? 0) + 1; }
};
const lastBody = (e: Engine): Body | null => { const ids = e.ids(); for (let i = ids.length - 1; i >= 0; i--) { const r = e.result(ids[i]!); if (r.status.kind === "ok" && r.value instanceof Body) return r.value; } return null; };
const lastBodyId = (e: Engine): string | null => { const ids = e.ids(); for (let i = ids.length - 1; i >= 0; i--) { const r = e.result(ids[i]!); if (r.status.kind === "ok" && r.value instanceof Body) return ids[i]!; } return null; };

const profile = (): Step[] => {
  const kind = pick(["rect", "rect", "poly", "circle", "L"]);
  const w = num(20, 60), h = num(15, 45);
  const sk: Step = kind === "circle" ? { id: "s", kind: "sketchCircle", params: { r: num(8, 25), at: [0, 0] }, inputs: [] }
    : kind === "poly" ? { id: "s", kind: "sketchPolygon", params: { points: [[0, 0], [w, 0], [w * 0.8, h], [w * 0.1, h * 0.9]] }, inputs: [] }
    : kind === "L" ? { id: "s", kind: "sketchPolygon", params: { points: [[0, 0], [w, 0], [w, h * 0.4], [w * 0.4, h * 0.4], [w * 0.4, h], [0, h]] }, inputs: [] }
    : { id: "s", kind: "sketchPolygon", params: { points: [[0, 0], [w, 0], [w, h], [0, h]] }, inputs: [] };
  return [sk, { id: "A", kind: "extrude", params: { d: num(6, 30) }, inputs: ["s"] }];
};
const planar = (b: Body) => b.faces.filter((f) => K.facts(f.h).type === "PLANE");
const round = (b: Body) => b.faces.filter((f) => K.facts(f.h).type === "CYLINDRE");

/** one random operation on the part as it is now: the step to try, and its name */
function randomOp(e: Engine, n: number): { op: string; step: Step } | null {
  const bid = lastBodyId(e); if (!bid) return null; const b = lastBody(e)!; const id = `X${n}`;
  const faces = planar(b), edges = b.edges().filter((x) => x.ref);
  const op = pick(["hole", "hole", "push", "push", "moveFace", "round", "round", "chamfer", "shell", "offsetFace", "pattern", "mirror", "counterbore", "holeThrough", "pushNeg", "roundBig"]);
  const bb = (() => { const v = K.volume(b.solid); return Math.cbrt(v); })();
  switch (op) {
    case "hole": case "counterbore": case "holeThrough": {
      if (!faces.length) return null; const f = pick(faces), d = num(2, Math.max(3, bb * 0.5));
      const p: Record<string, unknown> = { face: f.id, diameter: d, depth: op === "holeThrough" ? "through" : num(1, bb), at: [num(-bb * 0.4, bb * 0.4), num(-bb * 0.4, bb * 0.4)] };
      if (op === "counterbore") p.counterbore = { diameter: d * 1.6, depth: num(0.5, 3) };
      return { op, step: { id, kind: "hole", params: p, inputs: [bid] } };
    }
    case "push": case "pushNeg": {
      if (!faces.length) return null; const f = pick(faces);
      return { op: "push", step: { id, kind: "push", params: { face: f.id, dist: (op === "pushNeg" ? -1 : 1) * num(0.5, bb * 0.6) }, inputs: [bid] } };
    }
    case "moveFace": { if (!faces.length) return null; return { op, step: { id, kind: "moveFace", params: { face: pick(faces).id, dist: num(-bb * 0.4, bb * 0.5) }, inputs: [bid] } }; }
    case "offsetFace": { const r = round(b); if (!r.length) return null; return { op, step: { id, kind: "offsetFace", params: { face: pick(r).id, dist: num(-2, 4) }, inputs: [bid] } }; }
    case "round": case "chamfer": case "roundBig": {
      if (!edges.length) return null; const k = 1 + Math.floor(rnd() * 3), es = Array.from({ length: k }, () => pick(edges).ref!);
      const size = op === "roundBig" ? num(bb * 0.3, bb * 0.8) : num(0.25, Math.max(0.5, bb * 0.2));
      return { op, step: { id, kind: "round", params: { edges: es, size, ...(op === "chamfer" ? { mode: "chamfer" } : {}) }, inputs: [bid] } };
    }
    case "shell": { if (!faces.length) return null; return { op, step: { id, kind: "shell", params: { face: pick(faces).id, t: num(0.5, Math.max(1, bb * 0.2)) }, inputs: [bid] } }; }
    case "pattern": {
      return pick([0, 1]) ? { op, step: { id, kind: "pattern", params: { kind: "linear", by: [num(bb * 2, bb * 4), 0, 0], count: 2 + Math.floor(rnd() * 3) }, inputs: [bid] } }
        : { op, step: { id, kind: "pattern", params: { kind: "circular", axis: { point: [0, 0, 0], dir: [0, 0, 1] }, count: 2 + Math.floor(rnd() * 4) }, inputs: [bid] } };
    }
    case "mirror": return { op, step: { id, kind: "mirror", params: { plane: { point: [num(-bb * 3, -bb * 2), 0, 0], normal: [1, 0, 0] } }, inputs: [bid] } };
  }
  return null;
}

/** the number inside a step that an edit can change, as a path (for the edit and put-back check) */
const tweakable = (st: Step): [string, number][] => {
  const p = st.params as Record<string, unknown>; const out: [string, number][] = [];
  for (const k of ["d", "dist", "size", "diameter", "t"]) if (typeof p[k] === "number") out.push([k, p[k] as number]);
  return out;
};

let totalModels = 0, bad = 0;
const t0 = Date.now(), perLen: number[][] = [];
for (let m = 0; m < MODELS; m++) {
  const mseed = s; totalModels++;
  let e: Engine; const trace: string[] = [];
  try {
    e = new Engine(profile()); e.build();
    for (let n = 0; n < LEN; n++) {
      const o = randomOp(e, n); if (!o) continue;
      const before = Date.now(); let c: any;
      try { c = e.insert(o.step); } catch (x) { problems.push(`model ${m} (seed ${mseed}) op ${o.op}: THREW ${(x as Error).message.slice(0, 160)}`); bad++; break; }
      const ms = Date.now() - before; const r = e.result(o.step.id), k = r.status.kind, why = (r.status as { why?: string }).why ?? "";
      note(o.op, k, why, ms); events.push({ model: m, op: o.op, ms, kind: k, why }); (perLen[n] ??= []).push(ms);
      trace.push(`${o.op}:${k}`);
      if (k !== "ok" && !why) problems.push(`model ${m} (seed ${mseed}) ${o.op}: ${k} with no reason`);
      if (k === "ok" && r.value instanceof Body) {
        const v = K.volume(r.value.solid);
        if (!(v > 1e-6) || !Number.isFinite(v)) problems.push(`model ${m} (seed ${mseed}) ${o.op}: ok but volume ${v}`);
      }
      // a step that did not work is taken back out, as a person would (the chain goes on from the last good body)
      if (k !== "ok") e.remove(o.step.id);
    }
    // 3. fresh build equals the live engine
    const rec = e.recipe(), fresh = new Engine(rec); fresh.build();
    for (const id of rec.map((x) => x.id)) if (e.result(id).fingerprint !== fresh.result(id).fingerprint) { problems.push(`model ${m} (seed ${mseed}): live differs from fresh at ${id} [${trace.join(" ")}]`); bad++; break; }
    fresh.release();
    // 4. edit and put back
    const cands = rec.filter((x) => tweakable(x).length);
    if (cands.length) {
      const st = pick(cands), [key, val] = pick(tweakable(st)), before = Object.fromEntries(rec.map((x) => [x.id, e.result(x.id).fingerprint]));
      const edited = { ...st.params, [key]: val * 1.25 };
      try {
        e.edit(st.id, edited);
        const rec2 = e.recipe(), f2 = new Engine(rec2); f2.build();
        for (const id of rec2.map((x) => x.id)) if (e.result(id).fingerprint !== f2.result(id).fingerprint) { problems.push(`model ${m} (seed ${mseed}): after editing ${st.id}.${key}, live differs from fresh at ${id}`); bad++; break; }
        f2.release();
        e.edit(st.id, st.params);
        for (const id of Object.keys(before)) if (e.result(id).fingerprint !== before[id]) { problems.push(`model ${m} (seed ${mseed}): editing ${st.id}.${key} and back changed ${id}`); bad++; break; }
      } catch (x) { problems.push(`model ${m} (seed ${mseed}): edit of ${st.id}.${key} THREW ${(x as Error).message.slice(0, 160)}`); bad++; }
    }
    e.release();
  } catch (x) { problems.push(`model ${m} (seed ${mseed}): THREW ${(x as Error).stack?.split("\n").slice(0, 3).join(" | ").slice(0, 300)}`); bad++; }
}

console.log(`\n${totalModels} models, ${events.length} operations, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log("op            ok  flagged orphaned  ms/op   most common reasons for not working");
for (const [op, t] of Object.entries(tally).sort()) {
  const n = t.ok + t.flagged + t.orphaned, top = Object.entries(t.whys).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w, c]) => `${c}× ${w}`).join("  |  ");
  console.log(`${op.padEnd(13)} ${String(t.ok).padStart(3)} ${String(t.flagged).padStart(7)} ${String(t.orphaned).padStart(8)} ${(t.ms / n).toFixed(0).padStart(6)}   ${top}`);
}
console.log("time by position in the chain (ms/op): " + perLen.map((a, i) => a && a.length ? `${i}:${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(0)}` : "").filter(Boolean).join(" "));
console.log(problems.length ? `\n${problems.length} PROBLEMS:\n` + problems.slice(0, 40).join("\n") : "\nno problems in the engine's promises");
process.exit(problems.length ? 1 : 0);

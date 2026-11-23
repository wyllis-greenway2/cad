// The pieces of the stress runs (`dev/stress.ts`, `dev/stress-families.ts`): a seeded random source, the random operation a person might try on the part as it is, and the checks run on every model.
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { same } from "./lib.ts";
import { writeFileSync } from "node:fs";
import type { Step } from "../src/engine/steps.ts";

export interface Tally { ok: number; flagged: number; orphaned: number; ms: number; whys: Record<string, number> }
export function makeCtx(seed: number) {
  let s = seed; const ctx = {
    seed, reseed(v: number) { s = v | 0; },
    rnd: () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(ctx.rnd() * xs.length)]!,
    num: (lo: number, hi: number) => Math.round((lo + ctx.rnd() * (hi - lo)) * 4) / 4,
    tally: {} as Record<string, Tally>, problems: [] as string[], events: 0, perLen: [] as number[][], models: 0,
    note(op: string, kind: string, why: string, ms: number) {
      const t = (ctx.tally[op] ??= { ok: 0, flagged: 0, orphaned: 0, ms: 0, whys: {} }); (t as any)[kind]++; t.ms += ms;
      if (kind !== "ok") { const k = why.replace(/[-\d.]+/g, "#").slice(0, 90); t.whys[k] = (t.whys[k] ?? 0) + 1; }
    },
  };
  return ctx;
}
export type Ctx = ReturnType<typeof makeCtx>;
export const lastBody = (e: Engine): Body | null => { const ids = e.ids(); for (let i = ids.length - 1; i >= 0; i--) { const r = e.result(ids[i]!); if (r.status.kind === "ok" && r.value instanceof Body) return r.value; } return null; };
export const lastBodyId = (e: Engine): string | null => { const ids = e.ids(); for (let i = ids.length - 1; i >= 0; i--) { const r = e.result(ids[i]!); if (r.status.kind === "ok" && r.value instanceof Body) return ids[i]!; } return null; };
const planar = (b: Body) => b.faces.filter((f) => K.facts(f.h).type === "PLANE");
const round = (b: Body) => b.faces.filter((f) => K.facts(f.h).type === "CYLINDRE");

/** one random operation on the part as it is now: the step to try, and its name */
export function randomOp(c: Ctx, e: Engine, n: number): { op: string; step: Step } | null {
  const bid = lastBodyId(e); if (!bid) return null; const b = lastBody(e)!; const id = `X${n}`;
  const faces = planar(b), edges = b.edges().filter((x) => x.ref);
  const op = c.pick(["hole", "hole", "push", "push", "moveFace", "round", "round", "chamfer", "shell", "offsetFace", "pattern", "mirror", "counterbore", "holeThrough", "pushNeg", "roundBig"]);
  const bb = (() => { const v = K.volume(b.solid); return Math.cbrt(v); })();
  switch (op) {
    case "hole": case "counterbore": case "holeThrough": {
      if (!faces.length) return null; const f = c.pick(faces), d = c.num(2, Math.max(3, bb * 0.5));
      const p: Record<string, unknown> = { face: f.id, diameter: d, depth: op === "holeThrough" ? "through" : c.num(1, bb), at: [c.num(-bb * 0.4, bb * 0.4), c.num(-bb * 0.4, bb * 0.4)] };
      if (op === "counterbore") p.counterbore = { diameter: d * 1.6, depth: c.num(0.5, 3) };
      return { op, step: { id, kind: "hole", params: p, inputs: [bid] } };
    }
    case "push": case "pushNeg": {
      if (!faces.length) return null; const f = c.pick(faces);
      return { op: "push", step: { id, kind: "push", params: { face: f.id, dist: (op === "pushNeg" ? -1 : 1) * c.num(0.5, bb * 0.6) }, inputs: [bid] } };
    }
    case "moveFace": { if (!faces.length) return null; return { op, step: { id, kind: "moveFace", params: { face: c.pick(faces).id, dist: c.num(-bb * 0.4, bb * 0.5) }, inputs: [bid] } }; }
    case "offsetFace": { const r = round(b); if (!r.length) return null; return { op, step: { id, kind: "offsetFace", params: { face: c.pick(r).id, dist: c.num(-2, 4) }, inputs: [bid] } }; }
    case "round": case "chamfer": case "roundBig": {
      if (!edges.length) return null; const k = 1 + Math.floor(c.rnd() * 3), es = Array.from({ length: k }, () => c.pick(edges).ref!);
      const size = op === "roundBig" ? c.num(bb * 0.3, bb * 0.8) : c.num(0.25, Math.max(0.5, bb * 0.2));
      return { op, step: { id, kind: "round", params: { edges: es, size, ...(op === "chamfer" ? { mode: "chamfer" } : {}) }, inputs: [bid] } };
    }
    case "shell": { if (!faces.length) return null; return { op, step: { id, kind: "shell", params: { face: c.pick(faces).id, t: c.num(0.5, Math.max(1, bb * 0.2)) }, inputs: [bid] } }; }
    case "pattern": {
      return c.pick([0, 1]) ? { op, step: { id, kind: "pattern", params: { kind: "linear", by: [c.num(bb * 2, bb * 4), 0, 0], count: 2 + Math.floor(c.rnd() * 3) }, inputs: [bid] } }
        : { op, step: { id, kind: "pattern", params: { kind: "circular", axis: { point: [0, 0, 0], dir: [0, 0, 1] }, count: 2 + Math.floor(c.rnd() * 4) }, inputs: [bid] } };
    }
    case "mirror": return { op, step: { id, kind: "mirror", params: { plane: { point: [c.num(-bb * 3, -bb * 2), 0, 0], normal: [1, 0, 0] } }, inputs: [bid] } };
  }
  return null;
}

/** the number inside a step that an edit can change, as a path (for the edit and put-back check) */
export const tweakable = (st: Step): [string, number][] => {
  const p = st.params as Record<string, unknown>; const out: [string, number][] = [];
  for (const k of ["d", "dist", "size", "diameter", "t"]) if (typeof p[k] === "number") out.push([k, p[k] as number]);
  return out;
};

/** the whole run of one model: random operations on the part, the checks after each, and at the end the live engine against a fresh build and an edit put back; `extra` is a check that belongs to a family of models */
export function driveModel(c: Ctx, m: number, mseed: string, e: Engine, len: number, extra?: (e: Engine) => string[]): void {
  const { problems, pick } = c; const SEED = c.seed; let bad = 0; const pBefore = problems.length, trace: string[] = [];
  try {
    for (let n = 0; n < len; n++) {
      const o = randomOp(c, e, n); if (!o) continue;
      const before = Date.now();
      try { e.insert(o.step); } catch (x) { problems.push(`model ${m} (seed ${mseed}) op ${o.op}: THREW ${(x as Error).message.slice(0, 160)}`); bad++; break; }
      const ms = Date.now() - before; const r = e.result(o.step.id), k = r.status.kind, why = (r.status as { why?: string }).why ?? "";
      c.note(o.op, k, why, ms); c.events++; (c.perLen[n] ??= []).push(ms);
      // 6. nothing the engine holds was changed in place by a later step (still valid, and the fingerprint read again is the one kept)
      for (const i of e.ids()) { const q = e.result(i); if (q.status.kind === "ok" && q.value instanceof Body && (!K.valid(q.value.solid) || !same(q.value.fingerprint(), q.fingerprint))) { problems.push(`model ${m} (seed ${mseed}): after ${o.op}, the body of ${i} was changed in place`); break; } }
      trace.push(`${o.op}:${k}`); if (k === "orphaned") { const f = `/tmp/orphan-${SEED}-${m}-${n}.json`; writeFileSync(f, JSON.stringify([...e.recipe().filter((x) => x.id !== o.step.id), o.step])); }
      if (k !== "ok" && !why) problems.push(`model ${m} (seed ${mseed}) ${o.op}: ${k} with no reason`);
      if (k === "ok" && r.value instanceof Body) {
        const v = K.volume(r.value.solid);
        if (!(v > 1e-6) || !Number.isFinite(v)) problems.push(`model ${m} (seed ${mseed}) ${o.op}: ok but volume ${v}`);
      }
      // a round that did not work at its size: does it work smaller? one that fails even at a twentieth of the size is a kernel failure, not a size that is too big
      if (k !== "ok" && (o.op === "round" || o.op === "chamfer") && /could not|kernel/.test(why)) {
        let works = false; for (const f of [0.25, 0.05]) { e.edit(o.step.id, { ...o.step.params, size: (o.step.params as { size: number }).size * f }); if (e.result(o.step.id).status.kind === "ok") { works = true; break; } }
        const tn = (c.tally[o.op + " (smaller works)"] ??= { ok: 0, flagged: 0, orphaned: 0, ms: 0, whys: {} }); (works ? tn : (c.tally[o.op + " (fails at any size)"] ??= { ok: 0, flagged: 0, orphaned: 0, ms: 0, whys: {} })).flagged++;
        if (!works) { const f = `/tmp/anysize-${SEED}-${m}-${n}.json`; writeFileSync(f, JSON.stringify(e.recipe())); }
        e.edit(o.step.id, o.step.params);
      }
      if (k !== "ok") e.remove(o.step.id); // a step that did not work is taken back out, as a person would (the chain goes on from the last good body)
    }
    // 3. fresh build equals the live engine
    const rec = e.recipe(), fresh = new Engine(rec); fresh.build();
    for (const id of rec.map((x) => x.id)) if (!same(e.result(id).fingerprint, fresh.result(id).fingerprint)) { const x = e.result(id).fingerprint, y = fresh.result(id).fingerprint; let k = 0; while (x[k] === y[k]) k++; problems.push(`model ${m} (seed ${mseed}): live differs from fresh at ${id} [${trace.join(" ")}]; first difference at ${k}: ${x.slice(Math.max(0, k - 80), k + 80)}  =>  ${y.slice(Math.max(0, k - 80), k + 80)}; status ${e.result(id).status.kind} / ${fresh.result(id).status.kind}`); break; }
    fresh.release();
    // 4. edit and put back
    const cands = rec.filter((x) => tweakable(x).length);
    if (cands.length) {
      const st = pick(cands), [key, val] = pick(tweakable(st)), before = Object.fromEntries(rec.map((x) => [x.id, e.result(x.id).fingerprint]));
      const edited = { ...st.params, [key]: val * 1.25 };
      try {
        e.edit(st.id, edited);
        const rec2 = e.recipe(), f2 = new Engine(rec2); f2.build();
        for (const id of rec2.map((x) => x.id)) if (!same(e.result(id).fingerprint, f2.result(id).fingerprint)) { problems.push(`model ${m} (seed ${mseed}): after editing ${st.id}.${key}, live differs from fresh at ${id}`); break; }
        f2.release();
        e.edit(st.id, st.params);
        for (const id of Object.keys(before)) if (!same(e.result(id).fingerprint, before[id]!)) { const x = before[id]!, y = e.result(id).fingerprint; let k = 0; while (x[k] === y[k]) k++; problems.push(`model ${m} (seed ${mseed}): editing ${st.id}.${key} and back changed ${id}; first difference at ${k}: ${x.slice(Math.max(0, k - 60), k + 60)}  =>  ${y.slice(Math.max(0, k - 60), k + 60)}`); break; }
      } catch (x) { problems.push(`model ${m} (seed ${mseed}): edit of ${st.id}.${key} THREW ${(x as Error).message.slice(0, 160)}`); }
    }
    for (const w of extra?.(e) ?? []) problems.push(`model ${m} (seed ${mseed}): ${w}`);
    if (problems.length > pBefore) { const f = `/tmp/stress-model-${SEED}-${m}.json`; writeFileSync(f, JSON.stringify(e.recipe(), null, 1)); problems.push(`  recipe saved in ${f}`); }
    e.release();
  } catch (x) { problems.push(`model ${m} (seed ${mseed}): THREW ${(x as Error).stack?.split("\n").slice(0, 3).join(" | ").slice(0, 300)}`); }
}

export function report(c: Ctx, started: number): number {
  console.log(`\n${c.models} models, ${c.events} operations, ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log("op            ok  flagged orphaned  ms/op   most common reasons for not working");
  for (const [op, t] of Object.entries(c.tally).sort()) {
    const n = t.ok + t.flagged + t.orphaned, top = Object.entries(t.whys).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w, k]) => `${k}× ${w}`).join("  |  ");
    console.log(`${op.padEnd(13)} ${String(t.ok).padStart(3)} ${String(t.flagged).padStart(7)} ${String(t.orphaned).padStart(8)} ${(t.ms / n).toFixed(0).padStart(6)}   ${top}`);
  }
  console.log("time by position in the chain (ms/op): " + c.perLen.map((a, i) => a && a.length ? `${i}:${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(0)}` : "").filter(Boolean).join(" "));
  console.log(c.problems.length ? `\n${c.problems.length} PROBLEMS:\n` + c.problems.slice(0, 40).join("\n") : "\nno problems in the engine's promises");
  return c.problems.length ? 1 : 0;
}

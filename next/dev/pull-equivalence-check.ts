// A dev check (not a test, `in_1444`) for E31: a pull made as a later step must give the body that the original step would have given with the final number typed in.
//   node --experimental-strip-types dev/pull-equivalence-check.ts [random cases] [seed]
// Part 1: the ring and the nearly tangent hole (the human's example): the hole cut short, its end pushed on, against the hole cut to full depth.
// Part 2: random pockets in a block: a pocket's end face pushed by a random distance, against the same pocket with its depth changed.
// For each pair: both built; same volume; same faces (kind, area, place); same ids on them. The outcomes are counted, and every mismatch is printed.
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { idKey, mint } from "../src/engine/id.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
const N = Number(process.argv[2] ?? 150); let seed = Number(process.argv[3] ?? 1);
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const between = (a: number, b: number) => a + rnd() * (b - a), round = (x: number, k = 2) => Math.round(x * 10 ** k) / 10 ** k;

type Out = { ok: true; body: Body; e: Engine } | { ok: false; why: string; e: Engine };
const build = (steps: Step[]): Out => {
  const e = new Engine(steps); e.build(); const bad = steps.map((s) => e.result(s.id)).find((r) => r.status.kind !== "ok");
  if (bad) return { ok: false, why: ("why" in bad.status ? bad.status.why : "") || bad.status.kind, e };
  const v = e.result(steps[steps.length - 1]!.id).value; return v instanceof Body ? { ok: true, body: v, e } : { ok: false, why: "no body", e };
};
const faceKey = (b: Body) => b.faces.map((f) => { const q = K.facts(f.h); return { type: q.type, area: q.area, ce: q.ce, ids: [f.id, ...f.alias].map(idKey).sort(), lead: idKey(f.id) }; });
type Verdict = { kind: "same" | "differs" | "pull refused" | "fresh refused" | "both refused"; detail: string };
function compare(pull: Out, fresh: Out): Verdict {
  if (!pull.ok && !fresh.ok) return { kind: "both refused", detail: `${pull.why}` };
  if (!pull.ok) return { kind: "pull refused", detail: pull.why };
  if (!fresh.ok) return { kind: "fresh refused", detail: fresh.why };
  const va = K.volume(pull.body.solid), vb = K.volume(fresh.body.solid), fa = faceKey(pull.body), fb = faceKey(fresh.body), why: string[] = [];
  if (Math.abs(va - vb) > 1e-6 * Math.max(va, vb)) why.push(`volume ${va.toFixed(4)} vs ${vb.toFixed(4)} (diff ${(va - vb).toExponential(2)})`);
  if (fa.length !== fb.length) why.push(`${fa.length} faces vs ${fb.length}`);
  let unmatched = 0, idDiff = 0, extra = 0; const used = new Set<number>();
  for (const f of fa) {
    const j = fb.findIndex((g, i) => !used.has(i) && g.type === f.type && Math.abs(g.area - f.area) < 1e-4 * Math.max(1, f.area) && g.ce.every((v, k) => Math.abs(v - f.ce[k]!) < 1e-3));
    if (j < 0) { unmatched++; continue; } used.add(j); const g = fb[j]!; if (g.lead !== f.lead || !g.ids.every((x) => f.ids.includes(x))) idDiff++; else if (f.ids.length > g.ids.length) extra++;
  }
  if (unmatched) why.push(`${unmatched} faces with no equal face`);
  if (idDiff) why.push(`${idDiff} faces whose lead id or ids differ`);
  return why.length ? { kind: "differs", detail: why.join("; ") } : { kind: "same", detail: extra ? `${extra} faces answer to extra ids of the push` : "" };
}
const done = (...o: Out[]) => o.forEach((x) => x.e.release());
const tally = (name: string, vs: Verdict[]) => { const c: Record<string, number> = {}; for (const v of vs) c[v.kind] = (c[v.kind] ?? 0) + 1; console.log(`${name}: ${vs.length} cases; ` + Object.entries(c).map(([k, n]) => `${n} ${k}`).join(", ")); };

// ---------------------------------------------------------------- part 1: the ring and the hole that nearly grazes the bore
console.log("Part 1: ring r=12..20, h=30; a hole of radius 3 along x that reaches `eps` into the width of the bore; cut short (gap before the bore wall), then its end pushed on");
const ringSteps = (): Step[] => [
  { id: "o", kind: "sketchCircle", params: { r: 20 }, inputs: [] }, { id: "i", kind: "sketchCircle", params: { r: 12 }, inputs: [] },
  { id: "R", kind: "extrude", params: { d: 30 }, inputs: ["o", "i"] },
];
const holeSteps = (y0: number, len: number): Step[] => [
  { id: "sk", kind: "sketchCircle", params: { plane: "YZ", offset: -30, center: [y0, 15], r: 3 }, inputs: [] },
  { id: "T", kind: "extrude", params: { d: len }, inputs: ["sk"] }, { id: "H", kind: "combine", params: { mode: "cut" }, inputs: ["R", "T"] },
];
const p1: Verdict[] = [];
console.log("   eps       gap   result");
for (const eps of [0.3, 0.03, 0.003, 1e-4, 0]) for (const gap of [1, 0.2]) {
  const y0 = 12 - eps + 3, wall = -Math.sqrt(Math.max(0, 144 - (12 - eps) ** 2)), stop = wall - gap, past = 1;
  const fresh = build([...ringSteps(), ...holeSteps(y0, past + 30)]);
  const pull = build([...ringSteps(), ...holeSteps(y0, stop + 30), { id: "P", kind: "push", params: { face: mint("T", "end"), dist: -(past - stop) }, inputs: ["H"] }]);
  const v = compare(pull, fresh); p1.push(v); console.log(`   ${String(eps).padEnd(8)} ${String(gap).padEnd(5)} ${v.kind}${v.detail ? ": " + v.detail : ""}`); done(pull, fresh);
}
tally("Part 1", p1);

// ---------------------------------------------------------------- part 2: random pockets pushed
const p2: Verdict[] = [], p2o: Verdict[] = [], shown: string[] = [];
for (let n = 0; n < N; n++) {
  const W = round(between(30, 80)), Hh = round(between(20, 60)), D = round(between(15, 40)), k = 1 + Math.floor(rnd() * 3);
  const feats = Array.from({ length: k }, () => {
    const side = ["top", "front", "right"][Math.floor(rnd() * 3)]!, round2 = rnd() < 0.6, depth = round(between(3, 0.6 * (side === "top" ? D : side === "front" ? Hh : W)));
    return { side, circle: round2, depth, c: [round(between(0.25, 0.75) * (side === "right" ? Hh : W)), round(between(0.25, 0.75) * (side === "top" ? Hh : D))] as [number, number], size: round(between(2, 8)) };
  });
  const box = (f: (typeof feats)[number]) => f.side === "top" ? [f.c[0] - f.size, f.c[0] + f.size, f.c[1] - f.size, f.c[1] + f.size, D - f.depth - 3, D + 1] : f.side === "front" ? [f.c[0] - f.size, f.c[0] + f.size, -1, f.depth + 3, f.c[1] - f.size, f.c[1] + f.size] : [W - f.depth - 3, W + 1, f.c[0] - f.size, f.c[0] + f.size, f.c[1] - f.size, f.c[1] + f.size];
  const meets = feats.some((a, i) => feats.some((b, j) => j > i && [0, 2, 4].every((q) => box(a)[q]! < box(b)[q + 1]! && box(b)[q]! < box(a)[q + 1]!))); // do two tools reach the same place?
  const pick = Math.floor(rnd() * k), f0 = feats[pick]!, extent = f0.side === "top" ? D : f0.side === "front" ? Hh : W, delta = round(between(-(0.85 * extent - f0.depth), 0.9 * f0.depth)); // out of the pocket (positive) or deeper (negative), the pocket staying inside the block
  const make = (depths: number[], push?: { feat: number; dist: number }): Step[] => {
    const steps: Step[] = [{ id: "b", kind: "sketchPolygon", params: { points: [[0, 0], [W, 0], [W, Hh], [0, Hh]] }, inputs: [] }, { id: "B", kind: "extrude", params: { d: D }, inputs: ["b"] }];
    let prev = "B";
    feats.forEach((f, i) => {
      // a tool starting 1 mm outside the face, running inward `depth + 1`
      const plane = f.side === "top" ? { plane: "XY", offset: D + 1, dir: [0, 0, -1] } : f.side === "front" ? { plane: "XZ", offset: 1, dir: [0, 1, 0] } : { plane: "YZ", offset: W + 1, dir: [-1, 0, 0] };
      const sk: Step = f.circle ? { id: `s${i}`, kind: "sketchCircle", params: { ...plane, center: f.c, r: f.size }, inputs: [] }
        : { id: `s${i}`, kind: "sketchPolygon", params: { ...plane, points: [[f.c[0] - f.size, f.c[1] - f.size], [f.c[0] + f.size, f.c[1] - f.size], [f.c[0] + f.size, f.c[1] + f.size], [f.c[0] - f.size, f.c[1] + f.size]] }, inputs: [] };
      steps.push(sk, { id: `T${i}`, kind: "extrude", params: { d: depths[i]! + 1, dir: plane.dir }, inputs: [sk.id] }, { id: `C${i}`, kind: "combine", params: { mode: "cut" }, inputs: [prev, `T${i}`] }); prev = `C${i}`;
    });
    if (push) steps.push({ id: "P", kind: "push", params: { face: mint(`T${push.feat}`, "end"), dist: push.dist }, inputs: [prev] });
    return steps;
  };
  const depths = feats.map((f) => f.depth), fin = depths.map((d, i) => (i === pick ? d + (-delta) : d)); // pushing the pocket's end by `delta` along the face's outward normal (into the pocket) shrinks the depth
  const fresh = build(make(fin)), pull = build(make(depths, { feat: pick, dist: delta }));
  if (process.env.CASE && Number(process.env.CASE) === n && pull.ok && fresh.ok) for (const [name, o] of [["pulled", pull], ["fresh", fresh]] as const) { console.log(`${name}: ${o.body.faces.length} faces`); for (const f of o.body.faces) { const q = K.facts(f.h); console.log(`   ${q.type.padEnd(9)} area ${q.area.toFixed(3).padStart(9)} at ${q.ce.map((x) => x.toFixed(1)).join(",").padEnd(18)} ${[f.id, ...f.alias].map(idKey).join(" | ").slice(0, 110)}`); } }
  if (process.env.CASE && Number(process.env.CASE) === n && pull.ok) for (const e of pull.body.edges()) if (e.faces.length === 2 && e.faces.every((f) => K.facts(f.h).type === "CYLINDRE")) { const [a, b] = K.edgeEnds(e.h); console.log("   edge between two cylinder faces: ends", a.map((x) => x.toFixed(3)).join(","), "to", b.map((x) => x.toFixed(3)).join(","), "mid", K.edgeMid(e.h).map((x) => x.toFixed(3)).join(",")); }
  const v = compare(pull, fresh); (meets ? p2o : p2).push(v); if (v.kind !== "same" && !meets && shown.length < 12) shown.push(`case ${n}: ${v.kind}: ${v.detail}  (${JSON.stringify({ W, Hh, D, pick, delta, feats })})`); done(pull, fresh);
}
console.log(); tally("Part 2, pockets that do not meet", p2); tally("Part 2, pockets that meet another (a pushed face is only what is left of the pocket's end, so the two are different on purpose, mode 2 against mode 1)", p2o); shown.forEach((s) => console.log("  " + s.slice(0, 420)));

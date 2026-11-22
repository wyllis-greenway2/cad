// A dev check (not a test, `in_1444`) for copies of a body (E44 to E47): linear and circular patterns, a mirror, a feature repeated (a pattern of a tool, then one combine), the ids of the copies, an edit of the count.
//   node --experimental-strip-types dev/pattern-check.ts [random cases] [seed]
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { idKey, mint } from "../src/engine/id.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
const N = Number(process.argv[2] ?? 20); let seed = Number(process.argv[3] ?? 1);
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
import { check, fail, failureCount } from "./lib.ts";
const box = (x: number, w = 10, h = 10, id = "1"): Step[] => [{ id: `s${id}`, kind: "sketchPolygon", params: { points: [[x, 0], [x + w, 0], [x + w, 10], [x, 10]] }, inputs: [] }, { id: `E${id}`, kind: "extrude", params: { d: h }, inputs: [`s${id}`] }];
const build = (steps: Step[]) => { const e = new Engine(steps); e.build(); return e; };
const scene = (e: Engine, id: string) => e.result(id).value as Body;
const bodyVol = (b: Body) => { const idx = K.solidIndexOfFaces(b.solid), all = K.solidsOf(b.solid); const v = b.bodies.map((r) => K.volume(all[idx[b.faces.indexOf(r.faces[0]!)]!]!)); all.forEach((s) => s.release()); return v; };
const invariants = (b: Body, label: string) => {
  const all = b.bodies.flatMap((x) => x.faces); const keys = b.bodies.map((x) => idKey(x.id)), fk = b.faces.map((f) => idKey(f.id));
  const bad = all.length !== b.faces.length || new Set(all).size !== all.length || new Set(keys).size !== keys.length || new Set(fk).size !== fk.length || b.faces.some((f) => f.defect);
  if (bad) check(`${label}: every face in one body; body names unique; face ids unique; no unnamed face`, false, `${all.length}/${b.faces.length} faces, ${new Set(keys).size}/${keys.length} bodies, ${new Set(fk).size}/${fk.length} face ids`);
};
const base = box(0), top = mint("E1", "end"), copyTop = (step: string, n: number) => mint(step, "copy", top, n);

console.log("1. a linear pattern");
{
  const e = build([...base, { id: "P", kind: "pattern", params: { kind: "linear", by: [20, 0, 0], count: 4 }, inputs: ["E1"] }]), p = scene(e, "P");
  check("four bodies of 1000 mm3, the original and three copies", p.bodies.length === 4 && bodyVol(p).every((v) => Math.abs(v - 1000) < 1e-6), `${p.bodies.length} bodies`);
  check("the original keeps its names; the copies' faces and bodies are named from it and their number", p.bodies.some((b) => idKey(b.id) === idKey(mint("E1", "body", 0))) && p.faces.some((f) => idKey(f.id) === idKey(copyTop("P", 3))) && p.bodies.some((b) => idKey(b.id) === idKey(mint("P", "body", mint("E1", "body", 0), 2))));
  const xs = p.bodies.map((b) => Math.min(...b.faces.map((f) => K.facts(f.h).lo[0]))).sort((a, b) => a - b); check("the copies stand 20 apart", xs.every((x, i) => Math.abs(x - 20 * i) < 1e-6), xs.join(","));
  invariants(p, "P"); e.release();
}
console.log("2. a circular pattern");
{
  const e = build([...box(20, 6, 6), { id: "P", kind: "pattern", params: { kind: "circular", axis: { point: [0, 5, 0], dir: [0, 0, 1] }, count: 6 }, inputs: ["E1"] }]), p = scene(e, "P");
  check("six bodies of equal volume (360)", p.bodies.length === 6 && bodyVol(p).every((v) => Math.abs(v - 360) < 1e-6), bodyVol(p).join(",")); invariants(p, "P");
  const half = build([...box(20, 6, 6), { id: "P", kind: "pattern", params: { kind: "circular", axis: { point: [0, 5, 0], dir: [0, 0, 1] }, count: 3, deg: 180 }, inputs: ["E1"] }]); check("three bodies over 180 degrees (the first and the last are 180 apart)", scene(half, "P").bodies.length === 3); half.release(); e.release();
}
console.log("3. a mirror");
{
  const e = build([...box(2, 10, 6), { id: "M", kind: "mirror", params: { plane: { point: [0, 0, 0], normal: [1, 0, 0] } }, inputs: ["E1"] }]), m = scene(e, "M");
  check("two bodies of 600, the copy on the other side of the plane", m.bodies.length === 2 && bodyVol(m).every((v) => Math.abs(v - 600) < 1e-6) && (() => { const c = m.bodies.find((b) => idKey(b.id) === idKey(mint("M", "body", mint("E1", "body", 0), 1))); return !!c && Math.max(...c.faces.map((f) => K.facts(f.h).hi[0])) <= -2 + 1e-6; })(), e.result("M").status.kind);
  check("the mirrored faces answer to the faces they mirror", m.faces.some((f) => idKey(f.id) === idKey(mint("M", "mirror", top, 1)))); invariants(m, "M"); e.release();
}
console.log("4. a feature repeated: a pattern of the tool, then one cut");
{
  const tool: Step[] = [{ id: "st", kind: "sketchCircle", params: { plane: "XY", offset: 11, center: [5, 5], r: 2 }, inputs: [] }, { id: "T", kind: "extrude", params: { d: 12, dir: [0, 0, -1] }, inputs: ["st"] }];
  const steps = (count: number): Step[] => [...box(0, 60, 10), ...tool, { id: "P", kind: "pattern", params: { kind: "linear", by: [10, 0, 0], count }, inputs: ["T"] }, { id: "C", kind: "combine", params: { mode: "cut" }, inputs: ["E1", "P"] }];
  const e = build(steps(5)), c = scene(e, "C"); const want = 6000 - 5 * Math.PI * 4 * 10;
  check("a block with five holes: the volume is the block less five holes", e.result("C").status.kind === "ok" && c.bodies.length === 1 && Math.abs(bodyVol(c)[0]! - want) < 1e-6, `${bodyVol(c)[0]?.toFixed(3)} against ${want.toFixed(3)} (${e.result("C").status.kind})`);
  const f = build(steps(3)); e.edit("P", { kind: "linear", by: [10, 0, 0], count: 3 }); check("an edit of the count equals a fresh build", e.result("C").fingerprint === f.result("C").fingerprint); invariants(c, "C"); e.release(); f.release();
}
console.log("5. a face of one copy, named, pulled; the count edited");
{
  const steps = (count: number): Step[] => [...base, { id: "P", kind: "pattern", params: { kind: "linear", by: [20, 0, 0], count }, inputs: ["E1"] }, { id: "X", kind: "push", params: { face: copyTop("P", 2), dist: 5 }, inputs: ["P"] }];
  const e = build(steps(4)), x = scene(e, "X"), vols = bodyVol(x).sort((a, b) => a - b);
  check("only the third body grew (1500), the others stay 1000", e.result("X").status.kind === "ok" && x.bodies.length === 4 && Math.abs(vols[3]! - 1500) < 1e-6 && Math.abs(vols[0]! - 1000) < 1e-6, vols.map((v) => v.toFixed(0)).join(","));
  e.edit("P", { kind: "linear", by: [20, 0, 0], count: 2 }); const r = e.result("X"); check("with two bodies the step on the third is orphaned in words", r.status.kind === "orphaned" && /no longer there/.test((r.status as any).why), `${r.status.kind} ${(r.status as any).why}`);
  e.edit("P", { kind: "linear", by: [20, 0, 0], count: 4 }); check("and it works again with four", e.result("X").status.kind === "ok"); e.release();
}
console.log("6. refusals in words");
{
  const bad = (params: Record<string, any>, why: RegExp, label: string) => { const e = build([...base, { id: "P", kind: "pattern", params, inputs: ["E1"] }]), r = e.result("P"); check(label, r.status.kind === "flagged" && why.test((r.status as any).why), `${r.status.kind} ${(r.status as any).why ?? ""}`); e.release(); };
  bad({ kind: "linear", by: [1, 0, 0], count: 0 }, /whole number/, "a count of 0"); bad({ kind: "linear", by: [1, 0, 0], count: 2.5 }, /whole number/, "a count of 2.5"); bad({ kind: "linear", count: 3 }, /step from one body/, "no step");
  bad({ kind: "circular", count: 3 }, /axis/, "no axis");
  const two = build([...box(0, 10, 10, "1"), ...box(30, 10, 10, "2"), { id: "J", kind: "combine", params: { mode: "add" }, inputs: ["E1", "E2"] }, { id: "P", kind: "pattern", params: { kind: "linear", by: [0, 20, 0], count: 2 }, inputs: ["J"] }]);
  check("two bodies and none named: refused", two.result("P").status.kind === "flagged" && /say which one to copy/.test((two.result("P").status as any).why)); two.release();
}
console.log(`7. random: a pattern or a mirror, then a push on a copy (${N} cases)`);
{
  let ok = 0;
  for (let n = 0; n < N; n++) {
    const count = 2 + Math.floor(rnd() * 5), kind = rnd() < 0.5 ? "pattern" : "mirror", steps: Step[] = [...box(30 + Math.floor(rnd() * 20), 8, 6)];
    const params = kind === "mirror" ? { plane: { point: [0, 0, 0], normal: [[1, 0, 0], [0, 1, 0]][Math.floor(rnd() * 2)] } } : rnd() < 0.5 ? { kind: "linear", by: [0, 15, 0], count } : { kind: "circular", axis: { point: [0, 5, 0], dir: [0, 0, 1] }, count, deg: [360, 180][Math.floor(rnd() * 2)] };
    steps.push({ id: "P", kind, params, inputs: ["E1"] }); const e = build(steps), r = e.result("P");
    if (r.status.kind !== "ok") { console.log(`   case ${n}: ${r.status.kind}: ${(r.status as any).why}`); fail(); e.release(); continue; }
    const p = scene(e, "P"); invariants(p, `case ${n}`); const vs = bodyVol(p); if (vs.some((v) => Math.abs(v - vs[0]!) > 1e-6)) check(`case ${n}: all the bodies are the same size`, false, vs.join(",")); ok++; e.release();
  }
  console.log(`   ${ok} of ${N} made, bodies equal in size, every face in one body, names unique`);
}
console.log(failureCount() ? `\n${failureCount()} failureCount()` : "\nno failure"); process.exit(failureCount() ? 1 : 0);

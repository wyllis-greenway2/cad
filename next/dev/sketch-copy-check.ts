// A dev check (not a test, `in_1444`) for constraints carried to a copy of a sketch (E59): kept if they still mean the same, changed to what they have become, or dropped and said; never kept as they were when they no longer mean the same.
//   node --experimental-strip-types dev/sketch-copy-check.ts [random cases] [seed]
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { edgeRef, mint } from "../src/engine/id.ts";
import { type Motion, rectangle } from "../src/engine/sketch.ts";
import type { Sketch, Step } from "../src/engine/steps.ts";
await initKernel();
const N = Number(process.argv[2] ?? 40); let seed = Number(process.argv[3] ?? 1);
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let failures = 0; const check = (label: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ": " + detail : ""}`); };
const near = (a: number, b: number, t = 1e-8) => Math.abs(a - b) <= t;
const build = (steps: Step[]) => { const e = new Engine(steps); e.build(); return e; };
const sketch = (e: Engine, id: string) => e.result(id).value as Sketch;
const status = (e: Engine, id: string) => e.result(id).status as { kind: string; why?: string };
const pts = (s: Sketch) => s.lines.map((l) => [l.a[0], l.a[1]] as [number, number]);
const cp = (id: string, from: string, m: Motion, extra: string[] = []): Step => ({ id, kind: "sketchCopy", params: m, inputs: [from, ...extra] });
const SRC = (extra: Record<string, any> = {}): Step => ({ id: "s", kind: "sketch", params: { ...rectangle(2, 1, 10, 5), ...extra }, inputs: [] });
const rot = (p: [number, number], deg: number, mir?: number): [number, number] => { let [x, y] = p; if (mir !== undefined) { const a = (2 * mir * Math.PI) / 180; [x, y] = [Math.cos(a) * x + Math.sin(a) * y, Math.sin(a) * x - Math.cos(a) * y]; } const t = (deg * Math.PI) / 180; return [Math.cos(t) * x - Math.sin(t) * y, Math.sin(t) * x + Math.cos(t) * y]; };
const sides = (s: Sketch) => s.lines.map((l) => Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]));
const dirOf = (l: Sketch["lines"][number]) => { const d = [l.b[0] - l.a[0], l.b[1] - l.a[1]], n = Math.hypot(d[0]!, d[1]!); return [d[0]! / n, d[1]! / n]; };
const kindsOf = (s: Sketch) => ((s.definition as any).constraints as { kind: string }[]).map((c) => c.kind);

console.log("1. a copy moved without turning: every constraint is kept");
{
  const e = build([SRC(), cp("c", "s", { by: [20, 3] })]), s = sketch(e, "s"), c = sketch(e, "c");
  check("the copy is made, fully constrained, nothing dropped, nothing changed but the place", status(e, "c").kind === "ok" && c.solve?.kind === "solved" && c.carried?.dropped.length === 0 && c.carried?.changed.every((x) => x.from === "fixed"), JSON.stringify(c.carried));
  check("its corners are the source's corners moved by (20, 3)", pts(s).every((p, i) => near(pts(c)[i]![0], p[0] + 20) && near(pts(c)[i]![1], p[1] + 3)));
  e.release();
}
console.log("2. turned a quarter: level and upright swap, the distances along an axis follow");
{
  const e = build([SRC(), cp("c", "s", { deg: 90 })]), s = sketch(e, "s"), c = sketch(e, "c"), ks = kindsOf(c);
  check("nothing is dropped; the four axis relations swap (two level become upright, two upright become level)", c.carried?.dropped.length === 0 && ks.filter((k) => k === "horizontal").length === 2 && ks.filter((k) => k === "vertical").length === 2 && c.carried!.changed.filter((x) => x.from === "horizontal" || x.from === "vertical").length === 4, JSON.stringify(c.carried?.changed.map((x) => x.id + ":" + x.from + ">" + x.to)));
  check("the copy is the source turned 90 degrees about the origin (1e-8)", pts(s).every((p, i) => { const q = rot(p, 90); return near(pts(c)[i]![0], q[0]) && near(pts(c)[i]![1], q[1]); }));
  const d = build([{ id: "s", kind: "sketch", params: { points: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 7, y: 2 }], lines: [{ id: "L", a: "A", b: "B" }], constraints: [{ id: "hd", kind: "horizontalDistance", parts: ["A", "B"], value: 7 }, { id: "vd", kind: "verticalDistance", parts: ["A", "B"], value: 2 }, { id: "fa", kind: "fixed", parts: ["A"], at: [0, 0] }] }, inputs: [] }, cp("c", "s", { deg: 90 })]), dc = sketch(d, "c");
  check("a distance 7 along x and 2 along y: after a quarter turn it is 7 along y and -2 along x (the point B is at (-2, 7))", status(d, "c").kind === "ok" && near(dc.lines[0]!.b[0], -2) && near(dc.lines[0]!.b[1], 7), JSON.stringify(dc.lines[0]!.b)); d.release(); e.release();
}
console.log("3. turned by another angle (the old project kept level and upright as they were and pulled the figure out of shape)");
{
  for (const deg of [30, 120, 240]) {
    const e = build([SRC(), cp("c", "s", { deg })]), c = sketch(e, "c"), ks = kindsOf(c), l = c.lines;
    check(`${deg} degrees: the level and upright relations are dropped and said (four), none is kept as it was`, c.carried?.dropped.length === 4 && !ks.includes("horizontal") && !ks.includes("vertical"), JSON.stringify(c.carried?.dropped.map((x) => x.id)));
    check(`${deg} degrees: what they said among themselves is kept: the level sides stay parallel, the upright sides too, and square to each other`, ks.includes("parallel") && ks.includes("perpendicular"));
    check(`${deg} degrees: the copy is still a 10 by 5 rectangle (the sides 10, 5, 10, 5; the corners square)`, status(e, "c").kind === "ok" && sides(c).every((v, i) => near(v, i % 2 ? 5 : 10)) && near(dirOf(l[0]!)[0]! * dirOf(l[1]!)[0]! + dirOf(l[0]!)[1]! * dirOf(l[1]!)[1]!, 0), JSON.stringify(sides(c)));
    check(`${deg} degrees: it says what is still free (the turn, one way)`, c.solve?.freedom === 1, JSON.stringify(c.solve)); e.release();
  }
}
console.log("4. mirrored: level stays level, a distance along the mirrored axis changes sign, an angle changes sign");
{
  const e = build([SRC(), cp("c", "s", { mirror: 90 })]), s = sketch(e, "s"), c = sketch(e, "c");
  check("mirrored in the upright axis: nothing dropped, the copy is the mirror image (x becomes -x)", c.carried?.dropped.length === 0 && pts(s).every((p, i) => near(pts(c)[i]![0], -p[0]) && near(pts(c)[i]![1], p[1])), JSON.stringify(c.carried?.dropped));
  const d = build([{ id: "s", kind: "sketch", params: { points: [{ id: "O", x: 0, y: 0, fixed: true }, { id: "A", x: 5, y: 0, fixed: true }, { id: "B", x: 4, y: 2.6 }], lines: [{ id: "OA", a: "O", b: "A" }, { id: "OB", a: "O", b: "B" }], constraints: [{ id: "ang", kind: "angle", parts: ["OA", "OB"], value: 30 }, { id: "lb", kind: "length", parts: ["OB"], value: 4 }] }, inputs: [] }, cp("c", "s", { mirror: 0 })]), dc = sketch(d, "c");
  check("an angle of 30 degrees mirrored in the horizontal axis: the copy's point B is below the axis (the angle is -30)", status(d, "c").kind === "ok" && near(dc.lines[1]!.b[1], -4 * Math.sin(Math.PI / 6), 1e-7), JSON.stringify(dc.lines[1]!.b)); d.release(); e.release();
}
console.log("5. a copy of a sketch held to a body's edge: the anchor is not in the copy, and what held to it is dropped and said");
{
  const top = mint("A", "end"), side = (i: number) => mint("A", "side", mint("b", "line", i));
  const body: Step[] = [{ id: "b", kind: "sketchPolygon", params: { points: [[0, 0], [20, 0], [20, 20], [0, 20]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 10 }, inputs: ["b"] }];
  const held: Step = { id: "s", kind: "sketch", params: { ...rectangle(10, 2, 4, 5, { fixCorner: false }), plane: "XY", offset: 10, anchors: [{ id: "e1", edge: edgeRef(top, side(1)) }], constraints: [...rectangle(10, 2, 4, 5, { fixCorner: false }).constraints!, { id: "gap", kind: "pointLineDistance", parts: ["B", "e1"], value: 3 }] }, inputs: ["A"] };
  const e = build([...body, held, cp("c", "s", { by: [0, 8] }, ["A"])]), c = sketch(e, "c");
  check("the copy is made (without the body's edge), the constraint that held to it is dropped and said", status(e, "c").kind === "ok" && c.carried?.dropped.some((x) => x.id === "gap" && /body's edge/.test(x.why)) && (c.reference ?? []).length === 0, JSON.stringify(c.carried?.dropped)); e.release();
}
console.log("6. the copy follows the sketch it copies");
{
  const e = build([SRC(), cp("c", "s", { deg: 90 }), { id: "E", kind: "extrude", params: { d: 3 }, inputs: ["c"] }]);
  const p = e.step("s").params as any; e.edit("s", { ...p, constraints: p.constraints.map((c: any) => (c.id === "w" ? { ...c, value: 14 } : c)) });
  const f = build([{ ...SRC(), params: { ...p, constraints: p.constraints.map((c: any) => (c.id === "w" ? { ...c, value: 14 } : c)) } }, cp("c", "s", { deg: 90 }), { id: "E", kind: "extrude", params: { d: 3 }, inputs: ["c"] }]);
  check("the width edited to 14: the copy and the body made from it follow (14 x 5 x 3 = 210) and equal a fresh build", Math.abs(K.volume((e.result("E").value as Body).solid) - 210) < 1e-6 && e.result("E").fingerprint === f.result("E").fingerprint); e.release(); f.release();
}
console.log(`7. random: ${N} rectangles with random motions: every constraint is accounted for once, and the copy is the source moved (when nothing was dropped)`);
{
  let ok = 0;
  for (let n = 0; n < N; n++) {
    const w = 4 + Math.floor(rnd() * 12), h = 3 + Math.floor(rnd() * 9), deg = [0, 15, 30, 45, 60, 90, 120, 180, 270][Math.floor(rnd() * 9)]!, mir = rnd() < 0.4 ? [0, 45, 90][Math.floor(rnd() * 3)]! : undefined, by: [number, number] = [Math.floor(rnd() * 20), Math.floor(rnd() * 20)];
    const m: Motion = { deg, ...(mir !== undefined ? { mirror: mir } : {}), by }, e = build([{ ...SRC(), params: rectangle(1, 2, w, h) }, cp("c", "s", m)]), c = sketch(e, "c"), s = sketch(e, "s");
    if (status(e, "c").kind !== "ok") { check(`case ${n}: made`, false, status(e, "c").why); e.release(); continue; }
    const orig = (s.definition as any).constraints.map((q: any) => q.id) as string[], kept = new Set(((c.definition as any).constraints as { id: string }[]).map((q) => q.id)), gone = new Set(c.carried!.dropped.map((q) => q.id));
    const unaccounted = orig.filter((id) => !kept.has(id) && !gone.has(id)), both = orig.filter((id) => kept.has(id) && gone.has(id));
    const axisKept = ((c.definition as any).constraints as { kind: string }[]).some((q) => q.kind === "horizontal" || q.kind === "vertical");
    const quarter = (deg % 90 === 0) || ((mir ?? 0) % 45 === 0 && false);
    let good = unaccounted.length === 0 && both.length === 0 && c.lines.length === 4 && sides(c).every((v, i) => near(v, sides(s)[i]!, 1e-7));
    if (!good) check(`case ${n} (${JSON.stringify(m)}): accounted ${unaccounted.length}/${both.length}, sides ${sides(c).map((v) => v.toFixed(3))}`, false);
    else if (c.carried!.dropped.length === 0) { const mp = pts(s).map((p) => { const q = rot(p, deg, mir); return [q[0] + by[0], q[1] + by[1]] as [number, number]; }); if (!pts(c).every((p, i) => near(p[0], mp[i]![0], 1e-7) && near(p[1], mp[i]![1], 1e-7))) { check(`case ${n} (${JSON.stringify(m)}): the copy is the source moved`, false); good = false; } }
    void axisKept; void quarter; if (good) ok++; e.release();
  }
  console.log(`   ${ok} of ${N} copies as expected`); if (ok !== N) failures++;
}
console.log(failures ? `\n${failures} failures` : "\nno failure"); process.exit(failures ? 1 : 0);

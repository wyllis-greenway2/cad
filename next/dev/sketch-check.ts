// A dev check (not a test, `in_1444`) for the constrained sketch step (E49, E52 to E54, E56): a sketch from names and constraints, the verdict as the step's status, a body's edges as anchors.
//   node --experimental-strip-types dev/sketch-check.ts [random cases] [seed]
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { edgeRef, idKey, mint } from "../src/engine/id.ts";
import { rectangle } from "../src/engine/sketch.ts";
import { trial } from "../src/engine/failure.ts";
import type { Sketch, Step } from "../src/engine/steps.ts";
await initKernel();
const N = Number(process.argv[2] ?? 30); let seed = Number(process.argv[3] ?? 1);
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let failures = 0; const check = (label: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ": " + detail : ""}`); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) <= t;
const build = (steps: Step[]) => { const e = new Engine(steps); e.build(); return e; };
const volume = (e: Engine, id: string) => { const b = e.result(id).value as Body; return K.volume(b.solid); };
const sk = (id: string, p: Record<string, any>, inputs: string[] = []): Step => ({ id, kind: "sketch", params: p, inputs });
const ext = (id: string, from: string, d: number): Step => ({ id, kind: "extrude", params: { d }, inputs: [from] });
const status = (e: Engine, id: string) => e.result(id).status as { kind: string; why?: string; victims?: string[] };

console.log("1. a rectangle from names and constraints, extruded");
{
  const e = build([sk("s", rectangle(0, 0, 10, 5)), ext("E", "s", 4)]);
  check("a 10 by 5 rectangle 4 deep: 200 mm3, six faces named from the lines' names", status(e, "E").kind === "ok" && near(volume(e, "E"), 200) && (e.result("E").value as Body).faces.some((f) => idKey(f.id) === idKey(mint("E", "side", mint("s", "line", "right")))), status(e, "E").kind);
  const s = e.result("s").value as Sketch; check("the sketch says it is fully constrained", s.solve?.kind === "solved" && s.solve.freedom === 0, JSON.stringify(s.solve));
  e.edit("s", { ...e.step("s").params, constraints: e.step("s").params.constraints.map((c: any) => (c.id === "w" ? { ...c, value: 12 } : c)) });
  check("edit the width to 12: 240 mm3; and it equals a fresh build", near(volume(e, "E"), 240) && JSON.stringify(e.ids().map((i) => e.result(i).fingerprint)) === JSON.stringify(build([sk("s", e.step("s").params), ext("E", "s", 4)]).ids().map((i, _, a) => build([sk("s", e.step("s").params), ext("E", "s", 4)]).result(i).fingerprint)));
  const u = build([sk("s", rectangle(0, 0, 10, 5, { size: false })), ext("E", "s", 4)]), us = u.result("s").value as Sketch;
  check("without sizes: made as drawn, under-constrained (two ways to move), the corners that can move are named", status(u, "E").kind === "ok" && us.solve?.kind === "under" && us.solve.freedom === 2 && us.solve.free.includes("C"), JSON.stringify(us.solve)); u.release(); e.release();
}
console.log("2. a sketch that cannot be made: refused, with the constraints that hold it named");
{
  const bad = rectangle(0, 0, 10, 5); bad.constraints!.push({ id: "w2", kind: "length", parts: ["bottom"], value: 11 });
  const e = build([sk("s", bad), ext("E", "s", 4)]), st = status(e, "s");
  check("two different widths: flagged, the two named in the words and in the victims", st.kind === "flagged" && (st.victims ?? []).length === 2 && st.victims!.includes("w") && st.victims!.includes("w2") && /w, w2|w2, w/.test(st.why ?? ""), JSON.stringify(st));
  check("the step after it is flagged too and the model is not blank (it says why)", status(e, "E").kind !== "ok" && (status(e, "E").why ?? "").length > 0, status(e, "E").why);
  const t = trial(build([sk("s", rectangle(0, 0, 10, 5)), ext("E", "s", 4)]), { op: "edit", step: "s", params: bad });
  check("a trial of that change is refused and carries the victims", t.kind === "refused" && (t.victims ?? []).includes("w2"), JSON.stringify(t.victims)); e.release();
  const sq = rectangle(0, 0, 10, 5, { size: false }); sq.constraints!.push({ id: "h", kind: "horizontal", parts: ["right"] });
  const e2 = build([sk("s", sq)]); check("a side level and upright is refused (a line of nothing), named", status(e2, "s").kind === "flagged" && /nothing/.test(status(e2, "s").why ?? ""), status(e2, "s").why); e2.release();
}
console.log("3. a body's edges as anchors: the sketch follows the body");
{
  const W = (w: number): Step[] => [{ id: "b", kind: "sketchPolygon", params: { points: [[0, 0], [w, 0], [w, 20], [0, 20]] }, inputs: [] }, ext("A", "b", 10)];
  const top = mint("A", "end"), side = (i: number) => mint("A", "side", mint("b", "line", i));
  const on = (offset: number): Step => sk("s2", { ...rectangle(10, 2, 4, 5, { fixCorner: false }), plane: "XY", offset, anchors: [{ id: "e1", edge: edgeRef(top, side(1)) }],
    constraints: [...rectangle(10, 2, 4, 5, { fixCorner: false }).constraints!, { id: "par", kind: "parallel", parts: ["right", "e1"] }, { id: "gap", kind: "pointLineDistance", parts: ["B", "e1"], value: 3 }, { id: "y", kind: "verticalDistance", parts: ["e1.a", "B"], value: 2 }] }, ["A"]);
  for (const offset of [10, 15]) {
    const e = build([...W(20), on(offset), ext("R", "s2", 3)]), r = e.result("s2").value as Sketch;
    const xs = r.lines.flatMap((l) => [l.a[0], l.b[0]]);
    check(`a rectangle 3 from the body's right edge${offset === 15 ? " (the sketch plane 5 above the top: the edge is off the plane and projected)" : ""}: its right side at x = 17, its width 4`, status(e, "s2").kind === "ok" && near(Math.max(...xs), 17) && near(Math.min(...xs), 13) && near(volume(e, "R"), 60), `${status(e, "s2").kind} ${status(e, "s2").why ?? ""}`);
    check("the anchor is in the sketch's reference list, not in its profile", (r.reference ?? []).length === 1 && r.lines.length === 4);
    e.edit("b", { points: [[0, 0], [30, 0], [30, 20], [0, 20]] }); const r2 = e.result("s2").value as Sketch, xs2 = r2.lines.flatMap((l) => [l.a[0], l.b[0]]);
    check("the body is widened to 30: the rectangle follows (right side at x = 27), the same size, and equals a fresh build", status(e, "s2").kind === "ok" && near(Math.max(...xs2), 27) && near(volume(e, "R"), 60) && e.result("R").fingerprint === build([...W(30), on(offset), ext("R", "s2", 3)]).result("R").fingerprint); e.release();
  }
  const corner = build([...W(20), sk("s3", { ...rectangle(1, 1, 4, 5, { fixCorner: false }), plane: "XY", offset: 10, anchors: [{ id: "c", edge: edgeRef(side(0), side(1)) }], constraints: [...rectangle(1, 1, 4, 5, { fixCorner: false }).constraints!, { id: "pin", kind: "coincident", parts: ["B", "c"] }] }, ["A"])]), cr = corner.result("s3").value as Sketch;
  check("a vertical edge seen end-on is a point in the plane: the corner B is held to it (20, 0)", status(corner, "s3").kind === "ok" && near(cr.lines[0]!.b[0], 20) && near(cr.lines[0]!.b[1], 0), JSON.stringify(cr.lines[0]) + status(corner, "s3").why);
  const wrong = build([...W(20), sk("s4", { ...rectangle(1, 1, 4, 5, { fixCorner: false }), plane: "XY", offset: 10, anchors: [{ id: "c", edge: edgeRef(side(0), side(1)) }], constraints: [...rectangle(1, 1, 4, 5, { fixCorner: false }).constraints!, { id: "bad", kind: "parallel", parts: ["right", "c"] }] }, ["A"])]);
  check("a relation that means nothing on a point is refused in words", status(wrong, "s4").kind === "flagged" && /needs a line/.test(status(wrong, "s4").why ?? ""), status(wrong, "s4").why);
  const lost = build([...W(20), sk("s5", { ...rectangle(1, 1, 4, 5), plane: "XY", offset: 10, anchors: [{ id: "g", edge: edgeRef(mint("A", "side", mint("b", "line", 9)), top) }] }, ["A"])]);
  check("an anchor whose edge is gone: orphaned, in words (it never attaches to something else)", status(lost, "s5").kind === "orphaned" && /no longer there/.test(status(lost, "s5").why ?? ""), JSON.stringify(status(lost, "s5"))); corner.release(); wrong.release(); lost.release();
}
console.log(`4. random: ${N} rectangles with random sizes and edits, incremental equals fresh`);
{
  let ok = 0;
  for (let n = 0; n < N; n++) {
    const w = 5 + Math.floor(rnd() * 30), h = 3 + Math.floor(rnd() * 20), d = 2 + Math.floor(rnd() * 10), e = build([sk("s", rectangle(Math.floor(rnd() * 10), Math.floor(rnd() * 10), w, h)), ext("E", "s", d)]);
    if (!near(volume(e, "E"), w * h * d)) check(`case ${n}: volume`, false, `${volume(e, "E")} against ${w * h * d}`);
    const w2 = 5 + Math.floor(rnd() * 30), h2 = 3 + Math.floor(rnd() * 20), p2 = { ...rectangle(0, 0, w2, h2), points: e.step("s").params.points.map((q: any) => ({ ...q })) }; const params = { ...e.step("s").params, constraints: e.step("s").params.constraints.map((c: any) => (c.id === "w" ? { ...c, value: w2 } : c.id === "h" ? { ...c, value: h2 } : c)) }; void p2;
    e.edit("s", params); const f = build([sk("s", params), ext("E", "s", d)]);
    if (e.result("E").fingerprint !== f.result("E").fingerprint || !near(volume(e, "E"), w2 * h2 * d)) check(`case ${n}: edit differs from fresh`, false); else ok++; e.release(); f.release();
  }
  console.log(`   ${ok} of ${N} cases: the volume is w x h x d, and an edit equals a fresh build`); if (ok !== N) failures++;
}
console.log(failures ? `\n${failures} failures` : "\nno failure"); process.exit(failures ? 1 : 0);

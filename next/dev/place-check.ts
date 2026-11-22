// A dev check (not a test, `in_1444`) for the `place` step (E60, `dec_body_placement`): mates between faces of two bodies, solved every recompute, no face id changes, conflicts refused and named.
//   node --experimental-strip-types dev/place-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { type Id, idKey } from "../src/engine/id.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
import { check, fail, failureCount, near } from "./lib.ts";
const st = (e: Engine, id: string) => e.result(id).status as { kind: string; why?: string; victims?: string[] };
const scene = (e: Engine, id: string) => e.result(id).value as Body;
const blocks: Step[] = [{ id: "s", kind: "sketchPolygon", params: { points: [[0, 0], [20, 0], [20, 20], [0, 20]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 10 }, inputs: ["s"] }, { id: "P", kind: "pattern", params: { kind: "linear", by: [60, 5, 30], count: 2 }, inputs: ["A"] }];
/** the face of a body with a given outward normal, by the body's number */
const faceOf = (sc: Body, body: number, nz: number): Id => sc.bodies[body]!.faces.find((f) => { const q = K.facts(f.h); return q.type === "PLANE" && Math.abs(q.ne[2] - nz) < 1e-9; })!.id;
const z = (sc: Body, id: Id): number => K.facts(sc.one(id).h).ce[2];
const mate = (id: string, kind: string, a: Id, b: Id, value?: number) => ({ id, kind, a, b, ...(value !== undefined ? { value } : {}) });

console.log("1. flush: the top copy's underside comes down onto the first block's top");
{
  const base = new Engine(blocks); base.build(); const sc0 = scene(base, "P"), names = sc0.bodies.map((b) => idKey(b.id)), bot = faceOf(sc0, 0, -1), top = faceOf(sc0, 1, 1);
  const e = new Engine([...blocks, { id: "M", kind: "place", params: { mates: [mate("f", "flush", bot, top)] }, inputs: ["P"] }]); e.build(); base.release();
  const probe = scene(e, "P"), a = probe.bodies[0]!;
  // body 0 is the later copy in this scene's numbering or the first: find which body sits at z = 30 before and after
  const ztop = (sc: Body) => sc.bodies.map((b) => Math.max(...b.faces.map((f) => K.facts(f.h).hi[2])));
  check("ok, and a note says what is still free", st(e, "M").kind === "ok" && e.result("M").notes.some((n) => n.kind === "free"), `${st(e, "M").kind} ${st(e, "M").why ?? ""} ${e.result("M").notes.map((n) => n.text).join(" | ")}`);
  const after = scene(e, "M"); void a; void names;
  const moved = after.bodies.map((b) => Math.min(...b.faces.map((f) => K.facts(f.h).lo[2])));
  check("both bodies are touching now: the lower of one is the top of the other (z = 10)", moved.some((v) => near(v, 10, 1e-6)) && moved.some((v) => near(v, 0, 1e-6)), moved.join(" "));
  const before = new Set(scene(e, "P").faces.map((f) => idKey(f.id))), later = new Set(after.faces.map((f) => idKey(f.id)));
  check("every face keeps its id; none is added or lost", before.size === later.size && [...before].every((i) => later.has(i)), `${before.size} ${later.size}`);
  check("the volume is two blocks", near(K.volume(after.solid), 2 * 20 * 20 * 10, 1e-9), String(K.volume(after.solid))); void ztop;
  e.release();
}
console.log("2. a gap is a number of the step; an edit equals a fresh build; the step replays exactly");
{
  const base = new Engine(blocks); base.build(); const sc0 = scene(base, "P"), bot = faceOf(sc0, 0, -1), top = faceOf(sc0, 1, 1); base.release();
  const mk = (gap: number): Step[] => [...blocks, { id: "M", kind: "place", params: { mates: [mate("f", "flush", bot, top, gap)] }, inputs: ["P"] }];
  const e = new Engine(mk(2)); e.build(); const lo = (sc: Body) => sc.bodies.map((b) => Math.min(...b.faces.map((f) => K.facts(f.h).lo[2]))).sort((p, q) => p - q);
  check("a gap of 2: the faces end 2 apart (the bodies' lowest points are 0 and 12)", near(lo(scene(e, "M"))[1]!, 12, 1e-6), lo(scene(e, "M")).join());
  const run = e.edit("M", mk(5)[3]!.params); check("edit the gap to 5: only M runs again", run.recomputed.join() === "M" && near(lo(scene(e, "M"))[1]!, 15, 1e-6), `${run.recomputed.join()} ${lo(scene(e, "M")).join()}`);
  const fresh = new Engine(mk(5)); fresh.build(); check("and it equals a fresh build", e.result("M").fingerprint === fresh.result("M").fingerprint); fresh.release(); e.release();
}
console.log("3. coaxial: a rod moved onto the axis of another");
{
  const rods: Step[] = [{ id: "c", kind: "sketchCircle", params: { r: 5 }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 20 }, inputs: ["c"] }, { id: "P", kind: "pattern", params: { kind: "linear", by: [40, 12, 7], count: 2 }, inputs: ["A"] }];
  const base = new Engine(rods); base.build(); const sc = scene(base, "P"), wall = (n: number): Id => sc.bodies[n]!.faces.find((f) => K.facts(f.h).type === "CYLINDRE")!.id; const wa = wall(0), wb = wall(1); base.release();
  const e = new Engine([...rods, { id: "M", kind: "place", params: { mates: [mate("c", "coaxial", wa, wb)] }, inputs: ["P"] }]); e.build(); const out = scene(e, "M");
  const axes = out.bodies.map((b) => K.cylinderOf(b.faces.find((f) => K.facts(f.h).type === "CYLINDRE")!.h)), d = Math.hypot(axes[0]!.point[0] - axes[1]!.point[0], axes[0]!.point[1] - axes[1]!.point[1]);
  check("the two axes are one (the points on them are on one vertical line)", st(e, "M").kind === "ok" && d < 1e-6, `${st(e, "M").kind} ${st(e, "M").why ?? ""} ${d}`);
  check("it can still slide along the axis and turn about it: two ways, said", e.result("M").notes.some((n) => n.kind === "free" && /2 ways/.test(n.text)), e.result("M").notes.map((n) => n.text).join(" | "));
  e.release();
}
console.log("4. refusals, in words, naming the mates");
{
  const base = new Engine(blocks); base.build(); const sc0 = scene(base, "P"), bot = faceOf(sc0, 0, -1), top = faceOf(sc0, 1, 1), side = faceOf(sc0, 0, 1), side2 = faceOf(sc0, 0, 1); base.release(); void side2;
  const e = new Engine([...blocks, { id: "M", kind: "place", params: { mates: [mate("f1", "flush", bot, top, 0), mate("f2", "flush", bot, top, 3)] }, inputs: ["P"] }]); e.build();
  check("two flush mates with different gaps: flagged, both named in the words and as victims, the picture is the bodies as they were", st(e, "M").kind === "flagged" && /f1, f2|f2, f1/.test(st(e, "M").why ?? "") && (st(e, "M").victims ?? []).length === 2, `${st(e, "M").kind} ${st(e, "M").why} ${st(e, "M").victims}`);
  e.release();
  const one = new Engine([...blocks, { id: "M", kind: "place", params: { mates: [mate("w", "coaxial", bot, top)] }, inputs: ["P"] }]); one.build();
  check("a coaxial mate of two flat faces is said", st(one, "M").kind === "flagged" && /coaxial needs axis/.test(st(one, "M").why ?? ""), st(one, "M").why); void side; one.release();
  const same = new Engine([...blocks, { id: "M", kind: "place", params: { mates: [mate("s", "flush", bot, side)] }, inputs: ["P"] }]); same.build(); check("a mate inside one body is said", /joins two bodies/.test(st(same, "M").why ?? ""), st(same, "M").why); same.release();
  const lone = new Engine([blocks[0]!, blocks[1]!, { id: "M", kind: "place", params: { mates: [] }, inputs: ["A"] }]); lone.build(); check("one body is not enough, said", /two bodies/.test(st(lone, "M").why ?? ""), st(lone, "M").why); lone.release();
  const gone = new Engine([...blocks, { id: "M", kind: "place", params: { mates: [mate("f", "flush", { step: "A", role: "gone", of: [], pieces: [] }, top)] }, inputs: ["P"] }]); gone.build(); check("a face that is gone orphans the step, in words", st(gone, "M").kind === "orphaned", st(gone, "M").kind); gone.release();
}
console.log("5. fixed: the body that must not move; and the first named body is the one that moves");
{
  const base = new Engine(blocks); base.build(); const sc0 = scene(base, "P"), bot = faceOf(sc0, 0, -1), top = faceOf(sc0, 1, 1); base.release();
  const lo = (sc: Body) => sc.bodies.map((b) => Math.min(...b.faces.map((f) => K.facts(f.h).lo[2])));
  const a = new Engine([...blocks, { id: "M", kind: "place", params: { mates: [mate("f", "flush", bot, top)] }, inputs: ["P"] }]); a.build(); const b = new Engine([...blocks, { id: "M", kind: "place", params: { mates: [mate("f", "flush", top, bot)] }, inputs: ["P"] }]); b.build();
  const sa = scene(a, "M"), sb = scene(b, "M"); check("flush a-onto-b moves one body; b-onto-a moves the other: the two answers are not the same bodies at the same places", JSON.stringify(lo(sa).map((v) => Math.round(v * 1e6))) !== JSON.stringify(lo(sb).map((v) => Math.round(v * 1e6))), `${lo(sa)} | ${lo(sb)}`);
  a.release(); b.release();
}
console.log("6. ranges in the step: a gap of at least, an offset of at most")
{
  const base = new Engine(blocks); base.build(); const sc0 = scene(base, "P"), bot = faceOf(sc0, 0, -1), top = faceOf(sc0, 1, 1); base.release();
  const lo = (sc: Body) => sc.bodies.map((b) => Math.min(...b.faces.map((f) => K.facts(f.h).lo[2]))).sort((p, q) => p - q);
  const run = (extra: Record<string, unknown>) => { const e = new Engine([...blocks, { id: "M", kind: "place", params: { mates: [{ id: "f", kind: "flush", a: bot, b: top, ...extra }] }, inputs: ["P"] }]); e.build(); const r = { s: st(e, "M"), lo: lo(scene(e, "M")), free: e.result("M").notes.map((n) => n.text).join(" | ") }; e.release(); return r; };
  const far = run({ min: 5 }); check("the copy is 20 above the first block's top; a gap of at least 5: not moved in height (still at 30)", far.s.kind === "ok" && near(far.lo[1]!, 30, 1e-6), `${far.s.kind} ${far.lo}`);
  const close = run({ min: 25 }); check("a gap of at least 25: lifted from 20 to 25 (the second block's lowest is 35)", near(close.lo[1]!, 35, 1e-6), `${close.lo}`);
  const band = run({ min: 0, max: 8 }); check("a gap between 0 and 8: 20 comes down to 8 (lowest is 18)", near(band.lo[1]!, 18, 1e-6), `${band.lo}`);
  const bad = run({ value: 3, min: 1 }); check("a number and a range together: said", /number or a range, not both/.test(bad.s.why ?? ""), bad.s.why);
}
console.log(failureCount() ? `\n${failureCount()} failure(s)` : "\nno failure");
process.exit(failureCount() ? 1 : 0);

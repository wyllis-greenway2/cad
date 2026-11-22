// A dev check (not a test, `in_1444`): what the stress run found (`in_1541`, `in_1542`), kept as recipes in dev/stress-found/ and checked again.
//   node --experimental-strip-types dev/stress-found-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import type { Step } from "../src/engine/steps.ts";
import { readFileSync } from "node:fs";
await initKernel();
import { check, failureCount, same } from "./lib.ts";
const load = (n: string): Step[] => JSON.parse(readFileSync(new URL(`./stress-found/${n}.json`, import.meta.url), "utf8"));
const st = (e: Engine, id: string) => e.result(id).status as { kind: string; why?: string };

console.log("1. a shell the kernel calls valid but whose face is 1e101 mm squared is refused, not kept");
{ const e = new Engine(load("shell-absurd-volume")); e.build(); check("X9 is flagged, in words", st(e, "X9").kind === "flagged" && /cannot be right/.test(st(e, "X9").why ?? ""), st(e, "X9").kind + " " + (st(e, "X9").why ?? "")); e.release(); }
console.log("2. a round naming edges of two bodies says so (flagged), not that an edge is gone (orphaned)");
{ const e = new Engine(load("round-two-bodies")); e.build(); check("X6 flagged, says another body", st(e, "X6").kind === "flagged" && /another body/.test(st(e, "X6").why ?? ""), st(e, "X6").kind + " " + (st(e, "X6").why ?? "")); e.release(); }
console.log("3. an edit and back gives the same answers (the kernel's volume differs in the 11th digit with the way a shape was built; compared with a tolerance)");
{
  const e = new Engine(load("edit-and-back-volume-noise")); e.build(); const ids = e.ids(), before = Object.fromEntries(ids.map((i) => [i, e.result(i).fingerprint])), p = e.step("X12").params as { dist: number };
  e.edit("X12", { ...p, dist: p.dist * 1.25 }); e.edit("X12", p);
  check("every step has its first fingerprint again", ids.every((i) => same(e.result(i).fingerprint, before[i]!)), ids.filter((i) => !same(e.result(i).fingerprint, before[i]!)).join(" ")); e.release();
}
console.log("4. a push does not spoil the shape it was given (the kernel's booleans work in place unless told not to), so a later edit of that step works as a fresh build does");
{
  const rec = load("boolean-changes-its-input"), d0 = (rec.find((s) => s.id === "X12")!.params as { dist: number }).dist, e = new Engine(rec); e.build();
  const kinds: string[] = []; for (const f of [1.25, 1, 1.25, 1]) { e.edit("X12", { ...(e.step("X12").params as object), dist: d0 * f }); kinds.push(st(e, "X12").kind); }
  check("the push is ok every time it is edited", kinds.every((k) => k === "ok"), kinds.join(" ")); e.release();
}
console.log("5. a flat face moved beside the wall of a hole (the neighbour is round, along the move): the wall grows or shrinks with it");
{
  const { mint } = await import("../src/engine/id.ts"), K = await import("../src/engine/kernel.ts"), { Body } = await import("../src/engine/lineage.ts");
  const base: Step[] = [{ id: "s", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 30], [0, 30]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 10 }, inputs: ["s"] }];
  const top = mint("A", "end"), hole: Step = { id: "H", kind: "hole", params: { face: top, diameter: 6, depth: 4 }, inputs: ["A"] }, vol = (e: Engine) => K.volume((e.result("M").value as InstanceType<typeof Body>).solid);
  const mv = (face: typeof top, dist: number) => { const e = new Engine([...base, hole, { id: "M", kind: "moveFace", params: { face, dist }, inputs: ["H"] }]); e.build(); return e; };
  const up = mv(top, 4), down = mv(top, -3), deeper = mv(mint("H", "hole", "bottom"), -2), disc = Math.PI * 9, slab = 1200 - disc;
  check("the top moved up 4: four more slabs, the hole 4 longer", st(up, "M").kind === "ok" && Math.abs(vol(up) - (12000 - 4 * disc + 4 * slab)) < 1e-3, st(up, "M").kind + " " + vol(up));
  check("the top moved down 3: three slabs fewer", st(down, "M").kind === "ok" && Math.abs(vol(down) - (12000 - 4 * disc - 3 * slab)) < 1e-3, st(down, "M").kind + " " + vol(down));
  check("the hole's bottom moved 2 deeper: two discs fewer", st(deeper, "M").kind === "ok" && Math.abs(vol(deeper) - (12000 - 6 * disc)) < 1e-3, st(deeper, "M").kind + " " + vol(deeper));
  check("the same as editing the hole's depth (fresh build)", (() => { const e = new Engine([...base, { ...hole, params: { ...hole.params, depth: 6 } }]); e.build(); const v = K.volume((e.result("H").value as InstanceType<typeof Body>).solid); e.release(); return Math.abs(v - vol(deeper)) < 1e-3; })());
  up.release(); down.release(); deeper.release();
}
console.log("6. a fillet does not change the shape it was given (it raised tolerances in place), so a later step on that shape gives what a fresh build gives");
{
  const e = new Engine(load("fillet-changes-its-input")); e.build(); const p = e.step("X4").params as { size: number };
  e.edit("X4", { ...p, size: p.size * 1.25 }); const f = new Engine(e.recipe()); f.build();
  check("live equals a fresh build after the edit", e.ids().every((i) => same(e.result(i).fingerprint, f.result(i).fingerprint)), e.ids().filter((i) => !same(e.result(i).fingerprint, f.result(i).fingerprint)).join(" ")); f.release(); e.release();
}
console.log("7. rounding an edge where the faces meet smoothly (a fillet's own seam) is refused in words; the kernel failed on these at every size");
{
  const { mint, edgeRef } = await import("../src/engine/id.ts"), A = (r: string, o?: unknown) => mint("A", r as never, ...(o ? [o as never] : []));
  const line0 = mint("s", "line", 0), side = mint("A", "side", line0), end = mint("A", "end"), ref = edgeRef(side, end);
  const steps: Step[] = [{ id: "s", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 30], [0, 30]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 10 }, inputs: ["s"] },
    { id: "R", kind: "round", params: { edges: [ref], size: 2 }, inputs: ["A"] }, { id: "T", kind: "round", params: { edges: [edgeRef(mint("R", "round", ref.a, ref.b, 0), end)], size: 0.5 }, inputs: ["R"] }];
  void A; const e = new Engine(steps); e.build();
  check("a round of a block's own edge is fine", st(e, "R").kind === "ok", st(e, "R").kind + " " + (st(e, "R").why ?? ""));
  check("a round of the seam between that round and the top is flagged, and says the edge is smooth", st(e, "T").kind === "flagged" && /is smooth/.test(st(e, "T").why ?? ""), st(e, "T").kind + " " + (st(e, "T").why ?? "")); e.release();
}
process.exit(failureCount() ? 1 : 0);

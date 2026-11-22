// A dev check (not a test, `in_1444`) for failure handling (E28, E35): the trial, the working range of a number, the options for a failed step. The engine asked must be unchanged by every one of them.
//   node --experimental-strip-types dev/failure-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { edgeRef, mint } from "../src/engine/id.ts";
import { options, probe, trial } from "../src/engine/failure.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
let failures = 0; const check = (label: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ": " + detail : ""}`); };
const W = 40, H = 30, D = 10, line = (i: number) => mint("sk", "line", i), side = (i: number) => mint("A", "side", line(i)), top = mint("A", "end");
const block: Step[] = [{ id: "sk", kind: "sketchPolygon", params: { points: [[0, 0], [W, 0], [W, H], [0, H]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: D }, inputs: ["sk"] }];
const chamfered = (c: number): Step[] => [...block, { id: "C", kind: "round", params: { mode: "chamfer", size: c, edges: [0, 1, 2, 3].map((i) => edgeRef(top, side(i))) }, inputs: ["A"] }];
const prints = (e: Engine) => e.ids().map((id) => `${id}:${e.result(id).status.kind}:${e.result(id).fingerprint}`).join("|");
const near = (a: number, b: number, t = 0.02) => Math.abs(a - b) <= t;

console.log("1. the trial");
{
  const e = new Engine([...chamfered(3), { id: "M", kind: "moveFace", params: { face: top, dist: 5 }, inputs: ["C"] }] as Step[]); e.build(); const before = prints(e);
  const ok = trial(e, { op: "edit", step: "M", params: { face: top, dist: 8 } }); check("a move of 8 is fine", ok.kind === "ok", `${ok.kind} ${ok.why}`);
  const bad = trial(e, { op: "edit", step: "M", params: { face: top, dist: 13 } }); check("a move of 13 is refused with the distance", bad.kind === "refused" && /12\.000/.test(bad.why), `${bad.kind}: ${bad.why}`);
  const gone = trial(e, { op: "edit", step: "nothing", params: {} }); check("a step that is not there is refused in words", gone.kind === "refused" && gone.why.length > 0, gone.why);
  check("the picture of a trial is a volume and a face count", ok.volume !== null && ok.faces !== null && ok.volume! > 14202 && ok.volume! < 15500, `${ok.volume?.toFixed(1)} mm3, ${ok.faces} faces`);
  check("the engine asked is unchanged", prints(e) === before); e.release();
}
console.log("2. where a number works");
{
  const e = new Engine([...chamfered(3), { id: "M", kind: "moveFace", params: { face: top, dist: 5 }, inputs: ["C"] }] as Step[]); e.build(); const before = prints(e);
  const p = probe(e, "M", "dist", { lo: -8, hi: 20 });
  console.log("   ", JSON.stringify(p.ok.map((r) => [+r.from.toFixed(3), +r.to.toFixed(3)])));
  check("the move works from -8 to 12 and no further", p.ok.length === 1 && near(p.ok[0]!.from, -8, 0.01) && near(p.ok[0]!.to, 12, 0.01), `${p.ok.length} range(s)`);
  const c = probe(e, "C", "size", { lo: 0.1, hi: 20 }); console.log("   chamfer size:", JSON.stringify(c.ok.map((r) => [+r.from.toFixed(3), +r.to.toFixed(3)])));
  check("the chamfer works up to the height of the walls (10)", c.ok.length === 1 && near(c.ok[0]!.to, 10, 0.01), c.ok.length ? `up to ${c.ok[0]!.to.toFixed(3)}` : "nowhere");
  check("the engine asked is unchanged", prints(e) === before); e.release();
}
console.log("3. the options for a failed step");
{
  const e = new Engine([...chamfered(3), { id: "M", kind: "moveFace", params: { face: top, dist: 12.5 }, inputs: ["C"] }] as Step[]); e.build();
  check("the move of 12.5 is flagged", e.result("M").status.kind === "flagged"); const before = prints(e);
  const o = options(e, "M"); for (const x of o) console.log(`    ${x.kind.padEnd(13)} applies ${String(x.applies).padEnd(5)} worked ${String(x.worked).padEnd(5)} ${x.label}  [${x.why}]`);
  const range = o.find((x) => x.kind === "range")!; check("range: a nearby working distance is offered and it works", range.worked === true && range.change?.op === "edit" && (range.change.params.dist as number) < 12.01 && (range.change.params.dist as number) > 11.9, JSON.stringify(range.change && (range.change as any).params?.dist));
  check("editOriginal: the move is of the chamfered top, which the extrusion A made: offered", o.find((x) => x.kind === "editOriginal")?.applies === true);
  check("remove: offered, and says it works", o.find((x) => x.kind === "remove")?.worked === true);
  check("nothing was applied", prints(e) === before); e.release();
}
{ // a round that cannot be made: a chamfer taller than the walls it runs on
  const e = new Engine(chamfered(11)); e.build(); const r = e.result("C");
  console.log(`   a chamfer of 11 on walls 10 high: ${r.status.kind}${"why" in r.status ? " (" + r.status.why + ")" : ""}`);
  check("it is flagged", r.status.kind === "flagged");
  if (r.status.kind !== "ok") { const o = options(e, "C"), range = o.find((x) => x.kind === "range")!; console.log("   ", range.label); check("the working range is found (up to 10), and the nearest value works", range.worked === true && !!range.probe && range.probe.ok.length === 1 && near(range.probe.ok[0]!.to, 10, 0.01), range.why);
    check("the steps after the failed one are not blamed (nothing is applied)", e.result("C").status.kind === "flagged"); }
  e.release();
}
console.log(failures ? `\n${failures} failures` : "\nno failure"); process.exit(failures ? 1 : 0);

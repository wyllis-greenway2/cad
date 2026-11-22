// A dev check (not a test, `in_1444`) for the hole step (E76, `in_1518`): volumes, names, through and blind, a counterbore, an edit, a hole that misses, several bodies.
//   node --experimental-strip-types dev/hole-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { idKey, mint } from "../src/engine/id.ts";
import { options } from "../src/engine/failure.ts";
import { originalEdit, pullModes } from "../src/engine/pull.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
let failures = 0; const check = (label: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ": " + detail : ""}`); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
const st = (e: Engine, id: string) => e.result(id).status as { kind: string; why?: string };
const body = (e: Engine, id: string) => e.result(id).value as Body;
const vol = (e: Engine, id: string) => K.volume(body(e, id).solid);
const block: Step[] = [{ id: "s", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 30], [0, 30]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 10 }, inputs: ["s"] }];
const top = mint("A", "end"), hole = (p: Record<string, unknown>, id = "H"): Step => ({ id, kind: "hole", params: { face: top, diameter: 6, depth: 4, ...p }, inputs: ["A"] });
const V = 40 * 30 * 10;

console.log("1. a blind hole in the top face");
{
  const e = new Engine([...block, hole({})]); e.build();
  check("diameter 6, 4 deep: the body loses pi 9 x 4", st(e, "H").kind === "ok" && near(vol(e, "H"), V - Math.PI * 9 * 4, 1e-6), st(e, "H").why ?? String(vol(e, "H")));
  const ids = body(e, "H").faces.map((f) => idKey(f.id));
  check("the wall and the bottom are named by the step", ids.some((i) => i.includes('"H"."hole"')) && ids.includes(idKey(mint("H", "hole", "bottom"))) && ids.filter((i) => i.startsWith('"H"')).length === 2, ids.filter((i) => i.startsWith('"H"')).join(" | "));
  check("the top face keeps its name (it now has a hole in it)", ids.includes(idKey(top)));
  e.edit("H", { ...e.step("H").params, diameter: 10 }); check("edit the diameter to 10: the same two names, the volume of a 10 hole", near(vol(e, "H"), V - Math.PI * 25 * 4, 1e-6) && body(e, "H").faces.some((f) => idKey(f.id) === idKey(mint("H", "hole", "bottom"))));
  const fresh = new Engine(e.recipe()); fresh.build(); check("and the edit equals a fresh build", e.result("H").fingerprint === fresh.result("H").fingerprint); fresh.release(); e.release();
}
console.log("2. placed, through, and a counterbore");
{
  const e = new Engine([...block, hole({ at: [8, -5], depth: "through", diameter: 4 })]); e.build();
  check("through: loses the whole column pi 4 x 10, wherever it is on the face", st(e, "H").kind === "ok" && near(vol(e, "H"), V - Math.PI * 4 * 10, 1e-6), st(e, "H").why ?? String(vol(e, "H")));
  const cb = new Engine([...block, hole({ depth: 8, diameter: 4, counterbore: { diameter: 8, depth: 3 } })]); cb.build();
  check("a counterbore 8 wide 3 deep over a hole 4 wide 8 deep: pi 16 x 3 + pi 4 x 5", st(cb, "H").kind === "ok" && near(vol(cb, "H"), V - Math.PI * (16 * 3 + 4 * 5), 1e-6), st(cb, "H").why ?? String(vol(cb, "H")));
  check("its four named faces: wall, bottom, counterbore wall, floor", body(cb, "H").faces.filter((f) => f.id.step === "H").length === 4, body(cb, "H").faces.filter((f) => f.id.step === "H").map((f) => idKey(f.id)).join(" | "));
  e.release(); cb.release();
}
console.log("3. refusals, in words");
{
  const w = (p: Record<string, unknown>) => { const e = new Engine([...block, hole(p)]); e.build(); const r = { kind: st(e, "H").kind, why: st(e, "H").why ?? "" }; e.release(); return r; };
  check("no diameter", w({ diameter: 0 }).kind === "flagged" && /diameter/.test(w({ diameter: 0 }).why));
  check("a counterbore that is not wider", /wider/.test(w({ counterbore: { diameter: 5, depth: 1 } }).why));
  check("a counterbore as deep as the hole", /as deep/.test(w({ depth: 3, counterbore: { diameter: 9, depth: 3 } }).why));
  const away = w({ at: [100, 0] }); check("a hole that misses the body changes nothing, and says so", away.kind === "flagged" && /changed nothing/.test(away.why), away.why);
  const e = new Engine([...block, hole({ face: mint("A", "side", mint("s", "line", 0)), diameter: 3 })]); e.build(); check("a hole in a side face works too (any flat face)", st(e, "H").kind === "ok" && near(vol(e, "H"), V - Math.PI * 2.25 * 4, 1e-6), st(e, "H").why); e.release();
}
console.log("4. a hole deeper than the body is through, and a number the failure options know");
{
  const e = new Engine([...block, hole({ depth: 30 })]); e.build(); check("30 deep in a 10 block: the whole column", near(vol(e, "H"), V - Math.PI * 9 * 10, 1e-6), String(vol(e, "H")));
  const bad = new Engine([...block, hole({ face: { step: "A", role: "gone", of: [], pieces: [] } })]); bad.build(); check("a face that is not there: orphaned", st(bad, "H").kind === "orphaned", st(bad, "H").kind);
  void options; e.release(); bad.release();
}
console.log("5. two bodies: the hole is made in the body of the face it names, the other is untouched");
{
  const steps: Step[] = [...block, { id: "P", kind: "pattern", params: { kind: "linear", by: [60, 0, 0], count: 2 }, inputs: ["A"] }];
  const e = new Engine(steps); e.build(); const scene = body(e, "P"), mine = scene.bodies[0]!, face = mine.faces.find((f) => { const q = K.facts(f.h); return q.type === "PLANE" && q.ne[2] > 0.9; })!;
  const e2 = new Engine([...steps, { id: "H", kind: "hole", params: { face: face.id, diameter: 6, depth: 4 }, inputs: ["P"] }]); e2.build();
  const vols = (body(e2, "H").bodies.map((b, i) => [i, b] as const), K.volume(body(e2, "H").solid)); check("one hole in two bodies: the total is two blocks less one hole", near(vols, 2 * V - Math.PI * 9 * 4, 1e-6) && body(e2, "H").bodies.length === 2, `${vols}`);
  e.release(); e2.release();
}
console.log("6. pulling the hole's own faces changes the hole's numbers (mode 1, E32)");
{
  const e = new Engine([...block, hole({ depth: 5, diameter: 6 })]); e.build();
  const bottom = mint("H", "hole", "bottom"), wall = mint("H", "hole", "wall");
  const modes = pullModes(e, "H", bottom); check("the bottom of a hole: mode 1 applies", modes.find((m) => m.mode === "edit")!.ok === true, JSON.stringify(modes.find((m) => m.mode === "edit")));
  const up = originalEdit(e, "H", bottom, 2), wide = originalEdit(e, "H", wall, -1);
  check("pulled up by 2 (out of the material): the hole is 3 deep; the wall pulled by -1 (away from the axis): 2 wider", "params" in up && up.params.depth === 3 && "params" in wide && wide.params.diameter === 8, JSON.stringify([up, wide]));
  if ("params" in up) { e.edit(up.step, up.params); check("applied: the volume is that of a hole 3 deep", near(vol(e, "H"), V - Math.PI * 9 * 3, 1e-6), String(vol(e, "H"))); }
  const too = originalEdit(e, "H", bottom, 10); check("pulled so far the depth would be nothing: refused in words", "why" in too && /depth would be/.test(too.why), JSON.stringify(too));
  const thr = new Engine([...block, hole({ depth: "through" })]); thr.build(); const tb = originalEdit(thr, "H", mint("H", "hole", "bottom"), 1); check("a through hole has no bottom: said", "why" in tb && /no bottom/.test(tb.why), JSON.stringify(tb)); thr.release(); e.release();
}
console.log(failures ? `\n${failures} failure(s)` : "\nno failure");
process.exit(failures ? 1 : 0);

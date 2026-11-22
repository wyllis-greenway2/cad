// A dev check (not a test, `in_1444`) for rounds past the kernel's limit and a size that varies (E34 to E36, `in_1516`): the pointed rod end in the engine, and the radius law.
//   node --experimental-strip-types dev/rounds-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { edgeRef, idKey, mint } from "../src/engine/id.ts";
import { options, trial } from "../src/engine/failure.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
let failures = 0; const check = (label: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ": " + detail : ""}`); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
const st = (e: Engine, id: string) => e.result(id).status as { kind: string; why?: string };
const body = (e: Engine, id: string) => e.result(id).value as Body;
const vol = (e: Engine, id: string) => K.volume(body(e, id).solid);
const R = 10, H = 30;
// a rod of radius 10 and height 30 on the XY plane, its top face the end
const rod = (r = R, h = H): Step[] => [{ id: "c", kind: "sketchCircle", params: { r }, inputs: [] }, { id: "A", kind: "extrude", params: { d: h }, inputs: ["c"] }];
const rim = (e: Engine) => { const b = body(e, "A"), f = b.faces.map((x) => x.id); return edgeRef(f.find((i) => idKey(i) === idKey(mint("A", "end")))!, f.find((i) => idKey(i).includes('"side"'))!); };
const probe = new Engine(rod()); probe.build(); const edge = rim(probe); probe.release();
const rnd = (extra: Record<string, unknown>): Step => ({ id: "F", kind: "round", params: { mode: "fillet", edges: [edge], ...extra }, inputs: ["A"] });
// the volume a pointed end of arc radius s takes off a rod: the integral of the ring outside the arc
const removed = (s: number) => { const t = Math.sqrt(2 * R * s - R * R), n = 20000; let v = 0; for (let i = 0; i < n; i++) { const dz = ((i + 0.5) / n) * t, rho = R - s + Math.sqrt(Math.max(0, s * s - dz * dz)); v += Math.PI * (R * R - rho * rho) * (t / n); } return v; };

console.log("1. the kernel's fillet fails past the radius; the pointed end is the person's choice");
{
  const e = new Engine([...rod(), rnd({ size: 15 })]); e.build();
  check("a round of 15 on a rod of radius 10: refused by the kernel, in words", st(e, "F").kind === "flagged", st(e, "F").why);
  const o = options(e, "F"), c = o.find((x) => x.kind === "continue");
  check("the options offer 'continue past the limit' and say it worked on a copy", !!c && c.applies && c.worked === true, c ? `${c.label} / ${c.why}` : o.map((x) => x.kind).join());
  check("nothing was applied unasked", st(e, "F").kind === "flagged");
  if (c?.change) { const t = trial(e, c.change); check("the trial of that change is ok", t.kind !== "refused", t.why); }
  e.release();
}
console.log("2. the pointed end: valid, the volume equals the hand-worked integral, from the dome to the limit");
for (const s of [10.5, 12, 15, 20, 30, 45, 50]) {
  const e = new Engine([...rod(), rnd({ size: s, past: true })]); e.build();
  const ok = st(e, "F").kind === "ok", got = ok ? K.volume(body(e, "A").solid) - vol(e, "F") : NaN;
  check(`s = ${s}: made, valid, volume taken off ${got.toFixed(4)} equals ${removed(s).toFixed(4)}`, ok && near(got, removed(s), 1e-7), st(e, "F").why);
  if (s === 15) { const b = body(e, "F"); check("three faces (the wall, the arc, the bottom), and the arc's face is named as a kernel round would have named it", b.faces.length === 3 && b.faces.some((f) => idKey(f.id) === idKey(mint("F", "round", edge.a, edge.b, 0))), b.faces.map((f) => idKey(f.id)).join(" | ")); }
  e.release();
}
console.log("3. beyond the limit: refused, with the limit");
{
  const limit = (H * H + R * R) / (2 * R), e = new Engine([...rod(), rnd({ size: limit + 1, past: true })]); e.build();
  check(`the largest is ${limit}: a size above says so`, st(e, "F").kind === "flagged" && st(e, "F").why!.includes(limit.toFixed(3)), st(e, "F").why);
  const small = new Engine([...rod(), rnd({ size: 4, past: true })]); small.build(); const kern = new Engine([...rod(), rnd({ size: 4 })]); kern.build();
  check("a size at or under the radius with past on is the kernel's own round (the same body)", st(small, "F").kind === "ok" && near(vol(small, "F"), vol(kern, "F")), `${vol(small, "F")} ${vol(kern, "F")}`);
  const wrong = new Engine([{ id: "p", kind: "sketchPolygon", params: { points: [[0, 0], [10, 0], [10, 10], [0, 10]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 5 }, inputs: ["p"] }]); wrong.build();
  const b = body(wrong, "A"), top = b.faces.find((f) => idKey(f.id) === idKey(mint("A", "end")))!, side = b.faces.find((f) => idKey(f.id).includes('"side"'))!;
  wrong.setRecipe([...wrong.recipe(), { id: "F", kind: "round", params: { mode: "fillet", size: 20, past: true, edges: [edgeRef(top.id, side.id)] }, inputs: ["A"] }]);
  check("on a block's edge, a pointed end is refused as not defined there", st(wrong, "F").kind === "flagged" && /rod/.test(st(wrong, "F").why ?? ""), st(wrong, "F").why);
  e.release(); small.release(); kern.release(); wrong.release();
}
console.log("4. a rod standing on a plate (the wall ends at the plate): the limit is the boss's own height");
{
  const steps: Step[] = [{ id: "p", kind: "sketchPolygon", params: { points: [[-30, -30], [30, -30], [30, 30], [-30, 30]] }, inputs: [] }, { id: "P", kind: "extrude", params: { d: 5 }, inputs: ["p"] }, { id: "c", kind: "sketchCircle", params: { r: 10, plane: "XY", offset: 5 }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 20 }, inputs: ["c"] }, { id: "U", kind: "combine", params: { mode: "add" }, inputs: ["P", "A"] }];
  const e = new Engine(steps); e.build(); const b = body(e, "U"), top = b.faces.find((f) => idKey(f.id) === idKey(mint("A", "end")))!, wall = b.faces.find((f) => idKey(f.id).includes('"side"') && idKey(f.id).includes('"circle"'))!;
  const ed = edgeRef(top.id, wall.id), limit = (20 * 20 + 100) / 20;
  for (const s of [14, limit - 0.5]) { e.setRecipe([...steps, { id: "F", kind: "round", params: { mode: "fillet", size: s, past: true, edges: [ed] }, inputs: ["U"] }]); const ok = st(e, "F").kind === "ok"; check(`size ${s.toFixed(2)} on the boss: made and valid`, ok && K.valid(body(e, "F").solid), st(e, "F").why); }
  e.setRecipe([...steps, { id: "F", kind: "round", params: { mode: "fillet", size: limit + 1, past: true, edges: [ed] }, inputs: ["U"] }]); check(`above ${limit}: refused`, st(e, "F").kind === "flagged", st(e, "F").why);
  e.release();
}
console.log("5. a size that varies along an edge (the kernel's radius law)");
{
  const W = 40, steps: Step[] = [{ id: "sk", kind: "sketchPolygon", params: { points: [[0, 0], [W, 0], [W, 10], [0, 10]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 30 }, inputs: ["sk"] }];
  const probe2 = new Engine(steps); probe2.build(); const b = body(probe2, "A"), top = b.faces.find((f) => idKey(f.id) === idKey(mint("A", "end")))!, side = b.faces.find((f) => idKey(f.id) === idKey(mint("A", "side", mint("sk", "line", 0))))!; const ed = edgeRef(top.id, side.id); probe2.release();
  const mk = (extra: Record<string, unknown>): Engine => { const e = new Engine([...steps, { id: "F", kind: "round", params: { mode: "fillet", edges: [ed], ...extra }, inputs: ["A"] }]); e.build(); return e; };
  const k = 1 - Math.PI / 4, constant = mk({ size: 2 }), grow = mk({ sizes: [[0, 1], [1, 5]] }), swell = mk({ sizes: [[0, 1], [0.5, 5], [1, 1]] }), same = mk({ sizes: [[0, 2], [0.5, 2], [1, 2]] });
  const taken = (e: Engine) => K.volume(body(e, "A").solid) - vol(e, "F");
  check("a constant size 2 over 40: the round takes (1 - pi/4) 4 x 40", st(constant, "F").kind === "ok" && near(taken(constant), k * 4 * W, 1e-6), String(taken(constant)));
  check("2 -> 2 -> 2 as a law is the same as constant", st(same, "F").kind === "ok" && near(taken(same), taken(constant), 1e-6), String(taken(same)));
  // the size really made, by sectioning: a slab of the block and of the rounded block at x; the area the round took out of the section is (1 - pi/4) size^2
  const sizeAt = (e: Engine, x: number): number => { const d = 0.25, slab = K.prism(K.polygonFace3([[x - d, -1, -1], [x - d, 11, -1], [x - d, 11, 31], [x - d, -1, 31]]), [2 * d, 0, 0]).solid; return Math.sqrt((K.volume(K.common(body(e, "A").solid, slab).solid) - K.volume(K.common(body(e, "F").solid, slab).solid)) / (2 * d) / k); };
  const sec = [10, 20, 30].map((x) => sizeAt(grow, x));
  check("1 -> 5 (a straight law): valid; the middle is 3, the quarter points are symmetric about it, and the size runs from small to large (the law is linear between two points)", st(grow, "F").kind === "ok" && K.valid(body(grow, "F").solid) && Math.abs(sec[1]! - 3) < 0.05 && Math.abs(sec[0]! + sec[2]! - 6) < 0.1 && Math.abs(sec[2]! - sec[0]!) > 2, sec.map((v) => v.toFixed(3)).join(" "));
  const nearBig = mk({ sizes: [[0, 1], [1, 5]], near: [W, 0, 30] }), nearSmall = mk({ sizes: [[0, 1], [1, 5]], near: [0, 0, 30] });
  const a = [10, 30].map((x) => sizeAt(nearBig, x)), c = [10, 30].map((x) => sizeAt(nearSmall, x));
  check("`near` says which end the first size belongs to: the 1 is at the end near x = 40 for one, near x = 0 for the other", a[1]! < a[0]! && c[0]! < c[1]!, `${a.map((v) => v.toFixed(2))} | ${c.map((v) => v.toFixed(2))}`);
  for (const e of [nearBig, nearSmall]) e.release();
  check("1 -> 5 -> 1: valid, and it takes more than the constant 1 and less than the constant 5", st(swell, "F").kind === "ok" && K.valid(body(swell, "F").solid) && taken(swell) > k * 1 * W && taken(swell) < k * 25 * W, String(taken(swell)));
  const bad = mk({ sizes: [[0, 1]] }); check("one point is not a law: refused in words", st(bad, "F").kind === "flagged" && /list of/.test(st(bad, "F").why ?? ""), st(bad, "F").why);
  const chamfer = mk({ mode: "chamfer", sizes: [[0, 1], [1, 3]] }); check("a chamfer cannot vary yet: said", st(chamfer, "F").kind === "flagged" && /chamfer cannot vary/.test(st(chamfer, "F").why ?? ""), st(chamfer, "F").why);
  const e2 = mk({ sizes: [[0, 1], [1, 5]] }); e2.edit("F", { ...e2.step("F").params, sizes: [[0, 2], [1, 2]] }); check("edit the law to a constant: equals a fresh constant round", near(taken(e2), taken(constant), 1e-6) && e2.result("F").status.kind === "ok");
  for (const e of [constant, grow, swell, same, bad, chamfer, e2]) e.release();
}
console.log(failures ? `\n${failures} failure(s)` : "\nno failure");
process.exit(failures ? 1 : 0);

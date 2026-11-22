// A dev check (not a test, `in_1444`) for named parameters (E66, E67): expressions, errors in words, only the steps that use a parameter run again, a trial and a range of a parameter.
//   node --experimental-strip-types dev/params-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { evaluate, namesIn, resolve, scopeOf, valuesOf } from "../src/engine/params.ts";
import { options, probeParam, trial } from "../src/engine/failure.ts";
import { edgeRef, mint } from "../src/engine/id.ts";
import { rectangle } from "../src/engine/sketch.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
let failures = 0; const check = (label: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ": " + detail : ""}`); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
const throws = (f: () => unknown): string => { try { f(); return ""; } catch (e) { return e instanceof Error ? e.message : String(e); } };

console.log("1. the expressions");
{
  const v = (s: string, t: Record<string, number | string> = {}) => evaluate(s, scopeOf(t));
  check("arithmetic and precedence: 2 + 3 * 4 ^ 2 / 8 = 8", near(v("2 + 3 * 4 ^ 2 / 8"), 8));
  check("a minus before a power: -2^2 = -4, and 2^-1 = 0.5, and 2^3^2 = 512", near(v("-2^2"), -4) && near(v("2^-1"), 0.5) && near(v("2^3^2"), 512));
  check("degrees: sin(30) = 0.5, atan2(1, 1) = 45, acos(0.5) = 60", near(v("sin(30)"), 0.5) && near(v("atan2(1, 1)"), 45) && near(v("acos(0.5)"), 60));
  check("functions: sqrt, min, max, hypot, round, floor, ceil, abs, pow", near(v("sqrt(16) + min(3, 1, 2) + max(1, 5) + hypot(3, 4)"), 15) && near(v("round(2.5) + floor(2.9) + ceil(2.1) + abs(-1) + pow(2, 3)"), 3 + 2 + 3 + 1 + 8));
  check("a leading = is allowed and pi is there", near(v("=pi * 2"), 2 * Math.PI));
  const t = { width: 20, half: "width / 2", margin: "=half - 1.5", depth: "min(width, 30) * 0.25" };
  check("parameters use each other, in any order", near(v("margin + depth", t), 8.5 + 5) && near(v("half", t), 10));
  check("numbers with exponents and a leading point: 1.5e1 + .5", near(v("1.5e1 + .5"), 15.5));
  check("the names an expression uses", namesIn("=width/2 + max(a, b) * pi").sort().join() === "a,b,width");
  const err = (s: string, t: Record<string, number | string> = {}) => throws(() => v(s, t));
  check("a parameter that is not there is named", /no parameter nothere/.test(err("1 + nothere")), err("1 + nothere"));
  check("a division by nothing is said", /division by nothing/.test(err("1 / (2 - 2)")), err("1 / (2 - 2)"));
  check("a cycle is said, with the way round", /a depends on itself \(a → b → a\)/.test(err("a", { a: "b + 1", b: "a + 1" })), err("a", { a: "b + 1", b: "a + 1" }));
  check("a result that is not a number is said: sqrt(-1), and an infinite one", /not a number/.test(err("sqrt(-1)")) && /not a number/.test(err("pow(10, 400)")));
  check("a wrong number of arguments and an unknown function are said", /takes 1 number/.test(err("sin(1, 2)")) && /no function foo/.test(err("foo(1)")));
  check("a syntax mistake says where", /position/.test(err("2 +* 3")) && /position/.test(err("(1 + 2")), `${err("2 +* 3")} | ${err("(1 + 2")}`);
  check("a parameter cannot be called pi or sin", /constant or a function/.test(err("pi2 + pi", { pi: 3 }) + err("x", { x: "1", sin: 2 }) + throws(() => scopeOf({ sin: 2 })("sin"))), throws(() => scopeOf({ sin: 2 })("sin")));
  const all = valuesOf({ ok: 3, bad: "ok / 0", worse: "bad + 1", fine: "ok * 2" });
  check("a table with mistakes still gives every value it can, and says which parameters could not", all.values.fine === 6 && !!all.errors.bad && !!all.errors.worse && /bad/.test(all.errors.worse), JSON.stringify(all.errors));
  check("resolve: only strings that start with = are expressions, deep in the tree", JSON.stringify(resolve({ a: "=width", b: ["=1+1", "plain", { c: "=width*2" }], d: 5, e: "no" }, scopeOf({ width: 3 }))) === '{"a":3,"b":[2,"plain",{"c":6}],"d":5,"e":"no"}');
}

console.log("2. in the engine: a sketch and an extrusion driven by parameters");
{
  const rect = rectangle(0, 0, 10, 5), withExpr = { ...rect, constraints: rect.constraints!.map((c) => (c.id === "w" ? { ...c, value: "=width" } : c.id === "h" ? { ...c, value: "=width / 2" } : c)) };
  const steps: Step[] = [{ id: "s", kind: "sketch", params: withExpr, inputs: [] }, { id: "E", kind: "extrude", params: { d: "=depth" }, inputs: ["s"] }, { id: "o", kind: "sketchPolygon", params: { points: [[0, 0], [3, 0], [3, 3]] }, inputs: [] }, { id: "O", kind: "extrude", params: { d: 2 }, inputs: ["o"] }];
  const e = new Engine(steps, { parameters: { width: 10, depth: "width / 5" } }); e.build();
  const vol = (id: string) => K.volume((e.result(id).value as Body).solid);
  check("width 10, depth width/5 = 2: a 10 by 5 plate 2 deep = 100", e.result("E").status.kind === "ok" && near(vol("E"), 100), `${e.result("E").status.kind} ${vol("E")}`);
  const ch = e.setParameters({ width: 20, depth: "width / 5" });
  check("width 20: 20 x 10 x 4 = 800, and only the steps that use it ran again (s and E, not o or O)", near(vol("E"), 800) && ch.recomputed.join() === "s,E", ch.recomputed.join());
  const same = e.setParameters({ width: 20, depth: "4" }); check("depth written another way with the same number runs the step again but nothing after it changes", same.changed.length === 0, JSON.stringify(same));
  const mid = e.setParameters({ width: 20, depth: "=2 * 2" }); check("an expression with the same value does not run again", mid.recomputed.length === 0, mid.recomputed.join());
  const bad = e.setParameters({ width: 20, depth: "width / 0" });
  const why = (e.result("E").status as { why?: string }).why ?? ""; check("a mistake in a parameter flags the step that uses it, in words that name the parameter", e.result("E").status.kind === "flagged" && /depth/.test(why) && /division by nothing/.test(why), why);
  check("and the steps that do not use it are untouched", e.result("O").status.kind === "ok" && bad.recomputed.join() === "E", bad.recomputed.join());
  e.setParameters({ width: 20, depth: 4 }); check("back to a good number: the step is fine again, equal to before", e.result("E").status.kind === "ok" && near(vol("E"), 800));
  const fresh = new Engine(e.recipe(), { parameters: e.parameters() }); fresh.build(); check("incremental equals a fresh build", e.ids().every((i) => e.result(i).fingerprint === fresh.result(i).fingerprint)); fresh.release();
  const gone = new Engine(steps); gone.build(); check("with no table at all the step says it, naming the parameter", /no parameter depth/.test((gone.result("E").status as { why?: string }).why ?? ""), (gone.result("E").status as { why?: string }).why); gone.release();
  e.release();
}

console.log("3. a trial, a range and the options when a step fails because of a parameter (E67)")
{
  const W = 40, H = 30, D = 10, line = (i: number) => mint("sk", "line", i), side = (i: number) => mint("A", "side", line(i)), top = mint("A", "end");
  const block: Step[] = [{ id: "sk", kind: "sketchPolygon", params: { points: [[0, 0], [W, 0], [W, H], [0, H]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: D }, inputs: ["sk"] }];
  const chamfered = (size: number | string): Step[] => [...block, { id: "C", kind: "round", params: { mode: "chamfer", size, edges: [0, 1, 2, 3].map((i) => edgeRef(top, side(i))) }, inputs: ["A"] }];
  const e = new Engine(chamfered("=edge"), { parameters: { edge: 2 } }); e.build();
  check("a chamfer sized by a parameter: made", e.result("C").status.kind === "ok");
  const t = trial(e, { op: "param", name: "edge", value: 4 }); check("a trial of the parameter at 4: fine, and the engine it was asked of is as it was", t.kind !== "refused" && e.parameters().edge === 2, `${t.kind} ${t.why}`);
  const t2 = trial(e, { op: "param", name: "edge", value: 14 }); check("at 14 (a 30 wide plate would meet itself): refused, and the step that fails is named", t2.kind === "refused" && t2.failing?.includes("C") === true || t2.step === "C", `${t2.kind} ${t2.why}`);
  const t3 = trial(e, { op: "param", name: "edge", value: "1 / 0" }); check("a bad expression is refused in words", t3.kind === "refused" && /division by nothing/.test(t3.why), t3.why);
  const pr = probeParam(e, "edge", { lo: 0.01, hi: 30 }); check("where the parameter works: a range that ends below 12 (where the chamfers meet)", pr.key === "edge" && pr.ok.length >= 1 && pr.ok[0]!.to < 13 && pr.ok[0]!.to > 5, JSON.stringify(pr.ok));
  e.setParameters({ edge: 14 }); check("now the step fails", e.result("C").status.kind !== "ok", JSON.stringify(e.result("C").status));
  const o = options(e, "C"), r = o.find((x) => x.kind === "range")!;
  check("the options offer the range of the parameter, not of the step's number, and the change is a change of the parameter", r.applies && r.change?.op === "param" && (r.change as { name: string }).name === "edge" && r.label.startsWith("edge:"), `${r.label} / ${JSON.stringify(r.change)}`);
  check("and the nearest place was tried and works", r.worked === true, r.why);
  const two = new Engine(chamfered("=edge * 2"), { parameters: { edge: 8 } }); two.build();
  const o2 = options(two, "C").find((x) => x.kind === "range")!; check("a number that is an expression of a parameter says so and does not guess which to change", !o2.applies && /expression/.test(o2.label), o2.label);
  two.release(); e.release();
}
console.log(failures ? `\n${failures} failure(s)` : "\nno failure");
process.exit(failures ? 1 : 0);

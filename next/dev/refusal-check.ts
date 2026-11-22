// A dev check (not a test, `in_1444`) for the one channel of refusals (E55, `inv_constraint_uniformity`): whatever a constraint holds back (a sketch that cannot be made, a drag, a typed number, a body edit that breaks a sketch, a constraint asked for)
// comes back as the same data: a refusal, the constraints that hold it named, and which of them were there before; and a constraint that already holds is said, and added once.
//   node --experimental-strip-types dev/refusal-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { edgeRef, mint } from "../src/engine/id.ts";
import { rectangle } from "../src/engine/sketch.ts";
import { solve, tryAdd, type Constraint, type System } from "../src/engine/solver.ts";
import { trial } from "../src/engine/failure.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
let failures = 0; const check = (label: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ": " + detail : ""}`); };
const rect = (): System => { const r = rectangle(0, 0, 10, 5); return { points: r.points!.map((p) => ({ ...p, fixed: false })), lines: r.lines!, circles: [], constraints: r.constraints! }; };

console.log("1. a drag that the constraints do not allow: refused, with what holds it back named");
{
  const S = rect(), r = solve(S, { pins: { C: [20, 20] } });
  check("the pin is not reached, and says how far", Object.keys(r.unreached).includes("C") && r.unreached.C! > 5, JSON.stringify(r.unreached));
  check("the constraints that hold it back are named", r.holds.length > 0 && r.holds.every((id) => S.constraints.some((c) => c.id === id)), JSON.stringify(r.holds));
  const without = { ...S, constraints: S.constraints.filter((c) => !r.holds.includes(c.id)) }; check("with those left out, the pin is reached", Object.keys(solve(without, { pins: { C: [20, 20] } }).unreached).length === 0);
  check("none of them can be left out of the set: with the pin, the set less any one of its members lets the pin through", r.holds.every((m) => Object.keys(solve({ ...S, constraints: S.constraints.filter((c) => r.holds.includes(c.id) && c.id !== m) }, { pins: { C: [20, 20] } }).unreached).length === 0));
  const free = solve({ ...S, constraints: S.constraints.filter((c) => c.id !== "w" && c.id !== "h") }, { pins: { C: [20, 20] } }); check("a drag that the constraints allow has no holds", Object.keys(free.unreached).length === 0 && free.holds.length === 0, JSON.stringify(free.holds));
}
console.log("2. a typed number: the request is not what holds it back");
{
  const base: Step[] = [{ id: "s", kind: "sketch", params: rectangle(0, 0, 10, 5), inputs: [] }, { id: "E", kind: "extrude", params: { d: 4 }, inputs: ["s"] }];
  const e = new Engine(base); e.build(); const p = e.step("s").params as any;
  const bad = trial(e, { op: "edit", step: "s", params: { ...p, constraints: [...p.constraints, { id: "w2", kind: "length", parts: ["bottom"], value: 11 }] } });
  check("a second width: refused, all the conflicting constraints are victims, and the one that was there before holds it back", bad.kind === "refused" && (bad.victims ?? []).includes("w") && (bad.victims ?? []).includes("w2") && JSON.stringify(bad.holding) === JSON.stringify(["w"]), JSON.stringify({ v: bad.victims, h: bad.holding }));
  const retype = trial(e, { op: "edit", step: "s", params: { ...p, constraints: p.constraints.map((c: any) => (c.id === "w" ? { ...c, value: 12 } : c)) } }); check("the same width retyped as 12: fine", retype.kind === "ok", retype.why);
  e.release();
}
console.log("3. a change to a body that breaks a sketch: the sketch is named, with its constraints");
{
  const top = mint("A", "end"), side = (i: number) => mint("A", "side", mint("b", "line", i));
  const sk = (fixed: boolean): Step => ({ id: "s2", kind: "sketch", params: { ...rectangle(13, 2, 4, 5, { fixCorner: fixed }), plane: "XY", offset: 10, anchors: [{ id: "e1", edge: edgeRef(top, side(1)) }],
    constraints: [...rectangle(13, 2, 4, 5, { fixCorner: fixed }).constraints!, { id: "gap", kind: "pointLineDistance", parts: ["B", "e1"], value: 3 }, { id: "y", kind: "verticalDistance", parts: ["e1.a", "B"], value: 2 }] }, inputs: ["A"] });
  const steps = (fixed: boolean): Step[] => [{ id: "b", kind: "sketchPolygon", params: { points: [[0, 0], [20, 0], [20, 20], [0, 20]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 10 }, inputs: ["b"] }, sk(fixed)];
  const ok = new Engine(steps(false)); ok.build(); const widen = trial(ok, { op: "edit", step: "b", params: { points: [[0, 0], [30, 0], [30, 20], [0, 20]] } }); check("widen the body when the rectangle follows its edge: fine", widen.kind === "ok", widen.why); ok.release();
  const held = new Engine(steps(true)); held.build(); check("(the rectangle held at a place on the sketch fits the body as it is)", held.result("s2").status.kind === "ok", JSON.stringify(held.result("s2").status));
  const v = trial(held, { op: "edit", step: "b", params: { points: [[0, 0], [30, 0], [30, 20], [0, 20]] } });
  check("widen it when the rectangle is also held at a place: refused, the sketch step is named, with the constraints that cannot hold", v.kind === "refused" && v.failing?.includes("s2") === true && (v.victims ?? []).includes("gap") && /s2/.test(v.why), JSON.stringify({ k: v.kind, f: v.failing, v: v.victims, why: v.why.slice(0, 90) }));
  check("the body edit itself asked for no constraint, so everything that holds it back was there before", JSON.stringify(v.holding) === JSON.stringify(v.victims)); held.release();
}
console.log("4. asking for a constraint: made, already holds, or refused");
{
  const S = rect(), c = (id: string, kind: Constraint["kind"], parts: string[], value?: number): Constraint => ({ id, kind, parts, ...(value !== undefined ? { value } : {}) });
  const a = tryAdd(S, c("new1", "perpendicular", ["bottom", "right"]));
  check("perpendicular sides of a rectangle that is level and upright already holds: said, nothing added, the verdict shows it", a.outcome === "already" && a.system === S && a.system.constraints.length === S.constraints.length, JSON.stringify({ o: a.outcome, by: a.by.length }));
  const twin = tryAdd(S, c("again", "length", ["bottom"], 10)); check("the same width again: already, by the one that says it", twin.outcome === "already" && twin.by.includes("w"), JSON.stringify(twin.by));
  const clash = tryAdd(S, c("w3", "length", ["bottom"], 12)); check("a different width: refused, with the one that holds it back named apart from the request", clash.outcome === "refused" && clash.victims.includes("w3") && clash.holding.includes("w") && !clash.holding.includes("w3"), JSON.stringify({ v: clash.victims, h: clash.holding }));
  const loose: System = { ...S, constraints: S.constraints.filter((q) => q.id !== "w") }; const added = tryAdd(loose, c("w4", "length", ["bottom"], 10)); check("a width where there was none: added, one constraint more", added.outcome === "added" && added.system.constraints.length === loose.constraints.length + 1);
  const hv = tryAdd(S, c("hh", "horizontal", ["right"])); check("a side that is upright made level too: refused (a line of nothing), the upright one named as what holds it", hv.outcome === "refused" && hv.holding.length === 1 && hv.holding[0] === "vr", JSON.stringify({ o: hv.outcome, h: hv.holding }));
}
console.log(failures ? `\n${failures} failures` : "\nno failure"); process.exit(failures ? 1 : 0);

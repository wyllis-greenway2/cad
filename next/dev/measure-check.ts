// A dev check (not a test, `in_1444`) of the measured numbers (`dec_dimensions_measure_then_lock`, slice a), without a page: a selection's own number is a bubble with an open padlock until it is locked (then a closed one); a number can be typed over.
//   node --experimental-strip-types dev/measure-check.ts
import { MEASURE_ID, bubblesOn, ownMeasure } from "../src/interaction/bubbles.ts";
import { addCircle, addRect, constrain, emptySketch, keep, refOf, unconstrain, viewSystem, type Sol } from "../src/interaction/drawing.ts";
import { solveDefinition } from "../src/engine/definition.ts";
import type { SketchParams } from "../src/engine/sketch.ts";
import { check, failureCount } from "./lib.ts";

const sol = (p: SketchParams): Sol => { const s = solveDefinition(p); return { points: s.points, radii: s.radii }; };
let p = emptySketch(); const s0 = sol(p), k = keep(addRect(p, s0, refOf(p, s0, [0, 0], 0.5), refOf(p, s0, [40, 25], 0.5))!); if (!k.ok) throw new Error(k.why); p = k.params;
const k2 = keep(addCircle(p, sol(p), refOf(p, sol(p), [100, 100], 0.5), [105, 100])!); if (!k2.ok) throw new Error(k2.why); p = k2.params;
const own = (ids: string[]) => bubblesOn(viewSystem(p, sol(p)), ids).filter((b) => b.kind === "dimension" && b.locked === false);

let b = own(["L1"]);
check("a side: its length, measured, an open padlock", b.length === 1 && b[0]!.id === MEASURE_ID && b[0]!.text === "40" && b[0]!.relation === "length" && b[0]!.locked === false);
b = own(["L2"]); check("another side: 25", b.length === 1 && b[0]!.text === "25");
b = own(["K1"]); check("a circle: its radius (5)", b.length === 1 && b[0]!.relation === "radius" && b[0]!.text === "5" && b[0]!.symbol === "R");
b = own(["L1", "L2"]); check("two sides that meet: the angle (90)", b.length === 1 && b[0]!.relation === "angle" && /^-?90$/.test(b[0]!.text ?? ""));
b = own(["P1", "P3"]); check("two corners: their distance", b.length === 1 && b[0]!.relation === "distance");
check("one corner alone: no number", own(["P1"]).length === 0);
check("nothing selected: no number, and three parts: none", own([]).length === 0 && own(["L1", "L2", "L3"]).length === 0 && ownMeasure(viewSystem(p, sol(p)), []) === null);
const typed = constrain(p, sol(p), ["L1"], "dimension", 55);
check("a number typed over it locks it at that number", typed.ok && typed.params.constraints!.some((c) => c.kind === "length" && c.value === 55));
if (typed.ok) {
  const after = bubblesOn(viewSystem(typed.params, typed.sol), ["L1"]), dims = after.filter((x) => x.kind === "dimension");
  check("then the bubble is the locked one (a closed padlock), and the measured one is gone", dims.length === 1 && dims[0]!.locked === true && dims[0]!.text === "55" && !after.some((x) => x.id === MEASURE_ID));
  const free = unconstrain(typed.params, typed.params.constraints!.find((c) => c.kind === "length")!.id);
  check("letting it go makes it measured again (the sketch keeps the length it has)", free.ok && bubblesOn(viewSystem(free.params, free.sol), ["L1"]).some((x) => x.id === MEASURE_ID && x.text === "55"));
}
const locked = constrain(p, sol(p), ["L1"], "dimension");
check("locking without a number locks what it measures now", locked.ok && locked.params.constraints!.some((c) => c.kind === "length" && c.value === 40));
const bad = constrain(p, sol(p), ["L1"], "dimension", -3);
check("a size below nothing is refused in words", !bad.ok && /more than nothing/.test(bad.why));
const ang = constrain(p, sol(p), ["L1", "L2"], "dimension", 60);
check("an angle can be anything (60 on two sides that were square: refused or kept, in words)", ang.ok || !!(ang as { why: string }).why);
process.exit(failureCount() ? 1 : 0);

// A dev check (not a test, `in_1444`) of the helper bar's descriptions: node --experimental-strip-types dev/helperbar-check.ts
import { barFor } from "../src/interaction/infobar.ts";
import { addRect, emptySketch, keep, viewSystem } from "../src/interaction/drawing.ts";
import { refOf } from "../src/interaction/drawing.ts";
import { check, failureCount } from "./lib.ts";
let p = emptySketch(); const s0 = { points: {}, radii: {} };
const n = addRect(p, s0, refOf(p, s0, [0, 0], 0.5), refOf(p, s0, [40, 25], 0.5))!; const k = keep(n); if (!k.ok) throw new Error(k.why); p = k.params;
const S = viewSystem(p, k.sol);
check("nothing selected: no bar", barFor(S, []).length === 0);
const one = barFor(S, ["L1"]), two = barFor(S, ["L1", "L3"]), pts = barFor(S, ["P1", "P2"]), ids = (b: { id: string }[]) => b.map((x) => x.id).join();
check("a side of the rectangle has nothing to add (level is said, upright is refused): no bar; no number (on the bubble), no delete (a key and a click on nothing do that)", one.length === 0, ids(one));
import { addLine } from "../src/interaction/drawing.ts";
const sd = viewSystem(p, k.sol), kd = keep(addLine(p, k.sol, refOf(p, k.sol, [100, 100], 0.5), refOf(p, k.sol, [130, 120], 0.5))!); if (!kd.ok) throw new Error(kd.why);
const diag = barFor(viewSystem(kd.params, kd.sol), ["L5"]), dg = ids(diag); void sd;
check("a free slanted line: level and upright are offered as new, with nothing else", diag.some((b) => b.id === "rel:horizontal" && b.tone === "free") && diag.some((b) => b.id === "rel:vertical") && diag.every((b) => b.id.startsWith("rel:")), dg);
check("a side that is level: level is said already and is not offered; a vertical would be refused and is not offered either", !one.some((b) => b.id === "rel:horizontal" || b.id === "rel:vertical"), ids(one));
check("two opposite level sides: parallel follows from what is there so it is not offered, an angle is a number (on its bubble)", !two.some((b) => b.id === "rel:parallel" || b.id === "rel:angle"), ids(two));
check("two points: no distance on the bar (it is on the bubble)", !pts.some((b) => /istance/.test(b.id)), ids(pts));
check("everything on the bar is new or true as drawn: the tones are free or holds, never refused", [...one, ...two, ...pts].every((b) => b.tone === "free" || b.tone === "holds"));
check("every button has an icon key and words", [...one, ...two, ...pts].every((b) => b.icon && b.label));
// near suggestions and the whole info (`dec_three_surfaces`): relations with one other part that hold now and would be new; facts on the left, suggestions on the right
import { addCircle } from "../src/interaction/drawing.ts";
import { nearConstraint, nearFor } from "../src/interaction/infobar.ts";
import { marksFor } from "../src/interaction/marks.ts";
{
  let q = emptySketch(); const z = { points: {}, radii: {} } as never, k1 = keep(addLine(q, z, refOf(q, z, [0, 0], 0.5), refOf(q, z, [40, 0], 0.5))!); if (!k1.ok) throw new Error(k1.why); q = k1.params;
  const k2 = keep(addCircle(q, k1.sol, refOf(q, k1.sol, [20, 5], 0.5), [25, 5])!); if (!k2.ok) throw new Error(k2.why); q = k2.params;
  const k3 = keep(addLine(q, k2.sol, refOf(q, k2.sol, [0, 30], 0.5), refOf(q, k2.sol, [40, 30], 0.5))!); if (!k3.ok) throw new Error(k3.why); q = k3.params;
  const sys = viewSystem(q, k3.sol), near = nearFor(sys, ["L1"]);
  check("a line touching a circle: the tangent with it is a near suggestion", near.some((b) => b.id.startsWith("near:tangent:") && /K1/.test(b.id)), near.map((b) => b.id).join());
  check("at most two near suggestions", nearFor(sys, ["L1"], 9).length >= nearFor(sys, ["L1"]).length && nearFor(sys, ["L1"]).length <= 2);
  const nc = nearConstraint(near[0]!.id);
  check("a near suggestion says the constraint it makes: the relation and the parts", !!nc && nc.parts.includes("L1") && nc.parts.length === 2, JSON.stringify(nc));
  check("nothing selected, or three parts: no near suggestions", nearFor(sys, []).length === 0 && nearFor(sys, ["L1", "L2", "K1"]).length === 0);
  check("a line level with another far from it shows its own number, measured (an open padlock), as a mark", marksFor(sys, ["L2"], { now: 0 }).some((m) => m.kind === "dimension" && m.locked === false));
  check("what is offered for a selection is new or true as drawn (never refused or already said)", [...barFor(sys, ["L1"]), ...barFor(sys, ["L1", "K1"]), ...nearFor(sys, ["L1"])].every((b) => b.tone === "free" || b.tone === "holds"));
}
process.exit(failureCount() ? 1 : 0);

// A dev check (not a test, `in_1444`) of the helpers of drawing: node --experimental-strip-types dev/hints-check.ts
import { addRect, emptySketch, keep, refOf, type Sol } from "../src/interaction/drawing.ts";
import { hintAt } from "../src/interaction/hints.ts";
import { solveDefinition } from "../src/engine/definition.ts";
import type { SketchParams } from "../src/engine/sketch.ts";
import { check, failureCount } from "./lib.ts";

const sol = (p: SketchParams): Sol => { const s = solveDefinition(p); return { points: s.points, radii: s.radii }; };
let p = emptySketch(); const s0 = sol(p), k = keep(addRect(p, s0, refOf(p, s0, [0, 0], 0.5, 1), refOf(p, s0, [40, 25], 0.5, 1))!); if (!k.ok) throw new Error(k.why); p = k.params;
const s = sol(p), n0 = p.constraints!.length;
let h = hintAt(p, s, [100, 100], [130, 101], 0.1);
check("a line a little off level goes level, hint horizontal", h.hints[0]?.kind === "horizontal" && Math.abs(h.at[1] - 100) < 1e-9);
h = hintAt(p, s, [100, 100], [140, 120], 0.1);
check("a plain slope gets no hint and does not move", h.hints.length === 0 && h.at[0] === 140 && h.at[1] === 120);
h = hintAt(p, s, [100, 100], [101, 130], 0.1);
check("nearly upright goes upright", h.hints[0]?.kind === "vertical" && Math.abs(h.at[0] - 100) < 1e-9);
h = hintAt(p, s, null, [20.3, 0.2], 0.1);
check("near the middle of a side takes the middle", h.hints[0]?.kind === "midpoint" && h.at[0] === 20 && h.at[1] === 0);
h = hintAt(p, s, null, [60, 25.3], 0.1);
check("in line with a corner level: takes its coordinate, a dashed guide to it", h.at[1] === 25 && h.guides.length === 1);
// a circle of radius 5 at (100, 100); a line from (80, 100) going across: the tangent from there is asin(5/20) = 14.48 degrees off the line to the centre
import { addCircle } from "../src/interaction/drawing.ts";
const kc = keep(addCircle(p, s, refOf(p, s, [100, 100], 0.5, 1), [105, 100])!); if (!kc.ok) throw new Error(kc.why);
const pc = kc.params, sc = sol(pc), ang = Math.asin(5 / 20);
h = hintAt(pc, sc, [80, 100], [80 + 30 * Math.cos(ang + 0.03), 100 + 30 * Math.sin(ang + 0.03)], 0.1);
check("a line from outside a circle that is nearly tangent becomes tangent, and says which circle", h.hints[0]?.kind === "tangent" && h.hints[0].part === "K1" && Math.abs(Math.atan2(h.at[1] - 100, h.at[0] - 80) - ang) < 1e-9);
check("the helpers make no constraint", p.constraints!.length === n0);
process.exit(failureCount() ? 1 : 0);

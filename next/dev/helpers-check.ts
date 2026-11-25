// A dev check (not a test, `in_1444`) of the helpers of drawing: node --experimental-strip-types dev/helpers-check.ts
import { addRect, emptySketch, keep, refOf, type Sol } from "../src/interaction/drawing.ts";
import { place, showOf } from "../src/interaction/helpers.ts";
import { solveDefinition } from "../src/engine/definition.ts";
import type { SketchParams } from "../src/engine/sketch.ts";
import { check, failureCount } from "./lib.ts";

const sol = (p: SketchParams): Sol => { const s = solveDefinition(p); return { points: s.points, radii: s.radii }; };
let p = emptySketch(); const s0 = sol(p), k = keep(addRect(p, s0, refOf(p, s0, [0, 0], 0.5), refOf(p, s0, [40, 25], 0.5))!); if (!k.ok) throw new Error(k.why); p = k.params;
const s = sol(p), n0 = p.constraints!.length;
const mm = 0.1; // (a pixel is 0.1 mm: a line helper reaches 0.6 mm, a point helper 1.2 mm)
let h = place(p, s, [100, 100], [130, 100.4], mm);
check("a line a little off level goes level", h.held[0]?.name === "horizontal" && h.at[1] === 100 && h.at[0] === 130);
h = place(p, s, [100, 100], [140, 120], mm);
check("a plain slope gets no helper and does not move", h.held.length === 0 && h.at[0] === 140 && h.at[1] === 120);
h = place(p, s, [100, 100], [100.4, 130], mm);
check("nearly upright goes upright", h.held[0]?.name === "vertical" && h.at[0] === 100);
h = place(p, s, [100, 100], [100.3, 100.3], mm);
check("close to its own start nothing is taken (no jitter)", h.held.length === 0);
h = place(p, s, null, [20.3, 0.2], mm);
check("near the middle of a side takes the middle", h.held[0]?.name === "midpoint" && h.at[0] === 20 && h.at[1] === 0);
h = place(p, s, null, [60, 25.3], mm);
check("in line with a corner: takes its coordinate", h.held[0]?.name === "aligned" && h.at[1] === 25 && h.at[0] === 60);
check("and shows one dashed guide from the corner to the place", (() => { const g = showOf(p, s, h, () => null, null).filter((x) => x.kind === "guide"); return g.length === 1 && g[0]!.pts[0]![0] === 40 && g[0]!.pts[1]![0] === 60; })());
// a circle of radius 5 at (100, 100); a line from (80, 100): the tangent is asin(5/20) = 14.48 degrees off the line to the centre
import { addCircle } from "../src/interaction/drawing.ts";
const kc = keep(addCircle(p, s, refOf(p, s, [100, 100], 0.5), [105, 100])!); if (!kc.ok) throw new Error(kc.why);
const pc = kc.params, sc = sol(pc), ang = Math.asin(5 / 20);
h = place(pc, sc, [80, 100], [80 + 30 * Math.cos(ang + 0.01), 100 + 30 * Math.sin(ang + 0.01)], mm);
check("a line from outside a circle nearly tangent becomes tangent, and says which circle", h.held[0]?.name === "tangent" && h.held[0].part === "K1" && Math.abs(Math.atan2(h.at[1] - 100, h.at[0] - 80) - ang) < 1e-9);
check("a lit part comes with it", showOf(pc, sc, h, (n) => (n === "K1" ? [[0, 0]] : null), null).some((x) => x.kind === "tie"));
h = place(pc, sc, null, [40.3, 100.3], mm);
check("two helpers cross: in line with a corner upright and with a circle's middle level, the place is where they cross", h.held.length === 2 && Math.abs(h.at[0] - 40) < 1e-9 && Math.abs(h.at[1] - 100) < 1e-9);
check("the middle of a circle has a dashed cross", showOf(pc, sc, { at: [100, 100], held: [] }, () => null, "P5").filter((x) => x.kind === "guide").length === 2);
check("the helpers make no constraint", p.constraints!.length === n0);
process.exit(failureCount() ? 1 : 0);

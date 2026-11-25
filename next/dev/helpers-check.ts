// A dev check (not a test, `in_1444`) of the helpers of drawing, read from the relation table: node --experimental-strip-types dev/helpers-check.ts
import { addCircle, addRect, emptySketch, keep, refOf, type Sol } from "../src/interaction/drawing.ts";
import { settings } from "../src/settings.ts";
import { helpersAt } from "../src/engine/helpers.ts";
import { RELATIONS } from "../src/engine/solver.ts";
import { solveDefinition, systemOf } from "../src/engine/definition.ts";
import type { SketchParams } from "../src/engine/sketch.ts";
import { check, failureCount } from "./lib.ts";

const sol = (p: SketchParams): Sol => { const s = solveDefinition(p); return { points: s.points, radii: s.radii }; };
const sysOf = (p: SketchParams) => { const s = solveDefinition(p), S = systemOf(p); return { ...S, points: S.points.map((q) => ({ ...q, x: s.points[q.id]![0], y: s.points[q.id]![1] })), circles: S.circles.map((c) => ({ ...c, r: s.radii[c.id] ?? c.r })) }; };
let p = emptySketch(); const s0 = sol(p), k = keep(addRect(p, s0, refOf(p, s0, [0, 0], 0.5), refOf(p, s0, [40, 25], 0.5))!); if (!k.ok) throw new Error(k.why); p = k.params;
const mm = 0.1, S1 = sysOf(p), n0 = p.constraints!.length, line = (from: [number, number]) => ({ shape: "line", from }) as const, point = { shape: "point" } as const;
check("every relation says whether it is a helper (a new one cannot be left out)", Object.values(RELATIONS).every((r) => r.helper === null || typeof r.helper === "object"));
let h = helpersAt(S1, line([100, 100]), [130, 100.4], mm, settings.helpers);
check("a line a little off level goes level", h.acted[0]?.relation === "horizontal" && h.at[1] === 100 && h.at[0] === 130 || (h.acted[0]?.relation === "horizontal" && Math.abs(h.at[1] - 100) < 1e-6));
h = helpersAt(S1, line([100, 100]), [140, 120], mm, settings.helpers);
check("a plain slope gets no helper and does not move", h.acted.length === 0 && h.at[0] === 140 && h.at[1] === 120);
h = helpersAt(S1, line([100, 100]), [100.4, 130], mm, settings.helpers);
check("nearly upright goes upright", h.acted[0]?.relation === "vertical" && Math.abs(h.at[0] - 100) < 1e-6);
h = helpersAt(S1, line([100, 100]), [100.3, 100.3], mm, settings.helpers);
check("close to its own start nothing is taken (no jitter)", h.acted.length === 0);
h = helpersAt(S1, point, [20.3, 0.2], mm, settings.helpers);
check("near the middle of a side takes the middle (a point before a line)", h.acted[0]?.relation === "midpoint" && Math.abs(h.at[0] - 20) < 1e-6 && Math.abs(h.at[1]) < 1e-6);
h = helpersAt(S1, point, [60, 25.3], mm, settings.helpers);
check("in line with a corner: level with it, its source is the corner", h.acted[0]?.relation === "horizontal" && Math.abs(h.at[1] - 25) < 1e-6 && h.acted[0].sources.length > 0);
check("and the guide is along the line it holds on", !!h.acted[0]?.dir && Math.abs(h.acted[0].dir![0]) > 0.99);
h = helpersAt(S1, point, [40.3, 60.3], mm, settings.helpers);
check("level with nothing near but upright with the corner: one helper", h.acted.length === 1 && h.acted[0]!.relation === "vertical");
// a circle of radius 5 at (100, 100); a line from (80, 100): tangent is asin(5/20) off the line to the centre
const kc = keep(addCircle(p, sol(p), refOf(p, sol(p), [100, 100], 0.5), [105, 100])!); if (!kc.ok) throw new Error(kc.why);
const pc = kc.params, S2 = sysOf(pc), ang = Math.asin(5 / 20);
h = helpersAt(S2, line([80, 100]), [80 + 30 * Math.cos(ang + 0.01), 100 + 30 * Math.sin(ang + 0.01)], mm, settings.helpers);
check("a line from outside a circle nearly tangent becomes tangent, naming the circle", h.acted[0]?.relation === "tangent" && h.acted[0].sources[0] === "K1" && Math.abs(Math.atan2(h.at[1] - 100, h.at[0] - 80) - ang) < 1e-6);
h = helpersAt(S2, point, [40.3, 100.3], mm, settings.helpers);
check("two helpers cross: upright with a corner, level with a circle's middle", h.acted.length === 2 && Math.abs(h.at[0] - 40) < 1e-6 && Math.abs(h.at[1] - 100) < 1e-6);
h = helpersAt(S2, point, [100.2, 100.2], mm, settings.helpers);
check("on a circle's middle: it takes the middle, and level and upright with it hold (the cross)", h.acted[0]?.relation === "coincident" && h.holds.filter((x) => x.relation === "horizontal").length >= 1 && h.holds.filter((x) => x.relation === "vertical").length >= 1);
// drawing a circle about (30, 30): its edge point near another circle's edge makes them touch
h = helpersAt(S2, { shape: "circle", centre: [80, 100] }, [90.2, 100], mm, settings.helpers);
check("a circle about (80,100) of radius 10 reaches the other's edge: circles touching or equal radius is found", h.holds.length > 0 || h.acted.length > 0);
// the same from a point that is already in the sketch (a line starting on the end of another): the point being on its own line says nothing, and must not hide the tangent
const S3 = { points: [{ id: "A", x: 100, y: 140 }, { id: "O", x: 100, y: 100 }], lines: [], circles: [{ id: "K9", c: "O", r: 20 }], constraints: [] } as any, a3 = Math.asin(20 / 40) - Math.PI / 2 + 0.002;
h = helpersAt(S3, { shape: "line", from: [100, 140], startId: "A" }, [100 + 60 * Math.cos(a3), 140 + 60 * Math.sin(a3)], mm, settings.helpers);
check("a line starting on an existing point still finds the tangent", h.acted[0]?.relation === "tangent" && h.acted[0].sources[0] === "K9");
check("the helpers make no constraint", p.constraints!.length === n0);
process.exit(failureCount() ? 1 : 0);

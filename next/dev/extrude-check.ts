// A dev check (not a test, `in_1444`) of picking a region and making the recipe of an extrude, with the kernel: node --experimental-strip-types dev/extrude-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { regionAt, regionCentre, extrudeSteps } from "../src/interaction/extrude.ts";
import { addCircle, addRect, emptySketch, keep, refOf } from "../src/interaction/drawing.ts";
import { worldFrame } from "../src/planes.ts";
import { check, failureCount } from "./lib.ts";
await initKernel();
const grow = (p: any, f: (p: any, s: any) => any) => {
  const s = {
    points: Object.fromEntries(p.points.map((x: any) => [x.id, [x.x, x.y]])),
    radii: Object.fromEntries((p.circles ?? []).map((c: any) => [c.id, c.r])),
  };
  const k = keep(f(p, s));
  if (!k.ok) throw new Error(k.why);
  return k.params;
};
const at = (p: any, s: any, x: number, y: number) => refOf(p, s, [x, y], 0.5);
let p = grow(emptySketch(), (q, s) => addRect(q, s, at(q, s, 0, 0), at(q, s, 40, 25)));
p = grow(p, (q, s) => addCircle(q, s, at(q, s, 20, 12), [26, 12]));
const outside = regionAt(p, [100, 100]),
  ring = regionAt(p, [5, 5]),
  inner = regionAt(p, [20, 12]);
check("a click outside the drawing picks nothing", outside === null);
check(
  "a click between the rectangle and the circle picks the rectangle with the circle as a hole",
  !!ring && ring.loops.length === 2,
  ring ? `${ring.loops.length} loops, area ${ring.area.toFixed(1)}` : "none",
);
check("a click inside the circle picks the circle alone", !!inner && inner.loops.length === 1);
const f = worldFrame(2),
  steps = extrudeSteps([], p, f, [5, 5], 10);
check("the first extrude is a sketch and an extrude", steps.map((s) => s.kind).join() === "sketch,extrude");
const e = new Engine(steps as any);
e.build();
const v = e.result("e1").value as Body;
check(
  "the engine makes it: ok, with the circle's hole (volume = (1000 - pi 36) * 10)",
  e.result("e1").status.kind === "ok" && Math.abs(K.volume(v.solid) - (1000 - Math.PI * 36) * 10) < 1e-3,
  `${K.volume(v.solid)}`,
);
const more = extrudeSteps(steps as any, p, f, [20, 12], 5),
  all = [...steps, ...more];
check(
  "a second pull adds a combine step (add)",
  more.map((s) => s.kind).join() === "sketch,extrude,combine" && more[2]!.params.mode === "add",
);
const e2 = new Engine(all as any);
e2.build();
check(
  "and the engine joins them",
  e2.result("c1").status.kind === "ok" &&
    Math.abs(K.volume((e2.result("c1").value as Body).solid) - ((1000 - Math.PI * 36) * 10 + Math.PI * 36 * 5)) < 1e-3,
);
const top = { ...f, origin: [0, 0, 10] as [number, number, number] },
  cut = extrudeSteps(steps as any, p, top, [5, 5], -4),
  e3 = new Engine([...steps, ...cut] as any);
e3.build();
check(
  "a pull against the plane's direction with a body is a cut (here from the top face, 4 deep)",
  cut[2]!.params.mode === "cut" &&
    e3.result("c1").status.kind === "ok" &&
    Math.abs(K.volume((e3.result("c1").value as Body).solid) - (1000 - Math.PI * 36) * 6) < 1e-3,
  JSON.stringify(e3.result("c1").status),
);
// an arc: a half disc closed by a line, extruded
import { addArc, addLine, arcWay } from "../src/interaction/drawing.ts";
{
  let q = emptySketch();
  const sl = () => ({ points: Object.fromEntries(q.points.map((x: any) => [x.id, [x.x, x.y]])), radii: {} });
  const step = (f: (q: any, s: any) => any) => {
    const k = keep(f(q, sl()));
    if (!k.ok) throw new Error(k.why);
    q = k.params;
  };
  step((a, s) => addArc(a, s, refOf(a, s, [0, 0], 0.01), refOf(a, s, [10, 0], 0.01), [-10, 0.0001]));
  check(
    "an arc is a circle with a start and an end on it",
    q.arcs!.length === 1 && q.points.length === 3 && !q.arcs![0]!.cw,
    JSON.stringify(q.arcs),
  );
  const [pa, pb] = [q.arcs![0]!.a, q.arcs![0]!.b];
  step((a, s) => addLine(a, s, { id: pb }, { id: pa }));
  const half = regionAt(q, [0, 3]);
  check(
    "the half disc closed by a line is a region",
    !!half && half.loops.length === 1 && Math.abs(half.area - (Math.PI * 100) / 2) < 0.05,
    `${half?.area}`,
  );
  const st = extrudeSteps([], q, f, [0, 3], 4),
    en = new Engine(st as any);
  en.build();
  check(
    "and the engine extrudes it: pi r^2 / 2 * 4",
    en.result("e1").status.kind === "ok" &&
      Math.abs(K.volume((en.result("e1").value as Body).solid) - ((Math.PI * 100) / 2) * 4) < 0.5,
    `${en.result("e1").status.kind}`,
  );
  const cwArc = arcWay([0, 0], [10, 0], [0, -10]),
    ccwArc = arcWay([0, 0], [10, 0], [0, 10]);
  check(
    "the short way round: a place below the start goes clockwise, above counter-clockwise",
    cwArc.cw && !ccwArc.cw && Math.abs(cwArc.sweep - Math.PI / 2) < 1e-9 && Math.abs(ccwArc.sweep - Math.PI / 2) < 1e-9,
  );
}
{
  // the arrow stands in the middle of the figure, not where it was clicked (`in_1717`)
  const box = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
  const c0 = regionCentre([box(0, 0, 40, 20)]);
  check(
    "a rectangle's middle is its middle",
    Math.abs(c0[0] - 20) < 1e-9 && Math.abs(c0[1] - 10) < 1e-9,
    JSON.stringify(c0),
  );
  const c1 = regionCentre([box(0, 0, 40, 20), box(10, 5, 20, 15)]);
  const inRing = (p: [number, number]) =>
    p[0] > 0 && p[0] < 40 && p[1] > 0 && p[1] < 20 && !(p[0] > 10 && p[0] < 20 && p[1] > 5 && p[1] < 15);
  check(
    "a rectangle with a hole: the centre of area is not in the hole (it is on the ring, in the widest stretch)",
    inRing(c1),
    JSON.stringify(c1),
  );
  const cShape: [number, number][] = [
    [0, 0],
    [30, 0],
    [30, 10],
    [10, 10],
    [10, 20],
    [30, 20],
    [30, 30],
    [0, 30],
    [0, 0],
  ];
  const c2 = regionCentre([cShape]);
  check(
    "a C: the middle is in the C, not in the mouth of it",
    c2[0] > 0 && c2[0] < 30 && !(c2[0] > 10 && c2[1] > 10 && c2[1] < 20),
    JSON.stringify(c2),
  );
}
// a body made after a round joins the model AS IT IS NOW: the combine takes the last step that makes a body (the round), not the extrude before it
{
  const recipe = [
    { id: "s1", kind: "sketch", params: {}, inputs: [] },
    { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] },
    { id: "r1", kind: "round", params: { edges: [], size: 1, mode: "fillet" }, inputs: ["e1"] },
  ];
  const more2 = extrudeSteps(recipe as any, p, f, [20, 12], 5);
  check(
    "a new body is joined to the last body step, the round, not the extrude before it",
    more2.at(-1)?.kind === "combine" && more2.at(-1)?.inputs[0] === "r1",
    JSON.stringify(more2.at(-1)?.inputs),
  );
}
process.exit(failureCount() ? 1 : 0);

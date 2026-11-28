// A dev check (not a test, `in_1444`) of the marks of a sketch and the one rule for which show (`interaction/marks.ts`, `dec_marks_on_things`): node --experimental-strip-types dev/marks-check.ts
import { addCircle, addLine, addRect, emptySketch, keep, refOf, viewSystem } from "../src/interaction/drawing.ts";
import { alphaAt, marksFor } from "../src/interaction/marks.ts";
import { iconOf, scopeOf, whereOf } from "../src/interaction/bubbles.ts";
import type { System } from "../src/engine/solver.ts";
import { settings } from "../src/settings.ts";
import { check, failureCount } from "./lib.ts";

// a rectangle (its sides locked level and upright), and a line with a circle touching it
let p = emptySketch();
const s0 = { points: {}, radii: {} } as never;
const r = keep(addRect(p, s0, refOf(p, s0, [0, 0], 0.5), refOf(p, s0, [40, 25], 0.5))!);
if (!r.ok) throw new Error(r.why);
p = r.params;
const R = viewSystem(p, r.sol);
const none = marksFor(R, [], { now: 0 });
check("nothing selected and nothing recent: no marks", none.length === 0);
const one = marksFor(R, ["L1"], { now: 0 });
check(
  "a selected side shows the constraints it has, locked",
  one.some((m) => m.state === "locked" && m.kind === "constraint") &&
    one
      .filter((m) => m.state === "locked")
      .every((m) => m.parts.includes("L1") || m.parts.some((q) => R.points.some((pt) => pt.id === q))),
  one.map((m) => `${m.id}:${m.state}`).join(),
);
check(
  "a selected side shows the number it measures, unlocked",
  one.some((m) => m.kind === "dimension" && m.state === "offer" && m.locked === false),
);
const refusedId = p.constraints![0]!.id;
const red = marksFor(R, [], { flash: { refused: [refusedId] }, now: 0 });
check(
  "a refusal shows what held it back, red, with nothing selected",
  red.length === 1 && red[0]!.state === "refused" && red[0]!.id === refusedId,
);
check(
  "and with something else selected too",
  marksFor(R, ["L3"], { flash: { refused: [refusedId] }, now: 0 }).some(
    (m) => m.id === refusedId && m.state === "refused",
  ),
);

let q = emptySketch();
const z = { points: {}, radii: {} } as never;
const k1 = keep(addLine(q, z, refOf(q, z, [0, 0], 0.5), refOf(q, z, [40, 0], 0.5))!);
if (!k1.ok) throw new Error(k1.why);
q = k1.params;
const k2 = keep(addCircle(q, k1.sol, refOf(q, k1.sol, [20, 5], 0.5), [25, 5])!);
if (!k2.ok) throw new Error(k2.why);
q = k2.params;
const T = viewSystem(q, k2.sol);
const sel = marksFor(T, ["L1"], { now: 0 }),
  tan = sel.find((m) => m.state === "offer" && m.id.startsWith("near:tangent:"));
check(
  "a selected line touching a circle: the tangent is offered on it, unlocked, full strength",
  !!tan && tan.alpha === 1 && tan.over?.join() === "L1",
  sel.map((m) => `${m.id}:${m.state}`).join(),
);
const recent = { ids: ["L1"], until: 1000 };
const soon = marksFor(T, [], { recent, now: 100 }),
  late = marksFor(T, [], { recent, now: 1000 - settings.marks.fadeMs / 2 }),
  gone = marksFor(T, [], { recent, now: 1000 });
check(
  "nothing selected, a part just made: its offers show, and not its number",
  soon.some((m) => m.id.startsWith("near:tangent:")) &&
    soon.every((m) => m.kind === "constraint" && m.state === "offer" && m.alpha === 1),
  soon.map((m) => m.id).join(),
);
check(
  "they fade at the end and are gone after",
  late.length > 0 && late.every((m) => m.alpha > 0.4 && m.alpha < 0.6) && gone.length === 0,
  `${late.map((m) => m.alpha)} ${gone.length}`,
);
check(
  "something selected: the recent ones do not show beside it (the selection's own do)",
  marksFor(T, ["K1"], { recent, now: 100 }).every((m) => m.over === undefined || m.over.join() === "K1"),
);
check("the fade is a clean 1 to 0", alphaAt(1000, 0) === 1 && alphaAt(1000, 1000) === 0 && alphaAt(1000, 2000) === 0);
// two parts chosen together are offered everything that fits them, true yet or not (a line and a circle far apart: tangent; a point and a line: on the line)
const k3 = keep(addLine(q, k2.sol, refOf(q, k2.sol, [0, 40], 0.5), refOf(q, k2.sol, [40, 45], 0.5))!);
if (!k3.ok) throw new Error(k3.why);
const F = viewSystem(k3.params, k3.sol),
  apart = marksFor(F, ["L1", "K1"], { now: 0 }).filter((m) => m.state === "offer" && m.kind === "constraint");
check(
  "a line and a circle chosen together are offered the tangent even when they are far apart",
  apart.some((m) => m.id === "rel:tangent" && m.over?.join() === "L1,K1"),
  apart.map((m) => m.id).join(),
);
const pt = F.points[0]!.id,
  pl = marksFor(F, [pt, "L2"], { now: 0 }).filter((m) => m.state === "offer" && m.kind === "constraint");
check(
  "a point and a line chosen together are offered on-the-line",
  pl.some((m) => m.id === "rel:on"),
  pl.map((m) => m.id).join(),
);
check(
  "a part alone is not offered what is not true of it",
  !marksFor(F, ["L1"], { now: 0 }).some((m) => m.id === "rel:tangent" || m.id === "rel:on"),
);
// where a mark stands, literally (`in_1620`), and what a selection takes in (down, never up)
const Z: System = {
  points: [
    { id: "P1", x: 0, y: 0 },
    { id: "P2", x: 40, y: 0 },
    { id: "P3", x: 20, y: 5 },
    { id: "P4", x: 50, y: 50 },
  ],
  lines: [{ id: "L1", a: "P1", b: "P2" }],
  circles: [{ id: "K1", c: "P3", r: 5 }],
  constraints: [
    { id: "c1", kind: "fixed" as never, parts: ["P2"] },
    { id: "c2", kind: "horizontal", parts: ["L1"] },
    { id: "c3", kind: "tangent", parts: ["L1", "K1"] },
  ],
};
const touch = whereOf(Z, ["L1", "K1"]),
  touch2 = whereOf(Z, ["K1", "L1"]);
check(
  "a line tangent to a circle: the mark is at the touching place, whichever way the parts are named",
  Math.hypot(touch[0] - 20, touch[1]) < 1e-9 && Math.hypot(touch2[0] - 20, touch2[1]) < 1e-9,
  `${touch} ${touch2}`,
);
check(
  "a constraint that names a point stands on the point",
  whereOf(Z, ["P2", "L1"]).join() === "40,0" && whereOf(Z, ["P4"]).join() === "50,50",
);
check("a constraint of one line stands on its middle", whereOf(Z, ["L1"]).join() === "20,0");
check(
  "a selection takes in what it is made of: a line its ends, a circle its centre; a point nothing",
  scopeOf(Z, ["L1"]).sort().join() === "L1,P1,P2" &&
    scopeOf(Z, ["K1"]).sort().join() === "K1,P3" &&
    scopeOf(Z, ["P2"]).join() === "P2",
);
const onLine = marksFor(Z, ["L1"], { now: 0 })
    .filter((m) => m.state === "locked")
    .map((m) => m.id)
    .sort()
    .join(),
  onEnd = marksFor(Z, ["P2"], { now: 0 })
    .filter((m) => m.state === "locked")
    .map((m) => m.id)
    .sort()
    .join();
check("a selected line shows the constraints of its ends too", onLine === "c1,c2,c3", onLine);
check("a selected end shows its own constraints and not the line's", onEnd === "c1", onEnd);
// in range, however it came there (`in_1622`): a line 0.3 from tangent to a circle is offered the tangent when 0.6 is the reach, not when it is 0.1
{
  const R: System = {
    points: [
      { id: "P1", x: 0, y: 5.3 },
      { id: "P2", x: 40, y: 5.3 },
      { id: "P3", x: 20, y: 10 },
    ],
    lines: [{ id: "L1", a: "P1", b: "P2" }],
    circles: [{ id: "K1", c: "P3", r: 5 }],
    constraints: [],
  };
  const wide = marksFor(R, ["L1"], { now: 0, reach: { pointMm: 0.6, lineMm: 0.6 } }).some((m) =>
      m.id.startsWith("near:tangent"),
    ),
    narrow = marksFor(R, ["L1"], { now: 0, reach: { pointMm: 0.1, lineMm: 0.1 } }).some((m) =>
      m.id.startsWith("near:tangent"),
    ),
    none = marksFor(R, ["L1"], { now: 0 }).some((m) => m.id.startsWith("near:tangent"));
  check(
    "a line 0.3 mm from tangent is offered the tangent in a reach of 0.6, and not in 0.1 or when only what holds is offered",
    wide && !narrow && !none,
    `${wide} ${narrow} ${none}`,
  );
  const far: System = { ...R, points: R.points.map((p) => (p.id === "P1" || p.id === "P2" ? { ...p, y: 9 } : p)) };
  check(
    "a line well away from tangent is not offered it",
    !marksFor(far, ["L1"], { now: 0, reach: { pointMm: 0.6, lineMm: 0.6 } }).some((m) =>
      m.id.startsWith("near:tangent"),
    ),
  );
}
{
  // zoomed far out the reach in mm is huge, but a circle is not offered what is far from it (`in_1633`)
  const T: System = {
    points: [
      { id: "A", x: 20, y: 40 },
      { id: "B", x: 40, y: 20 },
      { id: "C", x: 0, y: 0 },
    ],
    lines: [{ id: "L1", a: "A", b: "B" }],
    circles: [{ id: "K1", c: "C", r: 12.5 }],
    constraints: [],
  } as unknown as System;
  const far = marksFor(T, ["K1"], { now: 0, reach: { pointMm: 960, lineMm: 480 } }).filter(
    (m) => m.state === "offer" && m.id.startsWith("near:"),
  );
  check("a circle zoomed far out is not offered things far from it", far.length === 0, far.map((m) => m.id).join());
}
{
  // a circle's centre is not offered with the circle (`in_1633`): its centre near another point is for the centre to be offered
  const T: System = {
    points: [
      { id: "A", x: 0.3, y: 10 },
      { id: "B", x: 20, y: 30 },
      { id: "C", x: 0, y: 0 },
    ],
    lines: [{ id: "L1", a: "A", b: "B" }],
    circles: [{ id: "K1", c: "C", r: 12.5 }],
    constraints: [],
  } as unknown as System;
  const reach = { pointMm: 1, lineMm: 0.5 },
    ids = (sel: string[]) =>
      marksFor(T, sel, { now: 0, reach })
        .filter((m) => m.id.startsWith("near:"))
        .map((m) => m.id);
  check(
    "a circle is not offered its centre's relations; its centre is",
    !ids(["K1"]).some((i) => i.includes(":C")) && ids(["C"]).some((i) => i.startsWith("near:vertical")),
    `${ids(["K1"])} | ${ids(["C"])}`,
  );
}
{
  // the offer stands in the middle of the longest arrow of what applying it would move, and on its part when nothing would move (`in_1631`; the arrows themselves are the apply, `dev/moves-browser.ts`)
  const T: System = {
    points: [
      { id: "A", x: 4.7, y: 0 },
      { id: "C", x: 10, y: 0 },
    ],
    lines: [],
    circles: [{ id: "K1", c: "C", r: 5 }],
    constraints: [],
  } as unknown as System;
  const arrows = [
      { from: [4.7, 0] as [number, number], to: [5, 0] as [number, number], of: "A" },
      { from: [0, 0] as [number, number], to: [0, 0.9] as [number, number], of: "Z" }, // (a part that only moves because the others do)
    ] as { from: [number, number]; to: [number, number]; of: string }[],
    ask = (preview: (id: string, over: string[]) => typeof arrows) =>
      marksFor(T, ["A"], { now: 0, reach: { pointMm: 1, lineMm: 1 }, preview }).find((x) => x.id.startsWith("near:on"));
  const moved = ask(() => arrows),
    still = ask(() => []);
  check(
    "an offer stands at its spot, whatever it would move (the movement is drawn when it is pointed at), and carries what it would move",
    !!moved &&
      moved.at[0] === 4.7 &&
      moved.at[1] === 0 &&
      moved.moves?.length === 2 &&
      !!still &&
      !still.moves &&
      still.at[0] === 4.7,
    `${moved?.at} ${still?.at}`,
  );
}
{
  // a line alone is always offered the nearer of level and upright, one of them, once (`in_1662`)
  const mk = (dx: number, dy: number): System =>
    ({
      points: [
        { id: "A", x: 0, y: 0 },
        { id: "B", x: dx, y: dy },
      ],
      lines: [{ id: "L1", a: "A", b: "B" }],
      circles: [],
      constraints: [],
    }) as unknown as System;
  const offers = (S: System) =>
    marksFor(S, ["L1"], { now: 0, reach: { pointMm: 0.7, lineMm: 0.33 } })
      .filter((m) => m.state === "offer" && m.id !== "measure")
      .map((m) => m.id);
  check(
    "a line 1 mm off level over 40 is offered level, once",
    offers(mk(40, 1)).join() === "rel:horizontal",
    offers(mk(40, 1)).join(),
  );
  check(
    "a line 8 mm off level is still offered level (it is the nearer)",
    offers(mk(40, 8)).join() === "rel:horizontal",
  );
  check(
    "a line steeper than 45 degrees is offered upright, not level",
    offers(mk(10, 30)).join() === "rel:vertical",
    offers(mk(10, 30)).join(),
  );
  check(
    "a line exactly level is offered level once (it holds), not twice",
    offers(mk(40, 0)).join() === "rel:horizontal",
    offers(mk(40, 0)).join(),
  );
}
{
  // which near offers are shown (`in_1663`): alternatives for one decision keep the one that moves least (a real toss-up keeps both), independent ones are capped at three, smallest movement first; coincident beats on-a-line-it-ends
  const pt = (id: string, x: number, y: number) => ({ id, x, y });
  const near = (S: System, sel: string[], cost: Record<string, number>) =>
    marksFor(S, sel, {
      now: 0,
      reach: { pointMm: 3, lineMm: 3 },
      preview: (id) => {
        const key = Object.keys(cost).find((k) => id.includes(k));
        const d = key ? cost[key]! : 0.1;
        return [{ from: [0, 0] as [number, number], to: [d, 0] as [number, number], of: "A" }];
      },
    })
      .filter((m) => m.state === "offer" && m.id.startsWith("near:"))
      .map((m) => m.id.replace(/^near:/, ""));
  // five independent neighbours: A is nearly level with B, C, D and nearly upright with E, F
  const many: System = {
    points: [pt("A", 0, 0), pt("B", 20, 0.3), pt("C", 30, 0.5), pt("D", -20, 0.4), pt("E", 0.2, 20), pt("F", 0.3, -25)],
    lines: [],
    circles: [],
    constraints: [],
  } as unknown as System;
  const shown = near(many, ["A"], {
    "horizontal:A,B": 0.5,
    "horizontal:A,C": 0.9,
    "horizontal:A,D": 0.7,
    "vertical:A,E": 0.3,
    "vertical:A,F": 1.5,
  });
  check(
    "five independent near offers show three, smallest movement first",
    shown.length === 3 && shown[0] === "vertical:A,E" && shown[1] === "horizontal:A,B",
    shown.join(),
  );
  // one neighbour, two alternatives: the cheaper only; within a quarter, both
  const alt: System = {
    points: [pt("A", 0, 0), pt("B", 0.2, 0.2)],
    lines: [],
    circles: [],
    constraints: [],
  } as unknown as System;
  const one = near(alt, ["A"], { "coincident:A,B": 9, "horizontal:A,B": 0.2, "vertical:A,B": 0.9 }),
    both = near(alt, ["A"], { "coincident:A,B": 9, "horizontal:A,B": 0.2, "vertical:A,B": 0.22 });
  check(
    "two alternatives with one neighbour show the cheaper",
    one.length === 1 && one[0] === "horizontal:A,B",
    one.join(),
  );
  check("but within a quarter of each other (a toss-up) both are shown", both.length === 2, both.join());
  // coincident beats on a line that the other point ends
  const imp: System = {
    points: [pt("A", 0, 0.1), pt("B", 0.1, 0), pt("C", 10, 0)],
    lines: [{ id: "L1", a: "B", b: "C" }],
    circles: [],
    constraints: [],
  } as unknown as System;
  const sw = near(imp, ["A"], { "on:A,L1": 0.05, "coincident:A,B": 0.3 });
  check(
    "a point near a line's end is offered coincident; the line it ends, and level or upright with that end, are implied and not offered",
    sw.some((x) => x.startsWith("coincident:A,B")) &&
      !sw.some((x) => x.startsWith("on:A,L1")) &&
      !sw.some((x) => /^(horizontal|vertical):A,B/.test(x)),
    sw.join(),
  );
}
{
  // one distance for every relation (`in_1665`): an offer is shown when applying it moves nothing by more than it, a level offer and a tangent alike
  const T: System = {
    points: [
      { id: "A", x: 4.7, y: 0 },
      { id: "C", x: 10, y: 0 },
    ],
    lines: [],
    circles: [{ id: "K1", c: "C", r: 5 }],
    constraints: [],
  } as unknown as System;
  const ask = (len: number) =>
    marksFor(T, ["A"], {
      now: 0,
      reach: { pointMm: 1, lineMm: 1 },
      preview: () => [{ from: [0, 0] as [number, number], to: [len, 0] as [number, number], of: "A" }],
    }).some((x) => x.id.startsWith("near:on"));
  check(
    "an offer that moves nothing by more than the one distance is shown, one that moves something farther is not",
    ask(0.8) && !ask(1.3),
  );
}
{
  // a measured number stands on its own dimension line (`in_1650`, `in_1666`): a circle's size a radial line from the centre one radius long, the bubble on its middle; a length a line beside the line, offset
  const T: System = {
    points: [
      { id: "C", x: 0, y: 0 },
      { id: "A", x: 20, y: 0 },
      { id: "B", x: 30, y: 0 },
    ],
    lines: [{ id: "L1", a: "A", b: "B" }],
    circles: [{ id: "K1", c: "C", r: 8 }],
    constraints: [],
  } as unknown as System;
  const ms = (sel: string[]) =>
    marksFor(T, sel, { now: 0, reach: { pointMm: 1, lineMm: 1 } }).filter((m) => m.id === "measure");
  const rad = ms(["K1"])[0],
    len = ms(["L1"])[0];
  check(
    "a circle's size is on a radial line one radius long from its centre, the bubble on its middle",
    !!rad?.dim &&
      !!rad.onSpot &&
      Math.abs(Math.hypot(rad.dim.b[0] - rad.dim.a[0], rad.dim.b[1] - rad.dim.a[1]) - 8) < 1e-9 &&
      Math.abs(Math.hypot(rad.at[0], rad.at[1]) - 4) < 1e-9,
    JSON.stringify(rad?.dim),
  );
  check(
    "a line's length is on a line beside it (2 mm off, the reach times two), the bubble on its middle, two thin lines to it",
    !!len?.dim &&
      len.dim.ext.length === 2 &&
      Math.abs(Math.abs(len.dim.a[1]) - 2) < 1e-9 &&
      Math.abs(len.at[0] - 25) < 1e-9,
    JSON.stringify(len?.dim),
  );
}
{
  // level and upright between two points have their own dashed icon; a line itself level or upright keeps the solid one (`in_1669`)
  check(
    "the icon of level between two points is dashed, of a line itself solid",
    iconOf("horizontal", ["P1", "P2"]) === "horizontalPoints" &&
      iconOf("vertical", ["P1", "P2"]) === "verticalPoints" &&
      iconOf("horizontal", ["L1"]) === "horizontal" &&
      iconOf("vertical", ["L1"]) === "vertical" &&
      iconOf("tangent", ["L1", "K1"]) === "tangent",
  );
}
process.exit(failureCount() ? 1 : 0);

// A dev check (not a test, `in_1444`) of the marks of a sketch and the one rule for which show (`interaction/marks.ts`, `dec_marks_on_things`): node --experimental-strip-types dev/marks-check.ts
import { addCircle, addLine, addRect, emptySketch, keep, refOf, viewSystem } from "../src/interaction/drawing.ts";
import { alphaAt, marksFor } from "../src/interaction/marks.ts";
import { scopeOf, whereOf } from "../src/interaction/bubbles.ts";
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
  pl.some((m) => m.id === "rel:pointOnLine"),
  pl.map((m) => m.id).join(),
);
check(
  "a part alone is not offered what is not true of it",
  !marksFor(F, ["L1"], { now: 0 }).some((m) => m.id === "rel:tangent" || m.id === "rel:pointOnLine"),
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
  // an offer that would move a part says where (`in_1631`): the arrow's ends, and the offer stands at its middle
  const T: System = {
    points: [
      { id: "A", x: 0, y: 5 },
      { id: "B", x: 4.7, y: 0 },
      { id: "C", x: 10, y: 0 },
    ],
    lines: [{ id: "L1", a: "A", b: "B" }],
    circles: [{ id: "K1", c: "C", r: 5 }],
    constraints: [],
  } as unknown as System;
  const m = marksFor(T, ["L1"], { now: 0, reach: { pointMm: 1, lineMm: 0.6 } }).find(
      (x) => x.id === "near:pointOnCircle:B,K1",
    ),
    mv = m?.moves?.[0];
  check(
    "a point 0.3 mm off a circle is offered on it with an arrow to the edge, the offer at its middle",
    !!mv && Math.abs(mv.to[0] - 5) < 1e-6 && Math.abs(m!.at[0] - 4.85) < 1e-6,
    JSON.stringify(m?.moves),
  );
}
process.exit(failureCount() ? 1 : 0);

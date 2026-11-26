// A dev check (not a test, `in_1444`) of the one probe (`engine/probe.ts`, `q_motion_probe_domain`, `in_1627`): relations in reach of holding over a motion, without a screen. node --experimental-strip-types dev/probe-check.ts
import { adjusting, affectedBy, candidatesFor, inRange, landN, translating } from "../src/engine/probe.ts";
import { helpersForMotion } from "../src/engine/helpers.ts";
import type { System } from "../src/engine/solver.ts";
import { check, failureCount } from "./lib.ts";

const reach = { pointMm: 0.6, lineMm: 0.6 };
// a level line and a circle 0.3 mm short of touching it
const S: System = {
  points: [
    { id: "P1", x: 0, y: 5.3 },
    { id: "P2", x: 40, y: 5.3 },
    { id: "P3", x: 20, y: 10 },
  ],
  lines: [{ id: "L1", a: "P1", b: "P2" }],
  circles: [{ id: "K1", c: "P3", r: 5 }],
  constraints: [],
};
check(
  "what is made of the moved parts is affected: a line with an end moved, a circle with its centre moved",
  affectedBy(S, ["P1"]).has("L1") && affectedBy(S, ["P3"]).has("K1") && !affectedBy(S, ["P1"]).has("K1"),
);
const mv = translating(S, ["P1", "P2"]),
  cands = candidatesFor(S, mv.affected);
check(
  "every relation tried names a moved part, and each is tried once whichever way round it is read",
  cands.every((c) => c.parts.some((p) => mv.affected.has(p))) &&
    new Set(cands.map((c) => `${c.relation}|${[...c.parts].sort()}`)).size === cands.length,
  String(cands.length),
);
const found = inRange(S, mv, [0, 0], cands, reach).find((r) => r.cand.relation === "tangent");
check(
  "the line moved 0.3 mm towards the circle is tangent: found, at about that offset",
  !!found && Math.abs(found.moved - 0.3) < 1e-6 && Math.abs(found.q[1]! + 0.3) < 1e-6,
  JSON.stringify(found && [found.moved, found.q]),
);
check(
  "and not in a reach of 0.1",
  !inRange(S, mv, [0, 0], cands, { pointMm: 0.1, lineMm: 0.1 }).some((r) => r.cand.relation === "tangent"),
);
// at rest, each point free to move: a line a little off parallel to another is in reach of parallel
const T: System = {
  points: [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 40, y: 0 },
    { id: "C", x: 0, y: 10 },
    { id: "D", x: 40, y: 10.3 },
  ],
  lines: [
    { id: "L1", a: "A", b: "B" },
    { id: "L2", a: "C", b: "D" },
  ],
  circles: [],
  constraints: [],
};
const rest = adjusting(T, ["A", "B"]);
check(
  "parts at rest, each point free: a line 0.3 mm over 40 off parallel is within reach of parallel",
  inRange(T, rest, new Array(rest.dim).fill(0), candidatesFor(T, rest.affected, ["L1"], 2), reach).some(
    (r) => r.cand.relation === "parallel",
  ),
);
const none = adjusting(T, ["A", "B"]);
check(
  "and not in a reach of 0.01",
  !inRange(T, none, new Array(none.dim).fill(0), candidatesFor(T, none.affected, ["L1"], 2), {
    pointMm: 0.01,
    lineMm: 0.01,
  }).some((r) => r.cand.relation === "parallel"),
);
// the shortest way: least-norm Newton on one row of a straight line
const q = landN((p) => [p[0]! + p[1]! - 1], [0, 0], 5);
check(
  "the least-norm step lands on the nearest place where a row is zero",
  !!q && Math.abs(q[0]! - 0.5) < 1e-9 && Math.abs(q[1]! - 0.5) < 1e-9,
  JSON.stringify(q),
);
check(
  "and gives up when the first step is more than 3 times the reach",
  landN((p) => [p[0]! - 100], [0, 0], 1) === null,
);
// the hints for a dragged part: the same probe, placed
const h = helpersForMotion(S, translating(S, ["P1", "P2"]), [0, 5.3], [0, 5.1], 0.1, {
  pointPx: 12,
  linePx: 6,
  overPx: 12,
  stepPx: 6,
});
check(
  "the helpers place a dragged line tangent (the offset 0.3 is within 6 px of 0.1 mm)",
  h.acted.some((a) => a.relation === "tangent") && Math.abs(h.at[1] - 5) < 1e-6,
  JSON.stringify([h.at, h.acted.map((a) => a.relation)]),
);
process.exit(failureCount() ? 1 : 0);

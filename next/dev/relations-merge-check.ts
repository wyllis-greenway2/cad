// A dev check (not a test, `in_1444`) of the merge of the exact duplicates (`q_relation_set`, `in_1642`): "in line" and "concentric" are no longer kinds; an old file that has them is read as what they are; two circles picked are offered their centres together; trim keeps a piece in line by its two ends.
//   node --experimental-strip-types dev/relations-merge-check.ts
import { modernise, solveDefinition } from "../src/engine/definition.ts";
import { RELATIONS } from "../src/engine/solver.ts";
import { offersFor } from "../src/interaction/suggest.ts";
import { tidy, viewSystem } from "../src/interaction/drawing.ts";
import { check, failureCount } from "./lib.ts";

check(
  "in line and concentric are not kinds of relation any more",
  !("collinear" in RELATIONS) && !("concentric" in RELATIONS),
);
const old: any = {
  points: [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 4, y: 0 },
    { id: "C", x: 6, y: 0.5 },
    { id: "D", x: 9, y: -0.4 },
    { id: "P", x: 0, y: 10 },
    { id: "Q", x: 0.4, y: 10.3 },
  ],
  lines: [
    { id: "L1", a: "A", b: "B" },
    { id: "L2", a: "C", b: "D" },
  ],
  circles: [
    { id: "K1", c: "P", r: 3 },
    { id: "K2", c: "Q", r: 5 },
  ],
  constraints: [
    { id: "co", kind: "collinear", parts: ["L1", "L2"] },
    { id: "cc", kind: "concentric", parts: ["K1", "K2"] },
  ],
};
const m = modernise(old);
check(
  "an old file's in line is two ends on the line (the first keeps its name), its concentric the two centres together",
  m.constraints!.length === 3 &&
    m.constraints!.some((c: any) => c.id === "co" && c.kind === "on" && c.parts.join() === "C,L1") &&
    m.constraints!.some((c: any) => c.id === "co.2" && c.kind === "on" && c.parts.join() === "D,L1") &&
    m.constraints!.some((c: any) => c.id === "cc" && c.kind === "coincident" && c.parts.join() === "P,Q"),
  JSON.stringify(m.constraints),
);
const r = solveDefinition(old);
check(
  "and it solves as what it was: C and D on the line through A and B, the centres together",
  (() => {
    const q = r.points,
      off = (x: [number, number]) =>
        Math.abs((q.B![0] - q.A![0]) * (x[1] - q.A![1]) - (q.B![1] - q.A![1]) * (x[0] - q.A![0])) /
        Math.hypot(q.B![0] - q.A![0], q.B![1] - q.A![1]);
    return off(q.C!) < 1e-5 && off(q.D!) < 1e-5 && Math.hypot(q.P![0] - q.Q![0], q.P![1] - q.Q![1]) < 1e-6;
  })(),
  JSON.stringify(r.points),
);
check(
  "tidy (what a loaded sketch goes through) makes the same change",
  tidy(old).constraints!.every((c: any) => c.kind !== "collinear" && c.kind !== "concentric"),
);
const fresh = { ...old, constraints: [] };
const S = viewSystem(fresh, solveDefinition(fresh));
const two = offersFor(S, ["K1", "K2"]).offers.filter((o) => o.kind === "coincident");
check(
  "two circles picked are offered their centres together",
  two.length === 1 && two[0]!.parts.join() === "P,Q",
  JSON.stringify(two),
);
const lines = offersFor(S, ["L1", "L2"]).offers.map((o) => o.kind);
check(
  "two lines picked are not offered 'in line' (it is two ends on a line)",
  !lines.includes("collinear" as never),
  lines.join(),
);

// ---- the second round (`in_1644`): on a line and on a circle are one kind, the two tangents are one kind, equal length and equal radius are not offered
{
  const legacy: any = {
    ...old,
    constraints: [
      { id: "a", kind: "pointOnLine", parts: ["C", "L1"] },
      { id: "b", kind: "pointOnCircle", parts: ["D", "K1"] },
      { id: "c", kind: "tangentCircles", parts: ["K1", "K2"], internal: true },
    ],
  };
  const m2 = modernise(legacy).constraints!;
  check(
    "an old file's on the line, on the circle and circles touching are on, on and tangent (inside stays)",
    m2[0]!.kind === "on" && m2[1]!.kind === "on" && m2[2]!.kind === "tangent" && !!m2[2]!.internal,
    JSON.stringify(m2),
  );
  check(
    "none of the old names is a kind any more",
    ["pointOnLine", "pointOnCircle", "tangentCircles"].every((k) => !(k in RELATIONS)),
  );
  const base: any = { ...old, constraints: [] },
    SS = viewSystem(base, solveDefinition(base)),
    kindsOf = (sel: string[]) => offersFor(SS, sel).offers.map((o) => o.kind);
  check(
    "a point and a line, and a point and a circle, are offered the same kind: on",
    kindsOf(["A", "L2"]).includes("on") && kindsOf(["A", "K1"]).includes("on"),
    `${kindsOf(["A", "L2"])} | ${kindsOf(["A", "K1"])}`,
  );
  check(
    "a line and a circle, and two circles, are offered the same kind: tangent",
    kindsOf(["L1", "K1"]).includes("tangent") && kindsOf(["K1", "K2"]).includes("tangent"),
  );
  check(
    "equal length and equal radius are not kinds any more",
    !("equalLength" in RELATIONS) && !("equalRadius" in RELATIONS),
  );
  const eq: any = {
    ...old,
    constraints: [
      { id: "e", kind: "equalRadius", parts: ["K1", "K2"] },
      { id: "f", kind: "equalLength", parts: ["L1", "L2"] },
    ],
  };
  const m3 = modernise(eq).constraints!;
  check(
    "an old file's equal radius and equal length are the two sizes as numbers, the same (the first's)",
    m3.length === 4 &&
      m3.filter((c: any) => c.kind === "radius" && c.value === 3).length === 2 &&
      m3.filter((c: any) => c.kind === "length" && Math.abs(c.value - 4) < 1e-9).length === 2,
    JSON.stringify(m3),
  );
  // a part that already has a size keeps it: the other takes it, and no part has two (an old file saved "L1 is 7 long" and "L1 and L2 equal", `stress-found/sketch-island-region.json`)
  const sized: any = {
    ...old,
    constraints: [
      { id: "g", kind: "length", parts: ["L1"], value: 7 },
      { id: "h", kind: "equalLength", parts: ["L1", "L2"] },
    ],
  };
  const m4 = modernise(sized).constraints!;
  check(
    "an old equal length of a line that has its own length: the other line takes that length, and neither has two",
    m4.length === 2 &&
      m4.filter((c: any) => c.kind === "length" && c.parts[0] === "L1" && c.value === 7).length === 1 &&
      m4.filter((c: any) => c.kind === "length" && c.parts[0] === "L2" && c.value === 7).length === 1,
    JSON.stringify(m4),
  );
  const r3 = solveDefinition(sized);
  check(
    "and it solves: both lines 7",
    Math.abs(Math.hypot(r3.points.A![0] - r3.points.B![0], r3.points.A![1] - r3.points.B![1]) - 7) < 1e-6 &&
      Math.abs(Math.hypot(r3.points.C![0] - r3.points.D![0], r3.points.C![1] - r3.points.D![1]) - 7) < 1e-6,
    JSON.stringify(r3.points),
  );
  const r2 = solveDefinition(eq);
  check(
    "and it solves: both circles 3, both lines 4",
    Math.abs(r2.radii.K1! - 3) < 1e-6 &&
      Math.abs(r2.radii.K2! - 3) < 1e-6 &&
      Math.abs(Math.hypot(r2.points.C![0] - r2.points.D![0], r2.points.C![1] - r2.points.D![1]) - 4) < 1e-6,
    JSON.stringify(r2.radii),
  );
}
process.exit(failureCount() ? 1 : 0);

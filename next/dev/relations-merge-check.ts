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
    m.constraints!.some((c: any) => c.id === "co" && c.kind === "pointOnLine" && c.parts.join() === "C,L1") &&
    m.constraints!.some((c: any) => c.id === "co.2" && c.kind === "pointOnLine" && c.parts.join() === "D,L1") &&
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
process.exit(failureCount() ? 1 : 0);

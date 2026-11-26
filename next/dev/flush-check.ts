// A dev check (not a test, `in_1444`) of a face pulled flush with another (`engine/flush.ts`, `in_1629`): node --experimental-strip-types dev/flush-check.ts
import { flushPull, planesOf, type PlaneRef } from "../src/engine/flush.ts";
import { check, failureCount } from "./lib.ts";

const top = { p: [20, 12, 10] as const, n: [0, 0, 1] as const };
const others: PlaneRef[] = planesOf(
  [
    { id: "B.top", type: "PLANE", ce: [70, 12, 15], ne: [0, 0, 1] },
    { id: "B.side", type: "PLANE", ce: [60, 12, 7], ne: [-1, 0, 0] },
    { id: "A.top", type: "PLANE", ce: [5, 12, 10], ne: [0, 0, 1] }, // (the plane it lies in)
    { id: "C.under", type: "PLANE", ce: [20, 12, 22], ne: [0, 0, -1] }, // (a ceiling: opposite way)
    { id: "R", type: "CYLINDER", ce: [30, 12, 12], ne: [0, 0, 1] },
  ],
  "B",
);
check("a flat face is a plane; one that is not flat is not", others.length === 4);
const near = flushPull(top, others, 4.8, 0.6);
check(
  "a pull of 4.8 is flush with the plane 5 up (the top of the other body)",
  !!near && Math.abs(near.d - 5) < 1e-9 && near.to.face === "B.top",
  JSON.stringify(near),
);
check("a pull of 4 is out of reach (0.6)", flushPull(top, others, 4, 0.6) === null);
check(
  "a plane it lies in is not a hint: a pull of 0.2 gets nothing from its own plane",
  flushPull(top, others, 0.2, 0.6) === null,
);
const ceiling = flushPull(top, others, 11.7, 0.6);
check(
  "a plane that faces the other way is flush at the same plane (a pull up to a ceiling)",
  !!ceiling && Math.abs(ceiling.d - 12) < 1e-9 && ceiling.to.face === "C.under",
  JSON.stringify(ceiling),
);
check("a plane that is not parallel is never tried", flushPull(top, [others[1]!], 5, 100) === null);
const pushIn = flushPull(
  { p: [20, 12, 10], n: [0, 0, 1] },
  planesOf([{ id: "floor", type: "PLANE", ce: [0, 0, 3], ne: [0, 0, 1] }]),
  -6.8,
  0.5,
);
check("a push in (a negative pull) is flush with a plane below", !!pushIn && Math.abs(pushIn.d + 7) < 1e-9);
check(
  "the nearest of several wins",
  flushPull(
    top,
    planesOf([
      { id: "a", type: "PLANE", ce: [0, 0, 14.6], ne: [0, 0, 1] },
      { id: "b", type: "PLANE", ce: [0, 0, 14.9], ne: [0, 0, 1] },
    ]),
    4.8,
    0.6,
  )?.to.face === "b",
);
process.exit(failureCount() ? 1 : 0);

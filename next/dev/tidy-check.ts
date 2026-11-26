// A dev check (not a test, `in_1444`) that nothing haunts a sketch (`interaction/drawing.ts` `tidy`, `removeParts`, `in_1623`): a point exists only while a line, circle or arc uses it, and nothing names a part that is gone. node --experimental-strip-types dev/tidy-check.ts
import {
  addCircle,
  addLine,
  emptySketch,
  keep,
  refOf,
  removeParts,
  tidy,
  viewSystem,
} from "../src/interaction/drawing.ts";
import type { SketchParams } from "../src/engine/sketch.ts";
import { check, failureCount } from "./lib.ts";

// the file the human sent: a circle and a point on it that no line has any more (the line was deleted; the point stayed because a constraint named it)
const filed: SketchParams = {
  arcs: [],
  circles: [{ c: "P1", id: "K1", r: 12.056495702843327 }],
  constraints: [{ id: "c2", kind: "on", parts: ["P3", "K1"] }],
  lines: [],
  points: [
    { id: "P1", x: 30.1, y: 25.2 },
    { id: "P3", x: 30.1, y: 37.3 },
  ],
} as never;
const healed = tidy(filed);
check(
  "a point that no figure has goes, and the constraint that named it",
  healed.points.map((p) => p.id).join() === "P1" &&
    (healed.constraints ?? []).length === 0 &&
    (healed.circles ?? []).length === 1,
  JSON.stringify(healed.points),
);
check("a sketch with nothing left over is the same object", tidy(healed) === healed);
check(
  "the snap targets (the system the hints look through) have no such point",
  viewSystem(healed, { points: { P1: [30.1, 25.2] }, radii: { K1: 12.05 } }).points.length === 1,
);

// deleting a line whose end is held on a circle by a constraint leaves nothing of it
let q = emptySketch();
const z = { points: {}, radii: {} } as never;
let k: any = keep(addCircle(q, z, refOf(q, z, [30, 10], 0.5), [35, 10])!);
q = k.params;
k = keep(addLine(q, k.sol, refOf(q, k.sol, [30, 15], 0.5), refOf(q, k.sol, [30, 40], 0.5))!);
q = k.params;
const line = q.lines![0]!,
  onCircle = { id: "c9", kind: "on" as const, parts: [line.a, "K1"] };
const withC: SketchParams = { ...q, constraints: [...(q.constraints ?? []), onCircle] };
const gone = removeParts(withC, [line.id]);
check(
  "deleting the line takes its end points, even one a constraint held on a circle, and that constraint",
  gone.points.length === 1 && gone.points[0]!.id === "P1" && (gone.constraints ?? []).length === 0,
  `${gone.points.map((p) => p.id)} ${JSON.stringify(gone.constraints)}`,
);
check(
  "deleting the circle's centre takes the circle and what named it",
  removeParts(withC, ["P1"]).circles!.length === 0 && (removeParts(withC, ["P1"]).constraints ?? []).length === 0,
);
const dangling: SketchParams = { ...q, points: q.points.filter((p) => p.id !== line.b) };
check("a line whose end is gone goes (a file that was cut short)", (tidy(dangling).lines ?? []).length === 0);
process.exit(failureCount() ? 1 : 0);

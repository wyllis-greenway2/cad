// A dev check (not a test, `in_1444`) of drawing on the engine's definition, without a page: node --experimental-strip-types dev/drawing-check.ts
import {
  addCircle,
  addLine,
  addRect,
  constrain,
  emptySketch,
  hitAt,
  keep,
  refOf,
  removeParts,
  retype,
  type Sol,
} from "../src/interaction/drawing.ts";
import { solveDefinition } from "../src/engine/definition.ts";
import { trimAt } from "../src/engine/trim.ts";
import type { SketchParams } from "../src/engine/sketch.ts";
import { check, failureCount } from "./lib.ts";

const sol = (p: SketchParams): Sol => {
  const s = solveDefinition(p);
  return { points: s.points, radii: s.radii };
};
const grow = (p: SketchParams, f: (p: SketchParams, s: Sol) => SketchParams | null): SketchParams => {
  const n = f(p, sol(p));
  if (!n) throw new Error("nothing drawn");
  const k = keep(n);
  if (!k.ok) throw new Error(k.why);
  return k.params;
};
const at = (p: SketchParams, s: Sol, x: number, y: number) => refOf(p, s, [x, y], 0.5);

let p = emptySketch();
p = grow(p, (q, s) => addRect(q, s, at(q, s, 0, 0), at(q, s, 40, 25)));
check(
  "a rectangle: 4 points, 4 lines, 4 constraints (level, upright)",
  p.points.length === 4 && p.lines!.length === 4 && p.constraints!.length === 4,
);
check(
  "a click on a corner is that point (a line from it shares it)",
  (() => {
    const q = grow(p, (a, s) => addLine(a, s, at(a, s, 40, 25), at(a, s, 60, 40)));
    return q.points.length === 5 && q.lines!.length === 5;
  })(),
);
// a line drawn from the middle of a side: its start is put on that side, and no constraint is made by the click
const q1 = grow(p, (a, s) => addLine(a, s, at(a, s, 20, 0), at(a, s, 20, -10)));
check(
  "a click on a side puts a new point on it and makes no constraint (a helper helps position; the person asks for relations)",
  q1.points.length === 6 &&
    !q1.constraints!.some((c) => c.kind === "pointOnLine" || c.kind === "pointOnCircle") &&
    Math.abs(q1.points[4]!.y) < 1e-9,
);
// a line across, and a circle
let q2 = grow(p, (a, s) => addLine(a, s, at(a, s, -10, 12), at(a, s, 50, 12)));
q2 = grow(q2, (a, s) => addCircle(a, s, at(a, s, 20, 12), [26, 12]));
check("a circle of the radius to the point", Math.abs(q2.circles![0]!.r - 6) < 1e-9);
check(
  "a click near a drawn line finds it, near a corner finds the corner, in the open finds nothing",
  hitAt(q2, sol(q2), [20, 0.2], 0.5)?.id === "L1" &&
    hitAt(q2, sol(q2), [0.1, 0.1], 0.5)?.kind === "point" &&
    hitAt(q2, sol(q2), [100, 100], 0.5) === null,
);
// trim through the definition (the same function the worker's question calls)
const t = trimAt(q2, "L5", [45, 12]);
check(
  "trim: the line is shortened to the side",
  t.params.points.every((x) => x.x <= 40 + 1e-6) && (t.params.lines ?? []).some((l) => l.id === "L5"),
);
const tc = trimAt(q2, "K1", [20, 18]);
check("trim: the circle crossed twice becomes an arc", tc.params.arcs!.length === 1 && tc.params.circles!.length === 0);
// dimension
const sel = ["L1"],
  d = constrain(q2, sol(q2), sel, "dimension");
check(
  "D on a side: a length of what it measures",
  d.ok && d.params.constraints!.some((c) => c.kind === "length" && Math.abs(c.value! - 40) < 1e-6),
);
if (d.ok) {
  const r = retype(d.params, d.added, 55);
  check(
    "a new number is solved, the side is 55",
    r.ok &&
      (() => {
        const L = r.params.lines!.find((l) => l.id === "L1")!,
          a = r.params.points.find((x) => x.id === L.a)!,
          b = r.params.points.find((x) => x.id === L.b)!;
        return Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 55) < 1e-6;
      })(),
  );
  const P1 = r.ok ? r.params.points.find((x) => x.id === "P1")! : null;
  check(
    "the first corner stays where it was when a number is typed (the far end gives way)",
    !!P1 && Math.abs(P1.x) < 1e-6 && Math.abs(P1.y) < 1e-6,
    P1 ? `P1 at ${P1.x.toFixed(4)}, ${P1.y.toFixed(4)}` : "",
  );
  const bad = retype(d.params, d.added, -4);
  check("a size of nothing or less is refused in words", !bad.ok && bad.why.length > 0);
}
const none = constrain(q2, sol(q2), [], "dimension");
check("nothing selected: in words", !none.ok && /select/.test(none.why));
// a refused constraint names what holds it back: a line level and upright at once
const cross = constrain(q2, sol(q2), ["L1"], "vertical");
check(
  "a vertical on a level side is refused and names the level constraint",
  !cross.ok && cross.victims.length > 0 && cross.victims.every((v) => !v.startsWith("offer.")),
  !cross.ok ? cross.victims.join() : "",
);
// delete
const r1 = removeParts(p, ["L1"]);
check(
  "deleting a side takes its constraints, not the corners the others use",
  !r1.lines!.some((l) => l.id === "L1") &&
    r1.points.length === 4 &&
    !r1.constraints!.some((c) => c.parts.includes("L1")),
);
const r2 = removeParts(q2, ["L5"]);
check(
  "deleting a free line takes its ends too, when nothing else uses them",
  r2.points.length === q2.points.length - 2,
);
const r3 = removeParts(p, ["P1"]);
check("deleting a corner takes the sides that end in it", r3.lines!.length === 2 && keep(r3).ok);
process.exit(failureCount() ? 1 : 0);

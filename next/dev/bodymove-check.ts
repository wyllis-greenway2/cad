// A dev check (not a test, `in_1444`) of a body moved and turned (`interaction/bodymove.ts`, `dec_task_handles`), without a page, and the steps made against the engine's own `turn` and `move`: node --experimental-strip-types dev/bodymove-check.ts
import { baseFrame, carried, matrixOf, motionOf, moveSteps } from "../src/interaction/bodymove.ts";
import { rotate, add, sub, unit, type V3 } from "../src/vec.ts";
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import type { Body } from "../src/engine/lineage.ts";
import type { Step } from "../src/engine/steps.ts";
import { check, failureCount } from "./lib.ts";
await initKernel();

const near = (a: readonly number[], b: readonly number[], t = 1e-6) => a.every((x, i) => Math.abs(x - b[i]!) < t);
const base = baseFrame([10, 5, 2]);
// the frame after a turn of `ang` about `axis` through the base's origin, and a move
const after = (axis: V3, ang: number, by: V3) => ({
  origin: add(base.origin, by),
  normal: rotate([0, 0, 1], axis, ang),
  u: rotate([1, 0, 0], axis, ang),
});
for (const [name, axis, deg, by] of [
  ["a move only", [0, 0, 1], 0, [3, -2, 1]],
  ["a quarter turn about z", [0, 0, 1], 90, [0, 0, 0]],
  ["a turn about a slanted axis and a move", unit([1, 2, 3]), 40, [5, 0, -4]],
  ["half a turn about x", [1, 0, 0], 180, [0, 1, 0]],
  ["half a turn about a diagonal", unit([1, 1, 0]), 180, [0, 0, 0]],
  ["a turn of 170 about -y", [0, -1, 0], 170, [1, 1, 1]],
] as [string, V3, number, V3][]) {
  const now = after(axis, (deg * Math.PI) / 180, by),
    mo = motionOf(base, now),
    p: V3 = [14, 9, 7];
  const out = mo.turn ? rotate(sub(p, base.origin), mo.turn.axis, (mo.turn.deg * Math.PI) / 180) : sub(p, base.origin),
    made = add(add(base.origin, out), mo.by);
  check(
    `${name}: the turn then the move carry a point where the frame says`,
    near(made, carried(base, now, p), 1e-6),
    `${made} vs ${carried(base, now, p)}`,
  );
  const m = matrixOf(base, now),
    x = [p[0], p[1], p[2]];
  check(
    `${name}: the matrix to show it agrees`,
    near(
      [
        m[0]! * x[0]! + m[4]! * x[1]! + m[8]! * x[2]! + m[12]!,
        m[1]! * x[0]! + m[5]! * x[1]! + m[9]! * x[2]! + m[13]!,
        m[2]! * x[0]! + m[6]! * x[1]! + m[10]! * x[2]! + m[14]!,
      ],
      carried(base, now, p),
      1e-6,
    ),
  );
}
check("no move and no turn make no steps", moveSteps([], "e1", base, { ...base }).length === 0);
const steps = moveSteps(
  [{ id: "t1", kind: "turn", params: {}, inputs: [] }],
  "e1",
  base,
  after([0, 0, 1], Math.PI / 2, [1, 0, 0]),
);
check(
  "a turn and a move make a turn then a move, new ids, the move taking the turn's body",
  steps.map((s) => s.kind).join() === "turn,move" &&
    steps[0]!.id === "t2" &&
    steps[1]!.inputs[0] === "t2" &&
    steps[0]!.inputs[0] === "e1",
);
// the engine's own turn and move do what the frames say (its box is where the corners of the box go)
const sk: Step[] = [
  {
    id: "s1",
    kind: "sketchPolygon",
    params: {
      points: [
        [0, 0],
        [40, 0],
        [40, 25],
        [0, 25],
      ],
    },
    inputs: [],
  },
  { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] },
];
const mid: V3 = [20, 12.5, 5],
  b0 = baseFrame(mid);
for (const [name, axis, deg, by] of [
  ["a quarter turn about z", [0, 0, 1], 90, [3, 0, 0]],
  ["a turn of 30 about x", [1, 0, 0], 30, [0, 2, 0]],
  ["a turn of 50 about a slanted axis", unit([1, -1, 2]), 50, [-4, 5, 6]],
] as [string, V3, number, V3][]) {
  const now = after2(b0, axis, (deg * Math.PI) / 180, by),
    steps = moveSteps(sk, "e1", b0, now),
    e = new Engine([...sk, ...steps]);
  e.build();
  const last = steps.at(-1)!.id,
    want = { lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] };
  for (const x of [0, 40])
    for (const y of [0, 25])
      for (const z of [0, 10]) {
        const q = carried(b0, now, [x, y, z]);
        for (let k = 0; k < 3; k++) {
          want.lo[k] = Math.min(want.lo[k]!, q[k]!);
          want.hi[k] = Math.max(want.hi[k]!, q[k]!);
        }
      }
  const faces = (e.result(last).value as Body).faces.map((fc) => K.facts(fc.h)),
    lo = [0, 1, 2].map((k) => Math.min(...faces.map((x) => x.lo[k]!))),
    hi = [0, 1, 2].map((k) => Math.max(...faces.map((x) => x.hi[k]!)));
  check(
    `${name}: the engine's body is where the frames say (its box)`,
    near(lo, want.lo, 0.05) && near(hi, want.hi, 0.05),
    `${lo} ${hi} vs ${want.lo} ${want.hi}`,
  );
}
function after2(b: { origin: V3 }, axis: V3, ang: number, by: V3) {
  return { origin: add(b.origin, by), normal: rotate([0, 0, 1], axis, ang), u: rotate([1, 0, 0], axis, ang) };
}
process.exit(failureCount() ? 1 : 0);

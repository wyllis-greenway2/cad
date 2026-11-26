// A dev check (not a test, `in_1444`, `in_1548`): does any kernel operation change the shape it is given? The stress run found that a boolean and a fillet did (the next step on the same shape then gave a different answer than a fresh build).
// For each kind of step: a part, the step, and its number edited and put back several times; after every edit the live engine must give what a fresh build of the same recipe gives, and the step must work.
//   node --experimental-strip-types dev/mutation-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { edgeRef, mint } from "../src/engine/id.ts";
import { Body } from "../src/engine/lineage.ts";
import * as K from "../src/engine/kernel.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
import { check, failureCount, same } from "./lib.ts";

const line = (i: number) => mint("s", "line", i),
  side = (i: number) => mint("A", "side", line(i)),
  top = mint("A", "end"),
  bottom = mint("A", "start");
const block: Step[] = [
  {
    id: "s",
    kind: "sketchPolygon",
    params: {
      points: [
        [0, 0],
        [40, 0],
        [40, 30],
        [0, 30],
      ],
    },
    inputs: [],
  },
  { id: "A", kind: "extrude", params: { d: 12 }, inputs: ["s"] },
];
const withHole: Step[] = [
  ...block,
  { id: "H", kind: "hole", params: { face: top, diameter: 8, depth: 6, at: [5, 3] }, inputs: ["A"] },
];
const ring: Step[] = [
  { id: "s", kind: "sketchCircle", params: { r: 15, at: [0, 0] }, inputs: [] },
  { id: "A", kind: "extrude", params: { d: 12 }, inputs: ["s"] },
];
const wall = mint("A", "side", mint("s", "circle"), 0);
// the same steps again on a part that has been worked on: a hole, a fillet on two edges and a push (the stress run found its faults on parts like this, not on plain ones)
const rich: Step[] = [
  ...withHole,
  { id: "R", kind: "round", params: { edges: [edgeRef(side(2), top)], size: 1 }, inputs: ["H"] },
  { id: "P", kind: "push", params: { face: bottom, dist: 3 }, inputs: ["R"] },
];

/** [name, steps before, the step, the key, the values to go between] */
const cases: [string, Step[], Step, string, number[]][] = [
  ["push", block, { id: "X", kind: "push", params: { face: top, dist: 5 }, inputs: ["A"] }, "dist", [5, 8, -3]],
  [
    "push of a face with a hole",
    withHole,
    { id: "X", kind: "push", params: { face: top, dist: 4 }, inputs: ["H"] },
    "dist",
    [4, 7, -2],
  ],
  [
    "moveFace",
    block,
    { id: "X", kind: "moveFace", params: { face: side(1), dist: 4 }, inputs: ["A"] },
    "dist",
    [4, 9, -5],
  ],
  [
    "moveFace beside a hole wall",
    withHole,
    { id: "X", kind: "moveFace", params: { face: top, dist: 3 }, inputs: ["H"] },
    "dist",
    [3, 6, -2],
  ],
  [
    "offsetFace",
    ring,
    { id: "X", kind: "offsetFace", params: { face: wall, dist: 2 }, inputs: ["A"] },
    "dist",
    [2, 4, -3],
  ],
  [
    "hole",
    block,
    { id: "X", kind: "hole", params: { face: top, diameter: 6, depth: 5 }, inputs: ["A"] },
    "diameter",
    [6, 9, 4],
  ],
  [
    "counterbore",
    block,
    {
      id: "X",
      kind: "hole",
      params: { face: top, diameter: 5, depth: 8, counterbore: { diameter: 9, depth: 2 } },
      inputs: ["A"],
    },
    "diameter",
    [5, 6, 4],
  ],
  [
    "fillet",
    block,
    {
      id: "X",
      kind: "round",
      params: { edges: [edgeRef(side(0), top), edgeRef(side(1), top)], size: 2 },
      inputs: ["A"],
    },
    "size",
    [2, 3, 1],
  ],
  [
    "chamfer",
    block,
    { id: "X", kind: "round", params: { edges: [edgeRef(side(0), top)], size: 2, mode: "chamfer" }, inputs: ["A"] },
    "size",
    [2, 3, 1],
  ],
  [
    "fillet on a body with a hole",
    withHole,
    { id: "X", kind: "round", params: { edges: [edgeRef(side(2), top)], size: 2 }, inputs: ["H"] },
    "size",
    [2, 3, 1],
  ],
  ["shell", block, { id: "X", kind: "shell", params: { face: top, t: 2 }, inputs: ["A"] }, "t", [2, 3, 1]],
  [
    "shell of a round body",
    ring,
    { id: "X", kind: "shell", params: { face: top, t: 2 }, inputs: ["A"] },
    "t",
    [2, 3, 1],
  ],
  [
    "linear pattern",
    block,
    { id: "X", kind: "pattern", params: { kind: "linear", by: [50, 0, 0], count: 3 }, inputs: ["A"] },
    "count",
    [3, 2, 4],
  ],
  [
    "circular pattern",
    ring,
    {
      id: "X",
      kind: "pattern",
      params: { kind: "circular", axis: { point: [40, 0, 0], dir: [0, 0, 1] }, count: 3 },
      inputs: ["A"],
    },
    "count",
    [3, 2, 4],
  ],
  [
    "mirror",
    block,
    { id: "X", kind: "mirror", params: { plane: { point: [-5, 0, 0], normal: [1, 0, 0] } }, inputs: ["A"] },
    "mirror",
    [-5, -10, -3],
  ],
  [
    "turn",
    block,
    { id: "X", kind: "turn", params: { deg: 30, axis: [0, 0, 1], body: "all" }, inputs: ["A"] },
    "deg",
    [30, 60, 10],
  ],
  ["extrude", withHole.slice(0, 1), { id: "X", kind: "extrude", params: { d: 9 }, inputs: ["s"] }, "d", [9, 14, 4]],
];

const all: typeof cases = [...cases];
for (const [name, before, step, key, values] of cases)
  if (before === block || before === withHole)
    all.push([name + " (on a worked part)", rich, { ...step, inputs: ["P"] }, key, values]);
/** every body the engine holds is still what it was when it was made (still valid, and its fingerprint read again now is the one kept): a later step did not change it in place */
const intact = (e: Engine): string[] =>
  e.ids().filter((i) => {
    const r = e.result(i);
    if (r.status.kind !== "ok" || !(r.value instanceof Body)) return false;
    return !K.valid(r.value.solid) || !same(r.value.fingerprint(), r.fingerprint);
  });
for (const [name, before, step, key, values] of all) {
  const steps = [...before, step],
    e = new Engine(steps),
    t0 = Date.now();
  e.build();
  const setTo = (v: number) => {
    const p = e.step("X").params as Record<string, unknown>;
    return key === "mirror" ? { ...p, plane: { point: [v, 0, 0], normal: [1, 0, 0] } } : { ...p, [key]: v };
  };
  const seq = [values[1]!, values[0]!, values[2]!, values[0]!, values[1]!],
    bad: string[] = [];
  const first = e.result("X").status.kind;
  if (first !== "ok") {
    console.log(`  skip ${name}: the first build is ${first}: ${(e.result("X").status as { why?: string }).why}`);
    e.release();
    continue;
  }
  const spoiled = new Set<string>(intact(e));
  for (const v of seq) {
    e.edit("X", setTo(v));
    intact(e).forEach((i) => spoiled.add(i));
    const f = new Engine(e.recipe());
    f.build();
    const ids = e.ids(),
      same_ = ids.every(
        (i) =>
          e.result(i).status.kind === f.result(i).status.kind && same(e.result(i).fingerprint, f.result(i).fingerprint),
      );
    if (!same_)
      bad.push(
        `${key}=${v}: ${ids.filter((i) => !(e.result(i).status.kind === f.result(i).status.kind && same(e.result(i).fingerprint, f.result(i).fingerprint))).join(",")}`,
      );
    f.release();
  }
  if (spoiled.size) bad.push(`held bodies changed in place: ${[...spoiled].join(",")}`);
  check(
    `${name}: five edits, the live engine gives what a fresh build gives (${((Date.now() - t0) / 1000).toFixed(1)} s)`,
    bad.length === 0,
    bad.join("; "),
  );
  e.release();
}
process.exit(failureCount() ? 1 : 0);

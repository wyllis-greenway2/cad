// The classic example: a block with chamfered top edges, and what "pull the top face up" can mean.   node --experimental-strip-types dev/pull-experiment.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { edgeRef, mint, show } from "../src/engine/id.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
const W = 40,
  H = 30,
  D = 10,
  C = 3,
  PULL = 5;
const line = (i: number) => mint("sk", "line", i),
  side = (i: number) => mint("A", "side", line(i)),
  top = mint("A", "end");
const base = (d: number): Step[] => [
  {
    id: "sk",
    kind: "sketchPolygon",
    params: {
      points: [
        [0, 0],
        [W, 0],
        [W, H],
        [0, H],
      ],
    },
    inputs: [],
  },
  { id: "A", kind: "extrude", params: { d }, inputs: ["sk"] },
  {
    id: "C",
    kind: "round",
    params: { mode: "chamfer", size: C, edges: [0, 1, 2, 3].map((i) => edgeRef(top, side(i))) },
    inputs: ["A"],
  },
];
const report = (label: string, steps: Step[]) => {
  const e = new Engine(steps);
  e.build();
  const last = steps[steps.length - 1]!.id,
    r = e.result(last),
    b = r.value;
  if (!(b instanceof Body)) {
    console.log(label, r.status);
    return;
  }
  const tops = b.faces
    .filter((f) => {
      const q = K.facts(f.h);
      return q.type === "PLANE" && q.ne[2] > 0.99;
    })
    .map((f) => {
      const q = K.facts(f.h);
      return `z=${q.ce[2].toFixed(2)} area ${q.area.toFixed(1)}`;
    });
  console.log(
    `${label.padEnd(58)} volume ${K.volume(b.solid).toFixed(1).padStart(8)}  faces ${String(b.faces.length).padStart(2)}  flat faces facing up: ${tops.join("; ")}`,
  );
  e.release();
};
report(`the block, ${D} tall, top edges chamfered ${C}`, base(D));
report(`(1) PUSH the top face by ${PULL}: its outline is extruded`, [
  ...base(D),
  { id: "P", kind: "push", params: { face: top, dist: PULL }, inputs: ["C"] },
]);
report(`(2) EDIT the block's height to ${D + PULL}: same shape taller`, base(D + PULL));
// (3) the planes of the chamfers stay and the top plane moves: the top face shrinks by PULL on every side (45 degree planes)
const inner = (W - 2 * (C + PULL)) * (H - 2 * (C + PULL)),
  vol3 = (() => {
    const sections = (z: number) => (W - 2 * Math.max(0, z - D + C)) * (H - 2 * Math.max(0, z - D + C));
    let v = W * H * (D - C);
    const n = 4000,
      z0 = D - C,
      z1 = D + PULL;
    for (let i = 0; i < n; i++) v += sections(z0 + ((i + 0.5) / n) * (z1 - z0)) * ((z1 - z0) / n);
    return v;
  })();
console.log(
  `(3) MOVE the top plane, chamfer planes stay (they grow) [analytic]       volume ${vol3.toFixed(1).padStart(8)}  top face ${W - 2 * (C + PULL)} x ${H - 2 * (C + PULL)} = ${inner.toFixed(1)}`,
);
console.log(
  `    ...and at a pull of ${(Math.min(W, H) / 2 - C).toFixed(0)} the chamfers meet in a ridge, then a point: a pyramid when the block is square`,
);

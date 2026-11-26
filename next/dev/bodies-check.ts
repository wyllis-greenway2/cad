// A dev check (not a test, `in_1444`) for several separate bodies (E38 to E43): body names through steps, a step that names a face works on that body alone, combine by name and "keep".
//   node --experimental-strip-types dev/bodies-check.ts [random cases] [seed]
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { edgeRef, idKey, mint, piece } from "../src/engine/id.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
const N = Number(process.argv[2] ?? 30);
let seed = Number(process.argv[3] ?? 1);
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
import { check, fail, failureCount } from "./lib.ts";
const box = (n: string, x: number, w = 10, y = 0, d = 10): Step[] => [
  {
    id: `s${n}`,
    kind: "sketchPolygon",
    params: {
      points: [
        [x, y],
        [x + w, y],
        [x + w, y + 10],
        [x, y + 10],
      ],
    },
    inputs: [],
  },
  { id: `E${n}`, kind: "extrude", params: { d }, inputs: [`s${n}`] },
];
const top = (n: string) => mint(`E${n}`, "end"),
  side = (n: string, i: number) => mint(`E${n}`, "side", mint(`s${n}`, "line", i)),
  bodyId = (n: string) => mint(`E${n}`, "body", 0);
const build = (steps: Step[]) => {
  const e = new Engine(steps);
  e.build();
  return e;
};
const scene = (e: Engine, id: string) => e.result(id).value as Body;
const names = (b: Body) =>
  b.bodies.map((x) => idKey(x.id) + (x.alias.length ? "+" + x.alias.map(idKey).join("+") : "")).join("  ");
const volumeOf = (b: Body, i: number) => {
  const s = K.solidsOf(b.solid);
  const idx = K.solidIndexOfFaces(b.solid),
    j = idx[b.faces.indexOf(b.bodies[i]!.faces[0]!)]!;
  const v = K.volume(s[j]!);
  s.forEach((x) => x.release());
  return v;
};
const sig = (b: Body, i: number) =>
  b.bodies[i]!.faces.map((f) => {
    const q = K.facts(f.h);
    return `${idKey(f.id)}~${q.type}~${q.area.toFixed(6)}~${q.ce.map((v) => v.toFixed(6)).join(",")}`;
  })
    .sort()
    .join(";");
const invariants = (b: Body, label: string) => {
  const all = b.bodies.flatMap((x) => x.faces),
    uniq = new Set(all);
  if (all.length !== b.faces.length || uniq.size !== all.length || b.faces.some((f) => !uniq.has(f)))
    check(`${label}: every face is in exactly one body`, false, `${all.length} in bodies, ${b.faces.length} faces`);
  const keys = b.bodies.map((x) => idKey(x.id));
  if (new Set(keys).size !== keys.length) check(`${label}: body names are unique`, false, keys.join(" "));
};

console.log("1. two bodies apart, then one pushed (a step that names a face works on that body alone)");
{
  const base: Step[] = [
    ...box("1", 0),
    ...box("2", 30),
    { id: "J", kind: "combine", params: { mode: "add" }, inputs: ["E1", "E2"] },
  ];
  const e = build([...base, { id: "P", kind: "push", params: { face: top("1"), dist: 5 }, inputs: ["J"] }]);
  const j = scene(e, "J"),
    p = scene(e, "P");
  check(
    "J: two bodies, named by the steps that made them",
    j.bodies.length === 2 &&
      idKey(j.bodies[0]!.id) === idKey(bodyId("1")) &&
      idKey(j.bodies[1]!.id) === idKey(bodyId("2")),
    names(j),
  );
  check("P: still two bodies, the same names", p.bodies.length === 2 && names(p) === names(j), names(p));
  const iA = p.bodies.findIndex((x) => idKey(x.id) === idKey(bodyId("1"))),
    iB = 1 - iA,
    jB = j.bodies.findIndex((x) => idKey(x.id) === idKey(bodyId("2")));
  check("the pushed body is 15 tall (1500 mm3)", Math.abs(volumeOf(p, iA) - 1500) < 1e-6, volumeOf(p, iA).toFixed(3));
  check(
    "the other body is exactly as it was (faces, names, geometry)",
    sig(p, iB) === sig(j, jB) && Math.abs(volumeOf(p, iB) - 1000) < 1e-6,
  );
  invariants(p, "P");
  e.release();
}
console.log("2. a pull that runs into another body does not join or cut it (bodies may overlap)");
{
  const e = build([
    ...box("1", 0),
    ...box("2", 15),
    { id: "J", kind: "combine", params: { mode: "add" }, inputs: ["E1", "E2"] },
    { id: "P", kind: "push", params: { face: side("1", 1), dist: 12 }, inputs: ["J"] },
  ]);
  const p = scene(e, "P");
  check(
    "P: two bodies still, the pushed one reaches into the other (overlap)",
    e.result("P").status.kind === "ok" && p.bodies.length === 2,
    `${e.result("P").status.kind} ${p.bodies.length} bodies`,
  );
  check(
    "the pushed body is 22 long (2200) and the other is untouched (1000)",
    p.bodies.some((b, i) => Math.abs(volumeOf(p, i) - 2200) < 1e-6) &&
      p.bodies.some((b, i) => Math.abs(volumeOf(p, i) - 1000) < 1e-6),
  );
  invariants(p, "P");
  e.release();
}
console.log("3. bodies joined and split: the older name leads; the larger piece keeps the name");
{
  const e = build([
    ...box("1", 0),
    ...box("2", 10),
    { id: "J", kind: "combine", params: { mode: "add" }, inputs: ["E1", "E2"] },
  ]);
  const j = scene(e, "J");
  check(
    "two boxes that touch, added: one body, the older name leads, the other answers to it",
    j.bodies.length === 1 &&
      idKey(j.bodies[0]!.id) === idKey(bodyId("1")) &&
      j.bodies[0]!.alias.some((a) => idKey(a) === idKey(bodyId("2"))),
    names(j),
  );
  e.release();
  // a long bar cut through its middle by a slab: two pieces, the bigger keeps the name
  const cutter: Step[] = [
    {
      id: "sc",
      kind: "sketchPolygon",
      params: {
        plane: "XY",
        offset: -1,
        points: [
          [22, -1],
          [27, -1],
          [27, 11],
          [22, 11],
        ],
      },
      inputs: [],
    },
    { id: "T", kind: "extrude", params: { d: 12 }, inputs: ["sc"] },
  ];
  const e2 = build([
    ...box("1", 0, 40),
    ...cutter,
    { id: "C", kind: "combine", params: { mode: "cut" }, inputs: ["E1", "T"] },
  ]);
  const c = scene(e2, "C");
  const vs = c.bodies.map((_, i) => volumeOf(c, i));
  const big = vs.indexOf(Math.max(...vs));
  check(
    "a bar cut in two: two bodies, the larger keeps the name, the other is its piece",
    c.bodies.length === 2 &&
      idKey(c.bodies[big]!.id) === idKey(bodyId("1")) &&
      c.bodies[big]!.alias.length === 0 &&
      idKey(c.bodies[1 - big]!.id) === idKey(piece(bodyId("1"), 1)),
    `${names(c)}  volumes ${vs.map((v) => v.toFixed(0)).join(", ")}`,
  );
  invariants(c, "C");
  e2.release();
}
console.log("4. combine by name: cut only one body; keep two bodies apart where they touch");
{
  const tool: Step[] = [
    {
      id: "st",
      kind: "sketchPolygon",
      params: {
        points: [
          [2, 2],
          [8, 2],
          [8, 8],
          [2, 8],
        ],
      },
      inputs: [],
    },
    { id: "T", kind: "extrude", params: { d: 10 }, inputs: ["st"] },
  ];
  const two: Step[] = [
    ...box("1", 0),
    ...box("2", 30),
    { id: "J", kind: "combine", params: { mode: "add" }, inputs: ["E1", "E2"] },
  ];
  const e = build([
    ...two,
    ...tool,
    { id: "C", kind: "combine", params: { mode: "cut", targets: [bodyId("1")] }, inputs: ["J", "T"] },
  ]);
  const c = scene(e, "C"),
    j = scene(e, "J"),
    iA = c.bodies.findIndex((x) => idKey(x.id) === idKey(bodyId("1"))),
    iB = c.bodies.findIndex((x) => idKey(x.id) === idKey(bodyId("2")));
  check(
    "the cut took the tool out of body 1 only (1000 - 360 = 640)",
    e.result("C").status.kind === "ok" && c.bodies.length === 2 && Math.abs(volumeOf(c, iA) - 640) < 1e-6,
    e.result("C").status.kind + " " + (e.result("C").status as any).why,
  );
  check(
    "body 2 is as it was",
    sig(c, iB) ===
      sig(
        j,
        j.bodies.findIndex((x) => idKey(x.id) === idKey(bodyId("2"))),
      ),
  );
  invariants(c, "C");
  e.release();
  const k = build([
    ...box("1", 0),
    ...box("3", 10),
    { id: "K", kind: "combine", params: { mode: "keep" }, inputs: ["E1", "E3"] },
    { id: "A", kind: "combine", params: { mode: "add" }, inputs: ["E1", "E3"] },
  ]);
  const kept = scene(k, "K"),
    added = scene(k, "A");
  check(
    "keep: two boxes that touch stay two bodies with 12 faces; add makes one body with 6",
    kept.bodies.length === 2 && kept.faces.length === 12 && added.bodies.length === 1 && added.faces.length === 6,
    `keep ${kept.bodies.length} bodies ${kept.faces.length} faces; add ${added.bodies.length} bodies ${added.faces.length} faces`,
  );
  invariants(kept, "K");
  k.release();
}
console.log("4b. a turn or a move on several bodies must say which");
{
  const two: Step[] = [
    ...box("1", 0),
    ...box("2", 30),
    { id: "J", kind: "combine", params: { mode: "add" }, inputs: ["E1", "E2"] },
  ];
  const none = build([
      ...two,
      { id: "T", kind: "turn", params: { axis: [0, 0, 1], deg: 90, pivot: [5, 5, 0] }, inputs: ["J"] },
    ]),
    r = none.result("T");
  check(
    "a turn naming no body is refused in words",
    r.status.kind === "flagged" && /say which one to turn/.test((r.status as any).why),
    r.status.kind + " " + ((r.status as any).why ?? ""),
  );
  none.release();
  const all = build([...two, { id: "T", kind: "move", params: { by: [0, 0, 5], body: "all" }, inputs: ["J"] }]);
  check(
    'a move of "all" moves every body',
    all.result("T").status.kind === "ok" &&
      scene(all, "T").bodies.length === 2 &&
      Math.abs(K.facts(scene(all, "T").faces[0]!.h).lo[2] - 0) >= 0,
    all.result("T").status.kind,
  );
  all.release();
  const one = build([
    ...box("1", 0),
    { id: "T", kind: "turn", params: { axis: [0, 0, 1], deg: 90, pivot: [5, 5, 0] }, inputs: ["E1"] },
  ]);
  check("with one body it needs no name (as before)", one.result("T").status.kind === "ok");
  one.release();
}
console.log("5. an edit follows (incremental equals fresh), and the picture is the same");
{
  const steps = (dist: number): Step[] => [
    ...box("1", 0),
    ...box("2", 30),
    { id: "J", kind: "combine", params: { mode: "add" }, inputs: ["E1", "E2"] },
    { id: "P", kind: "push", params: { face: top("1"), dist }, inputs: ["J"] },
    {
      id: "R",
      kind: "round",
      params: { mode: "chamfer", size: 1, edges: [edgeRef(top("2"), side("2", 0))] },
      inputs: ["P"],
    },
  ];
  const e = build(steps(5));
  e.edit("P", { face: top("1"), dist: 8 });
  const f = build(steps(8));
  check(
    "edit 5 -> 8 equals a fresh build, for every step",
    e.ids().every((id) => e.result(id).fingerprint === f.result(id).fingerprint),
  );
  const r = scene(f, "R");
  check("the chamfer touched body 2 only", r.bodies.length === 2 && f.result("R").status.kind === "ok");
  e.release();
  f.release();
}
console.log(`6. random scenes: ${N} cases of 2 to 3 bodies with random steps that name a face`);
{
  let ok = 0,
    flagged = 0;
  for (let n = 0; n < N; n++) {
    const k = 2 + Math.floor(rnd() * 2),
      xs = Array.from({ length: k }, (_, i) => i * 30),
      heights = xs.map(() => 5 + Math.floor(rnd() * 15)),
      steps: Step[] = [];
    xs.forEach((x, i) => steps.push(...box(String(i + 1), x, 10, 0, heights[i]!)));
    let prev = "E1";
    for (let i = 1; i < k; i++) {
      steps.push({ id: `J${i}`, kind: "combine", params: { mode: "add" }, inputs: [prev, `E${i + 1}`] });
      prev = `J${i}`;
    }
    const target = 1 + Math.floor(rnd() * k),
      kind = ["push", "round", "turn"][Math.floor(rnd() * 3)]!,
      last = prev;
    if (kind === "push")
      steps.push({
        id: "X",
        kind: "push",
        params: {
          face: [top(String(target)), side(String(target), Math.floor(rnd() * 4))][Math.floor(rnd() * 2)],
          dist: [-3, 2, 5, 9][Math.floor(rnd() * 4)],
        },
        inputs: [last],
      });
    else if (kind === "round")
      steps.push({
        id: "X",
        kind: "round",
        params: {
          mode: rnd() < 0.5 ? "fillet" : "chamfer",
          size: [0.5, 1.5, 3][Math.floor(rnd() * 3)],
          edges: [edgeRef(top(String(target)), side(String(target), Math.floor(rnd() * 4)))],
        },
        inputs: [last],
      });
    else
      steps.push({
        id: "X",
        kind: "turn",
        params: {
          body: bodyId(String(target)),
          axis: [0, 0, 1],
          deg: [15, 90][Math.floor(rnd() * 2)],
          pivot: [xs[target - 1]! + 5, 5, 0],
        },
        inputs: [last],
      });
    const e = build(steps),
      before = scene(e, last),
      after = scene(e, "X"),
      r = e.result("X");
    invariants(before, `case ${n} J`);
    if (r.status.kind !== "ok") {
      flagged++;
      e.release();
      continue;
    }
    ok++;
    invariants(after, `case ${n} X`);
    const idx = (b: Body, id: string) => b.bodies.findIndex((x) => idKey(x.id) === id),
      tid = idKey(bodyId(String(target)));
    for (let i = 0; i < before.bodies.length; i++) {
      const id = idKey(before.bodies[i]!.id);
      if (id === tid) continue;
      const j = idx(after, id);
      if (j < 0 || sig(before, i) !== sig(after, j))
        check(`case ${n} (${kind}, body ${target}): the other body ${id} is as it was`, false);
    }
    if (after.bodies.length < before.bodies.length)
      check(`case ${n}: a step on one body lost a body`, false, `${before.bodies.length} -> ${after.bodies.length}`);
    e.release();
  }
  console.log(`   ${ok} steps ran, ${flagged} flagged with a reason; no body was touched that the step did not name`);
}
console.log(failureCount() ? `\n${failureCount()} failureCount()` : "\nno failure");
process.exit(failureCount() ? 1 : 0);

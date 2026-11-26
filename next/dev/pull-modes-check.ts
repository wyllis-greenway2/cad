// A dev check (not a test, `in_1444`) for the pull modes as step kinds (E26, E32): moveFace (mode 3), offsetFace (mode 4), the mode list and mode 1.
//   node --experimental-strip-types dev/pull-modes-check.ts [random cases] [seed]
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { edgeRef, idKey, mint } from "../src/engine/id.ts";
import { originalEdit, pullModes } from "../src/engine/pull.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
const N = Number(process.argv[2] ?? 40);
let seed = Number(process.argv[3] ?? 1);
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let failures = 0;
const bad = (m: string) => {
  failures++;
  console.log("  VIOLATION: " + m);
};
const W = 40,
  H = 30,
  D = 10,
  C = 3,
  line = (i: number) => mint("sk", "line", i),
  side = (i: number) => mint("A", "side", line(i)),
  top = mint("A", "end");
const block = (d = D): Step[] => [
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
];
const chamfered = (d = D, c = C): Step[] => [
  ...block(d),
  {
    id: "C",
    kind: "round",
    params: { mode: "chamfer", size: c, edges: [0, 1, 2, 3].map((i) => edgeRef(top, side(i))) },
    inputs: ["A"],
  },
];
const build = (steps: Step[]) => {
  const e = new Engine(steps);
  e.build();
  return e;
};
const body = (e: Engine, id: string) => e.result(id).value as Body;
const summary = (b: Body) => ({
  vol: K.volume(b.solid),
  faces: b.faces.length,
  defects: b.faces.filter((f) => f.defect).length,
});
const cmp = (a: Body, b: Body): string => {
  const va = K.volume(a.solid),
    vb = K.volume(b.solid),
    fa = a.faces.map((f) => ({ q: K.facts(f.h), ids: [f.id, ...f.alias].map(idKey) })),
    fb = b.faces.map((f) => ({ q: K.facts(f.h), ids: [f.id, ...f.alias].map(idKey) })),
    why: string[] = [];
  if (Math.abs(va - vb) > 1e-5 * Math.max(va, vb)) why.push(`volume ${va.toFixed(4)} vs ${vb.toFixed(4)}`);
  if (fa.length !== fb.length) why.push(`${fa.length} faces vs ${fb.length}`);
  const used = new Set<number>();
  let un = 0,
    idd = 0;
  for (const f of fa) {
    const j = fb.findIndex(
      (g, i) =>
        !used.has(i) &&
        g.q.type === f.q.type &&
        Math.abs(g.q.area - f.q.area) < 1e-4 * Math.max(1, f.q.area) &&
        g.q.ce.every((v, k) => Math.abs(v - f.q.ce[k]!) < 1e-3),
    );
    if (j < 0) {
      un++;
      continue;
    }
    used.add(j);
    if (!fb[j]!.ids.every((x) => f.ids.includes(x))) idd++;
  }
  if (un) why.push(`${un} faces with no equal face`);
  if (idd) why.push(`${idd} faces with other ids`);
  return why.join("; ");
};
const analytic = (d: number) => {
  const sec = (z: number) => (W - 2 * Math.max(0, z - D + C)) * (H - 2 * Math.max(0, z - D + C));
  let v = W * H * (D - C);
  const n = 4000,
    z0 = D - C,
    z1 = D + d;
  for (let i = 0; i < n; i++) v += sec(z0 + ((i + 0.5) / n) * (z1 - z0)) * ((z1 - z0) / n);
  return v;
};

console.log("1. the chamfered block, top moved (mode 3)");
const base = chamfered(),
  mv = (dist: number): Step[] => [...base, { id: "M", kind: "moveFace", params: { face: top, dist }, inputs: ["C"] }];
for (const dist of [2, 5, 10, 11.9, -1, -3, -5]) {
  const e = build(mv(dist)),
    r = e.result("M");
  if (r.status.kind !== "ok") {
    bad(`dist ${dist}: ${r.status.kind} ${"why" in r.status ? r.status.why : ""}`);
    e.release();
    continue;
  }
  const s = summary(body(e, "M")),
    want = dist > 0 ? analytic(dist) : null,
    topFace = body(e, "M").faces.find(
      (f) => idKey(f.id) === idKey(top) || f.alias.some((a) => idKey(a) === idKey(top)),
    );
  console.log(
    `   ${String(dist).padStart(5)}  volume ${s.vol.toFixed(3)}${want ? ` (analytic ${want.toFixed(3)})` : ""}  faces ${s.faces}  defects ${s.defects}  top id kept: ${!!topFace}`,
  );
  if (want && Math.abs(s.vol - want) > 1e-3) bad(`dist ${dist}: volume ${s.vol} against ${want}`);
  if (s.defects) bad(`dist ${dist}: ${s.defects} unnamed faces`);
  if (!topFace) bad(`dist ${dist}: the moved face lost its id`);
  e.release();
}
{
  const e = build(mv(12.5)),
    r = e.result("M");
  console.log(`   12.5  ${r.status.kind}: ${"why" in r.status ? r.status.why : ""}`);
  if (r.status.kind === "ok" || !("why" in r.status) || !/collapsed.*12\.000/.test(r.status.why))
    bad("past the collapse the move must be refused with the distance 12");
  e.release();
}
{
  // an edit of the number follows by the cutoff: incremental equals fresh
  const e = build(mv(5));
  e.edit("M", { face: top, dist: 8 });
  const f = build(mv(8));
  if (e.result("M").fingerprint !== f.result("M").fingerprint) bad("edit 5 -> 8 differs from a fresh build");
  else console.log("   edit 5 -> 8 equals a fresh build");
  e.release();
  f.release();
}

console.log("2. a pocket's floor moved (mode 3) against the pocket made at the final depth");
{
  const pocket = (depth: number): Step[] => [
    ...block(),
    {
      id: "p",
      kind: "sketchPolygon",
      params: {
        plane: "XY",
        offset: D + 1,
        dir: [0, 0, -1],
        points: [
          [15, 10],
          [25, 10],
          [25, 20],
          [15, 20],
        ],
      },
      inputs: [],
    },
    { id: "T", kind: "extrude", params: { d: depth + 1, dir: [0, 0, -1] }, inputs: ["p"] },
    { id: "H", kind: "combine", params: { mode: "cut" }, inputs: ["A", "T"] },
  ];
  for (const dist of [2, -3]) {
    const g = build([
        ...pocket(6),
        { id: "M", kind: "moveFace", params: { face: mint("T", "end"), dist }, inputs: ["H"] },
      ]),
      f = build(pocket(6 - dist)),
      r = g.result("M");
    if (r.status.kind !== "ok") {
      bad(`dist ${dist}: ${r.status.kind} ${"why" in r.status ? r.status.why : ""}`);
    } else {
      const w = cmp(body(g, "M"), body(f, "H"));
      console.log(
        `   floor ${dist > 0 ? "+" : ""}${dist}: ${w || "same faces, same ids, same volume as the pocket made fresh"}`,
      );
      if (w) bad(`pocket floor ${dist}: ${w}`);
    }
    g.release();
    f.release();
  }
}
console.log("3. a hole's and a boss's wall (mode 4) against the part made fresh with the final radius");
{
  const hole = (r: number): Step[] => [
    ...block(),
    { id: "s", kind: "sketchCircle", params: { plane: "XY", offset: D + 1, center: [20, 15], r }, inputs: [] },
    { id: "T", kind: "extrude", params: { d: D + 2, dir: [0, 0, -1] }, inputs: ["s"] },
    { id: "H", kind: "combine", params: { mode: "cut" }, inputs: ["A", "T"] },
  ];
  const bossS = (r: number): Step[] => [
    ...block(),
    { id: "s", kind: "sketchCircle", params: { plane: "XY", offset: D, center: [20, 15], r }, inputs: [] },
    { id: "T", kind: "extrude", params: { d: 8 }, inputs: ["s"] },
    { id: "H", kind: "combine", params: { mode: "add" }, inputs: ["A", "T"] },
  ];
  const wallOf = (steps: Step[]) => {
    const e = build(steps);
    const w = body(e, "H").faces.find((f) => K.facts(f.h).type === "CYLINDRE")!;
    const id = w.id;
    e.release();
    return id;
  };
  for (const [name, make, r0, cases] of [
    [
      "hole",
      hole,
      4,
      [
        [1.5, 2.5],
        [-1.5, 5.5],
        [-8, 12],
      ],
    ],
    [
      "boss",
      bossS,
      5,
      [
        [1.5, 6.5],
        [-2, 3],
      ],
    ],
  ] as const) {
    const wid = wallOf(make(r0));
    for (const [dist, r2] of cases) {
      const g = build([...make(r0), { id: "O", kind: "offsetFace", params: { face: wid, dist }, inputs: ["H"] }]),
        f = build(make(r2)),
        r = g.result("O");
      if (r.status.kind !== "ok") bad(`${name} ${dist}: ${r.status.kind} ${"why" in r.status ? r.status.why : ""}`);
      else {
        const w = cmp(body(g, "O"), body(f, "H"));
        console.log(`   ${name} r ${r0} -> ${r2}: ${w || "same faces, same ids, same volume as made fresh"}`);
        if (w) bad(`${name} ${dist}: ${w}`);
      }
      g.release();
      f.release();
    }
  }
}
console.log("4. the modes offered (E32) and mode 1");
{
  const e = build(mv(5));
  const show = (label: string, id: ReturnType<typeof mint>) =>
    console.log(
      `   ${label.padEnd(22)}`,
      pullModes(e, "C", id)
        .map((m) => `${m.mode}${m.ok ? (m.suggested ? "*" : "") : "(" + m.why.slice(0, 38) + ")"}`)
        .join("  "),
    );
  show("top of the block", top);
  const sideFace = body(e, "C").faces.find(
    (f) => K.facts(f.h).type === "PLANE" && Math.abs(K.facts(f.h).ne[0] - 1) < 1e-6,
  )!;
  show("the +x wall", sideFace.id);
  const o = originalEdit(e, "C", top, 5);
  console.log("   mode 1 on the top, +5:", JSON.stringify("why" in o ? o : { step: o.step, d: o.params.d }));
  if ("why" in o || o.params.d !== 15) bad("mode 1 on the top by 5 must make the depth 15");
  else {
    const g = build(chamfered(15));
    const fix = build(chamfered(15));
    if (cmp(body(g, "C"), body(fix, "C"))) bad("self");
    g.release();
    fix.release();
  }
  e.release();
}
console.log(`5. random: a block, random chamfers, the top face moved by a random distance (${N} cases)`);
{
  const tally: Record<string, number> = {};
  let m = 0;
  for (let n = 0; n < N; n++) {
    const d = 5 + Math.floor(rnd() * 20),
      c = 1 + Math.floor(rnd() * 4),
      dist = Math.round((-d * 0.9 + rnd() * (d * 0.9 + 25)) * 100) / 100,
      steps: Step[] = [...chamfered(d, c), { id: "M", kind: "moveFace", params: { face: top, dist }, inputs: ["C"] }];
    const e = build(steps),
      r = e.result("M");
    tally[r.status.kind] = (tally[r.status.kind] ?? 0) + 1;
    if (r.status.kind === "ok") {
      const s = summary(body(e, "M"));
      if (s.defects) bad(`case ${n}: ${s.defects} unnamed faces (${JSON.stringify({ d, c, dist })})`);
      if (!K.valid(body(e, "M").solid)) bad(`case ${n}: invalid`);
    } else if (!("why" in r.status) || !r.status.why) bad(`case ${n}: flagged with no reason`);
    else if (!/collapsed|nothing|left|invalid/.test(r.status.why))
      console.log(`   case ${n} (${JSON.stringify({ d, c, dist })}): ${r.status.why}`);
    if (r.status.kind === "ok") {
      const dist2 = dist + 1.5,
        e2 = build(steps);
      e2.edit("M", { face: top, dist: dist2 });
      const f2 = build(steps.map((s) => (s.id === "M" ? { ...s, params: { face: top, dist: dist2 } } : s)));
      if (e2.result("M").fingerprint !== f2.result("M").fingerprint) bad(`case ${n}: edit differs from fresh`);
      e2.release();
      f2.release();
      m++;
    }
    e.release();
  }
  console.log("   outcomes", JSON.stringify(tally), `; ${m} edits equal to a fresh build`);
}
console.log(failures ? `\n${failures} violations` : "\nno violation");
process.exit(failures ? 1 : 0);

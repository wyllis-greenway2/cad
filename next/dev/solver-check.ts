// A dev check (not a test, `in_1444`) for the sketch constraint solver (E48 to E51, E55, E61).
//   node --experimental-strip-types dev/solver-check.ts [random systems] [seed]
import { solve, validate, type Constraint, type System } from "../src/engine/solver.ts";
const N = Number(process.argv[2] ?? 200);
let seed = Number(process.argv[3] ?? 1);
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
import { check, fail, failureCount } from "./lib.ts";
const near = (a: number, b: number, t = 1e-7) => Math.abs(a - b) <= t;
const pt = (id: string, x: number, y: number, fixed = false) => ({ id, x, y, fixed });
const rect = (extra: Constraint[] = [], fixA = true): System => ({
  points: [pt("A", 0, 0, false), pt("B", 10.3, 0.2), pt("C", 10.1, 5.4), pt("D", -0.2, 5)],
  circles: [],
  lines: [
    { id: "AB", a: "A", b: "B" },
    { id: "BC", a: "B", b: "C" },
    { id: "CD", a: "C", b: "D" },
    { id: "DA", a: "D", b: "A" },
  ],
  constraints: [
    { id: "h1", kind: "horizontal", parts: ["AB"] },
    { id: "h2", kind: "horizontal", parts: ["CD"] },
    { id: "v1", kind: "vertical", parts: ["BC"] },
    { id: "v2", kind: "vertical", parts: ["DA"] },
    ...(fixA ? [{ id: "fx", kind: "fixed" as const, parts: ["A"], at: [0, 0] as [number, number] }] : []),
    ...extra,
  ],
});
const dims: Constraint[] = [
  { id: "w", kind: "length", parts: ["AB"], value: 10 },
  { id: "h", kind: "length", parts: ["BC"], value: 5 },
];

console.log("1. a rectangle: from a drawing that is a little off");
{
  const r = solve(rect(dims)),
    s = r.solution.points;
  check(
    "fully constrained: solved, nothing free",
    r.verdict.kind === "solved" && r.verdict.ok && r.verdict.freedom === 0,
    JSON.stringify({ k: r.verdict.kind, f: r.verdict.freedom, free: r.verdict.free }),
  );
  check(
    "the corners are where a 10 by 5 rectangle puts them",
    near(s.B![0], 10) &&
      near(s.B![1], 0) &&
      near(s.C![0], 10) &&
      near(s.C![1], 5) &&
      near(s.D![0], 0) &&
      near(s.D![1], 5),
    JSON.stringify(s),
  );
  const u = solve(rect(dims, false));
  check(
    "without the fixed corner: under-constrained, two ways to move (the place)",
    u.verdict.kind === "under" && u.verdict.freedom === 2,
    `${u.verdict.kind} ${u.verdict.freedom} ${u.verdict.free.join(",")}`,
  );
  const w = solve(rect());
  check(
    "without the sizes: two ways to move (the width and the height), the corners that move are named",
    w.verdict.kind === "under" && w.verdict.freedom === 2 && w.verdict.free.includes("C"),
    `${w.verdict.kind} ${w.verdict.freedom} ${w.verdict.free.join(",")}`,
  );
}
console.log("2. conflicts are named; a redundant constraint is named; a collapse is a conflict");
{
  const over = solve({
    points: [pt("A", 0, 0), pt("B", 5, 0)],
    lines: [],
    circles: [],
    constraints: [
      { id: "d1", kind: "distance", parts: ["A", "B"], value: 5 },
      { id: "d2", kind: "distance", parts: ["A", "B"], value: 6 },
      { id: "x", kind: "horizontalDistance", parts: ["A", "B"], value: 3 },
    ],
  });
  check(
    "two different distances between the same points: over-constrained, the two are named (not the third)",
    over.verdict.kind === "over" &&
      !over.verdict.ok &&
      over.verdict.conflict.length === 2 &&
      over.verdict.conflict.includes("d1") &&
      over.verdict.conflict.includes("d2"),
    JSON.stringify(over.verdict.conflict),
  );
  const red = solve(rect([...dims, { id: "par", kind: "parallel", parts: ["AB", "CD"] }]));
  check(
    "a parallel that the two horizontals already say: redundant, named",
    red.verdict.kind === "redundant" && red.verdict.ok && red.verdict.redundant.includes("par"),
    JSON.stringify({ k: red.verdict.kind, r: red.verdict.redundant }),
  );
  const sq = solve({
    points: [pt("A", 0, 0), pt("B", 5, 0.1)],
    lines: [{ id: "L", a: "A", b: "B" }],
    circles: [],
    constraints: [
      { id: "hz", kind: "horizontal", parts: ["L"] },
      { id: "vt", kind: "vertical", parts: ["L"] },
    ],
  });
  check(
    "a line both level and upright is refused (it would be a line of nothing), the two named",
    sq.verdict.kind === "over" && sq.verdict.conflict.length === 2 && /nothing/.test(sq.verdict.reason),
    JSON.stringify({ k: sq.verdict.kind, c: sq.verdict.conflict, r: sq.verdict.reason }),
  );
  const bad = solve({
    points: [pt("A", 0, 0)],
    lines: [],
    circles: [],
    constraints: [{ id: "q", kind: "parallel", parts: ["A", "A"] }],
  });
  check(
    "a constraint on the wrong kind of part is said in words",
    !bad.verdict.ok && /needs a line/.test(bad.verdict.reason),
    bad.verdict.reason,
  );
  check(
    "a part that is not there is said in words",
    validate({
      points: [],
      lines: [],
      circles: [],
      constraints: [{ id: "q", kind: "fixed", parts: ["Z"], at: [0, 0] }],
    })?.includes("not there") === true,
  );
}
console.log("3. the relations, one at a time");
{
  const rel = (
    name: string,
    S: System,
    test: (p: Record<string, [number, number]>, c: Record<string, number>) => boolean,
  ) => {
    const r = solve(S);
    check(name, r.verdict.ok && test(r.solution.points, r.solution.circles), `${r.verdict.kind} ${r.verdict.reason}`);
  };
  const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  rel(
    "tangent: a line and a circle of radius 3",
    {
      points: [pt("A", 0, 1, true), pt("B", 10, 0.5), pt("C", 5, 4, true)],
      lines: [{ id: "L", a: "A", b: "B" }],
      circles: [{ id: "K", c: "C", r: 3, fixedR: true }],
      constraints: [{ id: "t", kind: "tangent", parts: ["L", "K"] }],
    },
    (p) => {
      const u = [p.B![0] - p.A![0], p.B![1] - p.A![1]],
        d = Math.abs(u[0]! * (4 - p.A![1]) - u[1]! * (5 - p.A![0])) / Math.hypot(u[0]!, u[1]!);
      return near(d, 3, 1e-6);
    },
  );
  rel(
    "a point on a circle, a point on a line, the midpoint",
    {
      points: [
        pt("C", 0, 0, true),
        pt("P", 4.2, 2),
        pt("A", 0, 5, true),
        pt("B", 10, 5, true),
        pt("Q", 4, 6),
        pt("M", 4, 4),
      ],
      lines: [{ id: "L", a: "A", b: "B" }],
      circles: [{ id: "K", c: "C", r: 5, fixedR: true }],
      constraints: [
        { id: "on", kind: "pointOnCircle", parts: ["P", "K"] },
        { id: "ol", kind: "pointOnLine", parts: ["Q", "L"] },
        { id: "mid", kind: "midpoint", parts: ["M", "L"] },
        { id: "px", kind: "horizontalDistance", parts: ["C", "P"], value: 3 },
      ],
    },
    (p) => near(dist(p.P!, [0, 0]), 5) && near(p.Q![1], 5) && near(p.M![0], 5) && near(p.M![1], 5) && near(p.P![0], 3),
  );
  rel(
    "an angle of 30 degrees between two lines, then perpendicular",
    {
      points: [pt("O", 0, 0, true), pt("A", 5, 0, true), pt("B", 4, 3), pt("C", 1, 6)],
      lines: [
        { id: "OA", a: "O", b: "A" },
        { id: "OB", a: "O", b: "B" },
        { id: "OC", a: "O", b: "C" },
      ],
      circles: [],
      constraints: [
        { id: "ang", kind: "angle", parts: ["OA", "OB"], value: 30 },
        { id: "lb", kind: "length", parts: ["OB"], value: 4 },
        { id: "pp", kind: "perpendicular", parts: ["OA", "OC"] },
        { id: "lc", kind: "length", parts: ["OC"], value: 2 },
      ],
    },
    (p) =>
      near((Math.atan2(p.B![1], p.B![0]) * 180) / Math.PI, 30, 1e-5) &&
      near(p.C![0], 0, 1e-6) &&
      near(Math.abs(p.C![1]), 2, 1e-6),
  );
  rel(
    "equal radius, concentric, equal length, collinear",
    {
      points: [
        pt("P", 0, 0, true),
        pt("Q", 0.4, -0.3),
        pt("A", 0, 0, true),
        pt("B", 4, 0, true),
        pt("C", 6, 0.5),
        pt("D", 9, -0.4),
      ],
      lines: [
        { id: "L1", a: "A", b: "B" },
        { id: "L2", a: "C", b: "D" },
      ],
      circles: [
        { id: "K1", c: "P", r: 3, fixedR: true },
        { id: "K2", c: "Q", r: 5 },
      ],
      constraints: [
        { id: "er", kind: "equalRadius", parts: ["K1", "K2"] },
        { id: "cc", kind: "concentric", parts: ["K1", "K2"] },
        { id: "el", kind: "equalLength", parts: ["L1", "L2"] },
        { id: "co", kind: "collinear", parts: ["L1", "L2"] },
      ],
    },
    (p, c) =>
      near(c.K2!, 3) &&
      near(p.Q![0], 0) &&
      near(p.Q![1], 0) &&
      near(dist(p.C!, p.D!), 4, 1e-6) &&
      near(p.C![1], 0, 1e-6) &&
      near(p.D![1], 0, 1e-6),
  );
  rel(
    "a circle tangent to a circle (outside, then inside)",
    {
      points: [pt("P", 0, 0, true), pt("Q", 7, 0.3), pt("R", 0.5, 0.2)],
      lines: [],
      circles: [
        { id: "K1", c: "P", r: 3, fixedR: true },
        { id: "K2", c: "Q", r: 2, fixedR: true },
        { id: "K3", c: "R", r: 1, fixedR: true },
      ],
      constraints: [
        { id: "t1", kind: "tangentCircles", parts: ["K1", "K2"] },
        { id: "t2", kind: "tangentCircles", parts: ["K1", "K3"], internal: true },
        { id: "y", kind: "verticalDistance", parts: ["P", "Q"], value: 0 },
        { id: "y3", kind: "verticalDistance", parts: ["P", "R"], value: 0 },
      ],
    },
    (p) => near(dist(p.P!, p.Q!), 5, 1e-6) && near(dist(p.P!, p.R!), 2, 1e-6),
  );
  rel(
    "a distance from a point to a line",
    {
      points: [pt("A", 0, 0, true), pt("B", 10, 0, true), pt("P", 3, 1)],
      lines: [{ id: "L", a: "A", b: "B" }],
      circles: [],
      constraints: [
        { id: "pl", kind: "pointLineDistance", parts: ["P", "L"], value: 2 },
        { id: "px", kind: "horizontalDistance", parts: ["A", "P"], value: 3 },
      ],
    },
    (p) => near(Math.abs(p.P![1]), 2, 1e-6) && near(p.P![0], 3, 1e-6),
  );
}
console.log("4. determinism, a drag, a part held, a part apart");
{
  const a = JSON.stringify(solve(rect(dims)).solution),
    b = JSON.stringify(solve(rect(dims)).solution);
  check("the same system twice gives the same bytes", a === b);
  const S = rect();
  const fresh = solve({ ...S, points: S.points.map((p) => (p.id === "C" ? { ...p, x: 12, y: 8, fixed: true } : p)) }),
    drag = solve(S, { pins: { C: [12, 8] } });
  const diff = Math.max(
    ...Object.keys(fresh.solution.points).map((id) =>
      Math.hypot(
        fresh.solution.points[id]![0] - drag.solution.points[id]![0],
        fresh.solution.points[id]![1] - drag.solution.points[id]![1],
      ),
    ),
  );
  check(
    "a drag of C to (12, 8) equals a fresh solve with C fixed there (to 1e-8)",
    diff < 1e-8,
    `difference ${diff.toExponential(2)}`,
  );
  const hard = solve(rect(dims), { pins: { C: [20, 20] } });
  check(
    "a drag against sizes that hold: the pin is not reached, and says how far",
    Object.keys(hard.unreached).includes("C") && near(hard.solution.points.C![0], 10, 1e-6),
    JSON.stringify(hard.unreached),
  );
  const held = solve(rect([...dims]), { hold: ["B"] });
  check(
    "a part held for one solve does not move",
    near(held.solution.points.B![0], 10.3, 1e-12) || !held.verdict.ok,
    JSON.stringify(held.solution.points.B),
  );
  const apart: System = {
    points: [pt("A", 0, 0, true), pt("B", 3.2, 0.1), pt("P", 50, 50), pt("Q", 52, 53.5)],
    lines: [
      { id: "L", a: "A", b: "B" },
      { id: "M", a: "P", b: "Q" },
    ],
    circles: [],
    constraints: [
      { id: "h", kind: "horizontal", parts: ["L"] },
      { id: "ln", kind: "length", parts: ["L"], value: 3 },
      { id: "v", kind: "vertical", parts: ["M"] },
      { id: "lm", kind: "length", parts: ["M"], value: 4 },
    ],
  };
  const full = solve(apart),
    part = solve(apart, { only: ["B"] });
  check(
    "solving only the part connected to B leaves the other figure where it was",
    part.solution.points.P![0] === 50 &&
      near(part.solution.points.B![0], full.solution.points.B![0], 1e-9) &&
      near(full.solution.points.Q![0], full.solution.points.P![0], 1e-9),
  );
}
console.log(`5. random systems: ${N} sketches built to be satisfiable, started from a drawing that is a little off`);
{
  let ok = 0,
    notOk = 0,
    skipped = 0,
    residual = 0,
    redundantFound = 0,
    redundantSame = 0,
    redundantTried = 0,
    maxOff = 0;
  for (let n = 0; n < N; n++) {
    const np = 4 + Math.floor(rnd() * 5),
      pts = Array.from({ length: np }, (_, i) => ({
        id: `P${i}`,
        x: Math.round(rnd() * 400) / 10,
        y: Math.round(rnd() * 400) / 10,
      }));
    // some points exactly level or upright by construction, so such relations are true of the geometry
    for (let i = 1; i < np; i++)
      if (rnd() < 0.3) pts[i]!.y = pts[i - 1]!.y;
      else if (rnd() < 0.3) pts[i]!.x = pts[i - 1]!.x;
    if (pts.some((p, i) => i > 0 && Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) < 1)) {
      skipped++;
      continue;
    } // a line of nothing is not a drawing
    const lines = Array.from({ length: np - 1 }, (_, i) => ({ id: `L${i}`, a: `P${i}`, b: `P${i + 1}` })),
      cs: Constraint[] = [{ id: "fix", kind: "fixed", parts: ["P0"], at: [pts[0]!.x, pts[0]!.y] }];
    const d = (a: number, b: number) => Math.hypot(pts[a]!.x - pts[b]!.x, pts[a]!.y - pts[b]!.y);
    lines.forEach((l, i) => {
      if (pts[i]!.y === pts[i + 1]!.y) cs.push({ id: `h${i}`, kind: "horizontal", parts: [l.id] });
      else if (pts[i]!.x === pts[i + 1]!.x) cs.push({ id: `v${i}`, kind: "vertical", parts: [l.id] });
      if (d(i, i + 1) > 1 && rnd() < 0.8) cs.push({ id: `len${i}`, kind: "length", parts: [l.id], value: d(i, i + 1) });
    });
    for (let q = 0; q < np; q++) {
      const a = Math.floor(rnd() * np),
        b = Math.floor(rnd() * np);
      if (a === b) continue;
      const kind = ["distance", "horizontalDistance", "verticalDistance"][Math.floor(rnd() * 3)] as Constraint["kind"];
      const value =
        kind === "distance" ? d(a, b) : kind === "horizontalDistance" ? pts[b]!.x - pts[a]!.x : pts[b]!.y - pts[a]!.y;
      if (kind === "distance" && value < 1) continue;
      cs.push({ id: `d${q}`, kind, parts: [`P${a}`, `P${b}`], value });
    }
    const truth: System = { points: pts, lines, circles: [], constraints: cs },
      off: System = {
        ...truth,
        points: pts.map((p, i) => (i === 0 ? p : { ...p, x: p.x + (rnd() - 0.5) * 0.6, y: p.y + (rnd() - 0.5) * 0.6 })),
      };
    const r = solve(off);
    if (!r.verdict.ok) {
      notOk++;
      if (notOk <= 3)
        console.log(`   case ${n}: not ok: ${r.verdict.kind} ${r.verdict.reason} ${r.verdict.conflict.join(",")}`);
      continue;
    }
    ok++;
    // every constraint holds: the residual, by solving again from the answer (it must not move)
    const again = solve({
        ...off,
        points: off.points.map((p) => ({ ...p, x: r.solution.points[p.id]![0], y: r.solution.points[p.id]![1] })),
      }),
      moved = Math.max(
        ...pts.map((p) =>
          Math.hypot(
            again.solution.points[p.id]![0] - r.solution.points[p.id]![0],
            again.solution.points[p.id]![1] - r.solution.points[p.id]![1],
          ),
        ),
      );
    residual = Math.max(residual, moved);
    for (const c of truth.constraints) {
      if (c.kind !== "distance") continue;
      const [a, b] = c.parts.map((id) => r.solution.points[id]!);
      maxOff = Math.max(maxOff, Math.abs(Math.hypot(a![0] - b![0], a![1] - b![1]) - c.value!));
    }
    // a constraint said twice is redundant; taking it away leaves the answer unchanged
    const dim = truth.constraints.find((c) => c.kind === "length");
    if (dim) {
      redundantTried++;
      const twice = solve({ ...off, constraints: [...off.constraints, { ...dim, id: "again" }] });
      if (twice.verdict.redundant.includes("again") || twice.verdict.redundant.includes(dim.id)) {
        redundantFound++;
        const same = Math.max(
          ...pts.map((p) =>
            Math.hypot(
              twice.solution.points[p.id]![0] - r.solution.points[p.id]![0],
              twice.solution.points[p.id]![1] - r.solution.points[p.id]![1],
            ),
          ),
        );
        if (r.verdict.freedom === 0 ? same < 1e-6 : twice.verdict.ok) redundantSame++;
      }
    }
  }
  check(
    `every satisfiable sketch is solved (${ok} solved, ${notOk} not, ${skipped} not made: a line of nothing)`,
    notOk === 0 && ok > N / 2,
  );
  check(
    "the answer is a fixed point of the solve (a second solve does not move it, to 1e-8)",
    residual < 1e-8,
    `largest move ${residual.toExponential(2)}`,
  );
  check("every distance holds to 1e-7", maxOff < 1e-7, maxOff.toExponential(2));
  check(
    "a constraint said twice is found redundant; the answer is the same without it where nothing is free (and still solved where something is)",
    redundantTried > 0 && redundantFound === redundantTried && redundantSame === redundantFound,
    `${redundantFound}/${redundantTried} found, ${redundantSame} as expected`,
  );
}
console.log(
  "6. a wrong constraint added to a satisfiable sketch: the conflict is found, named, and cannot be made smaller",
);
{
  let tried = 0,
    found = 0,
    contains = 0,
    irreducible = 0;
  for (let n = 0; n < Math.min(N, 60); n++) {
    const pts = Array.from({ length: 5 }, (_, i) => ({
      id: `P${i}`,
      x: Math.round(rnd() * 300) / 10 + i * 12,
      y: Math.round(rnd() * 300) / 10,
    }));
    const lines = [0, 1, 2, 3].map((i) => ({ id: `L${i}`, a: `P${i}`, b: `P${i + 1}` })),
      d = (a: number, b: number) => Math.hypot(pts[a]!.x - pts[b]!.x, pts[a]!.y - pts[b]!.y);
    const cs: Constraint[] = [
      { id: "fix", kind: "fixed", parts: ["P0"], at: [pts[0]!.x, pts[0]!.y] },
      ...[0, 1, 2, 3].map((i) => ({ id: `len${i}`, kind: "length" as const, parts: [`L${i}`], value: d(i, i + 1) })),
      { id: "ang", kind: "angle", parts: ["L0", "L1"], value: 40 + n },
    ];
    const S: System = { points: pts, lines, circles: [], constraints: cs };
    if (!solve(S).verdict.ok) continue; // (the angle may not suit this drawing: only satisfiable ones)
    const wrong: Constraint = { id: "wrong", kind: "distance", parts: ["P0", "P2"], value: d(0, 1) + d(1, 2) + 5 }; // farther than the two sides reach
    tried++;
    const r = solve({ ...S, constraints: [...cs, wrong] });
    if (!r.verdict.ok && r.verdict.kind === "over") found++;
    else continue;
    if (r.verdict.conflict.includes("wrong")) contains++;
    if (
      r.verdict.conflict.every(
        (id) =>
          solve({ ...S, constraints: [...cs, wrong].filter((c) => r.verdict.conflict.includes(c.id) && c.id !== id) })
            .verdict.ok,
      )
    )
      irreducible++;
  }
  check(
    `the conflict is found (${found} of ${tried}), names the wrong constraint (${contains}), and leaving any one of the set out lets the rest hold (${irreducible})`,
    tried > 5 && found === tried && contains === found && irreducible === found,
  );
}
console.log(
  "7. the freedom counted equals the freedom found by moving: solve from many starts a hair apart and take the rank of where they end (first-order: the curvature of the sizes is below the threshold)",
);
{
  const rank = (rows: number[][]): number => {
    const M = rows.map((r) => [...r]);
    let r = 0;
    for (let c = 0; c < (M[0]?.length ?? 0) && r < M.length; c++) {
      let b = r;
      for (let i = r; i < M.length; i++) if (Math.abs(M[i]![c]!) > Math.abs(M[b]![c]!)) b = i;
      if (Math.abs(M[b]![c]!) < 2e-5) continue;
      [M[r], M[b]] = [M[b]!, M[r]!];
      for (let i = r + 1; i < M.length; i++) {
        const f = M[i]![c]! / M[r]![c]!;
        for (let j = c; j < M[0]!.length; j++) M[i]![j] = M[i]![j]! - f * M[r]![j]!;
      }
      r++;
    }
    return r;
  };
  let same = 0,
    total = 0;
  for (const [name, S] of [
    ["a rectangle with a fixed corner", rect()],
    ["a rectangle with sizes, nothing fixed", rect(dims, false)],
    [
      "a triangle and one length",
      {
        points: [pt("A", 0, 0, true), pt("B", 4, 0.2), pt("C", 2, 3)],
        lines: [{ id: "AB", a: "A", b: "B" }],
        circles: [],
        constraints: [{ id: "l", kind: "length", parts: ["AB"], value: 4 }],
      } as System,
    ],
  ] as const) {
    const base = solve(S),
      ends: number[][] = [];
    for (let t = 0; t < 14; t++) {
      const q = solve({
        ...S,
        points: S.points.map((o) =>
          o.fixed ? o : { ...o, x: o.x + (rnd() - 0.5) * 2e-4, y: o.y + (rnd() - 0.5) * 2e-4 },
        ),
      });
      ends.push(S.points.flatMap((p) => [...q.solution.points[p.id]!]));
    }
    const diffs = ends.slice(1).map((e) => e.map((v, i) => v - ends[0]![i]!)),
      moved = rank(diffs);
    total++;
    if (moved === base.verdict.freedom) same++;
    console.log(`   ${name}: counted ${base.verdict.freedom}, found by moving ${moved}`);
  }
  check("the same number both ways", same === total);
}
console.log("8. how long a solve takes (the budget of a drag step is to settle, E58)");
{
  const chain = (n: number, wrong: boolean): System => {
    const pts = Array.from({ length: n }, (_, i) => ({
        id: `P${i}`,
        x: i * 5 + (i % 3) * 0.2,
        y: (i % 2) * 3 + 0.1 * (i % 5),
      })),
      lines = Array.from({ length: n - 1 }, (_, i) => ({ id: `L${i}`, a: `P${i}`, b: `P${i + 1}` }));
    const cs: Constraint[] = [
      { id: "fix", kind: "fixed", parts: ["P0"], at: [0, 0] },
      ...lines.map((l, i) => ({ id: `len${i}`, kind: "length" as const, parts: [l.id], value: 5.5 })),
      ...lines
        .filter((_, i) => i % 2 === 1)
        .map((l) => ({ id: `hz${l.id}`, kind: "horizontal" as const, parts: [l.id] })),
    ];
    if (wrong) cs.push({ id: "wrong", kind: "distance", parts: ["P0", `P${n - 1}`], value: 5.5 * (n - 1) + 10 }); // farther than the chain can reach
    return { points: pts, lines, circles: [], constraints: cs };
  };
  for (const n of [20, 60, 120]) {
    const S = chain(n, false),
      t0 = performance.now(),
      r = solve(S),
      t1 = performance.now();
    const drag = solve(
        {
          ...S,
          points: S.points.map((p) => ({ ...p, x: r.solution.points[p.id]![0], y: r.solution.points[p.id]![1] })),
        },
        { pins: { [`P${n >> 1}`]: [r.solution.points[`P${n >> 1}`]![0], r.solution.points[`P${n >> 1}`]![1] + 1] } },
      ),
      t2 = performance.now();
    console.log(
      `   ${n} points, ${S.constraints.length} constraints: a full solve ${(t1 - t0).toFixed(0)} ms (${r.iterations} iterations, ${r.verdict.kind}); a drag step ${(t2 - t1).toFixed(0)} ms (${drag.verdict.kind})`,
    );
    check(`the chain of ${n} is solved`, r.verdict.ok);
  }
  const W = chain(40, true),
    t3 = performance.now(),
    wr = solve(W),
    t4 = performance.now();
  console.log(
    `   a wrong constraint on a chain of 40 points: the conflict (${wr.verdict.conflict.length} constraints) took ${(t4 - t3).toFixed(0)} ms`,
  );
  check(
    "the conflict names the wrong constraint",
    wr.verdict.kind === "over" && wr.verdict.conflict.includes("wrong"),
    JSON.stringify(wr.verdict.conflict.slice(0, 6)),
  );
}
console.log(failureCount() ? `\n${failureCount()} failureCount()` : "\nno failure");
process.exit(failureCount() ? 1 : 0);

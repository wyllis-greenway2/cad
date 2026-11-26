// A dev check (not a test, `in_1444`) for the placement solver of bodies (E60, `dec_body_placement`): pure data, no kernel.
//   node --experimental-strip-types dev/placement-solver-check.ts
import { type Mate, type Prim, type V3, place } from "../src/engine/placement.ts";
import { check, fail, failureCount, near } from "./lib.ts";
const plane = (p: V3, d: V3): Prim => ({ kind: "plane", p, d }),
  axis = (p: V3, d: V3): Prim => ({ kind: "axis", p, d });
const A = { id: "A", free: false, pivot: [0, 0, 0] as V3 },
  B = { id: "B", free: true, pivot: [0, 0, 20] as V3 };
const apply = (pose: { pivot: V3; axis: V3; deg: number; by: V3 } | undefined, _pivot: V3, p: V3): V3 => {
  if (!pose) return p;
  const pivot = pose.pivot;
  const t = (pose.deg * Math.PI) / 180,
    [x, y, z] = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]],
    k = pose.axis,
    c = Math.cos(t),
    s = Math.sin(t),
    d = k[0] * x + k[1] * y + k[2] * z;
  return [
    pivot[0] + x * c + (k[1] * z - k[2] * y) * s + k[0] * d * (1 - c) + pose.by[0],
    pivot[1] + y * c + (k[2] * x - k[0] * z) * s + k[1] * d * (1 - c) + pose.by[1],
    pivot[2] + z * c + (k[0] * y - k[1] * x) * s + k[2] * d * (1 - c) + pose.by[2],
  ];
};

console.log("1. flush: a face brought onto another, with a gap");
{
  const m: Mate = {
    id: "f",
    kind: "flush",
    a: { body: "B", prim: plane([0, 0, 15], [0, 0, -1]) },
    b: { body: "A", prim: plane([0, 0, 5], [0, 0, 1]) },
  };
  const r = place([A, B], [m]),
    pose = r.poses.B;
  check(
    "B's bottom face (z = 15, facing down) goes down onto A's top (z = 5): moves by -10, no turn",
    r.ok && !!pose && near(pose.by[2], -10, 1e-8) && pose.deg < 1e-7,
    JSON.stringify(pose),
  );
  check(
    "it can still slide in the plane: 2 ways, and turn about the normal: 1 way, said for B",
    r.kind === "under" && r.freedom === 3 && r.free.B === 3,
    `${r.kind} ${r.freedom} ${JSON.stringify(r.free)}`,
  );
  const g = place([A, B], [{ ...m, value: 2 }]);
  check("a gap of 2: it stops 2 above", near(g.poses.B!.by[2], -8, 1e-8), JSON.stringify(g.poses.B));
  const tilted = place(
    [A, B],
    [{ ...m, a: { body: "B", prim: plane([0, 0, 15], [Math.sin(0.3), 0, -Math.cos(0.3)]) } }],
  );
  const tp = apply(tilted.poses.B, B.pivot, [0, 0, 15]);
  check(
    "a face tilted 0.3 rad is turned flat first, and lands on the plane",
    tilted.ok && near(tp[2], 5, 1e-6),
    tp.join(),
  );
}
console.log("2. coaxial: a pin into a hole");
{
  const m: Mate = {
    id: "c",
    kind: "coaxial",
    a: { body: "B", prim: axis([3, 4, 20], [0, 0, 1]) },
    b: { body: "A", prim: axis([0, 0, 0], [0, 0, 1]) },
  };
  const r = place([A, B], [m]),
    p = apply(r.poses.B, B.pivot, [3, 4, 20]);
  check(
    "B's axis through (3, 4) goes onto A's axis through the origin: its point lands at (0, 0, z)",
    r.ok && near(p[0], 0, 1e-7) && near(p[1], 0, 1e-7),
    p.join(),
  );
  check(
    "it can slide along the axis and turn about it: 2 ways left",
    r.freedom === 2 && r.kind === "under",
    `${r.kind} ${r.freedom}`,
  );
  const off = place([A, B], [{ ...m, value: 2 }]),
    q = apply(off.poses.B, B.pivot, [3, 4, 20]);
  check("an offset of 2: the axes end 2 apart", off.ok && near(Math.hypot(q[0], q[1]), 2, 1e-6), q.join());
  const both = place(
    [A, B],
    [
      m,
      {
        id: "f",
        kind: "flush",
        a: { body: "B", prim: plane([3, 4, 15], [0, 0, -1]) },
        b: { body: "A", prim: plane([0, 0, 5], [0, 0, 1]) },
      },
    ],
  );
  check(
    "a pin in a hole and its shoulder flush: it can only turn about the axis: 1 way",
    both.ok && both.freedom === 1 && both.kind !== "over",
    `${both.kind} ${both.freedom} redundant ${both.redundant}`,
  );
}
console.log("3. angle, perpendicular, parallel, axis to face");
{
  const ax = (d: V3): Mate["a"] => ({ body: "B", prim: axis([0, 0, 20], d) }),
    ref: Mate["b"] = { body: "A", prim: axis([0, 0, 0], [0, 0, 1]) };
  const turned = (m: Mate) => {
    const r = place([A, B], [m]);
    const d = apply({ ...r.poses.B!, pivot: [0, 0, 0], by: [0, 0, 0] }, B.pivot, m.a.prim.d as V3);
    return { r, d: [d[0], d[1], d[2]] };
  };
  const ang = turned({ id: "a", kind: "angle", a: ax([1, 0, 0]), b: ref, value: 120 });
  check(
    "angle 120 between the axis directions",
    ang.r.ok && near(ang.d[2], Math.cos((120 * Math.PI) / 180), 1e-6),
    ang.d.join(),
  );
  const perp = turned({ id: "p", kind: "perpendicular", a: ax([0.6, 0, 0.8]), b: ref });
  check(
    "perpendicular: the direction ends square to the reference",
    perp.r.ok && near(perp.d[2], 0, 1e-6),
    perp.d.join(),
  );
  const par = turned({ id: "q", kind: "parallel", a: ax([0.6, 0, 0.8]), b: ref });
  check("parallel: along z, either way", par.r.ok && near(Math.abs(par.d[2]), 1, 1e-6), par.d.join());
  const a2f = turned({
    id: "z",
    kind: "axisToFace",
    a: ax([1, 0, 0]),
    b: { body: "A", prim: plane([0, 0, 5], [0, 0, 1]) },
  });
  check(
    "axis to face: the axis ends along the face's normal",
    a2f.r.ok && near(Math.abs(a2f.d[2]), 1, 1e-6),
    a2f.d.join(),
  );
}
console.log("4. conflicts are refused and named, never ranked");
{
  const top = plane([0, 0, 5], [0, 0, 1]),
    bot = (z: number) => plane([0, 0, z], [0, 0, -1]);
  const r = place(
    [A, B],
    [
      { id: "f1", kind: "flush", a: { body: "B", prim: bot(15) }, b: { body: "A", prim: top }, value: 0 },
      { id: "f2", kind: "flush", a: { body: "B", prim: bot(15) }, b: { body: "A", prim: top }, value: 3 },
    ],
  );
  check(
    "two flush mates with different gaps: refused, both named, in words",
    !r.ok && r.kind === "over" && r.conflict.sort().join() === "f1,f2" && /cannot all hold/.test(r.reason),
    `${r.kind} ${r.conflict} ${r.reason}`,
  );
  const dup = place(
    [A, B],
    [
      { id: "x", kind: "flush", a: { body: "B", prim: bot(15) }, b: { body: "A", prim: top } },
      { id: "x", kind: "parallel", a: { body: "B", prim: bot(15) }, b: { body: "A", prim: top } },
    ],
  );
  check("two mates with one name", /two mates are called x/.test(dup.reason));
  const wrong = place(
    [A, B],
    [{ id: "w", kind: "coaxial", a: { body: "B", prim: bot(15) }, b: { body: "A", prim: top } }],
  );
  check("a mate of the wrong kind of face is said", !wrong.ok && /coaxial needs axis/.test(wrong.reason), wrong.reason);
  const same = place(
    [A, B],
    [{ id: "s", kind: "flush", a: { body: "B", prim: bot(15) }, b: { body: "B", prim: top } }],
  );
  check("a mate inside one body is said", /joins two bodies/.test(same.reason), same.reason);
  const redundant = place(
    [A, B],
    [
      { id: "f", kind: "flush", a: { body: "B", prim: bot(15) }, b: { body: "A", prim: top } },
      { id: "p", kind: "parallel", a: { body: "B", prim: bot(15) }, b: { body: "A", prim: top } },
    ],
  );
  check(
    "a parallel beside a flush adds nothing: said as redundant, and it holds",
    redundant.ok && redundant.kind === "redundant" && redundant.redundant.includes("p"),
    `${redundant.kind} ${redundant.redundant}`,
  );
}
console.log("5. two free bodies in a chain, solved together; and a far start");
{
  const C = { id: "C", free: true, pivot: [40, 0, 0] as V3 },
    top = plane([0, 0, 5], [0, 0, 1]);
  const r = place(
    [A, { ...B }, C],
    [
      { id: "f", kind: "flush", a: { body: "B", prim: plane([0, 0, 15], [0, 0, -1]) }, b: { body: "A", prim: top } },
      {
        id: "g",
        kind: "flush",
        a: { body: "C", prim: plane([40, 0, 0], [-1, 0, 0]) },
        b: { body: "B", prim: plane([10, 0, 20], [1, 0, 0]) },
      },
    ],
  );
  check(
    "B onto A, C onto B's side: both placed in one solve",
    r.ok && !!r.poses.B && !!r.poses.C,
    `${r.ok} ${r.reason}`,
  );
  const cx = apply(r.poses.C, C.pivot, [40, 0, 0]),
    bx = apply(r.poses.B, B.pivot, [10, 0, 20]);
  check("C's face ends on B's moved face", Math.abs(cx[0] - bx[0]) < 1e-6, `${cx[0]} ${bx[0]}`);
  const upside = place(
    [A, B],
    [{ id: "f", kind: "flush", a: { body: "B", prim: plane([0, 0, 15], [0, 0, 1]) }, b: { body: "A", prim: top } }],
  );
  check(
    "a face that faces the wrong way is turned half round (a far start) and placed",
    upside.ok && upside.poses.B !== undefined && near(upside.poses.B.deg, 180, 1e-4),
    `${upside.ok} ${upside.poses.B?.deg}`,
  );
  const free = place([A, B], []);
  check(
    "no mates: nothing moves and B is free in six ways",
    free.ok && Object.keys(free.poses).length === 0 && free.free.B === 6,
    JSON.stringify(free.free),
  );
}
console.log("6. random: a body placed by random flush, coaxial and angle mates lands where the mates say");
{
  let seed = 9;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let bad = 0,
    n = 0;
  for (let k = 0; k < 40; k++) {
    const nrm = (): V3 => {
        const v = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5],
          l = Math.hypot(...v) || 1;
        return [v[0]! / l, v[1]! / l, v[2]! / l];
      },
      p: V3 = [rnd() * 10, rnd() * 10, rnd() * 10],
      q: V3 = [rnd() * 10, rnd() * 10, rnd() * 10],
      dB = nrm(),
      dA = nrm(),
      gap = rnd() * 4;
    const m: Mate = {
      id: "f",
      kind: "flush",
      a: { body: "B", prim: plane(p, dB) },
      b: { body: "A", prim: plane(q, dA) },
      value: gap,
    };
    const r = place([A, { ...B, pivot: p }], [m]);
    n++;
    if (!r.ok) {
      bad++;
      continue;
    }
    const np = apply(r.poses.B, p, p),
      nd = apply({ ...r.poses.B!, pivot: [0, 0, 0], by: [0, 0, 0] }, [0, 0, 0], dB),
      dist = (np[0] - q[0]) * dA[0] + (np[1] - q[1]) * dA[1] + (np[2] - q[2]) * dA[2];
    if (Math.abs(dist - gap) > 1e-6 || Math.hypot(nd[0] + dA[0], nd[1] + dA[1], nd[2] + dA[2]) > 1e-6) bad++;
  }
  check(`${n} random flush mates: the face ends opposite the other and ${"`gap`"} away`, bad === 0, `${bad} wrong`);
}
console.log(failureCount() ? `\n${failureCount()} failure(s)` : "\nno failure");
process.exit(failureCount() ? 1 : 0);

// Placement of bodies (E60, `dec_body_placement`): the poses of bodies that mates between their faces say. The same machinery as the sketch's solver (forward-mode differentiation, damped Levenberg-Marquardt
// from where the bodies are now so they move as little as they can, the verdict, the freedom count, conflicts narrowed by QuickXplain, `solver.ts`'s `kit`); the parts are the 3D primitives of faces (a plane: a point and
// its outward normal; an axis: a point and a direction) and the unknowns are each free body's pose: a move (3) and a turn (3, the Cayley form: exact for every angle short of a half turn, no square root, so it
// differentiates cleanly). Pure and deterministic: no kernel, no clock. The answer is a pose for each body that moved; the `place` step applies them.
import { kit, type AD, type Prep } from "./solver.ts";

const { D, add, sub, mul, div, scaleD, sqrtD, atan2D, clampRes, levenberg, narrow, analyse } = kit;
export type V3 = readonly [number, number, number];
/** a face as a part: a plane (a point on it, its outward normal) or an axis (a point on it, its direction) */
export interface Prim {
  kind: "plane" | "axis";
  p: V3;
  d: V3;
  /** the middle of the face (for a distance along a direction); the point `p` when not given */ c?: V3;
}
export type MateKind = "flush" | "coaxial" | "parallel" | "perpendicular" | "angle" | "axisToFace" | "turn" | "slide";
/** `a` is the part that moves when one must (the first named, as in a sketch); `b` is what it is placed against */
export interface Mate {
  id: string;
  kind: MateKind;
  a: { body: string; prim: Prim };
  b: { body: string; prim: Prim };
  /** flush: the gap (mm, positive is apart along b's normal); coaxial: the distance between the axes; angle: degrees 0 to 180; turn: how far a's direction is turned from b's, signed, about `about`, degrees (right-handed); slide: the signed distance from b's middle to a's along `about`, mm */ value?: number;
  /** a range instead of a number (`in_1527`): for flush, coaxial, turn and slide; the number may be anywhere from `min` to `max` (one alone is at least / at most) */ min?: number;
  max?: number;
  /** turn and slide: the direction they are measured about / along (a plane's normal or an axis), carried by the pose of its body */ about?: {
    body: string;
    prim: Prim;
  };
}
export interface BodyIn {
  id: string;
  free: boolean;
  /** the point the body turns about (its middle) */ pivot: V3;
}
export interface Pose {
  /** the turn, about this point (a point of the first mated face of the body: turning about it keeps the solve well conditioned) */ pivot: V3;
  axis: V3;
  deg: number;
  /** then the move */ by: V3;
}
export interface PlaceResult {
  ok: boolean;
  kind: "solved" | "under" | "redundant" | "over";
  poses: Record<string, Pose>;
  /** how many ways the placement can still change, and for each body that can, how many */ freedom: number;
  free: Record<string, number>;
  redundant: string[];
  /** ranges holding the answer at one of their ends (the stops, E85) */ atStop: string[];
  conflict: string[];
  reason: string;
  iterations: number;
}
export const MATE_NEEDS: Record<
  MateKind,
  { a: ("plane" | "axis")[]; b: ("plane" | "axis")[]; value: "none" | "gap" | "offset" | "angle" | "turn" | "slide" }
> = {
  flush: { a: ["plane"], b: ["plane"], value: "gap" },
  coaxial: { a: ["axis"], b: ["axis"], value: "offset" },
  parallel: { a: ["plane", "axis"], b: ["plane", "axis"], value: "none" },
  perpendicular: { a: ["plane", "axis"], b: ["plane", "axis"], value: "none" },
  angle: { a: ["plane", "axis"], b: ["plane", "axis"], value: "angle" },
  axisToFace: { a: ["axis"], b: ["plane"], value: "none" },
  turn: { a: ["plane", "axis"], b: ["plane", "axis"], value: "turn" },
  slide: { a: ["plane", "axis"], b: ["plane", "axis"], value: "slide" },
};
/** a mate that cannot be read (a part of the wrong kind) is said in words */
export function validateMate(m: Mate): string | null {
  const n = MATE_NEEDS[m.kind];
  if (!n) return `there is no mate called ${String(m.kind)}`;
  if (!n.a.includes(m.a.prim.kind))
    return `${m.kind} needs ${n.a.join(" or ")} for the first part, not ${m.a.prim.kind === "plane" ? "a flat face" : "a round face"}`;
  if (!n.b.includes(m.b.prim.kind))
    return `${m.kind} needs ${n.b.join(" or ")} for the second part, not ${m.b.prim.kind === "plane" ? "a flat face" : "a round face"}`;
  if (m.a.body === m.b.body) return `${m.kind} joins two bodies; both parts are in ${m.a.body}`;
  const ranged = m.min !== undefined || m.max !== undefined;
  if (ranged && !["flush", "coaxial", "turn", "slide"].includes(m.kind))
    return `${m.kind} measures no number that can have a range (flush, coaxial, turn and slide do)`;
  if (ranged && m.min !== undefined && m.max !== undefined && m.min > m.max)
    return `the least (${m.min}) is above the most (${m.max})`;
  if (ranged && m.value !== undefined) return "a mate has a number or a range, not both";
  if (m.kind === "coaxial" && ranged && ((m.min !== undefined && m.min < 0) || (m.max !== undefined && m.max < 0)))
    return "a distance between axes is not below nothing";
  if ((m.kind === "turn" || m.kind === "slide") && !m.about)
    return `${m.kind} needs the direction it is measured about (a plane's normal or an axis)`;
  if (
    m.kind === "turn" &&
    ((m.value !== undefined && Math.abs(m.value) > 180) ||
      (m.min !== undefined && m.min < -180) ||
      (m.max !== undefined && m.max > 180))
  )
    return "a turn is between -180 and 180 degrees";
  if (n.value === "gap" && m.value !== undefined && !Number.isFinite(m.value)) return "the gap is not a number";
  if (n.value === "angle" && !(m.value !== undefined && m.value >= 0 && m.value <= 180))
    return "an angle is between 0 and 180 degrees";
  if (n.value === "offset" && m.value !== undefined && !(m.value >= 0))
    return "the distance between axes is not below nothing";
  return null;
}

type A3 = { x: AD; y: AD; z: AD };
const c3 = (v: V3): A3 => ({ x: new D(v[0]), y: new D(v[1]), z: new D(v[2]) });
const sub3 = (a: A3, b: A3): A3 => ({ x: sub(a.x, b.x), y: sub(a.y, b.y), z: sub(a.z, b.z) }),
  add3 = (a: A3, b: A3): A3 => ({ x: add(a.x, b.x), y: add(a.y, b.y), z: add(a.z, b.z) });
const dot3 = (a: A3, b: A3) => add(add(mul(a.x, b.x), mul(a.y, b.y)), mul(a.z, b.z));
const cross3 = (a: A3, b: A3): A3 => ({
  x: sub(mul(a.y, b.z), mul(a.z, b.y)),
  y: sub(mul(a.z, b.x), mul(a.x, b.z)),
  z: sub(mul(a.x, b.y), mul(a.y, b.x)),
});
const scale3 = (a: A3, s: AD): A3 => ({ x: mul(a.x, s), y: mul(a.y, s), z: mul(a.z, s) });
/** a vector turned by the Cayley rotation of w: v + 2 (w x v + w x (w x v)) / (1 + w.w) */
const rotate = (w: A3, v: A3): A3 => {
  const wv = cross3(w, v),
    wwv = cross3(w, wv),
    s = add(new D(1), dot3(w, w));
  return add3(v, scale3(add3(wv, wwv), div(new D(2), s)));
};

/** the placement that the mates say: bodies that are `free` move, the others stay; `scale` is about how big the model is (for the tolerance) */
export function place(
  bodiesGiven: readonly BodyIn[],
  mates: readonly Mate[],
  opts: { restarts?: number; maxSolves?: number } = {},
): PlaceResult {
  let bodies: readonly BodyIn[] = bodiesGiven;
  const empty: PlaceResult = {
    ok: false,
    kind: "over",
    poses: {},
    freedom: 0,
    free: {},
    redundant: [],
    atStop: [],
    conflict: [],
    reason: "",
    iterations: 0,
  };
  const ids = mates.map((m) => m.id),
    dupe = ids.find((x, i) => ids.indexOf(x) !== i);
  if (dupe) return { ...empty, reason: `two mates are called ${dupe}` };
  for (const m of mates) {
    const bad = validateMate(m);
    if (bad) return { ...empty, reason: `${m.id}: ${bad}`, conflict: [m.id] };
    for (const b of [m.a.body, m.b.body, ...(m.about ? [m.about.body] : [])])
      if (!bodies.some((x) => x.id === b))
        return { ...empty, reason: `${m.id}: there is no body ${b}`, conflict: [m.id] };
  }
  // each body turns about a point of the first face of it that a mate names (rotation about the mated axis or face then costs no move to put right)
  const bodiesIn = bodies;
  bodies = bodiesIn.map((b) => {
    const m = mates.find((q) => q.a.body === b.id) ?? mates.find((q) => q.b.body === b.id),
      pr = m ? (m.a.body === b.id ? m.a.prim : m.b.prim) : null;
    return pr ? { ...b, pivot: pr.p } : b;
  });
  const at = new Map(bodies.map((b, i) => [b.id, i])),
    n = bodies.length * 6;
  const frozen = bodies.flatMap((b) => new Array<boolean>(6).fill(!b.free)),
    x0 = new Array<number>(n).fill(0);
  const extent = Math.max(
      1,
      ...mates.flatMap((m) => [...m.a.prim.p, ...m.b.prim.p, ...bodies.flatMap((b) => [...b.pivot])]).map(Math.abs),
    ),
    scale = extent;
  // a half turn is out of reach of the Cayley form (it is a turn of infinite w), so a start may begin with a body already turned half round about an axis: the solve is Cayley after that
  type M3 = number[][];
  const I3: M3 = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    half = (ax: number): M3 => I3.map((row, r) => row.map((_, c) => (r === c ? (r === ax ? 1 : -1) : 0)));
  const pre = new Map<string, M3>();
  const turn0 = (body: string, v: A3): A3 => {
    const R = pre.get(body);
    if (!R) return v;
    const f = (r: number) => add(add(scaleD(v.x, R[r]![0]!), scaleD(v.y, R[r]![1]!)), scaleD(v.z, R[r]![2]!));
    return { x: f(0), y: f(1), z: f(2) };
  };
  const pose = (xs: number[], body: string) => {
    const i = at.get(body)! * 6,
      v = (j: number) => (frozen[j] ? new D(xs[j]!) : new D(xs[j]!, new Map([[j, 1]])));
    return {
      t: { x: v(i), y: v(i + 1), z: v(i + 2) } as A3,
      w: { x: v(i + 3), y: v(i + 4), z: v(i + 5) } as A3,
      c: c3(bodies[at.get(body)!]!.pivot),
    };
  };
  const point = (xs: number[], body: string, p: V3): A3 => {
    const q = pose(xs, body);
    return add3(add3(q.c, rotate(q.w, turn0(body, sub3(c3(p), q.c)))), q.t);
  };
  const dir = (xs: number[], body: string, d: V3): A3 => rotate(pose(xs, body).w, turn0(body, c3(d)));
  const rowsOf =
    (m: Mate) =>
    (xs: number[]): AD[] => {
      const pa = point(xs, m.a.body, m.a.prim.p),
        da = dir(xs, m.a.body, m.a.prim.d),
        pb = point(xs, m.b.body, m.b.prim.p),
        db = dir(xs, m.b.body, m.b.prim.d),
        v = m.value ?? 0,
        apart = sub3(pa, pb);
      const ranged = m.min !== undefined || m.max !== undefined,
        hold = (x: AD, lo?: number, hi?: number, scale = 1) =>
          ranged
            ? clampRes(x, lo !== undefined ? lo * scale : undefined, hi !== undefined ? hi * scale : undefined)
            : sub(x, new D(v * scale));
      switch (m.kind) {
        case "flush":
          return [add(da.x, db.x), add(da.y, db.y), add(da.z, db.z), hold(dot3(db, apart), m.min, m.max)];
        case "coaxial": {
          const c = cross3(da, db),
            off = cross3(db, apart);
          return ranged || v > 0
            ? [c.x, c.y, c.z, hold(sqrtD(dot3(off, off)), m.min, m.max)]
            : [c.x, c.y, c.z, off.x, off.y, off.z];
        }
        case "parallel":
        case "axisToFace": {
          const c = cross3(da, db);
          return [c.x, c.y, c.z];
        }
        case "perpendicular":
          return [dot3(da, db)];
        case "angle":
          return [sub(dot3(da, db), new D(Math.cos((v * Math.PI) / 180)))];
        case "turn": {
          // how far a's direction is turned from b's about `about`; held to a number (the difference wrapped to -180..180) or to a range
          const u = dir(xs, m.about!.body, m.about!.prim.d),
            th = atan2D(dot3(u, cross3(db, da)), dot3(db, da)),
            rad = Math.PI / 180;
          if (ranged)
            return [
              clampRes(
                th,
                m.min !== undefined ? m.min * rad : undefined,
                m.max !== undefined ? m.max * rad : undefined,
              ),
            ];
          const d = sub(th, new D(v * rad));
          if (d.v > Math.PI) d.v -= 2 * Math.PI;
          else if (d.v < -Math.PI) d.v += 2 * Math.PI;
          return [d];
        }
        case "slide": {
          const u = dir(xs, m.about!.body, m.about!.prim.d),
            ca = point(xs, m.a.body, m.a.prim.c ?? m.a.prim.p),
            cb = point(xs, m.b.body, m.b.prim.c ?? m.b.prim.p);
          return [hold(dot3(u, sub3(ca, cb)), m.min, m.max)];
        }
      }
    };
  /** the number a ranged mate measures at a state (degrees for a turn) */
  const measured = (m: Mate, xs: number[]): number | null => {
    const pa = point(xs, m.a.body, m.a.prim.p),
      da = dir(xs, m.a.body, m.a.prim.d),
      pb = point(xs, m.b.body, m.b.prim.p),
      db = dir(xs, m.b.body, m.b.prim.d),
      apart = sub3(pa, pb);
    if (m.kind === "flush") return dot3(db, apart).v;
    if (m.kind === "coaxial") {
      const off = cross3(db, apart);
      return Math.sqrt(dot3(off, off).v);
    }
    if (m.kind === "turn") {
      const u = dir(xs, m.about!.body, m.about!.prim.d);
      return (atan2D(dot3(u, cross3(db, da)), dot3(db, da)).v * 180) / Math.PI;
    }
    if (m.kind === "slide") {
      const u = dir(xs, m.about!.body, m.about!.prim.d),
        ca = point(xs, m.a.body, m.a.prim.c ?? m.a.prim.p),
        cb = point(xs, m.b.body, m.b.prim.c ?? m.b.prim.p);
      return dot3(u, sub3(ca, cb)).v;
    }
    return null;
  };
  const rows = mates.map((m) => ({ c: { id: m.id, kind: m.kind as never, parts: [] as string[] }, fn: rowsOf(m) }));
  const names = bodies.flatMap((_, i) => ["tx", "ty", "tz", "wx", "wy", "wz"].map((s) => `${i}.${s}`)); // a body is named by its place in the list: its own id may hold dots
  const prep: Prep = { names, x: x0, frozen, pointVar: new Map(), circleVar: new Map(), rows, pins: [] };
  const dummy = { points: [], lines: [], circles: [], constraints: [] };
  const seeds: { x: number[]; pre?: [string, number] }[] = [{ x: x0 }];
  for (const [i, bi] of bodies.entries())
    if (bi.free)
      for (const ax of [0, 1, 2])
        for (const s of [1, -1, 0.4, -0.4]) {
          const x = [...x0];
          x[i * 6 + 3 + ax] = s;
          seeds.push({ x });
        }
  for (const bi of bodies) if (bi.free) for (const ax of [0, 1, 2]) seeds.push({ x: x0, pre: [bi.id, ax] });
  let usedPre: Map<string, M3> = new Map();
  const feasible = (use: Set<string>, restarts: number, all = false) => {
    let last = null as ReturnType<typeof levenberg> | null;
    for (const sd of all ? seeds : seeds.slice(0, restarts + 1)) {
      pre.clear();
      if (sd.pre) pre.set(sd.pre[0], half(sd.pre[1]));
      const a = levenberg(dummy as never, prep, use, sd.x, scale, false, 300);
      last = a;
      if (a.converged) {
        usedPre = new Map(pre);
        return { ok: true, a };
      }
    }
    pre.clear();
    return { ok: false, a: last! };
  };
  const all = new Set(ids),
    f = feasible(all, 0, true);
  pre.clear();
  for (const [k, v] of usedPre) pre.set(k, v);
  if (!f.ok) {
    const nar = narrow([...ids], (set) => feasible(new Set(set), 0, true).ok, opts.maxSolves ?? 60);
    return {
      ...empty,
      conflict: nar.set,
      reason: `these mates cannot all hold${nar.exceeded ? " (not narrowed: too many)" : ""}`,
      iterations: f.a.iterations,
    };
  }
  // what is left free and what adds nothing: the sketch solver's own analysis; the row of a range takes no freedom (E85)
  const x = f.a.x,
    free = frozen.map((fz, i) => (fz ? -1 : i)).filter((i) => i >= 0),
    byId = new Map(mates.map((m) => [m.id, m] as const));
  const rangeRow = (id: string, k: number) => {
    const m = byId.get(id)!;
    return (m.min !== undefined || m.max !== undefined) && (m.kind === "turn" || m.kind === "slide" ? true : k === 3);
  };
  const an = analyse(prep, x, ids, free, (q) => bodies[Number(names[q]!.split(".")[0])]!.id, rangeRow),
    freeBy: Record<string, number> = Object.fromEntries(an.freeBy);
  const partial = new Set(
    an.implied.filter((id) => {
      const m = byId.get(id)!;
      return !((m.kind === "turn" || m.kind === "slide") && (m.min !== undefined || m.max !== undefined));
    }),
  ); // a mate that adds nothing the ones before it do not say (a mate that is only a range says nothing and is no fault)
  // a free body no mate holds at all is free in all six ways
  const held = new Set(mates.map((m) => m.a.body));
  for (const b of bodies) if (b.free && !held.has(b.id)) freeBy[b.id] = 6;
  const poses: Record<string, Pose> = {};
  for (const b of bodies) {
    if (!b.free) continue;
    const i = at.get(b.id)! * 6,
      w: V3 = [x[i + 3]!, x[i + 4]!, x[i + 5]!],
      by: V3 = [x[i]!, x[i + 1]!, x[i + 2]!];
    // the rotation: Cayley(w) after the half turn the start began with
    const s2 = 1 + w[0] * w[0] + w[1] * w[1] + w[2] * w[2],
      K: number[][] = [
        [0, -w[2], w[1]],
        [w[2], 0, -w[0]],
        [-w[1], w[0], 0],
      ],
      K2 = K.map((r) => [0, 1, 2].map((c) => r[0]! * K[0]![c]! + r[1]! * K[1]![c]! + r[2]! * K[2]![c]!));
    const C = I3.map((r, a) => r.map((v0, c) => v0 + (2 * (K[a]![c]! + K2[a]![c]!)) / s2)),
      P = usedPre.get(b.id) ?? I3,
      R = C.map((r) => [0, 1, 2].map((c) => r[0]! * P[0]![c]! + r[1]! * P[1]![c]! + r[2]! * P[2]![c]!));
    const tr = R[0]![0]! + R[1]![1]! + R[2]![2]!,
      cosT = Math.max(-1, Math.min(1, (tr - 1) / 2)),
      th = Math.acos(cosT);
    if (th < 1e-9 && Math.hypot(...by) < 1e-9 * scale) continue;
    let ax: V3 = [0, 0, 1];
    if (th > 1e-9 && Math.PI - th > 1e-6) {
      const a = [R[2]![1]! - R[1]![2]!, R[0]![2]! - R[2]![0]!, R[1]![0]! - R[0]![1]!],
        l = Math.hypot(...a);
      ax = [a[0]! / l, a[1]! / l, a[2]! / l];
    } else if (th >= 1e-9) {
      const d = [
          Math.sqrt(Math.max(0, (R[0]![0]! + 1) / 2)),
          Math.sqrt(Math.max(0, (R[1]![1]! + 1) / 2)),
          Math.sqrt(Math.max(0, (R[2]![2]! + 1) / 2)),
        ],
        j = d.indexOf(Math.max(...d));
      const sg = [
        Math.sign(R[j]![0]! + R[0]![j]!) || 1,
        Math.sign(R[j]![1]! + R[1]![j]!) || 1,
        Math.sign(R[j]![2]! + R[2]![j]!) || 1,
      ];
      ax = [d[0]! * (j === 0 ? 1 : sg[0]!), d[1]! * (j === 1 ? 1 : sg[1]!), d[2]! * (j === 2 ? 1 : sg[2]!)];
      const l = Math.hypot(...ax);
      ax = [ax[0] / l, ax[1] / l, ax[2] / l];
    }
    poses[b.id] = { pivot: b.pivot, axis: ax, deg: (th * 180) / Math.PI, by };
  }
  const freedom = an.freedom,
    atStop = mates
      .filter((m) => m.min !== undefined || m.max !== undefined)
      .filter((m) => {
        const v = measured(m, x);
        return (
          v !== null &&
          ((m.min !== undefined && Math.abs(v - m.min) < 1e-6 * Math.max(1, Math.abs(m.min))) ||
            (m.max !== undefined && Math.abs(v - m.max) < 1e-6 * Math.max(1, Math.abs(m.max))))
        );
      })
      .map((m) => m.id);
  return {
    ok: true,
    kind: partial.size ? "redundant" : freedom > 0 ? "under" : "solved",
    poses,
    freedom,
    free: freeBy,
    redundant: ids.filter((q) => partial.has(q)),
    atStop,
    conflict: [],
    reason: "",
    iterations: f.a.iterations,
  };
}

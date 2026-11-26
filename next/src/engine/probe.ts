// One question for every case (`q_motion_probe_domain`, `in_1627`): for some parts that can move by a few numbers (a MOTION), which relations of the table fit them, would the solver accept them, and are they within reach of holding, and
// at what numbers do they hold? The parts at rest (adjusted a little), a part dragged (moved by an offset), a corner of several lines, a circle's radius are all motions; what differs is only the reach. Pure: a system in, answers out; no screen.
import { kindTuples, offerable, standingOf, type PartKind } from "./relations.ts";
import { RELATIONS, residualsOf, type Constraint, type Relation, type System } from "./solver.ts";

/** how a few numbers `q` (an offset from where things are) move parts of a system: `at(q)` is the system with them moved; `affected` are the parts they move (points) and what is made of them (a line with an end moved, a circle with its centre or radius moved) */
export interface Motion {
  dim: number;
  at(q: readonly number[]): System;
  affected: ReadonlySet<string>;
}
/** what is made of the parts that move: a line has its ends, a circle its centre (an arc's ends are its own points) */
export function affectedBy(S: System, moved: readonly string[], radii: readonly string[] = []): Set<string> {
  const out = new Set([...moved, ...radii]);
  for (const l of S.lines) if (out.has(l.a) || out.has(l.b)) out.add(l.id);
  for (const c of S.circles) if (out.has(c.c) || (c.ends ?? []).some((e) => out.has(e))) out.add(c.id);
  return out;
}
const shifted = (S: System, d: Map<string, [number, number]>, radii: Map<string, number> = new Map()): System => ({
  ...S,
  points: S.points.map((p) => {
    const m = d.get(p.id);
    return m ? { ...p, x: p.x + m[0], y: p.y + m[1] } : p;
  }),
  circles: radii.size ? S.circles.map((c) => (radii.has(c.id) ? { ...c, r: c.r + radii.get(c.id)! } : c)) : S.circles,
});
/** these points and radii each free to move by numbers of their own (two for a point, one for a radius): the parts at rest, a little adjusted */
export function adjusting(S: System, points: readonly string[], radii: readonly string[] = []): Motion {
  return {
    dim: 2 * points.length + radii.length,
    affected: affectedBy(S, points, radii),
    at: (q) =>
      shifted(
        S,
        new Map(points.map((id, i) => [id, [q[2 * i]!, q[2 * i + 1]!] as [number, number]])),
        new Map(radii.map((id, i) => [id, q[2 * points.length + i]!])),
      ),
  };
}
/** these points moved together by one offset (two numbers): a part dragged */
export function translating(S: System, points: readonly string[]): Motion {
  return {
    dim: 2,
    affected: affectedBy(S, points),
    at: (q) => shifted(S, new Map(points.map((id) => [id, [q[0]!, q[1]!] as [number, number]]))),
  };
}

/** a circle's or an arc's edge: the place `q` is a point of the edge, the radius is its distance from the centre, and the arc's ends go out along their own lines to it (a radius motion: one number worth, read in a place) */
export function radiating(S: System, circle: string): Motion {
  const k = S.circles.find((c) => c.id === circle)!,
    centre = S.points.find((p) => p.id === k.c)!,
    ends: readonly string[] = k.ends ?? [];
  return {
    dim: 2,
    affected: affectedBy(S, ends, [circle]),
    at: (q) => {
      const r = Math.hypot(q[0]! - centre.x, q[1]! - centre.y) || 1e-9;
      return {
        ...S,
        circles: S.circles.map((c) => (c.id === circle ? { ...c, r } : c)),
        points: S.points.map((p) => {
          if (!ends.includes(p.id)) return p;
          const d = Math.hypot(p.x - centre.x, p.y - centre.y) || 1;
          return { ...p, x: centre.x + ((p.x - centre.x) / d) * r, y: centre.y + ((p.y - centre.y) / d) * r };
        }),
      };
    },
  };
}

export interface Cand {
  relation: Relation;
  parts: string[];
  variant?: Partial<Constraint>;
  /** the place of its relation in the table (the order a tie is broken by) */
  order: number;
}
/** the ways the parts of a system can be named for the relations that are helpers (the table says which): each names at least one affected part (else it says nothing about the motion), and all of `must` when given; each once whichever way round it is read */
export function candidatesFor(
  S: System,
  affected: ReadonlySet<string>,
  must: readonly string[] = [],
  arity?: number,
  /** parts that are not tried (the point a line being drawn starts from: it is covered by the line itself) */ exclude: readonly string[] = [],
): Cand[] {
  const pool: Record<PartKind, string[]> = {
      point: S.points.map((p) => p.id).filter((id) => !exclude.includes(id)),
      line: S.lines.map((l) => l.id),
      circle: S.circles.map((c) => c.id),
    },
    hit: Record<PartKind, string[]> = {
      point: pool.point.filter((id) => affected.has(id)),
      line: pool.line.filter((id) => affected.has(id)),
      circle: pool.circle.filter((id) => affected.has(id)),
    };
  const out: Cand[] = [],
    seen = new Set<string>();
  let order = 0;
  for (const [name, def] of Object.entries(RELATIONS) as [Relation, (typeof RELATIONS)[Relation]][]) {
    if (!def.helper) continue;
    order++;
    for (const kinds of kindTuples(name)) {
      if (arity !== undefined && kinds.length !== arity) continue;
      for (let j = 0; j < kinds.length; j++) {
        // an affected part at place j, anything at the others (so the walk is not over every combination)
        const walk = (i: number, got: string[]) => {
          if (i === kinds.length) {
            if (!must.every((m) => got.includes(m))) return;
            for (const variant of def.helper!.variants ?? [undefined]) {
              const key = `${name}|${[...got].sort().join()}|${JSON.stringify(variant ?? {})}`;
              if (seen.has(key)) continue;
              seen.add(key);
              out.push({
                relation: name,
                parts: got,
                ...(variant && Object.keys(variant).length ? { variant } : {}),
                order,
              });
            }
            return;
          }
          for (const id of i === j ? hit[kinds[i]!] : pool[kinds[i]!]) if (!got.includes(id)) walk(i + 1, [...got, id]);
        };
        walk(0, []);
      }
    }
  }
  return out;
}
export const constraintOf = (c: Cand): Constraint =>
  ({ id: "probe", kind: c.relation, parts: c.parts, ...(c.variant ?? {}) }) as Constraint;
const norm = (v: readonly number[]) => Math.hypot(...v);
/** Newton for the numbers at which some rows (one or two) are zero, the shortest way from `q0`: the least-norm step `-J^T (J J^T)^-1 r`; null when it does not get there, or when the first step is longer than 3 times `within` */
export function landN(
  res: (q: number[]) => number[],
  q0: readonly number[],
  within: number,
  steps = 8,
): number[] | null {
  let q = [...q0];
  for (let it = 0; it < steps; it++) {
    const r = res(q);
    if (r.length === 0 || r.length > 2 || !r.every(Number.isFinite)) return null;
    if (norm(r) < 1e-9) return q;
    const h = 1e-5,
      J = q.map((_, j) => {
        const up = [...q],
          dn = [...q];
        up[j]! += h;
        dn[j]! -= h;
        const a = res(up),
          b = res(dn);
        return a.map((v, i) => (v - b[i]!) / (2 * h));
      }); // (J[j][i]: row i's change with number j)
    const m = r.length,
      A = Array.from({ length: m }, (_, i) =>
        Array.from({ length: m }, (_, k) => J.reduce((s, col) => s + col[i]! * col[k]!, 0)),
      );
    let y: number[];
    if (m === 1) {
      if (A[0]![0]! < 1e-14) return null;
      y = [-r[0]! / A[0]![0]!];
    } else {
      const det = A[0]![0]! * A[1]![1]! - A[0]![1]! * A[1]![0]!;
      if (Math.abs(det) < 1e-14) return null;
      y = [(-r[0]! * A[1]![1]! + r[1]! * A[0]![1]!) / det, (-r[1]! * A[0]![0]! + r[0]! * A[1]![0]!) / det];
    }
    const step = J.map((col) => col.reduce((s, v, i) => s + v * y[i]!, 0));
    if (it === 0 && norm(step) > 3 * within) return null;
    q = q.map((v, j) => v + step[j]!);
  }
  return norm(res(q)) < 1e-6 ? q : null;
}
export interface InRange {
  cand: Cand;
  /** the numbers at which it holds */ q: number[];
  /** how far (mm) from `q0` */ moved: number;
}
/** whether a relation says anything about the motion: one that is the same whatever the numbers are is a fact about the thing, not a hint (a radius equal to another's when a part is only moved; a point of its own line) and would win at no distance */
export function aboutMotion(res: (q: number[]) => number[], q0: readonly number[]): boolean {
  const h = 1e-4;
  return q0.some((_, j) => {
    const up = [...q0],
      dn = [...q0];
    up[j]! += h;
    dn[j]! -= h;
    const a = res(up),
      b = res(dn);
    return a.some((v, i) => Math.abs(v - b[i]!) > 1e-9);
  });
}
/** every relation among `cands` that is within reach of holding from `q0` (`pointMm` for a relation that says a point, `lineMm` for one that says a line: the Newton step is in mm whatever the unit of the row), that depends on the motion, and that the solver would add */
export function inRange(
  S: System,
  m: Motion,
  q0: readonly number[],
  cands: readonly Cand[],
  reach: { pointMm: number; lineMm: number },
): InRange[] {
  const out: InRange[] = [];
  for (const cand of cands) {
    const c = constraintOf(cand),
      res = (q: number[]) => residualsOf(m.at(q), c),
      r0 = res([...q0]);
    if (!r0.length || !r0.every(Number.isFinite) || !aboutMotion(res, q0)) continue;
    const within = r0.length === 2 ? reach.pointMm : reach.lineMm,
      q = landN(res, q0, within);
    if (!q) continue;
    const moved = norm(q.map((v, j) => v - q0[j]!));
    if (moved <= within && offerable(standingOf(m.at(q), c).state)) out.push({ cand, q, moved });
  }
  return out;
}

// The mates solved together (`in_329`, `dec_standing_mates`): where each free body has to stand for every standing mate to hold at once, as one least-squares problem over the bodies' poses.
// Pure: the faces as they are now in, the poses that make the mates true out, or which mates cannot all hold. A body that is not the first body of any standing mate stays where it is; of a set of bodies
// that move only each other, one stays (the one made first). The poses are the smallest changes from where the bodies are (a damped step, so a mate that leaves freedom leaves the body where it is).
import type { Vec3 } from "../math/vec.ts";
import { add, sub, dot, cross, length } from "../math/vec.ts";
import type { MateMode } from "./mates.ts";
import type { Rigid } from "./frames.ts";

/** What a mate is about on one body: the face as a point on it and a direction (a flat face's outward normal, a round face's axis). */
export interface SolveFeature { point: Vec3; dir: Vec3 }
export interface SolveMate { id: string; mode: MateMode; gap: number; /** whether the distance counts (a parallel mate with a distance) */ counts: boolean; mover: string; other: string; a: SolveFeature; b: SolveFeature }
export interface SolveBody { id: string; /** the point its turns are about (its middle) */ pivot: Vec3; /** the order it was made in: of bodies that only move each other the first stays */ order: number }
/** A pose: turn (a rotation vector, radians) about the pivot, then shift. */
export interface Pose { turn: Vec3; shift: Vec3 }
export interface Solved { ok: boolean; poses: Map<string, Pose>; /** the mates that do not hold at the best pose found (when `ok` is false: the ones that are at odds) */ atOdds: string[] }

type Mat = number[][];
const rotationOf = (v: Vec3): Mat => {
  const th = length(v);
  if (th < 1e-14) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const [x, y, z] = [v[0] / th, v[1] / th, v[2] / th];
  const [c, s, t] = [Math.cos(th), Math.sin(th), 1 - Math.cos(th)];
  return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
};
const mul = (m: Mat, p: Vec3): Vec3 => [m[0]![0]! * p[0] + m[0]![1]! * p[1] + m[0]![2]! * p[2], m[1]![0]! * p[0] + m[1]![1]! * p[1] + m[1]![2]! * p[2], m[2]![0]! * p[0] + m[2]![1]! * p[1] + m[2]![2]! * p[2]];
const unit = (v: Vec3): Vec3 => { const l = length(v); return l < 1e-12 ? v : [v[0] / l, v[1] / l, v[2] / l]; };

/** What each mate asks, as numbers that are all zero when it holds. */
function residuals(m: SolveMate, a: SolveFeature, b: SolveFeature): number[] {
  const [da, db] = [unit(a.dir), unit(b.dir)];
  const w = sub(a.point, b.point);
  const along = dot(w, db);
  const perp = sub(w, [db[0] * along, db[1] * along, db[2] * along]);
  switch (m.mode) {
    case "flush": return [da[0] + db[0], da[1] + db[1], da[2] + db[2], along - m.gap];
    case "coaxial": { const c = cross(da, db); return m.gap > 0 ? [c[0], c[1], c[2], length(perp) - m.gap] : [c[0], c[1], c[2], perp[0], perp[1], perp[2]]; }
    case "parallel": { const c = cross(da, db); return m.counts ? [c[0], c[1], c[2], Math.abs(along) - m.gap] : [c[0], c[1], c[2]]; }
    case "parallelAxes": case "axisToFace": { const c = cross(da, db); return [c[0], c[1], c[2]]; }
    case "perpendicular": case "perpendicularAxes": return [dot(da, db)];
    case "angle": case "angleAxes": {
      const want = (m.gap * Math.PI) / 180;
      return m.gap > 90 ? [dot(da, db) - Math.cos(want)] : [dot(da, db) ** 2 - Math.cos(want) ** 2]; // (as lines up to 90, between the directions past it, `in_326`)
    }
  }
}

const posed = (f: SolveFeature, pivot: Vec3, p: Pose | undefined): SolveFeature => {
  if (!p) return f;
  const R = rotationOf(p.turn);
  return { point: add(add(pivot, mul(R, sub(f.point, pivot))), p.shift), dir: mul(R, f.dir) };
};

/** Solve the linear system A x = b (small, dense) by Gaussian elimination with a pivot; null if singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-14) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = c + 1; r < n; r++) { const k = M[r]![c]! / M[c]![c]!; for (let j = c; j <= n; j++) M[r]![j]! -= k * M[c]![j]!; }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r]![n]!; for (let j = r + 1; j < n; j++) s -= M[r]![j]! * x[j]!; x[r] = s / M[r]![r]!; }
  return x;
}

/** Which bodies are free to move: the first body of a standing mate, except one (the first made) of each set of bodies that are all like that. */
export function freeBodies(mates: readonly SolveMate[], bodies: readonly SolveBody[]): Set<string> {
  const movers = new Set(mates.map((m) => m.mover));
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  for (const m of mates) parent.set(find(m.mover), find(m.other));
  const free = new Set(movers);
  const sets = new Map<string, SolveBody[]>();
  for (const b of bodies) { const root = find(b.id); sets.set(root, [...(sets.get(root) ?? []), b]); }
  for (const members of sets.values()) {
    if (members.length > 1 && members.every((b) => free.has(b.id))) { const ground = members.reduce((x, y) => (y.order < x.order ? y : x)); free.delete(ground.id); }
  }
  return free;
}

/** Damped Gauss-Newton: the numbers `x` (from `x0`) that make the residuals `r(x)` as small as can be found. */
function minimise(r: (x: readonly number[]) => number[], x0: readonly number[]): number[] {
  const n = x0.length;
  const norm2 = (v: readonly number[]) => v.reduce((s, q) => s + q * q, 0);
  let x = [...x0];
  let res = r(x);
  let lambda = 1e-3;
  for (let it = 0; it < 80 && norm2(res) > 1e-20 && n > 0; it++) {
    const J: number[][] = res.map(() => new Array<number>(n).fill(0));
    for (let j = 0; j < n; j++) { const h = 1e-6; const xp = [...x]; xp[j]! += h; const rp = r(xp); for (let i = 0; i < res.length; i++) J[i]![j] = (rp[i]! - res[i]!) / h; }
    const JtJ = Array.from({ length: n }, (_, p) => Array.from({ length: n }, (_, q) => J.reduce((s, row) => s + row[p]! * row[q]!, 0)));
    const g = Array.from({ length: n }, (_, p) => -J.reduce((s, row, i) => s + row[p]! * res[i]!, 0));
    let stepped = false;
    for (let tries = 0; tries < 12 && !stepped; tries++) {
      const A = JtJ.map((row, p) => row.map((v, q) => v + (p === q ? lambda : 0)));
      const dx = solveLinear(A, g);
      if (dx) { const xn = x.map((v, i) => v + dx[i]!); const rn = r(xn); if (norm2(rn) < norm2(res)) { x = xn; res = rn; lambda = Math.max(1e-12, lambda / 5); stepped = true; } }
      if (!stepped) lambda *= 10;
    }
    if (!stepped) break;
  }
  return x;
}

export function solvePoses(mates: readonly SolveMate[], bodies: readonly SolveBody[]): Solved {
  const free = [...freeBodies(mates, bodies)].filter((id) => bodies.some((b) => b.id === id));
  const pivot = new Map(bodies.map((b) => [b.id, b.pivot] as const));
  const poseOf = (x: readonly number[]): Map<string, Pose> => new Map(free.map((id, i) => [id, { turn: [x[6 * i]!, x[6 * i + 1]!, x[6 * i + 2]!] as Vec3, shift: [x[6 * i + 3]!, x[6 * i + 4]!, x[6 * i + 5]!] as Vec3 }] as const));
  const r = (x: readonly number[]): number[] => {
    const poses = poseOf(x);
    return mates.flatMap((m) => residuals(m, posed(m.a, pivot.get(m.mover)!, poses.get(m.mover)), posed(m.b, pivot.get(m.other)!, poses.get(m.other))));
  };
  // the smallest change that makes the mates hold: a little pull toward where each body stands, so what a mate leaves free (a turn about the shared axis, a slide along a face) is left alone and not spun to some other value (`in_342`)
  const ease = 1e-3;
  const start = new Array<number>(free.length * 6).fill(0);
  const near = minimise((x) => [...r(x).map((v) => v * 100), ...x.map((v) => v * ease)], start);
  const x = minimise((x) => [...r(x), ...x.map((v, i) => (v - near[i]!) * ease)], near);
  // which mates hold at the pose found
  const poses = poseOf(x);
  const atOdds = mates.filter((m) => Math.hypot(...residuals(m, posed(m.a, pivot.get(m.mover)!, poses.get(m.mover)), posed(m.b, pivot.get(m.other)!, poses.get(m.other)))) > 1e-6).map((m) => m.id);
  return { ok: atOdds.length === 0, poses, atOdds };
}

/** The rotation vector (radians) of a turn given as nine numbers, row by row. */
function rotationVectorOf(m: readonly number[]): Vec3 {
  const c = Math.max(-1, Math.min(1, (m[0]! + m[4]! + m[8]! - 1) / 2));
  const th = Math.acos(c);
  if (th < 1e-9) return [0, 0, 0];
  if (Math.PI - th < 1e-6) { const ax: Vec3 = [Math.sqrt(Math.max(0, (m[0]! + 1) / 2)), Math.sqrt(Math.max(0, (m[4]! + 1) / 2)), Math.sqrt(Math.max(0, (m[8]! + 1) / 2))]; return [ax[0] * th, ax[1] * th, ax[2] * th]; }
  const k = th / (2 * Math.sin(th));
  return [(m[7]! - m[5]!) * k, (m[2]! - m[6]!) * k, (m[3]! - m[1]!) * k];
}
/** A motion of a body (turn, shift) as a pose about its pivot: it turns about the pivot, then moves. */
export function poseOfRigid(r: Rigid, pivot: Vec3): Pose {
  const R = r.turn;
  const Rc = [R[0] * pivot[0] + R[1] * pivot[1] + R[2] * pivot[2], R[3] * pivot[0] + R[4] * pivot[1] + R[5] * pivot[2], R[6] * pivot[0] + R[7] * pivot[1] + R[8] * pivot[2]];
  return { turn: rotationVectorOf(R), shift: [r.shift[0] + Rc[0]! - pivot[0], r.shift[1] + Rc[1]! - pivot[1], r.shift[2] + Rc[2]! - pivot[2]] };
}
export function rigidOfPose(p: Pose, pivot: Vec3): Rigid {
  const R = rotationOf(p.turn);
  const Rc = mul(R, pivot);
  return { turn: [R[0]![0]!, R[0]![1]!, R[0]![2]!, R[1]![0]!, R[1]![1]!, R[1]![2]!, R[2]![0]!, R[2]![1]!, R[2]![2]!], shift: [p.shift[0] + pivot[0] - Rc[0], p.shift[1] + pivot[1] - Rc[1], p.shift[2] + pivot[2] - Rc[2]], k: 1 };
}

/**
 * One body dragged (`in_338`, `in_341`): where it can be taken, and where the bodies that follow it stand. `pose`: the pose nearest to the one the pointer asks for at which every mate holds, the bodies that are fixed (a body only mated to,
 * and one of any set that only move each other) where they are; `followers`: the poses of the bodies that move with it (the first body of a mate to the dragged one, and so on); `blockedBy`: the mates that keep it from the pose asked for
 * (those that cannot hold when it is taken there and the followers do what they can).
 */
/** The same with every other body held where it is (what it is when the followers cannot all go along: a body squeezed between two that stay): the pose of the dragged body alone. */
function solveDrivenAlone(mates: readonly SolveMate[], bodies: readonly SolveBody[], drivenId: string, desired: Pose): { pose: Pose; blockedBy: string[] } {
  const mine = mates.filter((m) => m.mover === drivenId || m.other === drivenId);
  const pivot = new Map(bodies.map((b) => [b.id, b.pivot] as const));
  const asPose = (x: readonly number[]): Pose => ({ turn: [x[0]!, x[1]!, x[2]!], shift: [x[3]!, x[4]!, x[5]!] });
  const holds = (pose: Pose) => mine.flatMap((m) => residuals(m, posed(m.a, pivot.get(m.mover)!, m.mover === drivenId ? pose : undefined), posed(m.b, pivot.get(m.other)!, m.other === drivenId ? pose : undefined)));
  const xd = [...desired.turn, ...desired.shift];
  const near = minimise((x) => [...holds(asPose(x)).map((v) => v * 100), ...x.map((v, i) => v - xd[i]!)], xd);
  const x = minimise((x) => holds(asPose(x)), near);
  const blockedBy = mine.filter((m) => Math.hypot(...residuals(m, posed(m.a, pivot.get(m.mover)!, m.mover === drivenId ? desired : undefined), posed(m.b, pivot.get(m.other)!, m.other === drivenId ? desired : undefined))) > 1e-4).map((m) => m.id);
  return { pose: asPose(x), blockedBy };
}

export function solveDriven(mates: readonly SolveMate[], bodies: readonly SolveBody[], drivenId: string, desired: Pose): { pose: Pose; blockedBy: string[]; followers: Map<string, Pose> } {
  const body = bodies.find((b) => b.id === drivenId);
  if (!body || !mates.some((m) => m.mover === drivenId || m.other === drivenId)) return { pose: desired, blockedBy: [], followers: new Map() };
  const free = new Set(freeBodies(mates, bodies));
  free.add(drivenId);
  const ids = [drivenId, ...[...free].filter((id) => id !== drivenId && bodies.some((b) => b.id === id))];
  const pivot = new Map(bodies.map((b) => [b.id, b.pivot] as const));
  const poseAt = (x: readonly number[], k: number): Pose => ({ turn: [x[6 * k]!, x[6 * k + 1]!, x[6 * k + 2]!], shift: [x[6 * k + 3]!, x[6 * k + 4]!, x[6 * k + 5]!] });
  const posesOf = (x: readonly number[], fixedDriven?: Pose): Map<string, Pose> => new Map(ids.flatMap((id, k) => (k === 0 && fixedDriven ? [[id, fixedDriven] as const] : [[id, poseAt(x, fixedDriven ? k - 1 : k)] as const])));
  const holds = (poses: Map<string, Pose>) => mates.flatMap((m) => residuals(m, posed(m.a, pivot.get(m.mover)!, poses.get(m.mover)), posed(m.b, pivot.get(m.other)!, poses.get(m.other))));
  const xd = [...desired.turn, ...desired.shift];
  const W = 100; // (the mates count far more than staying near what was asked)
  const x0 = [...xd, ...new Array<number>((ids.length - 1) * 6).fill(0)];
  const ease = 1e-3; // (the bodies that follow move no more than the mates ask: a little pull toward where they stand, so what the mates leave free is left alone, and an impossible drag does not send them wandering)
  const near = minimise((x) => [...holds(posesOf(x)).map((v) => v * W), ...x.slice(0, 6).map((v, i) => v - xd[i]!), ...x.slice(6).map((v) => v * ease)], x0);
  const x = minimise((x) => [...holds(posesOf(x)), ...x.map((v, i) => (v - near[i]!) * ease)], near);
  const poses = posesOf(x);
  // the bodies cannot all go along (one is squeezed between two that stay): the dragged body goes as far as its own mates let it, the others where they are
  if (Math.max(0, ...holds(poses).map(Math.abs)) > 1e-5) return { ...solveDrivenAlone(mates, bodies, drivenId, desired), followers: new Map() };
  // what keeps it from where it was asked to go: the mates that cannot hold with it taken there, the others doing what they can
  const rest = minimise((y) => [...holds(posesOf(y, desired)), ...y.map((v, i) => (v - x[6 + i]!) * ease)], x.slice(6));
  const withDesired = posesOf(rest, desired);
  const blockedBy = mates.filter((m) => Math.hypot(...residuals(m, posed(m.a, pivot.get(m.mover)!, withDesired.get(m.mover)), posed(m.b, pivot.get(m.other)!, withDesired.get(m.other)))) > 1e-4).map((m) => m.id);
  const followers = new Map([...poses].filter(([id]) => id !== drivenId));
  return { pose: poses.get(drivenId)!, blockedBy, followers };
}

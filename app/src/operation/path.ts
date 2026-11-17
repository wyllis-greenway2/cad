// The path of a sweep (`dec_sweep`): the lines and arcs selected, walked from one end to the other. Read from the parts every time (a path follows an edit of the sketch it is drawn in, `in_445`).
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { pointOf, curveMid } from "./part.ts";
import type { Lookup, Line } from "./part.ts";

export interface PathSide { from: Ref; to: Ref; a: Vec3; b: Vec3; m: Vec3 | null }

/** The sides of an open chain of lines and arcs in order from one end (the first the chain's end that is met first) to the other, or why it is not a path. */
export function walkPath(get: Lookup, lines: readonly Ref[]): { ok: true; sides: PathSide[] } | { ok: false; why: string } {
  const segs = lines.map((r) => get(r)).filter((p): p is Line => p?.kind === "line");
  if (!segs.length || segs.length !== lines.length) return { ok: false, why: "select the lines and arcs of the path" };
  const count = new Map<Ref, number>();
  for (const s of segs) for (const c of [s.a, s.b]) count.set(c, (count.get(c) ?? 0) + 1);
  if ([...count.values()].some((n) => n > 2)) return { ok: false, why: "the path branches: it must be one line, arc or chain with two ends" };
  const ends = [...count].filter(([, n]) => n === 1).map(([c]) => c);
  if (ends.length !== 2) return { ok: false, why: "the path must be open, one chain with two ends" };
  const used = new Set<number>();
  let cur = ends[0]!;
  const sides: PathSide[] = [];
  while (used.size < segs.length) {
    const i = segs.findIndex((s, k) => !used.has(k) && (s.a === cur || s.b === cur));
    if (i < 0) return { ok: false, why: "the lines of the path are not joined end to end" };
    used.add(i);
    const s = segs[i]!;
    const next = s.a === cur ? s.b : s.a;
    const [a, b] = [pointOf(get, cur), pointOf(get, next)];
    if (!a || !b) return { ok: false, why: "a corner of the path is gone" };
    sides.push({ from: cur, to: next, a, b, m: curveMid(get, s) });
    cur = next;
  }
  return { ok: true, sides };
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * Where a sweep made "along the line" (`dec_sweep_modes`) starts: the end of the path nearer the shape's plane (as the kernel takes it), and the direction the path leaves it in (the arc's tangent for an arc), so the shape
 * can stand on that point square to the path. `plane` is a point on the shape's plane and its normal.
 */
export function pathStart(sides: readonly PathSide[], plane: { at: Vec3; n: Vec3 }): { point: Vec3; tangent: Vec3 } {
  const off = (q: Vec3): number => Math.abs(dot3(sub3(q, plane.at), plane.n));
  const head = sides[0]!, tail = sides.at(-1)!;
  const fromTail = off(tail.b) < off(head.a);
  const [p, o, m] = fromTail ? [tail.b, tail.a, tail.m] : [head.a, head.b, head.m];
  const v2 = sub3(o, p);
  if (!m) return { point: p, tangent: unit3(v2) };
  const v1 = sub3(m, p);
  const n = cross3(v1, v2);
  const nn = dot3(n, n);
  if (nn < 1e-18) return { point: p, tangent: unit3(v2) };
  const [q1, q2] = [cross3(v2, n), cross3(n, v1)];
  const cp: Vec3 = [0, 1, 2].map((i) => (dot3(v1, v1) * q1[i]! + dot3(v2, v2) * q2[i]!) / (2 * nn)) as unknown as Vec3; // (centre minus p)
  let t = unit3(cross3(n, cp));
  if (dot3(t, v1) < 0) t = [-t[0], -t[1], -t[2]];
  return { point: p, tangent: t };
}

/** The direction in the plane square to `tangent` that is nearest to `want` (the shape's own x direction), or a world direction when they line up. */
export function squareXDir(tangent: Vec3, want: Vec3): Vec3 {
  for (const w of [want, [0, 0, 1] as Vec3, [1, 0, 0] as Vec3]) {
    const d = dot3(w, tangent);
    const x: Vec3 = [w[0] - d * tangent[0], w[1] - d * tangent[1], w[2] - d * tangent[2]];
    if (Math.hypot(x[0], x[1], x[2]) > 1e-6) return unit3(x);
  }
  return [1, 0, 0];
}

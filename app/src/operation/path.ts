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

// The order a machine visits paths in (`in_569`): generic code every cutting route shares. Inside before outside (a part must not drop or move before its holes are cut), and within that the nearest next path so the head
// travels as little as it can; a closed loop may be started at the vertex nearest the head, an open path is taken from its nearer end. Pure; millimetres.
import type { Point2 } from "../contract/index.ts";

export interface Path { points: readonly Point2[]; closed: boolean; /** how many loops it lies inside: deeper is cut first */ depth: number }
/** How to follow one path: which path, where a closed loop starts (an index into its points), and whether an open path is taken from its far end. */
export interface Visit { index: number; start: number; reversed: boolean }

const dist = (a: Point2, b: Point2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The paths in the order to cut them, the head starting at `from`: deepest first, and within a depth always the nearest next. */
export function orderPaths(paths: readonly Path[], from: Point2 = [0, 0]): Visit[] {
  const left = paths.map((p, index) => ({ p, index }));
  const out: Visit[] = [];
  let at = from;
  while (left.length) {
    const deepest = Math.max(...left.map((l) => l.p.depth));
    let best: { k: number; d: number; v: Visit } | null = null;
    left.forEach(({ p, index }, k) => {
      if (p.depth !== deepest) return;
      let cand: { d: number; v: Visit };
      if (p.closed) {
        let s = 0;
        for (let i = 1; i < p.points.length; i++) if (dist(p.points[i]!, at) < dist(p.points[s]!, at)) s = i;
        cand = { d: dist(p.points[s]!, at), v: { index, start: s, reversed: false } };
      } else {
        const [a, b] = [dist(p.points[0]!, at), dist(p.points[p.points.length - 1]!, at)];
        cand = { d: Math.min(a, b), v: { index, start: 0, reversed: b < a } };
      }
      if (!best || cand.d < best.d) best = { k, d: cand.d, v: cand.v };
    });
    const { k, v } = best!;
    const p = left.splice(k, 1)[0]!.p;
    out.push(v);
    at = p.closed ? p.points[v.start]! : v.reversed ? p.points[0]! : p.points[p.points.length - 1]!; // (a closed loop ends where it began)
  }
  return out;
}

// Matching the sketches of a loft (`dec_loft_sketches`, `in_431`, `in_432`): a loft joins the outlines of the sketches side to side, so they must have the same number of parts. Where they do not, a
// sketch with fewer parts is split to match (a straight side cut in two at its middle, a circle turned into the same number of arcs: the shape does not change), when the step says so; else it is refused,
// with the reason. The point each outline starts at, and its direction, are the person's (`shift`, `rev`): the match goes from start to start. Pure: it reads and writes the kernel's sketch ops.
import type { KernelOp } from "./kernel/adapter.ts";

type P = [number, number];
const mid2 = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const polygonOf = (op: KernelOp): { pts: P[]; mids: (P | null)[] } | null => op.shape === "polygon" ? { pts: (op.points as P[]).map((p) => [p[0], p[1]] as P), mids: ((op.mids as (P | null)[] | undefined) ?? (op.points as P[]).map(() => null)).map((m) => (m ? ([m[0], m[1]] as P) : null)) } : null;

/** How many parts a sketch has (a circle is one). */
export const partsOf = (op: KernelOp): number => (op.shape === "circle" ? 1 : ((op.points as P[] | undefined)?.length ?? 0));

/** The sketch as a polygon (a circle becomes `n` arcs through points round it: the same circle). Its shape is drawn about its own origin and then moved by `at`, which is folded in. */
function asPolygon(op: KernelOp, n: number): KernelOp {
  if (op.shape !== "circle") return op;
  const r = op.radius as number;
  const [cx, cy] = (op.at as P | undefined) ?? [0, 0];
  const pts: P[] = [], mids: P[] = [];
  for (let k = 0; k < n; k++) {
    const [t0, t1] = [(2 * Math.PI * k) / n, (2 * Math.PI * (k + 0.5)) / n];
    pts.push([cx + r * Math.cos(t0), cy + r * Math.sin(t0)]);
    mids.push([cx + r * Math.cos(t1), cy + r * Math.sin(t1)]);
  }
  const { radius: _r, at: _a, ...rest } = op;
  const id0 = (op.sides as string[] | undefined)?.[0];
  return { ...rest, shape: "polygon", points: pts, mids, ...(id0 ? { sides: pts.map((_, k) => `${id0}.${k}`) } : {}) }; // (each arc of a circle turned into arcs is named for the circle and its place)
}

/** A straight side cut in two at its middle: the longest one, until the sketch has `n` parts. Null where there is no straight side left to cut. */
function split(op: KernelOp, n: number): KernelOp | null {
  const poly = polygonOf(op);
  if (!poly) return op;
  const { pts, mids } = poly;
  const at = (op.at as P | undefined) ?? [0, 0];
  const sides = (op.sides as string[] | undefined) ? [...(op.sides as string[])] : null;
  while (pts.length < n) {
    let best = -1, len = 0;
    for (let i = 0; i < pts.length; i++) {
      if (mids[i]) continue;
      const l = Math.hypot(pts[(i + 1) % pts.length]![0] - pts[i]![0], pts[(i + 1) % pts.length]![1] - pts[i]![1]);
      if (l > len) { best = i; len = l; }
    }
    if (best < 0) return null;
    pts.splice(best + 1, 0, mid2(pts[best]!, pts[(best + 1) % pts.length]!));
    mids.splice(best + 1, 0, null);
    if (sides) sides.splice(best + 1, 0, `${sides[best]}+`); // (the second half of a side cut in two is the side's name and a +)
  }
  void at;
  return { ...op, points: pts, mids: mids.some((m) => m) ? mids : undefined, ...(sides ? { sides } : {}) };
}

/** The sketch with its outline going the other way, and then starting `shift` parts further on. */
function reorder(op: KernelOp, shift: number, rev: boolean): KernelOp {
  const poly = polygonOf(op);
  if (!poly || (!shift && !rev)) return op;
  let { pts, mids } = poly;
  let sides = (op.sides as string[] | undefined) ? [...(op.sides as string[])] : null;
  const n = pts.length;
  if (rev) {
    pts = pts.map((_, j) => pts[(n - j) % n]!);
    mids = mids.map((_, j) => mids[(n - j - 1 + n) % n] ?? null);
    if (sides) { const was = sides; sides = sides.map((_, j) => was[(n - j - 1 + n) % n]!); }
  }
  const s = ((shift % n) + n) % n;
  const out = { pts: pts.map((_, j) => pts[(j + s) % n]!), mids: mids.map((_, j) => mids[(j + s) % n] ?? null) };
  if (sides) { const was = sides; sides = sides.map((_, j) => was[(j + s) % n]!); }
  return { ...op, points: out.pts, mids: out.mids.some((m) => m) ? out.mids : undefined, ...(sides ? { sides } : {}) };
}

/**
 * The sketches ready to loft, or why not. `sketches` are the outlines in order; `shift` and `rev` are one per sketch; `splitToMatch` allows cutting the ones with fewer parts.
 */
export function matchSections(sketches: readonly KernelOp[], opts: { shift?: readonly number[]; rev?: readonly boolean[]; splitToMatch?: boolean }): { ok: true; sketches: KernelOp[] } | { ok: false; why: string } {
  const counts = sketches.map(partsOf);
  const allCircles = sketches.every((s) => s.shape === "circle");
  let out = [...sketches];
  if (!allCircles) {
    const N = Math.max(...counts.map((c, i) => (sketches[i]!.shape === "circle" ? 0 : c)));
    const alike = counts.every((c, i) => c === N && sketches[i]!.shape !== "circle");
    if (!alike) {
      const said = counts.map((c, i) => (sketches[i]!.shape === "circle" ? "a circle" : `${c} sides`)).join(", ");
      if (!opts.splitToMatch) return { ok: false, why: `the sketches have different numbers of parts (${said}): turn on Split to match, or draw them with the same number of sides` };
      const target = Math.max(N, 3);
      const next: KernelOp[] = [];
      for (const s of out) {
        const poly = asPolygon(s, target);
        const cut = partsOf(poly) < target ? split(poly, target) : poly;
        if (!cut) return { ok: false, why: `a sketch has curved sides only, which cannot be split to match the others (${said}): draw them with the same number of sides` };
        next.push(cut);
      }
      out = next;
    }
  }
  return { ok: true, sketches: out.map((s, i) => reorder(s, opts.shift?.[i] ?? 0, !!opts.rev?.[i])) };
}

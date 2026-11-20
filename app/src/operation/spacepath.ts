// A path in space (`dec_path_repeat`, `in_1301`): any lines, arcs and edges of bodies that touch end to end, on any planes, open or closed (a square of four lines, the rim of a body, an edge that bends in space). Walked from the parts
// each time. The path is laid out straight (`rolled`) so the rules of `operation/pathrepeat.ts` (spacing, corners, insets, shift) place the copies by how far along it they stand, and each place is then taken back into space.
// Pure: a scene's lookup and the names of the lines in, places out.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, sub, dot, scale, cross, length } from "../math/vec.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Lookup, Line } from "./part.ts";
import { pointOf, curvePoints, curveMid } from "./part.ts";
import type { Path, Seg } from "./pathrepeat.ts";
import { placeAlong, rulesFrom } from "./pathrepeat.ts";
import type { BodyPlace } from "./pathmaps.ts";

const TURN = 0.01; // (radians: a turn smaller than this at a joint is not a corner, as in `pathrepeat.ts`)
const unit = (a: Vec3): Vec3 => { const l = length(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** One line, arc or edge as the points along it from where it is entered to where it is left. */
interface Piece { pts: Vec3[]; length: number }
export interface SpacePath { pieces: Piece[]; closed: boolean; total: number }

const polyLength = (pts: readonly Vec3[]): number => pts.slice(1).reduce((t, q, i) => t + length(sub(q, pts[i]!)), 0);

/** The lines walked end to end as pieces, from the end the first line names (or any corner of a closed loop), or why they are not one chain. */
export function readSpacePath(get: Lookup, refs: readonly Ref[], reverse = false): Result<SpacePath> {
  const lines = refs.map((r) => get(r)).filter((p): p is Line => p?.kind === "line");
  if (!lines.length || lines.length !== refs.length) return err("the path's lines are gone");
  const deg = new Map<Ref, number>();
  for (const l of lines) for (const c of [l.a, l.b]) deg.set(c, (deg.get(c) ?? 0) + 1);
  if ([...deg.values()].some((n) => n > 2)) return err("the path branches: it must be one line, arc or chain, or one closed loop");
  const ends = [...deg].filter(([, n]) => n === 1).map(([c]) => c);
  const closed = ends.length === 0;
  if (!closed && ends.length !== 2) return err("the path must be one chain with two ends, or one closed loop");
  const used = new Set<number>();
  let cur: Ref = closed ? lines[0]!.a : ends[0]!;
  const pieces: Piece[] = [];
  while (used.size < lines.length) {
    const i = lines.findIndex((l, k) => !used.has(k) && (l.a === cur || l.b === cur));
    if (i < 0) return err("the lines of the path are not joined end to end");
    used.add(i);
    const l = lines[i]!;
    const next = l.a === cur ? l.b : l.a;
    const [pa, pb] = [pointOf(get, cur), pointOf(get, next)];
    if (!pa || !pb) return err("a corner of the path is gone");
    let pts: Vec3[] = curvePoints(get, l) ?? [];
    if (pts.length < 2) { const m = curveMid(get, l); pts = m && length(sub(pa, pb)) > 1e-9 ? [pa, m, pb] : [pa, pb]; } // (a drawn arc has its middle; a straight line has two points)
    // the points run from `a` to `b`; walked from `cur` they may run the other way
    const forward = l.a === cur && !(l.a === l.b && length(sub(pts[0]!, pa)) > length(sub(pts.at(-1)!, pa)));
    pts = forward ? [...pts] : [...pts].reverse();
    const len = polyLength(pts);
    if (len < 1e-9) return err("a side of the path has no length");
    pieces.push({ pts, length: len });
    cur = next;
  }
  const out: SpacePath = { pieces, closed, total: pieces.reduce((t, p) => t + p.length, 0) };
  return ok(reverse ? reversedSpace(out) : out);
}
const reversedSpace = (p: SpacePath): SpacePath => ({ ...p, pieces: [...p.pieces].reverse().map((x) => ({ pts: [...x.pts].reverse(), length: x.length })) });

/** The tangent of a piece at its start and at its end. */
const startRun = (p: Piece): Vec3 => unit(sub(p.pts[1]!, p.pts[0]!));
const endRun = (p: Piece): Vec3 => unit(sub(p.pts.at(-1)!, p.pts.at(-2)!));

/** The path laid straight for the placing rules: its sides one after another along a line, each as long as the piece, a joint a corner where the pieces turn. */
export function rolledOf(p: SpacePath): Path {
  let s = 0;
  const segs: Seg[] = p.pieces.map((x, i) => {
    const prev = p.pieces[i - 1] ?? (p.closed ? p.pieces[p.pieces.length - 1] : undefined);
    const corner = !prev || Math.acos(Math.min(1, Math.max(-1, dot(endRun(prev), startRun(x))))) > TURN;
    const seg: Seg = { a: [s, 0], b: [s + x.length, 0], bulge: 0, corner };
    s += x.length;
    return seg;
  });
  return { segs, closed: p.closed, rolled: true };
}

/** The point `s` along the path (wrapped round a closed one, held at the ends of an open one) and the way it runs there. */
export function spaceAt(p: SpacePath, s: number): { at: Vec3; along: Vec3 } {
  let u = p.closed ? ((s % p.total) + p.total) % p.total : Math.min(Math.max(s, 0), p.total);
  for (const [i, x] of p.pieces.entries()) {
    if (u <= x.length + 1e-9 || i === p.pieces.length - 1) {
      let k = u;
      for (let j = 1; j < x.pts.length; j++) {
        const [q0, q1] = [x.pts[j - 1]!, x.pts[j]!];
        const l = length(sub(q1, q0));
        if (k <= l + 1e-9 || j === x.pts.length - 1) { const t = unit(sub(q1, q0)); return { at: add(q0, scale(t, Math.min(k, l))), along: t }; }
        k -= l;
      }
    }
    u -= x.length;
  }
  return { at: p.pieces[0]!.pts[0]!, along: startRun(p.pieces[0]!) };
}

/** The turn (degrees, about a direction) that takes the way `a` to the way `b`, or none when they are the same way. */
function turnBetween(a: Vec3, b: Vec3): { angle: number; dir: Vec3 } | null {
  const c = cross(a, b);
  const sin = length(c);
  const cos = dot(a, b);
  if (sin < 1e-9) {
    if (cos > 0) return null;
    const pick: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; // (turned right round: any direction across the way will do)
    return { angle: 180, dir: unit(cross(a, pick)) };
  }
  return { angle: (Math.atan2(sin, cos) * 180) / Math.PI, dir: scale(c, 1 / sin) };
}

/**
 * Where the copies of a body go along a path in space (`in_1301`): for each place after the first, how far the body is moved from the first and, when the copies turn with the path, the turn about the first place
 * (the shortest turn that takes the way the path ran there to the way it runs at the place). The offset needs a path in one plane, so it is refused here. Or why there is none.
 */
export function spacePlaces(get: Lookup, rec: { path: readonly Ref[]; params: readonly number[] }): Result<{ places: BodyPlace[]; spacing: number | null; count: number; path: SpacePath }> {
  const n = rulesFrom(rec.params);
  if (!n.ok) return n;
  if (n.value.rules.offset) return err("moving the path sideways needs a path on one plane");
  const sp = readSpacePath(get, rec.path, n.value.reverse);
  if (!sp.ok) return sp;
  const placed = placeAlong(rolledOf(sp.value), n.value.rules);
  if (!placed.ok) return placed;
  const frames = placed.value.frames.map((f) => ({ ...spaceAt(sp.value, f.s) }));
  if (frames.length < 2) return err("the rules leave no copy but the body itself");
  const first = frames[0]!;
  const places: BodyPlace[] = frames.slice(1).map((f) => {
    const t = n.value.turn ? turnBetween(first.along, f.along) : null;
    return { move: sub(f.at, first.at), turn: t ? { angle: t.angle, pivot: first.at, dir: t.dir } : null };
  });
  return ok({ places, spacing: placed.value.spacing, count: frames.length, path: sp.value });
}

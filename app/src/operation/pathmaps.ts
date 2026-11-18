// The path repeat of a drawn figure (`dec_path_repeat`, step (b)): the path read from the lines and arcs the record names, in the figure's plane, and the maps (a move, or a move and a turn) that take the figure to each place along it.
// The first place is where the figure is (it is the original); every copy is the figure moved as the path's place for it has moved from the first, and, if the record says so, turned as the way the path runs has turned.
// Pure: a scene and a record in, maps out.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, sub, dot, scale, cross } from "../math/vec.ts";
import { aboutDir } from "../math/rotation.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene } from "./scene.ts";
import type { Line, Plane } from "./part.ts";
import { pointOf, curveMid, normalOfPlane } from "./part.ts";
import type { Path, Pt, Seg } from "./pathrepeat.ts";
import { reversedPath, rulesFrom, placeAlong } from "./pathrepeat.ts";

export interface PathPlane { plane: Plane; u: Vec3; v: Vec3; n: Vec3 }
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** The plane's two unit ways and its normal. */
function basisOf(plane: Plane): PathPlane { const u = unit(plane.u); const n = unit(normalOfPlane(plane)); return { plane, u, n, v: unit(cross(n, u)) }; }
const to2 = (b: PathPlane, p: Vec3): Pt => { const d = sub(p, b.plane.at); return [dot(d, b.u), dot(d, b.v)]; };
const to3 = (b: PathPlane, q: Pt): Vec3 => add(add(b.plane.at, scale(b.u, q[0])), scale(b.v, q[1]));

/**
 * The path the lines and arcs make, in the plane's own two directions: one chain with two ends, or one closed loop, walked from the end (or corner) the refs name first, or from the other when `reverse`. Or why they are not a path
 * in this plane. An arc is given its bulge from where its middle is.
 */
export function readPath(s: Scene, refs: readonly Ref[], plane: Plane, reverse = false): Result<Path> {
  const b = basisOf(plane);
  const get = (r: Ref) => s.parts[r];
  const lines = refs.map((r) => get(r)).filter((p): p is Line => p?.kind === "line");
  if (!lines.length || lines.length !== refs.length) return err("the path's lines are gone");
  if (lines.some((l) => l.plane !== plane.ref)) return err("the path must be drawn on the same plane as the figure");
  const deg = new Map<Ref, number>();
  for (const l of lines) for (const c of [l.a, l.b]) deg.set(c, (deg.get(c) ?? 0) + 1);
  if ([...deg.values()].some((n) => n > 2)) return err("the path branches: it must be one line, arc or chain");
  const ends = [...deg].filter(([, n]) => n === 1).map(([c]) => c);
  const closed = ends.length === 0;
  if (!closed && ends.length !== 2) return err("the path must be one chain with two ends, or one closed loop");
  const used = new Set<number>();
  let cur: Ref = closed ? lines[0]!.a : ends[0]!;
  const segs: Seg[] = [];
  while (used.size < lines.length) {
    const i = lines.findIndex((l, k) => !used.has(k) && (l.a === cur || l.b === cur));
    if (i < 0) return err("the lines of the path are not joined end to end");
    used.add(i);
    const l = lines[i]!;
    const next = l.a === cur ? l.b : l.a;
    const [pa, pb] = [pointOf(get, cur), pointOf(get, next)];
    if (!pa || !pb) return err("a corner of the path is gone");
    const [a, bb] = [to2(b, pa), to2(b, pb)];
    const m = curveMid(get, l);
    let bulge = 0;
    if (m) { // (an arc: how far its middle is to the left of the way it is walked, over the chord)
      const chord: Pt = [bb[0] - a[0], bb[1] - a[1]];
      const c = Math.hypot(chord[0], chord[1]);
      const m2 = to2(b, m);
      bulge = c < 1e-12 ? 0 : ((m2[0] - a[0]) * -chord[1] + (m2[1] - a[1]) * chord[0]) / (c * c);
    }
    segs.push({ a, b: bb, bulge });
    cur = next;
  }
  const path: Path = { segs, closed };
  return ok(reverse ? reversedPath(path) : path);
}

export interface RepeatMap { place: (p: Vec3) => Vec3; vec: (v: Vec3) => Vec3 }
/** The maps of the copies of a path repeat (the original, at the first place, is not one). Empty, with the reason in `why`, if the path or the numbers make no copy. */
export function pathMaps(s: Scene, rec: { plane: Ref; path?: Ref[]; params: readonly number[] }): { maps: RepeatMap[]; why: string | null; spacing: number | null; count: number } {
  const none = (why: string) => ({ maps: [], why, spacing: null, count: 0 });
  const plane = s.parts[rec.plane];
  if (!plane || plane.kind !== "plane") return none("the plane of the figure is gone");
  if (!rec.path?.length) return none("the path repeat has no path");
  const n = rulesFrom(rec.params);
  if (!n.ok) return none(n.error);
  const path = readPath(s, rec.path, plane, n.value.reverse);
  if (!path.ok) return none(path.error);
  const placed = placeAlong(path.value, n.value.rules);
  if (!placed.ok) return none(placed.error);
  const frames = placed.value.frames;
  const b = basisOf(plane);
  const first = frames[0];
  if (!first) return none("the rules leave no copy");
  const angle = (t: Pt): number => Math.atan2(t[1], t[0]);
  const maps: RepeatMap[] = frames.slice(1).map((f) => {
    const move = sub(to3(b, f.at), to3(b, first.at));
    if (!n.value.turn) return { place: (p: Vec3): Vec3 => add(p, move), vec: (v: Vec3): Vec3 => v };
    const m = aboutDir(b.n, ((angle(f.along) - angle(first.along)) * 180) / Math.PI); // (the turn of the repeats is in degrees)
    const rot = (w: Vec3): Vec3 => [m[0] * w[0] + m[1] * w[1] + m[2] * w[2], m[3] * w[0] + m[4] * w[1] + m[5] * w[2], m[6] * w[0] + m[7] * w[1] + m[8] * w[2]];
    const pivot = to3(b, first.at);
    return { place: (p: Vec3): Vec3 => add(add(pivot, move), rot(sub(p, pivot))), vec: rot };
  });
  return { maps, why: maps.length ? null : "the rules leave no copy but the figure itself", spacing: placed.value.spacing, count: frames.length };
}

/** The plane all the lines of a path are drawn on, or why they are not on one (a body repeat has no figure to take the plane from). */
export function pathPlaneOf(s: Scene, refs: readonly Ref[]): Result<Ref> {
  const planes = new Set(refs.map((r) => s.parts[r]).map((p) => (p?.kind === "line" ? p.plane : null)));
  if (planes.size !== 1 || planes.has(null) || !s.parts[[...planes][0] as Ref]) return err("the lines of the path must be drawn on one plane");
  return ok([...planes][0] as Ref);
}
export interface BodyPlace { move: Vec3; /** a turn about the point, in degrees, about the direction */ turn: { angle: number; pivot: Vec3; dir: Vec3 } | null }
/**
 * Where the copies of a body go (`dec_path_repeat`, step (c)): for each place along the path after the first, how far the body is moved and, when the copies turn with the path, the turn about the first place that comes first.
 * The first place is where the body is (the original). Or why there is none.
 */
export function bodyPlaces(s: Scene, rec: { path: readonly Ref[]; params: readonly number[] }): Result<{ places: BodyPlace[]; spacing: number | null; count: number }> {
  const plane = pathPlaneOf(s, rec.path);
  if (!plane.ok) return plane;
  const pl = s.parts[plane.value] as Plane;
  const n = rulesFrom(rec.params);
  if (!n.ok) return n;
  const path = readPath(s, rec.path, pl, n.value.reverse);
  if (!path.ok) return path;
  const placed = placeAlong(path.value, n.value.rules);
  if (!placed.ok) return placed;
  const frames = placed.value.frames;
  if (frames.length < 2) return err("the rules leave no copy but the body itself");
  const b = basisOf(pl);
  const first = frames[0]!;
  const pivot = to3(b, first.at);
  const angle = (t: Pt): number => Math.atan2(t[1], t[0]);
  const places: BodyPlace[] = frames.slice(1).map((f) => ({ move: sub(to3(b, f.at), pivot), turn: n.value.turn ? { angle: (((angle(f.along) - angle(first.along)) * 180) / Math.PI), pivot, dir: b.n } : null }));
  return ok({ places, spacing: placed.value.spacing, count: frames.length });
}

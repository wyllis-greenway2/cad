// Offset (`in_177`): a copy of a drawn figure moved in or out by a distance, drawn on the same plane. A closed figure of straight sides gets a new one with every side moved and the corners where the
// neighbouring sides meet (a rectangle stays a rectangle); a circle gets a concentric one; a line, a parallel line. Positive is out of the figure (a line: to the side its arrow points), negative in.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId, lookup } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import type { Part, Plane } from "../operation/part.ts";
import { pointOf, normalOfPlane } from "../operation/part.ts";
import { drawChain, drawCircle } from "../operation/build.ts";

export type OffsetSource =
  | { kind: "loop"; plane: Ref; pts: Vec3[]; origin: Vec3; normal: Vec3 }
  | { kind: "circle"; plane: Ref; circle: Ref; centre: Vec3; radius: number; origin: Vec3; normal: Vec3 }
  | { kind: "line"; plane: Ref; a: Vec3; b: Vec3; origin: Vec3; normal: Vec3 };

type V2 = [number, number];
const local = (pl: Plane, p: Vec3): V2 => [dot(sub(p, pl.at), pl.u), dot(sub(p, pl.at), pl.v)];
const lift = (pl: Plane, q: V2): Vec3 => add(pl.at, add(scale(pl.u, q[0]), scale(pl.v, q[1])));
const area2 = (p: V2[]): number => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]!; return s + (a[0] * b[1] - b[0] * a[1]); }, 0);

/** What a selection can be offset from: one drawn closed figure of straight sides, one circle, one straight line. */
export function offsetSource(scene: Scene, parts: Part[]): OffsetSource | null {
  const get = lookup(scene);
  const first = parts[0];
  if (!first || parts.length !== 1 || first.origin !== "drawn") return null;
  const face = first.kind === "face" ? first : null;
  const circle = first.kind === "circle" ? first : face?.disk ? get(face.disk) : null;
  const planeRef = face?.plane ?? first.plane;
  const pl = planeRef ? get(planeRef) : undefined;
  if (!planeRef || !pl || pl.kind !== "plane") return null;
  if (circle?.kind === "circle") {
    const c = pointOf(get, circle.center);
    return c ? { kind: "circle", plane: planeRef, circle: circle.ref, centre: c, radius: circle.radius, origin: add(c, scale(pl.u, circle.radius)), normal: pl.u } : null;
  }
  if (face) {
    const lines = face.loop.map((r) => get(r));
    if (lines.some((l) => l?.kind !== "line" || l.center || l.bulge)) return null; // straight sides only
    const pts = face.corners.map((c) => pointOf(get, c));
    if (pts.length < 3 || pts.some((p) => !p)) return null;
    const P = pts as Vec3[];
    const q = P.map((p) => local(pl, p));
    const a0 = q[0]!, a1 = q[1]!;
    const d: V2 = [a1[0] - a0[0], a1[1] - a0[1]];
    const len = Math.hypot(...d) || 1;
    const s = area2(q) > 0 ? 1 : -1; // counter-clockwise: out is to the right of each side
    const out: V2 = [(s * d[1]) / len, (-s * d[0]) / len];
    return { kind: "loop", plane: planeRef, pts: P, origin: lift(pl, [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2]), normal: add(scale(pl.u, out[0]), scale(pl.v, out[1])) };
  }
  if (first.kind === "line" && !first.center && !first.bulge) {
    const [a, b] = [pointOf(get, first.a), pointOf(get, first.b)];
    if (!a || !b) return null;
    const dir = normalize(sub(b, a));
    return { kind: "line", plane: planeRef, a, b, origin: scale(add(a, b), 0.5), normal: normalize(cross(normalOfPlane(pl), dir)) };
  }
  return null;
}

/** The command that draws the offset figure `v` out (a negative `v` is in), or null when there is none (an inward offset past the middle, a circle of no size). */
export function offsetCommand(scene: Scene, src: OffsetSource, v: number): Command | null {
  const pl = lookup(scene)(src.plane);
  if (!pl || pl.kind !== "plane" || Math.abs(v) < 1e-9) return null;
  if (src.kind === "circle") {
    const r = src.radius + v;
    if (!(r > 1e-6)) return null;
    const c = drawCircle(scene, src.plane, src.centre, r);
    return { type: "batch", commands: [c.command, { type: "addRelation", relation: { id: nextId(scene, "r"), kind: "concentric", parts: [c.circle, src.circle] } }] }; // (concentric with the one it came from)
  }
  if (src.kind === "line") {
    const shift = scale(src.normal, v);
    return drawChain(scene, src.plane, [add(src.a, shift), add(src.b, shift)]).command;
  }
  const q = src.pts.map((p) => local(pl, p));
  const s = area2(q) > 0 ? 1 : -1;
  const n = q.length;
  // the line of each side, moved out by v
  const lines = q.map((a, i): { p: V2; d: V2 } => {
    const b = q[(i + 1) % n]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d: V2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    return { p: [a[0] + s * d[1] * v, a[1] - s * d[0] * v], d };
  });
  const corners = q.map((_, i): V2 => {
    const [l0, l1] = [lines[(i + n - 1) % n]!, lines[i]!];
    const cr = l0.d[0] * l1.d[1] - l0.d[1] * l1.d[0];
    if (Math.abs(cr) < 1e-9) return l1.p; // two sides in one line: the corner just moves
    const t = ((l1.p[0] - l0.p[0]) * l1.d[1] - (l1.p[1] - l0.p[1]) * l1.d[0]) / cr;
    return [l0.p[0] + l0.d[0] * t, l0.p[1] + l0.d[1] * t];
  });
  const a = area2(corners);
  if (Math.abs(a) < 1e-6 || Math.sign(a) !== s) return null; // gone past the middle
  return drawChain(scene, src.plane, corners.map((c) => lift(pl, c)), true).command;
}

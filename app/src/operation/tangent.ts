// Tangent mates between the faces of two bodies (`in_837`, `in_838`): a flat face, a cylinder, a sphere or a cone against another. Pure maths: each face as what it is for this (a plane: a point and its normal; a cylinder: a point of its axis, the
// axis and the radius; a sphere: its centre and radius; a cone: its apex, the axis (from the apex into the cone) and the half angle), and the numbers that are all zero when two touch along a line or at a point.
import type { Vec3 } from "../math/vec.ts";
import { sub, dot, cross, length } from "../math/vec.ts";

export type Shape = "flat" | "cyl" | "sphere" | "cone";
export interface TFeature { point: Vec3; dir: Vec3; radius: number; shape?: Shape; /** a cone's half angle, radians */ semi?: number }
export const shapeOf = (f: { radius: number; shape?: Shape }): Shape => f.shape ?? (f.radius > 0 ? "cyl" : "flat");
const unit = (v: Vec3): Vec3 => { const l = length(v); return l < 1e-12 ? v : [v[0] / l, v[1] / l, v[2] / l]; };

/** Which pairs of shapes a tangent mate can be made of, and why not (null: it can). A cone is for a flat face only. */
export function whyNotTangent(a: Shape, b: Shape): string | null {
  const pair = [a, b].sort().join("+");
  if (pair === "flat+flat") return "two flat faces are not tangent: a round face (a cylinder, a ball or a cone) against a flat or a round one";
  if (a === "cone" || b === "cone") return pair === "cone+flat" ? null : "a cone is tangent to a flat face (not yet to a round one)";
  return null;
}

/** The distance from a point to the line through `p` along `d`, and the point of the line nearest to it taken away. */
const apart = (c: Vec3, p: Vec3, d: Vec3): { dist: number; way: Vec3 } => {
  const w = sub(c, p);
  const along = dot(w, d);
  const perp: Vec3 = [w[0] - d[0] * along, w[1] - d[1] * along, w[2] - d[2] * along];
  const dist = length(perp);
  return { dist, way: dist > 1e-9 ? [perp[0] / dist, perp[1] / dist, perp[2] / dist] : unit(Math.abs(d[0]) < 0.9 ? cross(d, [1, 0, 0]) : cross(d, [0, 1, 0])) };
};

/** What is asked of two faces to be tangent: numbers (mm, or a length times the cosine of an angle) that are all zero when they are. `side` +1: touching from outside (a ball on the outside of a plane's normal, two round faces apart); -1: inside. */
export function tangentResiduals(a: TFeature, b: TFeature, side: number): number[] {
  const [sa, sb] = [shapeOf(a), shapeOf(b)];
  const s = side < 0 ? -1 : 1;
  if (sa === "flat" || sb === "flat") {
    const [p, q] = sa === "flat" ? [a, b] : [b, a]; // (p is the flat one)
    const n = unit(p.dir);
    const d = dot(sub(q.point, p.point), n);
    switch (shapeOf(q)) {
      case "cyl": return [dot(unit(q.dir), n) * q.radius, d - s * q.radius];
      case "sphere": return [d - s * q.radius];
      case "cone": return [d, dot(unit(q.dir), n) - Math.sin(q.semi ?? 0)];
      default: return [d];
    }
  }
  const sum = s > 0 ? a.radius + b.radius : Math.abs(a.radius - b.radius);
  if (sa === "sphere" && sb === "sphere") return [length(sub(a.point, b.point)) - sum];
  if (sa === "cyl" && sb === "cyl") { const c = cross(unit(a.dir), unit(b.dir)); const k = a.radius + b.radius; return [c[0] * k, c[1] * k, c[2] * k, apart(a.point, b.point, unit(b.dir)).dist - sum]; }
  const [ball, cyl] = sa === "sphere" ? [a, b] : [b, a];
  return [apart(ball.point, cyl.point, unit(cyl.dir)).dist - sum];
}

/**
 * What it takes to bring the face `a` tangent to the face `b` (`a` moves, `b` stays): the direction its axis (or its normal) is to turn to, if it has to turn (an axis into a plane, a flat face's normal at a right angle to an axis, an axis along
 * another, a cone's axis at its angle to a plane's normal), the side (outside for a flat face; for two round faces outside unless one is inside the other now) and, once it is turned (about `a.point`), how far it is to move.
 */
export function tangentMotion(a: TFeature, b: TFeature): { turnTo: Vec3 | null; side: number; move: (turnedDir: Vec3) => Vec3 } {
  const [sa, sb] = [shapeOf(a), shapeOf(b)];
  const inPlane = (v: Vec3, n: Vec3): Vec3 => { const t: Vec3 = [v[0] - dot(v, n) * n[0], v[1] - dot(v, n) * n[1], v[2] - dot(v, n) * n[2]]; return length(t) > 1e-9 ? unit(t) : unit(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])); };
  const tilted = (t: Vec3, n: Vec3, semi: number): Vec3 => { const k = Math.sin(semi), c = Math.sqrt(Math.max(0, 1 - k * k)); return [t[0] * c + n[0] * k, t[1] * c + n[1] * k, t[2] * c + n[2] * k]; };
  let turnTo: Vec3 | null = null;
  if ((sa === "cyl" && sb === "flat") || (sa === "flat" && sb === "cyl")) turnTo = inPlane(a.dir, unit(b.dir));
  else if (sa === "cyl" && sb === "cyl") turnTo = dot(a.dir, b.dir) >= 0 ? unit(b.dir) : [-b.dir[0], -b.dir[1], -b.dir[2]];
  else if (sa === "cone" && sb === "flat") turnTo = tilted(inPlane(a.dir, unit(b.dir)), unit(b.dir), a.semi ?? 0);
  else if (sa === "flat" && sb === "cone") turnTo = tilted(inPlane(a.dir, unit(b.dir)), unit(b.dir), b.semi ?? 0);
  // two round faces: on the outside unless one is inside the other now
  let side = 1;
  const roundish = (x: Shape) => x === "cyl" || x === "sphere";
  if (roundish(sa) && roundish(sb)) {
    const d = sa === "sphere" && sb === "sphere" ? length(sub(a.point, b.point)) : sa === "sphere" ? apart(a.point, b.point, unit(b.dir)).dist : sb === "sphere" ? apart(b.point, a.point, unit(a.dir)).dist : apart(a.point, b.point, unit(b.dir)).dist;
    side = d >= (a.radius + b.radius + Math.abs(a.radius - b.radius)) / 2 ? 1 : -1;
  }
  const move = (dir: Vec3): Vec3 => {
    const A: TFeature = { ...a, dir };
    if (sa === "flat" || sb === "flat") {
      const flatMoves = sa === "flat"; // (the flat one is `a`: it goes to the round one, else the round one goes to it)
      const [p, q] = flatMoves ? [A, b] : [b, A];
      const n = unit(p.dir);
      const d = dot(sub(q.point, p.point), n);
      const want = shapeOf(q) === "cone" ? 0 : q.radius;
      const m = flatMoves ? d - want : want - d;
      return [n[0] * m, n[1] * m, n[2] * m];
    }
    const sum = side > 0 ? a.radius + b.radius : Math.abs(a.radius - b.radius);
    if (sa === "sphere" && sb === "sphere") { const w = sub(a.point, b.point); const l = length(w); const way: Vec3 = l > 1e-9 ? [w[0] / l, w[1] / l, w[2] / l] : [1, 0, 0]; const k = sum - l; return [way[0] * k, way[1] * k, way[2] * k]; }
    if (sa === "cyl" && sb === "sphere") { const info = apart(b.point, A.point, unit(A.dir)); const k = info.dist - sum; return [info.way[0] * k, info.way[1] * k, info.way[2] * k]; } // (the axis goes toward the ball)
    const info = apart(A.point, b.point, unit(b.dir)); // (a ball or a cylinder goes away from the other's axis)
    const k = sum - info.dist;
    return [info.way[0] * k, info.way[1] * k, info.way[2] * k];
  };
  return { turnTo, side, move };
}

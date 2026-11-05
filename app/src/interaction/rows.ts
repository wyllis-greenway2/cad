// The relations table: one row per relation or measure (`dec_relations_standard`): which kinds of parts it applies to, when it is unavailable, how to measure it, where its bubble goes.
// Geometry is read in 3D from the scene, so no plane or sketch is involved in measuring. `actions.ts` turns a selection into the rows that apply.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot, cross, length, dist, mid, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Kind, Lookup } from "../operation/part.ts";
import { pointOf, segmentOf, circleOf, normalOfPlane, planeOfParts } from "../operation/part.ts";

const PARALLEL_SIN = 0.02; // two lines count as parallel for a distance when the sine of the angle between them is below this (about 1 degree)

/** Why a relation is off when every part is a reference (body or world): nothing can move. */
export const REFERENCES_ONLY = "all of these are references: nothing here can move";

export interface Ctx { scene: Scene; get: Lookup; parts: Ref[] }
export interface Row {
  id: string;
  label: string;
  pair: Kind[];
  anyOrder?: boolean;
  unit?: "mm" | "deg";
  unavailable?: (c: Ctx, r: Ref[]) => string | null;
  measure?: (c: Ctx, r: Ref[]) => number | null;
  params?: (c: Ctx, r: Ref[]) => Record<string, number>;
  spot?: (c: Ctx, r: Ref[]) => Vec3 | null;
}

const segs = (c: Ctx, r: Ref[]): [Vec3, Vec3][] => r.map((x) => segmentOf(c.get, x)).filter((s): s is [Vec3, Vec3] => !!s);
const dir = (s: [Vec3, Vec3]): Vec3 => normalize(sub(s[1], s[0]));
const normalFor = (c: Ctx, r: Ref[]): Vec3 => {
  const pl = planeOfParts(c.get, r);
  return pl ? normalOfPlane(pl) : [0, 0, 1];
};
/** Perpendicular distance of q from the infinite line through s, signed by the plane normal (positive on the left of the line's direction). */
const signedFromLine = (s: [Vec3, Vec3], q: Vec3, n: Vec3): number => dot(n, cross(dir(s), sub(q, s[0])));
const sideOf = (v: number) => (v >= 0 ? 1 : -1);

/** Rows in the order of the table (the prototype's order). */
export const ROWS: Row[] = [
  { id: "horizontal", label: "Horizontal", pair: ["line"] },
  { id: "vertical", label: "Vertical", pair: ["line"] },
  {
    // the length of a line (the distance between its two corners)
    id: "length", label: "Length", pair: ["line"], unit: "mm",
    measure: (c, r) => {
      const [s] = segs(c, r);
      return s ? dist(s[0], s[1]) : null;
    },
    spot: (c, r) => {
      const [s] = segs(c, r);
      return s ? mid(s[0], s[1]) : null;
    },
  },
  { id: "fixed", label: "Fix in place", pair: ["corner"] },
  {
    // the diameter of a circle
    id: "diameter", label: "Diameter", pair: ["circle"], unit: "mm",
    measure: (c, r) => {
      const k = circleOf(c.get, r[0]!);
      return k ? k.radius * 2 : null;
    },
    spot: (c, r) => circleOf(c.get, r[0]!)?.center ?? null,
  },

  { id: "coincident", label: "Coincident", pair: ["corner", "corner"] },
  { id: "sameHeight", label: "Same height", pair: ["corner", "corner"] },
  { id: "sameAcross", label: "Same position across", pair: ["corner", "corner"] },
  {
    id: "distance", label: "Distance", pair: ["corner", "corner"], unit: "mm",
    measure: (c, r) => {
      const [a, b] = [pointOf(c.get, r[0]!), pointOf(c.get, r[1]!)];
      return a && b ? dist(a, b) : null;
    },
    spot: (c, r) => {
      const [a, b] = [pointOf(c.get, r[0]!), pointOf(c.get, r[1]!)];
      return a && b ? mid(a, b) : null;
    },
  },

  { id: "equalLength", label: "Equal length", pair: ["line", "line"] },
  { id: "parallel", label: "Parallel", pair: ["line", "line"] },
  { id: "perpendicular", label: "Perpendicular", pair: ["line", "line"] },
  {
    // the perpendicular gap between two parallel lines (between the infinite lines they lie on); the lines must be parallel already, so they are made parallel first
    id: "distance", label: "Distance", pair: ["line", "line"], unit: "mm",
    unavailable: (c, r) => {
      const [s1, s2] = segs(c, r);
      if (!s1 || !s2) return "a line is missing";
      return Math.abs(length(cross(dir(s1), dir(s2)))) > PARALLEL_SIN ? "the lines are not parallel: make them parallel first" : null;
    },
    measure: (c, r) => {
      const [s1, s2] = segs(c, r);
      if (!s1 || !s2) return null;
      return Math.abs(signedFromLine(s1, mid(s2[0], s2[1]), normalFor(c, r)));
    },
    params: (c, r) => {
      const [s1, s2] = segs(c, r);
      return s1 && s2 ? { side: sideOf(signedFromLine(s1, mid(s2[0], s2[1]), normalFor(c, r))) } : ({} as Record<string, number>);
    },
    spot: (c, r) => {
      const [s1, s2] = segs(c, r);
      return s1 && s2 ? mid(mid(s1[0], s1[1]), mid(s2[0], s2[1])) : null;
    },
  },
  {
    // the angle between two lines that share a corner, both measured away from it
    id: "angle", label: "Angle", pair: ["line", "line"], unit: "deg",
    unavailable: (c, r) => (shared(c, r) ? null : "the lines do not share a corner"),
    measure: (c, r) => {
      const sh = shared(c, r);
      if (!sh) return null;
      return Math.abs(signedAngle(sh, normalFor(c, r)));
    },
    params: (c, r) => {
      const sh = shared(c, r);
      return sh ? { side: sideOf(signedAngle(sh, normalFor(c, r))) } : ({} as Record<string, number>);
    },
    spot: (c, r) => {
      const sh = shared(c, r);
      return sh ? sh.v : null;
    },
  },

  { id: "equalRadius", label: "Equal radius", pair: ["circle", "circle"] },

  {
    // the perpendicular distance from a corner to the infinite line a segment lies on
    id: "distance", label: "Distance", pair: ["corner", "line"], anyOrder: true, unit: "mm",
    measure: (c, r) => {
      const [p, s] = pointAndLine(c, r);
      return p && s ? Math.abs(signedFromLine(s, p, normalFor(c, r))) : null;
    },
    params: (c, r) => {
      const [p, s] = pointAndLine(c, r);
      return p && s ? { side: sideOf(signedFromLine(s, p, normalFor(c, r))) } : ({} as Record<string, number>);
    },
    spot: (c, r) => {
      const [p, s] = pointAndLine(c, r);
      if (!p || !s) return null;
      const f = dot(dir(s), sub(p, s[0]));
      const foot: Vec3 = [s[0][0] + dir(s)[0] * f, s[0][1] + dir(s)[1] * f, s[0][2] + dir(s)[2] * f];
      return mid(p, foot);
    },
  },
];

function pointAndLine(c: Ctx, r: Ref[]): [Vec3 | null, [Vec3, Vec3] | null] {
  const corner = r.find((x) => c.get(x)?.kind === "corner");
  const line = r.find((x) => c.get(x)?.kind === "line");
  return [corner ? pointOf(c.get, corner) : null, line ? segmentOf(c.get, line) : null];
}
/** Two lines that share a corner: the shared corner and the far ends. */
function shared(c: Ctx, r: Ref[]): { v: Vec3; p: Vec3; q: Vec3 } | null {
  const [la, lb] = r.map((x) => c.get(x));
  if (!la || !lb || la.kind !== "line" || lb.kind !== "line" || la.ref === lb.ref) return null;
  for (const [i, ca] of [la.a, la.b].entries()) {
    for (const [j, cb] of [lb.a, lb.b].entries()) {
      if (ca !== cb) continue;
      const [v, p, q] = [pointOf(c.get, ca), pointOf(c.get, i === 0 ? la.b : la.a), pointOf(c.get, j === 0 ? lb.b : lb.a)];
      return v && p && q ? { v, p, q } : null;
    }
  }
  return null;
}
const signedAngle = (sh: { v: Vec3; p: Vec3; q: Vec3 }, n: Vec3): number => {
  const u = sub(sh.p, sh.v);
  const w = sub(sh.q, sh.v);
  return (Math.atan2(dot(n, cross(u, w)), dot(u, w)) * 180) / Math.PI;
};

export const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((k, i) => k === b[i]);


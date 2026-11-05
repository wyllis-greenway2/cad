// The one part interface (`dec_clean_engine_design` section 2). Everything you can select is a Part: a plain record that saves as JSON,
// plus a registry of pure functions per kind. Drawn, body and world parts share the same accessors, so picking, drawing and relations
// never ask where a part came from.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { length, add, scale } from "../math/vec.ts";

export type Kind = "corner" | "line" | "circle" | "face" | "plane" | "axis" | "body";
export type Origin = "drawn" | "body" | "world";

interface Base {
  ref: Ref;
  origin: Origin;
  /** The plane a drawn part lies on (null for parts that are not on one). A sketch is not a thing: it is only this field. */
  plane: Ref | null;
  /** True for drawn parts only: body and world parts are always references. */
  movable: boolean;
}
export interface Corner extends Base { kind: "corner"; at: Vec3 }
export interface Line extends Base { kind: "line"; a: Ref; b: Ref; /** a point halfway along a curved edge (body edges only; straight lines omit it) */ mid?: Vec3 }
export interface Circle extends Base { kind: "circle"; center: Ref; radius: number }
export interface Face extends Base { kind: "face"; loop: Ref[] }
export interface Plane extends Base { kind: "plane"; at: Vec3; u: Vec3; v: Vec3 }
export interface Axis extends Base { kind: "axis"; at: Vec3; dir: Vec3 }
export interface Body extends Base { kind: "body" }
export type Part = Corner | Line | Circle | Face | Plane | Axis | Body;

/** Finds a part by name (the scene provides it). */
export type Lookup = (ref: Ref) => Part | undefined;

// ---- the same accessors for every kind ----
export const pointOf = (get: Lookup, ref: Ref): Vec3 | null => {
  const p = get(ref);
  return p && p.kind === "corner" ? p.at : null;
};
/** The two end points of a line, or null. */
export const segmentOf = (get: Lookup, ref: Ref): [Vec3, Vec3] | null => {
  const p = get(ref);
  if (!p || p.kind !== "line") return null;
  const a = pointOf(get, p.a);
  const b = pointOf(get, p.b);
  return a && b ? [a, b] : null;
};
export const circleOf = (get: Lookup, ref: Ref): { center: Vec3; radius: number } | null => {
  const p = get(ref);
  if (!p || p.kind !== "circle") return null;
  const c = pointOf(get, p.center);
  return c ? { center: c, radius: p.radius } : null;
};
export const normalOfPlane = (p: Plane): Vec3 => {
  const [u, v] = [p.u, p.v];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = length(n) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
};

// ---- per-kind functions ----
/** The pointer for a hit test: screen position (pixels) and a projection from 3D to the screen. */
export interface PointerView {
  x: number;
  y: number;
  project: (p: Vec3) => [number, number];
}
/** What to draw for a part (the view reads this and knows no kinds). */
export type Outline =
  | { shape: "point"; at: Vec3 }
  | { shape: "segment"; a: Vec3; b: Vec3 }
  | { shape: "circle"; center: Vec3; radius: number; normal: Vec3 }
  | { shape: "none" };

export interface KindOps<P extends Part> {
  /** Distance in pixels from the pointer to the part, or null if it cannot be hit (missing geometry). */
  hit(get: Lookup, part: P, pointer: PointerView): number | null;
  outline(get: Lookup, part: P): Outline;
  /** The corners the part contains or is made of (so a relation on a line also touches its corners). */
  anchors(part: P): Ref[];
}

const px = (pv: PointerView, p: Vec3): [number, number] => pv.project(p);
function distToSegment2d(p: [number, number], a: [number, number], b: [number, number]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const cornerOps: KindOps<Corner> = {
  hit: (_g, part, pv) => {
    const [x, y] = px(pv, part.at);
    return Math.hypot(pv.x - x, pv.y - y);
  },
  outline: (_g, part) => ({ shape: "point", at: part.at }),
  anchors: (part) => [part.ref],
};
const lineOps: KindOps<Line> = {
  hit: (get, part, pv) => {
    const s = segmentOf(get, part.ref);
    return s ? distToSegment2d([pv.x, pv.y], px(pv, s[0]), px(pv, s[1])) : null;
  },
  outline: (get, part) => {
    const s = segmentOf(get, part.ref);
    return s ? { shape: "segment", a: s[0], b: s[1] } : { shape: "none" };
  },
  anchors: (part) => [part.a, part.b],
};
const circleOps: KindOps<Circle> = {
  hit: (get, part, pv) => {
    const c = circleOf(get, part.ref);
    const pl = part.plane ? get(part.plane) : undefined;
    if (!c || !pl || pl.kind !== "plane") return null;
    // sample the ring and take the nearest sample (exact enough for a pointer tolerance of a few pixels)
    let best = Infinity;
    const N = 96;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      const p = add(c.center, add(scale(pl.u, Math.cos(t) * c.radius), scale(pl.v, Math.sin(t) * c.radius)));
      const [x, y] = px(pv, p);
      best = Math.min(best, Math.hypot(pv.x - x, pv.y - y));
    }
    return best;
  },
  outline: (get, part) => {
    const c = circleOf(get, part.ref);
    const pl = part.plane ? get(part.plane) : undefined;
    return c && pl && pl.kind === "plane" ? { shape: "circle", center: c.center, radius: c.radius, normal: normalOfPlane(pl) } : { shape: "none" };
  },
  anchors: (part) => [part.center],
};
const noOps: KindOps<Part> = { hit: () => null, outline: () => ({ shape: "none" }), anchors: () => [] };

/** The registry: one entry per kind. Adding a kind means adding a row here; no other code changes. */
export const REGISTRY: { [K in Kind]: KindOps<Extract<Part, { kind: K }>> } = {
  corner: cornerOps,
  line: lineOps,
  circle: circleOps,
  face: noOps as KindOps<Face>,
  plane: noOps as KindOps<Plane>,
  axis: noOps as KindOps<Axis>,
  body: noOps as KindOps<Body>,
};
const ops = (p: Part): KindOps<Part> => REGISTRY[p.kind] as KindOps<Part>;
export const hitPart = (get: Lookup, p: Part, pv: PointerView) => ops(p).hit(get, p, pv);
export const outlineOf = (get: Lookup, p: Part) => ops(p).outline(get, p);
export const anchorsOf = (p: Part): Ref[] => ops(p).anchors(p);

/** The plane a relation between parts is solved in: the first part that lies on one. */
export const planeOfParts = (get: Lookup, refs: Ref[]): Plane | null => {
  for (const r of refs) {
    const p = get(r);
    const pl = p?.plane ? get(p.plane) : undefined;
    if (pl && pl.kind === "plane") return pl;
  }
  return null;
};

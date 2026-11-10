// The one part interface (`dec_clean_engine_design` section 2). Everything you can select is a Part: a plain record that saves as JSON,
// plus a registry of pure functions per kind. Drawn, body and world parts share the same accessors, so picking, drawing and relations
// never ask where a part came from.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { length, add, scale, sub, dot, cross, normalize } from "../math/vec.ts";

export type Kind = "corner" | "line" | "circle" | "face" | "plane" | "axis" | "body";
export type Origin = "drawn" | "body" | "world";

interface Base {
  ref: Ref;
  origin: Origin;
  /** The plane a drawn part lies on (null for parts that are not on one). A sketch is not a thing: it is only this field. */
  plane: Ref | null;
  /** True for drawn parts only: body and world parts are always references. */
  movable: boolean;
  /** a face or an edge of a body: the body it is in, when there are several (`dec_independent_bodies`) */
  of?: Ref;
}
export interface Corner extends Base { kind: "corner"; at: Vec3; /** a place where drawn curves cross (made when the faces are, never saved, not picked) */ derived?: boolean }
export interface Line extends Base { kind: "line"; a: Ref; b: Ref; /** a point halfway along a curved edge (body edges only; straight lines omit it) */ mid?: Vec3;
  /** a drawn arc: how far its middle is out from the chord, as a fraction of the chord's length (positive towards the plane's normal crossed with the chord's direction); a straight line omits it */ bulge?: number;
  /** a drawn arc about a centre point (a corner, so it can be positioned with constraints): the arc runs from `a` to `b` round `center`, counter-clockwise (seen from the plane's normal) or not; its radius is the distance from the centre to `a` */
  center?: Ref; ccw?: boolean;
  /** an arc of a circle that lines drawn across it cut into pieces (made when the faces are, never saved, not picked) */ derived?: boolean;
  /** a body edge that is (part of) a circle: the circle it lies on; the rim of a post or a hole */
  circle?: { center: Vec3; normal: Vec3; radius: number };
  /** a rim made of two half circles: the other half (picking one picks both) */
  twin?: Ref }
export interface Circle extends Base { kind: "circle"; center: Ref; radius: number }
/** A derived face of drawn lines: a closed loop (its lines and, in order, its corners), or a disk (a circle). Rebuilt from the lines; never saved. */
export interface Face extends Base { kind: "face"; loop: Ref[]; corners: Ref[]; disk?: Ref; /** closed figures drawn inside this one (the nearest ones): the region is this figure without them, so each figure and each ring between them is picked and extruded by itself */ holes?: Ref[]; /** one of the pieces a circle is cut into by lines drawn across it */ pieces?: boolean }
/** A plane you can look at, select and draw on. `infinite`: a world plane, hit anywhere on it (`in_116`). `extent`: a square pane from `at` to `at + extent` along u and v. `mesh`: a flat face of the body, as triangles (flat xyz). */
export interface Plane extends Base { kind: "plane"; at: Vec3; u: Vec3; v: Vec3; /** a plane made from a face of the body when something was drawn on it (`in_234`): what is drawn on it belongs to the body and goes with it when the whole body is moved, turned or scaled */ onBody?: true; extent?: number; infinite?: boolean; mesh?: readonly number[]; curved?: Curved; /** a curved face of the body that is not a full round post or hole (a cone, a sphere, a fillet, a turned post): it can be selected and looked at, nothing more yet; the name of its surface type */ rounded?: string; /** its radius, when it is part of a cylinder or a sphere */ radius?: number; /** a piece of a cylinder along a world axis (a wall cut from a circle): where its axis is, and whether it is a post (convex) or a hole */ round?: { axis: 0 | 1 | 2; center: Vec3; convex: boolean; /** the axis as a direction, when it is not along a world axis (a turned body); `axis` is then the nearest world axis */ dir?: Vec3 } }
/** A full round face of the body (a post or a hole) that stands along a world axis: it is selected and pushed / pulled like a face, which changes its radius. Its `at` is where its axis starts, `u` and `v` the other two directions. */
export interface Curved { axis: 0 | 1 | 2; /** the axis as a direction, when it is not along a world axis (a turned body) */ dir?: Vec3; center: Vec3; radius: number; lo: number; hi: number; /** a post (the surface faces away from its axis) or a hole */ convex: boolean }
export interface Axis extends Base { kind: "axis"; at: Vec3; dir: Vec3 }
export interface Body extends Base { kind: "body"; /** the name the body keeps through the history (the operation that made it) */ id?: string; /** how much room it takes, mm cubed */ volume?: number; /** the box round the whole body, as the kernel measures it (the middle of it is what a turn or a scale is about) */ bbox?: { min: Vec3; max: Vec3 } }
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
  /** The ray under the pointer (origin and unit direction), for surfaces. */
  ray?: { o: Vec3; d: Vec3 };
  /** looking straight at a plane (orthographic): a world plane is then hit anywhere on it */
  straight?: boolean;
  /** The ray under any other pixel (to ask whether a point is hidden behind a surface). */
  rayAt?: (x: number, y: number) => { o: Vec3; d: Vec3 };
}
/** What to draw for a part (the view reads this and knows no kinds). */
export type Outline =
  | { shape: "point"; at: Vec3 }
  | { shape: "segment"; a: Vec3; b: Vec3 }
  | { shape: "polyline"; pts: Vec3[] }
  | { shape: "circle"; center: Vec3; radius: number; normal: Vec3 }
  | { shape: "none" };

export interface KindOps<P extends Part> {
  /** Distance in pixels from the pointer to the part, or null if it cannot be hit (missing geometry). */
  hit(get: Lookup, part: P, pointer: PointerView): number | null;
  /** For surfaces: how far along the pointer's ray the part is hit (nearer is smaller), or null if the ray misses it. */
  depth?(get: Lookup, part: P, pointer: PointerView): number | null;
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
/** Points along the circular arc from `a` through `m` to `b` (a curved edge of the body), or just the two ends if they are in a line. */
/** The centre of the circle through three points (an arc's two ends and a point on it). Null if they are in a line. */
export function circumcentre(a: Vec3, m: Vec3, b: Vec3): Vec3 | null {
  const [ab, ac] = [sub(b, a), sub(m, a)];
  const n = cross(ab, ac);
  const nn = dot(n, n);
  if (nn < 1e-12) return null;
  return add(a, scale(add(scale(cross(n, ab), dot(ac, ac)), scale(cross(ac, n), dot(ab, ab))), 1 / (2 * nn)));
}
export function arcPoints(a: Vec3, m: Vec3, b: Vec3, steps = 40): Vec3[] {
  const [ab, ac] = [sub(b, a), sub(m, a)];
  const n = cross(ab, ac);
  const nn = dot(n, n);
  if (nn < 1e-12) return [a, b];
  // the centre of the circle through the three points
  const c = add(a, scale(add(scale(cross(n, ab), dot(ac, ac)), scale(cross(ac, n), dot(ab, ab))), 1 / (2 * nn)));
  const u = sub(a, c);
  const r = Math.hypot(...u);
  const e1 = scale(u, 1 / r);
  const nu = scale(n, 1 / Math.sqrt(nn));
  const e2 = cross(nu, e1);
  const ang = (p: Vec3) => Math.atan2(dot(sub(p, c), e2), dot(sub(p, c), e1));
  const tm = ang(m);
  let tb = ang(b);
  if (tm > 0) { while (tb <= tm) tb += 2 * Math.PI; } else { while (tb >= tm) tb -= 2 * Math.PI; }
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (tb * i) / steps;
    out.push(add(c, add(scale(e1, Math.cos(t) * r), scale(e2, Math.sin(t) * r))));
  }
  return out;
}
/** The point halfway along a curved line (a body's curved edge, or a drawn arc), or null for a straight one. */
export function curveMid(get: Lookup, part: Line): Vec3 | null {
  if (part.mid) return part.mid;
  if (part.center) {
    // an arc about a centre: from a to b round it, the way `ccw` says; its middle is half way round
    const [c, a, b] = [pointOf(get, part.center), pointOf(get, part.a), pointOf(get, part.b)];
    const pl = part.plane ? get(part.plane) : undefined;
    if (!c || !a || !b || !pl || pl.kind !== "plane") return null;
    const n = normalOfPlane(pl);
    const [ra, rb] = [sub(a, c), sub(b, c)];
    const theta = Math.atan2(dot(cross(ra, rb), n), dot(ra, rb)); // from a to b, counter-clockwise, in (-pi, pi]
    const sweep = part.ccw === false ? (theta > 0 ? theta - 2 * Math.PI : theta) : theta > 0 ? theta : theta + 2 * Math.PI;
    const h = sweep / 2;
    const [cs, sn] = [Math.cos(h), Math.sin(h)];
    return add(c, add(add(scale(ra, cs), scale(cross(n, ra), sn)), scale(n, dot(n, ra) * (1 - cs))));
  }
  if (!part.bulge) return null;
  const s = segmentOf(get, part.ref);
  const pl = part.plane ? get(part.plane) : undefined;
  if (!s || !pl || pl.kind !== "plane") return null;
  const chord = sub(s[1], s[0]);
  const len = length(chord);
  if (len < 1e-12) return null;
  const perp = cross(normalOfPlane(pl), scale(chord, 1 / len));
  return add(scale(add(s[0], s[1]), 0.5), scale(perp, part.bulge * len));
}
/** The corners of a closed drawn shape in order, each with the middle point of the arc that runs from it to the next corner (null for a straight side). */
export function loopSteps(get: Lookup, loop: readonly Ref[], corners: readonly Ref[]): { at: Vec3; mid: Vec3 | null }[] {
  const out: { at: Vec3; mid: Vec3 | null }[] = [];
  const lines = loop.map((r) => get(r)).filter((p): p is Line => p?.kind === "line");
  const used = new Set<Ref>(); // (an arc and its chord join the same two corners: each line is walked once)
  corners.forEach((c, i) => {
    const here = pointOf(get, c);
    if (!here) return;
    const next = corners[(i + 1) % corners.length]!;
    const line = lines.find((l) => !used.has(l.ref) && ((l.a === c && l.b === next) || (l.b === c && l.a === next)));
    if (line) used.add(line.ref);
    out.push({ at: here, mid: line ? curveMid(get, line) : null });
  });
  return out;
}
/** The corners of a closed drawn shape in order, with the points of any arcs between them (so the outline and the fill follow the curves). */
export function loopPoints(get: Lookup, loop: readonly Ref[], corners: readonly Ref[]): Vec3[] {
  const steps = loopSteps(get, loop, corners);
  const out: Vec3[] = [];
  steps.forEach((st, i) => {
    out.push(st.at);
    const next = steps[(i + 1) % steps.length]!.at;
    if (st.mid) out.push(...arcPoints(st.at, st.mid, next, 64).slice(1, -1));
  });
  return out;
}
/** The points round a circle of a body edge. */
const ringPoints = (c: NonNullable<Line["circle"]>, n = 96): Vec3[] => {
  const nu = normalize(c.normal);
  const u = normalize(cross(nu, Math.abs(nu[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  const v = cross(nu, u);
  return Array.from({ length: n + 1 }, (_, i): Vec3 => { const t = (i / n) * Math.PI * 2; return add(c.center, add(scale(u, Math.cos(t) * c.radius), scale(v, Math.sin(t) * c.radius))); });
};
const lineOps: KindOps<Line> = {
  hit: (get, part, pv) => {
    if (part.circle && part.a === part.b) {
      // a whole rim in one edge: the nearest of the pieces of its ring
      const q = ringPoints(part.circle).map((p) => px(pv, p));
      let best = Infinity;
      for (let i = 0; i + 1 < q.length; i++) best = Math.min(best, distToSegment2d([pv.x, pv.y], q[i]!, q[i + 1]!));
      return best;
    }
    const s = segmentOf(get, part.ref);
    if (!s) return null;
    const cm = curveMid(get, part);
    if (cm) {
      // a curved line: the nearest of the pieces of its arc
      const q = arcPoints(s[0], cm, s[1]).map((p) => px(pv, p));
      let best = Infinity;
      for (let i = 0; i + 1 < q.length; i++) best = Math.min(best, distToSegment2d([pv.x, pv.y], q[i]!, q[i + 1]!));
      return best;
    }
    return distToSegment2d([pv.x, pv.y], px(pv, s[0]), px(pv, s[1]));
  },
  outline: (get, part) => {
    if (part.circle && part.a === part.b) return { shape: "polyline", pts: ringPoints(part.circle) };
    const s = segmentOf(get, part.ref);
    if (!s) return { shape: "none" };
    const cm = curveMid(get, part);
    return cm ? { shape: "polyline", pts: arcPoints(s[0], cm, s[1]) } : { shape: "segment", a: s[0], b: s[1] };
  },
  anchors: (part) => (part.center ? [part.a, part.b, part.center] : [part.a, part.b]),
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

// ---- surfaces ----
const rayPlane = (pv: PointerView, at: Vec3, n: Vec3): number | null => {
  if (!pv.ray) return null;
  const den = dot(n, pv.ray.d);
  if (Math.abs(den) < 1e-9) return null;
  const t = dot(n, sub(at, pv.ray.o)) / den;
  return t > 0 ? t : null;
};
const pointAt = (pv: PointerView, t: number): Vec3 => add(pv.ray!.o, scale(pv.ray!.d, t));
export const inPolygon = (q: [number, number], poly: [number, number][]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i]!, poly[j]!];
    if (a[1] > q[1] !== b[1] > q[1] && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};
/** Moller-Trumbore: the distance along the ray to a triangle, or null. */
function rayTriangle(o: Vec3, d: Vec3, a: Vec3, b: Vec3, c: Vec3): number | null {
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const h = cross(d, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return null;
  const f = 1 / det;
  const s = sub(o, a);
  const u = f * dot(s, h);
  if (u < 0 || u > 1) return null;
  const q = cross(s, e1);
  const v = f * dot(d, q);
  if (v < 0 || u + v > 1) return null;
  const t = f * dot(e2, q);
  return t > 1e-9 ? t : null;
}
const planeOps: KindOps<Plane> = {
  hit: (get, part, pv) => (planeOps.depth!(get, part, pv) === null ? null : 0),
  depth: (_g, part, pv) => {
    if (!pv.ray) return null;
    if (part.mesh) {
      let best: number | null = null;
      const m = part.mesh;
      for (let i = 0; i + 8 < m.length; i += 9) {
        const t = rayTriangle(pv.ray.o, pv.ray.d, [m[i]!, m[i + 1]!, m[i + 2]!], [m[i + 3]!, m[i + 4]!, m[i + 5]!], [m[i + 6]!, m[i + 7]!, m[i + 8]!]);
        if (t !== null && (best === null || t < best)) best = t;
      }
      return best;
    }
    if (part.infinite) {
      // a world plane: all of it, from either side (the picking leaves out the two that are not on, `in_190`)
      return rayPlane(pv, part.at, normalOfPlane(part));
    }
    if (part.extent === undefined) return null;
    const t = rayPlane(pv, part.at, normalOfPlane(part));
    if (t === null) return null;
    const d = sub(pointAt(pv, t), part.at);
    const [x, y] = [dot(d, part.u), dot(d, part.v)];
    return x >= 0 && x <= part.extent && y >= 0 && y <= part.extent ? t : null;
  },
  outline: () => ({ shape: "none" }),
  anchors: () => [],
};
const faceOps: KindOps<Face> = {
  hit: (get, part, pv) => (faceOps.depth!(get, part, pv) === null ? null : 0),
  depth: (get, part, pv) => {
    const pl = part.plane ? get(part.plane) : undefined;
    if (!pl || pl.kind !== "plane") return null;
    const t = rayPlane(pv, pl.at, normalOfPlane(pl));
    if (t === null) return null;
    const d = sub(pointAt(pv, t), pl.at);
    const q: [number, number] = [dot(d, pl.u), dot(d, pl.v)];
    const within = (f: Face): boolean => {
      if (f.disk) {
        const c = circleOf(get, f.disk);
        if (!c) return false;
        const cd = sub(c.center, pl.at);
        return Math.hypot(q[0] - dot(cd, pl.u), q[1] - dot(cd, pl.v)) <= c.radius;
      }
      const poly = loopPoints(get, f.loop, f.corners).map((p): [number, number] => [dot(sub(p, pl.at), pl.u), dot(sub(p, pl.at), pl.v)]);
      return poly.length >= 3 && inPolygon(q, poly);
    };
    if (!within(part)) return null;
    // a figure drawn inside this one is not part of its region: the point must not be in any of them
    for (const h of part.holes ?? []) { const hf = get(h); if (hf?.kind === "face" && within(hf)) return null; }
    return t;
  },
  outline: () => ({ shape: "none" }),
  anchors: (part) => part.corners,
};
const noOps: KindOps<Part> = { hit: () => null, outline: () => ({ shape: "none" }), anchors: () => [] };

/** The registry: one entry per kind. Adding a kind means adding a row here; no other code changes. */
const REGISTRY: { [K in Kind]: KindOps<Extract<Part, { kind: K }>> } = {
  corner: cornerOps,
  line: lineOps,
  circle: circleOps,
  face: faceOps,
  plane: planeOps,
  axis: noOps as KindOps<Axis>,
  body: noOps as KindOps<Body>,
};
const ops = (p: Part): KindOps<Part> => REGISTRY[p.kind] as KindOps<Part>;
export const hitPart = (get: Lookup, p: Part, pv: PointerView) => ops(p).hit(get, p, pv);
export const depthOf = (get: Lookup, p: Part, pv: PointerView): number | null => ops(p).depth?.(get, p, pv) ?? null;
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

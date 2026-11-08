// What a fillet or chamfer is made of, for drawing one of another size without the kernel (`in_220`, `in_221`, `in_222`): its cross-section is the same shape at every size, scaled about the sharp edge (the line, or
// the circle, the two faces would meet in). This finds the sharp edges, checks they are of the kind where that holds (faces that are planes, or a plane across a coaxial cylinder), that a chain of them has no
// corners, and which faces of the body are the rounding of which edge. Pure: numbers in, numbers out.
import type { Vec3 } from "../math/vec.ts";
import { add, sub, scale, dot, cross, normalize } from "../math/vec.ts";
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "./scene.ts";
import type { Plane } from "./part.ts";
import { circumcentre, normalOfPlane } from "./part.ts";

/** Where the two faces would meet: a line, or a circle (about `axis` through `center`). */
type EdgeSharp =
  /** a line from `a` to `b`; an end that is a corner (another rounding meets it there) is scaled about that corner, since near it everything is scaled about the corner */
  | { kind: "line"; point: Vec3; dir: Vec3; a: Vec3; b: Vec3; cornerA: boolean; cornerB: boolean }
  | { kind: "circle"; center: Vec3; axis: Vec3; radius: number };
export type Sharp =
  | EdgeSharp
  /** the patch where roundings meet at a corner: scaled about the corner */
  | { kind: "point"; center: Vec3 }
  /** a prism (an extrusion or a push / pull that adds or cuts one) of another depth: the same shape stretched along its normal about the plane it stands on (`in_224`) */
  | { kind: "plane"; point: Vec3; normal: Vec3 };
export interface SharpEdge { sharp: EdgeSharp; a: Vec3; b: Vec3; /** a whole circle: its ends are one point and it has no tangent there to meet another edge at */ whole: boolean }

/** The sharp edge through these points of an edge of the body (its ends and its middle, and its circle if the kernel says it is one); null if it is neither a line nor a circle. */
export function sharpOfPoints(a: Vec3, b: Vec3, mid: Vec3 | null, circle?: { center: Vec3; normal: Vec3; radius: number }): SharpEdge | null {
  if (circle) return { sharp: { kind: "circle", center: circle.center, axis: normalize(circle.normal), radius: circle.radius }, a, b, whole: Math.hypot(...sub(a, b)) < 1e-6 };
  const len = Math.hypot(...sub(b, a));
  if (len < 1e-9) return null;
  if (!mid || Math.hypot(...sub(mid, scale(add(a, b), 0.5))) < 1e-3 * Math.max(1, len)) return { sharp: { kind: "line", point: a, dir: normalize(sub(b, a)), a, b, cornerA: false, cornerB: false }, a, b, whole: false };
  const c = circumcentre(a, mid, b);
  if (!c) return null;
  const axis = normalize(cross(sub(b, a), sub(mid, a)));
  return { sharp: { kind: "circle", center: c, axis, radius: Math.hypot(...sub(a, c)) }, a, b, whole: false };
}

/** The way the edge runs at one of its ends (away from the end), as a unit vector. */
function tangentAt(e: SharpEdge, end: Vec3): Vec3 {
  const s = e.sharp;
  if (s.kind === "line") return Math.hypot(...sub(end, e.a)) < Math.hypot(...sub(end, e.b)) ? s.dir : scale(s.dir, -1);
  const r = sub(end, s.center);
  const t = normalize(cross(s.axis, r));
  // the arc goes from a to b the way that passes its middle: which way round that is does not matter for meeting another edge, only that the tangent is along the curve (the sign is taken from the other end)
  return t;
}

const keyOf = (p: Vec3) => p.map((v) => Math.round(v * 1e3)).join(",");

/**
 * Edges that meet end to end: where two meet smoothly nothing is special (each rounding is its own, and the points where two meet are the same either way); where they meet in a corner (two that turn, or three or
 * more) everything near the corner is the same shape at every size, scaled about the corner, as long as the edges are straight (the faces there are planes). Returns the edges with their corner ends marked and the
 * corners, or null if some junction is neither (a curved edge in a corner) or an edge between corners is shorter than `ratio` times the biggest rounding that will be shown (`size`): a fillet needs about twice its size at each end, a chamfer's flat patch at a corner is told from its strips by distance, so it needs more.
 */
export function chainOf(edges: SharpEdge[], size: number, ratio = 4): { edges: SharpEdge[]; corners: Vec3[] } | null {
  const at = new Map<string, { e: SharpEdge; end: Vec3 }[]>();
  for (const e of edges) {
    if (e.whole) continue;
    for (const end of [e.a, e.b]) at.set(keyOf(end), [...(at.get(keyOf(end)) ?? []), { e, end }]);
  }
  const corners = new Map<string, Vec3>();
  for (const [k, list] of at) {
    if (list.length === 1) continue;
    const smooth = list.length === 2 && Math.abs(dot(tangentAt(list[0]!.e, list[0]!.end), tangentAt(list[1]!.e, list[1]!.end))) >= 0.9995;
    if (smooth) continue;
    if (list.some((x) => x.e.sharp.kind !== "line")) return null;
    corners.set(k, list[0]!.end);
  }
  let tooShort = false;
  const marked = edges.map((e): SharpEdge => {
    if (e.sharp.kind !== "line") return e;
    const [cA, cB] = [corners.has(keyOf(e.a)), corners.has(keyOf(e.b))];
    if ((cA || cB) && Math.hypot(...sub(e.b, e.a)) < ratio * size) tooShort = true;
    return { ...e, sharp: { ...e.sharp, cornerA: cA, cornerB: cB } };
  });
  if (tooShort) return null;
  return { edges: marked, corners: [...corners.values()] };
}

/** At a corner the faces are all planes (so everything there scales about it): every edge of the body that ends there is straight and there are as many flat faces through it as edges. */
export function cornerOk(scene: Scene, v: Vec3): boolean {
  const lines = Object.values(scene.parts).filter((p) => p.kind === "line" && p.origin === "body").filter((l) => {
    const [a, b] = [scene.parts[l.kind === "line" ? l.a : ""], scene.parts[l.kind === "line" ? l.b : ""]];
    return [a, b].some((c) => c?.kind === "corner" && Math.hypot(...sub(c.at, v)) < 2e-3);
  });
  if (!lines.length || lines.some((l) => l.kind !== "line" || l.mid || l.circle)) return false;
  return flatFaces(scene).filter((f) => Math.abs(dot(normalOfPlane(f), sub(v, f.at))) < 1e-3).length === lines.length;
}

const flatFaces = (scene: Scene): Plane[] => Object.values(scene.parts).filter((p): p is Plane => p.kind === "plane" && p.origin === "body" && !p.curved && !p.rounded);
const onFace = (f: Plane, pts: Vec3[]) => pts.every((p) => Math.abs(dot(normalOfPlane(f), sub(p, f.at))) < 1e-3);

/** Is the edge between faces for which the rounding is the same shape at every size: two flat faces for a line, a flat face across the axis and a cylinder about it for a circle. */
export function adjacentOk(scene: Scene, e: SharpEdge, mid: Vec3 | null): boolean {
  const pts = [e.a, e.b, ...(mid ? [mid] : [])];
  const flats = flatFaces(scene).filter((f) => onFace(f, pts));
  if (e.sharp.kind === "line") return flats.length >= 2 && flats.some((f, i) => flats.some((g, j) => j > i && Math.abs(dot(normalOfPlane(f), normalOfPlane(g))) < 0.9999));
  const s = e.sharp;
  if (!flats.some((f) => Math.abs(Math.abs(dot(normalOfPlane(f), s.axis)) - 1) < 1e-4)) return false;
  return Object.values(scene.parts).some((p) => {
    if (p.kind !== "plane" || p.origin !== "body") return false;
    const c = p.curved ?? (p.rounded === "CYLINDRE" && p.round && p.radius ? { axis: p.round.axis, center: p.round.center, radius: p.radius, dir: p.round.dir } : null);
    if (!c) return false;
    const ax: Vec3 = (c as { dir?: Vec3 }).dir ?? (c.axis === 0 ? [1, 0, 0] : c.axis === 1 ? [0, 1, 0] : [0, 0, 1]);
    const off = sub(c.center, s.center);
    return Math.abs(Math.abs(dot(ax, s.axis)) - 1) < 1e-4 && Math.abs(c.radius - s.radius) < 2e-3 && Math.hypot(...sub(off, scale(s.axis, dot(off, s.axis)))) < 2e-3;
  });
}

/** How far a point is from the sharp edge. */
function distanceTo(s: Sharp, p: Vec3): number {
  if (s.kind === "point") return Math.hypot(...sub(p, s.center));
  if (s.kind === "plane") return Math.abs(dot(sub(p, s.point), s.normal));
  if (s.kind === "line") { const d = sub(p, s.point); return Math.hypot(...sub(d, scale(s.dir, dot(d, s.dir)))); }
  const d = sub(p, s.center);
  const z = dot(d, s.axis);
  return Math.hypot(Math.hypot(...sub(d, scale(s.axis, z))) - s.radius, z);
}

/** Which of the body's faces are the rounding of which edge: the faces whose points all lie within `reach` of one edge (the faces beside it run on much further), each given to the nearest edge. */
export function roundingFaces(scene: Scene, edges: SharpEdge[], reach: number, skip: (r: Ref) => boolean = () => false, corners: Vec3[] = []): { face: Ref; edge: number; corner?: Vec3 }[] {
  const out: { face: Ref; edge: number; corner?: Vec3 }[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "plane" || p.origin !== "body" || !p.mesh || p.mesh.length < 9 || skip(p.ref)) continue;
    if (p.rounded && !["CYLINDRE", "TORUS", "CONE", "SPHERE"].includes(p.rounded)) continue;
    // the patch at a corner lies close round the corner; a strip along an edge runs on much further (the edges are longer than that: `chainOf`)
    // a fillet's patch where three meet is a sphere, told by its kind; a chamfer's is as flat as its strips, told by lying close round the corner
    const sphere = p.rounded === "SPHERE" && corners.length > 0;
    if (sphere) {
      let [cx, cy, cz, n] = [0, 0, 0, 0];
      for (let k = 0; k + 2 < p.mesh.length; k += 3) { cx += p.mesh[k]!; cy += p.mesh[k + 1]!; cz += p.mesh[k + 2]!; n++; }
      const mid: Vec3 = [cx / n, cy / n, cz / n];
      out.push({ face: p.ref, edge: -1, corner: corners.reduce((a, b) => (Math.hypot(...sub(b, mid)) < Math.hypot(...sub(a, mid)) ? b : a)) });
      continue;
    }
    const near = p.rounded ? undefined : corners.find((v) => { for (let k = 0; k + 2 < p.mesh!.length; k += 3) if (Math.hypot(...sub([p.mesh![k]!, p.mesh![k + 1]!, p.mesh![k + 2]!], v)) > 2.2 * (reach / 3)) return false; return true; });
    if (near) { out.push({ face: p.ref, edge: -1, corner: near }); continue; }
    let best = -1;
    let bestMean = Infinity;
    edges.forEach((e, i) => {
      let max = 0;
      let sum = 0;
      let n = 0;
      for (let k = 0; k + 2 < p.mesh!.length; k += 3) { const d = distanceTo(e.sharp, [p.mesh![k]!, p.mesh![k + 1]!, p.mesh![k + 2]!]); max = Math.max(max, d); sum += d; n++; }
      if (max <= reach && sum / n < bestMean) { best = i; bestMean = sum / n; }
    });
    if (best >= 0) out.push({ face: p.ref, edge: best });
  }
  return out;
}

/**
 * The circle a whole-circle rim was, from the name its step keeps (its start and the point opposite it, so the middle and the radius) and the one flat face of the body that has both points in it: the circle lies
 * across the axis, in the plane of the face the rounding was cut from (the name does not say which way the circle faces). Null if no flat face, or more than one, has both points.
 */
export function circleOfRim(scene: Scene, a: Vec3, opposite: Vec3): SharpEdge | null {
  const center = scale(add(a, opposite), 0.5);
  const radius = Math.hypot(...sub(a, opposite)) / 2;
  const flats = flatFaces(scene).filter((f) => onFace(f, [a, opposite]));
  if (flats.length !== 1) return null;
  return { sharp: { kind: "circle", center, axis: normalOfPlane(flats[0]!), radius }, a, b: a, whole: true };
}

/**
 * The edges of the body the kernel rounds along with these (`in_231`): a fillet or chamfer goes on along the edges that meet the chosen one smoothly (a rim of lines and arcs on one flat face is rounded all
 * the way round from one edge). Found the same way: edges that meet end to end where they run on into each other, and lie in a flat face together. The chosen ones come first.
 */
export function tangentChain(scene: Scene, start: readonly Ref[]): Ref[] {
  const lines = Object.values(scene.parts).filter((p) => p.kind === "line" && p.origin === "body");
  const info = new Map<Ref, SharpEdge>();
  for (const l of lines) {
    if (l.kind !== "line") continue;
    const [pa, pb] = [scene.parts[l.a], scene.parts[l.b]];
    if (pa?.kind !== "corner" || pb?.kind !== "corner") continue;
    const e = sharpOfPoints(pa.at, pb.at, l.mid ?? null, l.circle);
    if (e) info.set(l.ref, e);
  }
  const flats = flatFaces(scene);
  const out: Ref[] = [...start];
  const seen = new Set<Ref>(start);
  for (let i = 0; i < out.length; i++) {
    const e = info.get(out[i]!);
    if (!e || e.whole) continue;
    for (const end of [e.a, e.b]) {
      for (const [ref, o] of info) {
        if (seen.has(ref) || o.whole) continue;
        const touches = [o.a, o.b].find((q) => Math.hypot(...sub(q, end)) < 2e-3);
        if (!touches) continue;
        if (Math.abs(dot(tangentAt(e, end), tangentAt(o, touches))) < 0.9995) continue;
        if (!flats.some((f) => onFace(f, [e.a, e.b, o.a, o.b]))) continue;
        seen.add(ref);
        out.push(ref);
      }
    }
  }
  return out;
}

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
export type Sharp = { kind: "line"; point: Vec3; dir: Vec3 } | { kind: "circle"; center: Vec3; axis: Vec3; radius: number };
export interface SharpEdge { sharp: Sharp; a: Vec3; b: Vec3; /** a whole circle: its ends are one point and it has no tangent there to meet another edge at */ whole: boolean }

/** The sharp edge through these points of an edge of the body (its ends and its middle, and its circle if the kernel says it is one); null if it is neither a line nor a circle. */
export function sharpOfPoints(a: Vec3, b: Vec3, mid: Vec3 | null, circle?: { center: Vec3; normal: Vec3; radius: number }): SharpEdge | null {
  if (circle) return { sharp: { kind: "circle", center: circle.center, axis: normalize(circle.normal), radius: circle.radius }, a, b, whole: Math.hypot(...sub(a, b)) < 1e-6 };
  const len = Math.hypot(...sub(b, a));
  if (len < 1e-9) return null;
  if (!mid || Math.hypot(...sub(mid, scale(add(a, b), 0.5))) < 1e-3 * Math.max(1, len)) return { sharp: { kind: "line", point: a, dir: normalize(sub(b, a)) }, a, b, whole: false };
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

/** Edges that meet only end to end and smoothly (no corner between two of them, no end shared by three): then each rounding is its own, and the points where two meet are the same either way. */
export function smoothChain(edges: SharpEdge[]): boolean {
  const at = new Map<string, { e: SharpEdge; end: Vec3 }[]>();
  const key = (p: Vec3) => p.map((v) => Math.round(v * 1e3)).join(",");
  for (const e of edges) {
    if (e.whole) continue;
    for (const end of [e.a, e.b]) at.set(key(end), [...(at.get(key(end)) ?? []), { e, end }]);
  }
  for (const list of at.values()) {
    if (list.length > 2) return false;
    if (list.length === 2) { const [p, q] = [tangentAt(list[0]!.e, list[0]!.end), tangentAt(list[1]!.e, list[1]!.end)]; if (Math.abs(dot(p, q)) < 0.9995) return false; }
  }
  return true;
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
export function distanceTo(s: Sharp, p: Vec3): number {
  if (s.kind === "line") { const d = sub(p, s.point); return Math.hypot(...sub(d, scale(s.dir, dot(d, s.dir)))); }
  const d = sub(p, s.center);
  const z = dot(d, s.axis);
  return Math.hypot(Math.hypot(...sub(d, scale(s.axis, z))) - s.radius, z);
}

/** Which of the body's faces are the rounding of which edge: the faces whose points all lie within `reach` of one edge (the faces beside it run on much further), each given to the nearest edge. */
export function roundingFaces(scene: Scene, edges: SharpEdge[], reach: number, skip: (r: Ref) => boolean = () => false): { face: Ref; edge: number }[] {
  const out: { face: Ref; edge: number }[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "plane" || p.origin !== "body" || !p.mesh || p.mesh.length < 9 || skip(p.ref)) continue;
    if (p.rounded && !["CYLINDRE", "TORUS", "CONE"].includes(p.rounded)) continue;
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

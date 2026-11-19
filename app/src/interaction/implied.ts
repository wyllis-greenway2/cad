// A mate that the constraints of a sketch already make true (`inv_constraint_uniformity`, `in_1108`): a sketch circle held concentric with the rim of a body (or tangent to it) already makes the body made from the circle's wall coaxial (or tangent) with that body.
// So asking for the mate says so, and shows the constraint (it flashes green), instead of adding a second constraint that says the same. Pure: the scene in, the ids of the relations out.
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { dot, sub, length, normalize } from "../math/vec.ts";
import { roundOf, normalOfPlane, segmentOf } from "../operation/part.ts";
import type { MateMode } from "../operation/mates.ts";

/** The mates a sketch relation between two circles makes true (a circle is a sketch circle, or the rim or the wall of a body). */
const MAKES: Record<string, readonly MateMode[]> = { concentric: ["coaxial", "parallelAxes"], tangent: ["tangent", "parallelAxes"] };
const TOL = 1e-3;

interface Circle { center: Vec3; radius: number; normal: Vec3 }
/** A part as a circle in space: a face or a rim of a body (its own axis), or a sketch circle (the normal of the plane it is drawn on). */
function circleOf(scene: Scene, ref: Ref, anchors?: Record<string, { center?: Vec3; radius?: number; normal?: Vec3 }>): Circle | null {
  const get = lookup(scene);
  const r = roundOf(get, ref);
  if (!r) { // (a rim that a relation was made to and that has since been named another way: the relation kept its circle)
    const k = anchors?.[ref];
    return k?.center && k.radius !== undefined && k.normal ? { center: k.center, radius: k.radius, normal: normalize(k.normal) } : null;
  }
  const p = get(ref);
  const normal = r.normal ?? (p?.kind === "circle" && p.plane ? (() => { const pl = get(p.plane); return pl?.kind === "plane" ? normalOfPlane(pl) : null; })() : null);
  return normal ? { center: r.center, radius: r.radius, normal: normalize(normal) } : null;
}
/** The same circle's axis and size: the axes are one line (the other's centre lies on it, the normals are parallel) and the radii are equal; a wall and a rim, or a sketch circle and the wall made from it. */
const sameCircle = (a: Circle, b: Circle): boolean => {
  const w = sub(b.center, a.center);
  const along = dot(w, a.normal);
  const off = length([w[0] - a.normal[0] * along, w[1] - a.normal[1] * along, w[2] - a.normal[2] * along]);
  return Math.abs(Math.abs(dot(a.normal, b.normal)) - 1) < 1e-6 && off < TOL && Math.abs(a.radius - b.radius) < TOL;
};

/** A flat face of a body that a sketch line lies in: the line's ends are in its plane (the wall that was made from the line, or any face that carries it). */
function faceHoldsLine(scene: Scene, face: Ref, line: Ref): Vec3 | null {
  const get = lookup(scene);
  const p = get(face);
  const seg = segmentOf(get, line);
  if (!seg || p?.kind !== "plane" || p.origin !== "body" || p.curved || p.round) return null;
  const n = normalOfPlane(p);
  return seg.every((q) => Math.abs(dot(sub(q, p.at), n)) < TOL) ? n : null;
}

/** The relations of the scene that already make this mate true between these two faces (or circular edges) of bodies: their ids, none when nothing does. */
export function impliedMate(scene: Scene, mode: MateMode, a: Ref, b: Ref): string[] {
  const [A, B] = [circleOf(scene, a), circleOf(scene, b)]; // (null for a flat face)
  const found: string[] = [];
  for (const r of scene.relations) {
    if (!A || !B || r.parts.length !== 2 || !MAKES[r.kind]?.includes(mode)) continue;
    const [p, q] = [circleOf(scene, r.parts[0]!, r.anchors), circleOf(scene, r.parts[1]!, r.anchors)];
    if (!p || !q) continue;
    if ((sameCircle(p, A) && sameCircle(q, B)) || (sameCircle(p, B) && sameCircle(q, A))) found.push(r.id);
  }
  // a sketch line held tangent to a circle: the flat face that carries the line is tangent to the round face the circle is the section of (a wall made from the line, and a post or hole made from or standing at the circle)
  if (mode === "tangent") {
    for (const r of scene.relations) {
      if (r.kind !== "tangent" || r.parts.length !== 2) continue;
      const [line, round] = scene.parts[r.parts[0]!]?.kind === "line" ? [r.parts[0]!, r.parts[1]!] : [r.parts[1]!, r.parts[0]!];
      const C = circleOf(scene, round, r.anchors);
      if (!C || scene.parts[line]?.kind !== "line") continue;
      for (const [flat, CC] of [[a, B], [b, A]] as const) {
        const n = faceHoldsLine(scene, flat, line);
        if (n && CC && sameCircle(C, CC) && Math.abs(dot(n, C.normal)) < 1e-6) found.push(r.id); // (the face is across the circle's axis: along it)
      }
    }
  }
  return [...new Set(found)];
}

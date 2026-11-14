// The tape measure (`in_338`): what two faces (or one) of the bodies are to each other, read only. The numbers a mate can leave (the gap, the distance, the offset of axes, the angle) were once over two selected faces; they are
// here now, shown on request. Pure: the scene and the selection in, bubbles (annotations) out.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot, cross, normalize, length } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import { featureOf, faceMiddle } from "../operation/mates.ts";
import type { MateFeature } from "../operation/mates.ts";
import { surfaceTriangles } from "./surfaces.ts";
import type { Annotation } from "./annotations.ts";

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const deg = (rad: number) => r4((rad * 180) / Math.PI);
/** The angle between two directions as lines, in degrees (0 to 90). */
const lineAngle = (a: Vec3, b: Vec3): number => deg(Math.acos(Math.min(1, Math.abs(dot(normalize(a), normalize(b))))));

interface Reading { tag: string; value: number; unit: "mm" | "deg" | "mm²" }

/** The numbers two faces of two bodies have between them. */
export function readingsBetween(scene: Scene, a: Ref, b: Ref): Reading[] {
  const flat = [featureOf(scene, a, "flush"), featureOf(scene, b, "flush")];
  const round = [featureOf(scene, a, "coaxial"), featureOf(scene, b, "coaxial")];
  const out: Reading[] = [];
  if (flat[0] && flat[1]) {
    const [fa, fb] = [flat[0], flat[1]];
    const angle = lineAngle(fa.dir, fb.dir);
    out.push({ tag: "angle", value: angle, unit: "deg" });
    if (angle < 1e-3) out.push({ tag: "distance", value: r4(Math.abs(dot(sub(fa.point, fb.point), fb.dir))), unit: "mm" }); // (planes that are parallel are a distance apart)
    return out;
  }
  if (round[0] && round[1]) {
    const [fa, fb] = [round[0], round[1]];
    out.push({ tag: "angle", value: lineAngle(fa.dir, fb.dir), unit: "deg" });
    out.push({ tag: "offset", value: r4(axesApart(fa, fb)), unit: "mm" });
    return out;
  }
  const [f, ax] = flat[0] && round[1] ? [flat[0], round[1]] : flat[1] && round[0] ? [flat[1], round[0]] : [null, null];
  if (f && ax) out.push({ tag: "axis to face", value: r4(90 - lineAngle(f.dir, ax.dir)), unit: "deg" }); // (90: the axis stands at a right angle to the face)
  return out;
}
/** How far apart two axes are: the distance between the lines (the distance of a point of one from the other when they are parallel). */
function axesApart(a: MateFeature, b: MateFeature): number {
  const n = cross(a.dir, b.dir);
  const w = sub(a.point, b.point);
  if (length(n) < 1e-9) { const along = dot(w, normalize(b.dir)); const d = normalize(b.dir); return length([w[0] - d[0] * along, w[1] - d[1] * along, w[2] - d[2] * along]); }
  return Math.abs(dot(w, normalize(n)));
}
/** The numbers one face has: the area of a flat one, the radius and diameter of a round one. */
export function readingsOf(scene: Scene, ref: Ref): Reading[] {
  const p = scene.parts[ref];
  if (p?.kind !== "plane" || p.origin !== "body") return [];
  const round = featureOf(scene, ref, "coaxial");
  if (round && round.radius > 0) return [{ tag: "radius", value: r4(round.radius), unit: "mm" }, { tag: "diameter", value: r4(2 * round.radius), unit: "mm" }];
  const tris = surfaceTriangles(lookup(scene), p);
  if (!tris || tris.length < 9) return [];
  let area = 0;
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const [u, v]: [Vec3, Vec3] = [[tris[i + 3]! - tris[i]!, tris[i + 4]! - tris[i + 1]!, tris[i + 5]! - tris[i + 2]!], [tris[i + 6]! - tris[i]!, tris[i + 7]! - tris[i + 1]!, tris[i + 8]! - tris[i + 2]!]];
    area += length(cross(u, v)) / 2;
  }
  return [{ tag: "area", value: r4(area), unit: "mm²" }];
}

/** The bubbles of the tape measure for the selected faces: read only, one under the other where the faces are. */
export function tapeAnnotations(scene: Scene, selection: readonly Ref[]): Annotation[] {
  const faces = selection.filter((r) => scene.parts[r]?.kind === "plane" && scene.parts[r]?.origin === "body");
  if (!faces.length || faces.length > 2) return [];
  const readings = faces.length === 2 ? readingsBetween(scene, faces[0]!, faces[1]!) : readingsOf(scene, faces[0]!);
  const at = (faces.length === 2 ? midpoint(faceMiddle(scene, faces[0]!), faceMiddle(scene, faces[1]!)) : faceMiddle(scene, faces[0]!)) ?? null;
  if (!at) return [];
  return readings.map((r, k): Annotation => ({ id: `tape:${k}`, relationId: null, kind: "tape", label: `Tape measure: ${r.tag}`, at, value: r.value, unit: r.unit, locked: false, editable: false, readOnly: true, broken: false, open: false, tag: r.tag, stack: k, others: [], lines: faces.length === 2 ? [[faceMiddle(scene, faces[0]!) ?? at, faceMiddle(scene, faces[1]!) ?? at]] : [] }));
}
const midpoint = (a: Vec3 | null, b: Vec3 | null): Vec3 | null => (a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] : a ?? b);

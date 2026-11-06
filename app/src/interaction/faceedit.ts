// Pulling or pushing a face the body already has (`in_171`, `in_173`, `q_face_edit_model`): instead of adding a prism at that face (which invents new faces where the neighbours do not follow),
// change the step that made the face, so the steps after it are worked out again and nothing new is made: the end of an extrusion changes the extrusion's depth; the wall of an extruded
// circle (a post, or the wall of a hole) changes that circle's radius, so a chamfer on its rim goes with it. Where the step that made the face cannot be told, the old way (a prism) is used.
import type { Ref } from "../shared/ref.ts";
import { dot } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import type { Plane, Curved } from "../operation/part.ts";
import { normalOfPlane } from "../operation/part.ts";

/** What a face is the result of, and what to change to move it. */
export type FaceEdit =
  | { kind: "depth"; step: string; depth: number; /** +1 when pulling the face out lengthens the extrusion */ along: 1 | -1 }
  | { kind: "radius"; circle: Ref; radius: number; convex: boolean; /** a locked diameter on the circle, which has to be the one changed */ diameter?: string };

const near = (a: number, b: number, tol = 1e-3) => Math.abs(a - b) <= tol;

/** The extrusion whose end is this flat face of the body, if exactly one is. */
function endOfExtrusion(scene: Scene, face: Extract<ReturnType<typeof faceOf>, object>): FaceEdit | null {
  const nf = normalOfPlane(face);
  const found: FaceEdit[] = [];
  for (const st of scene.steps) {
    if (st.type !== "extrude") continue;
    const part = scene.parts[st.parts[0] ?? ""];
    const pl = part?.plane ? scene.parts[part.plane] : undefined;
    if (!pl || pl.kind !== "plane") continue;
    const n = normalOfPlane(pl);
    const depth = Number(st.params.depth);
    const dn = dot(nf, n);
    if (!Number.isFinite(depth) || Math.abs(Math.abs(dn) - 1) > 1e-6) continue;
    if (near(dot(n, face.at), dot(n, pl.at) + depth)) found.push({ kind: "depth", step: st.id, depth, along: dn > 0 ? 1 : -1 });
  }
  return found.length === 1 ? found[0]! : null;
}

/** The extruded circle whose wall this round face is, if exactly one is. */
function wallOfCircle(scene: Scene, c: Curved): FaceEdit | null {
  const found: FaceEdit[] = [];
  for (const st of scene.steps) {
    if (st.type !== "extrude") continue;
    for (const ref of st.parts) {
      const part = scene.parts[ref];
      if (part?.kind !== "circle") continue;
      const pl = part.plane ? scene.parts[part.plane] : undefined;
      const centre = scene.parts[part.center];
      if (!pl || pl.kind !== "plane" || centre?.kind !== "corner") continue;
      const n = normalOfPlane(pl);
      if (Math.abs(Math.abs(n[c.axis]!) - 1) > 1e-6 || !near(part.radius, c.radius)) continue;
      if ([0, 1, 2].some((i) => i !== c.axis && !near(centre.at[i]!, c.center[i]!))) continue;
      const rel = scene.relations.find((r) => r.kind === "diameter" && r.parts.length === 1 && r.parts[0] === ref && r.locked !== false);
      found.push({ kind: "radius", circle: ref, radius: part.radius, convex: c.convex, ...(rel ? { diameter: rel.id } : {}) });
    }
  }
  return found.length === 1 ? found[0]! : null;
}

const faceOf = (scene: Scene, ref: Ref): Plane | null => { const p = scene.parts[ref]; return p?.kind === "plane" ? p : null; };

/** What editing this face of the body would change, or null when the step that made it cannot be told (then a prism is added, as before). */
export function faceEdit(scene: Scene, ref: Ref): FaceEdit | null {
  const f = faceOf(scene, ref);
  if (!f || f.origin !== "body") return null;
  if (f.curved) return wallOfCircle(scene, f.curved);
  if (f.rounded || !f.mesh) return null;
  return endOfExtrusion(scene, f);
}

/** The command that moves the face by `v` along its outward normal (a negative `v` pushes it in), or null when that is no size at all. */
export function editCommand(edit: FaceEdit, v: number): Command | null {
  if (edit.kind === "depth") {
    const depth = edit.depth + v * edit.along;
    return Math.abs(depth) < 1e-6 ? null : { type: "setStepParams", id: edit.step, params: { depth: Math.round(depth * 1e6) / 1e6 } };
  }
  const radius = Math.round((edit.radius + (edit.convex ? v : -v)) * 1e6) / 1e6;
  if (!(radius > 1e-6)) return null;
  return edit.diameter ? { type: "setRelationValue", id: edit.diameter, value: 2 * radius, locked: true } : { type: "setRadius", ref: edit.circle, radius };
}

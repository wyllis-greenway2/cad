// Pulling or pushing a face the body already has (`in_171`, `in_173`, `q_face_edit_model`): instead of adding a prism at that face (which invents new faces where the neighbours do not follow),
// change the step that made the face, so the steps after it are worked out again and nothing new is made: the end of an extrusion changes the extrusion's depth; the wall of an extruded
// circle (a post, or the wall of a hole) changes that circle's radius, so a chamfer on its rim goes with it. Where the step that made the face cannot be told, the old way (a prism) is used.
import type { Ref } from "../shared/ref.ts";
import { dot } from "../math/vec.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import type { Plane, Curved } from "../operation/part.ts";
import { normalOfPlane } from "../operation/part.ts";

/** What a face is the result of, and what to change to move it. */
export type FaceEdit =
  | { kind: "depth"; step: string; depth: number; /** +1 when pulling the face out lengthens the extrusion */ along: 1 | -1 }
  /** the end of an earlier push / pull (a prism step): its depth */
  | { kind: "stepDepth"; step: string; depth: number }
  /** the side of an extruded sketch: the sketch's corners on that side move along the face's outward normal */
  | { kind: "side"; corners: Ref[]; normal: Vec3 }
  /** a fillet or chamfer face: the size of the step that rounded or bevelled the edge (pulling the face out towards the sharp corner makes it smaller) */
  | { kind: "edgeSize"; step: string; value: number }
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

/** The end of a push / pull step that made this flat face (a prism that was added at an earlier face), if exactly one did. */
function endOfPrism(scene: Scene, face: Plane): FaceEdit | null {
  const nf = normalOfPlane(face);
  const found: FaceEdit[] = [];
  for (const st of scene.steps) {
    if (st.type !== "pushPull") continue;
    const n: Vec3 = [Number(st.params.nx), Number(st.params.ny), Number(st.params.nz)];
    const depth = Number(st.params.depth);
    const fd = Number(st.params.fd);
    if (![...n, depth, fd].every(Number.isFinite) || dot(n, nf) < 1 - 1e-6) continue;
    if (near(dot(nf, face.at), fd + depth)) found.push({ kind: "stepDepth", step: st.id, depth });
  }
  return found.length === 1 ? found[0]! : null;
}

/** The side of an extruded sketch: its lines that lie in this face's plane, if they all belong to one extrusion. */
function sideOfSketch(scene: Scene, face: Plane): FaceEdit | null {
  const nf = normalOfPlane(face);
  const d = dot(nf, face.at);
  const owners = new Set<string>();
  const corners = new Set<Ref>();
  for (const st of scene.steps) {
    if (st.type !== "extrude") continue;
    for (const ref of st.parts) {
      const l = scene.parts[ref];
      if (l?.kind !== "line" || l.center || l.bulge) continue;
      const [a, b] = [scene.parts[l.a], scene.parts[l.b]];
      if (a?.kind !== "corner" || b?.kind !== "corner" || !a.movable || !b.movable) continue;
      const pl = l.plane ? scene.parts[l.plane] : undefined;
      if (!pl || pl.kind !== "plane" || Math.abs(dot(normalOfPlane(pl), nf)) > 1e-6) continue; // the face stands on the sketch's plane
      if (near(dot(nf, a.at), d) && near(dot(nf, b.at), d)) { owners.add(st.id); corners.add(l.a); corners.add(l.b); }
    }
  }
  return owners.size === 1 ? { kind: "side", corners: [...corners], normal: nf } : null;
}

/** The step that rounded or bevelled the edge this face is the fillet or chamfer of: the one whose size is the smallest extent of the face, if exactly one is. */
function edgeStep(scene: Scene, face: Plane): FaceEdit | null {
  const m = face.mesh;
  if (!m || m.length < 9) return null;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < m.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, m[i + k]!); hi[k] = Math.max(hi[k]!, m[i + k]!); }
  const size = Math.min(...[0, 1, 2].map((k) => hi[k]! - lo[k]!));
  const found: FaceEdit[] = [];
  for (const st of scene.steps) {
    if (st.type !== "edgeMod") continue;
    const value = Number(st.params.value);
    if (Number.isFinite(value) && near(value, size, 2e-3)) found.push({ kind: "edgeSize", step: st.id, value });
  }
  return found.length === 1 ? found[0]! : null;
}

/** What editing this face of the body would change, or null when the step that made it cannot be told (then a prism is added, as before). */
export function faceEdit(scene: Scene, ref: Ref): FaceEdit | null {
  const f = faceOf(scene, ref);
  if (!f || f.origin !== "body") return null;
  if (f.curved) return wallOfCircle(scene, f.curved);
  if (f.rounded) return edgeStep(scene, f);
  if (!f.mesh) return null;
  const n = normalOfPlane(f);
  const diagonal = n.every((v) => Math.abs(v) < 0.9999);
  return endOfExtrusion(scene, f) ?? endOfPrism(scene, f) ?? sideOfSketch(scene, f) ?? (diagonal ? edgeStep(scene, f) : null);
}

/** The command that moves the face by `v` along its outward normal (a negative `v` pushes it in), or null when that is no size at all. */
export function editCommand(scene: Scene, edit: FaceEdit, v: number): Command | null {
  if (edit.kind === "stepDepth") {
    const depth = edit.depth + v;
    return Math.abs(depth) < 1e-6 ? null : { type: "setStepParams", id: edit.step, params: { depth: Math.round(depth * 1e6) / 1e6 } };
  }
  if (edit.kind === "edgeSize") {
    const value = Math.round((edit.value - v) * 1e6) / 1e6;
    return value > 1e-6 ? { type: "setStepParams", id: edit.step, params: { value } } : null;
  }
  if (edit.kind === "side") {
    const moves = edit.corners.flatMap((ref): Command[] => {
      const c = scene.parts[ref];
      return c?.kind === "corner" ? [{ type: "movePart", ref, to: [c.at[0] + edit.normal[0] * v, c.at[1] + edit.normal[1] * v, c.at[2] + edit.normal[2] * v] }] : [];
    });
    return moves.length ? { type: "batch", commands: moves } : null;
  }
  if (edit.kind === "depth") {
    const depth = edit.depth + v * edit.along;
    return Math.abs(depth) < 1e-6 ? null : { type: "setStepParams", id: edit.step, params: { depth: Math.round(depth * 1e6) / 1e6 } };
  }
  const radius = Math.round((edit.radius + (edit.convex ? v : -v)) * 1e6) / 1e6;
  if (!(radius > 1e-6)) return null;
  return edit.diameter ? { type: "setRelationValue", id: edit.diameter, value: 2 * radius, locked: true } : { type: "setRadius", ref: edit.circle, radius };
}

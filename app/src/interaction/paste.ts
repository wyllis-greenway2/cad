// Paste (`in_435`): what Ctrl+C captured is pasted by Ctrl+V as ordinary parts of its own, not as a repeat that keeps ties to the original: they can be moved, deleted and changed on their own, and deleting
// the original leaves them. A drawn figure is pasted beside the original at the distance a copy begins with, or onto the surface that is selected (a face of a body, a sketch's plane): the same figure, its middle
// on that surface's middle, on a plane of its own there when it is not the figure's own.
import type { Vec3 } from "../math/vec.ts";
import { add, sub, dot, scale, cross, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId, lookup } from "../operation/scene.ts";
import type { Part, Plane } from "../operation/part.ts";
import { normalOfPlane } from "../operation/part.ts";
import type { Command } from "../operation/commands.ts";
import type { Ref } from "../shared/ref.ts";
import { drawnRef, formatId } from "../shared/ref.ts";
import { planeOf } from "./objects.ts";

/** A surface a paste can land on: where its middle is and its axes. */
export interface Surface { at: Vec3; u: Vec3; v: Vec3; plane: Plane }

/** The surface a part gives (a flat face of a body, a sketch's plane or a figure on it): its middle and its axes; null for anything else. */
export function surfaceOf(scene: Scene, ref: Ref): Surface | null {
  const part = scene.parts[ref];
  const pl = planeOf(lookup(scene), ref);
  if (!part || !pl) return null;
  let at: Vec3 = pl.at;
  if (part.kind === "plane" && part.mesh && part.mesh.length >= 9) { // (a face of the body: the middle of its triangles)
    const m = part.mesh;
    let c: Vec3 = [0, 0, 0];
    const n = m.length / 3;
    for (let i = 0; i < m.length; i += 3) c = add(c, [m[i]!, m[i + 1]!, m[i + 2]!]);
    at = scale(c, 1 / n);
  }
  const nrm = normalOfPlane(pl);
  const u = normalize(pl.u);
  return { at, u, v: normalize(cross(nrm, u)), plane: pl };
}

/** The middle of the corners and circles of a figure. */
function middleOf(scene: Scene, refs: readonly Ref[]): Vec3 {
  const pts: Vec3[] = [];
  for (const r of refs) { const p = scene.parts[r]; if (p?.kind === "corner") pts.push(p.at); }
  if (!pts.length) return [0, 0, 0];
  return scale(pts.reduce((a, p) => add(a, p), [0, 0, 0] as Vec3), 1 / pts.length);
}

/**
 * The command that pastes the figure `refs` (its corners, lines and circles): beside the original by `offset` on its own plane, or (`onto`) with its middle at the surface's middle, on that surface's
 * plane (a plane of its own is made for it unless it is the figure's plane). The copies are plain drawn parts; the simplest constraints between its own parts (level, upright) are kept. Null with nothing there.
 */
export function pasteFigure(scene: Scene, refs: readonly Ref[], offset: Vec3, onto: Surface | null): { command: Command; made: Ref[] } | null {
  const sources = refs.map((r) => scene.parts[r]).filter((p): p is Extract<Part, { kind: "corner" | "line" | "circle" }> => !!p && (p.kind === "corner" || p.kind === "line" || p.kind === "circle") && p.origin === "drawn" && !(p.kind === "line" && p.derived));
  const first = sources.find((p) => p.kind === "corner");
  const src = first?.plane ? scene.parts[first.plane] : undefined;
  if (!first || !src || src.kind !== "plane") return null;
  const id = nextId(scene, "e");
  const name = (r: Ref): Ref => drawnRef(`${id}.${r.slice(2).replace(/[./@]/g, "_")}`);
  const centre = middleOf(scene, sources.map((p) => p.ref));
  const n0 = normalOfPlane(src);
  const su = normalize(src.u);
  const sv = normalize(cross(n0, su));
  let place = (p: Vec3): Vec3 => add(p, offset);
  let target: Ref = src.ref;
  const commands: Command[] = [];
  if (onto) {
    const same = onto.plane.ref === src.ref;
    place = (p) => { const w = sub(p, centre); return add(onto.at, add(scale(onto.u, dot(w, su)), scale(onto.v, dot(w, sv)))); };
    if (!same) {
      target = drawnRef(`${id}.pl`);
      commands.push({ type: "addPart", part: { ref: target, kind: "plane", origin: "drawn", plane: null, movable: true, at: onto.at, u: onto.u, v: onto.v } as Part });
    }
  }
  const base = { origin: "drawn" as const, plane: target, movable: true };
  const corners = new Set(sources.filter((p) => p.kind === "corner").map((p) => p.ref));
  const made: Ref[] = [];
  for (const p of sources) if (p.kind === "corner") { commands.push({ type: "addPart", part: { ...base, ref: name(p.ref), kind: "corner", at: place(p.at) } }); made.push(name(p.ref)); }
  for (const p of sources) {
    if (p.kind === "line" && corners.has(p.a) && corners.has(p.b) && (!p.center || corners.has(p.center))) { commands.push({ type: "addPart", part: { ...base, ref: name(p.ref), kind: "line", a: name(p.a), b: name(p.b), ...(p.bulge ? { bulge: p.bulge } : {}), ...(p.center ? { center: name(p.center), ccw: p.ccw } : {}) } }); made.push(name(p.ref)); }
    else if (p.kind === "circle" && corners.has(p.center)) { commands.push({ type: "addPart", part: { ...base, ref: name(p.ref), kind: "circle", center: name(p.center), radius: p.radius } }); made.push(name(p.ref)); }
  }
  // a rectangle stays level: its horizontal and vertical sides are kept (the relations between parts that were all copied and need no number)
  let k = Number(nextId(scene, "r").slice(2));
  for (const r of scene.relations) if ((r.kind === "horizontal" || r.kind === "vertical") && r.parts.every((q) => made.includes(name(q)))) commands.push({ type: "addRelation", relation: { id: formatId("r", k++), kind: r.kind, parts: r.parts.map(name) } });
  return commands.length ? { command: { type: "batch", commands }, made } : null;
}

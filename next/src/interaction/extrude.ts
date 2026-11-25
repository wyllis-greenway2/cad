// Extruding a region of a sketch (`in_1566`): what a click inside a drawing picks, what the pull of the arrow comes to, and the recipe steps that make it. Pure: the definition and a place in the plane in, descriptions out. The arrow and the ghost are drawn by
// the screen; the engine's worker makes the body (`engine/steps.ts` `extrude`); a pick is the point inside the region, which the sketch step keeps (`pick`, E63) so the region is found again when the drawing changes.
import type { SketchParams } from "../engine/sketch.ts";
import { segsOf, solveDefinition } from "../engine/definition.ts";
import { regions, type Loop, type Pt } from "../engine/region.ts";
import type { Frame } from "../planes.ts";
import { vOf } from "../planes.ts";
import type { Step } from "../engine/steps.ts";
import type { EdgeRef, Id } from "../engine/id.ts";

export interface Region {
  /** the point inside it that the sketch keeps to find it again */ pick: Pt;
  /** the outline first, then the holes: closed polylines in the plane (arcs as short lines) */ loops: Pt[][];
  /** a place for the arrow: inside the region */ centre: Pt; area: number;
}
const TAU = 2 * Math.PI;
/** a loop as a closed polyline of points (an arc is sampled at most 3 degrees to the piece) */
export function loopPoints(l: Loop): Pt[] {
  if (l.whole) { const { c, r } = l.whole; return Array.from({ length: 121 }, (_, k) => [c[0] + r * Math.cos((k / 120) * TAU), c[1] + r * Math.sin((k / 120) * TAU)] as Pt); }
  const out: Pt[] = [];
  for (const p of l.pieces) {
    out.push(p.a);
    if (p.arc) {
      const { c, r } = p.arc, mid = p.mid!, a0 = Math.atan2(p.a[1] - c[1], p.a[0] - c[0]), a1 = Math.atan2(p.b[1] - c[1], p.b[0] - c[0]), am = Math.atan2(mid[1] - c[1], mid[0] - c[0]);
      const norm = (x: number) => ((x % TAU) + TAU) % TAU, ccw = norm(am - a0) < norm(a1 - a0) || norm(a1 - a0) < 1e-12, sweep = ccw ? norm(a1 - a0) || TAU : -(norm(a0 - a1) || TAU), n = Math.max(2, Math.ceil(Math.abs(sweep) / (3 * Math.PI / 180)));
      for (let k = 1; k < n; k++) out.push([c[0] + r * Math.cos(a0 + (sweep * k) / n), c[1] + r * Math.sin(a0 + (sweep * k) / n)]);
    }
  }
  out.push(out[0]!);
  return out;
}
/** the region a place in the plane is inside (null: none, or the drawing does not solve) */
export function regionAt(def: SketchParams, q: Pt): Region | null {
  try {
    const s = solveDefinition(def), segs = segsOf(def, s.points, s.radii), found = regions(segs, { pick: [q] });
    const prof = found.profiles[0]; if (!prof) return null;
    const face = found.faces.find((f) => f.filled && Math.abs(f.area) > 0) ?? null;
    return { pick: q, loops: [loopPoints(prof.outer), ...prof.holes.map(loopPoints)], centre: q, area: face?.area ?? 0 };
  } catch { return null; }
}
/** the sketch's plane as the engine takes one: an origin, the way local x runs, and the normal */
export const frameParams = (f: Frame) => ({ origin: f.origin, xDir: f.u, normal: f.normal });
void vOf;

/** What a pull of this size is made of: the steps to add to the recipe, given the steps there are (`recipe`) and the body the last one made (`last`, if any). A pull in the plane's direction adds; against it, when there is a body, cuts. */
export interface FaceSource { face: Id; body: string }
/** The step that made the body now: the last step of the recipe that makes one (an extrude, a push, a round, a combine). */
export const lastBodyStep = (recipe: readonly Step[]): string | null => { for (let i = recipe.length - 1; i >= 0; i--) if (recipe[i]!.kind !== "sketch" && recipe[i]!.kind !== "sketchPolygon" && recipe[i]!.kind !== "sketchCircle" && recipe[i]!.kind !== "sketchOnFace") return recipe[i]!.id; return null; };
/** a face of the body pushed out (a distance above nothing) or in */
export function pushSteps(recipe: readonly Step[], face: Id, body: string, d: number, kind: "push" | "moveFace" | "offsetFace" = "push"): Step[] {
  const prefix = kind === "push" ? "p" : kind === "moveFace" ? "m" : "o"; let n = 1; while (recipe.some((s) => s.id === `${prefix}${n}`)) n++;
  return [{ id: `${prefix}${n}`, kind, params: { face, dist: d }, inputs: [body] }];
}
/** edges of the body rounded (`fillet`) or cut flat (`chamfer`) by `size` */
export function roundSteps(recipe: readonly Step[], edges: readonly EdgeRef[], body: string, size: number, kind: "fillet" | "chamfer"): Step[] {
  let n = 1; while (recipe.some((s) => s.id === `r${n}`)) n++;
  return [{ id: `r${n}`, kind: "round", params: { edges, size, mode: kind }, inputs: [body] }];
}
export function extrudeSteps(recipe: readonly Step[], def: SketchParams, f: Frame, pick: Pt, d: number, source?: FaceSource): Step[] {
  const have = (p: string) => { let n = 1; while (recipe.some((s) => s.id === `${p}${n}`)) n++; return `${p}${n}`; };
  const sid = have("s"), eid = have("e"), steps: Step[] = [
    source ? { id: sid, kind: "sketch", params: { ...def, face: source.face, pick: [pick] } as never, inputs: [source.body] } : { id: sid, kind: "sketch", params: { ...def, frame: frameParams(f), pick: [pick] } as never, inputs: [] },
    { id: eid, kind: "extrude", params: { d }, inputs: [sid] },
  ];
  const lastBody = [...recipe].reverse().find((s) => s.kind === "extrude" || s.kind === "combine");
  if (lastBody) steps.push({ id: have("c"), kind: "combine", params: { mode: d < 0 ? "cut" : "add" }, inputs: [lastBody.id, eid] });
  return steps;
}

// Where the revolve's orb (the mover's orb) goes when it is dragged (`in_652`): it can be held to chosen axes (Shift on the position arrows: one axis is a line, two a plane, as a free move is), it sticks to the places
// that sketching also offers (a corner, the middle of an edge, the centre of a circle or an arc, the middle of a face, the middle of a body) when the pointer is near one, and else lines up with them: its place along an axis
// is brought to the place of a corner (or the like) when it is nearly the same, as a point being drawn lines up with the corners. Pure: the places and the pointer in, the place out.
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import { pointOf, segmentOf, circleOf } from "../operation/part.ts";
import { faceMiddle } from "../operation/mates.ts";
import { add, scale, dot, sub } from "../math/vec.ts";

export interface Spot { at: Vec3; /** what it is, for the message ("the middle of Body 1") */ name: string }

/** The places the orb sticks to: the corners of the drawing and of the bodies, the middles of edges, the centres of circles and arcs, the middles of faces and of bodies. */
export function orbSpots(scene: Scene): Spot[] {
  const get = lookup(scene);
  const out: Spot[] = [];
  const bodies = Object.values(scene.parts).filter((p) => p.kind === "body");
  for (const p of Object.values(scene.parts)) {
    if (p.kind === "corner") { if (!p.derived) out.push({ at: p.at, name: "a corner" }); continue; }
    if (p.kind === "line") {
      const sg = segmentOf(get, p.ref);
      if (sg) out.push({ at: [(sg[0][0] + sg[1][0]) / 2, (sg[0][1] + sg[1][1]) / 2, (sg[0][2] + sg[1][2]) / 2], name: "the middle of an edge" });
      if (p.center) { const c = pointOf(get, p.center); if (c) out.push({ at: c, name: "the centre of an arc" }); }
      continue;
    }
    if (p.kind === "circle") { const c = circleOf(get, p.ref); if (c) out.push({ at: c.center, name: "the centre of a circle" }); continue; }
    if (p.kind === "plane" && p.origin === "body" && p.mesh && !p.section) { const m = faceMiddle(scene, p.ref); if (m) out.push({ at: m, name: "the middle of a face" }); continue; }
    if (p.kind === "body" && p.bbox) { const { min, max } = p.bbox; out.push({ at: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], name: bodies.length > 1 ? `the middle of Body ${bodies.findIndex((b) => b.ref === p.ref) + 1}` : "the middle of the body" }); }
  }
  return out;
}

const spotsKept = new WeakMap<Scene, Spot[]>();
/** The places of a scene, made once for it (a drag asks at every move). */
export function orbSpotsOf(scene: Scene): Spot[] {
  let s = spotsKept.get(scene);
  if (!s) spotsKept.set(scene, (s = orbSpots(scene)));
  return s;
}

/** The place after the axes it is held to: only the part of the way from `from` that lies along the held axes (none held: the place as it is). */
export function heldTo(from: Vec3, at: Vec3, axes: readonly Vec3[]): Vec3 {
  if (!axes.length) return at;
  const d = sub(at, from);
  let out = from;
  for (const a of axes) out = add(out, scale(a, dot(d, a)));
  return out;
}

export interface OrbOpts {
  /** how near the pointer must be to a place, in pixels, for the orb to stick to it */
  pointPx: number;
  /** how near an axis place must be to a place's to line up with it, in mm */
  alignMm: number;
  /** the directions the orb is held to (the arrows chosen with Shift), none for free; `from` is where the drag began */
  held: readonly Vec3[];
  from: Vec3;
  /** the world axes (unit vectors) the orb's own axes are: alignment is made only along world axes */
  worldAligned: boolean;
}

/**
 * Where the orb goes when the pointer, at `pointer` (pixels), takes it to `free`: onto a place the pointer is near (held to its axes, if held), else lined up with the places along each world axis it may move along, else
 * `free`. `note` says what it stuck to, for the message.
 */
export function snapOrb(spots: readonly Spot[], free: Vec3, pointer: readonly [number, number], project: (p: Vec3) => readonly [number, number] | null, o: OrbOpts): { at: Vec3; note: string | null } {
  // onto a place the pointer is near
  let best: { s: Spot; d: number } | null = null;
  for (const s of spots) {
    const q = project(s.at);
    if (!q) continue;
    const d = Math.hypot(q[0] - pointer[0], q[1] - pointer[1]);
    if (d <= o.pointPx && (!best || d < best.d)) best = { s, d };
  }
  if (best) return { at: heldTo(o.from, best.s.at, o.held), note: `on ${best.s.name}` };
  // lined up with a place along a world axis it may move along
  let at: Vec3 = heldTo(o.from, free, o.held);
  if (!o.worldAligned) return { at, note: null };
  const free3: [number, number, number] = [at[0], at[1], at[2]];
  const lined: string[] = [];
  for (let k = 0; k < 3; k++) {
    const axis: Vec3 = [k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0];
    if (o.held.length && !o.held.some((h) => Math.abs(dot(h, axis)) > 1e-6)) continue; // (held away from this axis: it does not move along it)
    let near: { s: Spot; g: number } | null = null;
    for (const s of spots) { const g = Math.abs(s.at[k]! - free3[k]!); if (g <= o.alignMm && (!near || g < near.g)) near = { s, g }; }
    if (near) { free3[k] = near.s.at[k]!; lined.push(`${"XYZ"[k]} with ${near.s.name}`); }
  }
  at = free3;
  return { at, note: lined.length ? `in line (${lined.join(", ")})` : null };
}

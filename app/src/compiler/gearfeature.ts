// A gear as one feature (`dec_gear_feature`, `in_696`): the body the kernel makes of a gear has a face and edges for every arc of every tooth (80 parts a tooth, 16000 parts for 200 teeth), and everything after it
// (naming, picking, the highlight, the scene's lists) is worked by part. A person picks a gear's two faces (to change its thickness), its bore, and the whole gear: those are kept; the rest of the teeth is one surface of the whole.
// Pure: the kernel's answer and the gear shapes in, which parts to keep out.
import type { KernelResult, KernelEdge, KernelFace } from "./kernel/adapter.ts";
import type { GearShape } from "../operation/gearshape.ts";

const SLACK = 1.01; // (the kernel's box is of the mesh: a little off the exact one)

/** For each body of the answer that is wholly one gear (it is the body the gear's step made, and its box is the gear's), its shape, by the body's place in the answer. A body that has been joined to something, moved or cut is not (its box is not the gear's) and keeps all its parts. */
export function reducedGearBodies(result: KernelResult, gears: readonly GearShape[]): Map<number, GearShape> {
  const out = new Map<number, GearShape>();
  if (!gears.length || !result.mesh) return out;
  const bodies = result.bodies ?? [];
  bodies.forEach((b, i) => {
    const g = gears.find((q) => b.id === `x_${q.step}`);
    if (!g) return;
    const k = [0, 1, 2].find((a) => Math.abs(Math.abs(g.normal[a]!) - 1) < 1e-6); // (a gear on a tilted plane has no round faces along a world axis: it keeps its parts)
    if (k === undefined) return;
    const [lo, hi] = [b.min, b.max];
    const thick = Math.abs(g.depth);
    if (Math.abs(hi[k]! - lo[k]! - thick) > 1e-3 * Math.max(1, thick) + 1e-3) return;
    const mid = [0, 1, 2].map((a) => g.centre[a]! + g.normal[a]! * g.depth / 2); // (the middle of the body)
    for (let a = 0; a < 3; a++) {
      if (a !== k && hi[a]! - lo[a]! > 2 * g.radius * SLACK + 0.01) return;
      if (Math.abs((lo[a]! + hi[a]!) / 2 - mid[a]!) > 0.1 * g.radius + 0.01) return;
    }
    out.set(i, g);
  });
  return out;
}
/** Whether a point lies on the gear's axis (the bore and the rims are round about it; the arcs of a tooth's flanks are round about points off it). */
const onAxis = (p: readonly number[], g: GearShape): boolean => {
  const d = [0, 1, 2].map((a) => p[a]! - g.centre[a]!);
  const along = d[0]! * g.normal[0] + d[1]! * g.normal[1] + d[2]! * g.normal[2];
  return Math.hypot(d[0]! - along * g.normal[0], d[1]! - along * g.normal[1], d[2]! - along * g.normal[2]) < 1e-3 * Math.max(1, g.radius);
};

/** Whether a round or flat face of a gear's body is one a person picks: a flat face across the axis (its two faces), a flat one near the axis (a flat or keyway of the bore), the bore (a round face inside the roots), a ring's wall (a ring has no bore: its teeth point inward). A tooth's faces are not. */
export function keepsGearFace(f: KernelFace, g: GearShape, mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> } | null): boolean {
  if (f.type === "cyl") {
    const r = f.radius as number;
    return !!f.center && onAxis(f.center as readonly number[], g) && (g.ring ? r >= g.radius * 0.999 : r < g.rootRadius * 0.98);
  }
  if (f.type === "surf" || !f.n || f.d === undefined) return false;
  const n = f.n as readonly number[];
  if (Math.abs(n[0]! * g.normal[0] + n[1]! * g.normal[1] + n[2]! * g.normal[2]) > 1 - 1e-6) return true;
  // a flat across a bore (a D flat, a keyway) lies inside the roots wholly; a flank that is flat (a straight one, or the radial foot of an involute one) reaches out to the tips
  if (!mesh || Math.abs((f.d as number) - (n[0]! * g.centre[0] + n[1]! * g.centre[1] + n[2]! * g.centre[2])) >= g.rootRadius * 0.98) return false;
  let far = 0;
  for (let i = f.start; i < f.start + f.count; i++) {
    const ix = mesh.triangles[i]! * 3;
    const d = [0, 1, 2].map((a) => mesh.vertices[ix + a]! - g.centre[a]!);
    const along = d[0]! * g.normal[0] + d[1]! * g.normal[1] + d[2]! * g.normal[2];
    far = Math.max(far, Math.hypot(d[0]! - along * g.normal[0], d[1]! - along * g.normal[1], d[2]! - along * g.normal[2]));
  }
  return far < g.rootRadius * 0.98;
}

/** Whether an edge of a gear's body is one a person picks: the rim of the bore, or of a ring's wall (a circle). The outline of a tooth is not. */
export function keepsGearEdge(e: KernelEdge, g: GearShape): boolean {
  const c = e.circle;
  return !!c && onAxis(c.center, g) && (g.ring ? c.radius >= g.radius * 0.999 : c.radius < g.rootRadius * 0.98);
}

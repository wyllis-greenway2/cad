// Moving one hole of the fastener tool's preview (`in_965`): the pointer is put on a previewed hole and dragged, and the hole follows it over the surface. A hole that is moved keeps the place the pointer put it at until the rules that make the
// row change (the number, the spacing, the line) and the row is made again. Pure: the camera's projection and ray come in.
import type { Vec3 } from "../math/vec.ts";
import { dot } from "../math/vec.ts";
import type { ReceiverPlan } from "./addpart.ts";

/** The previewed hole nearest to the pixel (and within `tol` pixels of it), or -1. */
export function pickPlace(plan: ReceiverPlan, project: (p: Vec3) => [number, number], x: number, y: number, tol = 16): number {
  let best = -1;
  let bd = tol;
  plan.spots.forEach((s, i) => { const [px, py] = project(s.centre); const d = Math.hypot(px - x, py - y); if (d <= bd) { bd = d; best = i; } });
  return best;
}
/** Where the pointer's ray meets the surface the hole `index` stands on (taken as the plane that touches it there: a round face brings the point back onto itself when the plan is made), or null when the ray runs alongside it. */
export function dragTarget(plan: ReceiverPlan, index: number, ray: { o: Vec3; d: Vec3 }): Vec3 | null {
  const s = plan.spots[index];
  if (!s) return null;
  const n: Vec3 = [s.u[1] * s.v[2] - s.u[2] * s.v[1], s.u[2] * s.v[0] - s.u[0] * s.v[2], s.u[0] * s.v[1] - s.u[1] * s.v[0]];
  const l = Math.hypot(...n) || 1;
  const nn: Vec3 = [n[0] / l, n[1] / l, n[2] / l];
  const den = dot(ray.d, nn);
  if (Math.abs(den) < 1e-6) return null;
  const t = dot([s.centre[0] - ray.o[0], s.centre[1] - ray.o[1], s.centre[2] - ray.o[2]], nn) / den;
  return t > 0 ? [ray.o[0] + ray.d[0] * t, ray.o[1] + ray.d[1] * t, ray.o[2] + ray.d[2] * t] : null;
}

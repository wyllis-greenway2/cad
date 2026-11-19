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
export function dragTarget(plan: ReceiverPlan, index: number, ray: { o: Vec3; d: Vec3 }, snap?: { row: number; mm: number; /** the place the rules put the hole: it snaps back to it within `originMm` (`in_1075`) */ origin?: Vec3; originMm?: number }): Vec3 | null {
  const s = plan.spots[index];
  if (!s) return null;
  const n: Vec3 = [s.u[1] * s.v[2] - s.u[2] * s.v[1], s.u[2] * s.v[0] - s.u[0] * s.v[2], s.u[0] * s.v[1] - s.u[1] * s.v[0]];
  const l = Math.hypot(...n) || 1;
  const nn: Vec3 = [n[0] / l, n[1] / l, n[2] / l];
  const den = dot(ray.d, nn);
  if (Math.abs(den) < 1e-6) return null;
  const t = dot([s.centre[0] - ray.o[0], s.centre[1] - ray.o[1], s.centre[2] - ray.o[2]], nn) / den;
  if (!(t > 0)) return null;
  const hit: Vec3 = [ray.o[0] + ray.d[0] * t, ray.o[1] + ray.d[1] * t, ray.o[2] + ray.d[2] * t];
  if (snap?.origin && snap.originMm !== undefined && Math.hypot(hit[0] - snap.origin[0], hit[1] - snap.origin[1], hit[2] - snap.origin[2]) <= snap.originMm) return snap.origin; // (back where the rules put it)
  const line = snap ? plan.guide[snap.row] : undefined;
  if (!snap || !line || line.length < 2) return hit;
  const near = nearestOnLine(line, hit); // (free hand, but drawn to the line the hole is meant to be on when the pointer is near it)
  return near.dist <= snap.mm ? near.at : hit;
}
/** The row (the line the holes follow) a hole stands on: the guide line nearest to it, or -1 when the holes follow no line (places picked, one in the middle). */
export function rowOf(plan: ReceiverPlan, index: number): number {
  const c = plan.spots[index]?.centre;
  if (!c) return -1;
  let best = -1;
  let bd = Infinity;
  plan.guide.forEach((g, i) => { if (g.length < 2) return; const d = nearestOnLine(g, c).dist; if (d < bd) { bd = d; best = i; } });
  return best;
}
/** The point of a polyline nearest to `p`, and how far it is. */
export function nearestOnLine(line: readonly Vec3[], p: Vec3): { at: Vec3; dist: number; /** the way the line runs there (unit) */ dir: Vec3 } {
  let at: Vec3 = line[0]!;
  let dir: Vec3 = [1, 0, 0];
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [a, b] = [line[i]!, line[i + 1]!];
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l2 = dot(d, d) || 1e-12;
    const t = Math.max(0, Math.min(1, dot([p[0] - a[0], p[1] - a[1], p[2] - a[2]], d) / l2));
    const q: Vec3 = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
    const dist = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (dist < best) { best = dist; at = q; const l = Math.sqrt(l2); dir = [d[0] / l, d[1] / l, d[2] / l]; }
  }
  return { at, dist: best, dir };
}

const unit3 = (a: readonly number[]): Vec3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l]; };
/** The two ways a hole is moved in (`in_1051`): along the line it follows (`t`) and across it (`a`, to the left of the way the line runs, which is inward round a face's outline), at the place the rules put it; with no line, the face's own two ways. */
function holeFrame(plan: ReceiverPlan, pos: number): { t: Vec3; a: Vec3 } | null {
  const sp = plan.spots[pos];
  const base = plan.base[pos];
  if (!sp || !base) return null;
  const n = unit3([sp.u[1] * sp.v[2] - sp.u[2] * sp.v[1], sp.u[2] * sp.v[0] - sp.u[0] * sp.v[2], sp.u[0] * sp.v[1] - sp.u[1] * sp.v[0]]);
  const row = rowOf({ ...plan, spots: plan.spots.map((x, i) => (i === pos ? { ...x, centre: base } : x)) }, pos);
  const t = row >= 0 ? nearestOnLine(plan.guide[row]!, base).dir : unit3(sp.u);
  const tn = unit3([t[0] - n[0] * dot(t, n), t[1] - n[1] * dot(t, n), t[2] - n[2] * dot(t, n)]); // (on the surface)
  return { t: tn, a: unit3([n[1] * tn[2] - n[2] * tn[1], n[2] * tn[0] - n[0] * tn[2], n[0] * tn[1] - n[1] * tn[0]]) };
}
/** How far the hole has been moved from the place the rules put it, along the line and across it, mm. */
export function movedBy(plan: ReceiverPlan, pos: number): { along: number; across: number } | null {
  const f = holeFrame(plan, pos);
  const [c, b] = [plan.spots[pos]?.centre, plan.base[pos]];
  if (!f || !c || !b) return null;
  const d: Vec3 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  return { along: dot(d, f.t), across: dot(d, f.a) };
}
/** Where the hole stands when it is moved `along` the line and `across` it from the place the rules put it. */
export function movedTarget(plan: ReceiverPlan, pos: number, along: number, across: number): Vec3 | null {
  const f = holeFrame(plan, pos);
  const b = plan.base[pos];
  if (!f || !b) return null;
  return [b[0] + f.t[0] * along + f.a[0] * across, b[1] + f.t[1] * along + f.a[1] * across, b[2] + f.t[2] * along + f.a[2] * across];
}

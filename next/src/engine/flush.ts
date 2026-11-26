// A face pulled until it is flush with another (`q_motion_probe_domain`, step 3, `in_1629`): the same question the sketch's hints ask, in the body (no kernel): of the numbers that move a flat thing (here one: how far along its normal), where does it
// hold a relation to the rest (here one: it lies in the plane of another flat face), and is that within reach? A plane is a point and an outward normal; two are flush when they are parallel (the same way or opposite) and the one lies in the other.
import { dot, sub, type V3 } from "./vec.ts";

/** a flat face of the scene: where it is (which body, which face) and its plane */
export interface PlaneRef {
  body: string;
  face: string;
  p: V3;
  n: V3;
}
/** the flat faces of a scene's snapshot as planes (a face that is not flat is not one) */
export function planesOf(faces: readonly { id: string; type: string; ce: V3; ne: V3 }[], body = ""): PlaneRef[] {
  return faces.filter((f) => f.type === "PLANE").map((f) => ({ body, face: f.id, p: f.ce, n: f.ne }));
}
/**
 * A flat thing in the plane through `from.p` (normal `from.n`), pulled along that normal by `d`, is flush with `to` at `d* = ((to.p - from.p) . to.n) / (from.n . to.n)`. The nearest such place within `reachMm` of `d`, and which plane it is (null: none).
 * Planes that are not parallel to it, and the one it lies in already (the face itself, a neighbour in its plane: pulling back to where it began is not a hint), are not tried.
 */
export function flushPull(
  from: { p: V3; n: V3 },
  others: readonly PlaneRef[],
  d: number,
  reachMm: number,
): { d: number; to: PlaneRef } | null {
  let best: { d: number; to: PlaneRef } | null = null;
  for (const o of others) {
    const c = dot(from.n, o.n);
    if (Math.abs(Math.abs(c) - 1) > 1e-6) continue; // (not parallel)
    const gap = dot(sub(o.p, from.p), o.n);
    if (Math.abs(gap) < 1e-6) continue; // (the plane it lies in now)
    const at = gap / c;
    if (Math.abs(at - d) <= reachMm && (!best || Math.abs(at - d) < Math.abs(best.d - d))) best = { d: at, to: o };
  }
  return best;
}

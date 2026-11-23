// Between a sketch plane's own two axes and the world (what is drawn is kept in the plane's axes, so it goes with the plane when the plane is moved). The figures themselves are the engine's definition (`interaction/drawing.ts`).
import { add, dot, scale, sub, type V3 } from "./vec.ts";
import type { Frame } from "./planes.ts";
import { vOf } from "./planes.ts";

export type P2 = [number, number];
export type ToolKind = "line" | "rect" | "circle" | "trim";
export const to3 = (f: Frame, p: P2): V3 => add(f.origin, add(scale(f.u, p[0]), scale(vOf(f), p[1])));
export const to2 = (f: Frame, q: V3): P2 => { const d = sub(q, f.origin); return [dot(d, f.u), dot(d, vOf(f))]; };
/** Where a ray meets the plane (null: it never does). */
export function onPlane(f: Frame, o: V3, d: V3): V3 | null {
  const den = dot(d, f.normal);
  if (Math.abs(den) < 1e-9) return null;
  return add(o, scale(d, dot(sub(f.origin, o), f.normal) / den));
}

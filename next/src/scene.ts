// What there is to look at. Stage 1 has no model, so a few boxes stand in for bodies: they give the view something to measure by, to turn
// about and to lose.
import type { V3 } from "./vec.ts";

export interface Thing { id: string; lo: V3; hi: V3 }
export interface Scene { things: Thing[] }

export const emptyScene = (): Scene => ({ things: [] });
export const oneScene = (): Scene => ({ things: [{ id: "a", lo: [-20, -20, 0], hi: [20, 20, 30] }] });
export const demoScene = (): Scene => ({
  things: [
    { id: "a", lo: [20, -60, 0], hi: [60, -30, 25] },
    { id: "b", lo: [-70, -20, 0], hi: [-40, 10, 45] },
    { id: "c", lo: [-30, 40, 0], hi: [0, 70, 12] },
  ],
});
export const centreOf = (t: Thing): V3 => [(t.lo[0] + t.hi[0]) / 2, (t.lo[1] + t.hi[1]) / 2, (t.lo[2] + t.hi[2]) / 2];

/**
 * The first surface a ray meets: how far, and the way the surface faces (towards the ray's start). From outside a box that is the face the ray
 * goes in by; from inside it is the wall the ray comes out through,
 * so the eye can be inside a thing and still measure how far the walls are.
 */
export function hitThings(sc: Scene, from: V3, dir: V3): { t: number; normal: V3; thing: Thing; inside: boolean } | null {
  let best: { t: number; normal: V3; thing: Thing; inside: boolean } | null = null;
  for (const thing of sc.things) {
    let t0 = -Infinity, t1 = Infinity, a0 = -1, s0 = 1, a1 = -1, s1 = 1, missed = false;
    for (let i = 0; i < 3; i++) {
      const d = dir[i]!, o = from[i]!;
      if (Math.abs(d) < 1e-12) { if (o < thing.lo[i]! || o > thing.hi[i]!) { missed = true; break; } continue; }
      const p = (thing.lo[i]! - o) / d, q = (thing.hi[i]! - o) / d;
      const near = Math.min(p, q), far = Math.max(p, q), s: 1 | -1 = d > 0 ? -1 : 1; // (the face's normal, towards the start of the ray, whichever of the two the ray meets)
      if (near > t0) { t0 = near; a0 = i; s0 = s; }
      if (far < t1) { t1 = far; a1 = i; s1 = s; }
    }
    if (missed || t0 > t1 || t1 < 0) continue;
    const inside = t0 <= 0;
    const t = inside ? t1 : t0, axis = inside ? a1 : a0, sign = inside ? s1 : s0;
    if (axis < 0 || !isFinite(t)) continue;
    if (!best || t < best.t) { const n: V3 = [0, 0, 0]; n[axis] = sign; best = { t, normal: n, thing, inside }; }
  }
  return best;
}

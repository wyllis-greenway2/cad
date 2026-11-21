// What there is to look at. Stage 1 has no model, so a few boxes stand in for bodies: they give the view something to measure by, to turn about and to lose.
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

/** The first surface a ray meets: how far, and the way the surface faces (towards the ray). */
export function hitThings(sc: Scene, from: V3, dir: V3): { t: number; normal: V3; thing: Thing } | null {
  let best: { t: number; normal: V3; thing: Thing } | null = null;
  for (const thing of sc.things) {
    let t0 = 0, t1 = Infinity, axis = -1, sign = 1;
    for (let i = 0; i < 3; i++) {
      const d = dir[i]!, o = from[i]!;
      if (Math.abs(d) < 1e-12) { if (o < thing.lo[i]! || o > thing.hi[i]!) { t1 = -1; break; } continue; }
      let a = (thing.lo[i]! - o) / d, b = (thing.hi[i]! - o) / d;
      let s = -1;
      if (a > b) { [a, b] = [b, a]; s = 1; }
      if (a > t0) { t0 = a; axis = i; sign = s; }
      if (b < t1) t1 = b;
      if (t0 > t1) { t1 = -1; break; }
    }
    if (t1 < t0 || t1 < 0 || axis < 0) continue; // (missed, behind, or starting inside: no surface ahead)
    if (!best || t0 < best.t) { const n: V3 = [0, 0, 0]; n[axis] = sign; best = { t: t0, normal: n, thing }; }
  }
  return best;
}

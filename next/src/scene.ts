// What there is to look at: a box for each body (its extent), which the view measures by, turns about and can lose: a box for each body the engine made (`bodyThings`) and, on the dev page, stand-in boxes (`dev.ts`; the ready-made scenes are for tests).
import type { V3 } from "./vec.ts";

export interface Thing {
  id: string;
  lo: V3;
  hi: V3;
}
export interface Scene {
  things: Thing[];
}

/** What the camera looks at: the stand-in things and a box for each body the engine made. */
export const lookedAt = (standIns: Scene, bodies: readonly Thing[]): Scene => ({
  things: [...standIns.things, ...bodies],
});
/** The box of a thing under a matrix (column by column, as the drawing has it): the box that holds the eight corners moved. Its middle is exact; turned, its extent is a little more than the body's. */
export function boxUnder(t: Thing, m: readonly number[]): Thing {
  const lo: V3 = [Infinity, Infinity, Infinity],
    hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [t.lo[0], t.hi[0]])
    for (const y of [t.lo[1], t.hi[1]])
      for (const z of [t.lo[2], t.hi[2]])
        for (let k = 0; k < 3; k++) {
          const v = m[k]! * x + m[4 + k]! * y + m[8 + k]! * z + m[12 + k]!;
          lo[k] = Math.min(lo[k]!, v);
          hi[k] = Math.max(hi[k]!, v);
        }
  return { id: t.id, lo, hi };
}
/** The scene with the body that is shown moved (the mover orb's draft) where it is shown, not where it was made. */
export const withMoved = (sc: Scene, moved: { body: string; matrix: readonly number[] } | null): Scene =>
  moved ? { things: sc.things.map((t) => (t.id === moved.body ? boxUnder(t, moved.matrix) : t)) } : sc;
const boxes = new WeakMap<object, Thing>();
/** The box of each body the engine made (the extent of its points): the camera measures by it, turns about it, and can lose it. Made once for each body. */
export function bodyThings(meshes: readonly { id: string; positions: ArrayLike<number> }[]): Thing[] {
  return meshes.flatMap((m) => {
    let t = boxes.get(m);
    if (!t && m.positions.length >= 3) {
      const lo: V3 = [Infinity, Infinity, Infinity],
        hi: V3 = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i + 2 < m.positions.length; i += 3)
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k]!, m.positions[i + k]!);
          hi[k] = Math.max(hi[k]!, m.positions[i + k]!);
        }
      boxes.set(m, (t = { id: m.id, lo, hi }));
    }
    return t ? [t] : [];
  });
}
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
export function hitThings(
  sc: Scene,
  from: V3,
  dir: V3,
): { t: number; normal: V3; thing: Thing; inside: boolean } | null {
  let best: { t: number; normal: V3; thing: Thing; inside: boolean } | null = null;
  for (const thing of sc.things) {
    let t0 = -Infinity,
      t1 = Infinity,
      a0 = -1,
      s0 = 1,
      a1 = -1,
      s1 = 1,
      missed = false;
    for (let i = 0; i < 3; i++) {
      const d = dir[i]!,
        o = from[i]!;
      if (Math.abs(d) < 1e-12) {
        if (o < thing.lo[i]! || o > thing.hi[i]!) {
          missed = true;
          break;
        }
        continue;
      }
      const p = (thing.lo[i]! - o) / d,
        q = (thing.hi[i]! - o) / d;
      const near = Math.min(p, q),
        far = Math.max(p, q),
        s: 1 | -1 = d > 0 ? -1 : 1; // (the face's normal, towards the start of the ray, whichever of the two the ray meets)
      if (near > t0) {
        t0 = near;
        a0 = i;
        s0 = s;
      }
      if (far < t1) {
        t1 = far;
        a1 = i;
        s1 = s;
      }
    }
    if (missed || t0 > t1 || t1 < 0) continue;
    const inside = t0 <= 0;
    const t = inside ? t1 : t0,
      axis = inside ? a1 : a0,
      sign = inside ? s1 : s0;
    if (axis < 0 || !isFinite(t)) continue;
    if (!best || t < best.t) {
      const n: V3 = [0, 0, 0];
      n[axis] = sign;
      best = { t, normal: n, thing, inside };
    }
  }
  return best;
}

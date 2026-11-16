// The clearance between two bodies (`dec_measure_report`, `in_568`): do they go into each other, touch, or how far apart are their surfaces? From the triangles of the bodies as they are drawn (`hard.ts` keeps them),
// with the same tests as the hard bodies (`collide.ts`): `collides` says whether any two triangles come nearer than a given distance, so the nearest distance is found by halving. Pure; kept for the scene.
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "../operation/scene.ts";
import { collides } from "../operation/collide.ts";
import { meshOf } from "./hard.ts";

export type Clearance = { kind: "overlap" } | { kind: "touching" } | { kind: "distance"; mm: number };

/** How far apart two surfaces must come before they are counted as touching, mm. */
const TOUCH_MM = 0.005;
const cache = new WeakMap<Scene, Map<string, Clearance | null>>();

/** What the two bodies are to each other: inside one another (their surfaces cross, or one is wholly in the other), touching, or the nearest distance between their surfaces. Null when a body has no mesh. */
export function clearanceBetween(scene: Scene, a: Ref, b: Ref): Clearance | null {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  let by = cache.get(scene);
  if (!by) cache.set(scene, (by = new Map()));
  if (by.has(key)) return by.get(key)!;
  const [ma, mb] = [meshOf(scene, a), meshOf(scene, b)];
  let out: Clearance | null = null;
  if (ma && mb && ma.tris.length && mb.tris.length) {
    if (collides(ma.tris, mb.tree, 0, false, true)) out = { kind: "overlap" };
    else if (collides(ma.tris, mb.tree, TOUCH_MM)) out = { kind: "touching" };
    else {
      // the distance lies between nothing and the diagonal of the two boxes together; halve until it is found to a few thousandths of a millimetre
      let lo = TOUCH_MM, hi = 1;
      while (!collides(ma.tris, mb.tree, hi) && hi < 1e6) { lo = hi; hi *= 4; }
      for (let i = 0; i < 24 && hi - lo > 1e-3; i++) { const mid = (lo + hi) / 2; if (collides(ma.tris, mb.tree, mid)) hi = mid; else lo = mid; }
      out = { kind: "distance", mm: (lo + hi) / 2 };
    }
  }
  by.set(key, out);
  return out;
}

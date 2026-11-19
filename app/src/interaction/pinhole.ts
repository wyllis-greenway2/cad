// A pin in a hole, found in the model (`in_1096`, `dec_contact_push`): the round faces of two bodies, one a post and one a hole about it, with parallel axes less than the room the hole leaves apart, and where they overlap along the axis. A body on a pin of another
// can turn on it and be carried by it; saying so is a suggestion to make the coaxial mate (which is exact and costs nothing to play), not a guess made behind the page's back.
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "../operation/scene.ts";
import type { Vec3 } from "../math/vec.ts";
import { dot, sub, normalize } from "../math/vec.ts";
import { roundOf } from "../operation/part.ts";
import { lookup } from "../operation/scene.ts";

interface Round { center: Vec3; axis: Vec3; radius: number; lo: number; hi: number; convex: boolean; ax: number }
const roundsOf = (scene: Scene, body: Ref): Round[] => {
  const get = lookup(scene);
  const out: Round[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "plane" || p.origin !== "body" || p.of !== body || !p.curved || p.curved.convex === undefined) continue;
    const r = roundOf(get, p.ref);
    if (!r?.normal) continue;
    out.push({ center: r.center, axis: normalize(r.normal), radius: r.radius, lo: p.curved.lo, hi: p.curved.hi, convex: !!p.curved.convex, ax: p.curved.axis });
  }
  return out;
};
const name = (scene: Scene, ref: Ref): string => { const p = scene.parts[ref]; return p?.kind === "body" && p.id ? p.id : ref; };

/** If `a` and `b` are a pin of one in a hole of the other (either way round), the suggestion to mate them; else null. */
export function pinInHole(scene: Scene, a: Ref, b: Ref): string | null {
  for (const [pinBody, holeBody] of [[a, b], [b, a]] as [Ref, Ref][]) {
    const [pins, holes] = [roundsOf(scene, pinBody).filter((r) => r.convex), roundsOf(scene, holeBody).filter((r) => !r.convex)];
    for (const pin of pins) for (const hole of holes) {
      if (Math.abs(dot(pin.axis, hole.axis)) < 0.999 || hole.radius < pin.radius - 0.01) continue;
      const d = sub(pin.center, hole.center), along = dot(d, hole.axis);
      const off = Math.hypot(d[0] - hole.axis[0] * along, d[1] - hole.axis[1] * along, d[2] - hole.axis[2] * along);
      if (off > hole.radius - pin.radius + 0.05) continue;
      if (pin.ax === hole.ax && (pin.hi < hole.lo || hole.hi < pin.lo)) continue; // (they do not meet along the axis)
      return `${name(scene, holeBody)} has a hole on a pin of ${name(scene, pinBody)}: select the pin and the hole and make Mate: coaxial, and it turns on the pin`;
    }
  }
  return null;
}

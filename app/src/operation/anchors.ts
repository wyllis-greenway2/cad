// Anchors (`in_308`, `q_body_constraints`): the geometry of the body that a sketch can be held to, read-only. Found from the scene when asked; nothing is stored.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "./scene.ts";
import { lookup } from "./scene.ts";
import type { Plane } from "./part.ts";
import { normalOfPlane, roundOf } from "./part.ts";

export interface AnchorRound { ref: Ref; center: Vec3; radius: number }

/** The circular edges of the body that lie in this plane (their circle faces the same way and its centre is on the plane): a circle or an arc drawn there can be tied to them. */
export function anchorRounds(scene: Scene, pl: Plane): AnchorRound[] {
  const get = lookup(scene);
  const n = normalOfPlane(pl);
  const out: AnchorRound[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "line" || p.origin !== "body" || !(p.circle || p.mid)) continue;
    const r = roundOf(get, p.ref);
    if (!r?.normal) continue;
    if (Math.abs(r.normal[0] * n[0] + r.normal[1] * n[1] + r.normal[2] * n[2]) < 1 - 1e-4) continue;
    const off = (r.center[0] - pl.at[0]) * n[0] + (r.center[1] - pl.at[1]) * n[1] + (r.center[2] - pl.at[2]) * n[2];
    if (Math.abs(off) > 1e-3) continue;
    out.push({ ref: p.ref, center: r.center, radius: r.radius });
  }
  return out;
}

// The stand-in for a gear's body that is still being made (`dec_gear_standin`, `in_702`, `in_707`): a plain disc (a ring, with a bore or for an internal gear) at the gear's outside diameter, worked out from the gear's record and the step, with no kernel.
// Pure: a scene and what the kernel has answered so far in, the discs to draw out.
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Step } from "../operation/scene.ts";
import { figureDepths } from "../operation/scene.ts";
import { gearOutline } from "../operation/gear.ts";
import type { GearRecord } from "../operation/gearscene.ts";
import { isMade } from "../operation/gearscene.ts";

/** How long the kernel has been working before a disc is drawn for a gear it has not made (ms): a gear that comes at once is not preceded by a flash. */
export const STANDIN_MS = 250;

/** A disc: its middle, the way it faces, how thick it is (along the normal, from the middle's plane; negative goes the other way), its outside radius and, if it is a ring, the radius of its hole. */
export interface StandIn { step: string; centre: Vec3; normal: Vec3; depth: number; radius: number; hole: number }

/** What of the kernel's last answer matters here: whether it is still being worked out, and the steps it has made. */
export interface KernelSeen { stale?: boolean; ops: readonly { id: string }[] }

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The discs to draw: one for each step that makes a gear's body (not a worm's) while the kernel is working and has not made that step yet. */
export function standIns(sc: Scene, kernel: KernelSeen | null | undefined): StandIn[] {
  if (!kernel?.stale || !sc.gears?.length) return [];
  const made = new Set(kernel.ops.map((o) => o.id));
  const out: StandIn[] = [];
  for (const st of sc.steps) {
    if (made.has(`x_${st.id}`) || made.has(`s_${st.id}`)) continue;
    const one = standInOf(sc, st);
    if (one) out.push(one);
  }
  return out;
}

function standInOf(sc: Scene, st: Step): StandIn | null {
  if (st.type !== "extrude" && st.type !== "revolve" && st.type !== "loft") return null;
  const first = st.parts[0];
  const rec: GearRecord | undefined = sc.gears?.find((g) => (typeof st.params.gear === "string" ? g.id === st.params.gear : !!first && isMade(g.id, first)));
  if (!rec || rec.spec.worm) return null;
  const plane = sc.parts[rec.plane];
  const o = gearOutline(rec.spec);
  if (!plane || plane.kind !== "plane" || !o.ok) return null;
  const n = cross(plane.u, plane.v), len = Math.hypot(...n) || 1;
  const normal: Vec3 = [n[0] / len, n[1] / len, n[2] / len];
  const g = o.value;
  const radius = g.outerRadius ?? g.tipRadius;
  if (!(radius > 0)) return null;
  let depth: number;
  let centre: Vec3 = rec.at;
  if (rec.spec.wheel) { depth = rec.spec.wheel.width; centre = [0, 1, 2].map((k) => rec.at[k]! - normal[k]! * depth / 2) as unknown as Vec3; } // (a worm wheel's sections lie either side of its plane)
  else if (st.type === "extrude") depth = figureDepths(st)[0] ?? 0;
  else depth = Number(st.params.advance ?? rec.spec.width ?? 0);
  if (!Number.isFinite(depth) || depth === 0) return null;
  const hole = rec.spec.internal ? g.tipRadius : (rec.spec.bore ?? 0) > 0 ? (rec.spec.bore as number) / 2 : 0;
  return { step: st.id, centre: [...centre] as unknown as Vec3, normal, depth, radius, hole: hole < radius ? hole : 0 };
}

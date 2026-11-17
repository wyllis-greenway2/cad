// The stand-in for a gear's body that is still being made (`dec_gear_standin`, `in_702`, `in_707`): a plain disc (a ring, with a bore or for an internal gear) at the gear's outside diameter, worked out from the gear's record and the step, with no kernel.
// Pure: a scene and what the kernel has answered so far in, the discs to draw out.
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Step } from "../operation/scene.ts";
import { gearShapeOf } from "../operation/gearshape.ts";

/** How long the kernel has been working before a disc is drawn for a gear it has not made (ms): a gear that comes at once is not preceded by a flash. */
export const STANDIN_MS = 250;

/** The label's words for a wait of `seconds` whole seconds: nothing about time for the first two (a body that comes at once is not timed), `in_804`. */
export function standInWords(seconds: number): string {
  return seconds >= 2 ? `Building… ${seconds} s` : "Building…";
}

/** A disc: its middle, the way it faces, how thick it is (along the normal, from the middle's plane; negative goes the other way), its outside radius and, if it is a ring, the radius of its hole. */
export interface StandIn { step: string; centre: Vec3; normal: Vec3; depth: number; radius: number; hole: number }

/** What of the kernel's last answer matters here: whether it is still being worked out, and the steps it has made. */
export interface KernelSeen { stale?: boolean; ops: readonly { id: string }[] }

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
  const g = gearShapeOf(sc, st);
  return g ? { step: g.step, centre: g.centre, normal: g.normal, depth: g.depth, radius: g.radius, hole: g.hole } : null;
}

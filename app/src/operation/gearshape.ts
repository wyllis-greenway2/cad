// What a gear's body is, from the gear's record and the step that makes it, with no kernel (`dec_gear_standin`, `dec_gear_feature`): where it stands, which way it faces, how thick it is and its radii.
// The stand-in disc is drawn from it, and the body's parts are cut down to a few by it. Pure: a scene in, descriptions out.
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Step } from "./scene.ts";
import { figureDepths } from "./scene.ts";
import { gearOutline } from "./gear.ts";
import type { GearRecord } from "./gearscene.ts";
import { isMade } from "./gearscene.ts";
import { wheelOf } from "./worm.ts";

export interface GearShape {
  /** the step that makes the body; the body is named `x_` and this in the kernel's answer */
  step: string;
  /** the gear's own id */
  gear: string;
  /** a point of the face the depth is measured from (the gear's centre on its plane; for a worm wheel, whose sections lie either side of the plane, the centre of its lower face) */
  centre: Vec3;
  /** the way the gear faces (unit) */
  normal: Vec3;
  /** how thick it is along the normal from the plane (negative goes the other way) */
  depth: number;
  /** the outside radius (the tips, or the wall of a ring; for a worm wheel the tip at its faces, where it is widest) */
  radius: number;
  /** the radius of the circle the teeth do not go inside (the bottom of the gaps; for a worm wheel the smallest) */
  rootRadius: number;
  /** an internal gear (a ring): its outside wall is a round face of its own */
  ring: boolean;
  /** the hole in the middle: the bore, or for an internal gear the inside of the teeth (0 for none) */
  hole: number;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The shape of the body a step makes, if the step makes the body of a gear (not a worm's: that is a thread along an axis); null if it does not. */
export function gearShapeOf(sc: Scene, st: Step): GearShape | null {
  if (st.type !== "extrude" && st.type !== "revolve" && st.type !== "loft") return null;
  if (st.params.tool) return null; // (a cutter on the way to the body: a chamfer's, `in_760`)
  if (typeof st.params.gear === "string" && sc.gears?.find((g) => g.id === st.params.gear)?.spec.wheel && st.type !== "loft") return null; // (a wheel's other steps (its lands, the worm's envelope) are pieces on the way to the one body, `in_759`)
  const first = st.parts[0];
  const rec: GearRecord | undefined = sc.gears?.find((g) => (typeof st.params.gear === "string" ? g.id === st.params.gear : !!first && isMade(g.id, first)));
  if (!rec || rec.spec.worm) return null;
  const plane = sc.parts[rec.plane];
  const o = gearOutline(rec.spec);
  if (!plane || plane.kind !== "plane" || !o.ok) return null;
  const n = cross(plane.u, plane.v), len = Math.hypot(...n) || 1;
  const normal: Vec3 = [n[0] / len, n[1] / len, n[2] / len];
  const g = o.value;
  let radius = g.outerRadius ?? g.tipRadius, rootRadius = g.rootRadius;
  let depth: number;
  let centre: Vec3 = rec.at;
  if (rec.spec.wheel) {
    const w = wheelOf(rec.spec);
    if (!w.ok) return null;
    depth = rec.spec.wheel.width + 2 * (rec.spec.wheel.land ?? 0); // (the throated part and a land at each face, `in_758`)
    centre = [0, 1, 2].map((k) => rec.at[k]! - normal[k]! * depth / 2) as unknown as Vec3; // (its sections lie either side of its plane)
    radius = w.value.tipAt(depth / 2); // (the throat: the tip is widest at the faces)
    rootRadius = w.value.rootAt(0);
  } else if (st.type === "extrude") depth = figureDepths(st)[0] ?? 0;
  else depth = Number(st.params.advance ?? rec.spec.width ?? 0);
  if (!(radius > 0) || !Number.isFinite(depth) || depth === 0) return null;
  const hole = rec.spec.internal ? g.tipRadius : (rec.spec.bore ?? 0) > 0 ? (rec.spec.bore as number) / 2 : 0;
  return { step: st.id, gear: rec.id, centre: [...centre] as unknown as Vec3, normal, depth, radius, rootRadius, ring: !!rec.spec.internal, hole: hole < radius ? hole : 0 };
}

/** The shapes of every gear body the scene has steps for. */
export function gearShapes(sc: Scene): GearShape[] {
  if (!sc.gears?.length) return [];
  return sc.steps.flatMap((st) => { const g = gearShapeOf(sc, st); return g ? [g] : []; });
}

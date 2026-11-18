// What a gear's body is, from the gear's record and the step that makes it, with no kernel (`dec_gear_standin`, `dec_gear_feature`): where it stands, which way it faces, how thick it is and its radii.
// The stand-in disc is drawn from it, and the body's parts are cut down to a few by it. Pure: a scene in, descriptions out.
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Step } from "./scene.ts";
import { figureDepths } from "./scene.ts";
import { gearOutline } from "./gear.ts";
import type { GearRecord } from "./gearscene.ts";
import { isMade } from "./gearscene.ts";
import { wheelOf, wormOf } from "./worm.ts";
import { bevelLayout, bevelFrame, isCrown } from "./bevel.ts";
import { crownOf } from "./crown.ts";
import { then } from "../math/rotation.ts";
import { motionOf, applyPoint, applyDir } from "./frames.ts";
import type { Rigid } from "./frames.ts";

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
  if (st.type !== "extrude" && st.type !== "revolve" && st.type !== "loft" && st.type !== "chamferBody") return null;
  if (st.params.tool) return null; // (a cutter on the way to the body: a chamfer's, `in_791`)
  if (typeof st.params.gear === "string" && sc.gears?.find((g) => g.id === st.params.gear)?.spec.wheel && st.type !== "loft") return null; // (a wheel's other steps (its lands, the worm's envelope) are pieces on the way to the one body, `in_790`)
  const first = st.parts[0];
  const rec: GearRecord | undefined = sc.gears?.find((g) => (typeof st.params.gear === "string" ? g.id === st.params.gear : !!first && isMade(g.id, first)));
  if (!rec) return null;
  const plane = sc.parts[rec.plane];
  const o = gearOutline(rec.spec);
  if (!plane || plane.kind !== "plane" || !o.ok) return null;
  if (rec.spec.worm) { // a worm (`in_827`): a body along its axis (the plane's first direction turned by the gear's turn), as long as the worm; the thread's faces are not a person's to pick, the shaft's round faces and the ends are
    if (st.type !== "revolve" || st.params.mode !== "new") return null;
    const w = wormOf(rec.spec);
    if (!w.ok) return null;
    const [c, sn] = [Math.cos(rec.turn ?? 0), Math.sin(rec.turn ?? 0)];
    const axis: Vec3 = [0, 1, 2].map((k) => plane.u[k]! * c + plane.v[k]! * sn) as unknown as Vec3;
    const L = rec.spec.worm.length;
    const hole = (rec.spec.bore ?? 0) > 0 ? (rec.spec.bore as number) / 2 : 0;
    return { step: st.id, gear: rec.id, centre: [0, 1, 2].map((k) => rec.at[k]! - axis[k]! * L / 2) as unknown as Vec3, normal: axis, depth: L, radius: w.value.rTip, rootRadius: w.value.rRoot, ring: false, hole }; // (the root cylinder is cut into a piece for every turn of the thread: they are not kept, nor is the shaft, `in_827`)
  }
  const n = cross(plane.u, plane.v), len = Math.hypot(...n) || 1;
  let normal: Vec3 = [n[0] / len, n[1] / len, n[2] / len];
  const g = o.value;
  if (rec.spec.bevel && isCrown(rec.spec)) { // a crown gear (`dec_crown_gears`): the loft is the body's first step; the stand-in is a disc from the plate's foot to the tips
    if (st.type !== "loft") return null;
    const c = crownOf(rec.spec);
    if (!c.ok) return null;
    normal = bevelFrame(plane.u, plane.v, rec.spec, rec.turn ?? 0).n;
    const foot = -(c.value.root + c.value.thick);
    return { step: st.id, gear: rec.id, centre: [0, 1, 2].map((k) => rec.at[k]! + normal[k]! * foot) as unknown as Vec3, normal, depth: c.value.tip - foot, radius: c.value.outer + 0.5 * rec.spec.module, rootRadius: c.value.inner, ring: false, hole: (rec.spec.bore ?? 0) > 0 ? (rec.spec.bore as number) / 2 : 0 };
  }
  if (rec.spec.bevel) { // a bevel gear (`in_776`): the loft is the body's first step (the blank and the combine are not shapes of their own); the body stands from the hub's back, behind the pitch plane, to the toe's tips, along its axis
    if (st.type !== "loft") return null;
    const lay = bevelLayout(rec.spec);
    if (!lay.ok) return null;
    const { heel, geometry: bg } = lay.value;
    normal = bevelFrame(plane.u, plane.v, rec.spec, rec.turn ?? 0).n;
    const toeTip = bg.big - bg.k * (bg.big - bg.addendum * Math.sin(bg.delta)); // (the height of the toe's tips: the lowest x of the body is k (R cos delta - addendum sin delta))
    const depth0 = toeTip - heel.h;
    const hole0 = (rec.spec.bore ?? 0) > 0 ? (rec.spec.bore as number) / 2 : 0;
    return { step: st.id, gear: rec.id, centre: [0, 1, 2].map((k) => rec.at[k]! + normal[k]! * heel.h) as unknown as Vec3, normal, depth: depth0, radius: bg.tipRadius, rootRadius: bg.k * bg.rootRadius, ring: false, hole: hole0 };
  }
  if (rec.spec.rack) { // a rack (`in_826`): flat faces and no round ones; its box is the outline's (turned about the gear's place), a helical one's sheared along its length by the helix
    const depthR = st.type === "extrude" ? figureDepths(st)[0] ?? 0 : Number(st.params.advance ?? rec.spec.width ?? 0);
    if (!Number.isFinite(depthR) || depthR === 0) return null;
    const [c, sn] = [Math.cos(rec.turn ?? 0), Math.sin(rec.turn ?? 0)];
    const pts = g.points.map(([x, y]) => [c * x - sn * y, sn * x + c * y] as const);
    const [xs, ys] = [pts.map((q) => q[0]), pts.map((q) => q[1])];
    const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const shear = rec.spec.helix !== undefined ? Math.abs(depthR * Math.tan((rec.spec.helix * Math.PI) / 180)) : 0;
    const reach = Math.max(...pts.map(([x, y]) => Math.hypot(x - cx, y - cy))) + shear;
    const centreR = [0, 1, 2].map((k) => rec.at[k]! + plane.u[k]! * cx + plane.v[k]! * cy) as unknown as Vec3;
    return { step: st.id, gear: rec.id, centre: centreR, normal, depth: depthR, radius: reach, rootRadius: 0, ring: false, hole: 0 };
  }
  let radius = g.outerRadius ?? g.tipRadius, rootRadius = g.rootRadius;
  let depth: number;
  let centre: Vec3 = rec.at;
  if (rec.spec.wheel) {
    const w = wheelOf(rec.spec);
    if (!w.ok) return null;
    depth = rec.spec.wheel.width + 2 * (rec.spec.wheel.land ?? 0); // (the throated part and a land at each face, `in_783`)
    centre = [0, 1, 2].map((k) => rec.at[k]! - normal[k]! * depth / 2) as unknown as Vec3; // (its sections lie either side of its plane)
    radius = w.value.tipAt(rec.spec.wheel.width / 2); // (the throat: the tip is widest at the faces of the throated part; a land is that section carried straight out, `in_826`: the throat's own formula is not a number out there)
    rootRadius = w.value.rootAt(0);
  } else if (st.type === "extrude") depth = figureDepths(st)[0] ?? 0;
  else depth = Number(st.params.advance ?? rec.spec.width ?? 0);
  if (!(radius > 0) || !Number.isFinite(depth) || depth === 0) return null;
  const hole = rec.spec.internal ? g.tipRadius : (rec.spec.bore ?? 0) > 0 ? (rec.spec.bore as number) / 2 : 0;
  return { step: st.id, gear: rec.id, centre: [...centre] as unknown as Vec3, normal, depth, radius, rootRadius, ring: !!rec.spec.internal, hole: hole < radius ? hole : 0 };
}

/**
 * The shape after the moves, turns and scales that came after the step that made the body (`in_826`): they are steps of their own, named for the body (`params.body`, or the body in `parts`), and the gear's record does not know of them.
 * A turn about a point that was not recorded is not known: the shape is left as it was, and the body (its box no longer the gear's) keeps all its parts, as before.
 */
function movedShape(sc: Scene, g: GearShape, index: number): GearShape {
  let m: Rigid | null = null;
  const body = `x_${g.step}`;
  for (let i = index + 1; i < sc.steps.length; i++) {
    const st = sc.steps[i]!;
    if (st.type !== "move" && st.type !== "rotate" && st.type !== "scale") continue;
    const mine = st.params.body ? String(st.params.body) === body : st.parts.some((r) => String(r) === `b/${body}/o` || (String(r) === "b/body/o" && sc.gears?.length === 1)); // (`b/body/o`: the body, when there is one gear to be it)
    if (!mine) continue;
    const r = motionOf(st);
    if (!r) return g;
    m = m ? { turn: then(m.turn, r.turn), shift: applyPoint(r, m.shift), k: m.k * r.k } : r;
  }
  if (!m) return g;
  const k = m.k;
  return { ...g, centre: applyPoint(m, g.centre), normal: applyDir(m, g.normal), depth: g.depth * k, radius: g.radius * k, rootRadius: g.rootRadius * k, hole: g.hole * k };
}
/** The shapes of every gear body the scene has steps for, where each now stands. */
export function gearShapes(sc: Scene): GearShape[] {
  if (!sc.gears?.length) return [];
  return sc.steps.flatMap((st, i) => { const g = gearShapeOf(sc, st); return g ? [movedShape(sc, g, i)] : []; });
}

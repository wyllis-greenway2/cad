// The cross section (`in_392`): a view of the model cut by a plane, nothing is cut. The three planes through the middle of the part are offered; one clicked is the section, and its arrows (along x, y, z) and rings
// (about x, y, z) move and turn it. Pure state changes on the app state; the picture is the view's clipping.
import type { Vec3 } from "../../math/vec.ts";
import { add, sub, scale, dot, normalize } from "../../math/vec.ts";
import { about } from "../../math/rotation.ts";
import type { Scene } from "../../operation/scene.ts";
import { projector } from "../camera.ts";
import { scene as sceneOf } from "../session.ts";
import type { AppState, Env } from "./state.ts";

const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** The box that holds every body of the scene, or null with no body. */
function modelBox(sc: Scene): { lo: Vec3; hi: Vec3 } | null {
  const bodies = Object.values(sc.parts).filter((p) => p.kind === "body" && p.bbox);
  if (!bodies.length) return null;
  const mins = bodies.map((b) => (b as { bbox: { min: Vec3 } }).bbox.min);
  const maxs = bodies.map((b) => (b as { bbox: { max: Vec3 } }).bbox.max);
  return { lo: [0, 1, 2].map((i) => Math.min(...mins.map((m) => m[i]!))) as unknown as Vec3, hi: [0, 1, 2].map((i) => Math.max(...maxs.map((m) => m[i]!))) as unknown as Vec3 };
}

/** The three planes offered: each through the middle of the part, square, a little bigger than the part across. */
export function offeredPlanes(sc: Scene): { axis: 0 | 1 | 2; at: Vec3; n: Vec3; corners: Vec3[] }[] {
  const b = modelBox(sc);
  if (!b) return [];
  const c = scale(add(b.lo, b.hi), 0.5) as Vec3;
  const half = Math.max(...[0, 1, 2].map((i) => b.hi[i]! - b.lo[i]!)) * 0.6 || 10;
  return ([0, 1, 2] as const).map((axis) => {
    const [u, v] = AXES.filter((_, i) => i !== axis) as [Vec3, Vec3];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, k]) => add(add(c, scale(u, a! * half)), scale(v, k! * half)) as Vec3);
    return { axis, at: c, n: AXES[axis]!, corners };
  });
}

/** The cross section on or off from the menu: with one on it goes; else the planes are offered (a model with a body is needed). */
export function doSectionToggle(s: AppState): AppState {
  if (s.section || s.sectionOffer) return { ...s, section: null, sectionOffer: false, menu: null, session: { ...s.session, message: null } };
  if (!offeredPlanes(sceneOf(s.session)).length) return { ...s, menu: null, session: { ...s.session, message: "make a body first: there is nothing to slice" } };
  return { ...s, menu: null, sectionOffer: true, session: { ...s.session, message: "click a plane to slice the part there (nothing is cut: it is only a view)" } };
}

/** A click while the planes are offered: the plane under the pointer becomes the section, any other click puts the offer away. Null when no offer is up. */
export function doSectionPick(s: AppState, x: number, y: number, env: Env): AppState | null {
  if (!s.sectionOffer) return null;
  const ray = projector(s.cam, env.w, env.h).ray(x, y);
  let best: { t: number; p: ReturnType<typeof offeredPlanes>[number] } | null = null;
  for (const p of offeredPlanes(sceneOf(s.session))) {
    const den = dot(p.n, ray.d);
    if (Math.abs(den) < 1e-9) continue;
    const t = dot(p.n, sub(p.at, ray.o)) / den;
    if (t <= 0) continue;
    const hit = add(ray.o, scale(ray.d, t));
    const local = sub(hit, p.at);
    const half = Math.abs(p.corners[0]![[0, 1, 2].find((i) => i !== p.axis)!]! - p.at[[0, 1, 2].find((i) => i !== p.axis)!]!);
    if ([0, 1, 2].filter((i) => i !== p.axis).every((i) => Math.abs(local[i]!) <= half) && (!best || t < best.t)) best = { t, p };
  }
  if (!best) return { ...s, sectionOffer: false, session: { ...s.session, message: null } };
  return { ...s, sectionOffer: false, section: { at: best.p.at, n: best.p.n }, session: { ...s.session, message: "sliced: move or turn the plane with its arrows and rings; the Cross section row of the View menu puts it away" } };
}

/** The plane a drag of one of its handles makes (`sec:x` an arrow along x, `secr:x` a ring about x), from the plane as it was and the drag's value. */
export function draggedSection(from: { at: Vec3; n: Vec3 }, id: string, value: number): { at: Vec3; n: Vec3 } {
  const k = "xyz".indexOf(id[id.indexOf(":") + 1]!) as 0 | 1 | 2;
  if (id.startsWith("secr:")) {
    const m = about(k, value);
    const n: Vec3 = [m[0] * from.n[0] + m[1] * from.n[1] + m[2] * from.n[2], m[3] * from.n[0] + m[4] * from.n[1] + m[5] * from.n[2], m[6] * from.n[0] + m[7] * from.n[1] + m[8] * from.n[2]];
    return { at: from.at, n: normalize(n) };
  }
  return { at: add(from.at, scale(AXES[k]!, value)) as Vec3, n: from.n };
}

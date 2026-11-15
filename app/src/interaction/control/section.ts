// The cross section (`in_392`, `in_394`): a view of the model cut by one plane, nothing is cut. It begins at once, a plane through the middle of the part across the axis the view looks along, with the half nearer the
// camera not drawn so the inside shows; chips on the plane swap which axis it is across, which half is cut away, and whether its handles move it (arrows along x, y, z) or turn it (rings about x, y, z).
// Pure state changes on the app state; the picture (the clipping, the solid cut face with its hatching) is the view's.
import type { Vec3 } from "../../math/vec.ts";
import { add, sub, scale, dot, cross, normalize } from "../../math/vec.ts";
import { about } from "../../math/rotation.ts";
import type { Scene } from "../../operation/scene.ts";
import { basis, position } from "../camera.ts";
import { scene as sceneOf } from "../session.ts";
import type { AppState } from "./state.ts";

const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** The box that holds every body of the scene, or null with no body. */
function modelBox(sc: Scene): { lo: Vec3; hi: Vec3 } | null {
  const bodies = Object.values(sc.parts).filter((p) => p.kind === "body" && p.bbox);
  if (!bodies.length) return null;
  const mins = bodies.map((b) => (b as { bbox: { min: Vec3 } }).bbox.min);
  const maxs = bodies.map((b) => (b as { bbox: { max: Vec3 } }).bbox.max);
  return { lo: [0, 1, 2].map((i) => Math.min(...mins.map((m) => m[i]!))) as unknown as Vec3, hi: [0, 1, 2].map((i) => Math.max(...maxs.map((m) => m[i]!))) as unknown as Vec3 };
}

/** The axis (0, 1, 2) the plane is across, when its normal is along one; else null (it has been turned). */
export function sectionAxis(n: Vec3): 0 | 1 | 2 | null {
  const k = [0, 1, 2].find((i) => Math.abs(Math.abs(n[i]!) - 1) < 1e-6);
  return k === undefined ? null : (k as 0 | 1 | 2);
}

/** The cross section on or off from the menu: with one on it goes; else it begins, across the axis the camera looks along, cutting away the half nearer the camera. */
export function doSectionToggle(s: AppState): AppState {
  if (s.section) return { ...s, section: null, menu: null, session: { ...s.session, message: null } };
  const b = modelBox(sceneOf(s.session));
  if (!b) return { ...s, menu: null, session: { ...s.session, message: "make a body first: there is nothing to slice" } };
  const at = scale(add(b.lo, b.hi), 0.5) as Vec3;
  const f = basis(s.cam).forward;
  const k = [0, 1, 2].reduce((m, i) => (Math.abs(f[i]!) > Math.abs(f[m]!) ? i : m), 0);
  const toward = dot(AXES[k]!, sub(position(s.cam), at)) >= 0 ? 1 : -1; // (the normal points at the camera: that half is the one cut away)
  return { ...s, menu: null, section: { at, n: scale(AXES[k]!, toward) as Vec3, mode: "move" }, session: { ...s.session, message: "sliced: the half nearer you is not drawn (nothing is cut); the chips on the plane change its axis, its side and its handles" } };
}

/** A chip of the plane: the axis it is across goes round X, Y, Z (the side cut away stays the one nearer the camera); the side cut away swaps; the handles go between moving and turning. */
export function doSectionChip(s: AppState, what: "axis" | "side" | "mode"): AppState {
  const sec = s.section;
  if (!sec) return s;
  if (what === "side") return { ...s, section: { ...sec, n: scale(sec.n, -1) as Vec3 } };
  if (what === "mode") return { ...s, section: { ...sec, mode: sec.mode === "move" ? "rotate" : "move" } };
  const k = ((sectionAxis(sec.n) ?? 2) + 1) % 3;
  const toward = dot(AXES[k]!, sub(position(s.cam), sec.at)) >= 0 ? 1 : -1;
  return { ...s, section: { ...sec, n: scale(AXES[k]!, toward) as Vec3 } };
}

/** The corners of the square drawn for the plane: through the middle of the model, a little bigger than the part. */
export function sectionQuad(sc: Scene, sec: { at: Vec3; n: Vec3 }): Vec3[] {
  const b = modelBox(sc);
  const size = b ? Math.max(...[0, 1, 2].map((i) => b.hi[i]! - b.lo[i]!)) : 20;
  const half = size * 0.75;
  const n = normalize(sec.n);
  const u = normalize(cross(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n));
  const v = cross(n, u);
  const c = sec.at;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, k]) => add(add(c, scale(u, a! * half)), scale(v, k! * half)) as Vec3);
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

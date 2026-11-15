// The cross section (`in_392`, `in_394`): a view of the model cut by one plane, nothing is cut. It begins at once, a plane through the middle of the part across the axis the view looks along, with the half nearer the
// camera not drawn so the inside shows; chips on the plane swap which axis it is across, which half is cut away, and whether its handles move it (arrows along x, y, z) or turn it (rings about x, y, z).
// Pure state changes on the app state; the picture (the clipping, the solid cut face with its hatching) is the view's.
import type { Vec3 } from "../../math/vec.ts";
import { add, sub, scale, dot, cross, normalize } from "../../math/vec.ts";
import { about } from "../../math/rotation.ts";
import type { Scene } from "../../operation/scene.ts";
import type { Ref } from "../../shared/ref.ts";
import { drawnRef } from "../../shared/ref.ts";
import { nextId } from "../../operation/scene.ts";
import { basis, position } from "../camera.ts";
import { scene as sceneOf, selection as selectionOf, run } from "../session.ts";
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

/** A cross section plane as a part (`in_396`): its `at` is a corner of a square of side `extent`, `u` and `v` across it; this is the same plane from its middle and its normal (the half the normal points to is cut away). */
function planeFrom(centre: Vec3, n: Vec3, extent: number): { at: Vec3; u: Vec3; v: Vec3 } {
  const nn = normalize(n);
  const u = normalize(cross(Math.abs(nn[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], nn));
  const v = cross(nn, u);
  return { at: sub(centre, scale(add(u, v), extent / 2)) as Vec3, u, v };
}

/** The cross section that is on (`in_396`): the plane part that is selected, with where its middle is, its normal and the sizes the handles work with; while its handles are dragged, the place the drag has taken it to. Null when no such plane is selected: it is then only a plane inserted in the part. */
export function sectionNow(s: AppState): { ref: Ref; centre: Vec3; n: Vec3; extent: number; mode: "move" | "rotate" } | null {
  const sc = sceneOf(s.session);
  const ref = selectionOf(s.session).find((r) => { const p = sc.parts[r]; return p?.kind === "plane" && !!p.section; });
  const p = ref ? sc.parts[ref] : undefined;
  if (!ref || p?.kind !== "plane" || !p.section || p.extent === undefined) return null;
  const live = s.sectionLive && s.sectionLive.ref === ref ? s.sectionLive : null;
  return { ref, centre: live ? live.centre : (add(p.at, scale(add(p.u, p.v), p.extent / 2)) as Vec3), n: live ? live.n : normalize(cross(p.u, p.v)), extent: p.extent, mode: s.sectionMode };
}

const select = (s: AppState, refs: Ref[]): AppState => ({ ...s, session: { ...s.session, click: { ...s.session.click, selection: refs } } });

/** The cross section from the menu: with one selected it is put away (the plane goes); else a plane is put through the middle of the part across the axis the camera looks along, the half nearer the camera cut away, and it is the only thing selected. */
export function doSectionToggle(s: AppState): AppState {
  const now = sectionNow(s);
  if (now) return select({ ...s, menu: null, sectionLive: null, session: run(s.session, { type: "deletePart", ref: now.ref }) }, []);
  const sc = sceneOf(s.session);
  const b = modelBox(sc);
  if (!b) return { ...s, menu: null, session: { ...s.session, message: "make a body first: there is nothing to slice" } };
  const centre = scale(add(b.lo, b.hi), 0.5) as Vec3;
  const f = basis(s.cam).forward;
  const k = [0, 1, 2].reduce((m, i) => (Math.abs(f[i]!) > Math.abs(f[m]!) ? i : m), 0);
  const toward = dot(AXES[k]!, sub(position(s.cam), centre)) >= 0 ? 1 : -1; // (the normal points at the camera: that half is the one cut away)
  const extent = Math.max(...[0, 1, 2].map((i) => b.hi[i]! - b.lo[i]!)) * 1.5 || 30;
  const ref = drawnRef(nextId(sc, "p"));
  const g = planeFrom(centre, scale(AXES[k]!, toward) as Vec3, extent);
  const session = run(s.session, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, section: true, extent, ...g } });
  return select({ ...s, menu: null, sectionMode: "move", sectionLive: null, session: { ...session, message: "sliced: the half nearer you is not drawn (nothing is cut); the chips on the plane change its axis, its side and its handles; deselect it and it stays as a plane in the part" } }, [ref]);
}

/** The plane put at a new middle and normal: one step. */
export function placeSection(s: AppState, centre: Vec3, n: Vec3): AppState {
  const now = sectionNow(s);
  if (!now) return s;
  const g = planeFrom(centre, n, now.extent);
  return { ...s, sectionLive: null, session: run(s.session, { type: "placePlane", ref: now.ref, ...g }) };
}

/** A chip of the plane: the axis it is across goes round X, Y, Z (the side cut away stays the one nearer the camera); the side cut away swaps; the handles go between moving and turning. */
export function doSectionChip(s: AppState, what: "axis" | "side" | "mode"): AppState {
  const sec = sectionNow(s);
  if (!sec) return s;
  if (what === "mode") return { ...s, sectionMode: sec.mode === "move" ? "rotate" : "move" };
  if (what === "side") return placeSection(s, sec.centre, scale(sec.n, -1) as Vec3);
  const k = ((sectionAxis(sec.n) ?? 2) + 1) % 3;
  const toward = dot(AXES[k]!, sub(position(s.cam), sec.centre)) >= 0 ? 1 : -1;
  return placeSection(s, sec.centre, scale(AXES[k]!, toward) as Vec3);
}

/** The corners of the square of a plane at `centre` with normal `n` and side `extent`. */
export function sectionQuad(centre: Vec3, n: Vec3, extent: number): Vec3[] {
  const g = planeFrom(centre, n, extent);
  return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, k]) => add(add(g.at, scale(g.u, a! * extent)), scale(g.v, k! * extent)) as Vec3);
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

/** The angle in degrees the plane's normal makes about world axis `k`, measured from the next axis towards the one after it (x: y to z, y: z to x, z: x to y), as `about` turns. */
export function normalAngle(n: Vec3, k: 0 | 1 | 2): number {
  const [a, b] = [(k + 1) % 3, (k + 2) % 3];
  return Math.round(((Math.atan2(n[b]!, n[a]!) * 180) / Math.PI) * 1e4) / 1e4;
}

/** A number typed for the plane (`in_395`): `field` 0 to 2 is where the plane's middle is along x, y, z; 3 to 5 the angle its normal makes about x, y, z. */
export function typedSection(sec: { centre: Vec3; n: Vec3 }, field: number, value: number): { centre: Vec3; n: Vec3 } {
  if (field < 3) return { ...sec, centre: sec.centre.map((c, i) => (i === field ? value : c)) as unknown as Vec3 };
  const k = (field - 3) as 0 | 1 | 2;
  const m = about(k, value - normalAngle(sec.n, k));
  const n: Vec3 = [m[0] * sec.n[0] + m[1] * sec.n[1] + m[2] * sec.n[2], m[3] * sec.n[0] + m[4] * sec.n[1] + m[5] * sec.n[2], m[6] * sec.n[0] + m[7] * sec.n[1] + m[8] * sec.n[2]];
  return { ...sec, n: normalize(n) };
}

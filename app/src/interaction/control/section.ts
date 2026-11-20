// The cross section (`in_392`, `in_394`): a view of the model cut by one plane, nothing is cut. It begins at once, a plane through the middle of the part across the axis the view looks along, with the half nearer the
// camera not drawn so the inside shows; chips on the plane swap which axis it is across, which half is cut away, and whether its handles move it (arrows along x, y, z) or turn it (rings about x, y, z).
// Pure state changes on the app state; the picture (the clipping, the solid cut face with its hatching) is the view's.
import type { Vec3 } from "../../math/vec.ts";
import { add, sub, scale, dot, cross, normalize, centroid } from "../../math/vec.ts";
import { about } from "../../math/rotation.ts";
import type { Scene } from "../../operation/scene.ts";
import { lookup } from "../../operation/scene.ts";
import { segmentOf, circleOf } from "../../operation/part.ts";
import { partIndex } from "../../operation/partindex.ts";
import type { Ref } from "../../shared/ref.ts";
import { drawnRef } from "../../shared/ref.ts";
import { nextId } from "../../operation/scene.ts";
import { basis, position } from "../camera.ts";
import { scene as sceneOf, selection as selectionOf, run } from "../session.ts";
import type { AppState } from "./state.ts";
import { surfaceAxes } from "../operations.ts";

const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** The box that holds every body of the scene, or null with no body. */
function modelBox(sc: Scene): { lo: Vec3; hi: Vec3 } | null {
  const bodies = partIndex(sc).bodies.filter((p) => p.bbox);
  if (!bodies.length) return null;
  const mins = bodies.map((b) => (b as { bbox: { min: Vec3 } }).bbox.min);
  const maxs = bodies.map((b) => (b as { bbox: { max: Vec3 } }).bbox.max);
  return { lo: [0, 1, 2].map((i) => Math.min(...mins.map((m) => m[i]!))) as unknown as Vec3, hi: [0, 1, 2].map((i) => Math.max(...maxs.map((m) => m[i]!))) as unknown as Vec3 };
}

/** The axis (0, 1, 2) the plane is across, when its normal is along one; else null (it has been turned). */
function sectionAxis(n: Vec3): 0 | 1 | 2 | null {
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
export function sectionNow(s: AppState): { ref: Ref; centre: Vec3; n: Vec3; extent: number } | null {
  const sc = sceneOf(s.session);
  const ref = selectionOf(s.session).find((r) => { const p = sc.parts[r]; return p?.kind === "plane" && !!p.section; });
  const p = ref ? sc.parts[ref] : undefined;
  if (!ref || p?.kind !== "plane" || !p.section || p.extent === undefined) return null;
  const live = s.sectionLive && s.sectionLive.ref === ref ? s.sectionLive : null;
  return { ref, centre: live ? live.centre : (add(p.at, scale(add(p.u, p.v), p.extent / 2)) as Vec3), n: live ? live.n : normalize(cross(p.u, p.v)), extent: p.extent };
}

/** A sheet: the planes of `in_459` (a cross section is one in a cutting mode). Its four modes, in the order its icon goes through them: it cuts away the half its normal points to, the other half, it does not cut, it is invisible. */
export type SheetMode = 0 | 1 | 2;
export const modeOf = (p: { cut?: boolean; flip?: boolean }): SheetMode => (!p.cut ? 2 : p.flip ? 1 : 0);
const MODE_FLAGS: Record<SheetMode, { cut: boolean; flip: boolean }> = { 0: { cut: true, flip: false }, 1: { cut: true, flip: true }, 2: { cut: false, flip: false } };

/** Every sheet that is cutting the view (`in_416`, `in_459`: any number at once): its middle, and the normal that points to the half cut away (the place a drag has taken it to while its handles are dragged). */
export function cutsNow(s: AppState): { ref: Ref; centre: Vec3; n: Vec3; extent: number }[] {
  const sc = sceneOf(s.session);
  const temp = sketchCut(s);
  return [...(temp ? [temp] : []), ...partIndex(sc).sections.flatMap((p) => {
    if (!p.cut || p.extent === undefined) return [];
    const live = s.sectionLive && s.sectionLive.ref === p.ref ? s.sectionLive : null;
    const n = live ? live.n : normalize(cross(p.u, p.v));
    return [{ ref: p.ref, centre: live ? live.centre : (add(p.at, scale(add(p.u, p.v), p.extent / 2)) as Vec3), n: p.flip ? (scale(n, -1) as Vec3) : n, extent: p.extent }];
  })];
}

const SKETCHING = new Set(["rect", "circle", "polygon", "line", "arc", "spline"]);
/**
 * A cross section made for the surface being sketched on (`in_1351`), only while the sketch tool is on: a flat face of the body, or the plane a sketch on one stands on, cuts the view along itself, so what stands in front of it
 * (the walls of a pocket the face is the floor of) does not hide it. The half the face looks out to is the half cut away. It is no part of the model and goes with the tool; a face that is a cut's own cap has its section already.
 */
function sketchCut(s: AppState): { ref: Ref; centre: Vec3; n: Vec3; extent: number } | null {
  const t = s.tool;
  const sc = sceneOf(s.session);
  let ref: Ref | undefined;
  if (t && SKETCHING.has(t.kind)) ref = t.plane ?? selectionOf(s.session).find((r) => { const q = sc.parts[r]; return q?.kind === "plane" && q.origin !== "world" && !q.section; });
  else if (!t && (!s.op || s.op.kind === "offset")) {
    // the sketch goes on after a figure is drawn (the tool is put away, the figure is selected, and it may be offset): the cut stays while what is selected is drawn on that plane (`in_1374`)
    const planes = new Set<Ref | null | undefined>(selectionOf(s.session).map((r) => sc.parts[r] as { plane?: Ref | null; origin?: string } | undefined).map((q) => (q && q.origin === "drawn" ? q.plane : null)));
    const only = planes.size === 1 ? [...planes][0] : null;
    if (only) ref = only;
  }
  const p = ref ? sc.parts[ref] : undefined;
  if (!p || p.kind !== "plane" || p.origin === "world" || p.section || p.cap) return null;
  if (p.origin === "body") {
    const m = p.mesh;
    const ax = surfaceAxes(sc, p);
    if (!m || m.length < 9 || !ax) return null; // (a round face has no plane to cut along)
    let [x, y, z, k] = [0, 0, 0, 0];
    for (let i = 0; i + 2 < m.length; i += 3) { x += m[i]!; y += m[i + 1]!; z += m[i + 2]!; k++; }
    return { ref: "sketch:cut" as Ref, centre: [x / k, y / k, z / k], n: ax[2], extent: 60 };
  }
  if (!p.onBody) return null;
  return { ref: "sketch:cut" as Ref, centre: p.at, n: normalize(cross(p.u, p.v)), extent: 60 };
}

/** A press on a sheet's delete icon (`in_470`): the plane goes (one step; what was drawn on it stays as it is). */
export function doSheetDelete(s: AppState, ref: Ref): AppState {
  const p = sceneOf(s.session).parts[ref];
  if (p?.kind !== "plane" || !p.section) return s;
  const session = run(s.session, { type: "deletePart", ref });
  return select({ ...s, menu: null, sectionLive: null, sheetMove: s.sheetMove?.ref === ref ? null : s.sheetMove, session: { ...session, message: null } }, selectionOf(s.session).filter((r) => r !== ref));
}

/** A press on a sheet's eye icon: visible or invisible (an invisible sheet cannot be pointed at; it may still cut, `in_466`). */
export function doSheetVisible(s: AppState, ref: Ref): AppState {
  const p = sceneOf(s.session).parts[ref];
  if (p?.kind !== "plane" || !p.section) return s;
  const session = run(s.session, { type: "placePlane", ref, at: p.at, u: p.u, v: p.v, hidden: !p.hidden });
  return { ...s, menu: null, session: { ...session, message: null } };
}

/** A press on a sheet's mode icon: the next mode (one step, so undo takes it back). */
export function doSheetMode(s: AppState, ref: Ref): AppState {
  const p = sceneOf(s.session).parts[ref];
  if (p?.kind !== "plane" || !p.section) return s;
  const next = ((modeOf(p) + 1) % 3) as SheetMode;
  const session = run(s.session, { type: "placePlane", ref, at: p.at, u: p.u, v: p.v, ...MODE_FLAGS[next] });
  return { ...s, menu: null, session: { ...session, message: null } };
}

/** A click on a sheet: it is selected, as a face is (its icon goes through its modes, `in_459`; the click no longer switches its cut, `in_416`). */
export function doSectionClick(s: AppState, ref: Ref): AppState {
  const p = sceneOf(s.session).parts[ref];
  if (p?.kind !== "plane" || !p.section) return s;
  return select({ ...s, menu: null, sectionLive: null, session: { ...s.session, message: null } }, [ref]);
}

const select = (s: AppState, refs: Ref[]): AppState => ({ ...s, session: { ...s.session, click: { ...s.session.click, selection: refs } } });

/** A new sheet (`in_459`): a plane through the middle of the part across the axis the camera looks along, or lying on the flat surface selected; cutting (a cross section) or not. */
export function doPlaneNew(s: AppState, cutting: boolean): AppState {
  const sc = sceneOf(s.session);
  const b = modelBox(sc);
  if (!b) return { ...s, menu: null, session: { ...s.session, message: "make a body first: there is nothing to slice" } };
  let centre = scale(add(b.lo, b.hi), 0.5) as Vec3;
  const f = basis(s.cam).forward;
  const k = [0, 1, 2].reduce((m, i) => (Math.abs(f[i]!) > Math.abs(f[m]!) ? i : m), 0);
  const toward = dot(AXES[k]!, sub(position(s.cam), centre)) >= 0 ? 1 : -1; // (the normal points at the camera: that half is the one cut away)
  let normal = scale(AXES[k]!, toward) as Vec3;
  // a flat surface selected: the plane lies on it, facing out of it (`in_419`), so moving it in cuts a slice off that side
  const picked = selectionOf(s.session).length === 1 ? sc.parts[selectionOf(s.session)[0]!] : undefined;
  const axes = surfaceAxes(sc, picked);
  const surface = picked?.kind === "face" && picked.plane ? sc.parts[picked.plane] : picked;
  if (axes && surface?.kind === "plane") {
    normal = axes[2];
    const m = surface.mesh;
    centre = m && m.length >= 9 ? (centroid(Array.from({ length: Math.floor(m.length / 3) }, (_, i) => [m[3 * i]!, m[3 * i + 1]!, m[3 * i + 2]!] as Vec3)) as Vec3) : (sub(centre, scale(normal, dot(normal, sub(centre, surface.at)))) as Vec3);
  }
  const extent = Math.max(...[0, 1, 2].map((i) => b.hi[i]! - b.lo[i]!)) * 1.5 || 30;
  const ref = drawnRef(nextId(sc, "p"));
  const g = planeFrom(centre, normal, extent);
  const session = run(s.session, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, section: true, cut: cutting, extent, ...g } });
  return select({ ...s, menu: null, sectionLive: null, session: { ...session, message: cutting ? "sliced: the half nearer you is not drawn (nothing is cut); the icon on the plane goes through its modes; deselect it and it stays as a plane in the part" : "a plane: the icon on it goes through its modes (cuts one way, the other, does not cut, invisible)" } }, [ref]);
}

/** The plane put at a new middle and normal: one step. */
export function placeSection(s: AppState, centre: Vec3, n: Vec3): AppState {
  const now = sectionNow(s);
  if (!now) return s;
  const g = planeFrom(centre, n, now.extent);
  return { ...s, sectionLive: null, session: run(s.session, { type: "placePlane", ref: now.ref, ...g }) };
}

/** The corners of the square of a plane at `centre` with normal `n` and side `extent`. */
export function sectionQuad(centre: Vec3, n: Vec3, extent: number): Vec3[] {
  const g = planeFrom(centre, n, extent);
  return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, k]) => add(add(g.at, scale(g.u, a! * extent)), scale(g.v, k! * extent)) as Vec3);
}

/** The plane a drag of one of its handles makes (`move:x` the mover's arrow along x, `rot:x` its ring about x, the very handles of a body's mover, `in_419`), from the plane as it was and the drag's value. */
export function draggedSection(from: { at: Vec3; n: Vec3 }, id: string, value: number): { at: Vec3; n: Vec3 } {
  if (id === "sheet:n") return { at: add(from.at, scale(from.n, value)) as Vec3, n: from.n }; // (the sheet's own arrow: along its normal, `in_459`)
  const k = "xyz".indexOf(id[id.indexOf(":") + 1]!) as 0 | 1 | 2;
  if (id.startsWith("rot:")) {
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
  if (field === 6) return { ...sec, centre: add(sec.centre, scale(sec.n, value - dot(sec.centre, sec.n))) as Vec3 }; // (how far along its normal from the origin, the number of the sheet's own arrow, `in_459`)
  if (field < 3) return { ...sec, centre: sec.centre.map((c, i) => (i === field ? value : c)) as unknown as Vec3 };
  const k = (field - 3) as 0 | 1 | 2;
  const m = about(k, value - normalAngle(sec.n, k));
  const n: Vec3 = [m[0] * sec.n[0] + m[1] * sec.n[1] + m[2] * sec.n[2], m[3] * sec.n[0] + m[4] * sec.n[1] + m[5] * sec.n[2], m[6] * sec.n[0] + m[7] * sec.n[1] + m[8] * sec.n[2]];
  return { ...sec, n: normalize(n) };
}

/** What the sheet's move icon has its handles in (`in_1129`): 0 the arrows along x, y, z that move it, 1 the rings about them that turn it. */
export function sheetMoveOf(s: AppState, ref: Ref): 0 | 1 {
  return s.sheetMove && s.sheetMove.ref === ref ? s.sheetMove.mode : 0;
}

/** A press on the move icon: the handles go between the arrows (move) and the rings (turn), as a body's do. */
export function doSheetMove(s: AppState): AppState {
  const sec = sectionNow(s);
  if (!sec) return s;
  return { ...s, sectionLive: null, moverSphere: false, sheetMove: { ref: sec.ref, mode: sheetMoveOf(s, sec.ref) === 0 ? 1 : 0 } };
}

/** A click on one of the three panes of the sheet's mover (`in_1129`): the plane lies across that axis, where its middle is, the half towards the camera (or the half it already faced, if it was already across that axis) cut away. */
export function doSectionPane(s: AppState, k: 0 | 1 | 2): AppState {
  const sec = sectionNow(s);
  if (!sec) return s;
  const sign = Math.abs(sec.n[k]!) > 0.5 ? Math.sign(sec.n[k]!) : dot(AXES[k]!, sub(position(s.cam), sec.centre)) >= 0 ? 1 : -1;
  return placeSection({ ...s, moverSphere: false }, sec.centre, scale(AXES[k]!, sign) as Vec3);
}

/** What a click on the part under the pointer does to the plane while its sphere is selected (`in_1129`, as the mover's sphere goes where a click says): a corner or the centre of a circle is where the middle goes; a straight edge, its middle, and the plane stands across it; a flat face of a body, the place clicked
 * on it, the plane lying on it (facing out, so moving it in slices that side off); anything else curved, the place clicked. `hit` is where the click lands on a surface, when it lands on one. */
export function sheetPlaceAt(sc: Scene, ref: Ref, hit: Vec3 | null, centre: Vec3, n: Vec3): { centre: Vec3; n: Vec3 } | null {
  const p = sc.parts[ref];
  if (!p) return null;
  const get = lookup(sc);
  if (p.kind === "corner") return { centre: p.at, n };
  if (p.kind === "circle") { const c = circleOf(get, p.ref); return c ? { centre: c.center, n } : null; }
  if (p.kind === "line") {
    const sg = segmentOf(get, p.ref);
    if (!sg) return null;
    const mid: Vec3 = [(sg[0][0] + sg[1][0]) / 2, (sg[0][1] + sg[1][1]) / 2, (sg[0][2] + sg[1][2]) / 2];
    return p.circle || p.mid ? { centre: mid, n } : { centre: mid, n: normalize(sub(sg[1], sg[0])) };
  }
  if (p.kind === "plane" && p.origin === "body") {
    const axes = surfaceAxes(sc, p);
    const at = hit ?? centre;
    return axes ? { centre: at, n: axes[2] } : { centre: at, n };
  }
  return null;
}

/** The pane of the sheet's mover that the plane lies across now (the one that is lit, `in_1129`), or null when the plane has been turned off the axes. */
export function activePane(s: AppState): string | null {
  const sec = sectionNow(s);
  const k = sec ? sectionAxis(sec.n) : null;
  return k === null ? null : `pane:${"xyz"[k]}`;
}

// The state the controller works on, and the small helpers every handler uses.
import type { Ref } from "../../shared/ref.ts";
import { worldRef } from "../../shared/ref.ts";
import type { Vec3 } from "../../math/vec.ts";
import { add, scale, dot } from "../../math/vec.ts";
import { settings } from "../../shared/settings.ts";
import type { Plane } from "../../operation/part.ts";
import { normalOfPlane } from "../../operation/part.ts";
import type { Session } from "../session.ts";
import type { Tool, ToolKind } from "../tools.ts";
import type { Repeat } from "../pattern.ts";
import type { Op } from "../operations.ts";
import type { Camera } from "../camera.ts";
import type { Drag } from "../gizmo.ts";
import { homeCamera, lookStraight, lookAlternating, offsetOf, sideOf } from "../camera.ts";
import { lookup } from "../../operation/scene.ts";
import { planeOf } from "../objects.ts";
import { scene as sceneOf, selection as selectionOf } from "../session.ts";
import { sketchOfEdge } from "../../operation/edgesource.ts";

export interface MenuItem { id: string; label: string; /** the name of its icon */ icon: string; enabled: boolean; why: string | null; /** a category: choosing it opens these as the next ring */ children?: MenuItem[] }
export interface AppState {
  session: Session;
  cam: Camera;
  anim: { from: Camera; to: Camera; t0: number } | null;
  /** the last clicked surface spreads its colour from where it was clicked */
  spread: { ref: Ref; point: Vec3; startMs: number } | null;
  /** the point under the pointer on the hovered surface (for the ring) */
  hoverPoint: Vec3 | null;
  menu: { x: number; y: number; items: MenuItem[]; /** the world plane the pointer was over when it opened: a sketch tool chosen from it turns to that plane */ plane?: Ref | null } | null;
  /** every constraint is shown, also the ones that only join the outline of a body's sketch (`in_239`) */
  showAllConstraints: boolean;
  /** the arrow (or ring) of an operation that is selected (`in_238`): a click on it or taking it; only a selected arrow shows its number, so the arrows alone stay clean */
  handleSel: string | null;
  /** the rectangle of a drag select (`in_230`, `in_235`): the left button was held still, then dragged without letting up */
  box: { x0: number; y0: number; x: number; y: number; shift: boolean } | null;
  /** the list open from the ⋯ menu (`in_132`) */
  panel: "bodies" | "history" | null;
  /** a repeat being set up: it goes on until Apply or Cancel, and you can work in the world meanwhile (`in_141`) */
  repeat: Repeat | null;
  /** the history cursor when the operation that is open began: Esc cancels back to it (`in_244`) */
  opBase: number | null;
  /** the sketching tool a figure was just finished with: a click on a vertex right after starts the next figure from it, any other click drops it (`in_150`) */
  resume: ToolKind | null;
  /** the drawing tool being used (null = normal selection) */
  tool: Tool | null;
  /** the operation being set up (extrude, round, bevel, move, rotate, scale, dimension, edit) */
  op: Op | null;
  /** the relation whose badge is open: the other parts it ties show in amber */
  focus: string | null;
  /** the step (an extrusion) whose hidden sketch is shown from the history list (`in_228`) */
  showSketch: string | null;
  /** a double click turns the view to the plane, but only once the window for a third click has passed: a triple click selects the object and leaves the view alone */
  /** a drag in progress: of the camera, or of a helper handle (`gizmo.ts`) */
  drag: { camera: true } | { handle: Drag; /** the operation's value when the drag began (the drag adds to it) */ base: number; /** the handle sets the numbers of the repeat being set up */ repeat?: true } | { corner: Ref; base: Session } | null;
  /** the world plane that is on (`in_190`): it has the grid, is the one the pointer finds on empty space and the one a tool draws on; the little panes beside the axes and the X Y Z buttons change it */
  world: "XY" | "XZ" | "YZ";
  /** looking straight at a plane is a little hard to leave (`in_193`): the drag so far, in pixels, that has been kept from the camera; past `settings.view.leaveStraightPx` the view turns, and goes smoothly into perspective */
  orthoDebt: number;
  /** when the perspective began to come in after leaving a straight view (-1: at the next frame), null when it is all in */
  mixT0: number | null;
  /** the little pane under the pointer (it lights up) */
  paneHover: "XY" | "XZ" | "YZ" | null;
  /** the helper handle under the pointer */
  gizmoHover: string | null;
  /** a command was refused because it could not be done without breaking constraints: they flash red and fade, and the one that tried shakes (`in_120`) */
  flash: { culprits: string[]; victims: string[]; at: number } | null;
}
export interface Env { w: number; h: number; now: number }

export const createState = (session: Session): AppState => ({ opBase: null, session, cam: homeCamera(), anim: null, spread: null, hoverPoint: null, menu: null, box: null, showAllConstraints: false, handleSel: null, panel: null, repeat: null, resume: null, tool: null, op: null, focus: null, showSketch: null, drag: null, world: "XY", orthoDebt: 0, mixT0: null, paneHover: null, gizmoHover: null, flash: null });

/**
 * The plane a figure is being drawn on while the view is straight at it (`in_194`): the tool's plane, else (a tool armed, nothing placed yet) the one plane selected that faces the camera.
 * What lies between the camera and it must not take the drawing, so it is not picked and the body goes see-through.
 */
export function sketchPlaneOf(s: AppState): Plane | null {
  if (!s.tool || !s.cam.straight) return null;
  const get = lookup(sceneOf(s.session));
  if (s.tool.plane) { const p = get(s.tool.plane); return p?.kind === "plane" ? p : null; }
  const planes = [...new Map(selectionOf(s.session).flatMap((r) => { const p = planeOf(get, r); return p ? [[p.ref, p] as const] : []; })).values()];
  return planes.length === 1 && sideOf(s.cam, normalOfPlane(planes[0]!)) !== 0 ? planes[0]! : null;
}

export const pickOpts = (s?: AppState) => {
  const behind = s ? sketchPlaneOf(s) : null;
  // the middle point drawn on a selected curved edge of the body can be picked: it is the middle point of the sketch behind the edge (`in_214`)
  const centres = s ? selectionOf(s.session).flatMap((r) => { const e = sketchOfEdge(sceneOf(s.session), r); return e?.centre && e.centreRef ? [{ at: e.centre, ref: e.centreRef }] : []; }) : [];
  return { ...(centres.length ? { centres } : {}), pointTol: settings.pick.pointPx, lineTol: settings.pick.linePx, ...(s ? { world: worldRef(s.world) } : {}), ...(behind && s ? { inFront: { at: behind.at, n: normalOfPlane(behind), side: sideOf(s.cam, normalOfPlane(behind)) as 1 | -1 } } : {}) };
};
export const withSession = (s: AppState, session: Session): AppState => ({ ...s, session });
export const stop = (s: AppState): AppState => (s.anim ? { ...s, anim: null } : s);
export const surfacePoint = (pv: { ray?: { o: Vec3; d: Vec3 } }, t: number): Vec3 | null => (pv.ray ? add(pv.ray.o, scale(pv.ray.d, t)) : null);

/** Look straight at a plane: alternating front and back (X Y Z N), or from the side you are on (a double click). */
export const planeView = (cam: Camera, pl: Plane, alternate: boolean): Camera => {
  const n = normalOfPlane(pl);
  if (alternate) return lookAlternating(cam, n, pl.u);
  return lookStraight(cam, n, pl.u, dot(offsetOf(cam), n) >= 0 ? 1 : -1);
};
export const animateTo = (s: AppState, to: Camera, now: number): AppState => ({ ...s, anim: { from: s.cam, to, t0: now } });

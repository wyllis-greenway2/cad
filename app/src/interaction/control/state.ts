// The state the controller works on, and the small helpers every handler uses.
import type { Ref } from "../../shared/ref.ts";
import type { Vec3 } from "../../math/vec.ts";
import { add, scale, dot } from "../../math/vec.ts";
import { settings } from "../../shared/settings.ts";
import type { Plane } from "../../operation/part.ts";
import { normalOfPlane } from "../../operation/part.ts";
import type { Session } from "../session.ts";
import type { Tool } from "../tools.ts";
import type { Repeat } from "../pattern.ts";
import type { Op } from "../operations.ts";
import type { Camera } from "../camera.ts";
import type { Drag } from "../gizmo.ts";
import { homeCamera, lookStraight, lookAlternating, offsetOf } from "../camera.ts";

export interface MenuItem { id: string; label: string; /** the name of its icon */ icon: string; enabled: boolean; why: string | null }
export interface AppState {
  session: Session;
  cam: Camera;
  anim: { from: Camera; to: Camera; t0: number } | null;
  /** the last clicked surface spreads its colour from where it was clicked */
  spread: { ref: Ref; point: Vec3; startMs: number } | null;
  /** the point under the pointer on the hovered surface (for the ring) */
  hoverPoint: Vec3 | null;
  menu: { x: number; y: number; items: MenuItem[] } | null;
  /** the list open from the ⋯ menu (`in_132`) */
  panel: "bodies" | "history" | null;
  /** a repeat being set up: it goes on until Apply or Cancel, and you can work in the world meanwhile (`in_141`) */
  repeat: Repeat | null;
  /** the drawing tool being used (null = normal selection) */
  tool: Tool | null;
  /** the operation being set up (extrude, round, bevel, move, rotate, scale, dimension, edit) */
  op: Op | null;
  /** the relation whose badge is open: the other parts it ties show in amber */
  focus: string | null;
  /** a double click turns the view to the plane, but only once the window for a third click has passed: a triple click selects the object and leaves the view alone */
  /** a drag in progress: of the camera, or of a helper handle (`gizmo.ts`) */
  drag: { camera: true } | { handle: Drag; /** the operation's value when the drag began (the drag adds to it) */ base: number; /** the handle sets the numbers of the repeat being set up */ repeat?: true } | { corner: Ref; base: Session } | null;
  /** the helper handle under the pointer */
  gizmoHover: string | null;
  /** a command was refused because it could not be done without breaking constraints: they flash red and fade, and the one that tried shakes (`in_120`) */
  flash: { culprits: string[]; victims: string[]; at: number } | null;
}
export interface Env { w: number; h: number; now: number }

export const createState = (session: Session): AppState => ({ session, cam: homeCamera(), anim: null, spread: null, hoverPoint: null, menu: null, panel: null, repeat: null, tool: null, op: null, focus: null, drag: null, gizmoHover: null, flash: null });

export const pickOpts = () => ({ pointTol: settings.pick.pointPx, lineTol: settings.pick.linePx });
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

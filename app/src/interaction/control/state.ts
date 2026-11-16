// The state the controller works on, and the small helpers every handler uses.
import type { Ref } from "../../shared/ref.ts";
import { worldRef } from "../../shared/ref.ts";
import type { Vec3 } from "../../math/vec.ts";
import { cutsNow } from "./section.ts";
import type { Hint } from "../hints.ts";
import type { CutState } from "../cut.ts";
import { add, scale, dot } from "../../math/vec.ts";
import { settings } from "../../shared/settings.ts";
import type { Command } from "../../operation/commands.ts";
import type { Plane } from "../../operation/part.ts";
import { normalOfPlane } from "../../operation/part.ts";
import type { Session } from "../session.ts";
import type { Tool, ToolKind } from "../tools.ts";
import type { Repeat } from "../pattern.ts";
import type { Op, OpKind } from "../operations.ts";
import type { Camera } from "../camera.ts";
import type { Drag } from "../gizmo.ts";
import type { SimilarRule } from "../similar.ts";
import { mixOf, homeCamera, lookStraight, lookAlternating, offsetOf, sideOf } from "../camera.ts";
import { lookup } from "../../operation/scene.ts";
import { planeOf } from "../objects.ts";
import { scene as sceneOf, selection as selectionOf } from "../session.ts";
import { sketchOfEdge } from "../../operation/edgesource.ts";

export interface MenuItem { id: string; label: string; /** shown dimmed though it opens (a category with nothing that applies, `in_538`) */ dim?: true; /** chosen, it waits for what it needs to be clicked (`in_464`): `why` is what it needs */ picks?: true; /** the name of its icon */ icon: string; enabled: boolean; why: string | null; /** a category: choosing it opens these as the next ring */ children?: MenuItem[] }
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
  /** every tap adds to the selection or takes out what it hits, as Shift does: the way to select several with a finger (`in_539`) */
  adding: boolean;
  /** the arrow (or ring) of an operation that is selected (`in_238`): a click on it or taking it; only a selected arrow shows its number, so the arrows alone stay clean */
  handleSel: string | null;
  /** the selection mode of the ⋯ menu (`in_300`): every tap adds to the selection, and a tap on what is selected takes it out, as Shift does (a phone has no Shift) */
  /** the tape measure is on (`in_338`): the selected faces say what they are to each other, read only */
  tape: boolean;
  /** wireframe view (`in_383`): the body's faces are not drawn, only its edges, so a sketch inside a body can be seen */
  wireframe: boolean;
  /** the handles of a cross section plane move it or turn it (`in_396`: the plane is a part, the cross section is on while it is selected) */
  /** the sphere at the junction of the mover is selected (`in_416`): its own arrows are up, and a vertex, edge or face chosen puts the mover there */
  /** what Ctrl+C captured: pasted by Ctrl+V (`in_435`) */
  clipboard: readonly Ref[] | null;
  /** the oriented mover's pose for the selection it was made for: it stays while that is selected, across the move and turn tools (`in_439`) */
  moverPose: { key: string; offset: Vec3; frame?: [Vec3, Vec3, Vec3] } | null;
  /** when the whole orb was last moved (`in_439`): all three positions and turns show then and fade */
  orbMovedAt: number | null;
  moverSphere: boolean;
  /** the mover's place and axes as they were when the sphere was selected: Cancel puts them back (`in_421`) */
  moverWas: { pivot: Vec3 | null; frame?: [Vec3, Vec3, Vec3]; frameKept?: [Vec3, Vec3, Vec3] } | null;
  /** where a drag of its handles has taken the plane so far; one step is made when it is let go */
  sectionLive: { ref: Ref; centre: Vec3; n: Vec3 } | null;
  /** the sheet's move icon (`in_459`): which state it is in for the sheet, and the free place it came from to go back to */
  sheetMove: { ref: Ref; mode: 0 | 1 | 2 | 3 | 4; free: { at: Vec3; u: Vec3; v: Vec3 } | null } | null;
  /** the body (or "sketch") that was last in view: "Reset camera" goes back to it (`in_303`) */
  lastSeen: string | null;
  /** the move arrows chosen with Shift (`in_299`): a body dragged free then moves only along those axes (one: along a line; two: across a plane); none: free in every direction */
  lockAxes: (0 | 1 | 2)[];
  /** a cut of bodies being set up: the parts they make, which are kept (`in_294`) */
  cut: CutState | null;
  /** the constraint a point being dragged is close to (it has taken it, and a release keeps it), lit while the drag goes on (`in_290`) */
  dragHint: { hints: Hint[]; at: Vec3 } | null;
  /** the rectangle of a drag select (`in_230`, `in_235`): the left button was held still, then dragged without letting up */
  box: { x0: number; y0: number; x: number; y: number; shift: boolean; remove?: boolean } | null;
  /** the list open from the ⋯ menu (`in_132`) */
  panel: "bodies" | "history" | "groups" | null;
  /** a repeat being set up: it goes on until Apply or Cancel, and you can work in the world meanwhile (`in_141`) */
  repeat: Repeat | null;
  /** the last "select similar": the parts it began from, the rules in force, and what it selected (the chip shows only while the selection is still that) */
  similar: { base: Ref[]; rules: SimilarRule[]; refs: Ref[]; noun: string } | null;
  /** where the keyboard is in the operation bar (`in_571`, `in_577`): the place among its options, and which options these were (a place kept for other options is not this one's); a pointer choice forgets it */
  optionAt: { index: number; sig: string } | null;
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
  drag: { camera: true; /** what the view turns about for this drag (`in_291`) */ pivot?: Vec3 } | { handle: Drag; /** the ring of a revolve: the angle it had last and the total turned so far, so the turn goes on past one turn (`dec_spiral_extrude`) */ turned?: { last: number; total: number }; /** a handle of the cross section plane (`in_392`): the plane as it was when the drag began */ section?: { ref: Ref; centre: Vec3; n: Vec3 }; /** an arrow of the mirror dragged: which axis, and where its plane stood when the drag began (`in_437`) */ mir?: { k: 0 | 1 | 2; from: number }; /** the mover's sphere dragged along an arrow: where it was, and how far the body has moved since the operation began (`in_416`) */ piv?: { centre: Vec3; offset: Vec3 }; /** a ring of the selected sphere turning the mover's axes: the axes as they were when the drag began (`in_417`) */ frameTurn?: [Vec3, Vec3, Vec3]; /** a joint's handle (`in_323`): which mate, which freedom, and how far it has been taken so far */ joint?: { mate: string; kind: "turn" | "slide"; amount: number; /** the hard bodies it is against (`in_480`) */ hit?: Ref[] }; /** the operation's value when the drag began (the drag adds to it) */ base: number; /** the handle sets the numbers of the repeat being set up */ repeat?: true } | { corner: Ref; base: Session } | { /** a whole straight line dragged across its plane: where the pointer was on the plane when it began */ line: Ref; base: Session; from: Vec3 } | { /** the edge of a circle dragged to change its size (`in_290`) */ rim: Ref; base: Session } | { /** a selected body dragged free (`in_291`): where the pointer was on the plane through its middle facing the camera when it began */ body: Ref; from: Vec3; centre: Vec3; /** the move or turn that was open (its turned axes and its place): it stays open after the drag, `in_418` */ keep?: Op } | null;
  /** the world plane that is on (`in_190`): it has the grid, is the one the pointer finds on empty space and the one a tool draws on; the little panes beside the axes and the X Y Z buttons change it */
  world: "XY" | "XZ" | "YZ";
  /** the axes and the little panes put away with the orb at their junction (`in_463`) */
  worldHidden: boolean;
  /** an operation chosen from the menu with what it needs not selected (`in_464`): it waits for what is clicked next; the operations that take several things (a loft, a sweep) wait for Enter or the check */
  picking: { kind: OpKind } | null;
  /** looking straight at a plane is a little hard to leave (`in_193`): the drag so far, in pixels, that has been kept from the camera; past `settings.view.leaveStraightPx` the view turns, and goes smoothly into perspective */
  orthoDebt: number;
  /** when the perspective began to come in after leaving a straight view (-1: at the next frame), null when it is all in */
  mixT0: number | null;
  /** the perspective that was in the view when it began to come back (`in_471`): it goes from this to all of it */
  mixBase: number;
  /** the little pane under the pointer (it lights up) */
  paneHover: "XY" | "XZ" | "YZ" | null;
  /** the helper handle under the pointer */
  gizmoHover: string | null;
  /** a command was refused because it could not be done without breaking constraints: they flash red and fade, and the one that tried shakes (`in_120`) */
  flash: { culprits: string[]; victims: string[]; parts?: string[]; retry?: Command; at: number } | null;
}
export interface Env { w: number; h: number; now: number }

export const createState = (session: Session): AppState => ({ similar: null, optionAt: null, opBase: null, session, cam: homeCamera(), anim: null, spread: null, hoverPoint: null, menu: null, box: null, showAllConstraints: false, adding: false, handleSel: null, tape: false, wireframe: false, moverSphere: false, moverWas: null, moverPose: null, orbMovedAt: null, clipboard: null, sectionLive: null, sheetMove: null, worldHidden: false, picking: null, lastSeen: null, lockAxes: [], cut: null, dragHint: null, panel: null, repeat: null, resume: null, tool: null, op: null, focus: null, showSketch: null, drag: null, world: "XY", orthoDebt: 0, mixT0: null, mixBase: 0.03, paneHover: null, gizmoHover: null, flash: null });

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
  return { ...(centres.length ? { centres } : {}), pointTol: settings.pick.pointPx, lineTol: settings.pick.linePx, ...(s ? { world: worldRef(s.world) } : {}), ...(s && cutsNow(s).length ? { clips: cutsNow(s).map((c) => ({ at: c.centre, n: c.n })) } : {}), ...(behind && s ? { inFront: { at: behind.at, n: normalOfPlane(behind), side: sideOf(s.cam, normalOfPlane(behind)) as 1 | -1 } } : {}) };
};
export const withSession = (s: AppState, session: Session): AppState => ({ ...s, session });
/**
 * A camera animation is given up (the view is taken by something else: the keys, the mouse). A change of the view in between a perspective and a straight one is not left half done: the picture
 * that was part way to a straight view goes back to the perspective, smoothly from where it is (`in_471`), never staying with a narrowed lens.
 */
export const stop = (s: AppState): AppState => {
  if (!s.anim) return s;
  const m = mixOf(s.cam);
  return !s.cam.straight && m < 1 && s.mixT0 === null ? { ...s, anim: null, mixT0: -1, mixBase: Math.max(0.03, m) } : { ...s, anim: null };
};
export const surfacePoint = (pv: { ray?: { o: Vec3; d: Vec3 } }, t: number): Vec3 | null => (pv.ray ? add(pv.ray.o, scale(pv.ray.d, t)) : null);

/** Look straight at a plane: alternating front and back (X Y Z N), or from the side you are on (a double click). */
export const planeView = (cam: Camera, pl: Plane, alternate: boolean): Camera => {
  const n = normalOfPlane(pl);
  if (alternate) return lookAlternating(cam, n, pl.u);
  return lookStraight(cam, n, pl.u, dot(offsetOf(cam), n) >= 0 ? 1 : -1);
};
export const animateTo = (s: AppState, to: Camera, now: number): AppState => ({ ...s, anim: { from: s.cam, to, t0: now } });

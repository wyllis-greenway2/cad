// What to draw for the current state: one plain description the view, the chip, the badges and the controls draw from. All the decisions about what is shown
// (the big axes or the compass, which plane's grid, whether badges give way to a tool or operation) are made here, so the UI only draws.
import { fixOffered } from "./fixmotion.ts";
import { cutParts, cutStep } from "./cut.ts";
import { pieceMiddle } from "../operation/trim.ts";
import type { Ref } from "../shared/ref.ts";
import { worldRef } from "../shared/ref.ts";
import type { Gizmo } from "./gizmo.ts";
import { panelOf } from "./panels.ts";
import { patternCentre, liveRepeat } from "./pattern.ts";
import type { Panel } from "./panels.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import { normalOfPlane } from "../operation/part.ts";
import { planeOf } from "./objects.ts";
import type { Plane } from "../operation/part.ts";
import type { Camera } from "./camera.ts";
import { offsetOf, sideOf, nearTolMm, projector, eyeDistance } from "./camera.ts";
import { dot, cross, normalize, add, sub, scale } from "../math/vec.ts";
import { apply } from "../operation/commands.ts";
import { outlineOf } from "../operation/part.ts";
import { seenIn } from "./picking.ts";
import { tapeAnnotations } from "./tape.ts";
import { thinPlacesOf } from "./measure.ts";
import { mateStatus, faceMiddle } from "../operation/mates.ts";
import { jointRigid, constrainedMotion } from "./mate.ts";
import { jointMatrix, followMatrix } from "./motion.ts";
import { linksOf } from "../operation/coupling.ts";
import { animatedBodies } from "../operation/gearcouple.ts";
import { pivotOfBody } from "../operation/pivot.ts";
import { jointOf as jointOfMate } from "./mate.ts";
import { axisAcross } from "./revolve.ts";
import { gearOfPart, gearOfSelection } from "../operation/gearscene.ts";
import { planetaryOfGear } from "../operation/planetary.ts";
import { canHelix, finish as finishTool } from "./tools.ts";
import { hasBody } from "../operation/gear.ts";
import { hardMotion, hardNote, limitedOp, hardCollision, hardOverlaps, hardNames } from "./hard.ts";
import type { KernelResult } from "../compiler/kernel/adapter.ts";
import { withCorner } from "./runop.ts";
import { scene as sceneOf, selection as selectionOf, previewCommand, previewRefusal, undoLast } from "./session.ts";
import type { Session } from "./session.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import { SIMILAR_RULES } from "./similar.ts";
import { loftChips, loftStarts } from "./loft.ts";
import { sweepChips } from "./sweep.ts";
import { faceKinds, sizeKinds, optionsOf, similarOf } from "./options.ts";
import { noticesOf } from "./notice.ts";
import type { Notice } from "./notice.ts";
import type { Option } from "./options.ts";
import { sweepStart } from "./sweep.ts";
import { moverOp } from "./control/pose.ts";
import { mirrorPlane } from "./mirror.ts";
import { startOp, opCommand, bodyMotion, valueOf, chamferFaces, chosenFace } from "./operations.ts";
import { matrixOf, applyPoint, NONE } from "../operation/frames.ts";
import type { Rigid } from "../operation/frames.ts";
import type { Command } from "../operation/commands.ts";
import type { CompileOutcome } from "../compiler/compile.ts";
import type { AppState } from "./control/state.ts";
import { sketchPlaneOf } from "./control/state.ts";
import { gridPlaneOf, selectedSurface } from "./control/viewing.ts";
import { nothingInView } from "./lastseen.ts";
import { gridFor } from "./grid.ts";
import { WORLD_NAMES, paneCorners } from "./panes.ts";
import type { WorldName } from "./panes.ts";
import { settings } from "../shared/settings.ts";
import { viewOf } from "./toolpathview.ts";
import type { ToolpathView } from "./toolpathview.ts";
import type { Toolpath } from "../manufacturing/index.ts";

/** The preview as lines, made again only when the toolpath or the position changes (the frame is made often). */
let lastPreview: { tp: Toolpath; at: number; view: ToolpathView } | null = null;
const previewView = (tp: Toolpath, at: number): ToolpathView => (lastPreview && lastPreview.tp === tp && lastPreview.at === at ? lastPreview.view : (lastPreview = { tp, at, view: viewOf(tp, at) }).view);
import type { Grid } from "./grid.ts";
import { annotationsFor, annotationsOf, focusParts } from "./annotations.ts";
import { suggestionsFor } from "./suggest.ts";
import type { Suggestions } from "./suggest.ts";
import type { Annotation } from "./annotations.ts";
import { sectionQuad, sectionNow, cutsNow, modeOf, sheetMoveOf } from "./control/section.ts";
import { buildingText } from "./modeltool.ts";
import { inUnits, entryOf, revolveEntries, loftEntries, previewFor, repeatEntries, moveEntries, moverPlaceEntries, mirrorEntries, scaleEntries, sectionEntries } from "./entry.ts";
import { helperOf } from "./pattern.ts";
import type { Entry } from "./entry.ts";
import type { Preview } from "./tools.ts";
import { gizmoOf, activeOp } from "./control/handles.ts";
import type { Op } from "./operations.ts";
import { followed, moveOffset, hasGizmo, handleMiddle } from "./gizmo.ts";
import { crossing } from "./boxselect.ts";
import type { Handle } from "./gizmo.ts";
import { standIns } from "./standin.ts";
import { partIndex } from "../operation/partindex.ts";
import type { StandIn } from "./standin.ts";

/** A refused change, while it flashes: how far through it is (0 to 1), the constraints it would have broken (red, fading), the ones that tried (they shake), and the parts of the broken ones. */
export interface FlashFrame { t: number; victims: string[]; culprits: string[]; parts: Ref[]; /** constraints that already held when asked for again: green, fading (`in_1103`) */ green?: string[]; greenParts?: Ref[] }

const animatedMemo = new WeakMap<Scene, Map<Ref, Ref>>();
/** The bodies hooked up to an animation (`gearcouple.ts`), worked out once for each scene. */
const animated = (sc: Scene): Map<Ref, Ref> => { let m = animatedMemo.get(sc); if (!m) { m = animatedBodies(sc); animatedMemo.set(sc, m); } return m; };
/** The bodies that yield by contact whose rest can be set: a pivoted body (`Pivot.rest`) or the first body of a coaxial mate (the joint's `turnRest`), that turn. */
const springsOf = (sc: Scene, m: NonNullable<AppState["motion"]>): { ref: string; name: string; rest: number | null }[] =>
  (m.contact?.pushables ?? []).flatMap((p) => {
    if (p.kind !== "turn") return [];
    const body = sc.parts[p.body];
    const name = body?.kind === "body" && body.id ? body.id : p.body;
    const pv = pivotOfBody(sc, p.body);
    if (pv) return [{ ref: p.body, name, rest: pv.rest ?? null }];
    const j = p.mate ? jointOfMate(sc, p.mate)?.turn : undefined;
    return j ? [{ ref: p.body, name, rest: j.rest ?? null }] : [];
  });
const IDENTITY16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** The matrix a motion draws a body by: the driver's, or a follower's (a gear it turns, a rod it slides, a body that yields); null for a body that stays. */
const motionMatrixOf = (m: NonNullable<AppState["motion"]>, body: Ref): number[] | null => {
  if (m.body === body) return jointMatrix(m, m.amount);
  const fo = [...m.follows, ...(m.yields ?? [])].find((f) => f.body === body);
  return fo ? followMatrix(fo, m.amount) : null;
};
/** The matrix the selection is drawn by while a motion plays (`in_984`): the one matrix of the selected bodies when they all have it (a body that stays has none: the identity); the identity when they differ, so a highlight is never moved by the matrix of another body than its own. */
const selectionMatrixOf = (m: NonNullable<AppState["motion"]>, bodies: ReadonlySet<Ref>): number[] => {
  const all = [...bodies].map((b) => motionMatrixOf(m, b) ?? IDENTITY16);
  return all.length && all.every((x) => x.every((v, i) => Math.abs(v - all[0]![i]!) < 1e-9)) ? all[0]! : IDENTITY16;
};
/** What the bar shows: a joint with no stops that turns goes round and round, so the number is kept within half a turn either way (it would otherwise grow without end, and the slider has its ends at the half turns). */
/** A number for the bar that is always the same width (`in_961`): one decimal, always (not "-78" one frame and "-83.2" the next), padded on the left with figure spaces (as wide as a digit) to the width of "-100.5", so the words round it do not move as it changes. */
const steadyNumber = (x: number): string => { const t = (Math.abs(x) < 0.05 ? 0 : x).toFixed(1); return t.padStart(6, "\u2007"); };
const shownAmount = (m: NonNullable<AppState["motion"]>): number => (m.free && m.kind === "turn" ? ((((m.amount + 180) % 360) + 360) % 360) - 180 : m.amount);
export interface GizmoFrame { handles: Handle[]; hover: string | null; active: string | null; chosen?: string | null; locked?: string[]; /** the handle that pulses blue: the mover's sphere while it is the thing being oriented (`in_421`) */ pulse?: string }

export interface Frame {
  scene: Scene;
  mesh: KernelResult["mesh"];
  /** the body is drawn moved by this matrix (16 numbers, column by column) while its move, turn or scale is dragged or waits for the kernel (`in_216`) */
  bodyMatrix: number[] | null;
  /** the edges of a body that are behind a face are drawn faintly: while a sketch tool is on and there is a body to draw on or against (`in_324`) */
  hiddenEdges: boolean;
  /** the plane being sketched on, as a point of it and its normal toward the camera: the body's edges past it are drawn faintly (`in_1045`) */
  behindPlane: { n: [number, number, number]; at: [number, number, number] } | null;
  /** when the matrix moves one body of several: the triangles (ranges of the mesh's index list) and the box of that body, so only it is moved (`in_273`) */
  bodySplit: { tris: [number, number][]; box: { min: Vec3; max: Vec3 } } | null;
  /** the bodies that are hidden (`dec_hidden_bodies`), each as its triangles (ranges of the mesh's index list): drawn very faintly, not part of the body that is drawn in full */
  hiddenBodies: { tris: [number, number][] }[] | null;
  /** the triangles of the places too thin to print, marked in the picture while the Measure tab is open (`in_626`) */
  thin: number[] | null;
  /** the eye on each body (`dec_hidden_bodies`): its box's corners and whether it is hidden; `eyesQuiet`: a tool or an operation is in use, so the eyes of shown bodies stay away */
  bodyEyes: { ref: string; hidden: boolean; corners: Vec3[]; /** the body is selected (or a face of it): its play button is shown, not only when the pointer is over it (`in_962`) */ selected?: true; /** a body hooked up to an animation has a play button (pause while it plays) beside its eye */ play?: "play" | "pause" }[];
  eyesQuiet: boolean;
  /** the gear's own icon (`in_693`): a gear is selected (its sketch or its body): where it stands (the top of the gear) and what it offers */
  gearChip: { /** the part of the gear the icon is for (what is selected or pointed at) */ part: Ref; at: Vec3; items: { id: string; label: string; icon: string; enabled: boolean; why: string | null }[] } | null;
  /** the bodies that move with the one being dragged, each by its own matrix, as its mates take them along (`in_341`) */
  followers: { matrix: number[]; split: NonNullable<Frame["bodySplit"]> }[];
  /** what is selected is the body, so its highlight is moved by the same matrix */
  selectionMoves: boolean;
  /** while a motion plays: the matrix the selected body is drawn by (the driver's, a follower's, or none for a body that stays), so what is highlighted goes with the body and not by the driver's matrix (`in_984`); null when there is no motion */
  selectionMatrix: number[] | null;
  highlight: { /** the triangles of a body of several that is selected or pointed at, as ranges of the mesh's index list: every face of it, the teeth of a gear too, which are not parts (`in_867`) */ bodyTris?: Record<string, [number, number][]>; hover: Ref | undefined; hoverPoint: Vec3 | null; selection: readonly Ref[]; amber: readonly Ref[]; /** the parts of constraints a refused change would have broken, and how red they still are */ red: { refs: readonly Ref[]; alpha: number }; /** constraints that already held, asked for again: green, fading (`in_1103`) */ green: { refs: readonly Ref[]; alpha: number }; /** the copies a repeat that is open would make, drawn pulsing (`in_244`) */ temp: readonly Ref[]; spread: AppState["spread"]; };
  preview: Preview | null;
  entry: Entry | null;
  /** the several value bubbles of a repeat being set up (one on each axis, or one by the rings) */
  entries: Entry[];
  /** a little bubble of help on an arrow (`in_236`) */
  helper: { at: Vec3; text: string } | null;
  /** the kernel is still working the model out (a picture of it may be a moment old): a "working" sign shows if it takes a while */
  busy: boolean;
  /** what the working sign says: how far a model made in pieces is (`dec_progressive_open`) */
  busyText?: string;
  /** the discs that stand for gear bodies the kernel has not made yet (`dec_gear_standin`) */
  standIns: StandIn[];
  /** everything the person is told, as one list for one renderer (`in_665`) */
  notices: Notice[];
  /** the world axis the selected plane or face lies across and which end of it the camera must be at to see it (so that X Y Z button is lit, as + or −) */
  lookHint: { axis: "X" | "Y" | "Z"; sign: 1 | -1 } | null;
  /** The world axis the camera is nearest to looking along, and how near (0: no axis is near, 1: exactly along it): its button takes on the colour as the view comes round to it, to pick the straight view that is closest (`in_295`) */
  facing: { axis: "X" | "Y" | "Z"; sign: 1 | -1; strength: number };
  /**
   * What a finger is offered (`in_283`, `in_284`): a finger has no hover and cannot press, drag and let go on small arrows, so there is a drag icon that does the dragging for it and a check that applies. `cursor`: a
   * figure being drawn (the first point is set and the next held: each has a drag icon, the held one moves like a hover, a placed one moves that point; a tap sets the held point). `handle`: an arrow or ring that has been tapped (or the only one there is) of an operation (the drag icon
   * drags it, as the mouse would; a tap away from it applies the operation when one is open). `points` say where the icons are; `handles` every handle there (a tap on one selects it).
   */
  touchHelper: { kind: "figure" | "handle"; /** each point a drag icon stands by: `index` is the placed point it moves (0 the first), or -1 for the cursor (the next point, held) / the handle */ points: { at: Vec3; index: number }[]; handles: Vec3[][]; applies: boolean } | null;
  /** whether there is something to undo / redo (the undo and redo buttons of a touch screen, `in_283`) */
  undoRedo: { undo: boolean; redo: boolean };
  /** the rectangle of a drag select being drawn, in pixels (`in_230`); `touching`: it was dragged from the right, so what it only touches is picked too */
  box: { x0: number; y0: number; x: number; y: number; touching: boolean } | null;
  /** what the constraint bubbles keep off: the drawn lines and curves (as line pieces) and corners */
  avoid: { segs: [Vec3, Vec3][]; pts: Vec3[] };
  /** the constraints the end of the line being drawn is close to, and where it is */
  hint: { kinds: string[]; at: Vec3 } | null;
  /** the open list (bodies, history) */
  panel: Panel | null;
  /** the constraints of the selected parts, each with the spot it is shown at (on the line, at the vertex, between the lines, at the angle) */
  annotations: Annotation[];
  flash: FlashFrame | null;
  grid: Grid | null;
  /** the body goes see-through while a plane is sketched on, looked at straight, and the body lies between it and the camera (`in_194`) */
  fadeBody: boolean;
  wireframe: boolean;
  /** the cross section plane (`in_392`) and, while it is being chosen, the three planes offered */
  /** every cross section plane in the part, faint when it is not selected (`in_396`) */
  sectionPlanes: { ref: Ref; /** a guide drawn for a tool (the mirror's plane), not a sheet: no icons */ guide?: true; selected: boolean; cutting: boolean; /** the mode of its icon (`in_459`): 0 cuts the half its normal points to, 1 the other half, 2 no cut, 3 invisible */ mode: 0 | 1 | 2; /** invisible: it cannot be pointed at (`in_466`) */ hidden: boolean; /** the state of its move icon, for the one that is selected */ move: 0 | 1 | 2 | 3 | 4; corners: Vec3[] }[];
  /** the sheets that are cutting the view (`in_416`, any number: `in_459`); the normal points to the half cut away */
  sections: { at: Vec3; n: Vec3; corners: Vec3[] }[];
  /** the constraints that could be put on the selected parts, as buttons by them (`in_195`) */
  suggest: Suggestions | null;
  /** a little icon by the move arrows of a body (or a drawn figure) that switches to turning it, and by its rings one that switches back (`in_206`) */
  /** the chip that follows "select similar": its rules and how many were selected; there only while the selection is still what it chose (`in_257`) */
  /** nothing of the model is in view: the Reset camera button is offered (`in_303`) */
  resetView: boolean;
  /** a change refused for the constraints it would break, while it flashes: the button that deletes them and goes on (`in_366`) */
  refusal: { text: string; button: string; /** the constraint it stands beside */ beside: string } | null;
  /** push / pull of one flat face: what it does, to choose (`in_405`) */
  /** every option of the operation bar, in order (`in_664`) */
  options: Option[];
  faceKinds: { id: "move" | "extrude" | "extend"; label: string; title: string; on: boolean }[] | null;
  /** a fillet of one edge: the same size all along, or a size at each end (`in_406`) */
  /** a revolve: the lines the figure can turn about, one chosen (`dec_spiral_extrude`) */
  sweepKinds: { id: string; label: string; title: string; on: boolean }[] | null;
  loftKinds: { id: string; label: string; title: string; on: boolean }[] | null;
  sizeKinds: { id: "constant" | "variable" | "twoDistances" | "swap"; label: string; title: string; on: boolean }[] | null;
  /** the pill that says adding to the selection is on (`in_539`: every tap adds, Done leaves); it is started from a finger's menu, not offered (`in_663`) */
  adding: "on" | null;
  /** a manufacturing route's toolpath over the drawing, as lines (`in_570`), and the scrubber under it; none when no preview is open */
  toolpath: ToolpathView | null;
  previewBar: { at: number; label: string } | null;
  /** the bar of a joint that is played or scrubbed: where it stands, its range, what it does and whether it is playing (`dec_mechanism_motion`) */
  motionBar: { amount: number; lo: number; hi: number; kind: "turn" | "slide"; playing: boolean; reversed: boolean; /** the bodies that yield by contact whose joint can have a rest (a pivot, a coaxial mate): the body, and where it goes back to (degrees), or null: it stays where it was pushed (`in_1020`) */ springs: { ref: string; name: string; rest: number | null }[]; label: string; /** what is to be said about the motion (a jam, a heavy push): in a place of its own above the bar, so its length never changes the bar */ note: string | null; /** the links of the joint played: the ratio, as seen from it, and what the other end does */ links: { id: string; ratio: number; kind: "turn" | "slide" }[]; /** the offer to replace the push by joints (`in_1122`): shown when a body with no joint has been pushed; while the walk is open, the joint offered now and how far through it is */ fix: { offer: boolean; step: { text: string; n: number; of: number; how: string } | null } } | null;
  similar: { rules: { id: string; label: string; title: string; on: boolean }[]; count: number; noun: string } | null;
  modeSwitch: { at: Vec3; /** every point of the handles, so the icon can stand at the upper left of them (`in_215`) */ pts: Vec3[]; to: "move" | "rotate" | "linear" | "circular" | "invert"; label: string } | null;
  /** the sketching tool that is on, for the pill at the top (`in_193`) */
  tool: { kind: "rect" | "circle" | "line" | "arc" | "spline" | "cam" | "trim" | "gear" | "model"; label: string; /** figures made while it has been on (the chip flashes at each) */ made: number; /** a figure is half drawn (the chip's cross then cancels it) */ drawing: boolean; /** something is made and nothing is half drawn: the chip shows a check that puts the tool away, in place of the cross (`in_283`) */ done: boolean } | null;
  /** a repeat or an operation that is open: the tick (Enter, a right click) and the cross (Esc) are shown for it (`in_244`) */
  confirm: { kind: string; label: string; /** words shown in the bubble beside the buttons */ text?: string } | null;
  /** a cut of bodies being set up: the parts they make, with where the control of each stands and whether it is kept; and whether what is kept is joined (`in_294`) */
  cut: { parts: { mask: number; at: Vec3; label: string; tip: string; kept: boolean }[]; join: boolean } | null;
  /** the little panes of the world planes beside the axes (`in_190`) */
  /** a small mark on each hard body (`in_476`): the body and the point of it the mark stands at (the middle of its top) */
  hardMarks: { ref: Ref; at: Vec3; /** the hard bodies it overlaps (the history put them together), `in_478` */ overlaps?: string; /** the hard body it is bumping into now, or that is bumping into it (`in_489`) */ bumps?: string }[];
  /** the axes and the panes are put away (`in_463`) */
  worldHidden: boolean;
  panes: { name: WorldName; corners: Vec3[]; active: boolean; hover: boolean }[];
  /** the helper handles of the running operation (arrows, a double arrow, curved arrows), or null */
  gizmo: GizmoFrame | null;
  cursor: "crosshair" | "grab" | "";
  /** the message to show: a refusal, or the first step that failed to build */
  message: string;
}

/** While an operation's number is being set, the scene as it would be after it: the real result (a gray body, a cut, a round) and not a sketch of it. Remembered for the same command. */
let previewProblem: string | null = null;
/**
 * The session as it was before the step the open operation made (the operation's value is the whole of what it did, so it is shown on that). Taking the step back can mean solving the sketch's constraints again,
 * so it is done once for a session and not once for every picture while the view is turned with the arrow still open (`in_247`: 100 ms a picture on a sketch of a hundred constraints).
 */
const undoneMemo = new WeakMap<Session, Session>();
function undone(session: Session): Session {
  let u = undoneMemo.get(session);
  if (!u) { u = undoLast(session); undoneMemo.set(session, u); }
  return u;
}
let memo: { history: Session["history"]; outcome: Session["outcome"]; key: string; value: { scene: Scene; outcome: CompileOutcome } | null } | null = null;
let gpuBase: { history: Session["history"]; outcome: Session["outcome"]; made: boolean; value: { scene: Scene; outcome: CompileOutcome } } | null = null;
/** The last drag of a whole-body motion (its matrix and how many steps came before it): while the kernel is still working its result out, that is what the stale picture is moved by (`in_216`). */
let lastDrag: { split?: Frame["bodySplit"]; matrix: number[]; steps: number } | null = null;
/**
 * A drawn point, straight line or circle that is selected can be moved with a finger by its drag icon (`in_290`): the icon's proxy drag begins on the part (a corner, the middle of a line, a place on a circle's edge), where a
 * mouse drag would take it: the corner goes, the whole line goes, the circle's size changes.
 */
function partHelperOf(s: AppState): Frame["touchHelper"] {
  const sc = sceneOf(s.session);
  const sel = selectionOf(s.session);
  if (sel.length !== 1) return null;
  const p = sc.parts[sel[0]!];
  if (!p || p.origin !== "drawn" || !p.movable) return null;
  let at: Vec3 | null = null;
  if (p.kind === "corner" && p.plane) at = p.at;
  else if (p.kind === "line" && !p.derived && !p.center && p.plane) { const [a, b] = [sc.parts[p.a], sc.parts[p.b]]; at = a?.kind === "corner" && b?.kind === "corner" ? [(a.at[0] + b.at[0]) / 2, (a.at[1] + b.at[1]) / 2, (a.at[2] + b.at[2]) / 2] : null; }
  else if (p.kind === "line" && !p.derived && p.center && p.plane) { at = pieceMiddle(sc, p.ref)?.at ?? null; } // (an arc: the middle of the curve)
  else if (p.kind === "circle" && p.plane) { const [c, pl] = [sc.parts[p.center], sc.parts[p.plane]]; at = c?.kind === "corner" && pl?.kind === "plane" ? [c.at[0] + pl.u[0] * p.radius, c.at[1] + pl.u[1] * p.radius, c.at[2] + pl.u[2] * p.radius] : null; }
  return at ? { kind: "handle", points: [{ at, index: -1 }], handles: [], applies: false } : null;
}

/** What a finger is offered now (see `Frame.touchHelper`). */
function touchHelperOf(s: AppState, gizmo: { handles: Handle[] } | null): Frame["touchHelper"] {
  if (s.cut) return { kind: "handle", points: [], handles: [], applies: true }; // (a tap in free space makes the cut, as a right click does)
  if (s.tool) return s.tool.held && s.tool.cursor ? { kind: "figure", points: [...s.tool.points.map((at, index) => ({ at, index })), { at: s.tool.cursor, index: -1 }], handles: [], applies: false } : null; // (a finger holds the next point: it and the points already set each have a drag icon, and a tap sets the one held, `in_286`, `in_288`)
  if (s.drag && !("handle" in s.drag) && !("corner" in s.drag) && !("line" in s.drag) && !("rim" in s.drag)) return null;
  if (!gizmo || (s.drag && !("handle" in s.drag))) return !s.op && !s.repeat ? partHelperOf(s) : null;
  const chosen = s.handleSel ? gizmo.handles.find((h) => h.id === s.handleSel) : (s.op || s.repeat) && gizmo.handles.length === 1 ? gizmo.handles[0] : undefined;
  // an operation is open and no arrow has been chosen: no drag icon yet, but a tap on an arrow selects it and a tap anywhere else is a right click, as with one chosen (`in_292`)
  if (!chosen) return s.op || s.repeat ? { kind: "handle", points: [], handles: gizmo.handles.map((h) => h.points), applies: true } : null;
  return chosen ? { kind: "handle", points: [{ at: handleMiddle(chosen), index: -1 }], handles: gizmo.handles.map((h) => h.points), applies: !!(s.op || s.repeat) } : null;
}

/** The body moved only on the graphics card (`in_216`): the matrix, and the scene and result as they are without this step. Null when the kernel has to work it out. */
let motionSplitMemo: { outcome: unknown; body: string; split: Frame["bodySplit"] } | null = null;
const followSplits = new Map<string, Frame["bodySplit"]>(); // (the triangles of each body that follows, kept for the kernel's answer they were found in)
let followSplitsFor: unknown = null;
function gpuMotion(s: AppState): { split?: Frame["bodySplit"]; matrix: number[]; shown: { scene: Scene; outcome: CompileOutcome }; /** the mates that hold the dragged body back (`in_338`) */ blocked?: string[]; /** the hard bodies the dragged one is against (`dec_hard_bodies`) */ hardHit?: Ref[]; /** the hard bodies bumping now: those that are dragged (with how far they have gone) and those they are against (`in_489`) */ bumping?: { movers: Ref[]; hit: Ref[]; shift: Vec3 }; /** where the dragged body's middle actually went, held by its mates: the arrows and numbers show it, not the pointer (`in_347`) */ shownFree?: Vec3; /** the other bodies selected, dragged with it (`in_341`, `in_345`) */ followers?: { matrix: number[]; split: NonNullable<Frame["bodySplit"]> }[] } | null {
  if (s.motion && (!s.drag || "camera" in s.drag)) { // (turning the view is a drag too, `drag: { camera: true }`: the motion goes on under it, `in_969`) a joint played or scrubbed (`dec_mechanism_motion`): the body is drawn moved by the amount it stands at; nothing is made
    const sc0 = sceneOf(s.session);
    if (!(motionSplitMemo && motionSplitMemo.outcome === s.session.outcome && motionSplitMemo.body === s.motion.body)) {
      const fake = startOp(sc0, [s.motion.body], "move", null);
      motionSplitMemo = { outcome: s.session.outcome, body: s.motion.body, split: fake.ok ? bodySplitOf(sc0, s.session.outcome, fake.op) : null };
    }
    if (!(gpuBase && gpuBase.history === s.session.history && gpuBase.outcome === s.session.outcome && gpuBase.made === false)) gpuBase = { history: s.session.history, outcome: s.session.outcome, made: false, value: { scene: sc0, outcome: s.session.outcome } };
    if (followSplitsFor !== s.session.outcome) { followSplits.clear(); followSplitsFor = s.session.outcome; }
    const followers = [...s.motion.follows, ...(s.motion.yields ?? [])].flatMap((fo) => {
      if (!followSplits.has(fo.body)) { const q = startOp(sc0, [fo.body], "move", null); followSplits.set(fo.body, q.ok ? bodySplitOf(sc0, s.session.outcome, q.op) : null); }
      const split = followSplits.get(fo.body);
      return split ? [{ matrix: followMatrix(fo, s.motion!.amount), split }] : []; // (each by its own matrix: a gear turned about its own axis by the ratio of the teeth, a rack slid, `dec_mechanism_motion`)
    });
    return { matrix: jointMatrix(s.motion, s.motion.amount), shown: gpuBase.value, ...(motionSplitMemo.split ? { split: motionSplitMemo.split } : {}), ...(followers.length ? { followers } : {}) };
  }
  if (s.drag && "handle" in s.drag && s.drag.joint) { // a joint's handle dragged: the body is drawn turned or slid by the amount so far (`in_323`)
    const jd = s.drag.joint;
    const sc0 = sceneOf(s.session);
    const rigid = jointRigid(sc0, jd.mate, jd.kind, jd.amount);
    const body = selectionOf(s.session)[0];
    const fake = body ? startOp(sc0, [body], "move", null) : null;
    if (!(gpuBase && gpuBase.history === s.session.history && gpuBase.outcome === s.session.outcome && gpuBase.made === false)) gpuBase = { history: s.session.history, outcome: s.session.outcome, made: false, value: { scene: sc0, outcome: s.session.outcome } };
    if (!rigid || !fake?.ok) return null;
    const matrix = matrixOf(rigid);
    const split = bodySplitOf(sc0, s.session.outcome, fake.op);
    lastDrag = { split, matrix, steps: sc0.steps.length };
    return { matrix, shown: gpuBase.value, split, ...(jd.hit?.length ? { hardHit: jd.hit } : {}), ...(jd.hit?.length && body ? { bumping: { movers: [body], hit: jd.hit, shift: rigid.shift } } : {}) };
  }
  const op = s.op;
  if (!op) return null;
  const base = op.made ? undone(s.session) : s.session;
  // a move, turn or uniform scale of the whole body is exact on the graphics card (a matrix: no guess in it) and needs no kernel; every other operation is drawn from the kernel's own result (`in_362`)
  const asked = bodyMotion(sceneOf(base), op);
  if (!asked) return null;
  // the bodies selected move as one; the others stay where they are, mated to them or not, and the mates of the bodies that move hold them (`in_338`, `in_345`)
  const group = op.target === "body" ? op.parts.filter((r) => sceneOf(base).parts[r]?.kind === "body") : [];
  // hard bodies (`dec_hard_bodies`): what is asked is taken only as far as a hard body can go before it meets another (the body it is against flashes), and then the mates settle it (`in_477`: the same order as at release)
  const stopped = group.length && !op.typed && op.kind !== "scale" ? hardMotion(sceneOf(base), group, () => asked, op.kind === "move" && !!op.free, !!op.grab) : null;
  const askedLimited: Rigid = stopped ? stopped.rigidOf(group[0]!) ?? asked : asked;
  const held = group.length ? constrainedMotion(sceneOf(base), group, askedLimited, op.grab) : null;
  const rigidOf1 = (b: Ref): Rigid | null => (held ? held.rigids.find((q) => q.body === b)?.rigid ?? null : askedLimited);
  // the mates may leave a body in a hard one: then it stays where it was, and the body it would be in flashes
  const mated = group.length && held && !op.typed ? hardCollision(sceneOf(base), group, rigidOf1) : [];
  const rigidOf = (b: Ref): Rigid | null => (mated.length ? NONE : rigidOf1(b));
  const m = group.length ? rigidOf(group[0]!) : asked;
  const blockedBodies = mated.length ? mated : []; // (a hard body that meets another stops, or slides, and does not flash: it is only that the mates left it in one that is shown, `in_484`)
  if (!m) return null;
  if (!(gpuBase && gpuBase.history === s.session.history && gpuBase.outcome === s.session.outcome && gpuBase.made === !!op.made)) gpuBase = { history: s.session.history, outcome: s.session.outcome, made: !!op.made, value: { scene: sceneOf(base), outcome: base.outcome } };
  const matrix = matrixOf(m);
  lastDrag = { split: bodySplitOf(sceneOf(base), gpuBase.value.outcome, op), matrix, steps: sceneOf(base).steps.length };
  // what is drawn on a face of the body goes with it while it is dragged (it is carried when it is let go): the picture of the sketches is moved by the same numbers, no kernel (`in_234`)
  let shown = gpuBase.value;
  if (m) {
    const full = opCommand(sceneOf(base), op);
    const carry = full?.type === "batch" ? full.commands.filter((c) => c.type !== "addStep") : [];
    if (carry.length) { const moved = apply(sceneOf(base), { type: "batch", commands: carry }); if (moved.ok) shown = { scene: moved.value, outcome: gpuBase.value.outcome }; }
  }
  // the other bodies selected go with it, each drawn moved by its own matrix (`in_341`, `in_345`)
  const followers = group.slice(1).flatMap((b) => { const r = rigidOf(b); const fo = r ? startOp(sceneOf(base), [b], "move", null) : null; const split = fo?.ok ? bodySplitOf(sceneOf(base), gpuBase!.value.outcome, fo.op) : null; return r && split ? [{ matrix: matrixOf(r), split }] : []; });
  // the arrows and numbers of a drag the mates hold back show where the body went, not where the pointer is
  const first = group[0] ? sceneOf(base).parts[group[0]] : undefined;
  const centre: Vec3 | null = first?.kind === "body" && first.bbox ? [(first.bbox.min[0] + first.bbox.max[0]) / 2, (first.bbox.min[1] + first.bbox.max[1]) / 2, (first.bbox.min[2] + first.bbox.max[2]) / 2] : null;
  const went = (held || stopped) && m && centre ? applyPoint(m, centre) : null;
  return { matrix, shown, split: lastDrag.split, ...(held ? { blocked: held.blocked } : {}), ...(blockedBodies.length ? { hardHit: blockedBodies } : {}), ...(stopped && stopped.hit.length && m ? { bumping: { movers: [...group], hit: stopped.hit, shift: m.shift } } : {}), ...(went && centre ? { shownFree: sub(went, centre) as Vec3 } : {}), followers };
}

/** A sweep or a loft chosen before its things were clicked is already enough with what is selected: what it would make is shown while it waits for the check, as when it is open (`in_529`). */
function pickingOp(s: AppState): Op | null {
  if (!s.picking || s.op || s.tool || s.repeat || (s.picking.kind !== "sweep" && s.picking.kind !== "loft")) return null;
  const r = startOp(sceneOf(s.session), selectionOf(s.session), s.picking.kind, null);
  return r.ok ? r.op : null;
}

function operationResult(s: AppState): { scene: Scene; outcome: CompileOutcome } | null {
  // a gear that has a body (a thickness, a helix, a worm), being edited: the body it would be is drawn as its numbers are typed, from the kernel in its draft mode (`in_719`); a wheel is not (its sections take seconds to work out)
  if (s.tool?.kind === "gear" && s.tool.gear?.editing && !s.op) {
    const sc = sceneOf(s.session);
    const rec = sc.gears?.find((g) => g.id === s.tool!.gear!.editing);
    const cmd = rec && !rec.spec.wheel && !rec.spec.bevel && (hasBody(rec.spec) || rec.spec.worm) ? finishTool(sc, s.tool)?.command : undefined;
    if (cmd && cmd.type === "setGear" && !cmd.spec.wheel) {
      const key = JSON.stringify(["gear", cmd]);
      if (memo && memo.history === s.session.history && memo.outcome === s.session.outcome && memo.key === key) return memo.value;
      const value = previewCommand(s.session, cmd);
      memo = { history: s.session.history, outcome: s.session.outcome, key, value };
      return value;
    }
  }
  // a planetary set being edited: the bodies it would make, in the same draft mode (`dec_planetary_gears`)
  if (s.tool?.kind === "gear" && s.tool.gear?.planetary && s.tool.gear.editing && !s.op) {
    const cmd = finishTool(sceneOf(s.session), s.tool)?.command;
    if (cmd && cmd.type === "setPlanetary") {
      const key = JSON.stringify(["planetary", cmd]);
      if (memo && memo.history === s.session.history && memo.outcome === s.session.outcome && memo.key === key) return memo.value;
      const value = previewCommand(s.session, cmd);
      memo = { history: s.session.history, outcome: s.session.outcome, key, value };
      return value;
    }
  }
  // the cut that is being set up shows what the parts kept would make
  if (s.cut) {
    const cmd = cutStep(sceneOf(s.session), s.cut);
    if (!cmd) return null;
    const key = JSON.stringify(["cut", cmd]);
    if (memo && memo.history === s.session.history && memo.outcome === s.session.outcome && memo.key === key) return memo.value;
    const value = previewCommand(s.session, cmd);
    memo = { history: s.session.history, outcome: s.session.outcome, key, value };
    return value;
  }
  // the operation being set up, else the repeat being set up (what it would make shows while its numbers are set)
  const op0 = s.op ?? pickingOp(s) ?? (s.repeat ? liveRepeat(sceneOf(s.session), s.repeat) : null);
  if (!op0) return null;
  const base = op0.made ? undone(s.session) : s.session; // a step already made for this operation is replaced by what is being dragged
  const op = (op0.kind === "pushpull" || op0.kind === "extrude" || op0.kind === "revolve") && sceneOf(base).hard?.length ? (() => { const l = limitedOp(sceneOf(base), op0); return l && "op" in l ? l.op : op0; })() : op0; // (a hard body's face is drawn pulled only as far as it can go, `in_475`)
  if (op.kind === "revolve" && axisAcross(sceneOf(base), op)) { previewProblem = null; return null; } // (an axis across the figure is not drawn: what is there stays and the reason is said, `in_521`)
  const cmd: Command | null = opCommand(sceneOf(base), op, { preview: true });
  if (!cmd) return null;
  const key = JSON.stringify([cmd, op0.made]);
  if (memo && memo.history === s.session.history && memo.outcome === s.session.outcome && memo.key === key) return memo.value;
  let value = previewCommand(base, cmd);
  // a size that breaks a step is not shown as the broken body (it collapses into a weird shape): what is there stays, and why it cannot be made is said (`in_229`)
  const bad = value && !value.outcome.kernel?.stale ? Object.entries(value.outcome.errors).find(([id]) => !(id in base.outcome.errors)) : undefined;
  // a fillet or chamfer the kernel cannot make on the edge alone shows what it would be made with the edges that meet it at a corner, as the commit does (`in_379`)
  if (bad && s.op?.kind === "edge") {
    const corner = withCorner(cmd);
    const again = corner ? previewCommand(base, corner) : null;
    if (again && !again.outcome.kernel?.stale && !Object.entries(again.outcome.errors).some(([id]) => !(id in base.outcome.errors))) { value = again; }
  }
  const stillBad = value && !value.outcome.kernel?.stale ? Object.entries(value.outcome.errors).find(([id]) => !(id in base.outcome.errors)) : undefined;
  const refused = !stillBad && value ? previewRefusal(base, cmd, value) : null; // (a move the solver would undo: what is there stays, and the constraint is named, `in_366`)
  if (stillBad) { previewProblem = stillBad[1]; value = null; } else if (refused) { previewProblem = refused; value = null; } else previewProblem = null;
  memo = { history: s.session.history, outcome: s.session.outcome, key, value };
  return value;
}

function helperAt(s: AppState, g: { handles: Handle[] } | null): { at: Vec3; text: string } | null {
  if (!s.repeat || s.op || !g) return null;
  const h = helperOf(s.repeat);
  const arrow = h ? g.handles.find((x) => x.id === h.handle) : undefined;
  return h && arrow ? { at: arrow.points.at(-1)!, text: h.text } : null;
}

const isSectionPlane = (sc: Scene, r: Ref | undefined | null): boolean => { const p = r ? sc.parts[r] : undefined; return p?.kind === "plane" && !!p.section; };
export function frameOf(s: AppState, size: { w: number; h: number }, now = 0): Frame {
  const f = frameBase(s, size, now);
  return { ...f, notices: noticesOf(f) };
}
function frameBase(s: AppState, size: { w: number; h: number }, now = 0): Omit<Frame, "notices"> {
  const gpu = gpuMotion(s);
  if (gpu?.shownFree && s.op?.free) s = { ...s, op: { ...s.op, free: gpu.shownFree } };
  const shown = gpu ? gpu.shown : operationResult(s);
  const sc = shown?.scene ?? sceneOf(s.session);
  const sel = selectionOf(s.session);
  const selBodies = new Set<Ref>(sel.flatMap((r) => { const p = sc.parts[r]; return p?.kind === "body" ? [r] : p && "of" in p && p.of ? [p.of as Ref] : []; })); // (the bodies that are selected, or have a face selected)
  const outcome = shown?.outcome ?? s.session.outcome;
  // a whole-body drag is drawn by a matrix; when it is let go the picture stays moved until the kernel's answer for the new step comes (it would jump back otherwise)
  const settling = !gpu && !!outcome.kernel?.stale && !!lastDrag && sc.steps.length === lastDrag.steps + 1;
  if (!gpu && !settling && !outcome.kernel?.stale) lastDrag = null;
  const bodyMatrix = gpu ? gpu.matrix : settling ? lastDrag!.matrix : null;
  const bodySplit = bodyMatrix ? (gpu ? gpu.split ?? null : lastDrag?.split ?? null) : null;
  const index = partIndex(sc);
  const hasBody = index.bodies.length > 0;
  // the handles follow what they drag, live (a body being moved takes its arrows with it)
  const raw = gizmoOf(s);
  const live = s.op?.kind === "pushpull" || s.op?.kind === "extrude"; // (their arrows follow inside `gizmoOf`)
  const followedGizmo = raw && !live ? followed(raw, s.drag && "handle" in s.drag ? s.drag.handle : null, s.op?.value ?? null) : raw;
  // the arrows of a body's move that stood up by themselves come back at the kernel's box, which is still the old one for a moment after the drag: they stay where the body was drawn (`in_230`)
  const m = settling && !s.op && lastDrag?.matrix && activeOp(s)?.kind === "move" ? lastDrag.matrix : null;
  const gizmo = followedGizmo && m ? { centre: add(followedGizmo.centre, [m[12]!, m[13]!, m[14]!]), handles: followedGizmo.handles.map((h) => ({ ...h, points: h.points.map((q) => add(q, [m[12]!, m[13]!, m[14]!])) })) } : followedGizmo;
  // the arrow of a push / pull, an extrude or a fillet / chamfer that showed up by itself has its bubble too, ready for a typed size
  const auto = s.op || s.tool?.kind === "gear" ? null : activeOp(s); // (a gear's number box is not pushed aside by the size bubble of the face that is selected, `in_864`)
  const shownOp = s.op ?? (auto && !(s.cam.straight && auto.kind !== "edge") && (auto.kind === "pushpull" || auto.kind === "extrude" || auto.kind === "edge") ? auto : null);
  // the arrows of a move have a number bubble on each, there as long as the arrows are (`in_215`)
  const mo = !s.tool && !s.repeat ? (s.op ?? auto) : null;
  const movingOp = mo && mo.kind === "move" && (mo.target === "body" || mo.target === "plane") ? mo : null;
  // the number of an operation's arrow shows only when that arrow is selected (clicked or taken), or a number is being typed for it: the arrows alone stay clean (`in_238`)
  const armed = !!s.handleSel && !!gizmo && gizmo.handles.some((h) => h.id === s.handleSel);
  const typing = !!shownOp && (shownOp.typed !== "" || shownOp.rot.some((t) => t !== ""));
  const numberShown = armed || typing || !!(s.drag && "handle" in s.drag); // (a body dragged free shows no position bubbles while it is dragged: it is the picture that is moved, `in_489`)
  // a body dragged against its mates: they are red while it is held back, as a refused change shows what it would have broken (`in_338`)
  const noteOp = s.op ?? (s.repeat ? liveRepeat(sceneOf(s.session), s.repeat) : null);
  const hardWhy = noteOp && !gpu && sceneOf(s.session).hard?.length ? hardNote(sceneOf(s.session), noteOp) : null; // (what a repeat, a mirror or a pull that is open runs into, `in_475`)
  const flash: FlashFrame | null = hardWhy?.hit.length ? { t: 0, victims: [], culprits: [], parts: hardWhy.hit } : gpu?.hardHit?.length ? { t: 0, victims: [], culprits: [], parts: gpu.hardHit } : gpu?.blocked?.length ? { t: 0, victims: gpu.blocked, culprits: [], parts: flashParts(sc, gpu.blocked) } : flashOf(s, sc, now);
  const busy = !!(s.tool || s.op); // while a tool or operation is running its number chip is shown, not the constraints
  const gp = gridPlaneOf(s);
  const annotationsPresent = !busy; // (the bubbles are the only user of `avoid`: none are shown while a tool or operation runs)
  return {
    scene: sc,
    mesh: outcome.kernel?.mesh ?? null,
    bodyMatrix,
    hiddenEdges: !!s.tool && hasBody,
    behindPlane: hasBody ? behindPlaneOf(s) : null,
    bodySplit,
    hiddenBodies: hiddenItemsOf(sc, outcome),
    thin: s.panel === "measure" && !outcome.kernel?.stale ? thinPlacesOf(sc, sel) : s.motion?.contact?.jam && s.motion.contact.clash?.length ? s.motion.contact.clash : null, // (the places where bodies are in each other when a motion has stopped: in the red of the thin places)
    bodyEyes: index.bodies.flatMap((p) => { if (!p.bbox) return []; const [lo, hi] = [p.bbox.min, p.bbox.max]; const corners: Vec3[] = []; for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) corners.push([x, y, z]); const drives = animated(sc).get(p.ref); const m = s.motion; return [{ ref: p.ref, hidden: !!sc.hiddenBodies?.includes(p.ref), corners, ...(drives && selBodies.has(p.ref) ? { selected: true as const } : {}), ...(drives ? { play: m && m.body === drives && m.playing ? "pause" as const : "play" as const } : {}) }]; }),
    eyesQuiet: true, // (a body that is shown has no eye of its own now: Hide body is in the View menu, `in_697`; a hidden body keeps its eye)
    gearChip: s.tool || s.op || s.drag || s.repeat ? null : gearChipOf(sc, sel), // (the gear's icon is there when the gear is selected, not when the pointer is over it, `in_962`)
    followers: gpu?.followers ?? [],
    selectionMatrix: s.motion ? selectionMatrixOf(s.motion, selBodies) : null,
    selectionMoves: !!bodyMatrix && sel.length > 0 && sel.every((r) => { const p = sc.parts[r]; return !!p && (p.kind === "body" || p.origin === "body"); }),
    highlight: { bodyTris: bodyTrisOf(sc, s.session.outcome, [s.session.hover, ...sel]), hover: s.motion ? undefined : s.session.hover, /* (a visible sheet lights the blue hover disc as every surface does, `in_470`) */ hoverPoint: s.motion ? null : s.hoverPoint, selection: s.moverSphere ? [] : [...sel.filter((r) => !isSectionPlane(sc, r)), ...(s.op?.twoDist ? [chosenFace(sceneOf(s.op.made ? undone(s.session) : s.session), s.op)?.ref].filter((r): r is Ref => !!r) : [])], /* (the face the first distance is along is lit like a selected face, `dec_chamfer_two_distances`) */ /* (the object is not what is selected while the mover is oriented: it is only drawn as wireframe, `in_421`) */ // (a cross section plane is drawn by its own faint quad, not lit like a face, `in_396`)
    amber: [...new Set([...(s.op?.kind === "loft" ? loftStarts(sceneOf(s.session), s.op) : []), ...(s.op?.kind === "sweep" ? sweepStart(sceneOf(s.session), s.op) : []), ...focusParts(sc, sel, s.focus), ...variableStart(sceneOf(s.op?.made ? undone(s.session) : s.session), s.op), ...[...(s.tool?.hints ?? []), ...(s.dragHint?.hints ?? []), ...(s.tool && s.tool.points.length === 2 ? (s.tool.ends ?? []).flat() : [])].flatMap((h) => h.ref ? [h.ref] : [])])], red: { refs: flash?.parts ?? [], alpha: flash ? 1 - flash.t : 0 }, green: { refs: flash?.greenParts ?? [], alpha: flash ? 1 - flash.t : 0 }, temp: s.repeat && !s.op ? temporaryParts(sceneOf(s.session), sc) : [], spread: s.spread },
    preview: withGhost(previewFor(sc, s.tool), s), // (the picture itself moves now: the thin rings that stood in for it are not needed)
    entry: inUnits(movingOp || (shownOp && !s.tool && hasGizmo(shownOp.kind) && !numberShown) ? null : entryWhere(entryOf(sc, s.tool, shownOp), s, gizmo, shownOp)),
    entries: (s.moverSphere && moverOp(s) && !s.tool && gizmo ? moverPlaceEntries(gizmo, moverOp(s)!.frame, orbShow(s, now)) : sectionNow(s) && !s.op && !s.repeat && !s.tool && gizmo ? sectionEntries({ at: sectionNow(s)!.centre, n: sectionNow(s)!.n }, gizmo, s.drag && "handle" in s.drag ? s.drag.handle.id : s.handleSel) : shownOp?.kind === "revolve" && !s.tool ? revolveEntries(shownOp, gizmo, s.drag && "handle" in s.drag ? s.drag.handle.id : s.handleSel) : shownOp?.kind === "loft" && !s.tool ? loftEntries(sceneOf(s.session), shownOp) : shownOp?.kind === "mirror" ? mirrorEntries(shownOp, gizmo)  : shownOp?.kind === "scale" && shownOp.axes ? scaleEntries(shownOp, gizmo) : s.repeat && !s.op ? repeatEntries(liveRepeat(sceneOf(s.session), s.repeat), gizmo, s.cam, s.repeat.chosen ?? null) : movingOp && numberShown ? moveEntries(s.handleSel?.startsWith("move:") ? { ...movingOp, axis: "xyz".indexOf(s.handleSel[5]!) as 0 | 1 | 2 } : movingOp, gizmo, moveOffset(sceneOf(s.session), movingOp)) : []).map((e) => inUnits(e)),
    helper: helperAt(s, gizmo),
    busy: !!s.session.outcome.kernel?.stale || !!s.building,
    ...(s.building ? { busyText: buildingText(s.building) } : s.session.outcome.kernel?.partial ? { busyText: `Building ${s.session.outcome.kernel.partial.done} of ${s.session.outcome.kernel.partial.total} parts…` } : {}),
    standIns: standIns(sc, outcome.kernel),
    lookHint: lookOf(sc, sel, s.cam, s.world).lookHint,
    facing: facingOf(s.cam),
    touchHelper: touchHelperOf(s, gizmo),
    undoRedo: { undo: s.session.history.cursor > 0, redo: s.session.history.cursor < s.session.history.commands.length },
    box: s.box ? { ...s.box, touching: crossing(s.box) } : null,
    avoid: busy || !annotationsPresent ? { segs: [], pts: [] } : avoidOf(sc),
    hint: s.tool?.hints?.length && s.tool.cursor ? { kinds: s.tool.hints.map((h) => h.kind), at: s.tool.cursor } : s.dragHint ? { kinds: s.dragHint.hints.map((h) => h.kind), at: s.dragHint.at } : null,
    panel: panelOf(s.panel, sceneOf(s.session), sel, s.session.outcome.errors, s.showSketch, s.session.history, s.stepEdit),
    annotations: busy ? withFlashed([], sc, flash?.t === 0 && gpu?.blocked?.length ? flash : null) : [...withFlashed(annotationsFor(sc, sel, s.focus, s.showAllConstraints || !!s.showSketch), sc, flash), ...(s.tape ? tapeAnnotations(sc, sel) : [])],
    flash,
    refusal: flash && (s.flash?.victims.length || s.flash?.soften?.length) ? { text: s.session.message ?? "", beside: s.flash.victims[0] ?? s.flash.soften![0]!, button: `${(s.flash.victims.length + (s.flash.soften?.length ?? 0)) === 1 ? "Delete constraint" : "Delete constraints"}${s.flash.retry ? " to proceed" : ""}` } : null, // (`inv_constraint_uniformity`: a constraint that is violated always flashes and always offers to be deleted: with the change that was refused to go on with, or alone when the change stays)
    grid: gp && settings.grid.show ? gridFor(s.cam, gp, size.w, size.h) : null, // on: the world plane that is on always has its grid (`in_190`)
    suggest: busy ? null : suggestionsFor(sc, sel, nearTolMm(s.cam), seenIn(s.cam, sc, size)),
    cut: s.cut ? { parts: cutParts(sceneOf(s.session), s.cut), join: s.cut.join } : null, // (the bodies as they are, not as the preview of the cut shows them)
    confirm: s.awaiting && !s.op && !s.tool && !s.repeat ? { kind: s.awaiting.icon, label: s.awaiting.label, text: s.awaiting.why.charAt(0).toUpperCase() + s.awaiting.why.slice(1) } : s.picking && !s.op && !s.tool && !s.repeat ? { kind: s.picking.kind, label: OPEN_LABELS[s.picking.kind] ?? s.picking.kind, text: s.picking.why ? s.picking.why.charAt(0).toUpperCase() + s.picking.why.slice(1) : "Click what it needs" } : s.moverSphere && moverOp(s) && !s.tool ? { kind: "orient", label: "Orient the mover", text: "Orient the mover" } : s.cut ? { kind: "subtract", label: "Cut" } : s.tool ? null : s.repeat && !s.op ? { kind: s.repeat.op.kind, label: OPEN_LABELS[s.repeat.op.kind] ?? s.repeat.op.kind } : s.op && s.op.kind !== "dimension" ? { kind: s.op.kind, label: OPEN_LABELS[s.op.kind] ?? s.op.kind } : !s.op && !s.picking && !s.repeat && !s.cut && similarOf(s) ? { kind: "similar", label: "Select similar", text: `${similarOf(s)!.count} similar ${similarOf(s)!.noun}${similarOf(s)!.count === 1 ? "" : "s"}` } : null,
    tool: s.tool ? { kind: s.tool.kind, label: ({ rect: "Rectangle", circle: "Circle", line: "Line", arc: "Curve", spline: "Spline", cam: "Cam", trim: "Trim", gear: "Gear", model: "Model" } as const)[s.tool.kind], made: s.tool.made ?? 0, drawing: s.tool.points.length > 0, done: (s.tool.made ?? 0) > 0 && s.tool.points.length === 0 } : null,
    wireframe: s.wireframe || (s.moverSphere && !!moverOp(s)) || s.op?.kind === "revolve" || s.op?.kind === "mirror" || s.op?.kind === "sweep" || s.op?.kind === "loft" || ((s.picking?.kind === "sweep" || s.picking?.kind === "loft") && !!pickingOp(s)) /* (what a sweep would make is drawn as wireframe, not as a made body, `in_529`, `in_530`) */ || /* the object goes wireframe while the mover itself is oriented, `in_421` */ (s.op?.kind === "hollow" && !!s.drag && "handle" in s.drag), // (the body fades to wireframe while the wall is pulled, so the wall can be seen, `in_394`)
    sections: cutsNow(s).map((c) => ({ at: c.centre, n: c.n, corners: sectionQuad(c.centre, c.n, c.extent) })),
    sectionPlanes: [...index.sections.filter((p) => p.extent !== undefined).map((p) => { const pl = p; return { ref: pl.ref, selected: sectionNow(s)?.ref === pl.ref, cutting: !!pl.cut, mode: modeOf(pl), hidden: !!pl.hidden, move: sheetMoveOf(s, pl.ref), corners: s.sectionLive && s.sectionLive.ref === pl.ref ? sectionQuad(s.sectionLive.centre, s.sectionLive.n, pl.extent!) : [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, k]) => add(add(pl.at, scale(pl.u, a! * pl.extent!)), scale(pl.v, k! * pl.extent!)) as Vec3) }; }), ...mirrorGuide(s)],
    fadeBody: fadeBodyOf(s, outcome.kernel?.mesh ?? null),
    worldHidden: s.worldHidden,
    hardMarks: sc.hard?.length ? Object.values(sc.parts).flatMap((p) => {
      // hidden, like a constraint that holds: a mark shows (red) only while its body is violated, that is while it is bumping into another hard body, or the history has put it into one (`in_489`, `in_478`)
      if (p.kind !== "body" || !p.id || !p.bbox || !sc.hard!.includes(p.id)) return [];
      const bump = bumpNote(sc, gpu?.bumping, p.ref);
      const over = overlapNote(sc, p.ref);
      if (!bump && !over.overlaps) return [];
      const at: Vec3 = [(p.bbox.min[0] + p.bbox.max[0]) / 2, (p.bbox.min[1] + p.bbox.max[1]) / 2, p.bbox.max[2]];
      const sh = bump?.shift ?? [0, 0, 0];
      return [{ ref: p.ref, at: [at[0] + sh[0], at[1] + sh[1], at[2] + sh[2]] as Vec3, ...over, ...(bump ? { bumps: bump.names } : {}) }];
    }) : [],
    panes: s.cam.straight || s.worldHidden ? [] : WORLD_NAMES.map((name) => ({ name, corners: paneCorners(name), active: name === s.world, hover: name === s.paneHover })),
    gizmo: gizmo ? { handles: gizmo.handles, pulse: s.moverSphere ? "pivot" : s.op?.kind === "revolve" ? "rev:orb" : undefined, /* (only the orient mode pulses, and the revolve's orb that is ready to be oriented; the mirror's and the copies' orbs do not, `in_439`) */ hover: s.gizmoHover, active: s.drag && "handle" in s.drag ? s.drag.handle.id : null, chosen: armed ? s.handleSel! : s.op?.kind === "revolve" && !s.moverSphere ? `rev:turn:${"xyz"[s.op.axis]}` : s.op?.kind === "rotate" ? `rot:${"xyz"[s.op.axis]}` : s.op?.kind === "move" && !s.op.free ? `move:${"xyz"[s.op.axis]}` : null, locked: s.repeat && !s.op && s.repeat.op.kind === "linear" && s.repeat.chosen ? [`lin:${s.repeat.chosen.slice(4, 5)}`, `cnt:${s.repeat.chosen.slice(4, 5)}`] : s.lockAxes.map((k) => `move:${"xyz"[k]}`) } : null,
    similar: similarOf(s),
    toolpath: s.preview ? previewView(s.preview.toolpath, s.preview.at) : null,
    motionBar: s.motion ? { amount: shownAmount(s.motion), lo: s.motion.lo, hi: s.motion.hi, kind: s.motion.kind, playing: s.motion.playing, reversed: s.motion.speed < 0, springs: springsOf(sc, s.motion), links: s.motion.mate ? linksOf(sc, s.motion.mate, s.motion.kind).map((l) => ({ id: l.id, ratio: l.k, kind: l.kind })) : [], label: `${s.motion.kind === "turn" ? "turned" : "slid"} ${steadyNumber(shownAmount(s.motion))}${s.motion.kind === "turn" ? "°" : " mm"}`, note: motionNote(s.motion), fix: { offer: !s.motion.fix && fixOffered(sceneOf(s.session), s.session.outcome, s.motion), step: s.motion.fix ? (() => { const f = s.motion.fix!.plan.fixes[s.motion.fix!.i]; return f ? { text: f.text, n: s.motion.fix!.i + 1, of: s.motion.fix!.plan.fixes.length, how: f.how } : null; })() : null } } : null,
    previewBar: s.preview ? { at: s.preview.at, label: `${Math.round(s.preview.at * 100)}%${s.preview.toolpath.seconds ? ` of ~${s.preview.toolpath.seconds < 90 ? Math.round(s.preview.toolpath.seconds) + " s" : Math.round(s.preview.toolpath.seconds / 6) / 10 + " min"}` : ""}` } : null,
    adding: s.adding ? "on" : null,
    resetView: !s.anim && !s.tool && nothingInView(s, size.w, size.h, projector(s.cam, size.w, size.h).project as (p: Vec3) => [number, number]),
    modeSwitch: gizmo ? (s.repeat ? repeatSwitchOf(s.repeat, gizmo.centre, gizmo.handles.flatMap((h) => h.points)) : modeSwitchOf(s.op ?? activeOp(s), gizmo.centre, gizmo.handles.flatMap((h) => h.points))) : null,
    options: optionsOf(s),
    faceKinds: faceKinds(s),
    sweepKinds: s.op?.kind === "sweep" ? sweepChips(s.op) : null,
    loftKinds: s.op?.kind === "loft" ? loftChips(sceneOf(s.session), s.op) : null,
    sizeKinds: sizeKinds(s),
    cursor: s.tool || s.box ? "crosshair" : s.gizmoHover ? "grab" : "", // (held for a drag select: the cursor changes, `in_235`)
    message: (s.op?.kind === "revolve" ? axisAcross(sceneOf(s.op.made ? undone(s.session) : s.session), s.op) : null) ?? s.session.message ?? hardWhy?.why ?? hardOverlapMessage(sc) ?? (s.op && previewProblem ? `that size cannot be made: ${previewProblem}` : null) ?? Object.values(outcome.errors)[0] ?? (s.op ? Object.values(outcome.notes ?? {}).at(-1) : undefined) ?? "",
  };
}

/** What a repeat that is open would make (the lines, circles and corners of the copies): in the picture of the result, not yet in the drawing. */
function temporaryParts(now: Scene, shown: Scene): Ref[] {
  return Object.values(shown.parts).filter((p) => p.origin === "drawn" && !now.parts[p.ref] && !(p.kind === "corner" && p.derived) && !(p.kind === "line" && p.derived) && (p.kind === "line" || p.kind === "circle" || p.kind === "corner")).map((p) => p.ref);
}
const OPEN_LABELS: Record<string, string> = { linear: "Linear repeat", circular: "Circular repeat", copy: "Copy", move: "Move", rotate: "Rotate", scale: "Scale", pushpull: "Push / pull", extrude: "Extrude", loft: "Loft", mirror: "Mirror copy", edge: "Fillet / chamfer", offset: "Offset" };
const withFlashed = (list: Annotation[], sc: Scene, flash: FlashFrame | null): Annotation[] => {
  if (!flash) return list;
  const have = new Set(list.map((a) => a.id));
  return [...list, ...annotationsOf(sc, [...new Set([...flash.victims, ...flash.culprits, ...(flash.green ?? [])])]).filter((a) => !have.has(a.id))];
};
/** The small plane drawn for the mirror's chosen arrow (`in_437`): a square across that axis where the plane stands, a little bigger than what is mirrored. */
function mirrorGuide(s: AppState): Frame["sectionPlanes"] {
  const op = s.op;
  const pl = op && op.kind === "mirror" ? mirrorPlane(op) : null;
  if (!op || !pl || !op.mirrorBox) return [];
  const ext = Math.max(...[0, 1, 2].map((i) => op.mirrorBox!.hi[i]! - op.mirrorBox!.lo[i]!), 1) * 1.3;
  return [{ ref: "mirror" as Ref, guide: true, mode: 2 as const, hidden: false, move: 0 as const, selected: true, cutting: false, corners: sectionQuad(pl.p, pl.n, ext) }];
}
/** What the orient mode's bubbles show (`in_439`): all three positions and turns while the whole orb is moved and a moment after (fading), else only the value of the arrow or ring that was clicked. */
function orbShow(s: AppState, now: number | undefined): { all: false; handle: string | null } | { all: true; opacity: number } {
  if (s.drag && "handle" in s.drag) { if (s.drag.handle.id === "pivot") return { all: true, opacity: 1 }; return { all: false, handle: s.drag.handle.id }; }
  const t = s.orbMovedAt !== null && now !== undefined ? (now - s.orbMovedAt) / 1800 : 2;
  if (t >= 0 && t < 1) return { all: true, opacity: t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6 };
  return { all: false, handle: s.handleSel };
}
/** What flashes red with a constraint's bubble when it is violated (`in_436`): the parts it ties; for a mate the two faces it is between (not the two whole bodies, which would turn every surface red). */
/** Which hard bodies this one is bumping now (when it is being dragged: the ones it is against; when it is the one being bumped: the ones dragged at it), and where its mark goes (`in_489`). */
function bumpNote(sc: Scene, b: { movers: Ref[]; hit: Ref[]; shift: Vec3 } | undefined, ref: Ref): { names: string; shift?: Vec3 } | null {
  if (!b) return null;
  if (b.movers.includes(ref)) return { names: hardNames(sc, b.hit), shift: b.shift };
  if (b.hit.includes(ref)) return { names: hardNames(sc, b.movers) };
  return null;
}
/** Which hard bodies a hard body is in, for its mark (`in_478`). */
function overlapNote(sc: Scene, ref: Ref): { overlaps?: string } {
  const mine = hardOverlaps(sc).filter((o) => o.a === ref || o.b === ref).map((o) => (o.a === ref ? o.b : o.a));
  return mine.length ? { overlaps: hardNames(sc, mine) } : {};
}
/** What is said while hard bodies overlap in the model as the history makes it (`in_478`); nothing when they do not. */
function hardOverlapMessage(sc: Scene): string | undefined {
  const o = hardOverlaps(sc);
  return o.length ? `hard bodies overlap: ${o.map((q) => hardNames(sc, [q.a, q.b])).join("; ")} (the History list marks the step; moves that take them apart are allowed)` : undefined;
}
function flashParts(sc: Scene, victims: readonly string[]): Ref[] {
  const mates = victims.some((id) => sc.relations.find((r) => r.id === id)?.kind === "mate") ? mateStatus(sc) : [];
  return sc.relations.filter((r) => victims.includes(r.id)).flatMap((r) => {
    if (r.kind !== "mate") return r.parts;
    const m = mates.find((x) => x.id === r.id);
    const faces = [m?.mover?.ref, m?.other?.ref].filter((q): q is Ref => !!q);
    return faces.length ? faces : r.parts;
  });
}
function flashOf(s: AppState, sc: Scene, now: number): FlashFrame | null {
  if (!s.flash) return null;
  const t = (now - s.flash.at) / settings.flash.ms;
  if (t < 0 || t >= 1) return null;
  const parts = [...flashParts(sc, s.flash.victims), ...((s.flash.parts ?? []) as Ref[])];
  return { t, victims: s.flash.victims, culprits: s.flash.culprits, parts, ...(s.flash.green?.length ? { green: s.flash.green, greenParts: flashParts(sc, s.flash.green) } : {}) };
}

/** Where the value bubble sits: at the tip of the arrow for a push / pull or an extrude and at the edge for a fillet or chamfer (so it is by what it sets), else at the middle of the handles, or by the figure being drawn. */
function entryWhere(e: Entry | null, s: AppState, g: Gizmo | null, op: Op | null): Entry | null {
  if (!e) return null;
  let at: Vec3 | null = null;
  let from: Vec3 | null = null;
  if (op && g) {
    const k = op.kind;
    const arrow = k === "extrude" || k === "pushpull" || k === "edge" ? g.handles[0] : undefined;
    at = arrow ? arrow.points.at(-1) ?? g.centre : g.centre;
    from = arrow ? arrow.points[0] ?? null : null;
  } else if (op && (op.kind === "linear" || op.kind === "circular")) at = patternCentre(s.session.history.scene, op);
  else if (s.tool) at = s.tool.cursor ?? s.tool.points.at(-1) ?? null;
  return { ...e, at, from };
}

/** The axis most facing the camera: strength is 0 at the diagonal (all three equally near, about 55 degrees) and grows to 1 as the view comes along the axis. */
export function facingOf(cam: Camera): Frame["facing"] {
  const o = offsetOf(cam);
  const k = ([0, 1, 2] as const).reduce((b, i) => (Math.abs(o[i]) > Math.abs(o[b]) ? i : b), 0 as 0 | 1 | 2);
  const strength = Math.max(0, Math.min(1, (Math.abs(o[k]) - 0.6) / 0.4));
  return { axis: (["X", "Y", "Z"] as const)[k], sign: o[k] >= 0 ? 1 : -1, strength };
}

/** A single selected plane or face: if it lies across a world axis, that axis's button is lit, + or − by the end the camera is at (the side that shows the face). */
function lookOf(sc: Scene, sel: readonly Ref[], cam: Camera, world: AppState["world"]): { lookHint: Frame["lookHint"] } {
  const get = lookup(sc);
  const pl = (sel.length === 1 ? planeOf(get, sel[0]!) : null) ?? (sel.length === 0 ? (get(worldRef(world)) as Plane | undefined) ?? null : null); // (nothing selected: the world plane that is on is the one worked on, `in_301`)
  if (!pl) return { lookHint: null };
  const n = normalOfPlane(pl);
  const k = ([0, 1, 2] as const).find((i) => Math.abs(Math.abs(n[i]) - 1) < 1e-6);
  const sign = dot(offsetOf(cam), n) >= 0 ? 1 : -1;
  return { lookHint: k === undefined ? null : { axis: (["X", "Y", "Z"] as const)[k], sign: n[k]! * sign > 0 ? 1 : -1 } };
}

/** The drawn lines, arcs and circles as short straight pieces, and the drawn corners: the places a bubble should not sit on. */
const avoided = new WeakMap<Scene, Frame["avoid"]>();
function avoidOf(sc: Scene): Frame["avoid"] {
  // the same scene gives the same places, and a picture is made of it many times (every move of the pointer): worked out once for a scene (a gear's outline is 400 arcs, 64 points each)
  const kept = avoided.get(sc);
  if (kept) return kept;
  const out = avoidFor(sc);
  avoided.set(sc, out);
  return out;
}
function avoidFor(sc: Scene): Frame["avoid"] {
  const get = lookup(sc);
  const segs: [Vec3, Vec3][] = [];
  const pts: Vec3[] = [];
  for (const p of Object.values(sc.parts)) {
    if (p.origin !== "drawn") continue;
    if (p.kind === "corner") { pts.push(p.at); continue; }
    if (p.kind !== "line" && p.kind !== "circle") continue;
    const o = outlineOf(get, p);
    if (o.shape === "segment") segs.push([o.a, o.b]);
    else if (o.shape === "polyline") for (let i = 0; i + 1 < o.pts.length; i++) segs.push([o.pts[i]!, o.pts[i + 1]!]);
    else if (o.shape === "circle") {
      const n = o.normal;
      const u = normalize(cross(n, Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]));
      const v = cross(n, u);
      const ring = Array.from({ length: 25 }, (_, k): Vec3 => { const t = (k / 24) * Math.PI * 2; return [0, 1, 2].map((i) => o.center[i]! + (u[i]! * Math.cos(t) + v[i]! * Math.sin(t)) * o.radius) as unknown as Vec3; });
      for (let i = 0; i < 24; i++) segs.push([ring[i]!, ring[i + 1]!]);
    }
  }
  return { segs, pts };
}

/**
 * While the arrow of a round face (a post or a hole) is being dragged the kernel takes a moment to build each size, so the picture of the body lags the pointer in jumps. This shows the size
 * the pointer is at right now, at once, as thin rings at the two ends of the round face and a few lines between them; the body catches up (`in_165`).
 */
function withGhost(base: Preview | null, s: AppState): Preview | null {
  const op = s.op;
  const c = op?.curved;
  if (!op || !c || !s.drag || !("handle" in s.drag) || op.value === null || op.value === undefined) return base;
  const r = Math.max(0.01, c.radius + (c.convex ? op.value : -op.value));
  const [u, v] = [0, 1, 2].filter((i) => i !== c.axis) as [number, number, number];
  const at = (t: number, h: number): Vec3 => { const p = [0, 0, 0]; p[u] = c.center[u]! + Math.cos(t) * r; p[v] = c.center[v]! + Math.sin(t) * r; p[c.axis] = h; return p as unknown as Vec3; };
  const segments: [Vec3, Vec3][] = [];
  const N = 64;
  for (let k = 0; k < N; k++) for (const h of [c.lo, c.hi]) segments.push([at((k / N) * Math.PI * 2, h), at(((k + 1) / N) * Math.PI * 2, h)]);
  for (let k = 0; k < 12; k++) segments.push([at((k / 12) * Math.PI * 2, c.lo), at((k / 12) * Math.PI * 2, c.hi)]);
  return { segments: [...(base?.segments ?? []), ...segments], circle: base?.circle ?? null, cursor: base?.cursor ?? null };
}

/** What is said about a motion above its bar: a jam (and the pin in a hole that would let a body turn, if there is one), a heavy push, or the pin in a hole when a body with no joint has been moved a good way by the play. */
function motionNote(m: NonNullable<AppState["motion"]>): string | null {
  const c = m.contact;
  return c?.jam ? `stopped: ${c.jam}` : null; // (only a stop is said here; a heavy push or a pin in a hole is not: the Fix constraints offer is the sign, and its walk has the detail, `in_1131`)
}

/** The plane a sketch tool is on (the tool's, else the one selected) with its normal turned toward the camera, from wherever the camera is: what is past it is not what is being worked on. */
function behindPlaneOf(s: AppState): Frame["behindPlane"] {
  if (!s.tool || s.tool.kind === "trim" || s.tool.kind === "gear" || s.tool.kind === "cam" || s.tool.kind === "model" || s.sectionLive || s.cut) return null;
  const sc = sceneOf(s.session);
  const ref = s.tool.plane ?? selectedSurface(sc, selectionOf(s.session));
  const pl = ref ? sc.parts[ref] : undefined;
  if (pl?.kind !== "plane") return null;
  const n = normalOfPlane(pl);
  const eye = add(s.cam.target, scale(offsetOf(s.cam), eyeDistance(s.cam)));
  const side = dot(sub(eye, pl.at), n) >= 0 ? 1 : -1;
  return { n: [n[0] * side, n[1] * side, n[2] * side], at: [pl.at[0], pl.at[1], pl.at[2]] };
}

/** Does any of the body lie between the camera and the plane being sketched on? (Only when looking straight at that plane: in 3D it is all as it was.) */
function fadeBodyOf(s: AppState, mesh: { vertices: Float32Array } | null): boolean {
  if (s.cut) return true; // (the bodies being cut are seen through, so that the parts they make can be told apart, `in_296`)
  const pl = sketchPlaneOf(s);
  if (!pl || !mesh) return false;
  const n = normalOfPlane(pl);
  const side = sideOf(s.cam, n);
  if (!side) return false;
  for (let i = 0; i + 2 < mesh.vertices.length; i += 3) if (((mesh.vertices[i]! - pl.at[0]) * n[0] + (mesh.vertices[i + 1]! - pl.at[1]) * n[1] + (mesh.vertices[i + 2]! - pl.at[2]) * n[2]) * side > 1e-3) return true;
  return false;
}

/** The switch of a repeat that is open: to the other kind of repeat (not for one reopened to change, `in_382`). */
function repeatSwitchOf(r: NonNullable<AppState["repeat"]>, at: Vec3, pts: Vec3[]): Frame["modeSwitch"] {
  if (r.op.editStep || r.op.editPattern) return null;
  pts = [at]; // (it stays by the middle of the handles, not out at the end of an arrow that is pulled, `in_386`)
  return r.op.kind === "circular" ? { at, pts, to: "linear", label: "Repeat in a line" } : { at, pts, to: "circular", label: "Repeat round a point" };
}

/** Which way the switch by the handles of a move or a turn goes: to turning from moving, to moving from turning. */
function modeSwitchOf(op: AppState["op"], at: Vec3, pts: Vec3[]): Frame["modeSwitch"] {
  if (op?.kind === "hollow" && op.hollowMode && op.hollowMode !== "closed") return { at, pts, to: "invert", label: op.hollowMode === "open" ? "The selected faces are open: tap to make them the walls" : "The selected faces are the walls: tap to make them the open ones" };
  if (!op || (op.target !== "body" && op.target !== "plane")) return null;
  if (op.kind === "move") return { at, pts, to: "rotate", label: "Rotate" };
  if (op.kind === "rotate") return { at, pts, to: "move", label: "Move" };
  return null;
}


/** The end of the edge where the first size of a fillet that changes along it applies, in amber (`in_406`). */
function variableStart(sc: Scene, op: AppState["op"]): Ref[] {
  if (!op || op.kind !== "edge" || !op.variable || !op.vary) return [];
  return op.parts.flatMap((r) => { const l = sc.parts[r]; return l?.kind === "line" && l.origin === "body" && (l.a !== l.b || op.rimVary) ? [l.a] : []; });
}

/** The triangles of each hidden body (`dec_hidden_bodies`): all of the mesh when it is the only body, else the faces the kernel says are its. Null when none is hidden. */
function hiddenItemsOf(sc: Scene, outcome: CompileOutcome): { tris: [number, number][] }[] | null {
  const hidden = sc.hiddenBodies;
  const k = outcome.kernel;
  if (!hidden?.length || !k?.mesh) return null;
  const out: { tris: [number, number][] }[] = [];
  for (const ref of hidden) {
    const body = sc.parts[ref];
    if (body?.kind !== "body") continue;
    if (!k.bodies || k.bodies.length < 2) { out.push({ tris: [[0, k.mesh.triangles.length]] }); continue; }
    const index = k.bodies.findIndex((b) => b.id === body.id);
    if (index < 0) continue;
    const tris: [number, number][] = [];
    for (const f of k.faces ?? []) {
      if (f.body !== index) continue;
      const ranges = (f.ranges as { start: number; count: number }[] | undefined) ?? [{ start: f.start, count: f.count }];
      for (const r of ranges) tris.push([r.start, r.count]);
    }
    if (tris.length) out.push({ tris });
  }
  return out.length ? out : null;
}

/** The triangles of each body of several among `refs` (a body of one has no need: the whole mesh is its own), as ranges of the mesh's index list, from the faces the kernel says are the body's (`in_867`). */
function bodyTrisOf(sc: Scene, outcome: CompileOutcome, refs: readonly (Ref | undefined)[]): Record<string, [number, number][]> | undefined {
  const k = outcome.kernel;
  if (!k?.bodies || k.bodies.length < 2) return undefined;
  const out: Record<string, [number, number][]> = {};
  for (const r of refs) {
    const b = r ? sc.parts[r] : undefined;
    if (!r || b?.kind !== "body" || !b.id || out[r]) continue;
    const index = k.bodies.findIndex((x) => x.id === b.id);
    if (index < 0) continue;
    const tris: [number, number][] = [];
    for (const f of k.faces ?? []) {
      if (f.body !== index) continue;
      for (const g of (f.ranges as { start: number; count: number }[] | undefined) ?? [{ start: f.start, count: f.count }]) tris.push([g.start, g.count]);
    }
    if (tris.length) out[r] = tris;
  }
  return Object.keys(out).length ? out : undefined;
}
/** The part of the mesh that is one body of several, for a move, turn or scale of that body (null for the whole body): its triangles, from the faces the kernel says are its, and its box (`in_273`). */
function bodySplitOf(sc: Scene, outcome: CompileOutcome, op: Op): Frame["bodySplit"] {
  const body = sc.parts[op.parts[0]!];
  const k = outcome.kernel;
  if (body?.kind !== "body" || body.ref === BODY_OBJECT || !body.id || !body.bbox || !k?.bodies || k.bodies.length < 2) return null;
  const index = k.bodies.findIndex((b) => b.id === body.id);
  if (index < 0) return null;
  const tris: [number, number][] = [];
  for (const f of k.faces ?? []) {
    if (f.body !== index) continue;
    const ranges = (f.ranges as { start: number; count: number }[] | undefined) ?? [{ start: f.start, count: f.count }];
    for (const r of ranges) tris.push([r.start, r.count]);
  }
  return tris.length ? { tris, box: { min: body.bbox.min, max: body.bbox.max } } : null;
}

/** The gear's icon and what a click on it offers (`in_693`), for the first gear in the selection; null when none is selected. */
function gearChipOf(sc: Scene, sel: readonly Ref[]): Frame["gearChip"] {
  const part = sel.find((r) => !!gearOfSelection(sc, r));
  const rec = part ? gearOfSelection(sc, part) : undefined;
  const pl = rec ? sc.parts[rec.plane] : undefined;
  if (!rec || !pl || pl.kind !== "plane") return null;
  const r = rec.spec.worm ? rec.spec.worm.length / 2 : Math.max(5, rec.spec.module * (rec.spec.teeth / 2 + 2));
  const at: Vec3 = [rec.at[0] + pl.v[0] * r, rec.at[1] + pl.v[1] * r, rec.at[2] + pl.v[2] * r];
  const plain = canHelix(rec.spec);
  const worm = !!rec.spec.worm || !!rec.spec.wheel;
  const bevel = !!rec.spec.bevel;
  const belt = !!rec.spec.pulley || !!rec.spec.sprocket;
  if (planetaryOfGear(sc, rec.id)) return { part: part!, at, items: [{ id: "gear:edit", label: "Edit planetary set", icon: "planetary", enabled: true, why: null }] }; // (a gear of a planetary set is edited with the whole set, `dec_planetary_gears`)
  return { part: part!, at, items: [
    { id: "gear:edit", label: "Edit gear", icon: "gear", enabled: true, why: null },
    { id: "gear:helix", label: "Helix", icon: "helical", enabled: plain, why: plain ? null : "a helix goes on a plain gear (not yet a pulley, sprocket, clock gear or worm)" },
    { id: "gear:mesh", label: "Mesh gear", icon: "meshgear", enabled: true, why: null },
    { id: "gear:meshrack", label: "Mesh rack", icon: "meshrack", enabled: !worm && !bevel && !belt, why: worm ? "a rack does not mesh with a worm or its wheel" : bevel ? "a bevel gear meshes with a bevel gear" : belt ? "a belt or a chain goes round pulleys or sprockets: Mesh gear makes the other one" : null },
    { id: "gear:meshring", label: "Mesh ring", icon: "meshring", enabled: !worm && !bevel && !belt, why: worm ? "a ring does not mesh with a worm or its wheel" : bevel ? "a bevel gear meshes with a bevel gear" : belt ? "a belt or a chain goes round pulleys or sprockets: Mesh gear makes the other one" : null },
  ] };
}

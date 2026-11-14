// What to draw for the current state: one plain description the view, the chip, the badges and the controls draw from. All the decisions about what is shown
// (the big axes or the compass, which plane's grid, whether badges give way to a tool or operation) are made here, so the UI only draws.
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
import { offsetOf, sideOf, nearTolMm, projector } from "./camera.ts";
import { dot, cross, normalize, add } from "../math/vec.ts";
import { apply } from "../operation/commands.ts";
import { outlineOf } from "../operation/part.ts";
import { seenIn } from "./picking.ts";
import { mateStatus, faceMiddle } from "../operation/mates.ts";
import type { KernelResult } from "../compiler/kernel/adapter.ts";
import { scene as sceneOf, selection as selectionOf, previewCommand, previewRefusal, undoLast } from "./session.ts";
import type { Session } from "./session.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import { SIMILAR_RULES } from "./similar.ts";
import { opCommand, bodyMotion } from "./operations.ts";
import { matrixOf } from "../operation/frames.ts";
import type { Command } from "../operation/commands.ts";
import type { CompileOutcome } from "../compiler/compile.ts";
import type { AppState } from "./control/state.ts";
import { sketchPlaneOf } from "./control/state.ts";
import { gridPlaneOf } from "./control/viewing.ts";
import { whyNotGroup, whyNotUngroup } from "./control/select.ts";
import { nothingInView } from "./lastseen.ts";
import { gridFor } from "./grid.ts";
import { WORLD_NAMES, paneCorners } from "./panes.ts";
import type { WorldName } from "./panes.ts";
import { settings } from "../shared/settings.ts";
import type { Grid } from "./grid.ts";
import { annotationsFor, annotationsOf, focusParts } from "./annotations.ts";
import { suggestionsFor } from "./suggest.ts";
import type { Suggestions } from "./suggest.ts";
import type { Annotation } from "./annotations.ts";
import { entryOf, previewFor, repeatEntries, moveEntries } from "./entry.ts";
import { helperOf } from "./pattern.ts";
import type { Entry } from "./entry.ts";
import type { Preview } from "./tools.ts";
import { gizmoOf, activeOp } from "./control/handles.ts";
import type { Op } from "./operations.ts";
import { followed, moveOffset, hasGizmo, handleMiddle } from "./gizmo.ts";
import { crossing } from "./boxselect.ts";
import type { Handle } from "./gizmo.ts";

/** A refused change, while it flashes: how far through it is (0 to 1), the constraints it would have broken (red, fading), the ones that tried (they shake), and the parts of the broken ones. */
export interface FlashFrame { t: number; victims: string[]; culprits: string[]; parts: Ref[] }

export interface GizmoFrame { handles: Handle[]; hover: string | null; active: string | null; chosen?: string | null; locked?: string[] }

export interface Frame {
  scene: Scene;
  mesh: KernelResult["mesh"];
  /** the body is drawn moved by this matrix (16 numbers, column by column) while its move, turn or scale is dragged or waits for the kernel (`in_216`) */
  bodyMatrix: number[] | null;
  /** when the matrix moves one body of several: the triangles (ranges of the mesh's index list) and the box of that body, so only it is moved (`in_273`) */
  bodySplit: { tris: [number, number][]; box: { min: Vec3; max: Vec3 } } | null;
  /** what is selected is the body, so its highlight is moved by the same matrix */
  selectionMoves: boolean;
  highlight: { hover: Ref | undefined; hoverPoint: Vec3 | null; selection: readonly Ref[]; amber: readonly Ref[]; /** the parts of constraints a refused change would have broken, and how red they still are */ red: { refs: readonly Ref[]; alpha: number }; /** the copies a repeat that is open would make, drawn pulsing (`in_244`) */ temp: readonly Ref[]; spread: AppState["spread"]; };
  preview: Preview | null;
  entry: Entry | null;
  /** the several value bubbles of a repeat being set up (one on each axis, or one by the rings) */
  entries: Entry[];
  /** a little bubble of help on an arrow (`in_236`) */
  helper: { at: Vec3; text: string } | null;
  /** the kernel is still working the model out (a picture of it may be a moment old): a "working" sign shows if it takes a while */
  busy: boolean;
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
  /** the constraints that could be put on the selected parts, as buttons by them (`in_195`) */
  suggest: Suggestions | null;
  /** a little icon by the move arrows of a body (or a drawn figure) that switches to turning it, and by its rings one that switches back (`in_206`) */
  /** the chip that follows "select similar": its rules and how many were selected; there only while the selection is still what it chose (`in_257`) */
  /** the chip over the view while several things are selected: what can be done with them as a set (`in_300`) */
  /** the mates, marked on the model where the two bodies meet (`in_316`): where, how they stand, what to say, and which bodies they are between */
  mates: { id: string; at: Vec3; state: "ok" | "off" | "lost"; text: string }[];
  /** nothing of the model is in view: the Reset camera button is offered (`in_303`) */
  resetView: boolean;
  /** a change refused for the constraints it would break, while it flashes: the button that deletes them and goes on (`in_335`) */
  refusal: { text: string; button: string; /** the constraint it stands beside */ beside: string } | null;
  selection: { count: number; actions: { id: string; label: string; title: string }[] } | null;
  similar: { rules: { id: string; label: string; title: string; on: boolean }[]; count: number; noun: string } | null;
  modeSwitch: { at: Vec3; /** every point of the handles, so the icon can stand at the upper left of them (`in_215`) */ pts: Vec3[]; to: "move" | "rotate"; label: string } | null;
  /** the sketching tool that is on, for the pill at the top (`in_193`) */
  tool: { kind: "rect" | "circle" | "line" | "arc" | "trim"; label: string; /** figures made while it has been on (the chip flashes at each) */ made: number; /** a figure is half drawn (the chip's cross then cancels it) */ drawing: boolean; /** something is made and nothing is half drawn: the chip shows a check that puts the tool away, in place of the cross (`in_283`) */ done: boolean } | null;
  /** a repeat or an operation that is open: the tick (Enter, a right click) and the cross (Esc) are shown for it (`in_244`) */
  confirm: { kind: string; label: string } | null;
  /** a cut of bodies being set up: the parts they make, with where the control of each stands and whether it is kept; and whether what is kept is joined (`in_294`) */
  cut: { parts: { mask: number; at: Vec3; label: string; tip: string; kept: boolean }[]; join: boolean } | null;
  /** the little panes of the world planes beside the axes (`in_190`) */
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
function gpuMotion(s: AppState): { split?: Frame["bodySplit"]; matrix: number[]; shown: { scene: Scene; outcome: CompileOutcome } } | null {
  const op = s.op;
  if (!op) return null;
  const base = op.made ? undone(s.session) : s.session;
  // a move, turn or uniform scale of the whole body is exact on the graphics card (a matrix: no guess in it) and needs no kernel; every other operation is drawn from the kernel's own result (`in_331`)
  const m = bodyMotion(sceneOf(base), op);
  if (!m) return null;
  if (!(gpuBase && gpuBase.history === s.session.history && gpuBase.outcome === s.session.outcome && gpuBase.made === !!op.made)) gpuBase = { history: s.session.history, outcome: s.session.outcome, made: !!op.made, value: { scene: sceneOf(base), outcome: base.outcome } };
  const matrix = matrixOf(m);
  lastDrag = { split: bodySplitOf(sceneOf(base), gpuBase.value.outcome, op), matrix, steps: sceneOf(base).steps.length };
  // what is drawn on a face of the body goes with it while it is dragged (it is carried when it is let go): the picture of the sketches is moved by the same numbers, no kernel (`in_234`)
  let shown = gpuBase.value;
  const full = opCommand(sceneOf(base), op);
  const carry = full?.type === "batch" ? full.commands.filter((c) => c.type !== "addStep") : [];
  if (carry.length) { const moved = apply(sceneOf(base), { type: "batch", commands: carry }); if (moved.ok) shown = { scene: moved.value, outcome: gpuBase.value.outcome }; }
  return { matrix, shown, split: lastDrag.split };
}

function operationResult(s: AppState): { scene: Scene; outcome: CompileOutcome } | null {
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
  const op = s.op ?? (s.repeat ? liveRepeat(sceneOf(s.session), s.repeat) : null);
  if (!op) return null;
  const base = op.made ? undone(s.session) : s.session; // a step already made for this operation is replaced by what is being dragged
  const cmd: Command | null = opCommand(sceneOf(base), op, { preview: true });
  if (!cmd) return null;
  const key = JSON.stringify([cmd, op.made]);
  if (memo && memo.history === s.session.history && memo.outcome === s.session.outcome && memo.key === key) return memo.value;
  let value = previewCommand(base, cmd);
  // a size that breaks a step is not shown as the broken body (it collapses into a weird shape): what is there stays, and why it cannot be made is said (`in_229`)
  const bad = value && !value.outcome.kernel?.stale ? Object.entries(value.outcome.errors).find(([id]) => !(id in base.outcome.errors)) : undefined;
  const refused = !bad && value ? previewRefusal(base, cmd, value) : null; // (a move the solver would undo: what is there stays, and the constraint is named, `in_335`)
  if (bad) { previewProblem = bad[1]; value = null; } else if (refused) { previewProblem = refused; value = null; } else previewProblem = null;
  memo = { history: s.session.history, outcome: s.session.outcome, key, value };
  return value;
}

function helperAt(s: AppState, g: { handles: Handle[] } | null): { at: Vec3; text: string } | null {
  if (!s.repeat || s.op || !g) return null;
  const h = helperOf(s.repeat);
  const arrow = h ? g.handles.find((x) => x.id === h.handle) : undefined;
  return h && arrow ? { at: arrow.points.at(-1)!, text: h.text } : null;
}

export function frameOf(s: AppState, size: { w: number; h: number }, now = 0): Frame {
  const gpu = gpuMotion(s);
  const shown = gpu ? gpu.shown : operationResult(s);
  const sc = shown?.scene ?? sceneOf(s.session);
  const sel = selectionOf(s.session);
  const outcome = shown?.outcome ?? s.session.outcome;
  // a whole-body drag is drawn by a matrix; when it is let go the picture stays moved until the kernel's answer for the new step comes (it would jump back otherwise)
  const settling = !gpu && !!outcome.kernel?.stale && !!lastDrag && sc.steps.length === lastDrag.steps + 1;
  if (!gpu && !settling && !outcome.kernel?.stale) lastDrag = null;
  const bodyMatrix = gpu ? gpu.matrix : settling ? lastDrag!.matrix : null;
  const bodySplit = bodyMatrix ? (gpu ? gpu.split ?? null : lastDrag?.split ?? null) : null;
  const hasBody = Object.values(sc.parts).some((p) => p.kind === "body");
  // the handles follow what they drag, live (a body being moved takes its arrows with it)
  const raw = gizmoOf(s);
  const live = s.op?.kind === "pushpull" || s.op?.kind === "extrude"; // (their arrows follow inside `gizmoOf`)
  const followedGizmo = raw && !live ? followed(raw, s.drag && "handle" in s.drag ? s.drag.handle : null, s.op?.value ?? null) : raw;
  // the arrows of a body's move that stood up by themselves come back at the kernel's box, which is still the old one for a moment after the drag: they stay where the body was drawn (`in_230`)
  const m = settling && !s.op && lastDrag?.matrix && activeOp(s)?.kind === "move" ? lastDrag.matrix : null;
  const gizmo = followedGizmo && m ? { centre: add(followedGizmo.centre, [m[12]!, m[13]!, m[14]!]), handles: followedGizmo.handles.map((h) => ({ ...h, points: h.points.map((q) => add(q, [m[12]!, m[13]!, m[14]!])) })) } : followedGizmo;
  // the arrow of a push / pull, an extrude or a fillet / chamfer that showed up by itself has its bubble too, ready for a typed size
  const auto = s.op ? null : activeOp(s);
  const shownOp = s.op ?? (auto && !(s.cam.straight && auto.kind !== "edge") && (auto.kind === "pushpull" || auto.kind === "extrude" || auto.kind === "edge") ? auto : null);
  // the arrows of a move have a number bubble on each, there as long as the arrows are (`in_215`)
  const mo = !s.tool && !s.repeat ? (s.op ?? auto) : null;
  const movingOp = mo && mo.kind === "move" && (mo.target === "body" || mo.target === "plane") ? mo : null;
  // the number of an operation's arrow shows only when that arrow is selected (clicked or taken), or a number is being typed for it: the arrows alone stay clean (`in_238`)
  const armed = !!s.handleSel && !!gizmo && gizmo.handles.some((h) => h.id === s.handleSel);
  const typing = !!shownOp && (shownOp.typed !== "" || shownOp.rot.some((t) => t !== ""));
  const numberShown = armed || typing || !!(s.drag && ("handle" in s.drag || "body" in s.drag));
  const flash = flashOf(s, sc, now);
  const busy = !!(s.tool || s.op); // while a tool or operation is running its number chip is shown, not the constraints
  const gp = gridPlaneOf(s);
  const annotationsPresent = !busy; // (the bubbles are the only user of `avoid`: none are shown while a tool or operation runs)
  return {
    scene: sc,
    mesh: outcome.kernel?.mesh ?? null,
    bodyMatrix,
    bodySplit,
    selectionMoves: !!bodyMatrix && sel.length > 0 && sel.every((r) => { const p = sc.parts[r]; return !!p && (p.kind === "body" || p.origin === "body"); }),
    highlight: { hover: s.session.hover, hoverPoint: s.hoverPoint, selection: sel,
    amber: [...new Set([...focusParts(sc, sel, s.focus), ...[...(s.tool?.hints ?? []), ...(s.dragHint?.hints ?? []), ...(s.tool && s.tool.points.length === 2 ? (s.tool.ends ?? []).flat() : [])].flatMap((h) => h.ref ? [h.ref] : [])])], red: { refs: flash?.parts ?? [], alpha: flash ? 1 - flash.t : 0 }, temp: s.repeat && !s.op ? temporaryParts(sceneOf(s.session), sc) : [], spread: s.spread },
    preview: withGhost(previewFor(sc, s.tool), s), // (the picture itself moves now: the thin rings that stood in for it are not needed)
    entry: movingOp || (shownOp && !s.tool && hasGizmo(shownOp.kind) && !numberShown) ? null : entryWhere(entryOf(sc, s.tool, shownOp), s, gizmo, shownOp),
    entries: s.repeat && !s.op ? repeatEntries(liveRepeat(sceneOf(s.session), s.repeat), gizmo, s.cam, s.repeat.chosen ?? null) : movingOp && numberShown ? moveEntries(s.handleSel?.startsWith("move:") ? { ...movingOp, axis: "xyz".indexOf(s.handleSel[5]!) as 0 | 1 | 2 } : movingOp, gizmo, moveOffset(sceneOf(s.session), movingOp)) : [],
    helper: helperAt(s, gizmo),
    busy: !!s.session.outcome.kernel?.stale,
    lookHint: lookOf(sc, sel, s.cam, s.world).lookHint,
    facing: facingOf(s.cam),
    touchHelper: touchHelperOf(s, gizmo),
    undoRedo: { undo: s.session.history.cursor > 0, redo: s.session.history.cursor < s.session.history.commands.length },
    box: s.box ? { ...s.box, touching: crossing(s.box) } : null,
    avoid: busy || !annotationsPresent ? { segs: [], pts: [] } : avoidOf(sc),
    hint: s.tool?.hints?.length && s.tool.cursor ? { kinds: s.tool.hints.map((h) => h.kind), at: s.tool.cursor } : s.dragHint ? { kinds: s.dragHint.hints.map((h) => h.kind), at: s.dragHint.at } : null,
    panel: panelOf(s.panel, sceneOf(s.session), sel, s.session.outcome.errors, s.showSketch),
    annotations: busy ? [] : [...withFlashed(annotationsFor(sc, sel, s.focus, s.showAllConstraints || !!s.showSketch), sc, flash)],
    flash,
    refusal: flash && s.flash?.retry && s.flash.victims.length ? { text: s.session.message ?? "", beside: s.flash.victims[0]!, button: s.flash.victims.length === 1 ? "Delete constraint to proceed" : "Delete constraints to proceed" } : null,
    grid: gp && settings.grid.show ? gridFor(s.cam, gp, size.w, size.h) : null, // on: the world plane that is on always has its grid (`in_190`)
    suggest: busy ? null : suggestionsFor(sc, sel, nearTolMm(s.cam), seenIn(s.cam, sc, size)),
    cut: s.cut ? { parts: cutParts(sceneOf(s.session), s.cut), join: s.cut.join } : null, // (the bodies as they are, not as the preview of the cut shows them)
    confirm: s.cut ? { kind: "subtract", label: "Cut" } : s.tool ? null : s.repeat && !s.op ? { kind: s.repeat.op.kind, label: OPEN_LABELS[s.repeat.op.kind] ?? s.repeat.op.kind } : s.op && s.op.kind !== "dimension" ? { kind: s.op.kind, label: OPEN_LABELS[s.op.kind] ?? s.op.kind } : null,
    tool: s.tool ? { kind: s.tool.kind, label: ({ rect: "Rectangle", circle: "Circle", line: "Line", arc: "Curve", trim: "Trim" } as const)[s.tool.kind], made: s.tool.made ?? 0, drawing: s.tool.points.length > 0, done: (s.tool.made ?? 0) > 0 && s.tool.points.length === 0 } : null,
    fadeBody: fadeBodyOf(s, outcome.kernel?.mesh ?? null),
    panes: WORLD_NAMES.map((name) => ({ name, corners: paneCorners(name), active: name === s.world, hover: name === s.paneHover })),
    gizmo: gizmo ? { handles: gizmo.handles, hover: s.gizmoHover, active: s.drag && "handle" in s.drag ? s.drag.handle.id : null, chosen: armed ? s.handleSel! : s.op?.kind === "rotate" ? `rot:${"xyz"[s.op.axis]}` : s.op?.kind === "move" && !s.op.free ? `move:${"xyz"[s.op.axis]}` : null, locked: s.lockAxes.map((k) => `move:${"xyz"[k]}`) } : null,
    similar: similarChip(s),
    selection: selectionChip(s),
    mates: busy ? [] : matesOn(sc),
    resetView: !s.anim && nothingInView(s, size.w, size.h, projector(s.cam, size.w, size.h).project as (p: Vec3) => [number, number]),
    modeSwitch: gizmo && !s.repeat ? modeSwitchOf(s.op ?? activeOp(s), gizmo.centre, gizmo.handles.flatMap((h) => h.points)) : null,
    cursor: s.tool || s.box ? "crosshair" : s.gizmoHover ? "grab" : "", // (held for a drag select: the cursor changes, `in_235`)
    message: s.session.message ?? (s.op && previewProblem ? `that size cannot be made: ${previewProblem}` : null) ?? Object.values(outcome.errors)[0] ?? "",
  };
}

/** What a repeat that is open would make (the lines, circles and corners of the copies): in the picture of the result, not yet in the drawing. */
function temporaryParts(now: Scene, shown: Scene): Ref[] {
  return Object.values(shown.parts).filter((p) => p.origin === "drawn" && !now.parts[p.ref] && !(p.kind === "corner" && p.derived) && !(p.kind === "line" && p.derived) && (p.kind === "line" || p.kind === "circle" || p.kind === "corner")).map((p) => p.ref);
}
const OPEN_LABELS: Record<string, string> = { linear: "Linear repeat", circular: "Circular repeat", copy: "Copy", move: "Move", rotate: "Rotate", scale: "Scale", pushpull: "Push / pull", extrude: "Extrude", edge: "Fillet / chamfer", offset: "Offset" };
const withFlashed = (list: Annotation[], sc: Scene, flash: FlashFrame | null): Annotation[] => {
  if (!flash) return list;
  const have = new Set(list.map((a) => a.id));
  return [...list, ...annotationsOf(sc, [...flash.victims, ...flash.culprits]).filter((a) => !have.has(a.id))];
};
function flashOf(s: AppState, sc: Scene, now: number): FlashFrame | null {
  if (!s.flash) return null;
  const t = (now - s.flash.at) / settings.flash.ms;
  if (t < 0 || t >= 1) return null;
  const parts = [...sc.relations.filter((r) => s.flash!.victims.includes(r.id)).flatMap((r) => r.parts), ...((s.flash.parts ?? []) as Ref[])];
  return { t, victims: s.flash.victims, culprits: s.flash.culprits, parts };
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
function avoidOf(sc: Scene): Frame["avoid"] {
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

/** Which way the switch by the handles of a move or a turn goes: to turning from moving, to moving from turning. */
function modeSwitchOf(op: AppState["op"], at: Vec3, pts: Vec3[]): Frame["modeSwitch"] {
  if (!op || (op.target !== "body" && op.target !== "plane")) return null;
  if (op.kind === "move") return { at, pts, to: "rotate", label: "Rotate" };
  if (op.kind === "rotate") return { at, pts, to: "move", label: "Move" };
  return null;
}

/** Each mate of the scene with where its mark stands and what it says (`in_316`). */
function matesOn(sc: Scene): Frame["mates"] {
  const out: Frame["mates"] = [];
  for (const m of mateStatus(sc)) {
    const rel = sc.relations.find((r) => r.id === m.id);
    const body = (r: Ref | undefined) => { const p = r ? sc.parts[r] : undefined; return p?.kind === "body" && p.bbox ? p : null; };
    const [mb, ob] = [body(rel?.parts[0]), body(rel?.parts[1])];
    const middle = (b: ReturnType<typeof body>): Vec3 | null => b?.bbox ? [(b.bbox.min[0] + b.bbox.max[0]) / 2, (b.bbox.min[1] + b.bbox.max[1]) / 2, (b.bbox.min[2] + b.bbox.max[2]) / 2] : null;
    const at = (m.mover ? faceMiddle(sc, m.mover.ref) : null) ?? (m.other ? faceMiddle(sc, m.other.ref) : null) ?? middle(mb) ?? middle(ob);
    if (!at) continue;
    const what = m.mode === "flush" ? "flush faces" : "coaxial";
    const text = m.state === "ok" ? `Mate: ${what}` : m.state === "off" ? `Mate: ${what}: no longer true (${(m.residual ?? 0).toFixed(2)} mm off): click to put it back` : `Mate: ${what}: a body or a face is gone`;
    out.push({ id: m.id, at, state: m.state, text });
  }
  return out;
}

function selectionChip(s: AppState): Frame["selection"] {
  const n = selectionOf(s.session).length;
  if (n < 2 || s.op || s.tool || s.cut || s.repeat || s.drag || similarChip(s)) return null;
  const actions = [
    ...(whyNotGroup(s.session) ? [] : [{ id: "select:group", label: "Group", title: "Make these one group: a click on one selects them all" }]),
    ...(whyNotUngroup(s.session) ? [] : [{ id: "select:ungroup", label: "Ungroup", title: "Break the group into its parts" }]),
  ];
  return actions.length ? { count: n, actions } : null;
}

function similarChip(s: AppState): Frame["similar"] {
  const sim = s.similar;
  if (!sim) return null;
  const sel = selectionOf(s.session);
  if (sel.length !== sim.refs.length || !sim.refs.every((r) => sel.includes(r))) return null;
  return { rules: SIMILAR_RULES.map((r) => ({ ...r, on: sim.rules.includes(r.id) })), count: sim.refs.length, noun: sim.noun };
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

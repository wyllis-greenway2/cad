// The controller: applies one intent to the app state. All behaviour of the pointer, the click grammar, the camera and the menu is decided here, in plain
// functions (`inv_no_logic_in_ui`): the UI only draws the state and the platform only reports devices. The work is in `control/`, one file per concern:
// `viewing` (camera), `pointer` (hover, click, menu), `modal` (tools, operations, typing, edits).
import type { Intent } from "../shared/input.ts";
import { figureRefs } from "../operation/scene.ts";
import { isLive } from "./operations.ts";
import type { Ref } from "../shared/ref.ts";
import type { AppState, Env } from "./control/state.ts";
import { doHover, doClick, doMenu, doHold, doTapAim, doMovePoint } from "./control/pointer.ts";
import { doCut } from "./control/select.ts";
import { doPan, doWalk, doSwivel, doZoom, doLook, doHome, doResetView } from "./control/viewing.ts";
import { doDragMove, doDragEnd } from "./control/handles.ts";
import { doSimilarRule, doGroup, doUngroup } from "./control/select.ts";
import { doBodiesAction } from "./control/bodies.ts";
import { doMotionKind, doMotionKeep, doMotionLink } from "./control/motion.ts";
import { setPlaying, reverseMotion } from "./motion.ts";
import { doStepGo, doStepEdit, doStepInsert, doStepSet, doStepLink, doParamSet, doParamRemove } from "./control/history.ts";
import { doBegin, doTyped, doEntry, doPanel, doPanelRow, doRepeatApply, doRepeatCancel, doEscape, doRunAction, doDelete, doUndo, doRedo, doRelation } from "./control/modal.ts";
import { hoverOn, run, scene as sceneOf } from "./session.ts";
import { stepOption, activateOption, similarOf } from "./options.ts";
import { loftChoice } from "./loft.ts";
import { orientApply, storePose } from "./control/pose.ts";
import { settings } from "../shared/settings.ts";
import type { Command } from "../operation/commands.ts";
import { projector } from "./camera.ts";
import { noteSeen } from "./lastseen.ts";
import type { Vec3 } from "../math/vec.ts";
import { offsetNear } from "./offset.ts";
import { armTool } from "./tools.ts";
import { normalOfPlane } from "../operation/part.ts";
import { add, sub, scale, dot } from "../math/vec.ts";

export { createState } from "./control/state.ts";
/**
 * The kernel's answer for the last step was an error and the step was taken back (the cursor is before where it was): an operation that goes on after the drag (a pull, a revolve, a fillet) stays open, as it does
 * when the step is refused at once, so the arrow can be taken again; anything else is over (`in_648`: a spiral arrow pulled a little made too small an advance and the whole revolve was dropped).
 */
export function afterTakenBack(s: AppState, before: number): AppState {
  if (s.session.history.cursor >= before) return s;
  return { ...s, drag: null, op: s.op && isLive(s.op) ? { ...s.op, made: false } : null };
}
export type { AppState } from "./control/state.ts";
export { advance, gridPlaneOf } from "./control/viewing.ts";
export { stop as stopView } from "./control/state.ts";
export { pivotOf, planeOf, objectOf } from "./objects.ts";

const RESUMING = new Set<Intent["type"]>(["hover", "hoverEnd", "click", "orbit", "pan", "zoom", "dragEnd", "look", "typed", "entry"]);

/** Apply one intent. A command that was refused for breaking constraints starts the flash. */
export function reduce(s: AppState, i: Intent, env: Env): AppState {
  if (s.adding && i.type === "click" && !i.shift && !s.tool && !s.op && !s.repeat && !s.cut && !s.picking) i = { ...i, shift: true }; // (adding: a tap is a Shift click, `in_539`)
  let next = apply(s, i, env);
  if (i.type === "faceKind" || i.type === "sizeKind" || i.type === "loftKind" || i.type === "similarRule" || i.type === "cut") next = { ...next, optionAt: null }; // (an option chosen by the pointer: the keyboard's place in the bar starts from there again, `in_664`)
  if (next.cam !== s.cam || next.session.history.scene !== s.session.history.scene || next.lastSeen === null) next = noteSeen(next, env.w, env.h, projector(next.cam, env.w, env.h).project as (p: Vec3) => [number, number]); // (what was last in view, for Reset camera, `in_303`)
  if (next.resume && !RESUMING.has(i.type)) next = { ...next, resume: null }; // only a click, or moving the view, keeps "sketching goes on" waiting for a vertex
  // the hidden sketch of a plane is shown while a tool begun on the edge of a body sketches in it (`in_211`)
  const shownStep = next.showSketch ? next.session.history.scene.steps.find((x) => x.id === next.showSketch) : undefined;
  const shownPlane = shownStep ? (next.session.history.scene.parts[figureRefs(shownStep)[0] ?? ""] as { plane?: Ref | null } | undefined)?.plane ?? null : null; // (the plane the extrusion's sketch is on, now: it may have been carried with the body)
  const reveal = next.tool?.reveal ? next.tool.plane : shownPlane;
  if ((next.session.reveal ?? null) !== reveal) next = { ...next, session: { ...next.session, reveal } };
  if (next.cut && next.session.click.selection.join("|") !== s.session.click.selection.join("|")) next = { ...next, cut: null }; // (a cut is about the bodies that were selected: choosing something else gives it up)
  if (next.handleSel && (i.type === "begin" || i.type === "runAction")) next = { ...next, handleSel: null }; // (a new operation starts with its arrows alone)
  // the axes chosen for a free drag belong to the body selected and the move: choosing something else, or a new operation, drops them (`in_299`)
  if (next.lockAxes.length && (next.session.click.selection.join("|") !== s.session.click.selection.join("|") || i.type === "begin" || i.type === "runAction")) next = { ...next, lockAxes: [] };
  // the tape measure shows what it measured for the thing it was applied to, and goes when that is let go or another is chosen (`in_391`)
  if (next.tape && s.tape && next.session.click.selection.join("|") !== s.session.click.selection.join("|")) next = { ...next, tape: false };
  // the mover's sphere is selected only while the mover is up for the same selection (`in_416`)
  if (next.moverSphere && (next.session.click.selection.join("|") !== s.session.click.selection.join("|") || i.type === "begin" || (i.type === "runAction" && !i.id.startsWith("op:")))) next = { ...next, moverSphere: false, moverWas: null };
  // the oriented mover stays while its part is selected, and goes when something else is (`in_439`)
  if (next.moverPose && next.session.click.selection.join("|") !== next.moverPose.key) next = { ...next, moverPose: null };
  // a selected arrow stays selected while what it belongs to does: not when the selection changes or the operation ends (`in_238`)
  if (next.handleSel && (!next.op && !next.repeat && next.session.click.selection.join("|") !== s.session.click.selection.join("|") || (s.op && !next.op && !next.repeat) || (s.repeat && !next.repeat))) next = { ...next, handleSel: null };
  // an offset starts with its arrow on the outline where you were pointing when you chose it (or at the middle of the view), not wherever the figure's own first side is: zoomed in, that could be out of sight (`in_244`)
  if (next.op?.kind === "offset" && !s.op && next.op.off) next = { ...next, op: anchoredOffset(next, s.menu, env) };
  // what is open can only be about what is there (`in_251`): a part deleted or undone out from under an operation or a repeat ends it, and a tool whose plane is gone waits for its first click again
  const there = (r: Ref) => r in sceneOf(next.session).parts;
  const drawn = (r: Ref) => r.startsWith("d/") && !r.includes("@"); // (a part you drew has a name that stays; a piece cut by crossings or a body's face is named by where it is, and may be named differently after a step)
  if (next.op && next.op.parts.some((r) => drawn(r) && !there(r))) next = { ...next, op: null, drag: null, gizmoHover: null, handleSel: null };
  if (next.repeat && [...next.repeat.op.parts, ...Object.values(next.repeat.pivot ?? {})].some((r) => typeof r === "string" && drawn(r as Ref) && !there(r as Ref))) next = { ...next, repeat: null, drag: null, gizmoHover: null, handleSel: null };
  if (next.tool?.plane && !there(next.tool.plane)) next = { ...next, tool: armTool(next.tool.kind) };
  // the operation that is open remembers where the history stood, so Esc can cancel what it made (`in_244`)
  // (an operation begun while another is still open, such as a chamfer started from the body an extrusion just made, is a new one: Esc takes back only what it made, `in_264`)
  const fresh = !!next.op && (!s.op || next.op.kind !== s.op.kind || next.op.parts.join("|") !== s.op.parts.join("|"));
  if (next.op && fresh) next = { ...next, opBase: s.session.history.cursor };
  else if (!next.op && next.opBase !== null) next = { ...next, opBase: null };
  const c = next.session.conflict;
  return c && c !== s.session.conflict ? { ...next, flash: { ...c, at: env.now } } : next;
}

/** "Delete constraint to proceed" (`in_366`): the constraints that stopped a change are deleted and the change is made, as one step (one undo takes both back). */
function overrideRefusal(s: AppState): AppState {
  const f = s.flash;
  if (!f?.retry) return s;
  const there = new Set(sceneOf(s.session).relations.map((r) => r.id));
  const drop: Command[] = f.victims.filter((id) => there.has(id)).map((id): Command => ({ type: "removeRelation", id }));
  const done = run(s.session, { type: "batch", commands: [...drop, f.retry] });
  if (done.message) return { ...s, session: done, flash: null };
  return { ...s, session: done, flash: null, op: null, drag: null };
}

function anchoredOffset(s: AppState, menu: AppState["menu"], env: Env): NonNullable<AppState["op"]> {
  const op = s.op!;
  const sc = sceneOf(s.session);
  const pl = op.off ? sc.parts[op.off.plane] : undefined;
  if (!op.off || !pl || pl.kind !== "plane") return op;
  const n = normalOfPlane(pl);
  const { o, d } = projector(s.cam, env.w, env.h).ray(menu ? menu.x : env.w / 2, menu ? menu.y : env.h / 2);
  const den = dot(d, n);
  if (Math.abs(den) < 1e-6) return op; // (looking along the plane: no place on it to point at)
  const p = add(o, scale(d, dot(sub(pl.at, o), n) / den));
  const off = offsetNear(sc, op.off, p);
  return { ...op, off, origin: off.origin, normal: off.normal };
}

function apply(s: AppState, i: Intent, env: Env): AppState {
  // in the orient mode a right click on empty space is the apply check: the mover's place is kept, the selection is not touched, and it goes back to the tool that was there (`in_439`)
  if (i.type === "menu" && !i.button && s.moverSphere) return orientApply(s);
  // going to the other tool with the orient mode up applies what was oriented, as the check does
  if (s.moverSphere && (i.type === "begin" || (i.type === "runAction" && i.id.startsWith("op:")))) s = storePose(s);
  switch (i.type) {
    case "hover": return doHover(s, i, env);
    case "tapAim": return doTapAim(s, i, env);
    case "cut": return doCut(s, i);
    case "movePoint": return doMovePoint(s, i, env);
    case "hoverEnd": return { ...s, session: hoverOn(s.session, undefined), hoverPoint: null };
    case "click": return doClick(s, i, env);
    case "menu": return doMenu(s, i, env);
    case "hold": return doHold(s, i, env);
    case "orbit": return doDragMove(s, i, env);
    case "dragEnd": return doDragEnd(s, env);
    case "pan": return doPan(s, i, env);
    case "resetView": return doResetView(s, env);
    case "walk": return doWalk(s, i);
    case "swivel": return doSwivel(s, i);
    case "zoom": return doZoom(s, i, env);
    case "look": return doLook(s, i, env);
    case "home": return doHome(s, env);
    case "runAction": return doRunAction(s, i.id, env.now);
    case "overrideRefusal": return overrideRefusal(s);
    case "menuTurn": return s; // (game mode's: the menu is turned by the page, `in_467`)
    case "sweepPlace": return s.op?.kind === "sweep" ? { ...s, op: { ...s.op, sweepPlace: i.id === "sketch" ? "sketch" : "path" } } : s;
    case "loftKind": return s.op?.kind === "loft" ? { ...s, op: loftChoice(sceneOf(s.session), s.op, i.id) } : s;
    case "sizeKind": {
      if (s.op?.kind !== "edge") return s;
      if (i.kind === "swap") return { ...s, op: { ...s.op, dfaceIx: (s.op.dfaceIx ?? 0) + 1 } }; // (the first distance goes to the other face, `dec_chamfer_two_distances`)
      return { ...s, op: { ...s.op, variable: i.kind === "variable", twoDist: i.kind === "twoDistances", varField: 0 } };
    }
    case "faceKind": return s.op?.kind === "pushpull" ? { ...s, op: { ...s.op, faceKind: i.kind } } : s;
    case "holdFlash": return s.flash ? { ...s, flash: { ...s.flash, at: env.now - settings.flash.holdMs } } : s;
    case "group": return doGroup(s);
    case "ungroup": return doUngroup(s);
    case "similarRule": return doSimilarRule(s, i.rule);
    case "delete": return doDelete(s);
    case "undo": return doUndo(s);
    case "redo": return doRedo(s);
    case "escape": return doEscape(s);
    case "begin": return doBegin(s, i.name, env.now);
    case "typed": {
      // Tab and Shift+Tab step through the options of the open operation, each step choosing it (`in_664`); the left and right arrows go between its numbers, which Tab does when it has no options or has several numbers to type
      const numbers = s.op?.kind === "edge" && !!(s.op.variable || s.op.twoDist) && !!s.op.vary; // (several numbers to type: Tab goes between them as it always did; Shift+Tab still steps the options)
      if (i.key === "Tab" && (i.shift || !numbers)) { const step = stepOption(s, i.shift ? -1 : 1); if (step) return { ...(step.intent ? reduce(s, step.intent, env) : s), optionAt: step.optionAt }; }
      // Shift+Enter flips the switch the bar's focus is on (Enter applies; a switch is not a choice between ways: Tab only lands on it, `in_670`)
      if (i.key === "Enter" && i.shift) { const act = activateOption(s); if (act) return { ...reduce(s, act, env), optionAt: s.optionAt }; }
      // Enter closes the rules of a Select similar (what is selected stays): the bar's check
      if (i.key === "Enter" && !i.shift && similarOf(s) && !s.op && !s.tool && !s.repeat && !s.cut && !s.picking) return { ...s, similar: null };
      return doTyped(s, i.key === "ArrowLeft" || i.key === "ArrowRight" ? "Tab" : i.key);
    }
    case "entry": return doEntry(s, i.field, i.text);
    case "repeatApply": return doRepeatApply(s);
    case "repeatCancel": return doRepeatCancel(s);
    case "previewAt": return s.preview ? { ...s, preview: { ...s.preview, at: Math.min(1, Math.max(0, Number.isFinite(i.at) ? i.at : 0)) } } : s;
    case "previewClose": return { ...s, preview: null };
    case "motionAt": return s.motion ? { ...s, motion: { ...s.motion, playing: false, startedAt: null, amount: Math.min(s.motion.hi, Math.max(s.motion.lo, Number.isFinite(i.amount) ? i.amount : 0)) } } : s; // (the scrubber: a hand on it stops the play)
    case "motionPlay": return s.motion ? { ...s, motion: setPlaying(s.motion, !s.motion.playing) } : s;
    case "motionReverse": return s.motion ? { ...s, motion: reverseMotion(s.motion) } : s;
    case "motionKind": return doMotionKind(s, i.kind);
    case "motionLink": return doMotionLink(s, i);
    case "motionKeep": return doMotionKeep(s);
    case "motionClose": return { ...s, motion: null };
    case "panel": return doPanel(s, i.name);
    case "panelRow": return doPanelRow(s, i.id, i.act);
    case "panelAction": return doBodiesAction(s, i.id);
    case "stepGo": return doStepGo(s, i.id);
    case "stepEdit": return doStepEdit(s, i.id);
    case "stepInsert": return doStepInsert(s);
    case "stepSet": return doStepSet(s, i.id, i.key, i.value);
    case "stepLink": return doStepLink(s, i.id, i.key, i.expr);
    case "paramSet": return doParamSet(s, i.name, i.expr);
    case "paramRemove": return doParamRemove(s, i.name);
    case "relation": return doRelation(s, i);
    case "save":
    case "open":
      return s; // files are the platform's business: the composition root handles these
  }
}

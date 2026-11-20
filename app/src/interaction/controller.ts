// The controller: applies one intent to the app state. All behaviour of the pointer, the click grammar, the camera and the menu is decided here, in plain
// functions (`inv_no_logic_in_ui`): the UI only draws the state and the platform only reports devices. The work is in `control/`, one file per concern:
// `viewing` (camera), `pointer` (hover, click, menu), `modal` (tools, operations, typing, edits).
import { planeCutOf, planeOfTool } from "./control/section.ts";
import { droppedBy } from "./dropped.ts";
import type { Intent } from "../shared/input.ts";
import { figureRefs } from "../operation/scene.ts";
import { isLive } from "./operations.ts";
import type { Ref } from "../shared/ref.ts";
import type { AppState, Env } from "./control/state.ts";
import { animateTo } from "./control/state.ts";
import { doHover, doClick, doMenu, doHold, doTapAim, doMovePoint, settleAwaiting } from "./control/pointer.ts";
import { doCut } from "./control/select.ts";
import { doPan, doWalk, doSwivel, doZoom, doLook, doHome, doResetView } from "./control/viewing.ts";
import { doDragMove, doDragEnd } from "./control/handles.ts";
import { doSimilarRule, doGroup, doUngroup } from "./control/select.ts";
import { doBodiesAction } from "./control/bodies.ts";
import { doMotionKind, doMotionKeep, doMotionLink, doMotionRest, doMotionFix } from "./control/motion.ts";
import { setPlaying, reverseMotion, motionHolds, setSpeed } from "./motion.ts";
import { solveContact } from "./contact.ts";
import { doStepGo, doStepEdit, doStepInsert, doStepSet, doStepLink, doParamSet, doParamRemove } from "./control/history.ts";
import { doBegin, doTyped, doEntry, doPanel, doPanelRow, doRepeatApply, doRepeatCancel, doEscape, doBuildNext, doRunAction, doDelete, doUndo, doRedo, doRelation } from "./control/modal.ts";
import { bodiesOfSelection } from "./objects.ts";
import { hoverOn, run, scene as sceneOf, selection as selectionOf } from "./session.ts";
import { stepOption, activateOption, similarOf } from "./options.ts";
import { loftChoice } from "./loft.ts";
import { orientApply, storePose } from "./control/pose.ts";
import { settings } from "../shared/settings.ts";
import type { Command } from "../operation/commands.ts";
import { projector, frame } from "./camera.ts";
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
  if (next.bodyConstraints.length) { // (the constraints of a body or a face that is no longer selected go back off, `in_1177`)
    const sel = selectionOf(next.session), bodies = bodiesOfSelection(sceneOf(next.session), sel);
    const kept = next.bodyConstraints.filter((r) => bodies.has(r) || sel.includes(r));
    if (kept.length !== next.bodyConstraints.length) next = { ...next, bodyConstraints: kept };
  }
  if (next.consFor && !selectionOf(next.session).includes(next.consFor)) next = { ...next, consFor: null }; // (the constraints icon of a double clicked body goes when it is no longer selected, `in_1160`)
  if (next.motion && sceneOf(next.session) !== sceneOf(s.session)) { const held = motionHolds(sceneOf(next.session), next.motion); next = held === next.motion ? next : { ...next, motion: held }; } // (what a motion moves is deleted or undone: it stops, `in_1129`)
  if (i.type === "faceKind" || i.type === "sizeKind" || i.type === "loftKind" || i.type === "similarRule" || i.type === "cut") next = { ...next, optionAt: null }; // (an option chosen by the pointer: the keyboard's place in the bar starts from there again, `in_664`)
  if (next.cam !== s.cam || next.session.history.scene !== s.session.history.scene || next.lastSeen === null) next = noteSeen(next, env.w, env.h, projector(next.cam, env.w, env.h).project as (p: Vec3) => [number, number]); // (what was last in view, for Reset camera, `in_303`)
  if (next.awaiting && next.session.click.selection.join("|") !== s.session.click.selection.join("|")) next = settleAwaiting(next, env.now); // (what a pressed, dimmed item waited for is selected: it runs, `in_951`)
  // a sketch tool begun on a plane takes the plane: the view stays cut along it until Exit sketch (`in_1375`)
  if (next.tool) { // (a tool on another plane than the one the cut is along takes the cut to its plane: the cut follows what is being drawn on, `in_1377`)
    const on = planeCutOf(next, planeOfTool(next), false);
    const same = (a: { centre: Vec3; n: Vec3 }, b: { centre: Vec3; n: Vec3 }) => Math.abs(dot(a.n, b.n)) > 1 - 1e-6 && Math.abs(dot(sub(a.centre, b.centre), b.n)) < 1e-4;
    if (on && (!next.sketchOn || !same(next.sketchOn, on))) next = { ...next, sketchOn: next.sketchOn?.off ? { ...on, off: true } : on }; // (the choice of the cut icon is kept, `in_1378`)
  }
  if (next.sketchOn && !(next.sketchOn.ref in sceneOf(next.session).parts)) next = { ...next, sketchOn: null }; // (the plane is gone: undone or deleted)
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
  const al = next.session.already; // (a constraint that already held: it flashes green, `in_1103`)
  if (al && al !== s.session.already) return { ...next, flash: { culprits: [], victims: [], green: al, at: env.now } };
  if (c && c !== s.session.conflict) return { ...next, flash: { ...c, at: env.now } };
  const gone = !c && !al && next.session.history.scene !== s.session.history.scene ? droppedBy(s.session.history.scene, next.session.history.scene) : null; // (constraints that went with a deleted part: the parts that stayed flash and the bubbles pop, `in_1168`)
  return gone ? { ...next, flash: { culprits: [], victims: [], parts: gone.parts, popped: gone.ids, ghosts: gone.ghosts, at: env.now } } : next;
}

/** "Delete constraint to proceed" (`in_366`): the constraints that stopped a change are deleted and the change is made, as one step (one undo takes both back). */
function overrideRefusal(s: AppState): AppState {
  const f = s.flash;
  if (!f) return s;
  const there = new Set(sceneOf(s.session).relations.map((r) => r.id));
  const drop: Command[] = f.victims.filter((id) => there.has(id)).map((id): Command => ({ type: "removeRelation", id }));
  const sc = sceneOf(s.session);
  for (const b of f.soften ?? []) { // (the hardness that stopped it is the constraint: a hard and a fixed body are each made soft)
    if (sc.hard?.includes(b)) drop.push({ type: "setHard", body: b, on: false });
    if (sc.fixed?.includes(b)) drop.push({ type: "setFixed", body: b, on: false });
  }
  if (!drop.length) return { ...s, flash: null };
  const done = run(s.session, f.retry ? { type: "batch", commands: [...drop, f.retry] } : { type: "batch", commands: drop }); // (no change to go on with: the constraint alone is deleted)
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
    case "buildNext": return doBuildNext(s);
    case "runAction": return doRunAction(i.part && i.id.startsWith("gear:") && !s.session.click.selection.includes(i.part as never) ? { ...s, session: { ...s.session, click: { ...s.session.click, selection: [i.part as never] } } } : s, i.id, env.now); // (the icon of a gear that is only pointed at: its Edit, Helix and Mesh are for that gear, `in_864`)
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
    case "sketchCut": return s.sketchOn ? { ...s, sketchOn: s.sketchOn.off ? { ref: s.sketchOn.ref, centre: s.sketchOn.centre, n: s.sketchOn.n } : { ...s.sketchOn, off: true } } : s; // (the bar's cut icon: the cut view on and off while sketching, `in_1377`)
    case "exitSketch": return { ...s, sketchOn: null, tool: null, resume: null, session: { ...s.session, message: null } }; // (sketching is left: the cut goes, and the tool with it, `in_1375`)
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
    case "motionAt": return s.motion ? { ...s, motion: solveContact(sceneOf(s.session), { ...s.motion, playing: false, startedAt: null, amount: Math.min(s.motion.hi, Math.max(s.motion.lo, Number.isFinite(i.amount) ? i.amount : 0)) }, s.session.outcome) } : s; // (the scrubber: a hand on it stops the play)
    case "motionPlay": return s.motion ? { ...s, motion: setPlaying(s.motion, !s.motion.playing) } : s;
    case "motionReverse": return s.motion ? { ...s, motion: reverseMotion(s.motion) } : s;
    case "motionShowClash": { const at = s.motion?.contact?.clashAt; return at ? animateTo(s, frame(s.cam, at.centre, at.radius), env.now) : s; }
    case "motionSpeed": return s.motion ? { ...s, motion: setSpeed(s.motion, i.k) } : s;
    case "motionKind": return doMotionKind(s, i.kind);
    case "motionLink": return doMotionLink(s, i);
    case "motionRest": return doMotionRest(s, i);
    case "motionKeep": return doMotionKeep(s);
    case "motionFix": return doMotionFix(s, i.act, env.now);
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

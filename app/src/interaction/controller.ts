// The controller: applies one intent to the app state. All behaviour of the pointer, the click grammar, the camera and the menu is decided here, in plain
// functions (`inv_no_logic_in_ui`): the UI only draws the state and the platform only reports devices. The work is in `control/`, one file per concern:
// `viewing` (camera), `pointer` (hover, click, menu), `modal` (tools, operations, typing, edits).
import type { Intent } from "../shared/input.ts";
import { figureRefs } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import type { AppState, Env } from "./control/state.ts";
import { doHover, doClick, doMenu, doHold, doTapAim, doMovePoint } from "./control/pointer.ts";
import { doCut } from "./control/select.ts";
import { doPan, doWalk, doSwivel, doZoom, doLook, doHome } from "./control/viewing.ts";
import { doDragMove, doDragEnd } from "./control/handles.ts";
import { doSimilarRule, doGroup, doUngroup } from "./control/select.ts";
import { doBegin, doTyped, doEntry, doPanel, doPanelRow, doRepeatApply, doRepeatCancel, doEscape, doRunAction, doDelete, doUndo, doRedo, doRelation } from "./control/modal.ts";
import { hoverOn, scene as sceneOf } from "./session.ts";
import { projector } from "./camera.ts";
import { offsetNear } from "./offset.ts";
import { armTool } from "./tools.ts";
import { normalOfPlane } from "../operation/part.ts";
import { add, sub, scale, dot } from "../math/vec.ts";

export { createState } from "./control/state.ts";
export type { AppState } from "./control/state.ts";
export { advance, gridPlaneOf } from "./control/viewing.ts";
export { pivotOf, planeOf, objectOf } from "./objects.ts";

const RESUMING = new Set<Intent["type"]>(["hover", "hoverEnd", "click", "orbit", "pan", "zoom", "dragEnd", "look", "typed", "entry"]);

/** Apply one intent. A command that was refused for breaking constraints starts the flash. */
export function reduce(s: AppState, i: Intent, env: Env): AppState {
  if (s.multiSelect && i.type === "click" && !i.shift && !s.tool && !s.op && !s.repeat && !s.cut) i = { ...i, shift: true }; // (select several: a tap is a Shift click, `in_300`)
  let next = apply(s, i, env);
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
    case "walk": return doWalk(s, i);
    case "swivel": return doSwivel(s, i);
    case "zoom": return doZoom(s, i, env);
    case "look": return doLook(s, i, env);
    case "home": return doHome(s, env);
    case "runAction": return doRunAction(s, i.id, env.now);
    case "group": return doGroup(s);
    case "ungroup": return doUngroup(s);
    case "similarRule": return doSimilarRule(s, i.rule);
    case "delete": return doDelete(s);
    case "undo": return doUndo(s);
    case "redo": return doRedo(s);
    case "escape": return doEscape(s);
    case "begin": return doBegin(s, i.name, env.now);
    case "typed": return doTyped(s, i.key);
    case "entry": return doEntry(s, i.field, i.text);
    case "repeatApply": return doRepeatApply(s);
    case "repeatCancel": return doRepeatCancel(s);
    case "panel": return doPanel(s, i.name);
    case "panelRow": return doPanelRow(s, i.id, i.act);
    case "relation": return doRelation(s, i);
    case "save":
    case "open":
      return s; // files are the platform's business: the composition root handles these
  }
}

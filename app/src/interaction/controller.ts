// The controller: applies one intent to the app state. All behaviour of the pointer, the click grammar, the camera and the menu is decided here, in plain
// functions (`inv_no_logic_in_ui`): the UI only draws the state and the platform only reports devices. The work is in `control/`, one file per concern:
// `viewing` (camera), `pointer` (hover, click, menu), `modal` (tools, operations, typing, edits).
import type { Intent } from "../shared/input.ts";
import { figureRefs } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import type { AppState, Env } from "./control/state.ts";
import { doHover, doClick, doMenu, doBox } from "./control/pointer.ts";
import { doPan, doZoom, doLook, doHome } from "./control/viewing.ts";
import { doDragMove, doDragEnd } from "./control/handles.ts";
import { doBegin, doTyped, doEntry, doPanel, doPanelRow, doRepeatApply, doRepeatCancel, doEscape, doRunAction, doDelete, doUndo, doRedo, doRelation } from "./control/modal.ts";
import { hoverOn } from "./session.ts";

export { createState } from "./control/state.ts";
export type { AppState } from "./control/state.ts";
export { advance, gridPlaneOf } from "./control/viewing.ts";
export { pivotOf, planeOf, objectOf } from "./objects.ts";

const RESUMING = new Set<Intent["type"]>(["hover", "hoverEnd", "click", "orbit", "pan", "zoom", "dragEnd", "look", "typed", "entry"]);

/** Apply one intent. A command that was refused for breaking constraints starts the flash. */
export function reduce(s: AppState, i: Intent, env: Env): AppState {
  let next = apply(s, i, env);
  if (next.resume && !RESUMING.has(i.type)) next = { ...next, resume: null }; // only a click, or moving the view, keeps "sketching goes on" waiting for a vertex
  // the hidden sketch of a plane is shown while a tool begun on the edge of a body sketches in it (`in_211`)
  const shownStep = next.showSketch ? next.session.history.scene.steps.find((x) => x.id === next.showSketch) : undefined;
  const shownPlane = shownStep ? (next.session.history.scene.parts[figureRefs(shownStep)[0] ?? ""] as { plane?: Ref | null } | undefined)?.plane ?? null : null; // (the plane the extrusion's sketch is on, now: it may have been carried with the body)
  const reveal = next.tool?.reveal ? next.tool.plane : shownPlane;
  if ((next.session.reveal ?? null) !== reveal) next = { ...next, session: { ...next.session, reveal } };
  const c = next.session.conflict;
  return c && c !== s.session.conflict ? { ...next, flash: { ...c, at: env.now } } : next;
}

function apply(s: AppState, i: Intent, env: Env): AppState {
  switch (i.type) {
    case "hover": return doHover(s, i, env);
    case "hoverEnd": return { ...s, session: hoverOn(s.session, undefined), hoverPoint: null };
    case "click": return doClick(s, i, env);
    case "menu": return doMenu(s, i);
    case "box": return doBox(s, i, env);
    case "orbit": return doDragMove(s, i, env);
    case "dragEnd": return doDragEnd(s);
    case "pan": return doPan(s, i, env);
    case "zoom": return doZoom(s, i, env);
    case "look": return doLook(s, i, env);
    case "home": return doHome(s, env);
    case "runAction": return doRunAction(s, i.id, env.now);
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

// The controller: applies one intent to the app state. All behaviour of the pointer, the click grammar, the camera and the menu is decided here, in plain
// functions (`inv_no_logic_in_ui`): the UI only draws the state and the platform only reports devices. The work is in `control/`, one file per concern:
// `viewing` (camera), `pointer` (hover, click, menu), `modal` (tools, operations, typing, edits).
import type { Intent } from "../shared/input.ts";
import type { AppState, Env } from "./control/state.ts";
import { doHover, doClick, doMenu } from "./control/pointer.ts";
import { doPan, doZoom, doLook, doHome } from "./control/viewing.ts";
import { doDragMove, doDragEnd } from "./control/handles.ts";
import { doBegin, doTyped, doEntry, doPanel, doPanelRow, doRepeatApply, doRepeatCancel, doEscape, doRunAction, doDelete, doUndo, doRedo, doRelation } from "./control/modal.ts";
import { hoverOn } from "./session.ts";

export { createState } from "./control/state.ts";
export type { AppState } from "./control/state.ts";
export { advance, gridPlaneOf } from "./control/viewing.ts";
export { pivotOf, planeOf, objectOf } from "./objects.ts";

/** Apply one intent. A command that was refused for breaking constraints starts the flash. */
export function reduce(s: AppState, i: Intent, env: Env): AppState {
  const next = apply(s, i, env);
  const c = next.session.conflict;
  return c && c !== s.session.conflict ? { ...next, flash: { ...c, at: env.now } } : next;
}

function apply(s: AppState, i: Intent, env: Env): AppState {
  switch (i.type) {
    case "hover": return doHover(s, i, env);
    case "hoverEnd": return { ...s, session: hoverOn(s.session, undefined), hoverPoint: null };
    case "click": return doClick(s, i, env);
    case "menu": return doMenu(s, i);
    case "orbit": return doDragMove(s, i, env);
    case "dragEnd": return doDragEnd(s);
    case "pan": return doPan(s, i, env);
    case "zoom": return doZoom(s, i, env);
    case "look": return doLook(s, i, env);
    case "home": return doHome(s, env);
    case "runAction": return doRunAction(s, i.id);
    case "delete": return doDelete(s);
    case "undo": return doUndo(s);
    case "redo": return doRedo(s);
    case "escape": return doEscape(s);
    case "begin": return doBegin(s, i.name);
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

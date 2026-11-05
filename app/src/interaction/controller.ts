// The controller: applies one intent to the app state. All behaviour of the pointer, the click grammar, the camera and the menu is decided here, in plain
// functions (`inv_no_logic_in_ui`): the UI only draws the state and the platform only reports devices. The work is in `control/`, one file per concern:
// `viewing` (camera), `pointer` (hover, click, menu), `modal` (tools, operations, typing, edits).
import type { Intent } from "../shared/input.ts";
import type { AppState, Env } from "./control/state.ts";
import { doHover, doClick, doMenu } from "./control/pointer.ts";
import { doOrbit, doPan, doZoom, doLook, doHome } from "./control/viewing.ts";
import { doBegin, doTyped, doEscape, doRunAction, doDelete, doUndo, doRedo, doRelation } from "./control/modal.ts";
import { hoverOn } from "./session.ts";

export { createState } from "./control/state.ts";
export type { AppState } from "./control/state.ts";
export { advance, gridPlaneOf } from "./control/viewing.ts";
export { pivotOf, planeOf, objectOf } from "./objects.ts";

export function reduce(s: AppState, i: Intent, env: Env): AppState {
  switch (i.type) {
    case "hover": return doHover(s, i, env);
    case "hoverEnd": return { ...s, session: hoverOn(s.session, undefined), hoverPoint: null };
    case "click": return doClick(s, i, env);
    case "menu": return doMenu(s, i, env);
    case "orbit": return doOrbit(s, i);
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
    case "relation": return doRelation(s, i);
    case "compass": return { ...s, axesBig: !s.axesBig };
    case "save":
    case "open":
      return s; // files are the platform's business: the composition root handles these
  }
}

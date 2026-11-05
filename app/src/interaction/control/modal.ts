// Tools and operations that take typing: starting them, typed keys, finishing, cancelling; and the edits that do not depend on the pointer (delete, undo, relations).
import type { Intent } from "../../shared/input.ts";
import { scene as sceneOf, selection as selectionOf, run, undoLast, redoLast, clearSelection } from "../session.ts";
import { actionsFor } from "../actions.ts";
import type { ToolKind } from "../tools.ts";
import { armTool, typeKey, finish, figureTool } from "../tools.ts";
import { remake } from "./handles.ts";
import type { OpKind } from "../operations.ts";
import { startOp, typeOp, opCommand, autoOp } from "../operations.ts";
import { lookup } from "../../operation/scene.ts";
import { planeOf } from "../objects.ts";
import type { AppState } from "./state.ts";
import { withSession } from "./state.ts";

function beginTool(s: AppState, kind: ToolKind): AppState {
  if (s.tool?.kind === kind && !s.tool.plane) return { ...s, tool: null }; // pressing it again puts it away
  return { ...s, tool: armTool(kind), op: null, menu: null };
}
function beginOp(s: AppState, kind: OpKind): AppState {
  const r = startOp(sceneOf(s.session), selectionOf(s.session), kind);
  if (!r.ok) return { ...s, session: { ...s.session, message: r.why }, menu: null };
  return { ...s, op: r.op, tool: null, menu: null, session: { ...s.session, message: null } };
}
export function doBegin(s: AppState, name: Extract<Intent, { type: "begin" }>["name"]): AppState {
  if (name === "sketch") {
    // the pencil: offer the shapes for the selected plane or face
    const only = selectionOf(s.session).length === 1 ? planeOf(lookup(sceneOf(s.session)), selectionOf(s.session)[0]!) : null;
    return only ? { ...s, sketching: only.ref, tool: null, op: null, menu: null } : s;
  }
  if (name === "rect" || name === "circle" || name === "line") {
    const plane = s.sketching; // chosen from a bubble on a plane: the first click lands on that plane
    return plane ? { ...s, sketching: null, tool: armTool(name, plane), op: null, menu: null } : beginTool(s, name);
  }
  return beginOp({ ...s, sketching: null }, name);
}

export function commitOp(s: AppState): AppState {
  if (!s.op) return s;
  const cmd = opCommand(sceneOf(s.session), s.op);
  if (!cmd) return s;
  const next = run(s.session, cmd);
  if (next.message) return { ...s, session: next };
  if (s.op.kind === "dimension") return { ...s, session: next, op: null }; // a number on a relation: the selection stays, so its badge shows
  const settled = { spread: null, hoverPoint: null }; // what was under the pointer before the step is not what is under it now
  // an extrude leaves nothing selected (the new body shows as itself); the other steps keep what was selected so they can go on (move, then rotate)
  return { ...s, ...settled, session: s.op.kind === "extrude" || s.op.kind === "pushpull" ? { ...next, hover: undefined, click: { ...next.click, selection: [] } } : next, op: null };
}

export function doTyped(s: AppState, key: string): AppState {
  if (!s.op && !s.tool && /^[0-9.\-]$/.test(key)) {
    // a handle is showing for the selection: typing a number is the same as dragging it that far
    const a = autoOp(sceneOf(s.session), selectionOf(s.session));
    if (a) return { ...s, op: typeOp(a, key) };
  }
  if (s.op) return key === "Enter" ? commitOp(s) : { ...s, op: typeOp(s.op, key) };
  const t = s.tool;
  if (!t || !t.placed) return s;
  if (key === "Enter") return { ...s, tool: null }; // the figure is already made: Enter ends the drawing
  const typed = typeKey(t, key); // a typed size makes the figure again at that size
  if (typed === t) return s;
  if (!finish(sceneOf(s.session), figureTool(typed))) return { ...s, tool: typed };
  return remake({ ...s, session: undoLast(s.session) }, typed);
}

/** Esc lets go in steps: the menu, then an open badge, then the tool or operation, then the selection. */
export function doEscape(s: AppState): AppState {
  if (s.menu) return { ...s, menu: null };
  if (s.sketching) return { ...s, sketching: null };
  if (s.focus && !s.tool && !s.op) return { ...s, focus: null };
  if (s.tool || s.op) return { ...s, tool: null, op: null, drag: null, gizmoHover: null };
  return withSession(s, clearSelection(s.session));
}

export function doRunAction(s: AppState, id: string): AppState {
  const closed = { ...s, menu: null };
  if (id.startsWith("tool:")) return beginTool(closed, id.slice(5) as ToolKind);
  if (id.startsWith("op:")) return beginOp(closed, id.slice(3) as OpKind);
  const a = actionsFor(sceneOf(s.session), selectionOf(s.session)).find((x) => x.id === id);
  return a && a.enabled ? { ...withSession(s, run(s.session, a.run())), menu: null } : closed;
}
export function doDelete(s: AppState): AppState {
  if (s.tool || s.op) return s;
  const a = actionsFor(sceneOf(s.session), selectionOf(s.session)).find((x) => x.id === "delete");
  return a ? { ...withSession(s, run(s.session, a.run())), menu: null } : s;
}
export const doUndo = (s: AppState): AppState => ({ ...withSession(s, undoLast(s.session)), menu: null });
export const doRedo = (s: AppState): AppState => ({ ...withSession(s, redoLast(s.session)), menu: null });

/** A constraint shown on a selected part: open or close it, delete it, lock or unlock its number, give it a new number, or lock the measure of the selection. */
export function doRelation(s: AppState, i: Extract<Intent, { type: "relation" }>): AppState {
  const sc = sceneOf(s.session);
  if (i.act === "focus") return { ...s, focus: i.id === s.focus ? null : i.id }; // a second click closes it again
  if (i.act === "measure") {
    const a = actionsFor(sc, selectionOf(s.session)).find((x) => x.dimensional && x.enabled);
    return a && i.value !== undefined && i.value > 0 ? withSession(s, run(s.session, a.run(i.value))) : s;
  }
  const rel = i.id ? sc.relations.find((r) => r.id === i.id) : undefined;
  if (!rel) return s;
  if (i.act === "remove") return { ...withSession(s, run(s.session, { type: "removeRelation", id: rel.id })), focus: null };
  if (i.act === "set") return rel.value !== undefined && i.value !== undefined && i.value > 0 ? withSession(s, run(s.session, { type: "setRelationValue", id: rel.id, value: i.value, locked: true })) : s;
  if (rel.value === undefined) return s;
  const action = actionsFor(sc, rel.parts).find((x) => x.id === rel.kind && x.dimensional);
  const value = rel.locked === false ? (action?.measure() ?? rel.value) : rel.value; // locking takes the value it measures now
  return withSession(s, run(s.session, { type: "setRelationValue", id: rel.id, value, locked: rel.locked === false }));
}

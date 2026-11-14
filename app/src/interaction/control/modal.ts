// Tools and operations that take typing: starting them, typed keys, finishing, cancelling; and the edits that do not depend on the pointer (delete, undo, relations).
import type { Intent } from "../../shared/input.ts";
import { scene as sceneOf, selection as selectionOf, run, undoLast, redoLast, clearSelection } from "../session.ts";
import { nearCommand } from "../suggest.ts";
import { actionsFor, measureAction } from "../actions.ts";
import type { ToolKind } from "../tools.ts";
import { armTool, typeKey, finish, lineNext } from "../tools.ts";
import type { OpKind } from "../operations.ts";
import { startOp, typeOp, autoOp } from "../operations.ts";
import { runOp } from "../runop.ts";
import { lookup, nextId } from "../../operation/scene.ts";
import type { Ref } from "../../shared/ref.ts";
import { planeOf } from "../objects.ts";
import { sketchOfEdge } from "../../operation/edgesource.ts";
import { sideOf, viewAxes, nearTolMm } from "../camera.ts";
import { moveOffset } from "../gizmo.ts";
import { normalOfPlane } from "../../operation/part.ts";
import type { Plane } from "../../operation/part.ts";
import type { AppState } from "./state.ts";
import { activeOp } from "./handles.ts";
import { pivotCommands, repeatApply, repeatCancel, advanceHelp } from "../pattern.ts";
import type { Repeat } from "../pattern.ts";
import type { Op } from "../operations.ts";
import { patternOfAll } from "../../operation/repeat.ts";
import { BODY_OBJECT } from "../../compiler/body.ts";
import { setLineLength } from "../lengths.ts";
import { withSession, animateTo, planeView } from "./state.ts";
import { doSimilar, doGroup, doUngroup, doCutBegin, applyCut } from "./select.ts";
import { groupsOf, membersOf } from "../../operation/groups.ts";

/** The sketch group (`in_229`): the tools that draw on a plane, and the operations that work in one. Every member follows the group's rules below, so a new tool is added here (the records name every kind, so the compiler asks which group it is in) and gets them all. */
const IS_SKETCH_TOOL: Record<ToolKind, true> = { rect: true, circle: true, line: true, arc: true, trim: true };
const IS_SKETCH_OP: Record<OpKind, boolean> = { offset: true, extrude: false, pushpull: false, edge: false, move: false, rotate: false, scale: false, dimension: false, linear: false, circular: false, copy: false };
const isSketchTool = (name: string): name is ToolKind => name in IS_SKETCH_TOOL;

/** The plane a sketch tool or operation starts on: exactly one plane selected (a face, a plane, or what a sketch line or the body's edge lies in), or none, or several: the plane of what the right click was on (`in_169`). */
function sketchPlane(s: AppState, over: Ref | null): { plane: Plane | null; onSketch: boolean } {
  const get = lookup(sceneOf(s.session));
  const sc = sceneOf(s.session);
  // an edge of the body that lies where a sketch part was: sketching goes on in that sketch's own plane, so what is drawn can be tied to it by constraints (`in_210`)
  const selected = [...new Map(selectionOf(s.session).flatMap((r) => { const p = planeOf(get, sketchOfEdge(sc, r)?.ref ?? r); return p ? [[p.ref, p] as const] : []; })).values()];
  const plane = selected.length === 1 ? selected[0]! : over ? planeOf(get, over) : null;
  return { plane, onSketch: selected.length === 1 && selectionOf(s.session).some((r) => sketchOfEdge(sc, r)) };
}

/** The group's rule that applies to all of them: the view turns straight to the plane of what is selected, from the side you are on (`in_149`, `in_229`); not when it already looks straight at it. */
function facePlane(s: AppState, over: Ref | null, now: number): AppState {
  const { plane } = sketchPlane(s, over);
  return plane && sideOf(s.cam, normalOfPlane(plane)) === 0 ? animateTo(s, planeView(s.cam, plane, false), now) : s;
}

function beginTool(s: AppState, kind: ToolKind, now: number, over: Ref | null = null): AppState {
  if (s.tool?.kind === kind && !s.tool.plane) return { ...s, tool: null }; // pressing it again puts it away
  const armed: AppState = { ...s, tool: armTool(kind), op: null, menu: null };
  const { plane, onSketch } = sketchPlane(s, over);
  if (plane && onSketch) return animateTo({ ...armed, tool: { ...armTool(kind), plane: plane.ref, reveal: true } }, planeView(s.cam, plane, false), now);
  return facePlane(armed, over, now);
}
function beginOp(s: AppState, kind: OpKind, now = 0, over: Ref | null = null): AppState {
  const r = startOp(sceneOf(s.session), selectionOf(s.session), kind, viewAxes(s.cam));
  if (!r.ok) return { ...s, session: { ...s.session, message: r.why }, menu: null };
  const started: AppState = { ...s, op: r.op, tool: null, menu: null, session: { ...s.session, message: null } };
  return IS_SKETCH_OP[kind] ? facePlane(started, over, now) : started;
}
export function doBegin(s: AppState, name: Extract<Intent, { type: "begin" }>["name"], now = 0): AppState {
  return isSketchTool(name) ? beginTool(s, name, now) : beginOp(s, name, now);
}

/** Put a finished figure into the scene and hand back to normal selection with the figure selected. */
/** The tool stays on after a figure is made, ready on the same plane for the next, until a right click or the cancel icon at the top puts it away (`in_193`). */
const stays = (t: AppState["tool"]): AppState["tool"] => (t ? { ...armTool(t.kind), plane: t.plane, made: (t.made ?? 0) + 1, ...(t.reveal ? { reveal: true as const } : {}) } : null);

export function commitFigure(s: AppState, fin: ReturnType<typeof finish>): AppState {
  if (!fin) return s;
  const next = run(s.session, fin.command);
  if (next.message) return { ...s, session: next };
  const sel = fin.select.filter((r) => r in sceneOf(next).parts);
  // a circle drawn about another circle's centre is concentric with it
  const circle = fin.select[0]?.startsWith("d/disk@") ? (`d/${fin.select[0].slice(7)}` as Ref) : null;
  if (s.tool?.kind === "circle" && s.tool.concentric && circle && circle in sceneOf(next).parts) {
    const rel = run(next, { type: "addRelation", relation: { id: nextId(sceneOf(next), "r"), kind: "concentric", parts: [circle, s.tool.concentric] } });
    if (!rel.message) return { ...s, session: { ...rel, click: { ...rel.click, selection: sel } }, tool: stays(s.tool), resume: null, spread: null };
  }
  return { ...s, session: { ...next, click: { ...next.click, selection: sel } }, tool: stays(s.tool), resume: null, spread: null }; // (only a line goes on: a circle, rectangle or curve finished must not start another when its vertex is clicked to select it, `in_162`)
}
export function commitOp(s: AppState): AppState {
  if (!s.op) return s;
  const sess = s.op.made ? undoLast(s.session) : s.session; // a step made by dragging is replaced by the typed number
  const made = runOp(sess, s.op);
  if (!made) return s;
  const next = made.session;
  if (next.message && next.history === sess.history) return { ...s, session: next };
  if (s.op.kind === "dimension") return { ...s, session: next, op: null }; // a number on a relation: the selection stays, so its badge shows
  const settled = { spread: null, hoverPoint: null }; // what was under the pointer before the step is not what is under it now
  // an extrude leaves nothing selected (the new body shows as itself); the other steps keep what was selected so they can go on (move, then rotate)
  return { ...s, ...settled, session: s.op.kind === "extrude" || s.op.kind === "pushpull" ? { ...next, hover: undefined, click: { ...next.click, selection: [] } } : next, op: null };
}

export function doTyped(s: AppState, key: string): AppState {
  if (s.cut && key === "Enter") return applyCut(s);
  if (!s.op && !s.tool && /^[0-9.\-]$/.test(key)) {
    // one standard for typing with something selected (`dec_typing_standard`, `in_235`): a drawn part that has a number of its own (a side: its length; a circle: its diameter; an arc: its radius; two
    // sides: the angle; a corner and another corner or a side: the distance) takes what is typed as that number, and Enter locks it; the figure itself, a face or the body has its handle (extrude, push
    // pull, move), and typing is the same as dragging it that far
    const sc = sceneOf(s.session);
    const sel = selectionOf(s.session);
    const ownNumber = sel.length > 0 && sel.every((r) => { const p = sc.parts[r]; return p && p.origin === "drawn" && (p.kind === "corner" || p.kind === "line" || p.kind === "circle"); });
    const dim = ownNumber ? startOp(sc, sel, "dimension") : null;
    if (dim?.ok) return { ...s, op: typeOp(dim.op, key) };
    // a handle is showing for the selection: typing a number is the same as dragging it that far
    const a = autoOp(sceneOf(s.session), selectionOf(s.session));
    if (a) return { ...s, op: typeOp(a.kind === "move" ? a : { ...a, auto: false }, key) };
  }
  if (s.repeat && !s.op) return key === "Enter" ? doApply(s) : s; // (a repeat takes its numbers in its bubbles; Enter applies it, `in_244`)
  if (s.op && s.op.kind === "rotate" && (s.op.target === "body" || s.op.target === "plane") && key !== "Enter") {
    // typing turns the body to that angle about the axis in use (the one whose ring was dragged, X to begin with)
    const i = s.op.axis;
    const typed = typeOp({ ...s.op, typed: s.op.rot[i]! }, key);
    const rot = [...s.op.rot] as [string, string, string];
    rot[i] = typed.typed;
    return { ...s, op: { ...s.op, rot, value: null, typed: "" } };
  }
  if (s.op) {
    if (key === "Enter") return doApply(s);
    const typed = typeOp(s.op, key);
    // a number typed for a move is the position along the axis since the move began: the step is what is missing (`in_230`)
    return { ...s, op: s.op.kind === "move" && s.op.typed === "" && typed.typed !== "" ? { ...typed, typedBase: moveOffset(sceneOf(s.session), s.op)[s.op.axis]! } : typed };
  }
  const t = s.tool;
  if (!t || !t.plane || !t.points.length) return s;
  if (key !== "Enter") return { ...s, tool: typeKey(t, key) };
  const next = t.kind === "line" && t.typed[0] !== "" ? lineNext(t) : null; // a typed length gives the line's end
  return commitFigure(s, finish(sceneOf(s.session), next ? { ...t, points: [t.points[0]!, next] } : t));
}

/** The text of a field of the value box changed: the operation's number, or a size of the figure being drawn. */
export function doEntry(s: AppState, field: number, text: string): AppState {
  if (!/^-?\d*\.?\d*$/.test(text)) return s;
  if (s.op && s.op.kind === "rotate" && (s.op.target === "body" || s.op.target === "plane")) {
    const rot = [...s.op.rot] as [string, string, string];
    if (field >= 0 && field < 3) rot[field] = text;
    return { ...s, op: { ...s.op, rot, axis: (field as 0 | 1 | 2), value: null, typed: "" } };
  }
  const mover = s.op ?? activeOp(s);
  if (mover && mover.kind === "move" && (mover.target === "body" || mover.target === "plane") && !s.repeat && !s.tool && field >= 0 && field < 3) {
    // the bubble on one of the move arrows (`in_215`): a distance typed along that axis; another axis starts again
    const same = mover.axis === field;
    return { ...s, op: { ...mover, auto: false, axis: field as 0 | 1 | 2, typed: text, typedBase: moveOffset(sceneOf(s.session), mover)[field]!, ...(same ? {} : { value: null }) } };
  }
  if (s.repeat && !s.op) {
    // a number of the repeat that is open (the count and the spacing, or the count and the degrees)
    const pat = [...s.repeat.op.pat];
    if (field >= 0 && field < pat.length) pat[field] = text;
    const chosen = s.repeat.op.kind === "circular" ? null : field >= 0 && field < 6 ? `${field % 2 === 0 ? "cnt" : "lin"}:${"xyz"[field >> 1]}` : s.repeat.chosen ?? null; // (the arrow whose number it is)
    return { ...s, repeat: advanceHelp({ ...s.repeat, chosen, op: { ...s.repeat.op, pat } }) };
  }
  const auto = s.op || s.tool ? null : activeOp(s); // (a tool that is on keeps its own fields: an arrow that shows for the selection does not take what is typed, `in_251`)
  if (auto && (auto.kind === "pushpull" || auto.kind === "extrude" || auto.kind === "edge")) return { ...s, op: { ...auto, auto: false, typed: text } }; // typing in the bubble of an arrow that showed up by itself
  if (s.op) return { ...s, op: { ...s.op, typed: text } };
  const t = s.tool;
  if (!t || !t.plane || !t.points.length) return s;
  const typed: [string, string] = field === 0 ? [text, t.typed[1]] : [t.typed[0], text];
  return { ...s, tool: { ...t, typed, field: (field === 0 ? 0 : 1) as 0 | 1 } };
}

/** Esc lets go in steps: the menu, then an open badge, then the tool or operation, then the selection. */
export function doEscape(s: AppState): AppState {
  if (s.menu) return { ...s, menu: null };
  if (s.cut) return { ...s, cut: null, session: { ...s.session, message: null } };
  if (s.focus && !s.tool && !s.op) return { ...s, focus: null };
  if (s.box) return { ...s, box: null };
  if (s.repeat && !s.op) return doRepeatCancel(s); // (the repeat that is open is given up, as the pill's cross used to)
  if (s.op) return cancelOp(s);
  if (s.tool) return { ...s, tool: null, op: null, drag: null, gizmoHover: null };
  return withSession(s, clearSelection(s.session));
}

/** Esc on an operation that is open: what it made since it began (its steps) is taken back, and it is put away (`in_244`). */
function cancelOp(s: AppState): AppState {
  let session = s.session;
  for (let n = 0; s.opBase !== null && session.history.cursor > s.opBase && n < 1000; n++) session = undoLast(session);
  return { ...s, session: { ...session, message: null, conflict: null }, op: null, opBase: null, drag: null, gizmoHover: null, handleSel: null, spread: null, hoverPoint: null };
}

/**
 * Enter, a right click, or the tick: accept what is open and leave it (`in_244`). A repeat makes its copies (with none to make it just leaves); an operation takes the number typed for it or, with none, leaves
 * what its drags made as it is; a tool that has a figure under way makes it, else it is put away.
 */
export function doApply(s: AppState): AppState {
  if (s.repeat && !s.op) { const made = doRepeatApply(s); return made.repeat ? doRepeatCancel(made) : made; }
  if (s.op) {
    const c = commitOp(s); // (what was typed or dragged is made; a refusal keeps the operation open with its reason; with nothing to make, it only leaves)
    if (c !== s) return c;
    return { ...s, op: null, drag: null, gizmoHover: null, handleSel: null };
  }
  if (s.tool) return s.tool.plane && s.tool.points.length ? doTyped(s, "Enter") : { ...s, tool: null, resume: null, menu: null };
  return s;
}

export function doRunAction(s: AppState, id: string, now = 0): AppState {
  const closed = { ...s, menu: null };
  if (id === "look") {
    const get = lookup(sceneOf(s.session));
    const planes = [...new Map(selectionOf(s.session).flatMap((r) => { const p = planeOf(get, r); return p ? [[p.ref, p] as const] : []; })).values()];
    const pl = planes.length === 1 ? planes[0]! : s.menu?.plane ? planeOf(get, s.menu.plane) : null;
    if (!pl) return { ...closed, session: { ...closed.session, message: "select a plane or a face first" } };
    return animateTo(closed, planeView(s.cam, pl, true), now); // (pressed again: the back)
  }
  if (id === "select:similar") return doSimilar(closed);
  if (id === "select:group") return doGroup(closed);
  if (id === "combine:parts") return doCutBegin(closed);
  if (id === "repeat:edit") return doRepeatEdit(closed);
  if (id === "repeat:break") return doRepeatBreak(closed);
  if (id === "select:ungroup") return doUngroup(closed);
  if (id === "constraints") return { ...closed, showAllConstraints: !s.showAllConstraints };
  if (id.startsWith("tool:")) return beginTool(closed, id.slice(5) as ToolKind, now, s.menu?.plane ?? null);
  if (id === "op:linear" || id === "op:circular" || id === "op:copy") return doRepeatBegin(closed, id.slice(3) as "linear" | "circular" | "copy");
  if (id.startsWith("op:")) return beginOp(closed, id.slice(3) as OpKind, now, s.menu?.plane ?? null);
  if (id.startsWith("near:")) {
    const cmd = nearCommand(sceneOf(s.session), selectionOf(s.session), id, nearTolMm(s.cam));
    return cmd ? { ...withSession(s, run(s.session, cmd)), menu: null } : closed;
  }
  const a = actionsFor(sceneOf(s.session), selectionOf(s.session)).find((x) => x.id === id);
  return a && a.enabled ? { ...withSession(s, run(s.session, a.run())), menu: null } : closed;
}
export function doDelete(s: AppState): AppState {
  if (s.tool || s.op || s.repeat) return s;
  const a = actionsFor(sceneOf(s.session), selectionOf(s.session)).find((x) => x.id === "delete");
  return a ? { ...withSession(s, run(s.session, a.run())), menu: null } : s;
}
export const doUndo = (s: AppState): AppState => {
  if (s.repeat) return { ...s, menu: null, session: { ...s.session, message: "apply or cancel the repeat that is open first" } };
  // an operation that is open and has made nothing yet (an arrow was dragged, nothing was applied, or it was refused) is not on the history: the first undo puts it away, it does not undo the step before (`in_229`)
  if (s.op && !s.op.made && !s.op.auto) return { ...s, menu: null, op: null, drag: null, gizmoHover: null, session: { ...s.session, message: null, conflict: null } };
  return { ...withSession(s, undoLast(s.session)), menu: null, op: s.op?.made ? null : s.op };
};
export const doRedo = (s: AppState): AppState => s.repeat ? { ...s, menu: null, session: { ...s.session, message: "apply or cancel the repeat that is open first" } } : ({ ...withSession(s, redoLast(s.session)), menu: null, op: s.op?.made ? null : s.op });

/** A constraint shown on a selected part: open or close it, delete it, lock or unlock its number, give it a new number, or lock the measure of the selection. */
export function doRelation(s: AppState, i: Extract<Intent, { type: "relation" }>): AppState {
  const sc = sceneOf(s.session);
  if (i.act === "focus") return { ...s, focus: i.id === s.focus ? null : i.id }; // a second click closes it again
  if (i.act === "measure") {
    const sel = selectionOf(s.session);
    const a = measureAction(actionsFor(sc, sel), (x) => x.enabled);
    if (a) return i.value !== undefined && i.value > 0 ? withSession(s, run(s.session, a.run(i.value), { watchAll: true })) : s; // (a sketch the body was made from: a size the steps cannot take is refused)
    // a line of the body: its length is made by pushing or pulling the face at its end
    const cmd = sel.length === 1 && i.value !== undefined ? setLineLength(sc, sel[0]!, i.value) : null;
    return cmd ? withSession({ ...s, op: null }, run(s.session, cmd)) : s;
  }
  const rel = i.id ? sc.relations.find((r) => r.id === i.id) : undefined;
  if (!rel) return s;
  if (i.act === "remove") return { ...withSession(s, run(s.session, { type: "removeRelation", id: rel.id })), focus: null };
  if (i.act === "set") return rel.value !== undefined && i.value !== undefined && i.value > 0 ? withSession(s, run(s.session, { type: "setRelationValue", id: rel.id, value: i.value, locked: true }, { watchAll: true })) : s;
  if (rel.value === undefined) return s;
  const action = actionsFor(sc, rel.parts).find((x) => x.id === rel.kind && x.dimensional);
  const value = rel.locked === false ? (action?.measure() ?? rel.value) : rel.value; // locking takes the value it measures now
  return withSession(s, run(s.session, { type: "setRelationValue", id: rel.id, value, locked: rel.locked === false }));
}

/** The ⋯ menu's lists: choosing one opens it, choosing it again closes it. */
export const doPanel = (s: AppState, name: "bodies" | "history" | "groups"): AppState => ({ ...s, panel: s.panel === name ? null : name, menu: null });
/** A row of the open list: a body is selected, a step is taken out of the history. */
export function doPanelRow(s: AppState, id: string, act: "select" | "remove" | "sketch" | "edit"): AppState {
  if (act === "edit") return doRepeatEditStep(s, id); // (a step that is a repeat of the body: its numbers are set again, `in_257`)
  if (act === "sketch") return { ...s, showSketch: s.showSketch === id ? null : id }; // (the sketch of an extrusion shown, or put away again)
  if (groupsOf(sceneOf(s.session)).some((g) => g.id === id)) {
    // a row of the Groups list: select what is in it, or break it
    if (act === "select") return withSession(s, { ...s.session, click: { ...s.session.click, selection: membersOf(sceneOf(s.session), id) }, message: null });
    return withSession(s, run(s.session, { type: "ungroup", id }));
  }
  if (act === "select") return id in sceneOf(s.session).parts ? withSession(s, { ...s.session, click: { ...s.session.click, selection: [id as never] } }) : s;
  return withSession({ ...s, op: null }, run(s.session, { type: "removeStep", id }));
}

// ---- a repeat being set up (`in_141`): it is its own state, not an operation, so Move and the rest can still be used while it is up ----
/** Start a repeat of what is selected (a copy is a repeat of two). A circular one gets its pivot parts: a point, a point at the middle of what is repeated, a line between. */
function doRepeatBegin(s: AppState, kind: "linear" | "circular" | "copy"): AppState {
  const say = (message: string): AppState => ({ ...s, menu: null, session: { ...s.session, message } });
  if (s.repeat) return say("apply or cancel the repeat that is open first");
  const r = startOp(sceneOf(s.session), selectionOf(s.session), kind, viewAxes(s.cam));
  if (!r.ok) return say(r.why);
  let session = s.session;
  let pivot = null;
  if (r.op.kind === "circular") {
    const made = pivotCommands(sceneOf(session), r.op);
    const next = run(session, made.command);
    if (next.message) return say(next.message);
    session = next;
    pivot = made.parts;
  }
  return { ...s, menu: null, op: null, tool: null, session: { ...session, message: null }, repeat: { op: r.op, pivot, chosen: null, help: kind === "linear" ? { phase: "copy", sep0: 0 } : kind === "copy" ? advanceHelp({ op: r.op, pivot, help: { phase: "copy", sep0: 0 } }).help! : null } };
}
const NO_REPEAT = "select a copy of a repeat, or what was repeated (a step of the repeat of the body is reopened from the History list)";
/** Open a repeat again to change its numbers (`in_257`): the same arrows and bubbles it was made with, with its numbers; Apply changes the copies, Cancel leaves them. */
function doRepeatEdit(s: AppState): AppState {
  const say = (message: string): AppState => ({ ...s, menu: null, session: { ...s.session, message } });
  if (s.repeat) return say("apply or cancel the repeat that is open first");
  const sc = sceneOf(s.session);
  const rec = patternOfAll(sc, selectionOf(s.session));
  if (!rec) return say(NO_REPEAT);
  const r = startOp(sc, rec.parts, rec.kind, viewAxes(s.cam));
  if (!r.ok) return say(r.why);
  const along = [0, 1, 2].find((i) => (rec.params[2 * i] ?? 1) > 1) ?? r.op.along ?? 0;
  return openRepeat(s, { ...r.op, parts: rec.parts, target: "plane", plane: rec.plane, patStart: [...rec.params], pat: rec.params.map(() => ""), along: along as 0 | 1 | 2, editPattern: rec.id });
}
/** Reopen the repeat of the body that is a step of the history (from its row in the History list). */
function doRepeatEditStep(s: AppState, id: string): AppState {
  const say = (message: string): AppState => ({ ...s, menu: null, session: { ...s.session, message } });
  if (s.repeat) return say("apply or cancel the repeat that is open first");
  const sc = sceneOf(s.session);
  const st = sc.steps.find((x) => x.id === id && x.type === "pattern");
  if (!st) return say("that step is not a repeat");
  const kind = st.params.mode === "circular" ? "circular" : "linear";
  const r = startOp(sc, [st.parts[0] && sc.parts[st.parts[0]] ? st.parts[0] : BODY_OBJECT], kind, viewAxes(s.cam)); // (the body the repeat was made of, when it was one of several)
  if (!r.ok) return say(r.why);
  const names = kind === "linear" ? ["nx", "dx", "ny", "dy", "nz", "dz"] : ["count", "angle", "axis", "px", "py", "pz"];
  const start = names.map((n, i) => Number(st.params[n] ?? r.op.patStart?.[i] ?? 0));
  const along = [0, 1, 2].find((i) => kind === "linear" && (start[2 * i] ?? 1) > 1) ?? r.op.along ?? 0;
  return openRepeat({ ...s, panel: null }, { ...r.op, patStart: start, pat: start.map(() => ""), along: along as 0 | 1 | 2, editStep: id });
}
/** Break a repeat of a drawn figure: its copies stay, as ordinary parts. */
function doRepeatBreak(s: AppState): AppState {
  const closed = { ...s, menu: null };
  const rec = patternOfAll(sceneOf(s.session), selectionOf(s.session));
  if (!rec) return { ...closed, session: { ...s.session, message: NO_REPEAT } };
  const next = run(s.session, { type: "breakPattern", id: rec.id });
  return next.message ? { ...closed, session: next } : { ...withSession(closed, { ...next, message: "repeat broken: its copies are ordinary parts now" }) };
}
/** The repeat state for an operation that is already made (the circular one needs its pivot parts). */
function openRepeat(s: AppState, op: Op): AppState {
  let session = s.session;
  let pivot = null;
  if (op.kind === "circular") {
    const made = pivotCommands(sceneOf(session), op);
    const next = run(session, made.command);
    if (next.message) return { ...s, menu: null, session: next };
    session = next;
    pivot = made.parts;
  }
  const r: Repeat = { op, pivot, chosen: null, help: null };
  return { ...s, menu: null, op: null, tool: null, session: { ...session, message: null }, repeat: advanceHelp(r) };
}
export function doRepeatApply(s: AppState): AppState {
  if (!s.repeat) return s;
  const cmd = repeatApply(sceneOf(s.session), s.repeat);
  if (!cmd) return { ...s, session: { ...s.session, message: "there is nothing to repeat yet: more than one copy" } };
  const next = run(s.session, cmd);
  if (next.message) return { ...s, session: next };
  return { ...s, session: { ...next, click: { ...next.click, selection: [] } }, repeat: null, op: null, spread: null, hoverPoint: null };
}
export function doRepeatCancel(s: AppState): AppState {
  if (!s.repeat) return s;
  const cmd = repeatCancel(sceneOf(s.session), s.repeat);
  const next = cmd ? run(s.session, cmd) : s.session;
  return { ...s, session: { ...next, message: null }, repeat: null, op: null };
}
/** A click on a ring of a circular repeat makes that axis the one the copies turn about (it does not need to be dragged). */
export function setRepeatAxis(s: AppState, axis: number): AppState {
  if (!s.repeat) return s;
  const pat = [...s.repeat.op.pat];
  pat[2] = String(axis);
  return { ...s, repeat: { ...s.repeat, op: { ...s.repeat.op, pat } } };
}

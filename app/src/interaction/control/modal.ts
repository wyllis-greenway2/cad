// Tools and operations that take typing: starting them, typed keys, finishing, cancelling; and the edits that do not depend on the pointer (delete, undo, relations).
import { isHard, isFixed, hardCopies } from "../hard.ts";
import type { Command } from "../../operation/commands.ts";
import type { Intent } from "../../shared/input.ts";
import { scene as sceneOf, selection as selectionOf, run, undoLast, redoLast, clearSelection, goToCursor } from "../session.ts";
import type { Session } from "../session.ts";
import { nearCommand } from "../suggest.ts";
import { actionsFor, measureAction } from "../actions.ts";
import { CONSTRAINT_ENTRIES, resolveEntry } from "../constraintlist.ts";
import type { ToolKind, Tool } from "../tools.ts";
import { gearFields, armTool, armModel, typeKey, finish, lineNext, gearTyped, editGearTool, editPlanetaryTool, meshGearTool, gearProblem, gearFix, variantOf, canHelix, armCam, camTyped, camProblemOf, editCamTool , gearChanged } from "../tools.ts";
import type { GearVariant } from "../tools.ts";
import { modelHeld, modelChanged, modelTyped, modelCommand, modelFix, modelBuilding, nextPartCommand, partIds, finishCommand } from "../modeltool.ts";
import type { ModelKind } from "../../operation/modelkinds.ts";
import { modelCutsBody } from "../../operation/modelkinds.ts";
import { keywayOf, meshTool } from "../keywaymesh.ts";
/** why the model of a tool is not made (the words of its refusal), or null */
const modelWhy = (sc: ReturnType<typeof sceneOf>, t: Tool): string | null => { const c = modelCommand(sc, t); return c.ok ? null : c.error; };
import type { CamKind, CamLaw, CamLayout } from "../../operation/cams.ts";
import { doMotionPlay, doCamFollow, doLink, doBodyPlay, doMakeTurn, doGlue, doUnglue, doStopTurning } from "./motion.ts";
import { gearOfPart, gearOfSelection } from "../../operation/gearscene.ts";
import { planetaryOfPart } from "../../operation/planetary.ts";
import type { OpKind } from "../operations.ts";
import { startOp, typeOp, autoOp, drawnFigure } from "../operations.ts";
import { pasteFigure, surfaceOf } from "../paste.ts";
import { faceSketchCommand } from "../offsetbody.ts";
import { placements } from "../../operation/repeat.ts";
import type { Part } from "../../operation/part.ts";
import { runOp } from "../runop.ts";
import { lookup, nextId, figuresOf } from "../../operation/scene.ts";
import type { Ref } from "../../shared/ref.ts";
import { worldRef } from "../../shared/ref.ts";
import { cutFillOf } from "../../operation/roundbody.ts";
import { planeOf } from "../objects.ts";
import { sketchOfEdge } from "../../operation/edgesource.ts";
import { sideOf, viewAxes, nearTolMm } from "../camera.ts";
import { seenIn } from "../picking.ts";
import { putMatesBack, setMateValue } from "../mate.ts";
import { mateStatus } from "../../operation/mates.ts";
import { moveOffset } from "../gizmo.ts";
import { normalOfPlane, roundOf } from "../../operation/part.ts";
import type { Plane } from "../../operation/part.ts";
import { doBodyEye, doDeleteBody, doHideBodies, selectedBodies } from "./bodies.ts";
import { doParamRemove } from "./history.ts";
import { constraintOwners } from "../panels.ts";
import type { AppState } from "./state.ts";
import { activeOp, movePivot, movePivotTo, gizmoOf } from "./handles.ts";
import { withPose, orientApply, moverOp, putMover } from "./pose.ts";
import { doPlaneNew, doSheetMode, doSheetVisible, doSheetDelete, doSheetMove, typedSection, placeSection, sectionNow } from "./section.ts";
import type { Vec3 } from "../../math/vec.ts";
import { sub } from "../../math/vec.ts";
import { loftStartTyped } from "../loft.ts";
import { frameAngles, frameOfAngles } from "../entry.ts";
import { typedNumber } from "../../shared/numbers.ts";
import { typedLength, lengthIn, units } from "../../shared/units.ts";
import { pivotCommands, patternCommand, patternValues, liveRepeat, repeatApply, repeatCancel, advanceHelp } from "../pattern.ts";
import type { Repeat } from "../pattern.ts";
import type { Op } from "../operations.ts";
import { BODY_OBJECT } from "../../compiler/body.ts";
import { setLineLength } from "../lengths.ts";
import { withSession, animateTo, planeView } from "./state.ts";
import { doSimilar, doSelectAll, doSelectBodies, doGroup, doUngroup, doCutBegin, applyCut } from "./select.ts";
import { groupsOf, membersOf } from "../../operation/groups.ts";

/** The sketch group (`in_229`): the tools that draw on a plane, and the operations that work in one. Every member follows the group's rules below, so a new tool is added here (the records name every kind, so the compiler asks which group it is in) and gets them all. */
const IS_SKETCH_TOOL: Record<ToolKind, true> = { rect: true, circle: true, polygon: true, line: true, arc: true, spline: true, cam: true, trim: true, gear: true, model: true };
const IS_SKETCH_OP: Record<OpKind, boolean> = { offset: true, extrude: false, pushpull: false, edge: false, move: false, rotate: false, scale: false, dimension: false, linear: false, circular: false, copy: false, hollow: false, revolve: false, loft: false, sweep: false, mirror: false };
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

/** The round object the selection is, for a model that fills it (`dec_hub_spoke`): a drawn circle, a round face of a body or a circular edge of one: its centre, the direction of its axis and its radius */
function fillOf(s: AppState): { center: Vec3; normal: Vec3; radius: number } | null {
  const sc = sceneOf(s.session), sel = selectionOf(s.session);
  if (sel.length !== 1) return null;
  const get = (r: Ref) => sc.parts[r];
  const r = roundOf(get, sel[0]!);
  if (!r) return null;
  const part = get(sel[0]!);
  let normal = r.normal ?? null;
  if (!normal && part && part.plane) { const pl = get(part.plane); if (pl?.kind === "plane") normal = normalOfPlane(pl); }
  return normal ? { center: r.center, normal, radius: r.radius } : null;
}
function beginTool(s: AppState, kind: ToolKind, now: number, over: Ref | null = null, variant: GearVariant = "gear", cam?: CamKind, law?: CamLaw, layout?: CamLayout, model?: ModelKind): AppState {
  if (s.tool?.kind === kind && s.tool.model?.kind === model && !s.tool.plane && variantOf(s.tool.gear) === (kind === "gear" ? variant : "gear") && s.tool.cam?.kind === cam && s.tool.cam?.law === law && s.tool.cam?.layout === layout) return { ...s, tool: null }; // pressing it again puts it away
  const make = (): Tool => (model ? armModel(model) : cam ? armCam(cam, law, layout) : armTool(kind, variant));
  if (model && modelCutsBody(model)) { // (cut spokes / a keyed hole into the round body that is selected: its outside, its bore and its thickness are kept, `dec_hub_spoke`; with none selected the box opens and waits for a click on one)
    const sc = sceneOf(s.session), sel = selectionOf(s.session), got = sel.length ? cutFillOf(sc, sel[0]!) : (model === "keyhole" ? "click the round body to key the hole of: a gear, a disc, a cylinder or a ring" : model === "keyfit" ? "click the round shaft to cut the keyway into" : "click the round body to cut spokes into: a gear, a disc, a cylinder or a ring");
    if (typeof got === "string") return { ...s, tool: { ...make(), plane: worldRef("XY") }, op: null, menu: null, session: { ...s.session, message: got } };
    return { ...s, tool: { ...make(), plane: worldRef("XY"), points: [got.center], cursor: got.center, sized: true, fill: { center: got.center, normal: got.normal, cut: got.cut } }, op: null, menu: null };
  }
  if (model === "keyshaft") { // (a round shaft that is selected is keyed where it stands: the keyway is cut into it, as the keyed fit does; with none selected a shaft is made, on a surface, `in_1283`)
    const sc = sceneOf(s.session), sel = selectionOf(s.session), got = sel.length ? cutFillOf(sc, sel[0]!) : "none";
    if (typeof got !== "string" && got.cut.bore === 0) return { ...s, tool: { ...armModel("keyfit"), plane: worldRef("XY"), points: [got.center], cursor: got.center, sized: true, fill: { center: got.center, normal: got.normal, cut: got.cut } }, op: null, menu: null };
  }
  const fill = model === "wheel" ? fillOf(s) : null;
  if (fill) return { ...s, tool: { ...make(), plane: worldRef("XY"), points: [fill.center], cursor: fill.center, sized: true, fill, model: { ...armModel("wheel").model!, typed: [String(Math.round(2 * fill.radius * 100) / 100), ...armModel("wheel").model!.typed.slice(1)], focus: true } }, op: null, menu: null }; // (a round object is selected: the wheel fills it, `dec_hub_spoke`)
  const armed: AppState = { ...s, tool: make(), op: null, menu: null };
  const { plane, onSketch } = sketchPlane(s, over);
  if (plane && onSketch) return animateTo({ ...armed, tool: { ...make(), plane: plane.ref, reveal: true } }, planeView(s.cam, plane, false), now);
  return facePlane(armed, over, now);
}
/** The operations that take several things clicked one after another, so that they begin on Enter or the check and not on the first thing that would do (`in_464`). */
const MANY = new Set<OpKind>(["loft", "sweep"]);
export const picksMany = (kind: OpKind): boolean => MANY.has(kind);

/** A flat face of the body selected for a revolve is first copied as a sketch on its own plane (the sketch stays, as a drawing of the face), and the revolve goes on from that figure (`dec_revolve_body_face`). */
function faceToFigure(s: AppState): AppState | { why: string } | null {
  const sc = sceneOf(s.session);
  const parts = selectionOf(s.session).map((r) => sc.parts[r]).filter((p): p is Part => !!p);
  const face = parts.length === 1 ? parts[0]! : null;
  if (!face || face.kind !== "plane" || face.origin !== "body") return null;
  const cmd = faceSketchCommand(sc, parts);
  if (!cmd) return { why: "this face cannot be turned: it must be flat, with edges that are lines and arcs" };
  const next = run(s.session, cmd);
  if (next.message) return { why: next.message };
  const made = Object.values(sceneOf(next).parts).filter((p) => p.kind === "face" && p.origin === "drawn" && !(p.ref in sc.parts)).map((p) => p.ref);
  if (!made.length) return { why: "this face cannot be turned: its copy as a sketch is not a closed figure" };
  return { ...s, session: { ...next, click: { ...next.click, selection: made } } };
}
function beginOp(s0: AppState, kind: OpKind, now = 0, over: Ref | null = null): AppState {
  let s = s0;
  if (kind === "revolve") {
    const f = faceToFigure(s);
    if (f && "why" in f) return { ...s, session: { ...s.session, message: f.why }, menu: null };
    if (f) s = f;
  }
  const r = startOp(sceneOf(s.session), selectionOf(s.session), kind, viewAxes(s.cam));
  // what it needs is not selected: it waits for what is clicked next, and says what that is (`in_464`)
  if (!r.ok) return { ...s, picking: s.repeat ? null : { kind, why: r.why }, session: { ...s.session, message: s.repeat ? r.why : `${r.why}: click it now (Esc to leave)` }, menu: null };
  const started: AppState = { ...s, picking: null, op: withPose(s, r.op), tool: null, menu: null, session: { ...s.session, message: r.op.kind === "revolve" ? `${r.op.revBeside ? "turning about a line beside the figure, out of its plane" : "turning about the longest straight line"}: click another line, a point or a face to move the orb there, or click the orb to turn it any way` : null } };
  return IS_SKETCH_OP[kind] ? facePlane(started, over, now) : started;
}
export function doBegin(s: AppState, name: Extract<Intent, { type: "begin" }>["name"], now = 0): AppState {
  return isSketchTool(name) ? beginTool(s, name, now) : beginOp(s, name, now);
}

/** Put a finished figure into the scene and hand back to normal selection with the figure selected. */
/** The tool stays on after a figure is made, ready on the same plane for the next, until a right click or the cancel icon at the top puts it away (`in_193`). */
const stays = (t: AppState["tool"]): AppState["tool"] => (t && t.kind !== "gear" && t.kind !== "cam" ? { ...armTool(t.kind, variantOf(t.gear)), ...(t.kind === "polygon" ? { typed: ["", t.typed[1]] as [string, string] } : {}), plane: t.plane, made: (t.made ?? 0) + 1, ...(t.reveal ? { reveal: true as const } : {}) } : null);

/** A model is made a part at a time (`dec_gear_models`): the first part now, and each next one when the kernel has answered for the one before (the page draws between, so the parts are seen going in) */
function startBuilding(s: AppState): AppState {
  const t = s.tool!, m = t.model!;
  // Update: the model that was made is taken back (nothing came after it) and made again from the numbers in the box; else this is a Create (`in_1259`)
  const redo = !!m.made && m.made.to !== undefined && s.session.history.cursor === m.made.to && s.session.history.commands.length === m.made.to;
  const sess = redo ? goToCursor(s.session, m.made!.from) : s.session;
  const g = modelBuilding(sceneOf(sess), t);
  if (!g.ok) return { ...s, session: { ...s.session, message: g.error } };
  const tool: Tool = { ...t, model: { ...m, made: { from: redo ? m.made!.from : sess.history.cursor, held: modelHeld(t) } } }; // (the box stays open on the model that is made)
  return makeNextPart({ ...s, session: sess, tool, resume: null, spread: null, building: g.value });
}
/** the model's box learns where its model ends in the history, once the last part is made (or the making stopped) */
const madeTo = (t: AppState["tool"], session: AppState["session"]): AppState["tool"] => (t?.model?.made ? { ...t, model: { ...t.model, made: { ...t.model.made, to: session.history.cursor } } } : t);
function makeNextPart(s: AppState): AppState {
  const b = s.building;
  if (!b) return s;
  const c = nextPartCommand(sceneOf(s.session), b);
  if (!c.ok) return { ...s, building: null, tool: madeTo(s.tool, s.session), session: { ...s.session, message: c.error } };
  const next = run(s.session, c.value);
  if (next.message) return { ...s, building: null, tool: madeTo(s.tool, next), session: next };
  const last = b.next + 1 >= b.build.parts.length;
  const grown: typeof b = { ...b, next: b.next + 1, ids: { ...b.ids, [b.build.parts[b.next]!.label]: partIds(c.value) } };
  const fin = last ? finishCommand(sceneOf(next), grown) : null; // (the whole model is made: how it moves is kept, and the parts that are fixed to one another are glued, so that Play can move it)
  const kept = fin ? run(next, fin) : next;
  const after = kept.message ? next : kept;
  return { ...s, session: { ...after, click: { ...next.click, selection: [] } }, building: last ? null : grown, tool: last ? madeTo(s.tool, after) : s.tool };
}
/** The kernel has answered: the next part of the model being made */
export function doBuildNext(s: AppState): AppState {
  return !s.building || s.session.outcome.kernel?.stale ? s : makeNextPart(s);
}

/** The tool a gear, a cam or a planetary set that has just been made or updated goes on as: the box open on it, with its numbers as they now are (`in_1259`); null when the record is not found */
function stayOpen(t: NonNullable<AppState["tool"]>, before: ReturnType<typeof sceneOf>, after: ReturnType<typeof sceneOf>): AppState["tool"] {
  if (t.kind === "gear" && t.gear?.planetary) { const id = t.gear.editing ?? nextId(before, "q"), set = after.planetaries?.find((p) => p.id === id); return set ? editPlanetaryTool(set) : null; }
  const id = t.gear?.editing ?? t.cam?.editing ?? nextId(before, "g"), rec = after.gears?.find((g) => g.id === id);
  return rec ? (rec.spec.cam ? editCamTool(rec) : editGearTool(rec)) : null;
}
export function commitFigure(s: AppState, fin: ReturnType<typeof finish>): AppState {
  if (!fin) {
    const fix = s.tool?.kind === "gear" ? gearFix(sceneOf(s.session), s.tool) : null; // (the number that spoils it is taken back to the nearest that makes a gear, and flashes, `in_690`)
    if (fix) return { ...s, tool: { ...fix.tool, gear: { ...fix.tool.gear!, bad: { field: fix.field, at: performance.now() } } }, session: { ...s.session, message: fix.message } };
    const why = s.tool?.kind === "gear" ? gearProblem(sceneOf(s.session), s.tool) : s.tool?.kind === "cam" ? camProblemOf(s.tool) : s.tool?.kind === "model" ? modelWhy(sceneOf(s.session), s.tool) : null; // (a gear, a rack or a partner that is not made says why, `in_580`)
    if (s.tool?.kind === "model") { const fx = modelFix(sceneOf(s.session), s.tool); if (fx) return { ...s, tool: { ...fx.tool, model: { ...fx.tool.model!, bad: { field: fx.field, at: performance.now() } } }, session: { ...s.session, message: fx.message } }; } // (the number that spoils the model is taken back to one that works, and flashes, `in_1240`)
    return why ? { ...s, session: { ...s.session, message: why } } : s;
  }
  if (s.tool?.kind === "model") return startBuilding(s);
  const next = run(s.session, fin.command);
  if (next.message) return { ...s, session: next };
  const sel = fin.select.filter((r) => r in sceneOf(next).parts);
  if ((s.tool?.kind === "gear" && !s.tool.cam) || s.tool?.kind === "cam") return { ...s, session: { ...next, click: { ...next.click, selection: sel } }, tool: stayOpen(s.tool, sceneOf(s.session), sceneOf(next)), resume: null, spread: null }; // (a gear that is made keeps its box open, as the Edit tool of that gear: Update changes it, Done lets go, `in_1259`)
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

/** The mover was being oriented (the sphere selected, `in_421`): Cancel puts its place and axes back as they were and goes back to the tool. */
function cancelOrient(s: AppState): AppState {
  const w = s.moverWas;
  const mo = moverOp(s);
  if (!mo || !w) return { ...s, moverSphere: false, moverWas: null };
  const { frame: _f, frameKept: _k, ...rest } = mo;
  let back = putMover({ ...s, moverSphere: false, moverWas: null }, { ...rest, pivot: w.pivot, ...(w.frame ? { frame: w.frame } : {}), ...(w.frameKept ? { frameKept: w.frameKept } : {}) } as Op);
  if (mo.kind === "circular" && s.repeat && !s.op && w.pivot) back = movePivotTo(back, w.pivot); // (a circular repeat's pivot point goes back where it was)
  return back;
}

export function doTyped(s: AppState, key: string): AppState {
  if (s.picking && !s.op && !s.tool && key === "Enter") return finishPicking(s); // (what is selected starts the operation that waits for it, `in_464`)
  if (s.moverSphere && key === "Enter") return orientApply(s); // (Apply: the mover stays as oriented, `in_421`, and while the part is selected, `in_439`)
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
  if (s.op && s.op.kind === "revolve" && key !== "Enter") {
    // a revolve has two numbers, the angle and the advance along the axis: Tab goes between them (`dec_spiral_extrude`)
    if (key === "Tab") return { ...s, op: { ...s.op, revField: s.op.revField === 1 ? 0 : 1 } };
    if (s.op.revField === 1) { const t = typeOp({ ...s.op, typed: s.op.advTyped ?? "" }, key); return { ...s, op: { ...s.op, advTyped: t.typed } }; }
  }
  if (s.op && s.op.kind === "edge" && (s.op.variable || s.op.twoDist) && s.op.vary && key !== "Enter") {
    // a fillet whose size changes along the edge: Tab goes between the size at its start and the size at its end (`in_406`)
    if (key === "Tab") { const order = s.op.twoDist ? [0, 1] : s.op.rimVary ? [0, 2, 3, 4] : [0, 1, 2, 3, 4]; return { ...s, op: { ...s.op, varField: order[(Math.max(0, order.indexOf(s.op.varField ?? 0)) + 1) % order.length] as 0 | 1 | 2 | 3 | 4 } }; }
    const slot = (["", "endTyped", "midTyped", "q1Typed", "q3Typed"] as const)[s.op.varField ?? 0];
    if (slot) { const typed = typeOp({ ...s.op, typed: s.op[slot] ?? "" }, key); return { ...s, op: { ...s.op, [slot]: typed.typed.replace(/^-/, "") } }; }
  }
  if (s.op) {
    if (key === "Enter") return doApply(s);
    const typed = typeOp(s.op, key);
    // a number typed for a move is the position along the axis since the move began: the step is what is missing (`in_230`)
    return { ...s, op: s.op.kind === "move" && s.op.typed === "" && typed.typed !== "" ? { ...typed, typedBase: moveOffset(sceneOf(s.session), s.op)[s.op.axis]! } : typed };
  }
  const t = s.tool;
  if (t && t.kind === "polygon" && !t.points.length && key !== "Enter") return { ...s, tool: typeKey(t, key) }; // (the polygon asks for its number of edges as soon as it is armed, `dec_polygon_tool`)
  if (!t || !t.plane || !t.points.length) return s;
  if (key !== "Enter") return { ...s, tool: typeKey(t, key) };
  if (s.building && t.kind === "model") return s; // (the parts are still being made)
  if (t.kind === "model" && t.model?.made && !modelChanged(t)) return { ...s, tool: null }; // (nothing was changed: Done, `in_1259`)
  if (((t.kind === "gear" && t.gear?.editing && !t.cam) || (t.kind === "cam" && t.cam?.editing)) && !gearChanged(sceneOf(s.session), t)) return { ...s, tool: null }; // (nothing was changed: Done only lets go, `in_919`)
  const next = t.kind === "line" && t.typed[0] !== "" ? lineNext(t) : null; // a typed length gives the line's end
  return commitFigure(s, finish(sceneOf(s.session), next ? { ...t, points: [t.points[0]!, next] } : t));
}

/** The text of a field of the value box changed: the operation's number, or a size of the figure being drawn. */
export function doEntry(s: AppState, field: number, text: string): AppState {
  if (!/^-?\d*\.?\d*$/.test(text)) return s;
  const mo = s.moverSphere ? moverOp(s) : null;
  if (mo && field >= 3 && field < 6) { // a number typed for the turn of the mover's axes about X, Y or Z (`in_434`, `in_440`)
    const n = typedNumber(text);
    if (n === null) return s;
    const angles = frameAngles(mo.frame);
    angles[field - 3] = n;
    const turned = angles.some((a) => Math.abs(a) > 1e-9);
    const { frame: _f, ...rest } = mo;
    return putMover(s, { ...rest, auto: false, ...(turned ? { frame: frameOfAngles(angles) } : {}) } as Op);
  }
  if (mo && field >= 0 && field < 3) { // a number typed for the mover's place: its world x, y or z (`in_418`)
    const n = typedLength(text);
    const g = gizmoOf(s);
    if (n === null || !g) return s;
    const at = g.centre.map((c, j) => (j === field ? n : c)) as unknown as Vec3;
    if (mo.kind === "circular" && s.repeat && !s.op) return movePivotTo(s, at); // (a circular repeat's pivot is a point of the drawing)
    const off = mo.kind === "move" ? moveOffset(sceneOf(s.session), mo) : ([0, 0, 0] as Vec3);
    return putMover(s, { ...mo, auto: false, pivot: sub(at, off) });
  }
  if (s.op?.kind === "revolve" && !s.moverSphere && field >= 10 && field < 13) { // the orb's place along one axis, typed on its arrow's bubble (`in_531`)
    const n = typedLength(text);
    const g = gizmoOf(s);
    if (n === null || !g || !s.op.pivot) return s;
    const d = (s.op.frame ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]])[field - 10]!; // (along the arrow as it stands: only that part of the place changes, `in_532`)
    const more = n - (s.op.pivot[0] * d[0] + s.op.pivot[1] * d[1] + s.op.pivot[2] * d[2]);
    return { ...s, op: { ...s.op, auto: false, pivot: [s.op.pivot[0] + more * d[0], s.op.pivot[1] + more * d[1], s.op.pivot[2] + more * d[2]] as Vec3 } };
  }
  if (s.op?.kind === "loft") { // the corner a sketch starts at, typed on its start dot's bubble (`in_533`)
    if (field >= 10) { const gaps = [...(s.op.loftGaps ?? [])]; gaps[field - 10] = text; return { ...s, op: { ...s.op, auto: false, loftGaps: Array.from(gaps, (g) => g ?? "") } }; } // (the distance to the next sketch, `in_535`)
    const n = typedNumber(text);
    return n === null ? s : { ...s, op: loftStartTyped(sceneOf(s.session), s.op, field, n) };
  }
  if (s.op?.kind === "mirror" && !s.moverSphere && s.op.mirrorAt && field >= 0 && field < 3) { // the number of the mirror plane's arrow: where the plane stands along that axis (`in_437`)
    const n = typedLength(text);
    if (n === null) return s;
    const at = [...s.op.mirrorAt] as unknown as [number, number, number];
    at[field] = n;
    return { ...s, op: { ...s.op, auto: false, mirrorAt: at, mirrorAxis: field as 0 | 1 | 2 } };
  }
  if (s.op && s.op.kind === "rotate" && s.op.frame && (s.op.target === "body" || s.op.target === "plane")) return { ...s, op: { ...s.op, auto: false, typed: text, rot: ["", "", ""] as [string, string, string] } }; // (a turn about the mover's own axis: one angle, `in_417`)
  if (s.op && s.op.kind === "rotate" && (s.op.target === "body" || s.op.target === "plane")) {
    const rot = [...s.op.rot] as [string, string, string];
    if (field >= 0 && field < 3) rot[field] = text;
    return { ...s, op: { ...s.op, rot, axis: (field as 0 | 1 | 2), value: null, typed: "" } };
  }
  if (s.op && s.op.kind === "revolve" && (field === 0 || field === 1)) return { ...s, op: { ...s.op, ...(field === 0 ? { typed: text } : { advTyped: text }), revField: field as 0 | 1 } };
  if (s.op && s.op.kind === "edge" && (s.op.variable || s.op.twoDist) && s.op.vary && (field >= 0 && field <= (s.op.twoDist ? 1 : 4))) { const slot = (["typed", "endTyped", "midTyped", "q1Typed", "q3Typed"] as const)[field]!; return { ...s, op: { ...s.op, [slot]: text, varField: field as 0 | 1 | 2 | 3 | 4 } }; }
  const mover = s.op ?? activeOp(s);
  if (mover && mover.kind === "move" && (mover.target === "body" || mover.target === "plane") && !s.repeat && !s.tool && field >= 0 && field < 3) {
    // the bubble on one of the move arrows (`in_215`): a distance typed along that axis; another axis starts again
    const same = mover.axis === field;
    return { ...s, op: { ...mover, auto: false, axis: field as 0 | 1 | 2, typed: text, typedBase: moveOffset(sceneOf(s.session), mover)[field]!, ...(same ? {} : { value: null }) } };
  }
  const sec = sectionNow(s);
  if (sec && !s.op && !s.repeat && !s.tool && field >= 0 && field <= 6) { // a number typed for the cross section plane (`in_395`)
    const n = field < 3 || field === 6 ? typedLength(text) : typedNumber(text); // (a place is a length, a turn is degrees)
    return n === null ? s : placeSection(s, ...(() => { const t = typedSection(sec, field, n); return [t.centre, t.n] as [Vec3, Vec3]; })());
  }
  if (s.op?.kind === "scale" && s.op.axes && field >= 0 && field <= 2) { // a number typed for one axis of a scale along axes (`in_390`)
    const n = typedNumber(text);
    if (n === null || !(n > 0)) return s;
    const axes: [number, number, number] = [...s.op.axes] as [number, number, number];
    axes[field] = n;
    return { ...s, op: { ...s.op, axes, axis: field as 0 | 1 | 2, value: n, typed: "" } };
  }
  if (s.repeat && !s.op) {
    // a number of the repeat that is open (the count and the spacing, or the count and the degrees); a pivot's x, y or z moves the pivot point (`in_384`)
    if (s.repeat.op.kind === "circular" && field >= 3 && field <= 5) { const n = typedLength(text); return n === null ? s : movePivot({ ...s, repeat: { ...s.repeat, chosen: `piv:${"xyz"[field - 3]}` } }, field - 3, n); }
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
  if (t.kind === "gear") return { ...s, tool: gearTyped(t, field, text) };
  if (t.kind === "cam" && t.cam) return { ...s, tool: camTyped(t, field, text) };
  if (t.kind === "model" && t.model) return { ...s, tool: { ...t, model: modelTyped(t.model, field, text) } };
  const typed: [string, string] = field === 0 ? [text, t.typed[1]] : [t.typed[0], text];
  return { ...s, tool: { ...t, typed, field: (field === 0 ? 0 : 1) as 0 | 1 } };
}

/** Esc lets go in steps: the menu, then an open badge, then the tool or operation, then the selection. */
export function doEscape(s: AppState): AppState {
  if (s.building) return { ...s, building: null, tool: madeTo(s.tool, s.session), session: { ...s.session, message: "stopped: the parts made so far stay (Undo takes them back, one at a time)" } }; // (a model made a part at a time)
  if (s.menu) return { ...s, menu: null };
  if (s.dragSelect) return { ...s, dragSelect: false, session: { ...s.session, message: null } };
  if (s.motion) return { ...s, motion: null }; // (a joint that is being played goes back to rest)
  if (s.awaiting) return { ...s, awaiting: null, session: { ...s.session, message: null } }; // (the item that waited for a selection is given up, `in_951`)
  if (s.picking && !s.op) return { ...s, picking: null, session: { ...s.session, message: null } }; // (the operation that was waiting for what to click is given up, `in_464`)
  if (s.moverSphere) return cancelOrient(s); // (the mover is put back as it was, `in_421`)
  if (sectionNow(s) && !s.tool && !s.op && !s.repeat) return { ...s, sectionLive: null, session: { ...s.session, click: { ...s.session.click, selection: [] }, message: null } }; // (the plane is let go, as a tool is put away: it stays as a plane in the part, `in_394`, `in_396`)
  if (s.tape && !s.tool && !s.op && !s.repeat && !s.cut) return { ...s, tape: false, session: { ...s.session, message: null } }; // (the tape measure is put away first, `in_338`)
  if (s.cut) return { ...s, cut: null, session: { ...s.session, message: null } };
  if (s.focus && !s.tool && !s.op) return { ...s, focus: null };
  if (s.box) return { ...s, box: null };
  if (s.repeat && !s.op) return doRepeatCancel(s); // (the repeat that is open is given up, as the pill's cross used to)
  if (s.op) return cancelOp(s);
  if (s.tool) return { ...s, tool: null, op: null, drag: null, gizmoHover: null };
  if (s.preview && !s.tool && !s.op) return { ...s, preview: null }; // (the toolpath preview is put away, `in_570`)
  if (s.adding) return { ...s, adding: false, session: { ...s.session, message: null } }; // (adding to the selection is left, what is selected stays; the next Esc clears it, `in_540`)
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
/** What is selected now is given to the operation that was waiting for it: it begins if that is what it needed; else it says what is missing and goes on waiting. */
/** What a dimmed item needs, said as what to do now: "select a gear" -> "Select a gear: click it". */
export const instruction = (why: string): string => { const t = why.charAt(0).toUpperCase() + why.slice(1); return /^select/i.test(why) ? `${t}: click it (Esc to leave)` : `${t} (Esc to leave)`; };
export function finishPicking(s: AppState, now = 0): AppState {
  if (!s.picking) return s;
  const r = startOp(sceneOf(s.session), selectionOf(s.session), s.picking.kind, viewAxes(s.cam));
  if (!r.ok) return { ...s, picking: { ...s.picking, why: r.why }, session: { ...s.session, message: `${r.why}: click it now (Esc to leave)` } };
  return beginOp({ ...s, picking: null }, s.picking.kind, now);
}

export function doApply(s: AppState): AppState {
  if (s.picking && !s.op && !s.tool) return finishPicking(s);
  if (s.repeat && !s.op) { const made = doRepeatApply(s); return made.repeat ? doRepeatCancel(made) : made; }
  if (s.op) {
    const c = commitOp(s); // (what was typed or dragged is made; a refusal keeps the operation open with its reason; with nothing to make, it only leaves)
    if (c !== s) return c;
    return { ...s, op: null, drag: null, gizmoHover: null, handleSel: null };
  }
  if (s.tool) return s.tool.plane && s.tool.points.length ? doTyped(s, "Enter") : { ...s, tool: null, resume: null, menu: null };
  return s;
}

export function doRunAction(s0: AppState, id: string, now = 0): AppState {
  // Delete in the ring: what is selected, or, with nothing selected, the thing the right click was on (`in_1281`)
  if (id === "delete" && s0.menu?.over && !selectionOf(s0.session).length) return doDelete({ ...s0, session: { ...s0.session, click: { ...s0.session.click, selection: [s0.menu.over] } } });
  const s = s0.awaiting && !id.startsWith("why:") ? { ...s0, awaiting: null } : s0; // (another choice gives up the one that waited, `in_951`)
  if (id.startsWith("say:")) return { ...s, session: { ...s.session, message: id.slice(4) } }; // (a dimmed row of the ⋯ list pressed: what is said, `in_541`)
  if (id.startsWith("why:")) { // a dimmed option of the menu pressed (`in_538`): it can be chosen; what it needs is said as what to select, and it runs by itself once that is selected (`in_951`)
    const find = (items: readonly { id: string; label: string; icon?: string; why: string | null; children?: readonly unknown[] }[]): { id: string; label: string; icon?: string; why: string | null } | undefined => { for (const it of items) { if (it.id === id.slice(4)) return it; const k = it.children ? find(it.children as never) : undefined; if (k) return k; } return undefined; };
    const hit = s.menu ? find(s.menu.items) : undefined;
    if (!hit?.why) return s;
    if (!/^select/i.test(hit.why)) return { ...s, session: { ...s.session, message: `${hit.label}: ${hit.why}` } }; // (nothing to select: the reason is said and the ring stays, as before)
    return { ...s, menu: null, picking: null, awaiting: { id: hit.id, label: hit.label, icon: hit.icon ?? hit.id, why: hit.why }, session: { ...s.session, message: `${hit.label}: ${instruction(hit.why)}` } };
  }
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
  if (id === "select:drag") return { ...closed, dragSelect: !s.dragSelect, session: { ...closed.session, message: s.dragSelect ? null : "drag across the model to select what is in the rectangle (it is for one drag)" } }; // (a finger's drag select, `in_1281`)
  if (id === "select:add") return { ...closed, adding: !s.adding, session: { ...closed.session, message: s.adding ? "adding is off" : "adding is on: a tap adds to the selection, or takes out what is selected" } }; // (the way to select several with a finger, `in_539`)
  if (id === "select:bodies") return doSelectBodies(closed);
  if (id === "undo") return doUndo(closed); // (undo, redo and delete are the Actions of the ring, `in_538`)
  if (id === "redo") return doRedo(closed);
  if (id === "select:faces" || id === "select:edges" || id === "select:vertices") return doSelectAll(closed, id.slice(7) as "faces" | "edges" | "vertices");
  if (id.startsWith("body:hard:")) { // the mark of a hard body pressed: it is soft again (`in_476`)
    const sc = sceneOf(closed.session);
    const p = sc.parts[id.slice(10) as never] as { kind?: string; id?: string } | undefined;
    return p?.kind === "body" && p.id ? { ...closed, session: { ...run(closed.session, { type: "setHard", body: p.id, on: false }), message: null } } : closed;
  }
  if (id === "body:hard") { // a body made hard or soft (`in_473`): all the bodies selected, to hard unless every one already is
    const sc = sceneOf(closed.session);
    const bodies = selectionOf(closed.session).filter((r) => sc.parts[r]?.kind === "body" && !!(sc.parts[r] as { id?: string }).id);
    if (!bodies.length) return { ...closed, session: { ...closed.session, message: "select a body" } };
    const on = !bodies.every((r) => isHard(sc, r));
    const session = run(closed.session, { type: "batch", commands: bodies.map((r): Command => ({ type: "setHard", body: (sc.parts[r] as { id: string }).id, on })) });
    return { ...closed, session: { ...session, message: on ? `hard: ${bodies.length === 1 ? "this body" : "these bodies"} will not go into other hard bodies when moved by hand` : null } };
  }
  if (id === "body:fixed") { // a body made fixed or free (`in_1049`): all the bodies selected, to fixed unless every one already is
    const sc = sceneOf(closed.session);
    const bodies = selectionOf(closed.session).filter((r) => sc.parts[r]?.kind === "body" && !!(sc.parts[r] as { id?: string }).id);
    if (!bodies.length) return { ...closed, session: { ...closed.session, message: "select a body" } };
    const on = !bodies.every((r) => isFixed(sc, r));
    const session = run(closed.session, { type: "batch", commands: bodies.map((r): Command => ({ type: "setFixed", body: (sc.parts[r] as { id: string }).id, on })) });
    return { ...closed, session: { ...session, message: on ? `fixed: ${bodies.length === 1 ? "this body" : "these bodies"} stay where they are when a moving body pushes on them` : null } };
  }
  if (id === "hard:clearance") { // the clearance of the whole model, round a few values (`in_473`)
    const sc = sceneOf(closed.session);
    const steps = units.system === "in" ? [0, 0.005, 0.01, 0.015, 0.02, 0.04].map((v) => lengthIn(v)) : [0, 0.1, 0.2, 0.3, 0.5, 1]; // (the same few small values, in the number system in use, `in_677`)
    const now = sc.clearance ?? 0;
    const next = steps.find((v) => v > now + 1e-9) ?? 0;
    return { ...closed, session: run(closed.session, { type: "setClearance", value: next }) };
  }
  if (id === "combine:parts") return doCutBegin(closed);
  if (id === "select:ungroup") return doUngroup(closed);
  if (id === "hollow:invert" && s.op?.kind === "hollow" && s.op.hollowMode && s.op.hollowMode !== "closed") return { ...s, op: { ...s.op, hollowMode: s.op.hollowMode === "keep" ? "open" : "keep" }, session: { ...s.session, message: null } };
  if (id === "view:section") return doPlaneNew(closed, true);
  if (id === "world:toggle") return { ...closed, worldHidden: !s.worldHidden };
  if (id.startsWith("sheet:delete:")) return doSheetDelete(closed, id.slice(13) as never);
  if (id.startsWith("sheet:visible:")) return doSheetVisible(closed, id.slice(14) as never);
  if (id.startsWith("body:play:")) return doBodyPlay(closed, id.slice(10) as Ref); // (the play button on a body that is hooked up to an animation, `in_876`)
  if (id.startsWith("body:eye:")) return doBodyEye(closed, id.slice(9) as Ref); // (the eye on a body, `dec_hidden_bodies`)
  if (id.startsWith("sheet:mode:")) return doSheetMode(closed, id.slice(11) as never);
  if (id === "sheet:move") return doSheetMove(closed);
  if (id === "view:hide") { // the selected bodies are hidden (the eye of a body is in the View menu, `in_697`)
    const sc = sceneOf(s.session);
    const refs = selectedBodies(sc, selectionOf(s.session));
    return refs.length ? doHideBodies(closed, refs, true) : { ...closed, session: { ...s.session, message: "select a body to hide" } };
  }
  if (id === "view:wireframe") return { ...closed, wireframe: !s.wireframe, session: { ...closed.session, message: s.wireframe ? "solid view" : "wireframe view: the faces of bodies are not drawn, to see what is inside" } };
  if (id === "tape:measure") return { ...closed, tape: !s.tape, panel: s.tape ? (s.panel === "measure" ? null : s.panel) : "measure", session: { ...closed.session, message: s.tape ? "tape measure off" : "tape measure on: select a face, or two (Shift adds the second), to see what they are to each other" } };
  if (id.startsWith("mate:stand:")) { // a mate is made standing (it puts itself back after a change) or not (`in_321`)
    const rel = sceneOf(s.session).relations.find((r) => r.id === id.slice(11));
    if (!rel?.params) return closed;
    const on = (rel.params.stand ?? 0) === 1;
    const next = run(s.session, { type: "batch", commands: [{ type: "removeRelation", id: rel.id }, { type: "addRelation", relation: { ...rel, params: { ...rel.params, stand: on ? 0 : 1 } } }] });
    return { ...closed, session: next.message ? next : { ...next, message: on ? "the mate is placed once: it no longer puts itself back" : "the mate is standing: it puts itself back after a change" } };
  }
  if (id.startsWith("mate:reapply:")) { // the mark of a mate that is not true was clicked: just that one is put back
    const back = putMatesBack(sceneOf(s.session), id.slice(13));
    if (!back) return { ...closed, session: { ...s.session, message: "that mate is true, or its faces are not found" } };
    const next = run(s.session, back.command);
    return { ...closed, session: next.message ? next : { ...next, message: "the mate was put back" } };
  }
  if (id === "view:constraints") return { ...closed, showAllConstraints: !s.showAllConstraints }; // (View: every constraint of the whole world, `in_1157`)
  if (id.startsWith("body:constraints:")) { const r = id.slice(17) as Ref; return { ...closed, bodyConstraints: s.bodyConstraints.includes(r) ? s.bodyConstraints.filter((x) => x !== r) : [...s.bodyConstraints, r] }; } // (the half eye, half lock icon on a body: all the constraints that have to do with it, `in_1157`)
  if (id.startsWith("tool:disc:")) return beginTool(closed, "cam", now, s.menu?.plane ?? null, "gear", "disc", id.slice(10) as CamLaw); // (a disc cam of this law, `dec_spline_and_cams`)
  if (id === "tool:geneva:assembled" || id === "tool:geneva:model") return beginTool(closed, "cam", now, s.menu?.plane ?? null, "gear", "geneva", undefined, id === "tool:geneva:model" ? "model" : "assembled"); // (a Geneva drive drawn in place, as a sketch or as bodies, `dec_geneva`)
  if (id === "tool:eccentric" || id === "tool:snail" || id === "tool:ratchet" || id === "tool:geneva" || id === "tool:linear") return beginTool(closed, "cam", now, s.menu?.plane ?? null, "gear", id === "tool:snail" ? "snail" : id === "tool:ratchet" ? "ratchet" : id === "tool:geneva" ? "geneva" : id === "tool:linear" ? "linear" : "eccentric"); // (an eccentric cam and a snail cam, `dec_spline_and_cams`)
  if (id === "tool:worm" || id === "tool:wormwheel") return beginTool(closed, "gear", now, s.menu?.plane ?? null, id === "tool:worm" ? "worm" : "wormwheel"); // (a worm, and the wheel for one, `in_608`)
  if (id === "tool:spiral") return beginTool(closed, "gear", now, s.menu?.plane ?? null, "spiral"); // (a spiral bevel gear, `dec_spiral_bevel_gears`)
  if (id === "tool:hypoid") { // a hypoid spiral bevel gear: the spiral tool with the offset field already holding a usual offset (3 mm; the tool refuses one too large for the gear, `in_1129`)
    const r = beginTool(closed, "gear", now, s.menu?.plane ?? null, "spiral");
    const g = r.tool?.gear;
    if (!r.tool || !g) return r;
    const i = gearFields(g).findIndex((f) => f.key === "hypoid");
    const typed = [...g.typed]; while (typed.length <= i) typed.push("");
    if (i >= 0) typed[i] = "3";
    return { ...r, tool: { ...r.tool, gear: { ...g, typed } } };
  }
  if (id === "tool:face") return beginTool(closed, "gear", now, s.menu?.plane ?? null, "face"); // (a face gear, `dec_crown_gear_set`)
  if (id === "tool:crown") return beginTool(closed, "gear", now, s.menu?.plane ?? null, "crown"); // (a crown gear, `dec_crown_gears`)
  if (id === "tool:bevel") return beginTool(closed, "gear", now, s.menu?.plane ?? null, "bevel"); // (a straight bevel gear, an approximation, `in_735`)
  if (id.startsWith("model:")) return beginTool(closed, "model", now, s.menu?.plane ?? null, "gear", undefined, undefined, undefined, id.slice(6) as ModelKind); // (a gear assembly model: the first click is its middle, `dec_gear_models`)
  if (id === "tool:planetary") return beginTool(closed, "gear", now, s.menu?.plane ?? null, "planetary"); // (a planetary gear set, `dec_planetary_gears`)
  if (id === "tool:ring") return beginTool(closed, "gear", now, s.menu?.plane ?? null, "ring"); // (a gear with its teeth pointing in)
  if (id === "tool:rack") return beginTool(closed, "gear", now, s.menu?.plane ?? null, "rack");
  if (id === "tool:clock" || id === "tool:clockring" || id === "tool:clockrack") return beginTool(closed, "gear", now, s.menu?.plane ?? null, id === "tool:clock" ? "clock" : id === "tool:clockring" ? "clockring" : "clockrack"); // (a cycloidal clock gear, `in_585`)
  if (id === "tool:sprocket" || id === "tool:isosprocket") return beginTool(closed, "gear", now, s.menu?.plane ?? null, id === "tool:sprocket" ? "sprocket" : "isosprocket"); // (a roller chain sprocket, `in_584`)
  if (id === "tool:gt2" || id === "tool:gt3" || id === "tool:htd5" || id === "tool:htd8") return beginTool(closed, "gear", now, s.menu?.plane ?? null, id === "tool:gt2" ? "gt2" : id === "tool:gt3" ? "gt3" : id === "tool:htd8" ? "htd8" : "htd5"); // (a timing pulley, `in_583`)
  if (id === "keyway:mesh") { // the shaft that fits a keyed hole that is selected, or the hub that fits a shaft (`dec_keyway_maker`, `in_1279`)
    const sc = sceneOf(s.session), rec = selectionOf(s.session).map((r) => keywayOf(sc, r)).find((k) => !!k);
    return rec ? { ...closed, tool: meshTool(rec), op: null } : { ...closed, session: { ...s.session, message: "select a keyed hole or a keyed shaft made with the keyway maker first" } };
  }
  if (id === "gear:mesh" || id === "gear:meshrack" || id === "gear:meshring") { // a gear, a rack or a ring round it, that meshes with the one selected (`in_579`, `in_686`)
    const sc = sceneOf(s.session);
    const rec = selectionOf(s.session).map((r) => gearOfSelection(sc, r)).find((g) => !!g);
    return rec ? { ...closed, tool: meshGearTool(rec, id === "gear:meshrack", id === "gear:meshring"), op: null } : { ...closed, session: { ...s.session, message: "select a gear first" } };
  }
  if (id === "motion:pivot") return doMakeTurn(closed); // (any body made to turn about an axis of its own, `in_912`)
  if (id === "motion:unpivot") return doStopTurning(closed);
  if (id === "motion:glue") return doGlue(closed);
  if (id === "motion:unglue") return doUnglue(closed);
  if (id === "motion:link") return doLink(closed); // (a ratio between two joints, `in_838`)
  if (id === "cam:follow") return doCamFollow(closed); // (the rod that rides the cam, `dec_mechanism_motion` stage 3)
  if (id === "motion:play") return doMotionPlay(closed); // (the joint of the selected body played, `dec_mechanism_motion`)
  if (id === "cam:edit") { // the numbers of the cam or the ratchet that is selected, in the number box (`in_768`)
    const sc = sceneOf(s.session);
    const rec = selectionOf(s.session).map((r) => gearOfPart(sc, r)).find((g) => !!g?.spec.cam);
    return rec ? { ...closed, tool: editCamTool(rec), op: null } : { ...closed, session: { ...s.session, message: "select a cam or a ratchet first" } };
  }
  if (id === "gear:helix") { // the number box of the selected gear, at its Helix field (`in_693`: the helix is a number of every plain gear, 0 for none)
    const sc = sceneOf(s.session);
    const rec = selectionOf(s.session).map((r) => gearOfSelection(sc, r)).find((g) => !!g);
    if (!rec) return { ...closed, session: { ...s.session, message: "select a gear first" } };
    if (!canHelix(rec.spec)) return { ...closed, session: { ...s.session, message: "a helix can be put on a plain gear (not yet on a pulley, a sprocket, a clock gear or a worm)" } };
    const open = editGearTool(rec, "helix");
    const at = gearFields(open.gear!).findIndex((f) => f.key === "helix");
    return { ...closed, tool: rec.spec.helix === undefined && at >= 0 ? gearTyped(open, at, "15") : open, op: null }; // (a gear with no helix is given 15 degrees at once, and the box opens on the number, `in_771`)
  }
  if (id === "gear:edit") { // the numbers of the gear that is selected, in the number box (`in_577`); a gear of a planetary set opens the whole set (`dec_planetary_gears`)
    const sc = sceneOf(s.session);
    const set = selectionOf(s.session).map((r) => planetaryOfPart(sc, r)).find((p) => !!p);
    if (set) return { ...closed, tool: editPlanetaryTool(set), op: null };
    const rec = selectionOf(s.session).map((r) => gearOfSelection(sc, r)).find((g) => !!g);
    return rec ? { ...closed, tool: rec.spec.cam ? editCamTool(rec) : editGearTool(rec), op: null } : { ...closed, session: { ...s.session, message: "select a gear first" } };
  }
  if (id.startsWith("tool:")) return beginTool(closed, id.slice(5) as ToolKind, now, s.menu?.plane ?? null);
  if (s.repeat && (id === "op:linear" || id === "op:circular") && !s.repeat.op.editStep && !s.repeat.op.editPattern) return doRepeatSwitch(closed, id === "op:linear" ? "linear" : "circular"); // (a repeat that is open changes kind, `in_382`)
  if (id === "op:copy" || id === "clipboard:copy") return doCopyCapture(closed);
  if (id === "clipboard:paste") return doPaste(closed);
  if (id === "op:linear" || id === "op:circular") return doRepeatBegin(closed, id.slice(3) as "linear" | "circular");
  if (id.startsWith("op:")) return beginOp(closed, id.slice(3) as OpKind, now, s.menu?.plane ?? null);
  if (id.startsWith("near:")) {
    const cmd = nearCommand(sceneOf(s.session), selectionOf(s.session), id, nearTolMm(s.cam), seenIn(s.cam, sceneOf(s.session), { w: 800, h: 600 }));
    return cmd ? { ...withSession(s, run(s.session, cmd)), menu: null } : closed;
  }
  const acts = actionsFor(sceneOf(s.session), selectionOf(s.session));
  const entry = CONSTRAINT_ENTRIES.find((e) => e.id === id); // (an entry of the constraints list stands for the action the selection fits, `in_975`)
  const a = entry ? resolveEntry(entry, acts) : acts.find((x) => x.id === id);
  if (!a || !a.enabled) return closed;
  const done = run(s.session, a.run());
  return { ...withSession(s, a.id.startsWith("mate:") ? swapped(s, a, done) : done), menu: null };
}
/**
 * A mate of two bodies moves the first face selected to the second (`in_229`). When that is refused because the first body is held where it is, the same mate is tried the other way round, the second body moving to the first,
 * and only when neither can move is it refused (`in_1109`, the swap): the faces' bodies are said, so it is clear which one moved. A mate with a world plane has nothing to swap.
 */
function swapped(s: AppState, a: ReturnType<typeof actionsFor>[number], first: Session): Session {
  const sc = sceneOf(s.session);
  const sel = selectionOf(s.session);
  const refused = first.history === s.session.history && !!first.message && !first.already; // (nothing was made, and it says why)
  if (!refused || a.parts.length !== 2 || sel.length !== 2 || a.parts.some((r) => sc.parts[r]?.origin === "world")) return first;
  const back = actionsFor(sc, [...sel].reverse()).find((x) => x.id === a.id && x.enabled);
  if (!back) return first;
  const other = run(s.session, back.run());
  const bodyOf = (r: Ref): string => { const p = sc.parts[r] as { of?: string; id?: string } | undefined; return p?.of ? `${(sc.parts[p.of as Ref] as { id?: string } | undefined)?.id ?? "the body"}` : "the body"; };
  if (other.history !== s.session.history && !other.message) return { ...other, message: `${bodyOf(a.parts[0]!)} is held where it is, so ${bodyOf(a.parts[1]!)} moved to it` };
  return { ...first, message: `${first.message}; the other way round (${bodyOf(a.parts[1]!)} moving to ${bodyOf(a.parts[0]!)}) it cannot be done either` };
}
export function doDelete(s: AppState): AppState {
  if (s.tool || s.op || s.repeat) return s;
  const a = actionsFor(sceneOf(s.session), selectionOf(s.session)).find((x) => x.id === "delete");
  return a ? { ...withSession(s, run(s.session, a.run())), menu: null } : s;
}
/** The pivot parts of a circular repeat (a point at the middle, the pivot point and the line between) that are in the scene while no repeat is open: they are only there for the setting up, so history that lands on them goes on past (`in_384`: undoing an applied repeat left the line). */
const strayPivot = (s: AppState): boolean => !s.repeat && Object.keys(sceneOf(s.session).parts).some((r) => /\.rp$/.test(r));
const settle = (s: AppState, step: (x: Session) => Session): AppState => { let next = s; for (let k = 0; k < 200 && strayPivot(next); k++) next = withSession(next, step(next.session)); return next; };
export const doUndo = (s: AppState): AppState => {
  if (s.repeat) return { ...s, menu: null, session: { ...s.session, message: "apply or cancel the repeat that is open first" } };
  // an operation that is open and has made nothing yet (an arrow was dragged, nothing was applied, or it was refused) is not on the history: the first undo puts it away, it does not undo the step before (`in_229`)
  if (s.op && !s.op.made && !s.op.auto) return { ...s, menu: null, op: null, drag: null, gizmoHover: null, session: { ...s.session, message: null, conflict: null } };
  return settle({ ...withSession(s, undoLast(s.session)), menu: null, op: s.op?.made ? null : s.op }, undoLast);
};
export const doRedo = (s: AppState): AppState => s.repeat ? { ...s, menu: null, session: { ...s.session, message: "apply or cancel the repeat that is open first" } } : settle({ ...withSession(s, redoLast(s.session)), menu: null, op: s.op?.made ? null : s.op }, redoLast);

/** A constraint shown on a selected part: open or close it, delete it, lock or unlock its number, give it a new number, or lock the measure of the selection. */
export function doRelation(s: AppState, i: Extract<Intent, { type: "relation" }>): AppState {
  const sc = sceneOf(s.session);
  if (i.act === "focus") {
    // a mate that is not true is put back by a click on its bubble (`in_338`); any other bubble opens, and a second click closes it
    const m = i.id ? mateStatus(sc).find((x) => x.id === i.id) : undefined;
    if (m && m.state === "off") return doRunAction(s, `mate:reapply:${m.id}`);
    return { ...s, focus: i.id === s.focus ? null : i.id };
  }
  if (i.act === "measure") {
    const sel = selectionOf(s.session);
    const named = i.id && i.id.startsWith("measure:") ? i.id.slice(8) : null; // (the arc's angle, beside its radius: `in_463`)
    const a = named ? actionsFor(sc, sel).find((x) => x.id === named && x.dimensional && x.enabled) : measureAction(actionsFor(sc, sel), (x) => x.enabled);
    if (a) return i.value !== undefined && i.value > 0 ? withSession(s, run(s.session, a.run(i.value), { watchAll: true })) : s; // (a sketch the body was made from: a size the steps cannot take is refused)
    // a line of the body: its length is made by pushing or pulling the face at its end
    const cmd = sel.length === 1 && i.value !== undefined ? setLineLength(sc, sel[0]!, i.value) : null;
    return cmd ? withSession({ ...s, op: null }, run(s.session, cmd)) : s;
  }
  const rel = i.id ? sc.relations.find((r) => r.id === i.id) : undefined;
  if (!rel) return s;
  if (i.act === "remove") return { ...withSession(s, run(s.session, { type: "removeRelation", id: rel.id })), focus: null };
  if (i.act === "set" && rel.kind === "mate") { // a mate's number, typed over on its bubble: the mate is made again at it (`in_338`)
    const cmd = i.value !== undefined ? setMateValue(sc, rel.id, i.value) : null;
    return cmd ? withSession(s, run(s.session, cmd)) : s;
  }
  if (i.act === "set") return rel.value !== undefined && i.value !== undefined && i.value > 0 ? withSession(s, run(s.session, { type: "setRelationValue", id: rel.id, value: i.value, locked: true }, { watchAll: true })) : s;
  if (rel.value === undefined) return s;
  const action = actionsFor(sc, rel.parts).find((x) => x.id === rel.kind && x.dimensional);
  const value = rel.locked === false ? (action?.measure() ?? rel.value) : rel.value; // locking takes the value it measures now
  return withSession(s, run(s.session, { type: "setRelationValue", id: rel.id, value, locked: rel.locked === false }));
}

/** The ⋯ menu's lists: choosing one opens it, choosing it again closes it. */
export const doPanel = (s: AppState, name: "bodies" | "history" | "groups" | "sketches" | "parameters" | "constraints" | "measure"): AppState => ({ ...s, panel: s.panel === name ? null : name, menu: null });
/** A row of the open list: a body is selected, a step is taken out of the history. */
/** Choose a sketch (`in_621`): its drawn parts (the outer lines or the circle, and the figures inside it) are selected and it is shown in the picture, so it can be looked at, measured and held by constraints as any drawn figure. `id` is `fig:<step>:<which figure of the step>`, or the face of a figure no step has taken. */
function doSketchPick(s: AppState, id: string): AppState {
  const sc = sceneOf(s.session);
  let parts: Ref[] = [];
  let show: string | null = null;
  if (id.startsWith("fig:")) {
    const [, stepId, k] = id.split(":");
    const st = sc.steps.find((x) => x.id === stepId);
    const fig = st ? figuresOf(st).filter((f) => f.outer.length)[Number(k)] : undefined;
    if (!st || !fig) return s;
    parts = [...fig.outer, ...fig.holes.flat()];
    show = st.id;
  } else {
    const f = sc.parts[id];
    if (f?.kind !== "face") return s;
    parts = f.disk ? [f.disk, ...(f.holes ?? [])] : [...f.loop];
  }
  parts = parts.filter((q) => q in sc.parts);
  return withSession({ ...s, showSketch: show ?? s.showSketch, menu: null }, { ...s.session, click: { ...s.session.click, selection: parts }, message: null });
}
export function doPanelRow(s: AppState, id: string, act: "select" | "remove" | "sketch" | "edit" | "hide" | "pick"): AppState {
  if (act === "pick") return doSketchPick(s, id);
  if (act === "remove" && s.panel === "parameters") return doParamRemove(s, id); // (the cross of a parameter, `dec_named_parameters`)
  if (act === "remove" && s.panel === "constraints") return withSession(s, run(s.session, { type: "removeRelation", id })); // (the cross of a constraint)
  if (act === "select" && (s.panel === "constraints" || id.startsWith("rels:"))) { // (a constraint, or the constraints of a step: the parts they tie are selected)
    const sc = sceneOf(s.session);
    const rels = id.startsWith("rels:") ? sc.relations.filter((rel) => constraintOwners(sc).get(rel.id) === id.slice(5)) : sc.relations.filter((rel) => rel.id === id);
    const parts = [...new Set(rels.flatMap((rel) => rel.parts))].filter((q) => q in sc.parts);
    return withSession(s, { ...s.session, click: { ...s.session.click, selection: parts }, message: null });
  }
  if (act === "hide") return doBodyEye(s, id as Ref); // (the eye of a row of the Bodies list, `dec_hidden_bodies`)
  if (act === "remove" && sceneOf(s.session).parts[id]?.kind === "body") return doDeleteBody(s, id as Ref); // (the cross of a row of the Bodies list: the body is deleted)
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
/** A quick copy (`in_386`, Ctrl+C / Ctrl+V): one copy beside the thing, at the distance a repeat starts with, made at once with nothing to set; the arrows of a repeat are there to change it. */
function doQuickCopy(s: AppState): AppState {
  const say = (message: string): AppState => ({ ...s, menu: null, session: { ...s.session, message } });
  if (s.repeat) return say("apply or cancel the repeat that is open first");
  const sc = sceneOf(s.session);
  const r = startOp(sc, selectionOf(s.session), "copy", viewAxes(s.cam));
  if (!r.ok) return say(r.why);
  const cmd = patternCommand(sc, r.op);
  if (!cmd) return say("nothing to copy");
  const next = run(s.session, cmd);
  return { ...s, menu: null, op: null, tool: null, session: next.message ? next : { ...next, message: null } };
}
/** Ctrl+C and the menu's Copy (`in_435`): what is selected is captured, nothing is made; Ctrl+V pastes it. */
function doCopyCapture(s: AppState): AppState {
  const sel = selectionOf(s.session);
  if (!sel.length) return { ...s, menu: null, session: { ...s.session, message: "select something to copy" } };
  const r = startOp(sceneOf(s.session), sel, "copy", viewAxes(s.cam));
  if (!r.ok) return { ...s, menu: null, session: { ...s.session, message: r.why } };
  return { ...s, menu: null, clipboard: [...sel], session: { ...s.session, message: "copied: Ctrl+V pastes it beside the original, or onto a face or sketch plane you select first" } };
}
/** Ctrl+V and the menu's Paste (`in_435`): a drawn figure is pasted as parts of its own, at the distance a copy begins with, or onto the surface that is selected; a body is copied beside itself. */
function doPaste(s: AppState): AppState {
  const say = (message: string): AppState => ({ ...s, menu: null, session: { ...s.session, message } });
  if (!s.clipboard?.length) return say("nothing is copied: select something and press Ctrl+C");
  if (s.repeat) return say("apply or cancel the repeat that is open first");
  const sc = sceneOf(s.session);
  const parts = s.clipboard.map((r) => sc.parts[r]).filter((p): p is Part => !!p);
  if (!parts.length) return say("what was copied is gone");
  const drawn = drawnFigure(sc, parts);
  if (!drawn.length) { // a body: a copy beside it (its own, as before)
    return doQuickCopy({ ...s, session: { ...s.session, click: { ...s.session.click, selection: [...s.clipboard] } } });
  }
  const r = startOp(sc, drawn, "copy", viewAxes(s.cam));
  const move = r.ok ? placements("linear", patternValues(r.op))[0]?.move ?? [0, 0, 0] : ([0, 0, 0] as Vec3);
  // a surface selected (a face, a sketch's plane) takes the paste, unless it is the thing copied itself
  const sel = selectionOf(s.session);
  const here = sel.length === 1 && !s.clipboard.includes(sel[0]!) && !drawn.includes(sel[0]!) ? surfaceOf(sc, sel[0]!) : null;
  const made = pasteFigure(sc, drawn, move as Vec3, here);
  if (!made) return say("nothing to paste");
  const next = run(s.session, made.command);
  if (next.message) return say(next.message);
  return { ...s, menu: null, op: null, tool: null, session: { ...next, message: null, click: { ...next.click, selection: made.made.filter((q) => q in sceneOf(next).parts) } } };
}
function doRepeatBegin(s: AppState, kind: "linear" | "circular"): AppState {
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
  return { ...s, menu: null, op: null, tool: null, session: { ...session, message: null }, repeat: { op: r.op, pivot, chosen: kind === "linear" ? `cnt:${"xyz"[r.op.along ?? 0]}` : null, help: null } };
}
/** Change an open repeat to the other kind (`in_382`): what was set for the one it leaves is kept, so coming back finds it as it was; a circular one's pivot parts go and come back with it. */
function doRepeatSwitch(s: AppState, to: "linear" | "circular"): AppState {
  const r = s.repeat!;
  const from = r.op.kind === "circular" ? "circular" : "linear";
  if (from === to) return s;
  const sc = sceneOf(s.session);
  const left = liveRepeat(sc, r); // (the pivot as it is now)
  const stash = { ...r.stash, [from]: left };
  let op = stash[to];
  if (!op) {
    const st = startOp(sc, left.target === "plane" ? left.parts : selectionOf(s.session), to, viewAxes(s.cam));
    if (!st.ok) return { ...s, session: { ...s.session, message: st.why } };
    op = st.op;
  }
  let session = s.session;
  if (r.pivot) session = run(session, { type: "deleteParts", refs: [r.pivot.centre, r.pivot.point, r.pivot.line].filter((x) => x in sceneOf(session).parts) });
  let pivot = null;
  if (to === "circular") {
    const made = pivotCommands(sceneOf(session), op);
    const next = run(session, made.command);
    if (next.message) return { ...s, session: next };
    session = next;
    pivot = made.parts;
  }
  return { ...s, session: { ...session, message: null }, handleSel: null, repeat: { op, pivot, chosen: null, help: null, stash } };
}
/** Reopen the repeat of the body that is a step of the history (from its row in the History list). */
function doRepeatEditStep(s: AppState, id: string): AppState {
  const say = (message: string): AppState => ({ ...s, menu: null, session: { ...s.session, message } });
  if (s.repeat) return say("apply or cancel the repeat that is open first");
  const sc = sceneOf(s.session);
  const st = sc.steps.find((x) => x.id === id && x.type === "pattern");
  if (!st) return say("that step is not a repeat");
  if (st.params.mode === "path") return say("select the body and press Path repeat to change this one"); // (a repeat along a path has its own rules, `dec_path_repeat`)
  const kind = st.params.mode === "circular" ? "circular" : "linear";
  const r = startOp(sc, [st.parts[0] && sc.parts[st.parts[0]] ? st.parts[0] : BODY_OBJECT], kind, viewAxes(s.cam)); // (the body the repeat was made of, when it was one of several)
  if (!r.ok) return say(r.why);
  const names = kind === "linear" ? ["nx", "dx", "ny", "dy", "nz", "dz"] : ["count", "angle", "axis", "px", "py", "pz"];
  const start = names.map((n, i) => Number(st.params[n] ?? r.op.patStart?.[i] ?? 0));
  const along = [0, 1, 2].find((i) => kind === "linear" && (start[2 * i] ?? 1) > 1) ?? r.op.along ?? 0;
  return openRepeat({ ...s, panel: null }, { ...r.op, patStart: start, pat: start.map(() => ""), along: along as 0 | 1 | 2, editStep: id });
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
  const hard = hardCopies(sceneOf(s.session), liveRepeat(sceneOf(s.session), s.repeat)); // (copies of hard bodies that would run into hard bodies are refused, `in_475`)
  if (hard) return { ...s, session: { ...s.session, message: hard.why } };
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

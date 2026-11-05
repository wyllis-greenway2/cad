// Dragging the helper handles (`in_117`): the arrows of Move, the double arrow of Fillet / chamfer, the curved arrows and the centre of Rotate. A drag that starts on a handle
// works the handle and does not turn the camera; letting go does it (one step, one undo) and leaves the operation open for another drag. Esc or Enter ends it.
import type { Intent } from "../../shared/input.ts";
import type { Vec3 } from "../../math/vec.ts";
import { scene as sceneOf, selection as selectionOf, run, undoLast } from "../session.ts";
import type { Session } from "../session.ts";
import type { Command } from "../../operation/commands.ts";
import type { Ref } from "../../shared/ref.ts";
import { snapOnPlane } from "../tools.ts";
import { opCommand, autoOp, isLive } from "../operations.ts";
import type { Op } from "../operations.ts";
import { gizmoFor, hasGizmo, hitHandle, startDrag, dragTo, followed } from "../gizmo.ts";
import type { Gizmo } from "../gizmo.ts";
import { candidatesAt } from "../picking.ts";
import { projector } from "../camera.ts";
import { lookup } from "../../operation/scene.ts";
import { pointOf } from "../../operation/part.ts";
import { doOrbit } from "./viewing.ts";
import type { AppState, Env } from "./state.ts";
import { pickOpts } from "./state.ts";

/** The operation whose handles are up: the one you started (menu or key), else the one the selection brings up by itself (a figure's pull arrow, a face's push / pull, an edge's double arrow, the body's move arrows). */
export function activeOp(s: AppState): Op | null {
  if (s.op) return hasGizmo(s.op.kind) ? s.op : null;
  return autoOp(sceneOf(s.session), selectionOf(s.session));
}

/** The handles to show and work, or null. */
export function gizmoOf(s: AppState): Gizmo | null {
  const op = activeOp(s);
  const g = op ? gizmoFor(sceneOf(s.session), op, s.cam) : null;
  // the arrow of a push / pull or an extrude stands where the face is now: out by the value so far (it stays there when you let go, until the operation ends)
  return g && op && op.normal && (op.kind === "pushpull" || op.kind === "extrude") ? followed(g, { dir: op.normal, kind: "double", id: "pull" }, op.value) : g;
}

export function doGizmoHover(s: AppState, x: number, y: number, env: Env): AppState {
  const g = gizmoOf(s);
  if (!g) return s.gizmoHover === null ? s : { ...s, gizmoHover: null };
  const h = hitHandle(g, projector(s.cam, env.w, env.h).project, x, y);
  const id = h?.id ?? null;
  return id === s.gizmoHover ? s : { ...s, gizmoHover: id };
}

/** The pointer moves while the button is down: it works a handle if the drag began on one, else it turns the camera. */
export function doDragMove(s: AppState, i: Extract<Intent, { type: "orbit" }>, env: Env): AppState {
  const pr = projector(s.cam, env.w, env.h);
  if (!s.drag) {
    const g = gizmoOf(s);
    if (!g) return orbitOrCorner(s, i, env);
    // the first move of a drag: where did it begin? (the pointer is at (x, y) now and has moved (dx, dy) since the press)
    const h = hitHandle(g, pr.project, i.x - i.dx, i.y - i.dy);
    const d = h ? startDrag(g, h, pr.ray(i.x - i.dx, i.y - i.dy), s.cam) : null;
    if (!d) return orbitOrCorner(s, i, env); // not on a handle: this drag turns the camera (or drags a corner of a drawing)
    // an operation whose arrow showed up by itself stays up after the drag (like one you started): push / pull, extrude, fillet / chamfer go on until you click away; a body's move arrows end with the drag
    const started = s.op ?? activeOp(s)!;
    const op: Op = started.kind === "pushpull" || started.kind === "extrude" || started.kind === "edge" ? { ...started, auto: false } : started;
    s = { ...s, op, drag: { handle: d, base: isLive(op) ? op.value ?? 0 : 0 }, gizmoHover: h!.id }; // a handle that showed up by itself becomes the operation being worked
  }
  if ("corner" in s.drag!) return moveCorner(s, i, env);
  if (!("handle" in s.drag!) || !s.op) return doOrbit(s, i);
  const r = dragTo(s.drag.handle, pr.ray(i.x, i.y));
  if (!r) return s;
  if ("value" in r) return { ...s, op: { ...s.op, value: Math.round((s.drag.base + r.value) * 1e6) / 1e6, typed: "", rot: ["", "", ""] as [string, string, string], ...(s.drag.handle.axis !== null ? { axis: s.drag.handle.axis } : {}) } };
  return { ...s, op: { ...s.op, pivot: snapPivot(s, r.pivot, i.x, i.y, env) } };
}

/** A drag that starts on a corner of a drawing drags the corner (the solver keeps the relations: a rectangle stays a rectangle); anywhere else it turns the camera. */
function orbitOrCorner(s: AppState, i: Extract<Intent, { type: "orbit" }>, env: Env): AppState {
  if (!s.tool && !s.op) {
    const sc = sceneOf(s.session);
    const pv = projector(s.cam, env.w, env.h).view(i.x - i.dx, i.y - i.dy);
    const c = candidatesAt(sc, pv, { ...pickOpts(), lineTol: 0 }).find((k) => k.kind === "corner" && sc.parts[k.ref]?.origin === "drawn" && sc.parts[k.ref]?.plane);
    if (c) return { ...s, drag: { corner: c.ref, base: s.session }, hoverPoint: null };
  }
  return doOrbit({ ...s, drag: { camera: true } }, i);
}
/** The corner follows the pointer on its plane: every move is made again from where the drag began, so the whole drag is one step. */
function moveCorner(s: AppState, i: Extract<Intent, { type: "orbit" }>, env: Env): AppState {
  const d = s.drag as { corner: Ref; base: Session };
  const sc = sceneOf(d.base);
  const part = sc.parts[d.corner];
  const pl = part?.plane ? sc.parts[part.plane] : undefined;
  if (!pl || pl.kind !== "plane") return s;
  const at = snapOnPlane(sc, projector(s.cam, env.w, env.h).view(i.x, i.y), pl, d.corner);
  if (!at) return s;
  // the corner is held where the pointer is while the rest is solved (else the solver splits the difference); what the solver then settles on is the one step made
  const pin: Command = { type: "addRelation", relation: { id: "drag_pin", kind: "fixed", parts: [d.corner] } };
  const held = run(d.base, { type: "batch", commands: [pin, { type: "movePart", ref: d.corner, to: at }] });
  if (held.message) return { ...s, session: held };
  const after = sceneOf(held).parts;
  const moves: Command[] = [];
  for (const [ref, p] of Object.entries(sc.parts)) {
    const q = after[ref as Ref];
    if (p.kind === "corner" && q?.kind === "corner" && p.movable && (Math.abs(p.at[0] - q.at[0]) + Math.abs(p.at[1] - q.at[1]) + Math.abs(p.at[2] - q.at[2])) > 1e-9) moves.push({ type: "movePart", ref: ref as Ref, to: q.at });
  }
  return { ...s, session: run(d.base, { type: "batch", commands: moves }) };
}

/** The centre of the rotator sticks to a corner you point near (the point you want to turn about), else it goes where the pointer puts it. */
function snapPivot(s: AppState, free: Vec3, x: number, y: number, env: Env): Vec3 {
  const sc = sceneOf(s.session);
  const pv = projector(s.cam, env.w, env.h).view(x, y);
  const c = candidatesAt(sc, pv, { ...pickOpts(), lineTol: 0 }).find((k) => k.kind === "corner");
  return (c ? pointOf(lookup(sc), c.ref) : null) ?? free;
}

/** The pointer went up after a drag: a handle drag that made a value is done as one step and the operation stays open; moving the rotator's centre is not a step. */
export function doDragEnd(s: AppState): AppState {
  const d = s.drag;
  const cleared: AppState = { ...s, drag: null };
  if (!d || !("handle" in d) || !s.op) return cleared;
  if (d.handle.kind === "ball") return s.op.auto ? { ...cleared, op: null } : cleared;
  if (isLive(s.op)) {
    // one step for the whole operation: what was made before is taken out and made again with the total value (so the number does not start over between drags)
    const sess = s.op.made ? undoLast(s.session) : s.session;
    const cmd = opCommand(sceneOf(sess), s.op);
    if (!cmd) return { ...cleared, session: sess, op: { ...s.op, made: false } };
    const next = run(sess, cmd);
    if (next.message) return { ...cleared, session: next, op: { ...s.op, made: false } };
    return { ...cleared, session: { ...next, hover: undefined, click: { ...next.click, selection: [] } }, op: { ...s.op, made: true }, spread: null, hoverPoint: null };
  }
  const cmd = opCommand(sceneOf(s.session), s.op);
  if (!cmd) return s.op.auto ? { ...cleared, op: null } : cleared;
  const next = run(s.session, cmd);
  if (next.message) return { ...cleared, session: next, op: s.op.auto ? null : s.op };
  return { ...cleared, session: next, op: s.op.auto ? null : { ...s.op, value: null, typed: "" }, spread: null, hoverPoint: null };
}

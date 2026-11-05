// Dragging the helper handles (`in_117`): the arrows of Move, the double arrow of Fillet / chamfer, the curved arrows and the centre of Rotate. A drag that starts on a handle
// works the handle and does not turn the camera; letting go does it (one step, one undo) and leaves the operation open for another drag. Esc or Enter ends it.
import type { Intent } from "../../shared/input.ts";
import type { Vec3 } from "../../math/vec.ts";
import { scene as sceneOf, selection as selectionOf, run } from "../session.ts";
import { opCommand, autoOp, afterPushPull, valueOf } from "../operations.ts";
import type { Op } from "../operations.ts";
import { gizmoFor, hasGizmo, hitHandle, startDrag, dragTo } from "../gizmo.ts";
import type { Gizmo } from "../gizmo.ts";
import { candidatesAt } from "../picking.ts";
import { projector } from "../camera.ts";
import { lookup } from "../../operation/scene.ts";
import { pointOf } from "../../operation/part.ts";
import { doOrbit } from "./viewing.ts";
import type { AppState, Env } from "./state.ts";
import { pickOpts } from "./state.ts";

/** The operation whose handles are up: the one you started (menu or key), else the one the selection brings up by itself (a figure's pull arrow, a face's push / pull, an edge's double arrow, the body's move arrows). */
function activeOp(s: AppState): Op | null {
  if (s.op) return hasGizmo(s.op.kind) ? s.op : null;
  return autoOp(sceneOf(s.session), selectionOf(s.session));
}

/** The handles to show and work, or null. */
export function gizmoOf(s: AppState): Gizmo | null {
  const op = activeOp(s);
  return op ? gizmoFor(sceneOf(s.session), op, s.cam) : null;
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
    if (!g) return doOrbit(s, i);
    // the first move of a drag: where did it begin? (the pointer is at (x, y) now and has moved (dx, dy) since the press)
    const h = hitHandle(g, pr.project, i.x - i.dx, i.y - i.dy);
    const d = h ? startDrag(g, h, pr.ray(i.x - i.dx, i.y - i.dy), s.cam) : null;
    if (!d) return doOrbit({ ...s, drag: { camera: true } }, i); // not on a handle: this drag turns the camera
    s = { ...s, op: s.op ?? activeOp(s), drag: { handle: d }, gizmoHover: h!.id }; // a handle that showed up by itself becomes the operation being worked
  }
  if (!("handle" in s.drag!) || !s.op) return doOrbit(s, i);
  const r = dragTo(s.drag.handle, pr.ray(i.x, i.y));
  if (!r) return s;
  if ("value" in r) return { ...s, op: { ...s.op, value: r.value, typed: "", ...(s.drag.handle.axis !== null ? { axis: s.drag.handle.axis } : {}) } };
  return { ...s, op: { ...s.op, pivot: snapPivot(s, r.pivot, i.x, i.y, env) } };
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
  const cmd = opCommand(sceneOf(s.session), s.op);
  if (!cmd) return s.op.auto ? { ...cleared, op: null } : cleared;
  const next = run(s.session, cmd);
  if (next.message) return { ...cleared, session: next, op: s.op.auto ? null : s.op };
  // an operation you started stays open for another drag; one that came from a selection ends (and what was selected may be gone: the face you pulled, the figure you extruded)
  // an extrude or a push / pull leaves nothing selected (the new body shows as itself)
  // a push / pull stays open on the face where it now is, so the arrow stops where you left it and can go on
  const moved = s.op.kind === "pushpull" && !s.op.auto ? afterPushPull(sceneOf(next), s.op, valueOf(s.op) ?? 0) : null;
  if (moved) return { ...cleared, session: { ...next, hover: undefined, click: { ...next.click, selection: moved.parts } }, op: moved, spread: null, hoverPoint: null };
  const left = s.op.kind === "extrude" || s.op.kind === "pushpull" ? { ...next, hover: undefined, click: { ...next.click, selection: [] } } : next;
  return { ...cleared, session: left, op: s.op.auto ? null : { ...s.op, value: null, typed: "" }, spread: null, hoverPoint: null };
}

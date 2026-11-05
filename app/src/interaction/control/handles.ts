// Dragging the helper handles (`in_117`): the arrows of Move, the double arrow of Fillet / chamfer, the curved arrows and the centre of Rotate. A drag that starts on a handle
// works the handle and does not turn the camera; letting go does it (one step, one undo) and leaves the operation open for another drag. Esc or Enter ends it.
import type { Intent } from "../../shared/input.ts";
import type { Vec3 } from "../../math/vec.ts";
import { scene as sceneOf, run } from "../session.ts";
import { opCommand } from "../operations.ts";
import { gizmoFor, hasGizmo, hitHandle, startDrag, dragTo } from "../gizmo.ts";
import type { Gizmo } from "../gizmo.ts";
import { candidatesAt } from "../picking.ts";
import { projector } from "../camera.ts";
import { lookup } from "../../operation/scene.ts";
import { pointOf } from "../../operation/part.ts";
import { doOrbit } from "./viewing.ts";
import type { AppState, Env } from "./state.ts";
import { pickOpts } from "./state.ts";

/** The handles of the running operation, or null (no operation, or one without handles). */
export function gizmoOf(s: AppState): Gizmo | null {
  return s.op && hasGizmo(s.op.kind) ? gizmoFor(sceneOf(s.session), s.op, s.cam) : null;
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
    s = { ...s, drag: { handle: d }, gizmoHover: h!.id };
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
  if (!d || !("handle" in d) || !s.op || d.handle.kind === "ball") return cleared;
  const cmd = opCommand(sceneOf(s.session), s.op);
  if (!cmd) return cleared;
  const next = run(s.session, cmd);
  if (next.message) return { ...cleared, session: next };
  return { ...cleared, session: next, op: { ...s.op, value: null, typed: "" }, spread: null, hoverPoint: null };
}

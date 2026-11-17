// Dragging the helper handles (`in_117`): the arrows of Move, the double arrow of Fillet / chamfer, the curved arrows and the centre of Rotate. A drag that starts on a handle
// works the handle and does not turn the camera; letting go does it (one step, one undo) and leaves the operation open for another drag. Esc or Enter ends it.
import type { Intent } from "../../shared/input.ts";
import type { Vec3 } from "../../math/vec.ts";
import { sub, add, scale, normalize } from "../../math/vec.ts";
import { aboutDir } from "../../math/rotation.ts";
import { scene as sceneOf, selection as selectionOf, run, undoLast } from "../session.ts";
import type { Session } from "../session.ts";
import type { Command } from "../../operation/commands.ts";
import type { Ref } from "../../shared/ref.ts";
import { settings } from "../../shared/settings.ts";
import type { Drag, Handle } from "../gizmo.ts";
import { snapOnPlane, pointOnPlane } from "../tools.ts";
import { lineHint, pointHint, hintRelations, tangentCentre } from "../hints.ts";
import type { Hint } from "../hints.ts";
import type { Scene } from "../../operation/scene.ts";
import { nextId } from "../../operation/scene.ts";
import { apply } from "../../operation/commands.ts";
import { autoOp, isLive, startOp, valueOf } from "../operations.ts";
import { advanceOf } from "../revolve.ts";
import { orbSpotsOf, snapOrb } from "../orbsnap.ts";
import { objectOf, bodyCentre } from "../objects.ts";
import { runOp } from "../runop.ts";
import { sectionGizmo } from "../gizmo.ts";
import { draggedSection, sectionNow, placeSection, sheetMoveOf } from "./section.ts";
import { withPose, hasOrb, moverOp, putMover } from "./pose.ts";
import { patternBase, dragPattern, liveRepeat, advanceHelp } from "../pattern.ts";
import type { Op } from "../operations.ts";
import { gizmoFor, hasGizmo, hitHandle, startDrag, dragTo, followed, jointHandles, moveOffset } from "../gizmo.ts";
import { jointOfBody, jointRoom, driveCommand, hardDrive } from "../mate.ts";
import type { Gizmo } from "../gizmo.ts";
import { candidatesAt } from "../picking.ts";
import { projector, basis, viewAxes, nearTolMm } from "../camera.ts";
import { lookup } from "../../operation/scene.ts";
import { splineSetCommand } from "../../operation/splinering.ts";
import { pointOf, splineWorld, splineStored, normalOfPlane } from "../../operation/part.ts";
import { doOrbit } from "./viewing.ts";
import { finishBox } from "./box.ts";
import type { AppState, Env } from "./state.ts";
import { pickOpts } from "./state.ts";

/** The operation whose handles are up: the one you started (menu or key), else the one the selection brings up by itself (a figure's pull arrow, a face's push / pull, an edge's double arrow, the body's move arrows). */
export function activeOp(s: AppState): Op | null {
  if (s.op) return hasGizmo(s.op.kind) ? s.op : null;
  if (s.repeat) return liveRepeat(sceneOf(s.session), s.repeat); // a repeat being set up shows its handles until another operation is started
  return withPose(s, autoOp(sceneOf(s.session), selectionOf(s.session))); // (an oriented mover stays as oriented while the part is selected, `in_439`)
}

/** The handles to show and work, or null. */
export function gizmoOf(s: AppState): Gizmo | null {
  if (s.tool && !s.op) return null; // (a sketch tool is on: what is selected does not offer its handles under it)
  const op = activeOp(s);
  const sec = sectionNow(s);
  if (sec && !s.op && !s.repeat && !op) return sectionGizmo(sec.centre, s.cam, sec.n, sheetMoveOf(s, sec.ref) === 1); // (the sheet's arrow along its normal, and with its move icon the mover's arrows and rings, `in_392`, `in_459`)
  // looking straight at a plane (orthographic) the push / pull arrow points at you: it goes away (`in_137`)
  if (op && s.cam.straight && (op.kind === "pushpull" || op.kind === "extrude")) return null;
  const g0 = op ? gizmoFor(sceneOf(s.session), op, s.cam, s.moverSphere && hasOrb(op.kind)) : null; // (the sphere selected: its own arrows are there, `in_416`)
  const g = g0; // (a linear repeat shows all three arrows from the start, `in_382`; the helper bubbles only point at one)
  // the arrow of a push / pull or an extrude stands where the face is now: out by the value so far (it stays there when you let go, until the operation ends)
  const shown = g && op && op.normal && (op.kind === "pushpull" || op.kind === "extrude" || op.kind === "offset" || op.kind === "hollow") ? followed(g, { dir: op.normal, kind: "arrow", id: "pull" }, op.value) : g;
  // a body that is free to turn and slide on a mate has the ring and the arrow of its joint as well (`in_323`)
  const sel = selectionOf(s.session);
  const joint = !s.op && !s.repeat && sel.length === 1 ? jointHandles(sceneOf(s.session), sel[0]!, s.cam) : [];
  return joint.length ? { centre: shown?.centre ?? joint[0]!.points[0]!, handles: [...(shown?.handles ?? []), ...joint] } : shown;
}

export function doGizmoHover(s: AppState, x: number, y: number, env: Env): AppState {
  const g = gizmoOf(s);
  if (!g) return s.gizmoHover === null ? s : { ...s, gizmoHover: null };
  const h = hitHandle(g, projector(s.cam, env.w, env.h).project, x, y);
  const id = h?.id ?? null;
  return id === s.gizmoHover ? s : { ...s, gizmoHover: id };
}

/** The pivot point of a circular repeat moved to this coordinate along an axis (a drag of its arrow, or a number typed for it): its vertex in the scene is the truth (`in_384`). */
export function movePivot(s: AppState, k: number, value: number): AppState {
  const p = s.repeat?.pivot ? sceneOf(s.session).parts[s.repeat.pivot.point] : undefined;
  if (!s.repeat?.pivot || p?.kind !== "corner" || k < 0 || Math.abs(p.at[k]! - value) < 1e-9) return s;
  const to = p.at.map((c, j) => (j === k ? value : c)) as unknown as Vec3;
  const next = run(s.session, { type: "movePart", ref: s.repeat.pivot.point, to });
  return next.message ? s : { ...s, session: next };
}

/** The pivot point of a circular repeat put at this place (one change of the point: the copies turn about it): its vertex in the scene is the truth (`in_384`, `in_440`). */
export function movePivotTo(s: AppState, to: Vec3): AppState {
  const p = s.repeat?.pivot ? sceneOf(s.session).parts[s.repeat.pivot.point] : undefined;
  if (!s.repeat?.pivot || p?.kind !== "corner") return s;
  const next = run(s.session, { type: "movePart", ref: s.repeat.pivot.point, to });
  return next.message ? s : { ...s, session: next };
}

/** The handle already chosen: the ring of the axis a turn is set up about, else the arrow that was selected. */
export const chosenId = (s: AppState): string | undefined => (s.op?.kind === "rotate" ? `rot:${"xyz"[s.op.axis]}` : s.handleSel ?? undefined);

/** The pointer moves while the button is down: it works a handle if the drag began on one, else it turns the camera. */
export function doDragMove(s: AppState, i: Extract<Intent, { type: "orbit" }>, env: Env): AppState {
  if (s.box) return { ...s, box: { ...s.box, x: i.x, y: i.y } }; // the rectangle of a drag select (`in_235`)
  const pr = projector(s.cam, env.w, env.h);
  if (i.view && !s.drag) return doOrbit({ ...s, drag: { camera: true } }, i); // the right button only turns the view
  if (!s.drag) {
    const g = gizmoOf(s);
    if (!g) return orbitOrCorner(s, i, env);
    // the first move of a drag: where did it begin? (the pointer is at (x, y) now and has moved (dx, dy) since the press)
    const h = hitHandle(g, pr.project, i.x - i.dx, i.y - i.dy, undefined, chosenId(s));
    const d0 = h ? startDrag(g, h, pr.ray(i.x - i.dx, i.y - i.dy), s.cam) : null;
    const d = d0 && h ? withScreen(d0, h, pr, i.x - i.dx, i.y - i.dy, env.h) : d0;
    if (!d || h!.id === "mir:orb" || h!.id === "lin:orb") return orbitOrCorner(s, i, env); // (the revolve's orb is dragged to move it, `in_468`)
    if (h!.id.startsWith("mir:") && s.op?.kind === "mirror" && s.op.mirrorAt) { const k = d.axis as 0 | 1 | 2; return { ...s, handleSel: h!.id, op: { ...s.op, auto: false, mirrorAxis: k }, drag: { handle: d, base: 0, mir: { k, from: s.op.mirrorAt[k]! } }, gizmoHover: h!.id }; } // (an arrow of the mirror: it chooses the plane across its axis and moves it, `in_437`) // not on a handle (the revolve's orb is only moved by clicking a line): this drag turns the camera (or drags a corner of a drawing)
    if (!s.op && !s.repeat && sectionNow(s) && !activeOp(s)) { if (h!.id === "pivot") return orbitOrCorner(s, i, env);  const sec = sectionNow(s)!; return { ...s, handleSel: h!.id, drag: { handle: d, base: 0, section: { ref: sec.ref, centre: sec.centre, n: sec.n } }, gizmoHover: h!.id }; } // (a handle of the cross section plane, `in_392`)
    if (h!.id.startsWith("joint:")) { // the ring or the arrow of a joint: the amount is the drag; the step is made when it is let go (`in_323`)
      const body = selectionOf(s.session)[0];
      const j = body ? jointOfBody(sceneOf(s.session), body) : null;
      if (!j) return orbitOrCorner(s, i, env);
      return { ...s, handleSel: h!.id, drag: { handle: d, base: 0, joint: { mate: j.mate, kind: h!.id === "joint:turn" ? "turn" : "slide", amount: 0 } }, gizmoHover: h!.id };
    }
    // an operation whose arrow showed up by itself stays up after the drag (like one you started): push / pull, extrude, fillet / chamfer go on until you click away; a body's move arrows end with the drag
    if (((s.moverSphere && (h!.id.startsWith("rot:") || h!.id.startsWith("piv:"))) || (s.op?.kind === "revolve" && h!.id.startsWith("piv:"))) && moverOp(s)) { // (the revolve's orb has its position arrows up all the time, `in_529`) // an arrow or ring of the selected sphere: it puts or turns the mover itself, not what it works on (`in_416`, `in_417`, `in_440`)
      const started = moverOp(s)!;
      if (h!.id.startsWith("rot:")) return { ...putMover(s, { ...started, auto: false, axis: d.axis ?? started.axis }), drag: { handle: d, base: 0, frameTurn: started.frame ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }, gizmoHover: h!.id };
      const g0 = gizmoOf(s);
      if (g0) return { ...putMover(s, { ...started, auto: false }), drag: { handle: d, base: 0, piv: { centre: g0.centre, offset: started.kind === "move" ? moveOffset(sceneOf(s.session), started) : [0, 0, 0] } }, gizmoHover: h!.id };
    }
    if (!s.op && s.repeat) {
      // a handle of the repeat being set up: it sets the repeat's numbers, nothing is made by the drag
      return { ...s, handleSel: h!.id, repeat: { ...s.repeat, chosen: h!.id }, drag: { handle: d, base: patternBase(liveRepeat(sceneOf(s.session), s.repeat), h!.id), repeat: true }, gizmoHover: h!.id };
    }
    const started = s.op ?? activeOp(s)!;
    const op: Op = started.kind === "revolve" && (h!.id.startsWith("rev:turn:") || h!.id.startsWith("rev:adv:")) ? { ...started, auto: false, axis: d.axis ?? started.axis } : started.kind === "pushpull" || started.kind === "extrude" || started.kind === "edge" || started.kind === "offset" || started.kind === "hollow" || started.kind === "revolve" ? { ...started, auto: false } : started;
    const base = op.kind === "revolve" ? (h!.id.startsWith("rev:adv:") ? advanceOf(op) : valueOf(op) ?? 0) : isLive(op) && op.kind !== "scale" ? op.value ?? 0 : 0; // (a revolve has two numbers: the angle of its ring and the advance of its arrow)
    s = { ...s, handleSel: h!.id, op, drag: { handle: op.curved ? { ...d, step: settings.op.distanceStep / 5 } : d, base, ...(h!.id.startsWith("rev:turn") ? { turned: { last: 0, total: 0 } } : {}) }, gizmoHover: h!.id }; // (a round face changes by the radius, so the diameter moves twice as fast: a finer step, 0.02 mm of radius) // a handle that showed up by itself becomes the operation being worked
  }
  if ("handle" in s.drag! && s.drag.frameTurn && moverOp(s)) {
    const r = dragTo(s.drag.handle, pr.ray(i.x, i.y), [i.x, i.y]);
    if (!r || !("value" in r)) return s;
    const base = s.drag.frameTurn;
    const m = aboutDir(base[s.drag.handle.axis as 0 | 1 | 2], r.value);
    const turn = (v: Vec3): Vec3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
    return putMover(s, { ...moverOp(s)!, frame: [turn(base[0]), turn(base[1]), turn(base[2])] });
  }
  if ("handle" in s.drag! && s.drag.mir && s.op?.mirrorAt) {
    const r = dragTo(s.drag.handle, pr.ray(i.x, i.y), [i.x, i.y]);
    if (!r || !("value" in r)) return s;
    const at = [...s.op.mirrorAt] as unknown as [number, number, number];
    at[s.drag.mir.k] = Math.round((s.drag.mir.from + r.value) * 1e3) / 1e3;
    return { ...s, op: { ...s.op, mirrorAt: at } };
  }
  if ("handle" in s.drag! && s.drag.piv && moverOp(s)) {
    const r = dragTo(s.drag.handle, pr.ray(i.x, i.y), [i.x, i.y]);
    if (!r || !("value" in r)) return s;
    const u = normalize(s.drag.handle.dir); // (along the arrow as it is drawn: the mover's turned axis, not the world's, `in_442`)
    const centre = add(s.drag.piv.centre, scale(u, r.value));
    const mo = moverOp(s)!;
    if (mo.kind === "circular" && s.repeat && !s.op) return movePivotTo(s, centre); // (a circular repeat's pivot is a point of the drawing: it goes there)
    return putMover(s, { ...mo, pivot: sub(centre, s.drag.piv.offset) });
  }
  if ("handle" in s.drag! && s.drag.section) {
    const r = dragTo(s.drag.handle, pr.ray(i.x, i.y), [i.x, i.y]);
    if (!r || !("value" in r)) return s;
    const dr = draggedSection({ at: s.drag.section.centre, n: s.drag.section.n }, s.drag.handle.id, r.value);
    return { ...s, sectionLive: { ref: s.drag.section.ref, centre: dr.at, n: dr.n } };
  }
  if ("handle" in s.drag! && s.drag.joint) {
    const jd = s.drag.joint;
    const r = dragTo(s.drag.handle, pr.ray(i.x, i.y), [i.x, i.y]);
    if (!r || !("value" in r)) return s;
    const room = jointRoom(sceneOf(s.session), jd.mate, jd.kind);
    const driven = hardDrive(sceneOf(s.session), jd.mate, jd.kind, Math.min(room.up, Math.max(room.down, r.value))); // (taken only as far as a hard body lets it, `in_480`)
    return { ...s, drag: { ...s.drag, joint: { ...jd, amount: driven.amount, hit: driven.hit } } };
  }
  if ("corner" in s.drag!) return moveCorner(s, i, env);
  if ("knot" in s.drag!) return moveKnot(s, i, env);
  if ("line" in s.drag!) return moveLine(s, i, env);
  if ("rim" in s.drag!) return moveRim(s, i, env);
  if ("body" in s.drag!) return moveBody(s, i, env);
  if ("handle" in s.drag! && s.drag.repeat && s.repeat) {
    const r = dragTo(s.drag.handle, pr.ray(i.x, i.y), [i.x, i.y]);
    if (r && "value" in r && s.drag.handle.id.startsWith("piv:") && s.repeat.pivot) return movePivot(s, "xyz".indexOf(s.drag.handle.id[4]!), Math.round((s.drag.base + r.value) * 1e3) / 1e3); // (the pivot point goes where the arrow is taken)
    return r && "value" in r ? { ...s, repeat: advanceHelp({ ...s.repeat, op: dragPattern(s.repeat.op, s.drag.handle.id, r, s.drag.base) }) } : s;
  }
  if (!("handle" in s.drag!) || !s.op) return doOrbit(s, i);
  const r = dragTo(s.drag.handle, pr.ray(i.x, i.y), [i.x, i.y]);
  if (!r) return s;
  if ("value" in r && s.op.kind === "revolve") {
    if (s.drag.handle.id.startsWith("rev:adv:")) return { ...s, op: { ...s.op, advValue: Math.round((s.drag.base + r.value) * 1e6) / 1e6, advTyped: "", revField: 1 } }; // (the arrow along the axis: the advance)
    // the ring: the turn goes on past one turn, by the change since the last move (each move is under half a turn)
    const t = s.drag.turned ?? { last: 0, total: 0 };
    let dv = r.value - t.last;
    while (dv > 180) dv -= 360;
    while (dv <= -180) dv += 360;
    const total = t.total + dv;
    return { ...s, drag: { ...s.drag, turned: { last: r.value, total } }, op: { ...s.op, value: Math.round((s.drag.base + total) * 1e6) / 1e6, typed: "", revField: 0 } };
  }
  if ("value" in r && s.op.kind === "scale" && (s.op.target === "body" || s.op.target === "shape") && s.drag.handle.id.startsWith("scale:")) {
    // an axis arrow of a scale: only that axis changes, the others stay as they were (`dec_scale_axes`)
    const k = s.drag.handle.axis as 0 | 1 | 2;
    const axes: [number, number, number] = [...(s.op.axes ?? [1, 1, 1])] as [number, number, number];
    axes[k] = r.value;
    return { ...s, op: { ...s.op, axes, axis: k, value: r.value, typed: "" } };
  }
  if ("value" in r && s.op.kind === "scale") return { ...s, op: { ...s.op, axes: undefined, value: Math.round((s.drag.base + r.value) * 1e6) / 1e6, typed: "", rot: ["", "", ""] as [string, string, string] } }; // (the diagonal: all together again)
  if ("value" in r) return { ...s, op: { ...s.op, value: Math.round((s.drag.base + r.value) * 1e6) / 1e6, typed: "", rot: ["", "", ""] as [string, string, string], ...(s.drag.handle.axis !== null ? { axis: s.drag.handle.axis } : {}) } };
  const placed = orbPlace(s, r.pivot, s.drag.handle.origin, i.x, i.y, env);
  return { ...s, op: { ...s.op, pivot: placed.at }, session: placed.note ? { ...s.session, message: placed.note } : s.session };
}

/** An arrow seen nearly end-on moves its value a lot for a little pointer movement (the pointer's ray meets its line a long way along it): such a drag follows the pointer across the screen at a steady rate instead. */
function withScreen(d: Drag, h: Handle, pr: ReturnType<typeof projector>, x0: number, y0: number, heightPx: number): Drag {
  if (h.kind !== "arrow" || h.ratio) return d;
  const [a, b] = [pr.project(h.points[0]!), pr.project(h.points[1]!)];
  const world = Math.hypot(h.points[1]![0] - h.points[0]![0], h.points[1]![1] - h.points[0]![1], h.points[1]![2] - h.points[0]![2]);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steady = settings.gizmo.steadyPxPerMmFactor * (heightPx / (2 * pr.halfH)); // pixels per mm of the view at the target, times a factor
  if (world < 1e-9 || len / world >= steady) return d;
  const [ux, uy] = len > 1 ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0];
  return { ...d, screen: { x0, y0, ux, uy, pxPerMm: steady } };
}

/** A selected whole body dragged free (`in_291`): it goes where the pointer goes on the plane through its middle that faces the camera, as one move step that is made when it is let go (the picture of it moving is the graphics card's). */
function moveBody(s: AppState, i: Extract<Intent, { type: "orbit" }>, env: Env): AppState {
  const d = s.drag as { body: Ref; from: Vec3; centre: Vec3 };
  if (!s.op) return s;
  const now = onViewPlane(s.cam, d.centre, projector(s.cam, env.w, env.h).ray(i.x, i.y));
  if (!now) return s;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const go = (k: 0 | 1 | 2) => (s.lockAxes.length && !s.lockAxes.includes(k) ? 0 : r(now[k] - d.from[k])); // (the arrows chosen with Shift: only along those, `in_299`)
  const f = s.op.frame;
  if (f) { // a turned mover: the drag is taken along its own axes (the ones chosen, or all three), `in_418`
    const delta = sub(now, d.from);
    const along = f.map((a, k) => (s.lockAxes.length && !s.lockAxes.includes(k as 0 | 1 | 2) ? 0 : r(a[0] * delta[0] + a[1] * delta[1] + a[2] * delta[2])));
    const free = [0, 1, 2].map((j) => r(f.reduce((acc, a, k) => acc + a[j]! * along[k]!, 0))) as unknown as Vec3;
    return { ...s, op: { ...s.op, free, grab: d.from } };
  }
  return { ...s, op: { ...s.op, free: [go(0), go(1), go(2)], grab: d.from } };
}

/** Where a pointer's ray meets the plane through `centre` that faces the camera. */
function onViewPlane(cam: AppState["cam"], centre: Vec3, ray: { o: Vec3; d: Vec3 } | null): Vec3 | null {
  if (!ray) return null;
  const n = basis(cam).forward;
  const den = n[0] * ray.d[0] + n[1] * ray.d[1] + n[2] * ray.d[2];
  if (Math.abs(den) < 1e-6) return null;
  const t = (n[0] * (centre[0] - ray.o[0]) + n[1] * (centre[1] - ray.o[1]) + n[2] * (centre[2] - ray.o[2])) / den;
  return t > 0 ? [ray.o[0] + ray.d[0] * t, ray.o[1] + ray.d[1] * t, ray.o[2] + ray.d[2] * t] : null;
}

/** A drag that starts on a corner of a drawing drags the corner (the solver keeps the relations: a rectangle stays a rectangle); anywhere else it turns the camera. */
function orbitOrCorner(s: AppState, i: Extract<Intent, { type: "orbit" }>, env: Env): AppState {
  const mover = !!s.op && (s.op.kind === "move" || s.op.kind === "rotate") && s.op.target === "body" && !s.moverSphere && !s.repeat; // (a mover that is open: a body can still be dragged free, along its axes, `in_418`)
  if (!s.tool && (!s.op || mover)) {
    const sc = sceneOf(s.session);
    const pr = projector(s.cam, env.w, env.h);
    const pv = pr.view(i.x - i.dx, i.y - i.dy);
    const c = s.op ? undefined : candidatesAt(sc, pv, { ...pickOpts(s), lineTol: 0 }).find((k) => k.kind === "corner" && sc.parts[k.ref]?.origin === "drawn" && sc.parts[k.ref]?.plane);
    // a body that is selected whole is dragged free by pressing on it (`in_291`)
    if (!c) {
      const first = candidatesAt(sc, pv, pickOpts(s)).find((k) => sc.parts[k.ref]?.origin === "body" || sc.parts[k.ref]?.kind === "body");
      const body = first ? objectOf(sc, first.ref) : null;
      const sel = selectionOf(s.session);
      // the bodies that are selected are dragged together (`in_345`): pressing on any of them takes them all
      if (body && sc.parts[body]?.kind === "body" && sel.length >= 1 && sel.includes(body) && sel.every((r) => sc.parts[r]?.kind === "body")) {
        const centre = bodyCentre(sc, body);
        const start = centre ? onViewPlane(s.cam, centre, pr.ray(i.x - i.dx, i.y - i.dy)) : null;
        const op = startOp(sc, sel, "move", viewAxes(s.cam));
        if (centre && start && op.ok) return { ...s, op: { ...op.op, free: [0, 0, 0], ...(s.op?.frame ? { frame: s.op.frame } : {}), ...(s.op?.pivot ? { pivot: s.op.pivot } : {}) }, drag: { body, from: start, centre, ...(s.op ? { keep: s.op } : {}) }, hoverPoint: null };
      }
    }
    if (c) return { ...s, drag: { corner: c.ref, base: s.session }, hoverPoint: null };
    const knot = !s.op ? knotAt(sc, selectionOf(s.session), (q) => pr.project(q), i.x - i.dx, i.y - i.dy) : null; // (a point of the selected spline: it is moved, the curve follows, `dec_spline_and_cams`)
    if (knot) return { ...s, drag: { knot, base: s.session }, hoverPoint: null };
    if (s.op) return doOrbit({ ...s, drag: { camera: true } }, i);
    // a straight line of the drawing is dragged whole, the edge of a circle changes its size (`in_290`)
    const hit = candidatesAt(sc, pv, pickOpts(s)).find((k) => { const p = sc.parts[k.ref]; return p?.origin === "drawn" && !!p.plane && ((p.kind === "line" && !p.derived) || p.kind === "circle"); });
    const part = hit ? sc.parts[hit.ref] : undefined;
    const pl = part && "plane" in part && part.plane ? sc.parts[part.plane] : undefined;
    if (hit && part?.kind === "circle") return { ...s, drag: { rim: hit.ref, base: s.session }, hoverPoint: null };
    const from = pl?.kind === "plane" ? pointOnPlane(pv, pl) : null;
    if (hit && part?.kind === "line" && from) return { ...s, drag: { line: hit.ref, base: s.session, from }, hoverPoint: null };
  }
  return doOrbit({ ...s, drag: { camera: true } }, i);
}
/** The point of a selected spline under the pointer (the pixel position given), if any: which line and which of its points between the ends. */
function knotAt(sc: Scene, sel: readonly Ref[], project: (p: Vec3) => [number, number], x: number, y: number): { line: Ref; index: number } | null {
  const get = lookup(sc);
  const found: { line: Ref; index: number; d: number }[] = [];
  for (const r of sel) {
    const p = sc.parts[r];
    const w = p?.kind === "line" && p.spline && p.movable ? splineWorld(get, p) : null;
    if (!w) continue;
    w.slice(1, -1).forEach((q, k) => { const [px, py] = project(q); const d = Math.hypot(px - x, py - y); if (d <= settings.pick.pointPx) found.push({ line: r, index: k, d }); });
  }
  const best = found.sort((a, b) => a.d - b.d)[0];
  return best ? { line: best.line, index: best.index } : null;
}
/** A point of a spline follows the pointer on the spline's plane: every move is made again from where the drag began, so the whole drag is one step. */
function moveKnot(s: AppState, i: Extract<Intent, { type: "orbit" }>, env: Env): AppState {
  const d = s.drag as { knot: { line: Ref; index: number }; base: Session };
  const sc = sceneOf(d.base);
  const line = sc.parts[d.knot.line];
  const pl = line?.kind === "line" && line.plane ? sc.parts[line.plane] : undefined;
  if (line?.kind !== "line" || pl?.kind !== "plane") return s;
  const w = splineWorld(lookup(sc), line);
  const at = snapOnPlane(sc, projector(s.cam, env.w, env.h).view(i.x, i.y), pl);
  if (!w || !at) return s;
  const stored = splineStored(w.map((q, k) => (k === d.knot.index + 1 ? at : q)), normalOfPlane(pl));
  if (!stored) return s;
  const next = run(d.base, splineSetCommand(sc, d.knot.line, stored));
  return next.message ? s : { ...s, session: { ...next, click: d.base.click } };
}

/** The corner follows the pointer on its plane: every move is made again from where the drag began, so the whole drag is one step. */
function moveCorner(s: AppState, i: Extract<Intent, { type: "orbit" }>, env: Env): AppState {
  const d = s.drag as { corner: Ref; base: Session };
  const sc = sceneOf(d.base);
  const part = sc.parts[d.corner];
  const pl = part?.plane ? sc.parts[part.plane] : undefined;
  if (!pl || pl.kind !== "plane") return s;
  const pv = projector(s.cam, env.w, env.h).view(i.x, i.y);
  const snapped = snapOnPlane(sc, pv, pl, d.corner);
  if (!snapped) return s;
  // the constraints a hover offers while a figure is drawn (on a line, on a circle, level, upright, parallel, square, tangent) are offered to a point that is dragged, and kept when it is let go (`in_290`)
  const lines = Object.values(sc.parts).filter((p): p is Extract<typeof p, { kind: "line" }> => p.kind === "line" && p.origin === "drawn" && !p.derived && !p.center && (p.a === d.corner || p.b === d.corner));
  const mine = new Set<Ref>(Object.values(sc.parts).filter((p) => (p.kind === "line" && (p.a === d.corner || p.b === d.corner || p.center === d.corner)) || (p.kind === "circle" && p.center === d.corner)).map((p) => p.ref));
  const other = lines.length === 1 ? sc.parts[lines[0]!.a === d.corner ? lines[0]!.b : lines[0]!.a] : undefined;
  let hint = other?.kind === "corner" ? lineHint(sc, pl, other.at, pv, snapped) : pointHint(sc, pl, pv, snapped, (r) => mine.has(r));
  // the centre of a circle taken to where the circle touches another circle lands there (`in_294`)
  const own = Object.values(sc.parts).filter((q): q is Extract<typeof q, { kind: "circle" }> => q.kind === "circle" && q.center === d.corner);
  let at = hint.hints.length ? hint.at : snapped;
  if (!hint.hints.length && own.length === 1) {
    const pl = sc.parts[own[0]!.plane!];
    const t = pl?.kind === "plane" ? tangentCentre(sc, pl, own[0]!.radius, snapped, nearTolMm(s.cam), own[0]!.ref) : null;
    if (t) { at = t.at; hint = { at, hints: [{ kind: "tangent", ref: t.ref }] }; }
  }
  const line = lines.length === 1 ? lines[0]! : null;
  const moved = settledWith({ ...s, dragHint: hint.hints.length ? { hints: hint.hints, at } : null }, d.base, [{ ref: d.corner, to: at }], (after) => {
    const out: { kind: Hint["kind"]; parts: Ref[] }[] = [];
    if (!hint.hints.length) return out;
    if (line) { // the line the point is an end of: its constraints, with the point on a line or circle as its own
      const isStart = line.a === d.corner ? 1 : 0; // (the hints' "start" is the other end of the line)
      const ends: Hint[][] = [[], []];
      ends[line.a === d.corner ? 0 : 1] = hint.hints.filter((x) => x.kind === "onLine" || x.kind === "onCircle");
      return hintRelations(after, line.ref, ends, hint.hints.filter((x) => x.kind !== "onLine" && x.kind !== "onCircle").map((x) => (x.end !== undefined ? { ...x, end: isStart as 0 | 1 } : x)));
    }
    for (const x of hint.hints) { if (x.ref && (x.kind === "onLine" || x.kind === "onCircle")) out.push({ kind: x.kind, parts: [d.corner, x.ref] }); if (x.ref && x.kind === "tangent" && own.length === 1) out.push({ kind: "tangent", parts: [own[0]!.ref, x.ref] }); }
    return out;
  });
  return moved;
}

/** Corners held where the pointer has taken them while the rest is solved (else the solver splits the difference); what the solver then settles on is the one step made. A locked corner or a locked number in the way refuses it, and says so. */
function settledWith(s: AppState, base: Session, pins: { ref: Ref; to: Vec3 }[], extra: (after: Scene) => { kind: Hint["kind"]; parts: Ref[] }[] = () => []): AppState {
  const sc = sceneOf(base);
  // a point that is fixed in place is not dragged (`in_290`)
  if (pins.some((p) => sc.relations.some((r) => r.kind === "fixed" && r.locked !== false && r.parts.includes(p.ref)))) return { ...s, session: { ...base, message: "this point is fixed in place: remove the lock to move it" } };
  const hold: Command[] = pins.map((p, k) => ({ type: "addRelation", relation: { id: `drag_pin_${k}`, kind: "fixed", parts: [p.ref] } }));
  const held = run(base, { type: "batch", commands: [...hold, ...pins.map((p): Command => ({ type: "movePart", ref: p.ref, to: p.to }))] });
  // (to go on after its constraints are deleted, the points are simply put where they were taken: the pins were only for settling the rest, `in_366`)
  if (held.message) return { ...s, session: held.conflict?.retry ? { ...held, conflict: { ...held.conflict, retry: { type: "batch", commands: pins.map((p): Command => ({ type: "movePart", ref: p.ref, to: p.to })) } } } : held };
  const after = sceneOf(held).parts;
  const moves: Command[] = [];
  for (const [ref, p] of Object.entries(sc.parts)) {
    const q = after[ref as Ref];
    if (p.kind === "corner" && q?.kind === "corner" && p.movable && (Math.abs(p.at[0] - q.at[0]) + Math.abs(p.at[1] - q.at[1]) + Math.abs(p.at[2] - q.at[2])) > 1e-9) moves.push({ type: "movePart", ref: ref as Ref, to: q.at });
  }
  // the constraints the dragged point took, made with the same step as the move (one drag, one undo)
  const moveAll: Command = { type: "batch", commands: moves };
  const settled = apply(sc, moveAll);
  const kept: Command[] = [];
  if (settled.ok) { let cur = settled.value; for (const r of extra(cur)) { const c: Command = { type: "addRelation", relation: { id: nextId(cur, "r"), kind: r.kind, parts: r.parts } }; const n = apply(cur, c); if (!n.ok) break; kept.push(c); cur = n.value; } }
  return { ...s, session: run(base, { type: "batch", commands: [...moves, ...kept] }) };
}

/** A whole straight line or arc dragged across its plane (`in_290`, `in_292`): its ends (and an arc's centre) go by the same amount, with the rest solved. */
function moveLine(s: AppState, i: Extract<Intent, { type: "orbit" }>, env: Env): AppState {
  const d = s.drag as { line: Ref; base: Session; from: Vec3 };
  const sc = sceneOf(d.base);
  const line = sc.parts[d.line];
  const pl = line?.kind === "line" && line.plane ? sc.parts[line.plane] : undefined;
  if (line?.kind !== "line" || pl?.kind !== "plane") return s;
  const [a, b] = [sc.parts[line.a], sc.parts[line.b]];
  const now = pointOnPlane(projector(s.cam, env.w, env.h).view(i.x, i.y), pl);
  if (a?.kind !== "corner" || b?.kind !== "corner" || !now) return s;
  let by: Vec3 = [now[0] - d.from[0], now[1] - d.from[1], now[2] - d.from[2]];
  // a line that is dragged near something offers what a vertex or a line near it would (`in_294`): an end of it close to another line or a circle lands on it; a vertex of the drawing close to it is put on it
  const pr = projector(s.cam, env.w, env.h);
  const toPx = (q: Vec3) => pr.project(q);
  const lined = Object.values(sc.parts).filter((q) => q.kind === "line" || q.kind === "circle").map((q) => q.ref);
  const mine = new Set<Ref>([line.ref, line.a, line.b, ...(line.center ? [line.center] : [])]);
  let taken: { corner: Ref; target: Ref; kind: "onLine" | "onCircle" } | null = null;
  let best = Infinity;
  for (const [ref, end] of [[line.a, a], [line.b, b]] as const) {
    const p: Vec3 = [end.at[0] + by[0], end.at[1] + by[1], end.at[2] + by[2]];
    const q = toPx(p);
    const h = pointHint(sc, pl, pr.view(q[0], q[1]), p, (r) => mine.has(r) || (lined.includes(r) && sc.parts[r]?.kind === "line" && ((sc.parts[r] as { a: Ref; b: Ref }).a === ref || (sc.parts[r] as { a: Ref; b: Ref }).b === ref)));
    const hint = h.hints[0];
    if (hint?.ref && (hint.kind === "onLine" || hint.kind === "onCircle")) {
      const gap = Math.hypot(h.at[0] - p[0], h.at[1] - p[1], h.at[2] - p[2]);
      if (gap < best) { best = gap; by = [by[0] + h.at[0] - p[0], by[1] + h.at[1] - p[1], by[2] + h.at[2] - p[2]]; taken = { corner: ref, target: hint.ref, kind: hint.kind }; }
    }
  }
  if (!taken) {
    // a vertex of the drawing near the line: the line is taken across to it
    const A: Vec3 = [a.at[0] + by[0], a.at[1] + by[1], a.at[2] + by[2]], B: Vec3 = [b.at[0] + by[0], b.at[1] + by[1], b.at[2] + by[2]];
    const ab: Vec3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
    for (const c of Object.values(sc.parts)) {
      if (c.kind !== "corner" || c.origin !== "drawn" || c.derived || c.plane !== line.plane || mine.has(c.ref) || sc.relations.some((r) => r.kind === "onLine" && r.parts.includes(c.ref) && r.parts.includes(line.ref))) continue;
      const t = ((c.at[0] - A[0]) * ab[0] + (c.at[1] - A[1]) * ab[1] + (c.at[2] - A[2]) * ab[2]) / len2;
      if (t < 0.02 || t > 0.98) continue;
      const foot: Vec3 = [A[0] + ab[0] * t, A[1] + ab[1] * t, A[2] + ab[2] * t];
      const [pc, pf] = [toPx(c.at), toPx(foot)];
      const px = Math.hypot(pc[0] - pf[0], pc[1] - pf[1]);
      if (px <= settings.sketch.snapPx && px < best) { best = px; by = [by[0] + c.at[0] - foot[0], by[1] + c.at[1] - foot[1], by[2] + c.at[2] - foot[2]]; taken = { corner: c.ref, target: line.ref, kind: "onLine" }; }
    }
  }
  const go = (q: Vec3): Vec3 => [q[0] + by[0], q[1] + by[1], q[2] + by[2]];
  const centre = line.center ? sc.parts[line.center] : undefined; // (an arc goes with its centre: the whole curve, at its size, `in_292`)
  const kept = taken;
  return settledWith({ ...s, dragHint: kept ? { hints: [{ kind: kept.kind, ref: kept.target }], at: go(a.at) } : null }, d.base, [{ ref: line.a, to: go(a.at) }, { ref: line.b, to: go(b.at) }, ...(centre?.kind === "corner" && line.center ? [{ ref: line.center, to: go(centre.at) }] : [])], () => (kept ? [{ kind: kept.kind, parts: [kept.corner, kept.target] }] : []));
}

/** The edge of a circle dragged: its radius becomes the pointer's distance from the centre, unless its diameter is locked (`in_290`). */
function moveRim(s: AppState, i: Extract<Intent, { type: "orbit" }>, env: Env): AppState {
  const d = s.drag as { rim: Ref; base: Session };
  const sc = sceneOf(d.base);
  const circle = sc.parts[d.rim];
  const pl = circle?.kind === "circle" && circle.plane ? sc.parts[circle.plane] : undefined;
  const centre = circle?.kind === "circle" ? sc.parts[circle.center] : undefined;
  if (circle?.kind !== "circle" || pl?.kind !== "plane" || centre?.kind !== "corner") return s;
  if (sc.relations.some((r) => r.kind === "diameter" && r.parts.includes(d.rim) && r.locked !== false)) return { ...s, session: { ...d.base, message: "the diameter of this circle is locked: unlock it to change the size" } };
  const now = pointOnPlane(projector(s.cam, env.w, env.h).view(i.x, i.y), pl);
  if (!now) return s;
  let radius = Math.max(0.1, Math.hypot(now[0] - centre.at[0], now[1] - centre.at[1], now[2] - centre.at[2]));
  // a circle taken to the size at which it touches another circle (outside it or inside it) lands there and says so (`in_294`)
  const tol = nearTolMm(s.cam);
  let touch: Ref | null = null;
  let best = tol;
  for (const o of Object.values(sc.parts)) {
    if (o.kind !== "circle" || o.ref === d.rim || o.origin !== "drawn" || o.plane !== circle.plane) continue;
    const oc = sc.parts[o.center];
    if (oc?.kind !== "corner") continue;
    const gap = Math.hypot(oc.at[0] - centre.at[0], oc.at[1] - centre.at[1], oc.at[2] - centre.at[2]);
    for (const want of [gap - o.radius, o.radius - gap, o.radius + gap]) if (want > 0.1 && Math.abs(want - radius) < best) { best = Math.abs(want - radius); touch = o.ref; radius = want; }
  }
  const t = touch;
  const moved = run(d.base, { type: "batch", commands: [{ type: "setRadius", ref: d.rim, radius }, ...(t ? [{ type: "addRelation", relation: { id: nextId(sc, "r"), kind: "tangent", parts: [d.rim, t] } } as Command] : [])] });
  return { ...s, dragHint: t ? { hints: [{ kind: "tangent", ref: t }], at: now } : null, session: moved };
}

/**
 * Where the orb (the mover's, the revolve's) goes while it is dragged (`in_652`): held to the axes chosen with Shift on its position arrows, sticking to a place the pointer is near (a corner, the middle of an edge, a
 * circle's centre, the middle of a face or of a body), else lined up with the places along each axis it may move along (`orbsnap.ts`). `from` is where the drag began.
 */
function orbPlace(s: AppState, free: Vec3, from: Vec3, x: number, y: number, env: Env): { at: Vec3; note: string | null } {
  const pr = projector(s.cam, env.w, env.h);
  const frame = s.op?.frame ?? ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const);
  const worldAligned = frame.every((a, k) => Math.abs(a[k]!) > 1 - 1e-9);
  const mmPerPx = (2 * s.cam.distance * Math.tan((settings.view.fovDeg * Math.PI) / 360)) / env.h;
  return snapOrb(orbSpotsOf(sceneOf(s.session)), free, [x, y], (p) => pr.project(p), { pointPx: settings.sketch.snapPx, alignMm: settings.sketch.alignPx * mmPerPx, held: s.lockAxes.map((k) => frame[k]!), from, worldAligned });
}

/** The pointer went up after a drag: a handle drag that made a value is done as one step and the operation stays open; moving the rotator's centre is not a step. */
export function doDragEnd(s: AppState, env?: Env): AppState {
  if (s.box) return env ? finishBox(s, env) : { ...s, box: null };
  const d = s.drag;
  const cleared: AppState = { ...s, drag: null, dragHint: null, orthoDebt: 0, gizmoHover: null };
  if (d && "handle" in d && (d.piv || d.frameTurn || d.mir)) return cleared; // (the sphere's arrows and rings only place and orient the mover: nothing is made, `in_416`, `in_417`)
  if (d && "handle" in d && d.section) { // a drag of the cross section plane's handle: one step, the plane where it was taken (`in_396`)
    const live = s.sectionLive;
    return live ? placeSection({ ...cleared, sectionLive: live }, live.centre, live.n) : cleared;
  } // (no ring stays lit as hovered after the finger is up, or two look chosen, `in_383`)
  if (d && "handle" in d && d.joint) { // a joint dragged: one drive step, as a typed amount makes (`in_323`)
    const c = d.joint.amount !== 0 ? driveCommand(sceneOf(s.session), d.joint.mate, d.joint.kind, d.joint.amount) : null;
    return c ? { ...cleared, session: run(s.session, c) } : cleared;
  }
  if (d && "body" in d && s.op) {
    // a body dragged free: it is moved by what it was taken, as one step (`in_291`)
    const free = s.op.free;
    if (!free || (!free[0] && !free[1] && !free[2])) return { ...cleared, op: d.keep ?? null };
    const made = runOp(s.session, s.op);
    const kept = d.keep ?? null; // (a mover that was open stays open, with its axes)
    return made ? { ...cleared, session: made.session, op: kept, spread: null, hoverPoint: null } : { ...cleared, op: kept };
  }
  if (!d || !("handle" in d) || !s.op) return cleared; // (a handle of a repeat being set up only set its numbers)
  if (d.handle.kind === "orb") return s.op.auto ? { ...cleared, op: null } : { ...cleared, ...(s.moverSphere && env ? { orbMovedAt: env.now } : {}) }; // (the whole orb moved in the orient mode: its numbers show a while, `in_439`)
  if (isLive(s.op)) {
    // one step for the whole operation: what was made before is taken out and made again with the total value (so the number does not start over between drags)
    const sess = s.op.made ? undoLast(s.session) : s.session;
    const made = runOp(sess, s.op);
    if (!made) return { ...cleared, session: sess, op: { ...s.op, made: false } };
    const next = made.session;
    if (next.message && next.history === sess.history) return { ...cleared, session: next, op: { ...s.op, made: false } };
    return { ...cleared, session: { ...next, hover: undefined, click: { ...next.click, selection: [] } }, op: { ...s.op, made: true }, spread: null, hoverPoint: null };
  }
  const once = runOp(s.session, s.op);
  if (!once) return s.op.auto ? { ...cleared, op: null } : cleared;
  const next = once.session;
  if (next.message && next.history === s.session.history) return { ...cleared, session: next, op: s.op.auto ? null : { ...s.op, value: null, typed: "", rot: ["", "", ""], free: undefined } }; // (refused: the arrow or ring goes back to where it was, the degrees do not stay, `in_436`)
  return { ...cleared, session: next, op: s.op.auto ? null : { ...s.op, value: null, typed: "" }, spread: null, hoverPoint: null };
}

// Dragging the helper handles (`in_117`): the arrows of Move, the double arrow of Fillet / chamfer, the curved arrows and the centre of Rotate. A drag that starts on a handle
// works the handle and does not turn the camera; letting go does it (one step, one undo) and leaves the operation open for another drag. Esc or Enter ends it.
import type { Intent } from "../../shared/input.ts";
import type { Vec3 } from "../../math/vec.ts";
import { scene as sceneOf, selection as selectionOf, run, undoLast } from "../session.ts";
import type { Session } from "../session.ts";
import type { Command } from "../../operation/commands.ts";
import type { Ref } from "../../shared/ref.ts";
import { settings } from "../../shared/settings.ts";
import type { Drag, Handle } from "../gizmo.ts";
import { snapOnPlane, pointOnPlane } from "../tools.ts";
import { lineHint, pointHint, hintRelations } from "../hints.ts";
import type { Hint } from "../hints.ts";
import type { Scene } from "../../operation/scene.ts";
import { nextId } from "../../operation/scene.ts";
import { apply } from "../../operation/commands.ts";
import { autoOp, isLive, startOp } from "../operations.ts";
import { objectOf, bodyCentre } from "../objects.ts";
import { runOp } from "../runop.ts";
import { patternBase, dragPattern, liveRepeat, advanceHelp } from "../pattern.ts";
import type { Op } from "../operations.ts";
import { gizmoFor, hasGizmo, hitHandle, startDrag, dragTo, followed } from "../gizmo.ts";
import type { Gizmo } from "../gizmo.ts";
import { candidatesAt } from "../picking.ts";
import { projector, basis, viewAxes } from "../camera.ts";
import { lookup } from "../../operation/scene.ts";
import { pointOf } from "../../operation/part.ts";
import { doOrbit } from "./viewing.ts";
import { finishBox } from "./box.ts";
import type { AppState, Env } from "./state.ts";
import { pickOpts } from "./state.ts";

/** The operation whose handles are up: the one you started (menu or key), else the one the selection brings up by itself (a figure's pull arrow, a face's push / pull, an edge's double arrow, the body's move arrows). */
export function activeOp(s: AppState): Op | null {
  if (s.op) return hasGizmo(s.op.kind) ? s.op : null;
  if (s.repeat) return liveRepeat(sceneOf(s.session), s.repeat); // a repeat being set up shows its handles until another operation is started
  return autoOp(sceneOf(s.session), selectionOf(s.session));
}

/** The handles to show and work, or null. */
export function gizmoOf(s: AppState): Gizmo | null {
  if (s.tool && !s.op) return null; // (a sketch tool is on: what is selected does not offer its handles under it)
  const op = activeOp(s);
  // looking straight at a plane (orthographic) the push / pull arrow points at you: it goes away (`in_137`)
  if (op && s.cam.straight && (op.kind === "pushpull" || op.kind === "extrude")) return null;
  const g0 = op ? gizmoFor(sceneOf(s.session), op, s.cam) : null;
  // a linear repeat shows only the arrows of the direction its helper bubbles are about until that has been used; then the other directions come (`in_237`)
  const helped = s.repeat && !s.op && op && op.kind === "linear" && s.repeat.help && s.repeat.help.phase !== "done" ? "xyz"[op.along ?? 0]! : null;
  const g = g0 && helped ? { ...g0, handles: g0.handles.filter((h) => h.id.endsWith(`:${helped}`)) } : g0;
  // the arrow of a push / pull or an extrude stands where the face is now: out by the value so far (it stays there when you let go, until the operation ends)
  return g && op && op.normal && (op.kind === "pushpull" || op.kind === "extrude" || op.kind === "offset") ? followed(g, { dir: op.normal, kind: "double", id: "pull" }, op.value) : g;
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
  if (s.box) return { ...s, box: { ...s.box, x: i.x, y: i.y } }; // the rectangle of a drag select (`in_235`)
  const pr = projector(s.cam, env.w, env.h);
  if (i.view && !s.drag) return doOrbit({ ...s, drag: { camera: true } }, i); // the right button only turns the view
  if (!s.drag) {
    const g = gizmoOf(s);
    if (!g) return orbitOrCorner(s, i, env);
    // the first move of a drag: where did it begin? (the pointer is at (x, y) now and has moved (dx, dy) since the press)
    const h = hitHandle(g, pr.project, i.x - i.dx, i.y - i.dy);
    const d0 = h ? startDrag(g, h, pr.ray(i.x - i.dx, i.y - i.dy), s.cam) : null;
    const d = d0 && h ? withScreen(d0, h, pr, i.x - i.dx, i.y - i.dy, env.h) : d0;
    if (!d) return orbitOrCorner(s, i, env); // not on a handle: this drag turns the camera (or drags a corner of a drawing)
    // an operation whose arrow showed up by itself stays up after the drag (like one you started): push / pull, extrude, fillet / chamfer go on until you click away; a body's move arrows end with the drag
    if (!s.op && s.repeat) {
      // a handle of the repeat being set up: it sets the repeat's numbers, nothing is made by the drag
      return { ...s, handleSel: h!.id, repeat: { ...s.repeat, chosen: h!.id }, drag: { handle: d, base: patternBase(s.repeat.op, h!.id), repeat: true }, gizmoHover: h!.id };
    }
    const started = s.op ?? activeOp(s)!;
    const op: Op = started.kind === "pushpull" || started.kind === "extrude" || started.kind === "edge" || started.kind === "offset" ? { ...started, auto: false } : started;
    s = { ...s, handleSel: h!.id, op, drag: { handle: op.curved ? { ...d, step: settings.op.distanceStep / 5 } : d, base: isLive(op) ? op.value ?? 0 : 0 }, gizmoHover: h!.id }; // (a round face changes by the radius, so the diameter moves twice as fast: a finer step, 0.02 mm of radius) // a handle that showed up by itself becomes the operation being worked
  }
  if ("corner" in s.drag!) return moveCorner(s, i, env);
  if ("line" in s.drag!) return moveLine(s, i, env);
  if ("rim" in s.drag!) return moveRim(s, i, env);
  if ("body" in s.drag!) return moveBody(s, i, env);
  if ("handle" in s.drag! && s.drag.repeat && s.repeat) {
    const r = dragTo(s.drag.handle, pr.ray(i.x, i.y), [i.x, i.y]);
    return r && "value" in r ? { ...s, repeat: advanceHelp({ ...s.repeat, op: dragPattern(s.repeat.op, s.drag.handle.id, r, s.drag.base) }) } : s;
  }
  if (!("handle" in s.drag!) || !s.op) return doOrbit(s, i);
  const r = dragTo(s.drag.handle, pr.ray(i.x, i.y), [i.x, i.y]);
  if (!r) return s;
  if ("value" in r) return { ...s, op: { ...s.op, value: Math.round((s.drag.base + r.value) * 1e6) / 1e6, typed: "", rot: ["", "", ""] as [string, string, string], ...(s.drag.handle.axis !== null ? { axis: s.drag.handle.axis } : {}) } };
  return { ...s, op: { ...s.op, pivot: snapPivot(s, r.pivot, i.x, i.y, env) } };
}

/** An arrow seen nearly end-on moves its value a lot for a little pointer movement (the pointer's ray meets its line a long way along it): such a drag follows the pointer across the screen at a steady rate instead. */
function withScreen(d: Drag, h: Handle, pr: ReturnType<typeof projector>, x0: number, y0: number, heightPx: number): Drag {
  if (h.kind !== "arrow" && h.kind !== "double") return d;
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
  return { ...s, op: { ...s.op, free: [r(now[0] - d.from[0]), r(now[1] - d.from[1]), r(now[2] - d.from[2])] } };
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
  if (!s.tool && !s.op) {
    const sc = sceneOf(s.session);
    const pr = projector(s.cam, env.w, env.h);
    const pv = pr.view(i.x - i.dx, i.y - i.dy);
    const c = candidatesAt(sc, pv, { ...pickOpts(s), lineTol: 0 }).find((k) => k.kind === "corner" && sc.parts[k.ref]?.origin === "drawn" && sc.parts[k.ref]?.plane);
    // a body that is selected whole is dragged free by pressing on it (`in_291`)
    if (!c) {
      const first = candidatesAt(sc, pv, pickOpts(s)).find((k) => sc.parts[k.ref]?.origin === "body" || sc.parts[k.ref]?.kind === "body");
      const body = first ? objectOf(sc, first.ref) : null;
      const sel = selectionOf(s.session);
      if (body && sc.parts[body]?.kind === "body" && sel.length === 1 && sel[0] === body) {
        const centre = bodyCentre(sc, body);
        const start = centre ? onViewPlane(s.cam, centre, pr.ray(i.x - i.dx, i.y - i.dy)) : null;
        const op = startOp(sc, [body], "move", viewAxes(s.cam));
        if (centre && start && op.ok) return { ...s, op: { ...op.op, free: [0, 0, 0] }, drag: { body, from: start, centre }, hoverPoint: null };
      }
    }
    if (c) return { ...s, drag: { corner: c.ref, base: s.session }, hoverPoint: null };
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
  const hint = other?.kind === "corner" ? lineHint(sc, pl, other.at, pv, snapped) : pointHint(sc, pl, pv, snapped, (r) => mine.has(r));
  const at = hint.hints.length ? hint.at : snapped;
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
    for (const x of hint.hints) if (x.ref && (x.kind === "onLine" || x.kind === "onCircle")) out.push({ kind: x.kind, parts: [d.corner, x.ref] });
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
  if (held.message) return { ...s, session: held };
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
  const by: Vec3 = [now[0] - d.from[0], now[1] - d.from[1], now[2] - d.from[2]];
  const go = (q: Vec3): Vec3 => [q[0] + by[0], q[1] + by[1], q[2] + by[2]];
  const centre = line.center ? sc.parts[line.center] : undefined; // (an arc goes with its centre: the whole curve, at its size, `in_292`)
  return settledWith(s, d.base, [{ ref: line.a, to: go(a.at) }, { ref: line.b, to: go(b.at) }, ...(centre?.kind === "corner" && line.center ? [{ ref: line.center, to: go(centre.at) }] : [])]);
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
  const radius = Math.max(0.1, Math.hypot(now[0] - centre.at[0], now[1] - centre.at[1], now[2] - centre.at[2]));
  return { ...s, session: run(d.base, { type: "setRadius", ref: d.rim, radius }) };
}

/** The centre of the rotator sticks to a corner you point near (the point you want to turn about), else it goes where the pointer puts it. */
function snapPivot(s: AppState, free: Vec3, x: number, y: number, env: Env): Vec3 {
  const sc = sceneOf(s.session);
  const pv = projector(s.cam, env.w, env.h).view(x, y);
  const c = candidatesAt(sc, pv, { ...pickOpts(s), lineTol: 0 }).find((k) => k.kind === "corner");
  return (c ? pointOf(lookup(sc), c.ref) : null) ?? free;
}

/** The pointer went up after a drag: a handle drag that made a value is done as one step and the operation stays open; moving the rotator's centre is not a step. */
export function doDragEnd(s: AppState, env?: Env): AppState {
  if (s.box) return env ? finishBox(s, env) : { ...s, box: null };
  const d = s.drag;
  const cleared: AppState = { ...s, drag: null, dragHint: null, orthoDebt: 0 };
  if (d && "body" in d && s.op) {
    // a body dragged free: it is moved by what it was taken, as one step (`in_291`)
    const free = s.op.free;
    if (!free || (!free[0] && !free[1] && !free[2])) return { ...cleared, op: null };
    const made = runOp(s.session, s.op);
    return made ? { ...cleared, session: made.session, op: null, spread: null, hoverPoint: null } : { ...cleared, op: null };
  }
  if (!d || !("handle" in d) || !s.op) return cleared; // (a handle of a repeat being set up only set its numbers)
  if (d.handle.kind === "ball") return s.op.auto ? { ...cleared, op: null } : cleared;
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
  if (next.message && next.history === s.session.history) return { ...cleared, session: next, op: s.op.auto ? null : s.op };
  return { ...cleared, session: next, op: s.op.auto ? null : { ...s.op, value: null, typed: "" }, spread: null, hoverPoint: null };
}

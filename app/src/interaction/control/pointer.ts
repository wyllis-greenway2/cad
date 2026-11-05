// The pointer intents: hover, click (selecting, or drawing when a tool is armed, or finishing an operation) and the menu.
import type { Intent } from "../../shared/input.ts";
import type { Ref } from "../../shared/ref.ts";
import { dist } from "../../math/vec.ts";
import type { Plane } from "../../operation/part.ts";
import { lookup } from "../../operation/scene.ts";
import type { Scene } from "../../operation/scene.ts";
import { scene as sceneOf, selection as selectionOf, clickOn, hoverOn, run } from "../session.ts";
import type { Session } from "../session.ts";
import { candidatesAt } from "../picking.ts";
import { actionsFor } from "../actions.ts";
import type { ToolKind } from "../tools.ts";
import { snapOnPlane, finish, planeForDrawing } from "../tools.ts";
import type { OpKind } from "../operations.ts";
import { startOp } from "../operations.ts";
import { projector } from "../camera.ts";
import { settings } from "../../shared/settings.ts";
import { planeOf, objectOf } from "../objects.ts";
import type { AppState, Env, MenuItem } from "./state.ts";
import { pickOpts, withSession, surfacePoint, planeView, animateTo } from "./state.ts";
import { commitFigure, commitOp } from "./modal.ts";
import { doGizmoHover, gizmoOf } from "./handles.ts";
import { hasGizmo, hitHandle } from "../gizmo.ts";

/** The operations a right click offers (`in_133`): the drawing tools, push / pull (an extrude, for a drawn figure), fillet / chamfer, move, rotate, scale and delete. The ones that cannot start from the selection are there too, dimmed, with the reason. */
const RING: { id: string; label: string; icon: string; op?: OpKind; tool?: ToolKind }[] = [
  { id: "tool:rect", label: "Rectangle", icon: "rect", tool: "rect" },
  { id: "tool:circle", label: "Circle", icon: "circle", tool: "circle" },
  { id: "tool:line", label: "Line", icon: "line", tool: "line" },
  { id: "op:pushpull", label: "Push / pull", icon: "pushpull", op: "pushpull" },
  { id: "op:edge", label: "Fillet / chamfer", icon: "edge", op: "edge" },
  { id: "op:move", label: "Move", icon: "move", op: "move" },
  { id: "op:rotate", label: "Rotate", icon: "rotate", op: "rotate" },
  { id: "op:scale", label: "Scale", icon: "scale", op: "scale" },
  { id: "delete", label: "Delete", icon: "trash" },
];
function menuFor(session: Session, x: number, y: number): AppState["menu"] {
  const sc = sceneOf(session);
  const sel = selectionOf(session);
  const items: MenuItem[] = RING.map((r) => {
    if (r.tool) return { id: r.id, label: r.label, icon: r.icon, enabled: true, why: null };
    if (r.op) { const st = startOp(sc, sel, r.op); return { id: r.id, label: r.label, icon: r.icon, enabled: st.ok, why: st.ok ? null : st.why }; }
    const del = actionsFor(sc, sel).find((a) => a.id === "delete");
    return { id: r.id, label: r.label, icon: r.icon, enabled: !!del?.enabled, why: del?.why ?? "select something to delete" };
  });
  return { x, y, items };
}

/** The first of these parts that has a plane (a surface a figure can be drawn on). */
function drawingPlane(sc: Scene, refs: readonly Ref[]): Ref | null {
  const get = lookup(sc);
  for (const r of refs) {
    const pl = planeOf(get, r);
    if (pl) return pl.ref;
  }
  return null;
}

export function doHover(s: AppState, i: Extract<Intent, { type: "hover" }>, env: Env): AppState {
  const sc = sceneOf(s.session);
  const pv = projector(s.cam, env.w, env.h).view(i.x, i.y);
  const c = candidatesAt(sc, pv, pickOpts())[0];
  const point = c && c.rank === 2 ? surfacePoint(pv, c.score) : null;
  let next: AppState = { ...withSession(s, hoverOn(s.session, c?.ref)), hoverPoint: point };
  if (s.tool?.plane) {
    const pl = sc.parts[s.tool.plane];
    const at = pl && pl.kind === "plane" ? snapOnPlane(sc, pv, pl) : null;
    if (at) next = { ...next, tool: { ...s.tool, cursor: at } };
  }
  return doGizmoHover(next, i.x, i.y, env);
}

/** A click while a tool is armed: the first sets the plane and the first point, later ones place corners or finish the figure. */
function clickWithTool(base: AppState, i: Extract<Intent, { type: "click" }>, env: Env, refs: Ref[]): AppState {
  const t = base.tool!;
  const sess = base.session;
  const sc = sceneOf(sess);
  const pv = projector(base.cam, env.w, env.h).view(i.x, i.y);
  if (!t.points.length) {
    // the plane chosen from the pencil bubble, else the surface under the click takes the drawing, from wherever the camera is; with none under it, the selected plane does
    const planeRef = drawingPlane(sc, refs) ?? drawingPlane(sc, selectionOf(sess));
    const pl = planeRef ? (lookup(sc)(planeRef) as Plane) : null;
    const at = pl ? snapOnPlane(sc, pv, pl) : null;
    if (!pl || !at) return { ...base, session: { ...sess, message: "click on a surface to draw on" } };
    const { plane, command } = planeForDrawing(sc, pl.ref);
    const session = command ? run(sess, command) : sess;
    return { ...base, session: { ...session, message: null }, tool: { ...t, plane, points: [at], cursor: at } };
  }
  const at = snapOnPlane(sc, pv, sc.parts[t.plane!] as Plane);
  if (!at) return base;
  if (t.kind !== "line") return commitFigure(base, finish(sc, { ...t, cursor: at }));
  const last = t.points[t.points.length - 1]!;
  if (t.points.length >= 3 && dist(at, t.points[0]!) < 1e-6) return commitFigure(base, finish(sc, t, true)); // back on the first corner: closed
  if (dist(at, last) < 1e-6) return i.count >= 2 && t.points.length >= 2 ? commitFigure(base, finish(sc, t)) : base; // a double click ends the line
  return { ...base, tool: { ...t, points: [...t.points, at], cursor: at, typed: ["", ""] } };
}

export function doClick(s: AppState, i: Extract<Intent, { type: "click" }>, env: Env): AppState {
  const sc = sceneOf(s.session);
  const pv = projector(s.cam, env.w, env.h).view(i.x, i.y);
  const cands = candidatesAt(sc, pv, pickOpts());
  const refs = cands.map((c) => c.ref);
  const base: AppState = { ...s, menu: null, focus: null, pendingLook: i.count >= 2 ? s.pendingLook : null };
  if (s.tool) return clickWithTool(base, i, env, refs);
  if (s.op && !hasGizmo(s.op.kind)) return commitOp(base); // the dimension number chip: a click finishes it
  // the handles are dragged, so a click on one does nothing (it must not reselect what is under it)
  const g = gizmoOf(s);
  if (g && hitHandle(g, projector(s.cam, env.w, env.h).project, i.x, i.y)) return base;
  // a click anywhere else, blank space too, leaves an operation you started, and then acts as a normal click
  return doClickSelect(s.op ? { ...base, op: null, drag: null, gizmoHover: null } : base, i, env, cands, refs, pv);
}

/** A normal click: select what is under it (cycling where things overlap), two clicks look straight at the plane, three select the whole object. */
function doClickSelect(base: AppState, i: Extract<Intent, { type: "click" }>, env: Env, cands: ReturnType<typeof candidatesAt>, refs: Ref[], pv: ReturnType<ReturnType<typeof projector>["view"]>): AppState {
  const sess = base.session;
  const sc = sceneOf(sess);
  const get = lookup(sc);
  if (refs.length <= 1 && i.count === 2) {
    // two clicks: look straight at the plane clicked, from the side you are on; the selection stays as the first click left it
    const pl = refs[0] ? planeOf(get, refs[0]) : null;
    return pl ? { ...base, pendingLook: { plane: pl, due: env.now + settings.input.multiClickMs } } : base; // waits to see whether a third click comes
  }
  // the infinite world planes are only a surface for the ring to land on and for a tool to draw on: a click on one selects nothing (like a click on empty space)
  const selectable = refs.filter((r) => !(sc.parts[r]?.origin === "world" && sc.parts[r]?.kind === "plane"));
  if (refs.length <= 1 && i.count >= 3) {
    // three: the whole object
    const o = selectable[0] ? objectOf(sc, selectable[0]) : undefined;
    return o ? withSession({ ...base, pendingLook: null }, { ...sess, click: { selection: [o], spot: sess.click.spot }, message: null }) : base; // and the view does not turn
  }
  const next = clickOn(sess, selectable, i.shift);
  const top = selectionOf(next).at(-1);
  const hit = cands.find((c) => c.ref === top);
  const point = hit && hit.rank === 2 ? surfacePoint(pv, hit.score) : null;
  return { ...withSession(base, next), spread: hit && point ? { ref: hit.ref, point, startMs: env.now } : null };
}

export function doMenu(s: AppState, i: Extract<Intent, { type: "menu" }>, env: Env): AppState {
  const sc = sceneOf(s.session);
  const cands = i.button ? [] : candidatesAt(sc, projector(s.cam, env.w, env.h).view(i.x, i.y), pickOpts()); // the menu button works on the selection, not on what is under it
  let session = s.session;
  const first = cands.find((c) => !(sc.parts[c.ref]?.origin === "world" && sc.parts[c.ref]?.kind === "plane"))?.ref; // (a world plane is never selected)
  if (first && !selectionOf(session).includes(first)) session = clickOn(session, [first], false); // a right click on something selects it, as usual
  return { ...withSession(s, session), menu: menuFor(session, i.x, i.y) };
}

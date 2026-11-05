// The pointer intents: hover, click (selecting, or drawing when a tool is armed, or finishing an operation) and the menu.
import type { Intent } from "../../shared/input.ts";
import type { Ref } from "../../shared/ref.ts";
import type { Vec3 } from "../../math/vec.ts";
import type { Plane } from "../../operation/part.ts";
import { lookup } from "../../operation/scene.ts";
import type { Scene } from "../../operation/scene.ts";
import { scene as sceneOf, selection as selectionOf, clickOn, hoverOn, run } from "../session.ts";
import type { Session } from "../session.ts";
import { candidatesAt } from "../picking.ts";
import { actionsFor } from "../actions.ts";
import type { ToolKind, Tool } from "../tools.ts";
import { snapOnPlane, finish, planeForDrawing, placeAt, figureTool } from "../tools.ts";
import type { OpKind } from "../operations.ts";
import { startOp, OP_LABEL } from "../operations.ts";
import { projector } from "../camera.ts";
import { settings } from "../../shared/settings.ts";
import { planeOf, objectOf } from "../objects.ts";
import type { AppState, Env, MenuItem } from "./state.ts";
import { pickOpts, withSession, surfacePoint, planeView, animateTo } from "./state.ts";
import { commitOp } from "./modal.ts";
import { doGizmoHover, gizmoOf } from "./handles.ts";
import { hasGizmo, hitHandle } from "../gizmo.ts";

const TOOL_LABEL: Record<ToolKind, string> = { rect: "Rectangle", circle: "Circle", line: "Line" };
const OPS: OpKind[] = ["extrude", "pushpull", "edge", "move", "rotate", "scale", "dimension"];

/** The menu: what applies to the selection (relations, delete), the operations that can start from it, and the drawing tools. */
function menuFor(session: Session, x: number, y: number): AppState["menu"] {
  const sc = sceneOf(session);
  const sel = selectionOf(session);
  const items: MenuItem[] = actionsFor(sc, sel).map((a) => ({ id: a.id, label: a.label, enabled: a.enabled, why: a.why, group: "action" as const }));
  for (const k of OPS) if (startOp(sc, sel, k).ok) items.push({ id: `op:${k}`, label: OP_LABEL[k], enabled: true, why: null, group: "op" });
  for (const k of ["rect", "circle", "line"] as const) items.push({ id: `tool:${k}`, label: TOOL_LABEL[k], enabled: true, why: null, group: "tool" });
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
  if (s.tool?.plane && !s.tool.placed) {
    const pl = sc.parts[s.tool.plane];
    const at = pl && pl.kind === "plane" ? snapOnPlane(sc, pv, pl) : null;
    if (at) next = { ...next, tool: { ...s.tool, cursor: at } };
  }
  return doGizmoHover(next, i.x, i.y, env);
}

/** The figure is made where the first click lands, at a small size, and stays selected; the ball on its other defining point sizes it (`dec_sketch_place_then_drag`). */
function placeFigure(base: AppState, t: Tool, plane: Ref, at: Vec3): AppState {
  const sc = sceneOf(base.session);
  const pl = sc.parts[plane] as Plane;
  const placed = placeAt(t, pl, at);
  const fin = finish(sc, figureTool(placed));
  if (!fin) return base;
  const next = run(base.session, fin.command);
  if (next.message) return { ...base, session: next };
  const sel = fin.select.filter((r) => r in sceneOf(next).parts);
  return { ...base, session: { ...next, click: { ...next.click, selection: sel }, message: null }, tool: placed, spread: null };
}

/** A click while a tool is armed: on a surface it makes the figure there (the plane chosen from the pencil bubble, else the surface under the click, else the selected plane). */
function clickWithTool(base: AppState, i: Extract<Intent, { type: "click" }>, env: Env, refs: Ref[]): AppState {
  const t = base.tool!;
  const sess = base.session;
  const sc = sceneOf(sess);
  const pv = projector(base.cam, env.w, env.h).view(i.x, i.y);
  const planeRef = t.plane ?? drawingPlane(sc, refs) ?? drawingPlane(sc, selectionOf(sess));
  const pl = planeRef ? (lookup(sc)(planeRef) as Plane) : null;
  const at = pl ? snapOnPlane(sc, pv, pl) : null;
  if (!pl || !at) return { ...base, session: { ...sess, message: "click on a surface to draw on" } };
  const { plane, command } = planeForDrawing(sc, pl.ref);
  const session = command ? run(sess, command) : sess;
  return placeFigure({ ...base, session }, t, plane, at);
}

export function doClick(s: AppState, i: Extract<Intent, { type: "click" }>, env: Env): AppState {
  const sc = sceneOf(s.session);
  const pv = projector(s.cam, env.w, env.h).view(i.x, i.y);
  const cands = candidatesAt(sc, pv, pickOpts());
  const refs = cands.map((c) => c.ref);
  const base: AppState = { ...s, menu: null, focus: null, pendingLook: i.count >= 2 ? s.pendingLook : null };
  if (s.tool && !s.tool.placed) return clickWithTool(base, i, env, refs);
  if (s.tool) {
    // the figure is made: a click on its ball does nothing (it is dragged), a click anywhere else ends the drawing and then acts as a normal click
    const g = gizmoOf(s);
    if (g && hitHandle(g, projector(s.cam, env.w, env.h).project, i.x, i.y)) return base;
    return doClickSelect({ ...base, tool: null }, i, env, cands, refs, pv);
  }
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
  const first = cands[0]?.ref;
  if (first && !selectionOf(session).includes(first)) session = clickOn(session, [first], false); // a right click on something selects it, as usual
  return { ...withSession(s, session), menu: menuFor(session, i.x, i.y) };
}

// The pointer intents: hover, click (selecting, or drawing when a tool is armed, or finishing an operation) and the menu.
import type { Intent } from "../../shared/input.ts";
import type { Ref } from "../../shared/ref.ts";
import { dist, dot, sub } from "../../math/vec.ts";
import type { Plane } from "../../operation/part.ts";
import { normalOfPlane } from "../../operation/part.ts";
import { lookup } from "../../operation/scene.ts";
import type { Scene } from "../../operation/scene.ts";
import { scene as sceneOf, selection as selectionOf, clickOn, hoverOn, run } from "../session.ts";
import type { Session } from "../session.ts";
import { candidatesAt } from "../picking.ts";
import { actionsFor } from "../actions.ts";
import type { ToolKind } from "../tools.ts";
import { snapOnPlane, finish, planeForDrawing, armTool } from "../tools.ts";
import type { OpKind } from "../operations.ts";
import { startOp } from "../operations.ts";
import { projector } from "../camera.ts";
import { settings } from "../../shared/settings.ts";
import { planeOf, objectOf } from "../objects.ts";
import type { AppState, Env, MenuItem } from "./state.ts";
import { pickOpts, withSession, surfacePoint, planeView, animateTo } from "./state.ts";
import { commitFigure, commitOp, setRepeatAxis } from "./modal.ts";
import { doGizmoHover, gizmoOf } from "./handles.ts";
import { hasGizmo, hitHandle } from "../gizmo.ts";

/** The operations a right click offers (`in_133`), in categories (`in_143`): sketching, constraints, shape, moving and repeating, and delete. The ones that cannot start from the selection are there too, dimmed, with the reason. */
const LEAVES: { id: string; label: string; icon: string; op?: OpKind; tool?: ToolKind }[] = [
  { id: "tool:rect", label: "Rectangle", icon: "rect", tool: "rect" },
  { id: "tool:circle", label: "Circle", icon: "circle", tool: "circle" },
  { id: "tool:line", label: "Line", icon: "line", tool: "line" },
  { id: "tool:arc", label: "Curve", icon: "arc", tool: "arc" },
  { id: "op:pushpull", label: "Push / pull", icon: "pushpull", op: "pushpull" },
  { id: "op:edge", label: "Fillet / chamfer", icon: "edge", op: "edge" },
  { id: "op:scale", label: "Scale", icon: "scale", op: "scale" },
  { id: "op:move", label: "Move", icon: "move", op: "move" },
  { id: "op:rotate", label: "Rotate", icon: "rotate", op: "rotate" },
  { id: "op:copy", label: "Copy", icon: "copy", op: "copy" },
  { id: "op:linear", label: "Linear repeat", icon: "linear", op: "linear" },
  { id: "op:circular", label: "Circular repeat", icon: "circular", op: "circular" },
];
const CATEGORIES: { id: string; label: string; icon: string; items: string[] }[] = [
  { id: "sketch", label: "Sketch", icon: "sketch", items: ["tool:rect", "tool:circle", "tool:line", "tool:arc"] },
  { id: "shape", label: "Shape", icon: "body", items: ["op:pushpull", "op:edge", "op:scale"] },
  { id: "place", label: "Move and repeat", icon: "move", items: ["op:move", "op:rotate", "op:copy", "op:linear", "op:circular"] },
];
/** While a repeat is open only drawing, Move and Rotate (and constraints) are offered (the rest could change what is being repeated or the pivot's parts). */
const IN_REPEAT = new Set(["tool:rect", "tool:circle", "tool:line", "tool:arc", "op:move", "op:rotate"]);
const category = (id: string, label: string, icon: string, kids: MenuItem[]): MenuItem => {
  const first = kids.find((k) => k.enabled);
  return { id, label, icon, enabled: !!first, why: first ? null : kids[0]?.why ?? "nothing here applies", children: kids };
};
function menuFor(session: Session, x: number, y: number, repeating = false): AppState["menu"] {
  const sc = sceneOf(session);
  const sel = selectionOf(session);
  const leaf = new Map<string, MenuItem>(LEAVES.map((r) => {
    const base = { id: r.id, label: r.label, icon: r.icon };
    if (repeating && !IN_REPEAT.has(r.id)) return [r.id, { ...base, enabled: false, why: "apply or cancel the repeat that is open first" }];
    if (r.tool) return [r.id, { ...base, enabled: true, why: null }];
    const st = startOp(sc, sel, r.op!);
    return [r.id, { ...base, enabled: st.ok, why: st.ok ? null : st.why }];
  }));
  const acts = actionsFor(sc, sel);
  const rels: MenuItem[] = acts.filter((a) => a.group === "relation" && a.enabled).map((a) => ({ id: a.id, label: a.label, icon: a.id, enabled: true, why: null }));
  const del = acts.find((a) => a.id === "delete");
  const items: MenuItem[] = [
    ...CATEGORIES.slice(0, 1).map((c) => category(c.id, c.label, c.icon, c.items.map((i) => leaf.get(i)!))),
    category("constraints", "Constraints", "constraint", rels.length ? rels : [{ id: "none", label: "Constraints", icon: "constraint", enabled: false, why: "select the parts to constrain (a line, a corner, two lines …)" }]),
    ...CATEGORIES.slice(1).map((c) => category(c.id, c.label, c.icon, c.items.map((i) => leaf.get(i)!))),
    { id: "delete", label: "Delete", icon: "trash", enabled: !!del?.enabled, why: del?.why ?? "select something to delete" },
  ];
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
  if (t.kind === "arc" && t.points.length < 2) {
    // an arc: the second click is its other end, the third sets how far it bows out (the pointer's distance from the chord)
    return dist(at, t.points[0]!) < 1e-6 ? base : { ...base, tool: { ...t, points: [...t.points, at], cursor: at, typed: ["", ""] } };
  }
  // a rectangle, a circle, a line: the second click finishes it and the tool is put away (a line is one segment: leave it open, or draw the next to close a shape)
  const done = t.kind === "line" ? (dist(at, t.points[0]!) < 1e-6 ? base : commitFigure(base, finish(sc, { ...t, points: [t.points[0]!, at], cursor: at }))) : commitFigure(base, finish(sc, { ...t, cursor: at }));
  // sketching goes on while you keep clicking on vertices (`in_150`): a figure finished on an existing vertex leaves the same tool ready (a line starts its next segment from that vertex); finished anywhere else, the tool is put away
  const vertex = refs.map((r) => sc.parts[r]).find((p) => p?.kind === "corner" && p.origin === "drawn");
  if (!vertex || vertex.kind !== "corner" || done === base || done.tool || done.session.message) return done;
  return { ...done, tool: t.kind === "line" ? { ...armTool("line"), plane: t.plane, points: [vertex.at], cursor: vertex.at } : armTool(t.kind) };
}

export function doClick(s: AppState, i: Extract<Intent, { type: "click" }>, env: Env): AppState {
  const sc = sceneOf(s.session);
  const pv = projector(s.cam, env.w, env.h).view(i.x, i.y);
  const cands = candidatesAt(sc, pv, pickOpts());
  const refs = cands.map((c) => c.ref);
  const base: AppState = { ...s, menu: null, focus: null };
  if (s.tool) return clickWithTool(base, i, env, refs);
  if (s.op && !hasGizmo(s.op.kind)) return commitOp(base); // the dimension number chip: a click finishes it
  // the handles are dragged, so a click on one does nothing (it must not reselect what is under it)
  const g = gizmoOf(s);
  const hit = g ? hitHandle(g, projector(s.cam, env.w, env.h).project, i.x, i.y) : null;
  if (hit) return s.repeat && !s.op && hit.id.startsWith("rot:") ? setRepeatAxis(base, "xyz".indexOf(hit.id[4]!)) : base; // (a click on a ring of a repeat makes that the axis)
  // a click anywhere else, blank space too, leaves an operation you started, and then acts as a normal click
  return doClickSelect(s.op ? { ...base, op: null, drag: null, gizmoHover: null } : base, i, env, cands, refs, pv);
}

/** A normal click: select what is under it (cycling where things overlap), two select the whole object, three look straight at the plane. */
function doClickSelect(base: AppState, i: Extract<Intent, { type: "click" }>, env: Env, cands: ReturnType<typeof candidatesAt>, refs: Ref[], pv: ReturnType<ReturnType<typeof projector>["view"]>): AppState {
  const sess = base.session;
  const sc = sceneOf(sess);
  const get = lookup(sc);
  // a sketch drawn on a face of the body lies in the same plane as that face: the two are one surface for looking at it and for selecting the whole object
  const planes = refs.map((r) => planeOf(get, r));
  const onePlane = refs.length <= 1 || (planes.every((q) => !!q) && planes.every((q) => Math.abs(dot(normalOfPlane(q!), normalOfPlane(planes[0]!)) - 1) < 1e-6 && Math.abs(dot(normalOfPlane(q!), sub(q!.at, planes[0]!.at))) < 1e-3));
  // the infinite world planes are only a surface for the ring to land on and for a tool to draw on: a click on one selects nothing (like a click on empty space)
  const selectable = refs.filter((r) => !(sc.parts[r]?.origin === "world" && sc.parts[r]?.kind === "plane"));
  if (onePlane && i.count === 2) {
    // two: the whole object (the view does not turn)
    const o = selectable[0] ? objectOf(sc, selectable[0]) : undefined;
    return o ? withSession(base, { ...sess, click: { selection: [o], spot: sess.click.spot }, message: null }) : base;
  }
  if (onePlane && i.count >= 3) {
    // three: only the face (the second click had taken the whole object), and the view turns straight to it from the side you are on
    const pl = refs[0] ? planeOf(get, refs[0]) : null;
    if (!pl) return base;
    const only = selectable[0] ? withSession(base, { ...sess, click: { selection: [selectable[0]], spot: sess.click.spot }, message: null }) : base;
    return animateTo(only, planeView(base.cam, pl, false), env.now);
  }
  const next = clickOn(sess, selectable, i.shift);
  const top = selectionOf(next).at(-1);
  const hit = cands.find((c) => c.ref === top);
  const point = hit && hit.rank === 2 ? surfacePoint(pv, hit.score) : null;
  return { ...withSession(base, next), spread: hit && point ? { ref: hit.ref, point, startMs: env.now } : null };
}

/** A right click opens the ring of operations on what is selected and changes nothing about the selection (`in_140`): select first (one click, a triple click, Shift for several), then right click. */
export function doMenu(s: AppState, i: Extract<Intent, { type: "menu" }>): AppState {
  return { ...s, menu: menuFor(s.session, i.x, i.y, !!s.repeat) };
}

// The controller: applies one intent to the app state. All behaviour of the pointer, the click grammar, the camera and the menu is decided here, in plain
// functions (`inv_no_logic_in_ui`): the UI only draws the state and the platform only reports devices.
import type { Intent } from "../shared/input.ts";
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub } from "../math/vec.ts";
import { settings } from "../shared/settings.ts";
import { worldRef } from "../shared/ref.ts";
import type { Part, Plane, Lookup } from "../operation/part.ts";
import { normalOfPlane } from "../operation/part.ts";
import { lookup } from "../operation/scene.ts";
import type { Scene } from "../operation/scene.ts";
import type { Session } from "./session.ts";
import { scene as sceneOf, selection as selectionOf, clickOn, hoverOn, clearSelection, run, undoLast, redoLast } from "./session.ts";
import { initialClick } from "./selection.ts";
import { candidatesAt } from "./picking.ts";
import { actionsFor } from "./actions.ts";
import type { Tool, ToolKind } from "./tools.ts";
import { armTool, snapOnPlane, typeKey, finish, planeForDrawing, lineNext } from "./tools.ts";
import type { Op, OpKind } from "./operations.ts";
import { startOp, startEdit, typeOp, valueOf, opCommand, distanceFromPointer, OP_LABEL } from "./operations.ts";
import type { Camera } from "./camera.ts";
import { homeCamera, orbit, pan, zoomAt, lookStraight, lookAlternating, blend, easeInOut, projector, offsetOf } from "./camera.ts";
import { dot } from "../math/vec.ts";
import { pivotOf, planeOf, objectOf } from "./objects.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import { dist } from "../math/vec.ts";
export { pivotOf, planeOf, objectOf };

export interface MenuItem { id: string; label: string; enabled: boolean; why: string | null; group: "action" | "op" | "tool" }
export interface AppState {
  session: Session;
  cam: Camera;
  anim: { from: Camera; to: Camera; t0: number } | null;
  /** the last clicked surface spreads its colour from where it was clicked */
  spread: { ref: Ref; point: Vec3; startMs: number } | null;
  /** the point under the pointer on the hovered surface (for the ring) */
  hoverPoint: Vec3 | null;
  menu: { x: number; y: number; items: MenuItem[] } | null;
  /** the drawing tool being used (null = normal selection) */
  tool: Tool | null;
  /** the operation being set up (extrude, round, bevel, move, rotate, scale, dimension, edit) */
  op: Op | null;
  /** the relation whose badge is open: the other parts it ties show in amber */
  focus: string | null;
}
export interface Env { w: number; h: number; now: number }

export const createState = (session: Session): AppState => ({ session, cam: homeCamera(), anim: null, spread: null, hoverPoint: null, menu: null, tool: null, op: null, focus: null });

const pickOpts = () => ({ pointTol: settings.pick.pointPx, lineTol: settings.pick.linePx });

const withSession = (s: AppState, session: Session): AppState => ({ ...s, session });
const stop = (s: AppState): AppState => (s.anim ? { ...s, anim: null } : s);
const surfacePoint = (pv: { ray?: { o: Vec3; d: Vec3 } }, t: number): Vec3 | null => (pv.ray ? add(pv.ray.o, scale(pv.ray.d, t)) : null);

const planeView = (cam: Camera, pl: Plane, alternate: boolean): Camera => {
  const n = normalOfPlane(pl);
  if (alternate) return lookAlternating(cam, n, pl.u);
  return lookStraight(cam, n, pl.u, dot(offsetOf(cam), n) >= 0 ? 1 : -1); // from the side you are on
};
const animateTo = (s: AppState, to: Camera, now: number): AppState => ({ ...s, anim: { from: s.cam, to, t0: now } });

const WORLD_PLANE = { X: "YZ", Y: "XZ", Z: "XY" } as const; // X looks along the X axis: at the plane across it

const TOOL_LABEL: Record<ToolKind, string> = { rect: "Rectangle", circle: "Circle", line: "Line" };
const OPS: OpKind[] = ["extrude", "round", "bevel", "move", "rotate", "scale", "dimension"];

/** The menu: what applies to the selection (relations, delete), the operations that can start from it, and the drawing tools. */
function menuFor(session: Session, x: number, y: number): AppState["menu"] {
  const sc = sceneOf(session);
  const sel = selectionOf(session);
  const items: MenuItem[] = actionsFor(sc, sel).map((a) => ({ id: a.id, label: a.label, enabled: a.enabled, why: a.why, group: "action" as const }));
  for (const k of OPS) {
    const r = startOp(sc, sel, k);
    if (r.ok) items.push({ id: `op:${k}`, label: OP_LABEL[k], enabled: true, why: null, group: "op" });
  }
  for (const k of ["rect", "circle", "line"] as const) items.push({ id: `tool:${k}`, label: TOOL_LABEL[k], enabled: true, why: null, group: "tool" });
  return { x, y, items };
}

/** The surface under a click that a figure can be drawn on: its plane, as the scene's own (a face of the body becomes a drawn plane copy). */
function drawingPlane(sc: Scene, refs: Ref[]): Ref | null {
  const get = lookup(sc);
  for (const r of refs) {
    const pl = planeOf(get, r);
    if (pl) return pl.ref;
  }
  return null;
}

function beginTool(s: AppState, kind: ToolKind): AppState {
  if (s.tool?.kind === kind && !s.tool.plane) return { ...s, tool: null }; // pressing it again puts it away
  return { ...s, tool: armTool(kind), op: null, menu: null };
}
function beginOp(s: AppState, kind: OpKind): AppState {
  const r = startOp(sceneOf(s.session), selectionOf(s.session), kind);
  if (!r.ok) return { ...s, session: { ...s.session, message: r.why }, menu: null };
  return { ...s, op: r.op, tool: null, menu: null, session: { ...s.session, message: null } };
}
/** Put a finished figure into the scene and hand back to normal selection with the figure selected. */
function commitFigure(s: AppState, fin: ReturnType<typeof finish>): AppState {
  if (!fin) return s;
  const next = run(s.session, fin.command);
  if (next.message) return { ...s, session: next };
  const sel = fin.select.filter((r) => r in sceneOf(next).parts);
  return { ...s, session: { ...next, click: { ...next.click, selection: sel } }, tool: null, spread: null };
}
function commitOp(s: AppState): AppState {
  if (!s.op) return s;
  const cmd = opCommand(sceneOf(s.session), s.op);
  if (!cmd) return s;
  const next = run(s.session, cmd);
  if (next.message) return { ...s, session: next };
  if (s.op.kind === "dimension" || s.op.kind === "edit") return { ...s, session: next, op: null }; // a number on a relation: the selection stays, so its badge shows
  const object = BODY_OBJECT in sceneOf(next).parts ? [BODY_OBJECT] : [];
  return { ...s, session: { ...next, click: { ...next.click, selection: object } }, op: null };
}

export function reduce(s: AppState, i: Intent, env: Env): AppState {
  const sess = s.session;
  const sc = sceneOf(sess);
  const get = lookup(sc);
  const pr = () => projector(s.cam, env.w, env.h);
  switch (i.type) {
    case "hover": {
      const pv = pr().view(i.x, i.y);
      const c = candidatesAt(sc, pv, pickOpts())[0];
      const point = c && c.rank === 2 ? surfacePoint(pv, c.score) : null;
      let next: AppState = { ...withSession(s, hoverOn(sess, c?.ref)), hoverPoint: point };
      if (s.tool?.plane) {
        const pl = sc.parts[s.tool.plane];
        const at = pl && pl.kind === "plane" ? snapOnPlane(sc, pv, pl) : null;
        if (at) next = { ...next, tool: { ...s.tool, cursor: at } };
      } else if (s.op && s.op.kind === "extrude" && s.op.typed === "") {
        const v = distanceFromPointer(s.op, pv);
        if (v !== null) next = { ...next, op: { ...s.op, value: v } };
      }
      return next;
    }
    case "hoverEnd":
      return { ...withSession(s, hoverOn(sess, undefined)), hoverPoint: null };
    case "click": {
      const pv = pr().view(i.x, i.y);
      const cands = candidatesAt(sc, pv, pickOpts());
      const refs = cands.map((c) => c.ref);
      const base: AppState = { ...s, menu: null, focus: null };
      if (s.op) return commitOp(base);
      if (s.tool) {
        const t = s.tool;
        if (!t.plane) {
          // the first click: the surface under it takes the drawing, from wherever the camera is
          const planeRef = drawingPlane(sc, refs);
          const pl = planeRef ? (get(planeRef) as Plane) : null;
          const at = pl ? snapOnPlane(sc, pv, pl) : null;
          if (!pl || !at) return { ...base, session: { ...sess, message: "click on a surface to draw on" } };
          const { plane, command } = planeForDrawing(sc, pl.ref);
          let session = sess;
          if (command) session = run(session, command);
          return { ...base, session: { ...session, message: null }, tool: { ...t, plane, points: [at], cursor: at } };
        }
        const pl = sc.parts[t.plane] as Plane;
        const at = snapOnPlane(sc, pv, pl);
        if (!at) return base;
        if (t.kind === "line") {
          const last = t.points[t.points.length - 1]!;
          if (t.points.length >= 3 && dist(at, t.points[0]!) < 1e-6) return commitFigure(base, finish(sc, t, true)); // back on the first corner: closed
          if (dist(at, last) < 1e-6) return i.count >= 2 && t.points.length >= 2 ? commitFigure(base, finish(sc, t)) : base; // a double click ends the line
          return { ...base, tool: { ...t, points: [...t.points, at], cursor: at, typed: ["", ""] } };
        }
        return commitFigure(base, finish(sc, { ...t, cursor: at }));
      }
      if (refs.length <= 1 && i.count === 2) {
        // two clicks: look straight at the plane clicked, from the side you are on; the selection stays as the first click left it
        const pl = refs[0] ? planeOf(get, refs[0]) : null;
        return pl ? animateTo(base, planeView(s.cam, pl, false), env.now) : base;
      }
      if (refs.length <= 1 && i.count >= 3) {
        // three: the whole object
        const o = refs[0] ? objectOf(sc, refs[0]) : undefined;
        if (!o) return base;
        return withSession(base, { ...sess, click: { selection: [o], spot: sess.click.spot }, message: null });
      }
      const next = clickOn(sess, refs, i.shift);
      const top = selectionOf(next).at(-1);
      const hit = cands.find((c) => c.ref === top);
      const point = hit && hit.rank === 2 ? surfacePoint(pv, hit.score) : null;
      return { ...withSession(base, next), spread: hit && point ? { ref: hit.ref, point, startMs: env.now } : null };
    }
    case "menu": {
      const pv = pr().view(i.x, i.y);
      const cands = candidatesAt(sc, pv, pickOpts());
      let session = sess;
      const first = cands[0]?.ref;
      if (first && !selectionOf(sess).includes(first)) session = clickOn(sess, [first], false); // a right click on something selects it, as usual
      return { ...withSession(s, session), menu: menuFor(session, i.x, i.y) };
    }
    case "runAction": {
      if (i.id.startsWith("tool:")) return beginTool({ ...s, menu: null }, i.id.slice(5) as ToolKind);
      if (i.id.startsWith("op:")) return beginOp({ ...s, menu: null }, i.id.slice(3) as OpKind);
      const a = actionsFor(sc, selectionOf(sess)).find((x) => x.id === i.id);
      if (!a || !a.enabled) return { ...s, menu: null };
      return { ...withSession(s, run(sess, a.run())), menu: null };
    }
    case "delete": {
      if (s.tool || s.op) return s;
      const a = actionsFor(sc, selectionOf(sess)).find((x) => x.id === "delete");
      return a ? { ...withSession(s, run(sess, a.run())), menu: null } : s;
    }
    case "orbit":
      return { ...stop(s), cam: orbit(s.cam, -i.dx * settings.view.orbitRadPerPx, i.dy * settings.view.orbitRadPerPx, pivotOf(sess)), menu: null };
    case "pan":
      return { ...stop(s), cam: pan(s.cam, i.dx, i.dy, env.h), menu: null };
    case "zoom": {
      let anchor: Vec3 | undefined;
      if (settings.input.zoomToCursor && i.factor < 1) {
        // zoom IN toward the surface under the cursor; zoom OUT is about the view centre (anchoring there would multiply the offset and lose the origin)
        const pv = pr().view(i.x, i.y);
        const c = candidatesAt(sc, pv, pickOpts()).find((x) => x.rank === 2);
        const p = c ? surfacePoint(pv, c.score) : null;
        if (p && Math.hypot(...sub(p, s.cam.target)) <= settings.input.zoomAnchorMaxFactor * s.cam.distance) anchor = p;
      }
      return { ...stop(s), cam: zoomAt(s.cam, i.factor, anchor) };
    }
    case "look": {
      if (s.op && (s.op.kind === "move" || s.op.kind === "rotate") && i.plane !== "N") return { ...s, op: { ...s.op, axis: ({ X: 0, Y: 1, Z: 2 } as const)[i.plane] } };
      if (i.plane === "N") {
        const pl = selectionOf(sess).map((r) => planeOf(get, r)).find((p) => p);
        return pl ? animateTo(s, planeView(s.cam, pl, true), env.now) : withSession(s, { ...sess, message: "select something on a plane first" });
      }
      const ref = worldRef(WORLD_PLANE[i.plane]);
      const pl = get(ref) as Plane;
      const selected: Session = { ...sess, click: { ...initialClick(), selection: [ref] }, message: null };
      return animateTo(withSession(s, selected), planeView(s.cam, pl, true), env.now);
    }
    case "home": {
      const to: Camera = { ...homeCamera(), target: pivotOf(sess) ?? [0, 0, 0] };
      return animateTo(s, to, env.now);
    }
    case "undo": return { ...withSession(s, undoLast(sess)), menu: null };
    case "redo": return { ...withSession(s, redoLast(sess)), menu: null };
    case "escape":
      if (s.menu) return { ...s, menu: null };
      if (s.focus && !s.tool && !s.op) return { ...s, focus: null };
      if (s.tool || s.op) return { ...s, tool: null, op: null };
      return withSession(s, clearSelection(sess));
    case "relation": {
      const rel = i.id ? sc.relations.find((r) => r.id === i.id) : undefined;
      if (i.act === "focus") return { ...s, focus: i.id === s.focus ? null : i.id };
      if (!rel) return s;
      if (i.act === "remove") return { ...withSession(s, run(sess, { type: "removeRelation", id: rel.id })), focus: null };
      if (i.act === "lock") {
        if (rel.value === undefined) return s;
        const action = actionsFor(sc, rel.parts).find((a) => a.id === rel.kind && a.dimensional);
        const value = rel.locked === false ? (action?.measure() ?? rel.value) : rel.value; // locking takes the value it measures now
        return withSession(s, run(sess, { type: "setRelationValue", id: rel.id, value, locked: rel.locked === false }));
      }
      const r = startEdit(sc, rel.id);
      return r.ok ? { ...s, op: r.op, tool: null, menu: null } : s;
    }
    case "begin": {
      if (i.name === "rect" || i.name === "circle" || i.name === "line") return beginTool(s, i.name);
      return beginOp(s, i.name);
    }
    case "typed": {
      if (s.op) {
        if (i.key === "Enter") return commitOp(s);
        return { ...s, op: typeOp(s.op, i.key) };
      }
      const t = s.tool;
      if (!t || !t.plane) return s;
      if (i.key === "Enter") {
        if (t.kind === "line") {
          const nx = t.typed[0] !== "" ? lineNext(t) : null;
          if (nx) return { ...s, tool: { ...t, points: [...t.points, nx], typed: ["", ""] } };
          return commitFigure(s, finish(sc, t));
        }
        return commitFigure(s, finish(sc, t));
      }
      return { ...s, tool: typeKey(t, i.key) };
    }
  }
}

/** Advance the camera animation to time `now`. */
export function advance(s: AppState, now: number): AppState {
  if (!s.anim) return s;
  const k = Math.min(1, (now - s.anim.t0) / settings.view.transitionMs);
  if (k >= 1) return { ...s, cam: s.anim.to, anim: null };
  return { ...s, cam: blend(s.anim.from, s.anim.to, easeInOut(k)) };
}

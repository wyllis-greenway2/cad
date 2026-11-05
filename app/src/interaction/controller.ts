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
import type { Camera } from "./camera.ts";
import { homeCamera, orbit, pan, zoomAt, lookStraight, lookAlternating, blend, easeInOut, projector, offsetOf } from "./camera.ts";
import { dot } from "../math/vec.ts";
import { BODY_OBJECT } from "../compiler/body.ts";

export interface MenuItem { id: string; label: string; enabled: boolean; why: string | null }
export interface AppState {
  session: Session;
  cam: Camera;
  anim: { from: Camera; to: Camera; t0: number } | null;
  /** the last clicked surface spreads its colour from where it was clicked */
  spread: { ref: Ref; point: Vec3; startMs: number } | null;
  /** the point under the pointer on the hovered surface (for the ring) */
  hoverPoint: Vec3 | null;
  menu: { x: number; y: number; items: MenuItem[] } | null;
}
export interface Env { w: number; h: number; now: number }

export const createState = (session: Session): AppState => ({ session, cam: homeCamera(), anim: null, spread: null, hoverPoint: null, menu: null });

const pickOpts = () => ({ pointTol: settings.pick.pointPx, lineTol: settings.pick.linePx });

/** The middle of the model: the body's bounding box (a single body for now). */
export function pivotOf(s: Session): Vec3 | undefined {
  const b = s.outcome.kernel?.bbox;
  return b ? [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] : undefined;
}
/** The plane a part lies on or is: a pane or flat face is its own plane, a face or a drawn part has the plane it is drawn on. Null for a body and for loose parts. */
export function planeOf(get: Lookup, ref: Ref): Plane | null {
  const p = get(ref);
  if (!p) return null;
  if (p.kind === "plane") return p;
  const pl = p.plane ? get(p.plane) : undefined;
  return pl && pl.kind === "plane" ? pl : null;
}
/** The whole object a part belongs to: the body for a body part, the closed shape's face for a drawn part (else the part itself). */
export function objectOf(sc: Scene, ref: Ref): Ref {
  const p = sc.parts[ref];
  if (!p) return ref;
  if (p.origin === "body" || p.kind === "body") return BODY_OBJECT in sc.parts ? BODY_OBJECT : ref;
  const faces = Object.values(sc.parts).filter((f): f is Extract<Part, { kind: "face" }> => f.kind === "face");
  const f = faces.find((x) => x.loop.includes(ref) || x.corners.includes(ref) || x.disk === ref || (p.kind === "circle" && x.disk === p.ref));
  return f ? f.ref : ref;
}

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

function menuFor(session: Session, x: number, y: number): AppState["menu"] {
  const items = actionsFor(sceneOf(session), selectionOf(session)).map((a) => ({ id: a.id, label: a.label, enabled: a.enabled, why: a.why }));
  return items.length ? { x, y, items } : null;
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
      return { ...withSession(s, hoverOn(sess, c?.ref)), hoverPoint: point };
    }
    case "hoverEnd":
      return { ...withSession(s, hoverOn(sess, undefined)), hoverPoint: null };
    case "click": {
      const pv = pr().view(i.x, i.y);
      const cands = candidatesAt(sc, pv, pickOpts());
      const refs = cands.map((c) => c.ref);
      const base: AppState = { ...s, menu: null };
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
      const a = actionsFor(sc, selectionOf(sess)).find((x) => x.id === i.id);
      if (!a || !a.enabled) return { ...s, menu: null };
      return { ...withSession(s, run(sess, a.run())), menu: null };
    }
    case "delete": {
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
      return s.menu ? { ...s, menu: null } : withSession(s, clearSelection(sess));
  }
}

/** Advance the camera animation to time `now`. */
export function advance(s: AppState, now: number): AppState {
  if (!s.anim) return s;
  const k = Math.min(1, (now - s.anim.t0) / settings.view.transitionMs);
  if (k >= 1) return { ...s, cam: s.anim.to, anim: null };
  return { ...s, cam: blend(s.anim.from, s.anim.to, easeInOut(k)) };
}

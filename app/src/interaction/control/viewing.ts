// The camera intents: orbit, pan, zoom, look at a plane (X Y Z N), home, the animation, and which plane's grid to show.
import type { Intent } from "../../shared/input.ts";
import type { Vec3 } from "../../math/vec.ts";
import { sub } from "../../math/vec.ts";
import { settings } from "../../shared/settings.ts";
import { worldRef } from "../../shared/ref.ts";
import type { Plane } from "../../operation/part.ts";
import { normalOfPlane } from "../../operation/part.ts";
import { lookup } from "../../operation/scene.ts";
import { scene as sceneOf, selection as selectionOf } from "../session.ts";
import type { Session } from "../session.ts";
import { initialClick } from "../selection.ts";
import { candidatesAt } from "../picking.ts";
import { homeCamera, orbit, pan, zoomAt, blend, easeInOut, projector, sideOf } from "../camera.ts";
import { pivotOf, planeOf } from "../objects.ts";
import type { AppState, Env } from "./state.ts";
import { pickOpts, stop, surfacePoint, planeView, animateTo, withSession } from "./state.ts";

const WORLD_PLANE = { X: "YZ", Y: "XZ", Z: "XY" } as const; // X looks along the X axis: at the plane across it

export const doOrbit = (s: AppState, i: Extract<Intent, { type: "orbit" }>): AppState =>
  ({ ...stop(s), cam: orbit(s.cam, -i.dx * settings.view.orbitRadPerPx, i.dy * settings.view.orbitRadPerPx, pivotOf(s.session)), menu: null });

export const doPan = (s: AppState, i: Extract<Intent, { type: "pan" }>, env: Env): AppState => ({ ...stop(s), cam: pan(s.cam, i.dx, i.dy, env.h), menu: null });

export function doZoom(s: AppState, i: Extract<Intent, { type: "zoom" }>, env: Env): AppState {
  let anchor: Vec3 | undefined;
  if (settings.input.zoomToCursor && i.factor < 1) {
    // zoom IN toward the surface under the cursor; zoom OUT is about the view centre (anchoring there would multiply the offset and lose the origin)
    const pv = projector(s.cam, env.w, env.h).view(i.x, i.y);
    const c = candidatesAt(sceneOf(s.session), pv, pickOpts()).find((x) => x.rank === 2);
    const p = c ? surfacePoint(pv, c.score) : null;
    if (p && Math.hypot(...sub(p, s.cam.target)) <= settings.input.zoomAnchorMaxFactor * s.cam.distance) anchor = p;
  }
  return { ...stop(s), cam: zoomAt(s.cam, i.factor, anchor) };
}

/** X, Y, Z select that axis's plane and look along it; N looks at the plane of the selection; while a move or rotate is being set up they choose its axis. */
export function doLook(s: AppState, i: Extract<Intent, { type: "look" }>, env: Env): AppState {
  const get = lookup(sceneOf(s.session));
  if (s.op && (s.op.kind === "move" || s.op.kind === "rotate") && i.plane !== "N") return { ...s, op: { ...s.op, axis: ({ X: 0, Y: 1, Z: 2 } as const)[i.plane] } };
  if (i.plane === "N") {
    const pl = selectionOf(s.session).map((r) => planeOf(get, r)).find((p) => p);
    return pl ? animateTo(s, planeView(s.cam, pl, true), env.now) : withSession(s, { ...s.session, message: "select something on a plane first" });
  }
  const ref = worldRef(WORLD_PLANE[i.plane]);
  const selected: Session = { ...s.session, click: { ...initialClick(), selection: [ref] }, message: null };
  return animateTo(withSession(s, selected), planeView(s.cam, get(ref) as Plane, true), env.now);
}

export const doHome = (s: AppState, env: Env): AppState => animateTo(s, { ...homeCamera(), target: pivotOf(s.session) ?? [0, 0, 0] }, env.now);

/** Advance the camera animation to time `now`. */
export function advance(s: AppState, now: number): AppState {
  if (s.pendingLook && now >= s.pendingLook.due) return animateTo({ ...s, pendingLook: null }, planeView(s.cam, s.pendingLook.plane, false), now); // no third click came: turn to the plane
  if (!s.anim) return s;
  const k = Math.min(1, (now - s.anim.t0) / settings.view.transitionMs);
  if (k >= 1) return { ...s, cam: s.anim.to, anim: null };
  return { ...s, cam: blend(s.anim.from, s.anim.to, easeInOut(k)) };
}

/** The plane whose grid is shown: when looking straight at a plane, the selected plane (or a part on it) if it faces the camera, else the world plane that does. */
export function gridPlaneOf(s: AppState): Plane | null {
  if (!s.cam.straight) return null;
  const get = lookup(sceneOf(s.session));
  const facing = (pl: Plane) => sideOf(s.cam, normalOfPlane(pl)) !== 0;
  for (const r of selectionOf(s.session)) {
    const pl = planeOf(get, r);
    if (pl && facing(pl)) return pl;
  }
  for (const n of ["XY", "XZ", "YZ"]) {
    const pl = get(worldRef(n)) as Plane;
    if (facing(pl)) return pl;
  }
  return null;
}

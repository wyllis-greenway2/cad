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
import { homeCamera, position, basis, orbit, pan, zoomAt, blend, easeInOut, projector, sideOf } from "../camera.ts";
import { pivotOf, planeOf } from "../objects.ts";
import type { AppState, Env } from "./state.ts";
import { pickOpts, stop, surfacePoint, planeView, animateTo, withSession } from "./state.ts";

const WORLD_PLANE = { X: "YZ", Y: "XZ", Z: "XY" } as const; // X looks along the X axis: at the plane across it

const withoutMix = (c: AppState["cam"]): AppState["cam"] => { const { mix: _unused, ...rest } = c; return rest; };

export function doOrbit(s: AppState, i: Extract<Intent, { type: "orbit" }>): AppState {
  // the view turns about the body in view when there are several, kept for the whole drag (`in_291`)
  const held = s.drag && "camera" in s.drag ? s.drag.pivot : undefined;
  const pivot = held ?? pivotOf(s.session, { from: position(s.cam), dir: basis(s.cam).forward });
  s = { ...s, drag: s.drag && "camera" in s.drag ? { camera: true, ...(pivot ? { pivot } : {}) } : s.drag };
  if (s.cam.straight && !s.anim) {
    // a straight view holds on: the drag is kept back until it is a little way (the perspective is not let in by accident), and then the view turns on from there
    const debt = s.orthoDebt + Math.hypot(i.dx, i.dy);
    if (debt < settings.view.leaveStraightPx) return { ...s, orthoDebt: debt, menu: null };
    const k = Math.min(1, (debt - settings.view.leaveStraightPx) / Math.max(1e-9, Math.hypot(i.dx, i.dy))); // (only what is past the hold turns the view)
    const cam = orbit(s.cam, -i.dx * k * settings.view.orbitRadPerPx, i.dy * k * settings.view.orbitRadPerPx, pivot);
    return { ...stop(s), cam: { ...cam, mix: 0.03 }, orthoDebt: 0, mixT0: -1, menu: null };
  }
  return { ...stop(s), cam: orbit(s.cam, -i.dx * settings.view.orbitRadPerPx, i.dy * settings.view.orbitRadPerPx, pivot), orthoDebt: 0, menu: null };
}

/** W A S D (`in_300`): the view moves along where it looks and across it; the faster the further out it is, so a small part and a big one both go at a pace that can be steered. */
export function doWalk(s: AppState, i: Extract<Intent, { type: "walk" }>): AppState {
  const { forward, right } = basis(s.cam);
  const by = s.cam.distance * 0.9 * i.dt;
  const at = (k: 0 | 1 | 2): number => s.cam.target[k] + (forward[k] * i.forward + right[k] * i.right) * by;
  const target: Vec3 = [at(0), at(1), at(2)];
  return { ...stop(s), cam: { ...s.cam, target, straight: false }, menu: null };
}
/** The view turns about where the eye is, as in a game: the pointer to the right turns it right, up turns it up. */
export function doSwivel(s: AppState, i: Extract<Intent, { type: "swivel" }>): AppState {
  const k = settings.view.orbitRadPerPx;
  return { ...stop(s), cam: orbit(s.cam, -i.dx * k, i.dy * k, position(s.cam)), menu: null, orthoDebt: 0 };
}
export const doPan = (s: AppState, i: Extract<Intent, { type: "pan" }>, env: Env): AppState => ({ ...stop(s), cam: pan(s.cam, i.dx, i.dy, env.h), menu: null });

export function doZoom(s: AppState, i: Extract<Intent, { type: "zoom" }>, env: Env): AppState {
  let anchor: Vec3 | undefined;
  if (settings.input.zoomToCursor) {
    // zoom toward (and away from) the surface under the cursor, so that the same number of clicks back returns the view to where it was (`in_200`); with none under it, about the view centre
    const pv = projector(s.cam, env.w, env.h).view(i.x, i.y);
    const sc = sceneOf(s.session);
    const c = candidatesAt(sc, pv, pickOpts(s)).find((x) => x.rank === 2 && sc.parts[x.ref]?.origin !== "world"); // (the floor is under every pointer: zooming toward it walked the view across the floor with every wheel click, `in_200`)
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
  return animateTo({ ...withSession(s, selected), world: WORLD_PLANE[i.plane] }, planeView(s.cam, get(ref) as Plane, true), env.now); // (the plane that is on changes with it, `in_190`)
}

export const doHome = (s: AppState, env: Env): AppState => animateTo(s, { ...homeCamera(), target: pivotOf(s.session) ?? [0, 0, 0] }, env.now);

/** Advance the camera animation to time `now`. */
export function advance(s: AppState, now: number): AppState {
  if (s.flash && now - s.flash.at >= settings.flash.ms) s = { ...s, flash: null }; // the flash has faded
  if (s.mixT0 !== null) {
    // the perspective coming in after a straight view was left
    const t0 = s.mixT0 < 0 ? now : s.mixT0;
    const k = Math.min(1, (now - t0) / settings.view.perspectiveMs);
    s = k >= 1 ? { ...s, mixT0: null, cam: withoutMix(s.cam) } : { ...s, mixT0: t0, cam: { ...s.cam, mix: 0.03 + (1 - 0.03) * easeInOut(k) } };
  }
  if (!s.anim) return s;
  const k = Math.min(1, (now - s.anim.t0) / settings.view.transitionMs);
  if (k >= 1) return { ...s, cam: s.anim.to, anim: null };
  return { ...s, cam: blend(s.anim.from, s.anim.to, easeInOut(k)) };
}

/** The plane whose grid is shown: when looking straight at a plane, the selected plane (or a part on it) if it faces the camera, else the world plane that does. */
export function gridPlaneOf(s: AppState): Plane | null {
  const get = lookup(sceneOf(s.session));
  const facing = (pl: Plane) => sideOf(s.cam, normalOfPlane(pl)) !== 0;
  if (s.cam.straight) {
    for (const r of selectionOf(s.session)) {
      const pl = planeOf(get, r);
      if (pl && facing(pl)) return pl;
    }
  }
  return (get(worldRef(s.world)) as Plane | undefined) ?? null; // (the world plane that is on always has its grid, `in_190`)
}

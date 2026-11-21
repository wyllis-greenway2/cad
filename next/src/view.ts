// The world view's state and every change of it, as pure functions: (state, what is known now, what happened) in, the next state out.
// No DOM, no clock of its own, no three.js: the controller (main.ts) feeds it intents and the time and draws what it says, so each change can
// be tried on its own.
import { settings } from "./settings.ts";
import * as cam from "./camera.ts";
import { type Axis, type Cam, type Go } from "./camera.ts";
import { type Scene, hitThings } from "./scene.ts";
import { focusOf, gridLevel, lastSeen, nothingInView, paneAt, planeHit, resetTarget, scaleAmong } from "./sense.ts";
import { add, clamp, dot, ease, len, scale, sub, type V3 } from "./vec.ts";

/** A drag of the view in progress: the point it turns or grabs about, how deep what is grabbed is, and how far it has gone while a straight view holds on. */
export interface Drag { pivot: V3; depth: number; debt: number }
export interface ViewState {
  c: Cam;
  go: Go | null; // a change of view playing out: the lens going to or from a straight view (and the direction turning to a plane), or the view flying to another (Reset camera)
  plane: Axis; // the world plane that is on: its grid shows, its pane is lit (the floor, at the start)
  worldHidden: boolean;
  free: number; // 0: the axes and panes are the world's size (they zoom with the world); 1: scale free, the same size on the screen. 0 until the first thing exists, then eases over to 1
  seen: string | null; // the last thing that was in view, for Reset camera
  drag: Drag | null;
}
/** What is known now. `gameOn`: the pointer is held at the middle of the view, so the world's pointer is there. */
export interface Env { model: Scene; w: number; h: number; now: number; gameOn: boolean }
export interface Pointer { x: number; y: number }
export interface FlightInput { ahead: number; side: number; dx: number; dy: number }

export const initial = (model: Scene): ViewState => ({ c: cam.home(), go: null, plane: 2, worldHidden: false, free: model.things.length ? 1 : 0, seen: null, drag: null });
/** A change of view is playing: flight waits for it, and so does the Reset pill. */
export const busy = (s: ViewState): boolean => s.go !== null;
/** Fully perspective and not changing: the one state flight starts from. */
export const flightReady = (s: ViewState): boolean => !busy(s) && s.c.ortho === null && s.c.lens >= 1;

const focus = (s: ViewState, e: Env): V3 => focusOf(e.model, s.c, e.w, e.h);
/** The point at the middle of the screen at the depth of the point looked at: what a change of view holds when the middle of the screen is to stay where it is. */
const focusOnAxis = (s: ViewState, e: Env): V3 => cam.onAxis(s.c, focus(s, e));
/** The ray through a point of the view (the middle of it in game mode, where the pointer is held). */
export function rayAt(s: ViewState, e: Env, x: number, y: number) {
  const px = e.gameOn ? e.w / 2 : x, py = e.gameOn ? e.h / 2 : y;
  return cam.rayFrom(s.c, (px / e.w) * 2 - 1, -((py / e.h) * 2 - 1), e.w / e.h);
}
/** A move that would take the eye farther than the world reaches, and farther than it is, is not made. */
const reach = (from: Cam, to: Cam): Cam => (cam.reachOf(to) > settings.view.maxDistanceMm && cam.reachOf(to) > cam.reachOf(from) ? from : to);

// ---- going forward: the wheel and flight ----
/** The one way the camera goes forward (a negative share: back): the wheel's notches and W and S in flight both call it. The step is a share of `scaleAmong`, the scale of what the eye is among. */
function goForward(s: ViewState, e: Env, share: number, nx = 0, ny = 0): ViewState {
  // along the ray through the point of the view being zoomed toward: the cursor, or in flight the middle (where the cursor is held), so the
  // point stays where it is on the screen.
  // An orthographic view has no depth to move through: it is zoomed (its size changes) about that point.
  const c = s.c.ortho !== null ? cam.zoomOrtho(s.c, 1 - share, nx, ny, e.w / e.h) : cam.moveAlong(s.c, cam.rayFrom(s.c, nx, ny, e.w / e.h).d, share * scaleAmong(e.model, s.c));
  return { ...s, c: reach(s.c, c) };
}
/** Flight: the same moves as the wheel and the pan, driven by time; and turning about the eye. There are no walls: the eye goes through a thing and looks round inside it (`in_1411`). */
export function fly(s: ViewState, e: Env, dt: number, g: FlightInput): ViewState {
  const n = goForward(s, e, g.ahead * dt);
  let c = reach(n.c, cam.moveAlong(n.c, cam.rightOf(n.c), g.side * dt * scaleAmong(e.model, n.c)));
  const mag = Math.hypot(g.dx, g.dy), k = settings.view.orbitRadPerPx * settings.input.flyLookScale * cam.fineGain(mag);
  if (mag > 0) c = cam.turnAbout(c, c.eye, -g.dx * k, -g.dy * k);
  return { ...n, c };
}

// ---- changes of view ----
/**
 * Start a change of lens about `hold`, a point of the world that keeps its place on the screen and its size while the lens opens or shuts and
 * the eye goes back or forward, so nothing jumps;
 * a point behind the eye is replaced by the one looked at. With `dir` the view also turns to that direction about the point. An orthographic
 * view is first made the perspective view that looks the same.
 */
function lensGo(s: ViewState, e: Env, hold: V3, lens: number, ms: number, dir?: { yaw: number; pitch: number }): ViewState {
  const h = cam.forwardDepth(s.c, hold) > settings.view.minSurfaceMm ? hold : focusOnAxis(s, e);
  const c = cam.leaveOrtho(s.c, h);
  return { ...s, c, go: { t0: e.now, ms, from: c, lens, hold: h, ...(dir ? { dir } : {}) } };
}
/**
 * The hands take the view while a change is playing (any drag, wheel or pan): a change toward a straight view, or a flight to another view, is
 * given up and the perspective comes back smoothly from where it is,
 * never staying half shut (`in_471`); a change that is already bringing it back goes on, with the direction now the hands'.
 */
export function takeOver(s: ViewState, e: Env, pivot?: V3): ViewState {
  if (!s.go) return s;
  if (!s.go.eyeTo && s.go.lens === 1) { const { dir: _unused, ...keep } = s.go; return { ...s, go: keep }; }
  const ms = Math.max(settings.view.minChangeMs, (settings.view.perspectiveMs * (1 - s.c.lens)) / (1 - settings.view.morphLens));
  return s.c.lens < 1 ? lensGo(s, e, pivot ?? focus(s, e), 1, ms) : { ...s, go: null };
}
/** Look straight at the plane across `axis` (again: from the other side). It becomes the plane that is on. */
export function lookAt(s: ViewState, e: Env, axis: Axis): ViewState {
  const f = focusOnAxis(s, e), along = cam.straightAlong(s.c);
  const side: 1 | -1 = along && along.axis === axis ? (-along.sign as 1 | -1) : cam.sideOn(s.c, f, axis);
  return lensGo({ ...s, plane: axis }, e, f, settings.view.morphLens, settings.view.transitionMs, cam.straightDirection(axis, side));
}
/** The Reset camera button: the view flies to the thing last seen (else the last there is), framed whole; with nothing, home. */
export function reset(s: ViewState, e: Env): ViewState {
  const t = resetTarget(e.model, s.seen);
  const to = t.id === "world" ? cam.home() : cam.frameBox(t.lo, t.hi, e.w / e.h);
  const c = cam.leaveOrtho(s.c, focusOnAxis(s, e));
  return { ...s, c, go: { t0: e.now, ms: settings.view.transitionMs, from: c, lens: to.lens, dir: { yaw: to.yaw, pitch: to.pitch }, hold: c.eye, eyeTo: to.eye } };
}
/** Game mode is about to start: the view is made fully perspective first if it is not (flight never starts in a half-straight view). */
export function startGame(s: ViewState, e: Env): ViewState {
  return s.c.ortho !== null || s.go || s.c.lens < 1 ? lensGo(s, e, focusOnAxis(s, e), 1, settings.view.perspectiveMs) : s;
}
export const toggleWorld = (s: ViewState): ViewState => ({ ...s, worldHidden: !s.worldHidden });

// ---- the hands: drags, wheel, clicks ----
/** A drag of the view begins at (x, y): the pivot is the point looked at; what is grabbed is the surface under the pointer, else the pivot. */
export function startDrag(s: ViewState, e: Env, x: number, y: number): ViewState {
  const r = rayAt(s, e, x, y), hit = hitThings(e.model, r.o, r.d), pivot = focus(s, e);
  const depth = Math.max(settings.view.minSurfaceMm, hit ? hit.t * dot(r.d, cam.forward(s.c)) : cam.forwardDepth(s.c, pivot));
  return { ...s, drag: { pivot, depth, debt: 0 } };
}
export const endDrag = (s: ViewState): ViewState => ({ ...s, drag: null });
/** Turn the view about the pivot. A straight view holds on: the drag is kept back until it is a little way, and the view then turns on from there. */
export function orbit(s: ViewState, e: Env, dx: number, dy: number): ViewState {
  if (e.gameOn || !s.drag) return s;
  const k = settings.view.orbitRadPerPx, d = s.drag;
  let n = s;
  if (s.c.ortho !== null && !s.go) {
    const debt = d.debt + Math.hypot(dx, dy);
    if (debt < settings.view.leaveStraightPx) return { ...s, drag: { ...d, debt } };
    const past = Math.min(1, (debt - settings.view.leaveStraightPx) / Math.max(1e-9, Math.hypot(dx, dy)));
    dx *= past; dy *= past;
    n = lensGo({ ...s, drag: { ...d, debt } }, e, d.pivot, 1, settings.view.perspectiveMs);
  } else n = takeOver(s, e, d.pivot);
  return { ...n, c: cam.turnAbout(n.c, d.pivot, -dx * k, -dy * k) };
}
export function pan(s: ViewState, e: Env, dx: number, dy: number): ViewState {
  if (e.gameOn || !s.drag) return s;
  const n = takeOver(s, e);
  return { ...n, c: cam.pan(n.c, dx, dy, s.drag.depth, e.h) };
}
/** The wheel: the camera goes forward or back toward the cursor, by the same rule as in flight. */
export function zoom(s: ViewState, e: Env, factor: number, x: number, y: number): ViewState {
  if (e.gameOn) return s;
  const [lo, hi] = settings.input.zoomStepClamp;
  return goForward(takeOver(s, e), e, 1 - clamp(factor, lo, hi), (x / e.w) * 2 - 1, -((y / e.h) * 2 - 1));
}
/**
 * Two fingers (a touch screen, or a trackpad's scroll and pinch): the view is slid by (dx, dy) and zoomed by `factor` about (x, y), together. What is grabbed for the slide is chosen when the gesture begins (`startDrag`),
 * or, with none, is the point looked at.
 */
export function gesture(s: ViewState, e: Env, dx: number, dy: number, factor: number, x: number, y: number): ViewState {
  if (e.gameOn) return s;
  let n = takeOver(s, e);
  if (dx !== 0 || dy !== 0) n = { ...n, c: cam.pan(n.c, dx, dy, n.drag?.depth ?? Math.max(settings.view.minSurfaceMm, cam.forwardDepth(n.c, focus(n, e))), e.h) };
  if (factor !== 1) n = zoom(n, e, factor, x, y);
  return n;
}
/** A click: on a pane (not on a face that is not in the pane's own plane, `in_1409`) it is to look straight at that plane. */
export function click(s: ViewState, e: Env, x: number, y: number): ViewState {
  if (s.worldHidden) return s;
  const r = rayAt(s, e, x, y), p = paneAt(e.model, r.o, r.d, gizmoScale(s));
  return p && paneLevel(s.c) > settings.world.paneUsableLevel ? lookAt(s, e, p.axis) : s;
}

// ---- time ----
/** Time passes: the change of view playing out goes on, the axes' scale eases over, and what is in view is noted. */
export function advance(s: ViewState, e: Env, dt: number): ViewState {
  let { c, go } = s;
  if (go) {
    const k = Math.min(1, (e.now - go.t0) / go.ms);
    c = cam.stepGo(go, ease(k), c);
    if (k >= 1) { c = go.lens === 1 ? { ...c, lens: 1 } : go.eyeTo ? c : cam.enterOrtho({ ...c, lens: go.lens }, go.hold); go = null; }
  }
  const want = e.model.things.length ? 1 : 0;
  let free = s.free + (want - s.free) * Math.min(1, dt * settings.world.gizmoEaseRate);
  if (Math.abs(want - free) < 0.002) free = want;
  return { ...s, c, go, free, seen: lastSeen(e.model, c, e.w, e.h) ?? s.seen };
}

// ---- what to show ----
/** How much of the little panes there is: all while the view is perspective, fading out as it goes straight. */
export const paneLevel = (c: Cam): number => (c.ortho !== null ? 0 : clamp((c.lens - settings.world.paneFadeLens) / (1 - settings.world.paneFadeLens), 0, 1));
/** How many times its true size the axes and panes are drawn: 1 while the model is empty, and once the first thing exists the size they have on the screen at the home view, wherever the eye is. */
export function gizmoScale(s: ViewState): number {
  const home = cam.home();
  const sFree = cam.viewHeight(s.c, Math.max(cam.forwardDepth(s.c, [0, 0, 0]), settings.view.minSurfaceMm)) / cam.viewHeight(home, settings.view.homeDistance);
  return Math.exp(s.free * Math.log(sFree));
}
/** What is under the pointer: the pane of a plane, a face of a thing, or the plane that is on, with the hover disc that goes on it. */
export function underPointer(s: ViewState, e: Env, pointer: Pointer | null) {
  const r = pointer || e.gameOn ? rayAt(s, e, pointer?.x ?? 0, pointer?.y ?? 0) : null;
  const hit = r ? hitThings(e.model, r.o, r.d) : null;
  const pane = r && !s.worldHidden && paneLevel(s.c) > settings.world.paneUsableLevel ? paneAt(e.model, r.o, r.d, gizmoScale(s)) : null;
  const flat = r && !hit && !pane ? planeHit(r.o, r.d, s.plane) : null;
  const radius = (t: number) => (settings.orb.radius * cam.viewHeight(s.c, t)) / (2 * Math.tan((settings.view.fovDeg * Math.PI) / 360)); // (a share of the view's height: the same size on the screen wherever it is)
  const faceNormal = (axis: number): V3 => [0, 1, 2].map((i) => (i === axis ? (s.c.eye[axis]! >= 0 ? 1 : -1) : 0)) as V3;
  const disc = r && hit ? { point: add(r.o, scale(r.d, hit.t)), normal: hit.normal, radius: radius(hit.t) }
    : r && flat ? { point: flat.point, normal: faceNormal(s.plane), radius: radius(flat.t) } : null;
  return { pane, disc };
}
/** Everything the drawing needs. */
export function drawing(s: ViewState, e: Env, pointer: Pointer | null) {
  const { pane, disc } = underPointer(s, e, pointer);
  return { cam: s.c, depth: scaleAmong(e.model, s.c), grid: gridLevel(s.c, s.plane), w: e.w, h: e.h, gizmoScale: gizmoScale(s), plane: s.plane, paneHover: pane ? pane.axis : null, paneLevel: paneLevel(s.c), axesShown: !s.worldHidden, disc };
}
/** Everything the page's own parts need: the axis letters, the origin dot, the buttons, the Reset pill. */
export function pageState(s: ViewState, e: Env) {
  const { c, plane } = s, f = cam.forward(c);
  const occluded = (p: V3) => { // is a thing between the point and the eye? (orthographic: on the near side of the point along the view)
    if (c.ortho !== null) return !!hitThings(e.model, p, scale(f, -1));
    const to = sub(p, c.eye), l = len(to), hh = hitThings(e.model, c.eye, scale(to, 1 / l));
    return !!hh && hh.t < l - 1e-3;
  };
  const m = settings.ui.offscreenMarginPx;
  const screen = (p: V3): [number, number] | null => {
    const q = cam.project(c, p, e.w, e.h);
    return q.depth > 1e-3 && q.x > -m && q.x < e.w + m && q.y > -m && q.y < e.h + m && !occluded(p) ? [q.x, q.y] : null;
  };
  const L = (settings.world.axisLengthMm + settings.world.letterGapMm) * gizmoScale(s);
  const letter = (axis: Axis) => { const tip: V3 = [0, 0, 0]; tip[axis] = L; return { axis, at: Math.abs(f[axis]!) > settings.world.letterFacing ? null : screen(tip) }; }; // (the letter of the axis looked along points at you: not drawn)
  return {
    letters: s.worldHidden ? [] : ([0, 1, 2] as const).map(letter),
    origin: screen([0, 0, 0]), worldHidden: s.worldHidden, plane, facing: cam.facing(c), lost: !busy(s) && nothingInView(e.model, c, e.w, e.h), w: e.w, h: e.h,
  };
}

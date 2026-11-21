// The controller: it holds the camera and what the world view needs to remember, turns intents into camera moves, and tells the drawing and the page what to show.
import { settings } from "./settings.ts";
import * as cam from "./camera.ts";
import { type Axis, type Cam, type Go } from "./camera.ts";
import { attach, fineGain } from "./input.ts";
import { createGame } from "./game.ts";
import { createWorld } from "./world.ts";
import { createUi } from "./ui.ts";
import { demoScene, emptyScene, hitThings, oneScene } from "./scene.ts";
import { depthAhead, flightScale, gridLevel, lastSeen, nothingInView, paneAt, pivotFor, planeHit, resetTarget, scaleDepth } from "./sense.ts";
import { add, clamp, dot, len, scale, sub, ease, type V3 } from "./vec.ts";

const params = new URLSearchParams(location.search);
const model = params.get("boxes") === "0" ? emptyScene() : params.get("boxes") === "1" ? oneScene() : demoScene(); // (?boxes=0: an empty model; ?boxes=1: one box at the origin)
// (tuning by hand: ?wheel=0.001 sets how far a wheel notch goes, as a share of the step scale per unit of wheel; the default is in settings)
if (params.get("wheel")) settings.input.zoomPerWheel = Number(params.get("wheel"));
const canvas = document.getElementById("view") as HTMLCanvasElement;
const ring = document.getElementById("ring")!;
const world = createWorld(canvas, model);
const game = createGame();

// ---- what the controller remembers ----
let c: Cam = cam.home();
let go: Go | null = null; // a change of view playing out: the lens going to or from a straight view (and the direction turning to a plane), or the view flying to another (Reset camera)
let plane: Axis = 2; // the world plane that is on: its grid shows, its pane is lit (the floor, at the start)
let worldHidden = false;
let paneLevel = 1;
let seen: string | null = null;
let free = model.things.length ? 1 : 0; // 0: the axes and panes are the world's size (they grow and shrink with a zoom); 1: scale free, the same size on the screen. It is 0 until the first thing exists, and eases over to 1.
let pointer: { x: number; y: number } | null = null;
let drag: { kind: "orbit" | "pan"; pivot: V3; depth: number; debt: number } | null = null;

const size = () => ({ w: canvas.clientWidth || innerWidth, h: canvas.clientHeight || innerHeight });
const centre = () => ({ x: size().w / 2, y: size().h / 2 });
/** Where the pointer is for the world's purposes: at the middle of the view in game mode (the pointer is held there), else where it is. */
const at = (x: number, y: number) => (game.on ? centre() : { x, y });
const rayAt = (x: number, y: number): V3 => { const { w, h } = size(); const p = at(x, y); return cam.rayThrough(c, (p.x / w) * 2 - 1, -((p.y / h) * 2 - 1), w / h); };
const busy = () => go !== null; // (a change of view is playing: flight waits for it, and so does the Reset pill)

/** How many times its true size the axes and panes are drawn: 1 while the model is empty (they zoom with the world, which gives a sense of scale), and once the first thing exists they keep the size they have on the screen at the home view, wherever the eye is. */
function gizmoScale(): number {
  const home = settings.view.homeDistance;
  const sFree = Math.max(cam.forwardDepth(c, [0, 0, 0]), settings.view.minSurfaceMm) * c.lens / home;
  return Math.exp(free * Math.log(sFree));
}

/** A move that would take the eye farther than the world reaches, and farther than it is, is not made (the prototype's zoom stopped at 5,000 mm). */
const reach = (from: Cam, to: Cam): Cam => { const far = (k: Cam) => len(k.eye) * k.lens; return far(to) > settings.view.maxDistanceMm && far(to) > far(from) ? from : to; }; // (the distance as the picture sees it: a straight view puts the eye far back with the lens shut)

/** The one way the camera goes forward (a negative number: back): the wheel's notches and W and S in flight both call it. The step is a share of `flightScale`, the scale of what the eye is among. */
function goForward(share: number, nx = 0, ny = 0) {
  const scale = flightScale(model, c), { w, h } = size();
  // along the ray through the point of the view being zoomed toward: the cursor, or in flight the middle (where the cursor is held), so the point stays where it is on the screen.
  // In a straight view the eye is far back and the picture is zoomed by the lens (so it stays as flat as it was), about that point.
  c = reach(c, cam.isStraight(c) && !go ? cam.zoomLens(c, 1 - share, scale, nx, ny, w / h) : cam.moveAlong(c, cam.rayThrough(c, nx, ny, w / h), share * scale));
}

// ---- changes of view ----
const focusNow = (): V3 => add(c.eye, scale(cam.forward(c), depthAhead(model, c, cam.forward(c))));
/** Start a change of lens about `hold`, a point of the world that keeps its place on the screen and its size while the lens opens or shuts and the eye goes back or forward, so nothing jumps; a point behind the eye is replaced by the one looked at. With `dir` the view also turns to that direction about the point. */
function lensGo(hold: V3, lens: number, ms: number, dir?: { yaw: number; pitch: number }): Go {
  const h = cam.forwardDepth(c, hold) > settings.view.minSurfaceMm ? hold : focusNow();
  return { t0: performance.now(), ms, from: c, lens, hold: h, ...(dir ? { dir } : {}) };
}
/** The hands take the view while a change is playing (any drag, wheel or pan): a change toward a straight view, or a flight to another view, is given up and the perspective comes back smoothly from where it is, never staying half shut (`in_471`); a change that is already bringing it back goes on, with the direction now the hands'. */
function takeOver(pivot?: V3) {
  if (!go) return;
  if (!go.eyeTo && go.lens === 1) { const { dir: _unused, ...keep } = go; go = keep; return; }
  go = c.lens < 1 ? lensGo(pivot ?? focusNow(), 1, Math.max(60, (settings.view.perspectiveMs * (1 - c.lens)) / (1 - settings.view.straightLens))) : null;
}
/** Look straight at the plane across `axis` (again: from the other side). It becomes the plane that is on. */
function lookAt(axis: Axis) {
  if (game.on) endGame();
  plane = axis;
  const f = focusNow();
  const along = cam.straightAlong(c);
  const side: 1 | -1 = along && along.axis === axis ? (-along.sign as 1 | -1) : cam.sideOn(c, f, axis);
  go = lensGo(f, settings.view.straightLens, settings.view.transitionMs, cam.straightDirection(axis, side));
}
function reset() {
  const t = resetTarget(model, seen);
  const { w, h } = size();
  const to = t.id === "world" ? cam.home() : cam.frameBox(t.lo, t.hi, w / h);
  if (game.on) endGame();
  go = { t0: performance.now(), ms: settings.view.transitionMs, from: c, lens: to.lens, dir: { yaw: to.yaw, pitch: to.pitch }, hold: c.eye, eyeTo: to.eye };
}
function endGame() { game.end(); if (document.pointerLockElement) document.exitPointerLock(); ring.style.display = "none"; }

// ---- the page ----
const ui = createUi(document.body, { look: lookAt, reset, toggleWorld: () => { worldHidden = !worldHidden; } });

// ---- intents ----
attach(canvas, {
  dragStart(kind, x, y) {
    const { w, h } = size();
    const r = rayAt(x, y), hit = hitThings(model, c.eye, r);
    const t = hit ? hit.t : depthAhead(model, c, cam.forward(c));
    drag = { kind, pivot: pivotFor(model, c, w, h), depth: Math.max(settings.view.minSurfaceMm, t * dot(hit ? r : cam.forward(c), cam.forward(c))), debt: 0 };
  },
  orbit(dx, dy) {
    if (game.on || !drag) return;
    const k = settings.view.orbitRadPerPx;
    if (cam.isStraight(c) && !go) { // a straight view holds on: the drag is kept back until it is a little way, and the view then turns on from there
      drag.debt += Math.hypot(dx, dy);
      if (drag.debt < settings.view.leaveStraightPx) return;
      const past = Math.min(1, (drag.debt - settings.view.leaveStraightPx) / Math.max(1e-9, Math.hypot(dx, dy)));
      dx *= past; dy *= past;
      go = lensGo(drag.pivot, 1, settings.view.perspectiveMs);
    } else takeOver(drag.pivot);
    c = cam.turnAbout(c, drag.pivot, -dx * k, -dy * k);
  },
  pan(dx, dy) { if (game.on || !drag) return; takeOver(); c = cam.pan(c, dx, dy, drag.depth, size().h); },
  zoom(factor, x, y) { // the wheel is W and S in steps: the camera goes forward or back toward the cursor, by the same rule as in flight
    if (game.on) return;
    takeOver();
    const { w, h } = size();
    goForward(1 - clamp(factor, 0.2, 5), (x / w) * 2 - 1, -((y / h) * 2 - 1));
  },
  dragEnd() { drag = null; },
  hover(x, y) { pointer = { x, y }; },
  leave() { pointer = null; },
  click(x, y) {
    pointer = { x, y };
    const r = rayAt(x, y);
    if (worldHidden) return;
    const p = paneAt(model, c.eye, r, gizmoScale()); // (a face that is not in the pane's own plane is what is clicked, `in_1409`)
    if (p && paneLevel > 0.5) lookAt(p.axis);
  },
  look(dx, dy) { game.look(dx, dy); },
  space() { if (game.on) endGame(); else startGame(); },
}, () => document.pointerLockElement === canvas);

/** Game mode on: the view is made fully perspective first if it is not (flight never starts in a half-straight view), the pointer is held at the middle of the view. */
function startGame() {
  if (cam.isStraight(c) || go || c.lens < 1) go = lensGo(focusNow(), 1, settings.view.perspectiveMs);
  game.start();
  canvas.requestPointerLock?.();
}
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (game.moves(e.code) && !game.on && !e.repeat) startGame(); // (W A S D turn the game on too, and the key that did it moves the eye)
  if (game.key(e.code, true)) return;
  if (e.code === "KeyB" && !e.repeat) { model.things = model.things.length ? [] : demoScene().things; world.rebuild(); return; } // (a testing aid for this stage: the first thing appears, or goes)
  if (e.code === "Escape" && game.on) endGame();
});
addEventListener("keyup", (e) => { game.key(e.code, false); });
document.addEventListener("pointerlockchange", () => { if (document.pointerLockElement !== canvas && game.on) endGame(); });

// ---- every frame ----
/** The change of view playing out, if any. */
function advanceView(now: number) {
  if (!go) return;
  const k = Math.min(1, (now - go.t0) / go.ms);
  c = cam.stepGo(go, ease(k), c);
  if (k >= 1) { c = { ...c, lens: go.lens }; go = null; }
}
/** Flight: the same moves as the wheel and the pan, driven by time; and turning about the eye. */
function fly(dt: number, g: { ahead: number; side: number; dx: number; dy: number }) {
  goForward(g.ahead * dt); // (no walls: the eye goes through a thing and looks round inside it, `in_1411`)
  c = reach(c, cam.moveAlong(c, cam.rightOf(c), g.side * dt * flightScale(model, c)));
  const mag = Math.hypot(g.dx, g.dy), k = settings.view.orbitRadPerPx * settings.input.flyLookScale * fineGain(mag);
  if (mag > 0) c = cam.turnAbout(c, c.eye, -g.dx * k, -g.dy * k);
}
/** How far in front of the eye the plane that is on is (the world's origin lies on it): the picture's size in a straight view. */
const refDepth = (): number => { const d = cam.forwardDepth(c, [0, 0, 0]); return d > settings.view.minSurfaceMm ? d : len(c.eye); };
/** What is under the pointer: the pane of a plane, a face of a thing, or the plane that is on. */
function underPointer() {
  const r = pointer || game.on ? rayAt(pointer?.x ?? 0, pointer?.y ?? 0) : null;
  const hit = r ? hitThings(model, c.eye, r) : null;
  const pane = r && !worldHidden && paneLevel > 0.5 ? paneAt(model, c.eye, r, gizmoScale()) : null;
  const flat = r && !hit && !pane ? planeHit(c.eye, r, plane) : null;
  const disc = r && hit ? { point: add(c.eye, scale(r, hit.t)), normal: hit.normal, radius: settings.orb.radius * hit.t * c.lens }
    : r && flat ? { point: flat.point, normal: [0, 0, 0].map((_, i) => (i === plane ? (c.eye[plane] >= 0 ? 1 : -1) : 0)) as V3, radius: settings.orb.radius * flat.t * c.lens } : null;
  return { pane, disc };
}
/** The page's parts: the axis letters, the origin dot, the buttons, the Reset pill. */
function pageState(w: number, h: number) {
  const f = cam.forward(c);
  const occluded = (p: V3) => { const to = sub(p, c.eye), l = len(to); const hh = hitThings(model, c.eye, scale(to, 1 / l)); return !!hh && hh.t < l - 1e-3; };
  const screen = (p: V3): [number, number] | null => { const q = cam.project(c, p, w, h); return q.depth > 1e-3 && q.x > -20 && q.x < w + 20 && q.y > -20 && q.y < h + 20 && !occluded(p) ? [q.x, q.y] : null; };
  const L = (settings.world.axisLengthMm + 6) * gizmoScale();
  return {
    letters: worldHidden ? [] : ([0, 1, 2] as const).map((axis) => { const tip: V3 = [0, 0, 0]; tip[axis] = L; return { axis, at: Math.abs(f[axis]!) > 0.98 ? null : screen(tip) }; }), // (the letter of the axis looked along points at you: not drawn)
    origin: screen([0, 0, 0]), worldHidden, plane, facing: cam.facing(c), lost: !busy() && nothingInView(model, c, w, h), w, h,
  };
}
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const { w, h } = size();
  advanceView(now);
  const want = model.things.length ? 1 : 0;
  free += (want - free) * Math.min(1, dt * 6); // (it eases over: the axes do not jump when the first thing appears)
  if (Math.abs(want - free) < 0.002) free = want;
  const g = game.tick(dt);
  if (g.on && !busy() && c.lens >= 1) fly(dt, g);
  if (!g.on && ring.style.display === "block") endGame();
  ring.style.display = g.on ? "block" : "none";
  const sawNow = lastSeen(model, c, w, h);
  if (sawNow) seen = sawNow;
  paneLevel = clamp((c.lens - 0.5) / 0.5, 0, 1);
  const { pane, disc } = underPointer();
  world.render({ cam: c, depth: scaleDepth(model, c), refDepth: refDepth(), reach: flightScale(model, c), grid: gridLevel(c, plane), w, h, gizmoScale: gizmoScale(), plane, paneHover: pane ? pane.axis : null, paneLevel, axesShown: !worldHidden, disc });
  ui.update(pageState(w, h));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as unknown as { __cad: unknown }).__cad = { get cam() { return c; }, get plane() { return plane; }, get gizmo() { return gizmoScale(); }, get free() { return free; }, get pointer() { return pointer; }, get go() { return go; }, game, model, set(next: Cam) { c = next; go = null; } };

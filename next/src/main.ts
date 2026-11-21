// The controller: it holds the camera and what the world view needs to remember, turns intents into camera moves, and tells the drawing and the page what to show.
import { settings } from "./settings.ts";
import * as cam from "./camera.ts";
import { type Axis, type Cam, type Move } from "./camera.ts";
import { attach, fineGain } from "./input.ts";
import { createGame } from "./game.ts";
import { createWorld } from "./world.ts";
import { createUi } from "./ui.ts";
import { demoScene, emptyScene, hitThings } from "./scene.ts";
import { depthAhead, lastSeen, nothingInView, pickPane, pivotFor, planeHit, resetTarget } from "./sense.ts";
import { add, clamp, dot, len, scale, sub, ease, type V3 } from "./vec.ts";

const params = new URLSearchParams(location.search);
const model = params.get("boxes") === "0" ? emptyScene() : demoScene(); // (?boxes=0: an empty model, to see what is there with nothing in it)
const canvas = document.getElementById("view") as HTMLCanvasElement;
const ring = document.getElementById("ring")!;
const world = createWorld(canvas, model);
const game = createGame();

// ---- what the controller remembers ----
let c: Cam = cam.home();
type Glide = { from: Cam; to: Cam; t0: number; ms: number };
let lens: (Move & { free: boolean }) | null = null; // a change of lens (to or from a straight view); free: the direction is the user's (a drag turning the view as the perspective comes in)
let glide: Glide | null = null; // the view flying to another (Reset camera)
let plane: Axis = 2; // the world plane that is on: its grid shows, its pane is lit (the floor, at the start)
let worldHidden = false;
let paneLevel = 1;
let seen: string | null = null;
let depth = 120; // how far ahead things are, smoothed: it sets the fog, the grid's spacing and the depth range
let pointer: { x: number; y: number } | null = null;
let drag: { kind: "orbit" | "pan"; pivot: V3; depth: number; debt: number } | null = null;

const size = () => ({ w: canvas.clientWidth || innerWidth, h: canvas.clientHeight || innerHeight });
const centre = () => ({ x: size().w / 2, y: size().h / 2 });
/** Where the pointer is for the world's purposes: at the middle of the view in game mode (the pointer is held there), else where it is. */
const at = (x: number, y: number) => (game.on ? centre() : { x, y });
const rayAt = (x: number, y: number): V3 => { const { w, h } = size(); const p = at(x, y); return cam.rayThrough(c, (p.x / w) * 2 - 1, -((p.y / h) * 2 - 1), w / h); };
const busy = () => lens !== null || glide !== null; // (a change of view is playing: no resting half-straight view, so the camera waits for it, C9)

// ---- changes of view ----
/** Start a change of lens about `focus`: what is there keeps its size while the lens opens or shuts and the eye goes back or forward. */
function startLens(focus: V3, to: { yaw: number; pitch: number } | null, lensTo: number, ms: number, free = false) {
  const d = len(sub(focus, c.eye)) * c.lens; // (the distance, as it would be with the full lens)
  lens = { focus, depth: d, from: { yaw: c.yaw, pitch: c.pitch, lens: c.lens }, to: to ?? null, t0: performance.now(), ms, lensTo, free };
}
const focusNow = (): V3 => add(c.eye, scale(cam.forward(c), depthAhead(model, c, cam.forward(c))));
/** Look straight at the plane across `axis` (again: from the other side). It becomes the plane that is on. */
function lookAt(axis: Axis) {
  if (game.on) endGame();
  plane = axis;
  const f = focusNow();
  const along = cam.straightAlong(c);
  const side: 1 | -1 = along && along.axis === axis ? (-along.sign as 1 | -1) : cam.sideOn(c, f, axis);
  startLens(f, cam.straightDirection(axis, side), settings.view.straightLens, settings.view.transitionMs);
  glide = null;
}
function reset() {
  const t = resetTarget(model, seen);
  const { w, h } = size();
  const to = t.id === "world" ? cam.home() : cam.frameBox(t.lo, t.hi, w / h);
  if (game.on) endGame();
  lens = null;
  glide = { from: c, to, t0: performance.now(), ms: settings.view.transitionMs };
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
    if (game.on || !drag || glide) return;
    const k = settings.view.orbitRadPerPx;
    if (lens && !lens.free) return; // (a change to a straight view is playing: it is not turned by hand until it is over)
    if (cam.isStraight(c) && !lens) { // a straight view holds on: the drag is kept back until it is a little way, and the view then turns on from there
      drag.debt += Math.hypot(dx, dy);
      if (drag.debt < settings.view.leaveStraightPx) return;
      const past = Math.min(1, (drag.debt - settings.view.leaveStraightPx) / Math.max(1e-9, Math.hypot(dx, dy)));
      dx *= past; dy *= past;
      startLens(drag.pivot, null, 1, settings.view.perspectiveMs, true);
    }
    c = cam.turnAbout(c, lens?.free ? lens.focus : drag.pivot, -dx * k, -dy * k);
  },
  pan(dx, dy) { if (busy() || game.on || !drag) return; c = cam.pan(c, dx, dy, drag.depth, size().h); },
  zoom(factor, x, y) {
    if (busy() || game.on) return;
    const r = rayAt(x, y), hit = hitThings(model, c.eye, r);
    const ray = hit ? r : cam.forward(c); // (nothing under the pointer: about the middle of the view)
    c = cam.zoomAlong(c, ray, hit ? hit.t : depthAhead(model, c, ray), clamp(factor, 0.2, 5));
  },
  dragEnd() { drag = null; },
  hover(x, y) { pointer = { x, y }; },
  click(x, y) {
    const { w, h } = size(); void w; void h;
    pointer = { x, y };
    const r = rayAt(x, y);
    if (worldHidden || hitThings(model, c.eye, r)) return; // (the model wins over a pane in front of it, `in_135`)
    const p = pickPane(c.eye, r);
    if (p && paneLevel > 0.5) lookAt(p.axis);
  },
  look(dx, dy) { game.look(dx, dy); },
}, () => document.pointerLockElement === canvas);

addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (game.key(e.code, true)) {
    if (!e.repeat) {
      glide = null;
      if (cam.isStraight(c) || (lens && lens.lensTo < 1) || c.lens < 1) startLens(focusNow(), { yaw: c.yaw, pitch: c.pitch }, 1, settings.view.perspectiveMs); // (flight starts in a full perspective view only, C9)
      canvas.requestPointerLock?.();
    }
    return;
  }
  if (e.code === "Escape" && game.on) endGame();
});
addEventListener("keyup", (e) => { game.key(e.code, false); });
document.addEventListener("pointerlockchange", () => { if (document.pointerLockElement !== canvas && game.on) endGame(); });

// ---- every frame ----
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const { w, h } = size();
  if (lens) {
    const k = Math.min(1, (now - lens.t0) / lens.ms);
    c = cam.along(lens, ease(k), { yaw: c.yaw, pitch: c.pitch });
    if (k >= 1) { c = { ...c, lens: lens.lensTo }; lens = null; }
  } else if (glide) {
    const k = Math.min(1, (now - glide.t0) / glide.ms);
    c = k >= 1 ? glide.to : cam.blend(glide.from, glide.to, ease(k));
    if (k >= 1) glide = null;
  }
  const g = game.tick(dt);
  if (g.on && !busy() && c.lens >= 1) { // flying: the same moves as the wheel and the pan, driven by time; and turning about the eye
    const f = cam.forward(c), d = depthAhead(model, c, f);
    const ahead = g.ahead > 0 ? Math.min(g.ahead * dt * d, Math.max(0, d - settings.view.minSurfaceMm)) : g.ahead * dt * d;
    c = cam.moveAlong(cam.moveAlong(c, f, ahead), cam.rightOf(c), g.side * dt * d);
    const mag = Math.hypot(g.dx, g.dy), k = settings.view.orbitRadPerPx * settings.input.flyLookScale * fineGain(mag);
    if (mag > 0) c = cam.turnAbout(c, c.eye, -g.dx * k, -g.dy * k);
  }
  if (!g.on && ring.style.display === "block") endGame();
  ring.style.display = g.on ? "block" : "none";

  // what the world view shows
  const f = cam.forward(c), dNow = depthAhead(model, c, f);
  depth += (dNow - depth) * Math.min(1, dt * 8);
  if (!isFinite(depth) || depth <= 0) depth = dNow;
  const sawNow = lastSeen(model, c, w, h);
  if (sawNow) seen = sawNow;
  paneLevel = clamp((c.lens - 0.5) / 0.5, 0, 1);
  const r = pointer || game.on ? rayAt(pointer?.x ?? 0, pointer?.y ?? 0) : null;
  const hit = r ? hitThings(model, c.eye, r) : null;
  const pane = r && !hit && !worldHidden && paneLevel > 0.5 ? pickPane(c.eye, r) : null;
  const flat = r && !hit && !pane ? planeHit(c.eye, r, plane) : null;
  const disc = r && hit ? { point: hit.t ? add(c.eye, scale(r, hit.t)) : c.eye, normal: hit.normal, radius: settings.orb.radius * hit.t * c.lens }
    : r && flat ? { point: flat.point, normal: [0, 0, 0].map((_, i) => (i === plane ? (c.eye[plane] >= 0 ? 1 : -1) : 0)) as V3, radius: settings.orb.radius * flat.t * c.lens } : null;
  world.render({ cam: c, depth, w, h, plane, paneHover: pane ? pane.axis : null, paneLevel, axesShown: !worldHidden, disc });

  // the page's parts
  const occluded = (p: V3) => { const to = sub(p, c.eye), l = len(to); const hh = hitThings(model, c.eye, scale(to, 1 / l)); return !!hh && hh.t < l - 1e-3; };
  const screen = (p: V3): [number, number] | null => { const q = cam.project(c, p, w, h); return q.depth > 1e-3 && q.x > -20 && q.x < w + 20 && q.y > -20 && q.y < h + 20 && !occluded(p) ? [q.x, q.y] : null; };
  const L = settings.world.axisLengthMm + 6;
  ui.update({
    letters: worldHidden ? [] : ([0, 1, 2] as const).map((axis) => { const tip: V3 = [0, 0, 0]; tip[axis] = L; return { axis, at: Math.abs(f[axis]!) > 0.98 ? null : screen(tip) }; }), // (the letter of the axis looked along points at you: not drawn)
    origin: screen([0, 0, 0]), worldHidden, plane, facing: cam.facing(c), lost: !busy() && nothingInView(model, c, w, h), w, h,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as unknown as { __cad: unknown }).__cad = { get cam() { return c; }, get plane() { return plane; }, get lens() { return lens; }, get glide() { return glide; }, game, model, set(next: Cam) { c = next; lens = glide = null; }, get depth() { return depth; } };

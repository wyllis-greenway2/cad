// The controller: it turns what the page and the browser report (intents, keys, time) into calls on the world view's pure functions (view.ts),
// keeps the state they return, and tells the drawing and the page what to show.
// Everything about how the view behaves is in view.ts; what is here is the wiring, and the few things only the browser can do (the pointer
// lock, the ring that marks game mode). On top of the world and camera: the right-click ring, one sketch plane placed anywhere, and the mover orb on it.
import { attach } from "./input.ts";
import { createGame } from "./game.ts";
import { createWorld } from "./world.ts";
import { createUi } from "./ui.ts";
import * as dev from "./dev.ts";
import * as view from "./view.ts";
import type { Axis } from "./camera.ts";
import { focusOf, gridLevelAt } from "./sense.ts";
import { facingCamera, vOf, type Frame } from "./planes.ts";
import { createMenu, createOrientBar, type MenuItem } from "./menu.ts";
import { createOrbControl } from "./orbcontrol.ts";
import { dot, scale, sub } from "./vec.ts";

const params = new URLSearchParams(location.search);
dev.tuneFromAddress(params);
const model = dev.sceneFromAddress(params);
const canvas = document.getElementById("view") as HTMLCanvasElement;
const ring = document.getElementById("ring")!;
const world = createWorld(canvas, model);
const game = createGame();

let s = view.initial(model);
let pointer: view.Pointer | null = null;
const env = (now = performance.now()): view.Env => ({ model, w: canvas.clientWidth || innerWidth, h: canvas.clientHeight || innerHeight, now, gameOn: game.on });

function endGame() { game.end(); if (document.pointerLockElement) document.exitPointerLock(); ring.style.display = "none"; }
/** Game mode on: the view is made fully perspective first if it is not, and the pointer is held at the middle of the view. */
function startGame() { s = view.startGame(s, env()); game.start(); canvas.requestPointerLock?.(); }
function reset() { if (game.on) endGame(); s = view.reset(s, env()); }

// ---- the sketch plane: one, placed anywhere (the world's X, Y, Z planes are the others); the view turns straight to it, and the orb moves and turns it ----
let sketch: Frame | null = null;
function lookAt(axis: Axis) { if (game.on) endGame(); sketch = null; s = view.lookAt(s, env(), axis); }
function addSketchPlane() {
  if (game.on) endGame();
  const e = env();
  sketch = facingCamera(s.c, focusOf(model, s.c, e.w, e.h));
  s = view.lookAlong(s, e, scale(sketch.normal, -1)); // (a sketch is drawn looking straight at its plane, orthographic)
}
const orbc = createOrbControl({
  target: () => (sketch ? { id: "sketch", frame: sketch } : null),
  set: (_id, f) => { sketch = { origin: f.origin, normal: f.normal, u: f.u }; },
  copy: () => null,
  view: () => { const e = env(); return { cam: s.c, w: e.w, h: e.h }; },
});
const orientBar = createOrientBar(document.body, { apply: () => orbc.keep(), cancel: () => orbc.cancel() });

// ---- the right-click ring: the drawing tools (not built yet) and the sketch plane ----
const tools: MenuItem[] = [["Line", "line"], ["Rectangle", "rect"], ["Circle", "circle"], ["Arc", "arc"]].map(([t, i]) => ({ id: `tool-${t}`, label: t!, icon: i!, enabled: false, note: "not built yet" }));
const menu = createMenu(document.body, (id) => { if (id === "sketch-plane") addSketchPlane(); });
const menuItems = (): MenuItem[] => [...tools, { id: "sketch-plane", label: "Sketch plane", icon: "sheetPlain" }];

const ui = createUi(document.body, { look: lookAt, reset, toggleWorld: () => { s = view.toggleWorld(s); } });

attach(canvas, {
  dragStart: (x, y) => { s = view.startDrag(s, env(), x, y); },
  orbit: (dx, dy) => { s = view.orbit(s, env(), dx, dy); },
  pan: (dx, dy) => { s = view.pan(s, env(), dx, dy); },
  zoom: (factor, x, y) => { s = view.zoom(s, env(), factor, x, y); },
  gesture: (dx, dy, factor, x, y) => { s = view.gesture(s, env(), dx, dy, factor, x, y); },
  dragEnd: () => { s = view.endDrag(s); },
  hover: (x, y) => { pointer = { x, y }; },
  leave: () => { pointer = null; },
  click: (x, y) => {
    pointer = { x, y };
    if (menu.isOpen()) { menu.close(); return; }
    const next = view.click(s, env(), x, y); // (a pane of a world plane: it is the sketch plane now)
    if (next !== s) { sketch = null; s = next; }
  },
  grab: (x, y, shift) => !game.on && orbc.grab(x, y, shift),
  grabMove: (x, y) => orbc.grabMove(x, y),
  grabEnd: () => orbc.grabEnd(),
  menu: (x, y) => { pointer = { x, y }; menu.open(x, y, menuItems()); },
  look: (dx, dy) => game.look(dx, dy),
  space: () => { if (game.on) endGame(); else startGame(); },
}, () => document.pointerLockElement === canvas);

addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (game.moves(e.code) && !game.on && !e.repeat) startGame(); // (W A S D turn the game on too, and the key that did it moves the eye)
  if (game.key(e.code, true)) return;
  if (orbc.orienting() && e.code === "Enter") { orbc.keep(); return; }
  if (e.code === "Escape") { if (orbc.cancel()) return; if (menu.isOpen()) menu.close(); else if (game.on) endGame(); else orbc.release(); }
});
addEventListener("keyup", (e) => { game.key(e.code, false); });
document.addEventListener("pointerlockchange", () => { if (document.pointerLockElement !== canvas && game.on) endGame(); });

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  s = view.advance(s, env(now), dt);
  const g = game.tick(dt);
  if (g.on && view.flightReady(s)) s = view.fly(s, env(now), dt, g);
  if (!g.on && ring.style.display === "block") endGame();
  ring.style.display = g.on ? "block" : "none";
  const e = env(now), d = view.drawing(s, e, pointer), orb = orbc.drawing(game.on ? null : pointer);
  canvas.style.cursor = orb?.hover ? "grab" : "";
  world.render({
    ...d, ...(sketch ? { grid: gridLevelAt(s.c, Math.abs(dot(sub(s.c.eye, sketch.origin), sketch.normal))), sketch: { origin: sketch.origin, u: sketch.u, v: vOf(sketch), n: sketch.normal } } : {}), orb,
    cut: sketch ? { origin: sketch.origin, n: sketch.normal } : null, // (made once with the plane, from the side the camera looked from; it turns and moves with the plane, and does not change with the camera)
  });
  orientBar.show(orbc.orienting() && !!orb);
  ui.update(view.pageState(s, e));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

dev.install({ planes: () => ({ sketch, ...orbc.debug() }), model, rebuild: world.rebuild, state: () => s, put: (next) => { s = next; }, pointer: () => pointer, game, gizmoScale: () => view.gizmoScale(s) });

import { settings } from "./settings.ts";
import * as cam from "./camera.ts";
import { attach } from "./input.ts";
import { createGame } from "./game.ts";
import { createWorld, PLANES, type PlaneId } from "./world.ts";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const world = createWorld(canvas, document.body);
const game = createGame();
const ring = document.getElementById("ring")!;

let c = cam.home();
let anim: { from: cam.Cam; to: cam.Cam; t0: number } | null = null;
let selected: PlaneId | null = "z";
let dirty = true;
let leaving = 0; // how far a drag has gone while in a straight view

const size = () => ({ w: canvas.clientWidth, h: canvas.clientHeight });
const set = (next: cam.Cam) => { c = next; dirty = true; };
const goTo = (to: cam.Cam) => { anim = { from: c, to: { ...to, mix: cam.mixGoal(to) }, t0: performance.now() }; dirty = true; };

function select(id: PlaneId | null) {
  selected = id; world.setSelected(id); dirty = true;
  for (const b of document.querySelectorAll<HTMLButtonElement>("#planes button")) b.classList.toggle("on", b.dataset.id === id);
}
/** Select a plane and look straight at it (the same again looks from the other side). */
function lookAt(id: PlaneId) { select(id); goTo(cam.lookAlternating(anim?.to ?? c, PLANES[id].normal, PLANES[id].u)); }

// the three plane buttons
const buttons = document.getElementById("planes")!;
for (const id of ["x", "y", "z"] as PlaneId[]) {
  const b = document.createElement("button");
  b.textContent = id.toUpperCase(); b.dataset.id = id; b.title = `Look straight at the ${PLANES[id].name} plane`;
  b.onclick = () => lookAt(id);
  buttons.append(b);
}
select(selected);

const stopTouring = () => { anim = null; };
const detach = attach(canvas, {
  orbit(dx, dy) {
    if (game.on) return;
    if (c.straight) { leaving += Math.hypot(dx, dy); if (leaving < settings.view.leaveStraightPx) return; }
    stopTouring(); set(cam.orbit(c, dx, dy));
  },
  pan(dx, dy) { stopTouring(); set(cam.pan(c, dx, dy, size().h)); },
  zoom(factor, x, y) {
    const { w, h } = size();
    stopTouring(); set(cam.zoom(c, Math.min(5, Math.max(0.2, factor)), (x / w) * 2 - 1, -((y / h) * 2 - 1), w / h));
  },
  hover(x, y) { world.setHover(world.pick(x, y)); dirty = true; },
  click(x, y, count) {
    const id = world.pick(x, y);
    if (!id) return;
    if (count >= 2) lookAt(id); else select(selected === id ? null : id);
  },
  dragEnd() { leaving = 0; },
}, { locked: () => document.pointerLockElement === canvas });

// keys: X Y Z look straight at a plane; W A S D fly; Esc leaves flying, then clears the selection
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (game.key(e.code, true)) {
    if (!e.repeat) { stopTouring(); set({ ...c, mix: 1, straight: false }); canvas.requestPointerLock?.()?.catch?.(() => {}); }
    return;
  }
  if (e.code === "Escape") { if (game.on) endGame(); else select(null); return; }
  if (e.code === "KeyX" || e.code === "KeyY" || e.code === "KeyZ") lookAt(e.code.slice(3).toLowerCase() as PlaneId);
});
addEventListener("keyup", (e) => { game.key(e.code, false); });
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas || !game.on) return;
  set(cam.swivel(c, e.movementX * settings.input.flyLookScale, e.movementY * settings.input.flyLookScale));
});
document.addEventListener("pointerlockchange", () => { if (document.pointerLockElement !== canvas && game.on) endGame(); });
function endGame() { game.end(); if (document.pointerLockElement) document.exitPointerLock(); ring.style.display = "none"; dirty = true; }

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / settings.view.transitionMs);
    set(k >= 1 ? anim.to : cam.blend(anim.from, anim.to, cam.ease(k)));
    if (k >= 1) anim = null;
  } else if (!c.straight && c.mix < 1) set({ ...c, mix: Math.min(1, c.mix + (dt * 1000) / settings.view.perspectiveMs) }); // perspective comes back after leaving a straight view
  const g = game.tick(dt);
  if (g.on) { ring.style.display = "block"; if (g.ahead || g.side) set(cam.walk(c, g.ahead, g.side, dt)); dirty = true; }
  else if (ring.style.display === "block") endGame();
  if (dirty) { dirty = false; const { w, h } = size(); world.resize(w, h); world.render(c); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener("resize", () => { dirty = true; });
(window as unknown as { __cad: unknown }).__cad = { get cam() { return c; }, get selected() { return selected; }, game, goTo: (to: cam.Cam) => goTo(to) };
void detach;

// The controller: it turns what the page and the browser report (intents, keys, time) into calls on the world view's pure functions (view.ts),
// keeps the state they return, and tells the drawing and the page what to show.
// Everything about how the view behaves is in view.ts; what is here is the wiring, and the few things only the browser can do (the pointer
// lock, the ring that marks game mode).
import { attach } from "./input.ts";
import { createGame } from "./game.ts";
import { createWorld } from "./world.ts";
import { createUi } from "./ui.ts";
import * as dev from "./dev.ts";
import * as view from "./view.ts";
import { project, forward, type Axis } from "./camera.ts";
import { focusOf, gridLevelAt } from "./sense.ts";
import { acrossView, borderOf, cutFaceOf, facingCamera, frameOf, noPlanes, regionsOf, vOf, type Cut } from "./planes.ts";
import { faceNormal, pick, type Hit } from "./pick.ts";
import { apply, marksOf, noMarks, type Sel } from "./select.ts";
import { createCutUi, createMenu, type MenuItem } from "./menu.ts";
import { add, dot, scale, sub, type V3 } from "./vec.ts";

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
// ---- sketch planes, cut planes and selecting (a prototype: docs/rebuild/sketch_planes_requirements.md) ----
let P = noPlanes();
let sel: Sel = [], selBefore: Sel = [], anchor: V3 | null = null, orienting: string | null = null, hovered: Hit | null = null;
const size = () => { const e = env(); return { w: e.w, h: e.h }; };
const regions = () => regionsOf(P, s.c);
const borders = () => P.cuts.map((k) => ({ id: k.id, poly: borderOf(k, model) }));
const pointerAt = (x: number, y: number) => { const { w, h } = size(); return game.on ? { x: w / 2, y: h / 2 } : { x, y }; };
const pickAt = (x: number, y: number): Hit | null => { const { w, h } = size(), q = pointerAt(x, y); return pick(model, regions(), borders(), s.c, w, h, q.x, q.y); };
const cutOf = (id: string): Cut | undefined => P.cuts.find((k) => k.id === id);
/** The sketch is over (another plane is on): its temporary cut plane goes with it. */
function endTemps() { P.cuts = P.cuts.filter((k) => !k.temp); sel = sel.filter((i) => i.kind !== "cut" || cutOf(i.id!)); }
function endSketch() { P.sketch = null; endTemps(); }
function lookAt(axis: Axis) { if (game.on) endGame(); endSketch(); s = view.lookAt(s, env(), axis); }
function selectCut(k: Cut, at: V3) { sel = [{ kind: "cut", id: k.id }]; anchor = at; }
function addCut(): void {
  const { w, h } = size(), k: Cut = { ...acrossView(s.c, focusOf(model, s.c, w, h)), id: `c${P.next++}`, on: true, temp: false };
  P.cuts.push(k); selectCut(k, borderOf(k, model)[0]!); orienting = k.id;
}
function sketchOn(f: { origin: V3; normal: V3; u: V3 }, temp: boolean) {
  endTemps(); P.sketch = { origin: f.origin, normal: f.normal, u: f.u };
  if (temp) P.cuts.push({ ...f, id: `c${P.next++}`, on: true, temp: true });
}
const ctx = { hit: null as Hit | null };
function choose(id: string) {
  const { w, h } = size(), hit = ctx.hit;
  if (id === "sketch-plane") sketchOn(facingCamera(s.c, focusOf(model, s.c, w, h)), false);
  else if (id === "cut-plane") addCut();
  else if (id === "sketch-here" && hit?.kind === "face") sketchOn(frameOf(hit.point, faceNormal(hit.index!)), true);
  else if (hit?.kind === "cut") cutUi.handlers[id as "cut-toggle"]?.(hit.id!);
}
function menuItems(hit: Hit | null): MenuItem[] {
  const tools: MenuItem[] = [["Line", "line"], ["Rectangle", "rect"], ["Circle", "circle"], ["Arc", "arc"]].map(([t, i]) => ({ id: `tool-${t}`, label: t!, icon: i!, enabled: false, note: "not built yet" }));
  if (hit?.kind === "cut") {
    const k = cutOf(hit.id!)!;
    return [{ id: "cut-toggle", label: k.on ? "Switch it off" : "Switch it on", icon: k.on ? "eye" : "eyeOff" }, ...(k.temp ? [] : [{ id: "cut-orient", label: "Orient", icon: "orient" }, { id: "cut-sketch", label: "Make a sketch plane here", icon: "sheetPlain" }, { id: "cut-away", label: "Put away", icon: "trash" }])];
  }
  return [...(hit?.kind === "face" ? [{ id: "sketch-here", label: "Sketch here", icon: "sketch" }] : []), ...tools, { id: "sketch-plane", label: "Sketch plane", icon: "sheetPlain" }, { id: "cut-plane", label: "Cut plane", icon: "section" }];
}
const menu = createMenu(document.body, choose);
const cutUi = (() => {
  const handlers = {
    "cut-toggle": (id: string) => { const k = cutOf(id); if (k) k.on = !k.on; },
    "cut-orient": (id: string) => { orienting = orienting === id ? null : id; const k = cutOf(id); if (k) selectCut(k, borderOf(k, model)[0]!); },
    "cut-away": (id: string) => { P.cuts = P.cuts.filter((k) => k.id !== id); sel = []; orienting = null; },
    "cut-sketch": (id: string) => { const k = cutOf(id); if (k) sketchOn(k, false); },
  };
  const ui = createCutUi(document.body, {
    toggle: handlers["cut-toggle"], orient: handlers["cut-orient"], away: handlers["cut-away"], sketch: handlers["cut-sketch"],
    across: (id, axis) => { const k = cutOf(id); if (!k) return; const n: V3 = axis === "camera" ? scale(forward(s.c), -1) : [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0]; Object.assign(k, frameOf(k.origin, n)); anchor = borderOf(k, model)[0]!; },
    drag: (id, dx, dy) => { // the plane goes along its normal by what the pointer went along the normal's picture
      const k = cutOf(id); if (!k) return; const { w, h } = size(), a = project(s.c, k.origin, w, h), b = project(s.c, add(k.origin, scale(k.normal, 10)), w, h);
      const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy; if (l2 < 1e-6) return;
      k.origin = add(k.origin, scale(k.normal, (10 * (dx * vx + dy * vy)) / l2));
    },
  });
  return { ...ui, handlers };
})();
function reset() { if (game.on) endGame(); s = view.reset(s, env()); }

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
  click: (x, y, count, shift = false) => {
    pointer = { x, y };
    if (menu.isOpen()) { menu.close(); return; }
    if (count === 1) selBefore = sel;
    const hit = pickAt(x, y), double = count >= 2;
    if (hit) { sel = apply(double ? selBefore : sel, hit, { shift, double }); if (hit.kind === "cut") { anchor = hit.point; if (orienting !== hit.id) orienting = null; } return; }
    if (double) return;
    const next = view.click(s, env(), x, y); // (nothing there: a pane of a world plane, or nothing)
    if (next !== s) { endSketch(); s = next; } else sel = apply(sel, null, { shift, double: false });
  },
  menu: (x, y) => { pointer = { x, y }; ctx.hit = pickAt(x, y); menu.open(x, y, menuItems(ctx.hit)); },
  look: (dx, dy) => game.look(dx, dy),
  space: () => { if (game.on) endGame(); else startGame(); },
}, () => document.pointerLockElement === canvas);

addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (game.moves(e.code) && !game.on && !e.repeat) startGame(); // (W A S D turn the game on too, and the key that did it moves the eye)
  if (game.key(e.code, true)) return;
  if (e.code === "Escape") { if (menu.isOpen()) menu.close(); else if (game.on) endGame(); else { sel = []; orienting = null; } }
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
  const e = env(now);
  const d = view.drawing(s, e, pointer), { w, h } = e;
  hovered = pointer || game.on ? (menu.isOpen() ? null : pickAt(pointer?.x ?? 0, pointer?.y ?? 0)) : null;
  canvas.style.cursor = hovered ? "pointer" : "";
  const sk = P.sketch;
  world.render({
    ...d, ...(sk ? { grid: gridLevelAt(s.c, Math.abs(dot(sub(s.c.eye, sk.origin), sk.normal))) } : {}),
    planes: {
      sketch: sk ? { origin: sk.origin, u: sk.u, v: vOf(sk), n: sk.normal } : null,
      clips: regions().map((r) => ({ origin: r.origin, n: r.n })),
      cuts: P.cuts.map((k) => ({ border: borderOf(k, model), on: k.on, selected: sel.some((i) => i.kind === "cut" && i.id === k.id), temp: k.temp, faces: k.on && !k.temp ? model.things.map((t) => cutFaceOf(k, t)).filter((p) => p.length >= 3).map((poly) => ({ poly, u: k.u, v: vOf(k) })) : [] })),
      selected: marksOf(model, sel), hover: hovered && hovered.kind !== "cut" ? marksOf(model, [hovered]) : noMarks(),
    },
  });
  const sc = sel.length === 1 && sel[0]!.kind === "cut" ? cutOf(sel[0]!.id!) : undefined;
  if (!sc) orienting = null;
  const scr = (p: V3 | null): [number, number] | null => { if (!p) return null; const q = project(s.c, p, w, h); return q.x > -50 && q.x < w + 50 && q.y > -50 && q.y < h + 50 ? [q.x, q.y] : null; };
  const kept = (p: V3 | null): [number, number] | null => { if (!p) return null; const q = project(s.c, p, w, h); return q.depth > 0 || s.c.ortho !== null ? [Math.min(Math.max(q.x, 8), w - 240), Math.min(Math.max(q.y, 8), h - 120)] : null; }; // (the bubble stays on the screen even when the plane's point has left it)
  cutUi.update(sc ? { id: sc.id, anchor: kept(anchor), handle: scr(sc.origin), on: sc.on, temp: sc.temp, orienting: orienting === sc.id } : null);
  ui.update(view.pageState(s, e));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

dev.install({ planes: () => ({ P, sel }), model, rebuild: world.rebuild, state: () => s, put: (next) => { s = next; }, pointer: () => pointer, game, gizmoScale: () => view.gizmoScale(s) });

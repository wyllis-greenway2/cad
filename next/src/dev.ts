// Aids for trying the world view by hand at this stage. None of it is part of the app: the address picks the stand-in model and can tune a
// number, the B key adds or takes away the stand-in things (so the
// axes' change from scaled to scale free can be seen), and `window.__cad` lets a script read the state and put the camera somewhere.
import { settings } from "./settings.ts";
import { demoScene, emptyScene, oneScene, type Scene } from "./scene.ts";
import type { Cam } from "./camera.ts";
import type { ViewState } from "./view.ts";

/** `?boxes=0`: an empty model; `?boxes=1`: one box at the origin; otherwise three boxes. */
export const sceneFromAddress = (params: URLSearchParams): Scene => (params.get("boxes") === "0" ? emptyScene() : params.get("boxes") === "1" ? oneScene() : demoScene());
/** `?wheel=0.001`: how far a wheel notch goes, as a share of the step scale per unit of wheel (the default is in settings). */
export function tuneFromAddress(params: URLSearchParams): void {
  if (params.get("wheel")) settings.input.zoomPerWheel = Number(params.get("wheel"));
  if (params.get("pan")) settings.input.trackpadPanScale = Number(params.get("pan")); // (?pan=0.5: how far a trackpad's two-finger scroll pans, as a share of the fingers' travel)
  if (params.get("pinch")) settings.input.pinchZoomPerWheel = Number(params.get("pinch")); // (?pinch=0.01: how far a trackpad's pinch zooms, per unit of its delta)
  if (params.get("natural")) settings.input.trackpadNatural = params.get("natural") !== "0"; // (?natural=0: the scroll goes the other way to the fingers)
}
export interface DevHooks {
  model: Scene;
  rebuild(): void;
  state(): ViewState;
  put(next: ViewState): void;
  pointer(): { x: number; y: number } | null;
  game: unknown;
  gizmoScale(): number;
}
export function install(h: DevHooks): void {
  addEventListener("keydown", (e) => {
    if (e.code === "KeyB" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) { h.model.things = h.model.things.length ? [] : demoScene().things; h.rebuild(); }
  });
  (window as unknown as { __cad: unknown }).__cad = {
    get cam() { return h.state().c; }, get plane() { return h.state().plane; }, get free() { return h.state().free; }, get go() { return h.state().go; },
    get gizmo() { return h.gizmoScale(); }, get pointer() { return h.pointer(); }, game: h.game, model: h.model,
    set(next: Partial<Cam>) { h.put({ ...h.state(), c: { ortho: null, lens: 1, ...next } as Cam, go: null }); },
  };
}

/** `?probe=1`: a small counter in the corner of what the page is told while keys are held (does a trackpad's scroll or movement still arrive with W A S D down?). */
export function probe(): void {
  const box = document.createElement("pre");
  box.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99;margin:0;padding:6px 8px;font:12px monospace;background:#fffd;border:1px solid #bbb;pointer-events:none";
  document.body.appendChild(box);
  const n = { keys: new Set<string>(), idle: { wheel: 0, move: 0 }, held: { wheel: 0, move: 0 } };
  const draw = () => { box.textContent = `keys held: ${[...n.keys].join(" ") || "none"}\nno key:   wheel ${n.idle.wheel}   move ${n.idle.move}\nkey down: wheel ${n.held.wheel}   move ${n.held.move}`; };
  const count = (what: "wheel" | "move") => { (n.keys.size ? n.held : n.idle)[what]++; draw(); };
  addEventListener("keydown", (e) => { n.keys.add(e.code); draw(); }, true);
  addEventListener("keyup", (e) => { n.keys.delete(e.code); draw(); }, true);
  addEventListener("wheel", () => count("wheel"), { capture: true, passive: true });
  addEventListener("pointermove", (e) => { if (e.movementX || e.movementY) count("move"); }, true);
  draw();
}

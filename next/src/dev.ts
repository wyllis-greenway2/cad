// Aids for trying the world view by hand at this stage. None of it is part of the app: the address picks the stand-in model and can tune a
// number, the B key adds or takes away the stand-in things (so the
// axes' change from scaled to scale free can be seen), and `window.__cad` lets a script read the state and put the camera somewhere.
import { settings } from "./settings.ts";
import { demoScene, emptyScene, oneScene, type Scene } from "./scene.ts";
import type { Cam } from "./camera.ts";
import type { ViewState } from "./view.ts";

/** The world starts empty. For trying things by hand: `?boxes=1` one box at the origin, `?boxes=3` three. */
export const sceneFromAddress = (params: URLSearchParams): Scene =>
  params.get("boxes") === "1" ? oneScene() : params.get("boxes") === "3" ? demoScene() : emptyScene();
/** `?wheel=0.001`: how far a wheel notch goes, as a share of the step scale per unit of wheel (the default is in settings). */
export function tuneFromAddress(params: URLSearchParams): void {
  if (params.get("wheel")) settings.input.zoomPerWheel = Number(params.get("wheel"));
  if (params.get("pan")) settings.input.trackpadPanScale = Number(params.get("pan")); // (?pan=0.5: how far a trackpad's two-finger scroll pans, as a share of the fingers' travel)
  if (params.get("pinch")) settings.input.pinchZoomPerWheel = Number(params.get("pinch")); // (?pinch=0.01: how far a trackpad's pinch zooms, per unit of its delta)
  if (params.get("natural")) settings.input.trackpadNatural = params.get("natural") !== "0"; // (?natural=0: the scroll goes the other way to the fingers)
}
export interface DevHooks {
  planes(): unknown;
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
    if (e.code === "KeyB" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
      h.model.things = h.model.things.length ? [] : demoScene().things;
      h.rebuild();
    }
  });
  (window as unknown as { __cad: unknown }).__cad = {
    get cam() {
      return h.state().c;
    },
    get plane() {
      return h.state().plane;
    },
    get free() {
      return h.state().free;
    },
    get go() {
      return h.state().go;
    },
    get gizmo() {
      return h.gizmoScale();
    },
    get pointer() {
      return h.pointer();
    },
    game: h.game,
    model: h.model,
    get planes() {
      return h.planes();
    },
    set(next: Partial<Cam>) {
      h.put({ ...h.state(), c: { ortho: null, lens: 1, ...next } as Cam, go: null });
    },
  };
}

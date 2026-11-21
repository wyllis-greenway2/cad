// What the tests share: a scene, an Env, and a few measuring helpers. (Not a test file.)
import * as cam from "../src/camera.ts";
import { demoScene, oneScene, emptyScene, type Scene } from "../src/scene.ts";
import { initial, type Env, type ViewState } from "../src/view.ts";
import { add, scale, type V3 } from "../src/vec.ts";

export const W = 1100, H = 720;
export { demoScene, oneScene, emptyScene, cam };
export const env = (model: Scene, over: Partial<Env> = {}): Env => ({ model, w: W, h: H, now: 0, gameOn: false, ...over });
export const startState = (model: Scene, over: Partial<ViewState> = {}): ViewState => ({ ...initial(model), ...over });
export const px = (c: cam.Cam, p: V3) => { const q = cam.project(c, p, W, H); return [q.x, q.y] as const; };
export const near = (a: number, b: number, eps: number, msg = "") => { if (!(Math.abs(a - b) <= eps)) throw new Error(`${msg} ${a} is not within ${eps} of ${b}`); };
/** A point `d` mm along the ray through the pixel (x, y). */
export const pointAt = (c: cam.Cam, x: number, y: number, d: number): V3 => { const r = cam.rayFrom(c, (x / W) * 2 - 1, -((y / H) * 2 - 1), W / H); return add(r.o, scale(r.d, d)) as V3; };

import * as view from "../src/view.ts";
/** Time passes until the change of view in progress is over. */
export function settle(s: ViewState, model: Scene, over: Partial<Env> = {}, startMs = 0): ViewState {
  let t = startMs;
  for (let i = 0; i < 400 && s.go; i++) { t += 16; s = view.advance(s, env(model, { now: t, ...over }), 0.016); }
  return s;
}
export { view };
/** Where the plane's pane stands, as a point of the world, at gizmo scale 1: the middle of its square. */
export const paneCentre = (axis: 0 | 1 | 2): V3 => { const p: V3 = [0, 0, 0]; const m = 3 + 4; for (let i = 0; i < 3; i++) if (i !== axis) p[i] = m; return p; };

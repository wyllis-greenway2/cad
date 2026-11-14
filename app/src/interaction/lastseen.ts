// What is in view, and where to go when nothing is (`in_303`): the things of the model (each body, else the drawing as one) with the box round each; the one last seen is remembered, so that a "Reset camera" can go back to it,
// or, if it is gone, to the last one there is.
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Camera } from "./camera.ts";
import { basis, position } from "./camera.ts";
import type { AppState } from "./control/state.ts";
import { scene as sceneOf } from "./session.ts";

export interface Thing { id: string; lo: Vec3; hi: Vec3 }
const SKETCH = "sketch";

/** The bodies in the order they were made, each with its box; with no body, the drawing (its corners) as one thing; none for an empty model. */
function thingsOf(sc: Scene): Thing[] {
  const bodies: Thing[] = [];
  for (const p of Object.values(sc.parts)) if (p.kind === "body" && p.bbox) bodies.push({ id: p.id ?? p.ref, lo: p.bbox.min, hi: p.bbox.max });
  if (bodies.length) return bodies;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const p of Object.values(sc.parts)) if (p.kind === "corner" && p.origin === "drawn") { any = true; for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i]!, p.at[i]!); hi[i] = Math.max(hi[i]!, p.at[i]!); } }
  return any ? [{ id: SKETCH, lo: lo as unknown as Vec3, hi: hi as unknown as Vec3 }] : [];
}

/** Does any of the box show in a view of this size? Its corners are taken to the screen (those in front of the eye); the box shows when the rectangle they make meets the screen. */
function inView(cam: Camera, w: number, h: number, t: Thing, project: (p: Vec3) => [number, number]): boolean {
  const eye = position(cam);
  const f = basis(cam).forward;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let front = 0;
  for (const x of [t.lo[0], t.hi[0]]) for (const y of [t.lo[1], t.hi[1]]) for (const z of [t.lo[2], t.hi[2]]) {
    const depth = (x - eye[0]) * f[0] + (y - eye[1]) * f[1] + (z - eye[2]) * f[2];
    if (depth <= 1e-3 && !cam.straight) continue; // (behind the eye)
    const [px, py] = project([x, y, z]);
    front++;
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  return front > 0 && x1 >= 0 && x0 <= w && y1 >= 0 && y0 <= h && Math.max(x1 - x0, y1 - y0) >= 6; // (a speck of a few pixels is not in view: it could not be found by eye)
}

/** The thing to go to: the one last seen, else the last there is. */
export function resetTarget(s: AppState): Thing | null {
  const things = thingsOf(sceneOf(s.session));
  return things.find((t) => t.id === s.lastSeen) ?? things[things.length - 1] ?? null;
}

/** Whether the model has things and none of them is in view now. */
export function nothingInView(s: AppState, w: number, h: number, project: (p: Vec3) => [number, number]): boolean {
  const things = thingsOf(sceneOf(s.session));
  return things.length > 0 && !things.some((t) => inView(s.cam, w, h, t, project));
}

/** Remember the last thing that is in view (kept while none is). */
export function noteSeen(s: AppState, w: number, h: number, project: (p: Vec3) => [number, number]): AppState {
  const things = thingsOf(sceneOf(s.session));
  const seen = [...things].reverse().find((t) => inView(s.cam, w, h, t, project));
  return seen && seen.id !== s.lastSeen ? { ...s, lastSeen: seen.id } : s;
}

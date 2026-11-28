// Where the arrow of a pick stands (`in_1738`): near where the pick was clicked, not under it (so a second click is a click and not a press on the arrow), and on the thing picked: a face, a figure of a drawing, an edge.
// ONE rule for all of them: a place `aside` pixels from the click, across the thing the way the camera's right goes, on either side, that the thing keeps (`nearest`); the click itself if there is none. Pure.
import { forwardDepth, rightOf, upOf, viewHeight, type Cam } from "../camera.ts";
import { settings } from "../settings.ts";
import type { V3 } from "../vec.ts";

/** how far from the click the arrow stands, in mm, where the click is: `settings.helpers.arrowAsidePx` pixels */
export const asideMm = (cam: Cam, h: number, at: V3): number =>
  (settings.helpers.arrowAsidePx * viewHeight(cam, Math.max(forwardDepth(cam, at), 1e-3))) / h;
/** the way across a surface that faces `normal`: the camera's right laid in it, else up (the surface faces the eye) */
export function wayAcross(cam: Cam, normal: V3): V3 {
  const unit = (v: V3): V3 => {
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / l, v[1] / l, v[2] / l];
    },
    lay = (v: V3): V3 => {
      const k = v[0] * normal[0] + v[1] * normal[1] + v[2] * normal[2];
      return [v[0] - normal[0] * k, v[1] - normal[1] * k, v[2] - normal[2] * k];
    },
    r = lay(rightOf(cam));
  return Math.hypot(...r) > 0.2 ? unit(r) : unit(lay(upOf(cam)));
}
/** a place of the thing `step` from the click along `way`, either side (`nearest` gives the place of the thing nearest a place: itself when it is on it); the click when neither side is far enough from it */
export function spotBeside(click: V3, way: V3, step: number, nearest: (p: V3) => V3): V3 {
  for (const sign of [1, -1]) {
    const q = nearest([
      click[0] + way[0] * step * sign,
      click[1] + way[1] * step * sign,
      click[2] + way[2] * step * sign,
    ]);
    if (Math.hypot(q[0] - click[0], q[1] - click[1], q[2] - click[2]) >= step * 0.5) return q;
  }
  return click;
}

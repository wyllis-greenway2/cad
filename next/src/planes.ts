// A flat surface for sketching: a point on it, the way it faces and which way its first axis runs. One sketch plane is active and carries the grid; the world's X, Y, Z planes are the
// other kind of sketch plane (view.ts); this is one placed anywhere, at any angle.
import { cross, scale, unit, type V3 } from "./vec.ts";
import { forward, type Cam } from "./camera.ts";
import { settings } from "./settings.ts";

export interface Frame {
  origin: V3;
  normal: V3;
  u: V3;
}
export const vOf = (f: Frame): V3 => cross(f.normal, f.u);
/** The frame of a plane with this normal: its first axis is the horizontal one, so Z stays up in it. */
export function frameOf(origin: V3, normal: V3): Frame {
  const n = unit(normal);
  return { origin, normal: n, u: Math.abs(n[2]) > 0.999 ? [1, 0, 0] : unit(cross([0, 0, 1], n)) };
}
/** A normal near a world axis is made that axis. */
export function snapNormal(n: V3): V3 {
  for (let a = 0; a < 3; a++)
    if (Math.abs(n[a]!) > Math.cos(settings.planes.snapAxisRad)) {
      const r: V3 = [0, 0, 0];
      r[a] = n[a]! > 0 ? 1 : -1;
      return r;
    }
  return unit(n);
}
/** A sketch plane at `point` facing the camera (snapped to an axis when near one). */
export const facingCamera = (c: Cam, point: V3): Frame => frameOf(point, snapNormal(scale(forward(c), -1)));
/** One of the world's planes as a frame (the same axes as its grid and its pane: the first two of the axes across it, in order). */
export function worldFrame(axis: 0 | 1 | 2): Frame {
  const [i, j] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1],
    u: V3 = [0, 0, 0],
    v: V3 = [0, 0, 0];
  u[i!] = 1;
  v[j!] = 1;
  return { origin: [0, 0, 0], normal: cross(u, v), u };
}

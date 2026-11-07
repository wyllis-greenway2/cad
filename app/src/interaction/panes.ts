// The three little panes beside the axes (`in_190`): semi-transparent squares pulled a little away from the origin, one in each world plane. Clicking one turns that world plane on and looks straight at it.
// Only the plane that is on has the grid and is found by the pointer, so getting onto another plane is a deliberate click here (or on the X Y Z buttons).
import type { Vec3 } from "../math/vec.ts";
import { settings } from "../shared/settings.ts";
import type { Camera } from "./camera.ts";
import { projector } from "./camera.ts";

export type WorldName = "XY" | "XZ" | "YZ";
export const WORLD_NAMES: readonly WorldName[] = ["XY", "XZ", "YZ"];
const AXIS: Record<"X" | "Y" | "Z", Vec3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

/** The four corners of a plane's pane: a square in the positive quarter of the plane, from a little way off the origin. */
export function paneCorners(name: WorldName): Vec3[] {
  const [u, v] = [AXIS[name[0] as "X" | "Y" | "Z"], AXIS[name[1] as "X" | "Y" | "Z"]];
  const [g, e] = [settings.world.paneGapMm, settings.world.paneGapMm + settings.world.paneMm];
  const at = (a: number, b: number): Vec3 => [u[0] * a + v[0] * b, u[1] * a + v[1] * b, u[2] * a + v[2] * b];
  return [at(g, g), at(e, g), at(e, e), at(g, e)];
}

const inQuad = (q: [number, number][], x: number, y: number): boolean => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [a, b] = [q[i]!, q[(i + 1) % 4]!];
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (c !== 0) { if (sign !== 0 && Math.sign(c) !== sign) return false; sign = Math.sign(c); }
  }
  return true;
};

/** The pane under a screen point, if any (a pane seen edge-on is not there to hit). */
export function paneAt(cam: Camera, w: number, h: number, x: number, y: number): WorldName | null {
  const pr = projector(cam, w, h);
  for (const name of WORLD_NAMES) {
    const q = paneCorners(name).map((p) => pr.project(p) as unknown as [number, number]);
    const area = Math.abs(q.reduce((a, p, i) => a + (p[0] * q[(i + 1) % 4]![1] - q[(i + 1) % 4]![0] * p[1]), 0)) / 2;
    if (area > 4 && inQuad(q, x, y)) return name;
  }
  return null;
}

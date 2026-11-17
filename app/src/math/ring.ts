// The points of a circle in 3D: a closed polyline (97 points, the first repeated at the end), flat xyz. Pure; the view draws it and the line lists are made from it.
import type { Vec3 } from "./vec.ts";
import { cross, normalize } from "./vec.ts";

export function ringPoints(center: Vec3, radius: number, normal: Vec3): number[] {
  const n = normalize(normal);
  const a: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(a, n));
  const v = cross(n, u);
  const out: number[] = [];
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    const [c, s] = [Math.cos(t), Math.sin(t)];
    out.push(center[0] + (u[0] * c + v[0] * s) * radius, center[1] + (u[1] * c + v[1] * s) * radius, center[2] + (u[2] * c + v[2] * s) * radius);
  }
  return out;
}

// The grid on the plane you look straight at (`in_066`: shown only when looking straight, faint, finer as you zoom in). Pure: the visible part of the plane as line segments.
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot } from "../math/vec.ts";
import type { Plane } from "../operation/part.ts";
import { normalOfPlane } from "../operation/part.ts";
import type { Camera } from "./camera.ts";
import { projector, sideOf } from "./camera.ts";
import { settings } from "../shared/settings.ts";

export interface Grid { minor: number[]; major: number[]; step: number; /** seen from the side the grid is a patch that fades out towards its edge: about this point, gone at this far (its lines are cut into short pieces so that the fade can follow them) */ fade?: { center: Vec3; radius: number } }

/** A round step (1, 2 or 5 times a power of ten) so that about `divisions` lines span the view. */
export function niceStep(span: number, divisions: number): number {
  const raw = span / divisions;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** The grid of `plane` if the camera is looking straight at it (from either side), else null. Segments are flat xyz pairs; `major` every fifth line. */
export function gridFor(cam: Camera, plane: Plane, widthPx: number, heightPx: number): Grid | null {
  const n = normalOfPlane(plane);
  if (sideOf(cam, n) === 0) return patchFor(cam, plane);
  const pr = projector(cam, widthPx, heightPx);
  // the visible rectangle of the plane: where the rays through the four screen corners meet it
  const local: [number, number][] = [];
  for (const [x, y] of [[0, 0], [widthPx, 0], [widthPx, heightPx], [0, heightPx]] as const) {
    const r = pr.ray(x, y);
    const den = dot(n, r.d);
    if (Math.abs(den) < 1e-9) return null;
    const t = dot(n, sub(plane.at, r.o)) / den;
    const p = add(r.o, scale(r.d, t));
    local.push([dot(sub(p, plane.at), plane.u), dot(sub(p, plane.at), plane.v)]);
  }
  const xs = local.map((q) => q[0]);
  const ys = local.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const step = niceStep(Math.max(x1 - x0, y1 - y0), settings.grid.divisions);
  const minor: number[] = [];
  const major: number[] = [];
  const at = (x: number, y: number): Vec3 => add(plane.at, add(scale(plane.u, x), scale(plane.v, y)));
  const run = (lo: number, hi: number, f: (v: number, isMajor: boolean) => void) => {
    const first = Math.ceil(lo / step);
    for (let i = first; i * step <= hi && i - first < 400; i++) f(i * step, i % 5 === 0);
  };
  run(x0, x1, (x, m) => (m ? major : minor).push(...at(x, y0), ...at(x, y1)));
  run(y0, y1, (y, m) => (m ? major : minor).push(...at(x0, y), ...at(x1, y)));
  return { minor, major, step };
}

/** Looked at from the side (not straight): a square patch of the plane about the point under the view's middle, as wide as the view is deep, so the grid is always there to be seen on. */
function patchFor(cam: Camera, plane: Plane): Grid {
  const n = normalOfPlane(plane);
  const c = sub(cam.target, scale(n, dot(n, sub(cam.target, plane.at))));
  const [cu, cv] = [dot(sub(c, plane.at), plane.u), dot(sub(c, plane.at), plane.v)];
  const half = Math.max(cam.distance * 0.9, 10);
  const step = niceStep(2 * half, settings.grid.divisions);
  const [x0, x1, y0, y1] = [Math.floor((cu - half) / step) * step, Math.ceil((cu + half) / step) * step, Math.floor((cv - half) / step) * step, Math.ceil((cv + half) / step) * step];
  const at = (x: number, y: number): Vec3 => add(plane.at, add(scale(plane.u, x), scale(plane.v, y)));
  const minor: number[] = [];
  const major: number[] = [];
  const PIECES = 24;
  const cut = (out: number[], a: [number, number], b: [number, number]) => { for (let k = 0; k < PIECES; k++) out.push(...at(a[0] + ((b[0] - a[0]) * k) / PIECES, a[1] + ((b[1] - a[1]) * k) / PIECES), ...at(a[0] + ((b[0] - a[0]) * (k + 1)) / PIECES, a[1] + ((b[1] - a[1]) * (k + 1)) / PIECES)); };
  for (let i = Math.round(x0 / step); i * step <= x1 + 1e-9; i++) cut(i % 5 === 0 ? major : minor, [i * step, y0], [i * step, y1]);
  for (let i = Math.round(y0 / step); i * step <= y1 + 1e-9; i++) cut(i % 5 === 0 ? major : minor, [x0, i * step], [x1, i * step]);
  return { minor, major, step, fade: { center: c, radius: half } };
}

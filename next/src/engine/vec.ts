// Plain 3D vector arithmetic on `[x, y, z]`, written once (the engine had five copies). Pure; no kernel.
export type V3 = readonly [number, number, number];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
/** the vector of length one in the same direction (a vector of nothing is left as it is) */
export const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** the axes a sketch on a face is drawn in: `u` is as `n` allows (the world's X across the face, or Y when the face is square to X), `v` across it (the engine's frame of a face, and the screen's, the same one, so a drawing made on the screen lands on the face) */
export function faceAxes(n: V3): { u: V3; v: V3 } {
  let u: V3 = [1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2]]; if (Math.hypot(...u) < 1e-3) u = [-n[1] * n[0], 1 - n[1] * n[1], -n[1] * n[2]];
  u = unit(u); return { u, v: cross(n, u) };
}

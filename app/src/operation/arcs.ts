// Small helpers the outlines of pulleys and sprockets share: a point by radius and angle, the bulge of a side from its middle, and the middle of an arc about a centre.
export type P = [number, number];
export const polar = (r: number, a: number): P => [r * Math.cos(a), r * Math.sin(a)];
/** How far the middle `m` of a side from `a` to `b` stands out from the chord, as a fraction of its length, positive to the left of the way it goes (the bulge of `Line`). */
export const bulgeOf = (a: P, m: P, b: P): number => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return 0;
  const off = ((m[0] - (a[0] + b[0]) / 2) * -dy + (m[1] - (a[1] + b[1]) / 2) * dx) / len;
  return Math.abs(off) < 1e-12 ? 0 : off / len;
};
/** The middle of the shorter arc of the circle about `c` of radius `r` from `a` to `b`. */
export const arcMid = (c: P, r: number, a: P, b: P): P => {
  const u: P = [a[0] - c[0], a[1] - c[1]], v: P = [b[0] - c[0], b[1] - c[1]];
  const [mx, my] = [u[0] + v[0], u[1] + v[1]];
  const l = Math.hypot(mx, my);
  return l < 1e-12 ? [c[0] - u[1], c[1] + u[0]] : [c[0] + (mx / l) * r, c[1] + (my / l) * r];
};

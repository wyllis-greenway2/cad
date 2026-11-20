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

/** an arc side as points: from `a` to `b` with the kernel's bulge */
export function flatten(pts: P[], bulges: number[], per = 8): P[] {
  const out: P[] = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!, k = bulges[i] ?? 0;
    out.push(a);
    if (Math.abs(k) < 1e-9) return;
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(dx, dy), sag = k * len;
    const m: P = [(a[0] + b[0]) / 2 - (dy / len) * sag, (a[1] + b[1]) / 2 + (dx / len) * sag];
    const [x1, y1, x2, y2, x3, y3] = [a[0], a[1], m[0], m[1], b[0], b[1]];
    const dd = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(dd) < 1e-12) return;
    const cx = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / dd, cy = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / dd;
    const r = Math.hypot(x1 - cx, y1 - cy), a1 = Math.atan2(y1 - cy, x1 - cx), a3 = Math.atan2(y3 - cy, x3 - cx), a2 = Math.atan2(y2 - cy, x2 - cx);
    const wrap = (v: number): number => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const ccw = wrap(a2 - a1) < wrap(a3 - a1);
    const sweep = ccw ? wrap(a3 - a1) : -wrap(a1 - a3);
    for (let j = 1; j < per; j++) out.push([cx + r * Math.cos(a1 + (sweep * j) / per), cy + r * Math.sin(a1 + (sweep * j) / per)]);
  });
  return out;
}

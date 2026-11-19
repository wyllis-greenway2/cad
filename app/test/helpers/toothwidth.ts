// The width of a gear tooth at a radius, measured on an outline (corners and the bulge of each side, as `gearOutline`, `spiralBody`, `crownSection` and `faceBody` make them): a tooth that is wider at its tip than a little under it, or a face gear's
// tooth wider at the top than the height below, is a flare the overlap numbers do not see (`in_1015`: the face gear's tooth tops). Tests in `toothshape.test.ts`.
export type Pt = [number, number];
/** the `k` points between `a` and `b` of the arc whose bulge (tan of a quarter of the angle, positive counter-clockwise) is `bu` */
function bulgeToArc(a: Pt, b: Pt, bu: number, k: number): Pt[] {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]], c = Math.hypot(dx, dy);
  const th = 4 * Math.atan(bu), r = (c * (1 + bu * bu)) / (4 * Math.abs(bu)), h = (Math.abs(bu) * c) / 2;
  const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s = Math.sign(bu);
  const ctr: Pt = [mx + s * (-dy / c) * (r - h), my + s * (dx / c) * (r - h)];
  const a0 = Math.atan2(a[1] - ctr[1], a[0] - ctr[0]);
  return Array.from({ length: k }, (_, i) => { const t = a0 + (th * (i + 1)) / (k + 1); return [ctr[0] + r * Math.cos(t), ctr[1] + r * Math.sin(t)] as Pt; });
}
/** the outline as a polygon: every side of a bulge sampled with `k` points */
export function polygonOf(points: Pt[], bulges: number[], k = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const [a, b] = [points[i]!, points[(i + 1) % points.length]!];
    out.push(a);
    const bu = bulges[i] ?? 0;
    if (Math.abs(bu) > 1e-9) for (const q of bulgeToArc(a, b, bu, k)) out.push(q);
  }
  return out;
}
const inside = (poly: Pt[], p: Pt): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i]!, poly[j]!];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};
/**
 * The width (mm) of the first tooth's material at each of `radii`, or null where there is none: the runs of material round the circle of that radius in a window of one and a half pitches about the tooth, the run nearest the one found at the radius before
 * (the tooth leans, so it is followed from the middle radius out each way). `z` the number of teeth, the tooth the points `0 .. n / z` (its corners).
 */
export function toothWidths(points: Pt[], bulges: number[], z: number, radii: number[]): (number | null)[] {
  const poly = polygonOf(points, bulges);
  const per = points.length / z, pitch = (2 * Math.PI) / z;
  const mean = points.slice(0, per).reduce((acc, p) => { const th = Math.atan2(p[1], p[0]); return [acc[0] + Math.cos(th), acc[1] + Math.sin(th)] as Pt; }, [0, 0] as Pt);
  const c0 = Math.atan2(mean[1], mean[0]);
  const N = 1800;
  const runsAt = (r: number): [number, number][] => { // (angles relative to c0, from the start of the run to its end)
    const runs: [number, number][] = [];
    let start: number | null = null;
    for (let i = 0; i <= N; i++) {
      const th = -0.75 * pitch + (1.5 * pitch * i) / N;
      const on = inside(poly, [r * Math.cos(c0 + th), r * Math.sin(c0 + th)]);
      if (on && start === null) start = th;
      if (!on && start !== null) { runs.push([start, th]); start = null; }
    }
    if (start !== null) runs.push([start, 0.75 * pitch]);
    return runs;
  };
  const res: (number | null)[] = radii.map(() => null);
  const mid = radii.length >> 1;
  const follow = (from: number, to: number, step: number, seed: number) => {
    let ref = seed;
    for (let i = from; i !== to; i += step) {
      const runs = runsAt(radii[i]!).filter(([a, b]) => a > -0.75 * pitch + 1e-9 && b < 0.75 * pitch - 1e-9); // (whole runs: one cut by the window is not the tooth)
      if (!runs.length) continue;
      const best = runs.reduce((p, q) => (Math.abs((q[0] + q[1]) / 2 - ref) < Math.abs((p[0] + p[1]) / 2 - ref) ? q : p));
      ref = (best[0] + best[1]) / 2;
      res[i] = (best[1] - best[0]) * radii[i]!;
    }
  };
  const runsMid = runsAt(radii[mid]!).filter(([a, b]) => a > -0.75 * pitch + 1e-9 && b < 0.75 * pitch - 1e-9);
  if (!runsMid.length) return res;
  const seed = runsMid.reduce((p, q) => (Math.abs((q[0] + q[1]) / 2) < Math.abs((p[0] + p[1]) / 2) ? q : p));
  const seedC = (seed[0] + seed[1]) / 2;
  res[mid] = (seed[1] - seed[0]) * radii[mid]!;
  follow(mid + 1, radii.length, 1, seedC);
  follow(mid - 1, -1, -1, seedC);
  return res;
}

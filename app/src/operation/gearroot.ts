// The root of an external involute gear as a cutter makes it (`dec_gear_tool`, `in_560`): the rack cutter's tooth is the straight flank at the pressure angle, ending at its tip in a corner of radius rho. Rolling the cutter on the
// pitch circle, its straight flank makes the involute and its corner the root fillet (a trochoid); with few teeth the corner cuts below the involute's start, which is the undercut. Pure maths in the gear's own x and y.
// The meshing condition makes it explicit: a point of the cutter's outline with outward normal (cos b, sin b) in the cutter's own (u along its pitch line, n toward the gear's middle) touches the gear when the normal passes
// through the pitch point, which gives the roll angle psi = (u - n cos b / sin b) / rp, and the gear's point is then (rp - n) e_r(psi) + (u - rp psi) e_t(psi).
type P = [number, number];
export interface RootInput { m: number; z: number; alpha: number; x: number; c: number; backlash: number; rho: number }
/** the half-gap's lower part, as radius and angle from the middle of the gap (the angle is positive toward the tooth that is on the plus side): the joint where the involute stops and the corner's curve takes over, then three arcs
 * of the corner's curve as their end points and middle points (7 points, the last on the root circle); `rLo` is the joint's radius, `undercut` whether the corner cut below the involute. */
export interface Root { pts: [number, number][]; rLo: number; undercut: boolean }

const polarOf = (u: number, n: number, psi: number, rp: number): [number, number] => {
  const t = u - rp * psi;
  return [Math.hypot(rp - n, t), psi + Math.atan2(t, rp - n)];
};
const xy = ([r, a]: [number, number]): P => [r * Math.cos(a), r * Math.sin(a)];
function cross(a: P, b: P, c: P, d: P): P | null {
  const [r, s] = [[b[0] - a[0], b[1] - a[1]], [d[0] - c[0], d[1] - c[1]]];
  const den = r[0]! * s[1]! - r[1]! * s[0]!;
  if (Math.abs(den) < 1e-14) return null;
  const [qx, qy] = [c[0] - a[0], c[1] - a[1]];
  const [t, u] = [(qx * s[1]! - qy * s[0]!) / den, (qx * r[1]! - qy * r[0]!) / den];
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9 ? [a[0] + t * r[0]!, a[1] + t * r[1]!] : null;
}

export function gearRoot(q: RootInput): { ok: true; value: Root } | { ok: false; error: string } {
  const { m, z, alpha: al, x, c, backlash, rho: ρ } = q;
  const rp = (m * z) / 2;
  const wref = (Math.PI * m) / 4 + backlash / 2; // (half the cutter tooth at its own pitch line, which is x m outside the gear's pitch circle)
  const w = (n: number) => wref - (n + x * m) * Math.tan(al);
  const nt = (1 + c - x) * m;
  if (!(ρ > 0 && ρ < nt)) return { ok: false, error: `the fillet must be from 0 to ${(nt / m).toFixed(2)} modules` };
  const nc = nt - ρ, uc = w(nc) - ρ / Math.cos(al);
  if (!(uc > 0)) return { ok: false, error: "the fillet is too big for the cutter's tooth: a smaller fillet" };
  const nT = nc + ρ * Math.sin(al);
  const poly: { p: P; polar: [number, number]; fillet: boolean }[] = [];
  const K = 48, n0 = -(1.5 + Math.max(0, x)) * m;
  for (let k = 0; k <= K; k++) { // the straight flank from outside the pitch circle down to where the corner starts
    const n = n0 + ((nT - n0) * k) / K, u = w(n);
    const g = polarOf(u, n, (u - n / Math.tan(al)) / rp, rp);
    poly.push({ p: xy(g), polar: g, fillet: false });
  }
  const B = 90;
  for (let k = 1; k <= B; k++) { // the corner: its outward normal turns from the flank's to the tip's
    const b = al + ((Math.PI / 2 - al) * k) / B, [nu, nn] = [Math.cos(b), Math.sin(b)];
    const [u, n] = [uc + ρ * nu, nc + ρ * nn];
    const g = polarOf(u, n, (u - (n * nu) / nn) / rp, rp);
    poly.push({ p: xy(g), polar: g, fillet: true });
  }
  // the loops the corner makes below the involute (the undercut): the earliest segment that a later one crosses, and the latest one that does, are the ends of what is cut away
  let undercut = false;
  let cur = poly;
  outer: for (let i = 0; i < cur.length - 2; i++) {
    for (let j = cur.length - 2; j > i + 1; j--) {
      const hit = cross(cur[i]!.p, cur[i + 1]!.p, cur[j]!.p, cur[j + 1]!.p);
      if (hit) {
        const polar: [number, number] = [Math.hypot(hit[0], hit[1]), Math.atan2(hit[1], hit[0])];
        cur = [...cur.slice(0, i + 1), { p: hit, polar, fillet: false }, ...cur.slice(j + 1)];
        undercut = true;
        break outer;
      }
    }
  }
  const first = cur.findIndex((e) => e.fillet);
  const seam = first > 0 ? first - 1 : 0; // (the last point of the involute)
  const tail = cur.slice(seam).map((e) => e.p);
  // three arcs: points at equal length along the corner's curve, and the points half way between them
  const len = [0];
  for (let i = 1; i < tail.length; i++) len.push(len[i - 1]! + Math.hypot(tail[i]![0] - tail[i - 1]![0], tail[i]![1] - tail[i - 1]![1]));
  const at = (s: number): P => {
    let i = 1;
    while (i < len.length - 1 && len[i]! < s) i++;
    const f = (s - len[i - 1]!) / Math.max(1e-12, len[i]! - len[i - 1]!);
    return [tail[i - 1]![0] + f * (tail[i]![0] - tail[i - 1]![0]), tail[i - 1]![1] + f * (tail[i]![1] - tail[i - 1]![1])];
  };
  const L = len[len.length - 1]!;
  const pts: [number, number][] = [];
  for (let k = 0; k <= 6; k++) {
    const p = k === 0 ? tail[0]! : k === 6 ? tail[tail.length - 1]! : at((L * k) / 6);
    pts.push([Math.hypot(p[0], p[1]), Math.atan2(p[1], p[0])]);
  }
  const rLo = pts[0]![0];
  if (!(pts[6]![1] > 0 && pts[6]![1] < Math.PI / z)) return { ok: false, error: "the teeth meet at the root: raise the tooth count or lower the fillet" };
  return { ok: true, value: { pts, rLo, undercut } };
}

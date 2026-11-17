// The sections of a throated worm wheel (`dec_worm_gears`, `in_608`): the wheel is what the worm leaves of a blank, and a loft through a few of its sections follows it to about 0.05 mm (`prototypes/worm-wheel-loft`).
// A point of the wheel is cut if at some turn of the worm (the wheel turning k / z as much, k the starts) it is inside the worm's thread; so a section at height h is the gap between two teeth, found as the curve where
// that test changes, by marching squares over two pitches in (angle, radius) with every crossing of a grid edge put exactly by bisection (a flank that is nearly radial is no trouble). The gap is cut into pieces of equal
// length, each an arc through its ends and its middle, and the top of the tooth is one more arc. Every section has the same pieces, so they loft. Pure maths in the wheel's own x and y: the worm's axis along x at y = -cd.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { GearSpec } from "./gear.ts";
import { wheelOf } from "./worm.ts";
import { bulgeOf } from "./arcs.ts";
import type { P } from "./arcs.ts";

/** one section: its height from the wheel's middle plane, and its closed outline of z teeth as points and the bulge of each side */
export interface Section { h: number; points: P[]; bulges: number[] }
export const SECTIONS = 5;
const NGAP = 18;

const cache = new Map<string, Result<Section[]>>();
/** The SECTIONS sections of the wheel the spec makes, lowest first. Cached by the numbers (it takes a fraction of a second to a second). */
export function wheelSections(spec: GearSpec): Result<Section[]> {
  const key = JSON.stringify([spec.teeth, spec.module, spec.pressure ?? 20, spec.wheel]);
  let r = cache.get(key);
  if (!r) {
    r = make(spec);
    if (cache.size > 8) cache.clear();
    cache.set(key, r);
  }
  return r;
}

function make(spec: GearSpec): Result<Section[]> {
  const wg = wheelOf(spec);
  if (!wg.ok) return wg;
  const { worm: g, z, cd, tipAt, rootAt, width } = wg.value;
  const k = g.starts, P2 = (2 * Math.PI) / z;
  const rhoS = (u: number): number => { const a = Math.abs(u); const [hT, hR] = [g.half(g.rTip), g.half(g.rRoot)]; return a <= hT ? g.rTip : a >= hR ? g.rRoot : g.rp + (g.px / 4 - a) / g.tanA; };
  const inside = (x: number, y: number, h: number, phi: number): boolean => {
    const dy = y + cd, rho = Math.hypot(dy, h), th = Math.atan2(dy, -h);
    let u = x - (g.lead * (th - phi)) / (2 * Math.PI);
    u -= g.px * Math.round(u / g.px);
    return rho <= rhoS(u);
  };
  const STEP = 0.03;
  /** whether the point (X, Y, h) of the wheel is material: inside the blank and never inside the worm */
  const material = (X0: number, Y0: number, h: number): boolean => {
    const r = Math.hypot(X0, Y0);
    if (r > tipAt(h) + 1e-12) return false;
    const dt = rootAt(h);
    if (r < dt) return true; // (deeper than the worm's tip reaches)
    const a1 = -Math.PI / 2 - P2 / 2 + ((((Math.atan2(Y0, X0) + Math.PI / 2 + P2 / 2) % P2) + P2) % P2); // (the wheel repeats every pitch: the point is taken into the pitch that faces the worm)
    const reach = Math.acos(Math.min(1, dt / r)); // (the worm can be at the point only while the point is within this angle of the direction of the worm)
    const [lo, hi] = [(z / k) * (a1 + Math.PI / 2 - reach), (z / k) * (a1 + Math.PI / 2 + reach)];
    for (let phi = lo; phi <= hi; phi += STEP) {
      const th = a1 - (k * phi) / z;
      if (inside(r * Math.cos(th), r * Math.sin(th), h, phi)) return false;
    }
    return true;
  };

  let lastStart: number | null = null;
  const section = (h: number): Section | string => {
    const top = tipAt(h), dt = rootAt(h);
    for (let level = 0; level < 3; level++) {
      const res = contour(h, top, dt, level);
      if (typeof res !== "string") return res;
      if (level === 2) return res;
    }
    return "no gap";
  };
  function contour(h: number, top: number, dt: number, level: number): Section | string {
    const psi0 = -Math.PI / 2 - P2 - 0.05, span = 2 * P2 + 0.1, f = 2 ** level;
    const nPsi = Math.round((span / P2) * 60 * f), rLo = dt - 0.05, nR = Math.round(80 * f);
    const [dpsi, dr] = [span / nPsi, (top - rLo) / nR];
    const node = (i: number, j: number): P => [psi0 + i * dpsi, rLo + j * dr];
    const xy = ([ps, r]: P): P => [r * Math.cos(ps), r * Math.sin(ps)];
    const mat: boolean[][] = Array.from({ length: nPsi + 1 }, (_, i) => Array.from({ length: nR + 1 }, (_, j) => { const [X, Y] = xy(node(i, j)); return material(X, Y, h); }));
    const crossing = new Map<string, P>();
    const cross = (i0: number, j0: number, i1: number, j1: number): P => {
      const key = `${i0},${j0},${i1},${j1}`;
      const kept = crossing.get(key);
      if (kept) return kept;
      const [a, b, m0] = [node(i0, j0), node(i1, j1), mat[i0]![j0]!];
      let [lo, hi] = [0, 1];
      for (let q = 0; q < 24; q++) { const t = (lo + hi) / 2; const [X, Y] = xy([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); if (material(X, Y, h) === m0) lo = t; else hi = t; }
      const t = (lo + hi) / 2;
      const pt: P = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      crossing.set(key, pt);
      return pt;
    };
    interface E { key: string; pt: () => P }
    const segs: [E, E][] = [];
    for (let i = 0; i < nPsi; i++) for (let j = 0; j < nR; j++) {
      const c: [number, number][] = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], v = c.map(([a, b]) => mat[a]![b]!);
      const edges: E[] = [];
      for (let e = 0; e < 4; e++) {
        const [p, q] = [c[e]!, c[(e + 1) % 4]!];
        if (v[e] !== v[(e + 1) % 4]) { const [lo, hi] = p[0] < q[0] || p[1] < q[1] ? [p, q] : [q, p]; edges.push({ key: `${lo}|${hi}`, pt: () => cross(lo[0], lo[1], hi[0], hi[1]) }); }
      }
      for (let e = 0; e + 1 < edges.length; e += 2) segs.push([edges[e]!, edges[e + 1]!]);
    }
    const byKey = new Map<string, [E, E][]>();
    for (const sg of segs) for (const e of sg) { const l = byKey.get(e.key); if (l) l.push(sg); else byKey.set(e.key, [sg]); }
    const used = new Set<[E, E]>(), chains: P[][] = [];
    for (const sg of segs) {
      if (used.has(sg)) continue;
      used.add(sg);
      const chain: E[] = [sg[0], sg[1]];
      for (const dir of [1, 0]) for (;;) {
        const end = dir ? chain[chain.length - 1]! : chain[0]!;
        const next = (byKey.get(end.key) ?? []).find((o) => !used.has(o));
        if (!next) break;
        used.add(next);
        const other = next[0].key === end.key ? next[1] : next[0];
        if (dir) chain.push(other); else chain.unshift(other);
      }
      chains.push(chain.map((e) => e.pt()));
    }
    const onTop = (pt: P) => Math.abs(pt[1] - top) < dr * 0.51;
    const full = chains.filter((c) => c.length > 8 && onTop(c[0]!) && onTop(c[c.length - 1]!) && c.every((q) => q[0] > psi0 + 3 * dpsi && q[0] < psi0 + span - 3 * dpsi)).map((c) => (c[0]![0] > c[c.length - 1]![0] ? c.slice().reverse() : c));
    if (!full.length) return `no whole gap at height ${h.toFixed(2)}`;
    full.sort((p, q) => (lastStart === null ? p[0]![0] - q[0]![0] : Math.abs(p[0]![0] - lastStart) - Math.abs(q[0]![0] - lastStart)));
    const gp = full[0]!, gap = gp.map(xy);
    lastStart = gp[0]![0];
    const cum = [0];
    for (let q = 1; q < gap.length; q++) cum.push(cum[q - 1]! + Math.hypot(gap[q]![0] - gap[q - 1]![0], gap[q]![1] - gap[q - 1]![1]));
    const at = (s: number): P => { let q = 1; while (q < gap.length - 1 && cum[q]! < s) q++; const f2 = (s - cum[q - 1]!) / (cum[q]! - cum[q - 1]! || 1); return [gap[q - 1]![0] + f2 * (gap[q]![0] - gap[q - 1]![0]), gap[q - 1]![1] + f2 * (gap[q]![1] - gap[q - 1]![1])]; };
    const L = cum[cum.length - 1]!;
    const pieces: [P, P, P][] = Array.from({ length: NGAP }, (_, i) => [at((L * i) / NGAP), at((L * (i + 0.5)) / NGAP), at((L * (i + 1)) / NGAP)]);
    const start = gap[0]!, end = gap[gap.length - 1]!;
    pieces[0]![0] = start; pieces[NGAP - 1]![2] = end;
    const [psA, psB] = [Math.atan2(end[1], end[0]), Math.atan2(start[1], start[0]) + P2];
    let mid = (psA + psB) / 2;
    if (psB < psA) mid += Math.PI; // (the tooth has no top: never drawn)
    const [c2, s2] = [Math.cos(P2), Math.sin(P2)];
    const nextStart: P = [c2 * start[0] - s2 * start[1], s2 * start[0] + c2 * start[1]];
    const topLen = Math.hypot(nextStart[0] - end[0], nextStart[1] - end[1]);
    const tops: [P, P, P][] = topLen > 1e-4 ? [[end, [top * Math.cos(mid), top * Math.sin(mid)], nextStart]] : [];
    const points: P[] = [], bulges: number[] = [];
    const arcs = [...pieces, ...tops];
    for (let t = 0; t < z; t++) {
      const [c, s] = [Math.cos(t * P2), Math.sin(t * P2)];
      const rot = ([x, y]: P): P => [x * c - y * s, x * s + y * c];
      arcs.forEach(([a, m, e], i) => {
        const [pa, pm] = [rot(a), rot(m)];
        // the last arc of a tooth ends where the next tooth begins: its end is that point exactly, so the outline closes
        const pe = i === arcs.length - 1 ? ((): P => { const [c3, s3] = [Math.cos((t + 1) * P2), Math.sin((t + 1) * P2)]; return [c3 * start[0] - s3 * start[1], s3 * start[0] + c3 * start[1]]; })() : rot(e);
        points.push(pa);
        bulges.push(bulgeOf(pa, pm, pe));
      });
    }
    return { h, points, bulges };
  }

  const out: Section[] = [];
  for (let q = 0; q < SECTIONS; q++) {
    const h = -width / 2 + (width * q) / (SECTIONS - 1);
    const s = section(h);
    if (typeof s === "string") return err(`the wheel could not be worked out (${s}): another width, tooth count or worm`);
    out.push(s);
  }
  return ok(out);
}

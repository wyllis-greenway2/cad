// The push in 2D (a prototype, `in_1096`): the lever of the jam file on the gear's pin, the other bar a wall, worked out on the cross-sections of the three bodies at one height instead of on their meshes. Same rule as the app's `contact.ts`:
// a step of the driver, and a lever in something takes the smallest clear slide (64 ways, three distances, halved), else a turn (alone, then with a slide). Compared with the app's own solver on the same file for time and for where the lever ends.
// Run: `node prototypes/contact-2d/run.ts` (from the repository root).
import { readFileSync } from "node:fs";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { openSession, scene } from "../../app/src/interaction/session.ts";
import { meshOf } from "../../app/src/interaction/hard.ts";
import { startMotion } from "../../app/src/interaction/motion.ts";
import { solveContact } from "../../app/src/interaction/contact.ts";

await kernel.init();
const text = readFileSync(new URL("../../app/test/fixtures/lever-pin-jam.cad.json", import.meta.url), "utf8");
const opened = openSession(kernel, text) as unknown as { value: import("../../app/src/interaction/session.ts").Session };
const s = opened.value, sc = scene(s);
const GEAR = "b/x_s_002/o", LEVER = "b/x_s_084/o", BAR = "b/x_s_083/o";
const H = 10; // (a height every one of the three bodies has: the bar is 8.3 to 11.5)

/** The cross-section of a mesh at height h: the segments (x1, y1, x2, y2) where the plane cuts its triangles. */
function slice(tris: ArrayLike<number>, h: number): Float64Array {
  const out: number[] = [];
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const pts: [number, number][] = [];
    for (let e = 0; e < 3; e++) {
      const [a, b] = [i + 3 * e, i + 3 * ((e + 1) % 3)];
      const [za, zb] = [tris[a + 2]! - h, tris[b + 2]! - h];
      if ((za > 0) !== (zb > 0) && za !== zb) { const t = za / (za - zb); pts.push([tris[a]! + (tris[b]! - tris[a]!) * t, tris[a + 1]! + (tris[b + 1]! - tris[a + 1]!) * t]); }
    }
    if (pts.length === 2) out.push(pts[0]![0], pts[0]![1], pts[1]![0], pts[1]![1]);
  }
  return Float64Array.from(out);
}
const mesh = (b: string) => meshOf(sc, b as never, s.outcome)!.tris;
const segs = { gear: slice(mesh(GEAR), H), lever: slice(mesh(LEVER), H), bar: slice(mesh(BAR), H) };
console.log(`segments at z = ${H}: gear ${segs.gear.length / 4}, lever ${segs.lever.length / 4}, bar ${segs.bar.length / 4}`);

// the gear's own axis and the lever's middle (the point it turns about)
const centre = (a: Float64Array): [number, number] => { let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]!; y += a[i + 1]!; } return [x / (a.length / 2), y / (a.length / 2)]; };
const AXIS: [number, number] = [22.51, 23.74]; // (gear 1's centre in the file)
const MID = centre(segs.lever);

type M = { c: number; s: number; tx: number; ty: number; px: number; py: number }; // x' = R(x - p) + p + t
const place = (a: Float64Array, m: M): Float64Array => {
  const o = new Float64Array(a.length);
  for (let i = 0; i < a.length; i += 2) { const dx = a[i]! - m.px, dy = a[i + 1]! - m.py; o[i] = m.c * dx - m.s * dy + m.px + m.tx; o[i + 1] = m.s * dx + m.c * dy + m.py + m.ty; }
  return o;
};
let tests = 0;
const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
const proper = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean => {
  const [d1, d2, d3, d4] = [cross(cx, cy, dx, dy, ax, ay), cross(cx, cy, dx, dy, bx, by), cross(ax, ay, bx, by, cx, cy), cross(ax, ay, bx, by, dx, dy)];
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
};
const BRUTE = process.env.BRUTE === "1";
/** A soup of segments with a grid of cells over it (a millimetre and a half): a segment looks only at the cells it passes. */
class Soup {
  cell = 1.5; grid = new Map<number, number[]>(); stamp: Int32Array; mark = 0; a: Float64Array;
  constructor(a: Float64Array) {
    this.a = a;
    this.stamp = new Int32Array(a.length / 4);
    for (let i = 0; i < a.length; i += 4) {
      const [x0, x1, y0, y1] = [Math.min(a[i]!, a[i + 2]!), Math.max(a[i]!, a[i + 2]!), Math.min(a[i + 1]!, a[i + 3]!), Math.max(a[i + 1]!, a[i + 3]!)];
      for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++) for (let cy = Math.floor(y0 / this.cell); cy <= Math.floor(y1 / this.cell); cy++) { const k = cx * 100003 + cy; const l = this.grid.get(k); if (l) l.push(i / 4); else this.grid.set(k, [i / 4]); }
    }
  }
  /** Does any segment of `b` cross a segment of this soup? */
  crossedBy(b: Float64Array): boolean {
    tests++;
    const a = this.a;
    if (BRUTE) { for (let i = 0; i < b.length; i += 4) for (let j = 0; j < a.length; j += 4) if (proper(b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!, a[j]!, a[j + 1]!, a[j + 2]!, a[j + 3]!)) return true; return false; }
    this.mark++;
    for (let i = 0; i < b.length; i += 4) {
      const [bx, by, ex, ey] = [b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!];
      for (let cx = Math.floor(Math.min(bx, ex) / this.cell); cx <= Math.floor(Math.max(bx, ex) / this.cell); cx++) for (let cy = Math.floor(Math.min(by, ey) / this.cell); cy <= Math.floor(Math.max(by, ey) / this.cell); cy++) {
        const l = this.grid.get(cx * 100003 + cy);
        if (!l) continue;
        for (const j of l) {
          if (this.stamp[j] === this.mark) continue;
          this.stamp[j] = this.mark;
          if (proper(bx, by, ex, ey, a[4 * j]!, a[4 * j + 1]!, a[4 * j + 2]!, a[4 * j + 3]!)) return true;
        }
      }
      this.mark++; // (a segment of `b` is a new look at the cells)
    }
    return false;
  }
}
const barSoup = new Soup(segs.bar);

const REF: [number, number] = [27.59, 25.5]; // (a point of the lever on the pin: where it goes is what the two are compared by)
const REACH = Math.hypot(...[0, 1].map((k) => Math.max(...Array.from({ length: segs.lever.length / 2 }, (_, i) => Math.abs(segs.lever[2 * i + k]! - MID[k]!)))) as [number, number]);
let lever = { tx: 0, ty: 0, th: 0 }; // (slide and turn about the middle, radians)
const leverAt = (l: typeof lever): Float64Array => place(segs.lever, { c: Math.cos(l.th), s: Math.sin(l.th), tx: l.tx, ty: l.ty, px: MID[0], py: MID[1] });
const gearAt = (deg: number): Float64Array => { const r = (deg * Math.PI) / 180; return place(segs.gear, { c: Math.cos(r), s: Math.sin(r), tx: 0, ty: 0, px: AXIS[0], py: AXIS[1] }); };
const hit = (l: typeof lever, g: Soup): boolean => { const L = leverAt(l); return g.crossedBy(L) || barSoup.crossedBy(L); };

const WAYS = 64, HEIGHTS = [0, 30, -30, 60, -60].map((d) => (d * Math.PI) / 180);
const FREE_STEP = 2.5;
const HINTS = process.env.HINTS !== "0";
let last: { k: number; el: number } | null = null; // (the last way it went)
function nearest(l: typeof lever, g: Soup, d: [number, number, number]): number | null {
  const at = (t: number) => ({ tx: l.tx + d[0] * t, ty: l.ty + d[1] * t, th: l.th + (d[2] * t) / REACH });
  let before = 0;
  for (const t of [0.3, 1, FREE_STEP]) {
    if (hit(at(t), g)) { before = t; continue; }
    let [lo, hi] = [before, t];
    for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; if (hit(at(mid), g)) lo = mid; else hi = mid; }
    return hi;
  }
  return null;
}
function yieldLever(g: Soup): boolean {
  const l = lever;
  let best: { d: [number, number, number]; t: number } | null = null;
  const tryWay = (d: [number, number, number]): void => { const t = nearest(l, g, d); if (t !== null && (!best || t < best.t)) best = { d, t }; };
  const dirOf = (k: number, el: number): [number, number, number] => [Math.cos(el) * Math.cos((k * 2 * Math.PI) / WAYS), Math.cos(el) * Math.sin((k * 2 * Math.PI) / WAYS), Math.sin(el)];
  if (HINTS && last) { for (const dk of [0, 1, -1, 2, -2, 4, -4]) { tryWay(dirOf((last.k + dk + WAYS) % WAYS, last.el)); if (best && (best as { t: number }).t < 1) break; } } // (the last way it went, and the ones near it, first)
  if (!best) for (let k = 0; k < WAYS; k++) tryWay(dirOf(k, 0)); // (a slide)
  if (!best) { tryWay([0, 0, 1]); tryWay([0, 0, -1]); }
  if (!best) for (const el of HEIGHTS.slice(1)) for (let k = 0; k < WAYS; k++) tryWay([Math.cos(el) * Math.cos((k * 2 * Math.PI) / WAYS), Math.cos(el) * Math.sin((k * 2 * Math.PI) / WAYS), Math.sin(el)]);
  if (!best) return false;
  const b = best as { d: [number, number, number]; t: number };
  last = { k: ((Math.round((Math.atan2(b.d[1], b.d[0]) / (2 * Math.PI)) * WAYS) % WAYS) + WAYS) % WAYS, el: Math.asin(Math.max(-1, Math.min(1, b.d[2]))) };
  lever = { tx: l.tx + b.d[0] * b.t, ty: l.ty + b.d[1] * b.t, th: l.th + (b.d[2] * b.t) / REACH };
  return true;
}

const t0 = performance.now();
let jam = -1;
const track: string[] = [];
for (let a = 1; a <= 360; a++) {
  const g = new Soup(gearAt(a));
  if (hit(lever, g) && !yieldLever(g)) { jam = a; break; }
  if (a % 60 === 0) { const [dx, dy] = [REF[0] - MID[0], REF[1] - MID[1]], [c, sn] = [Math.cos(lever.th), Math.sin(lever.th)]; track.push(`${a}: the lever's point on the pin at ${(c * dx - sn * dy + MID[0] + lever.tx).toFixed(2)}, ${(sn * dx + c * dy + MID[1] + lever.ty).toFixed(2)}, turned ${((lever.th * 180) / Math.PI).toFixed(1)}`); }
}
const ms2d = performance.now() - t0;
console.log(`2D: ${ms2d.toFixed(0)} ms for ${jam < 0 ? 360 : jam} steps, ${tests} segment-soup tests (${(ms2d / (jam < 0 ? 360 : jam)).toFixed(2)} ms a step)${jam > 0 ? `, JAM at ${jam}` : ""}`);
console.log(track.join("\n"));

// the app's own solver on the same file (3D meshes), for time and for where the lever is
const r: any = startMotion(sc, GEAR as never, "turn", s.outcome);
let m = r.motion;
const t1 = performance.now();
const trace3: string[] = [];
for (let a = 1; a <= 360; a++) {
  m = solveContact(sc, { ...m, playing: true, amount: a }, s.outcome, Infinity);
  if (a % 60 === 0) { const l = m.contact.pushables.find((p: any) => p.body === LEVER); const [dx, dy] = [REF[0] - l.point[0], REF[1] - l.point[1]], r = ((l.spin ?? 0) * Math.PI) / 180, [c, sn] = [Math.cos(r), Math.sin(r)]; trace3.push(`${a}: the lever's point on the pin at ${(c * dx - sn * dy + l.point[0] + l.free[0]).toFixed(2)}, ${(sn * dx + c * dy + l.point[1] + l.free[1]).toFixed(2)}, turned ${(l.spin ?? 0).toFixed(1)}`); }
  if (m.contact.jam) { console.log("3D jam", a, m.contact.jam); break; }
}
console.log(`3D (the app's contact.ts, meshes): ${(performance.now() - t1).toFixed(0)} ms`);
console.log(trace3.join("\n"));

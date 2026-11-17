// A ratchet wheel and its pawl (`dec_ratchet`): the shapes, as points and the bulge of each side (`Line.bulge`), in the plane's own x and y, the shaft at the origin and the first tooth's tip along +x. The wheel is free to turn
// clockwise (the ramps ride up under the pawl) and held against counter-clockwise (the face is against the pawl). Every number is a default or a convention (`q_ratchet_numbers`), not a standard: there is none.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { CamSpec, CamShapes, V2 } from "./cams.ts";
import { bulgeOf } from "./arcs.ts";

const FACE_FROM = 0.2; // (the pawl's nose rests on the face from this fraction of its length from the tip ...)
const FACE_TO_MAX = 0.8; // (... to at most this one, as far as the gap lets it)
const CLEAR = 0.15; // mm the pawl keeps from the wheel
const rad = (d: number): number => (d * Math.PI) / 180;
const polar = (r: number, a: number): V2 => [r * Math.cos(a), r * Math.sin(a)];
const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: V2, k: number): V2 => [a[0] * k, a[1] * k];
const len = (a: V2): number => Math.hypot(a[0], a[1]);

/** the angle the root of a face is behind its tip so that the face leans `hook` degrees from the radial (0 for a radial face): found by halving, the lean grows with the angle */
function rootBehind(ro: number, rr: number, hook: number): number | null {
  if (hook <= 0) return 0;
  const lean = (d: number): number => Math.atan2(rr * Math.sin(d), ro - rr * Math.cos(d));
  let [lo, hi] = [0, Math.PI / 2];
  if (lean(hi) < rad(hook)) return null;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (lean(m) < rad(hook)) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** the sawtooth outline: for each tooth its tip, then the root at the foot of its face, going counter-clockwise */
export function wheelPoints(teeth: number, ro: number, depth: number, hook: number): Result<V2[]> {
  const rr = ro - depth;
  const d = rootBehind(ro, rr, hook);
  if (d === null) return err("the hook is more than this tooth can lean: use a smaller hook angle or a deeper tooth");
  const pitch = (2 * Math.PI) / teeth;
  if (d >= pitch * 0.9) return err("the face leans so far that it would cut into the tooth behind it: use a smaller hook angle");
  const pts: V2[] = [];
  for (let k = 0; k < teeth; k++) { pts.push(polar(ro, k * pitch)); pts.push(polar(rr, k * pitch - d)); }
  return ok(pts);
}
/** the convex hull of points, counter-clockwise (the monotone chain), as indices into the points */
function hull(p: readonly V2[]): number[] {
  const idx = p.map((_, i) => i).sort((a, b) => p[a]![0] - p[b]![0] || p[a]![1] - p[b]![1]);
  const cross = (o: number, a: number, b: number): number => (p[a]![0] - p[o]![0]) * (p[b]![1] - p[o]![1]) - (p[a]![1] - p[o]![1]) * (p[b]![0] - p[o]![0]);
  const lower: number[] = [], upper: number[] = [];
  for (const i of idx) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, i) <= 1e-12) lower.pop(); lower.push(i); }
  for (const i of [...idx].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, i) <= 1e-12) upper.pop(); upper.push(i); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
const onSegments = (a: V2, b: V2, c: V2, d: V2): boolean => {
  const o = (p: V2, q: V2, r: V2): number => { const v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return Math.abs(v) < 1e-9 ? 0 : v; }; // (a corner on the other side's line, which the nose is by design, is touching, not crossing)
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
/** how far a point is from the sides of a polygon */
const edgeDistance = (poly: readonly V2[], q: V2): number => Math.min(...poly.map((a, i) => {
  const b = poly[(i + 1) % poly.length]!;
  const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
  const k = Math.max(0, Math.min(1, ((q[0] - a[0]) * ex + (q[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)));
  return Math.hypot(a[0] + ex * k - q[0], a[1] + ey * k - q[1]);
}));
const inside = (poly: readonly V2[], q: V2): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [a, b] = [poly[i]!, poly[j]!]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
};
/** the pawl's points and bulges for a nose resting on the face from `from` to `to` of its length, or null (no pawl of that kind): a hull of the nose and the boss, the boss one arc */
/** `dirs(foot, lift)`: the direction the arm runs from the foot of the nose, and the outer side of its line (what is outside the body the pawl rests on) */
type Dirs = (foot: V2, lift: number) => { dir: V2; up: V2 };
function pawlFor(t: V2, g: V2, from: number, to: number, arm: number, boss: number, lift: number, dirs: Dirs): { points: V2[]; bulges: number[]; pivot: V2 } | null {
  const [e1, e2] = [add(t, mul(sub(g, t), from)), add(t, mul(sub(g, t), to))];
  // the arm runs from the foot of the nose in the direction `dirs` gives (for a wheel, the tangent there, counter-clockwise, turned outward by `lift` when the tangent would pass through the next tooth); its lower edge is on that line and
  // the boss sits on it, its middle half a boss above, so the pawl lies on the outer side of the line
  const { dir, up } = dirs(e2, lift);
  const pivot = add(add(e2, mul(dir, arm)), mul(up, boss));
  const N = 180;
  const ring = Array.from({ length: N }, (_, i): V2 => add(pivot, polar(boss, (i / N) * 2 * Math.PI)));
  const all = [e1, e2, ...ring];
  const h = hull(all);
  // the hull's vertices in order: the boss's run of points becomes one arc
  const points: V2[] = [];
  const bulges: number[] = [];
  let run: V2[] = [];
  const flush = (): void => {
    if (!run.length) return;
    if (run.length === 1) { points.push(run[0]!); bulges.push(0); }
    else { points.push(run[0]!); bulges.push(bulgeOf(run[0]!, run[Math.floor(run.length / 2)]!, run[run.length - 1]!)); points.push(run[run.length - 1]!); bulges.push(0); }
    run = [];
  };
  const start = Math.max(0, h.findIndex((i) => i < 2)); // (the walk begins at a point of the nose, so the boss's run of points does not wrap round the start of the list)
  [...h.slice(start), ...h.slice(0, start)].forEach((i) => { if (i >= 2) run.push(all[i]!); else { flush(); points.push(all[i]!); bulges.push(0); } });
  flush();
  return { points, bulges, pivot };
}
/** the arm along the tangent to a wheel at the foot of the nose (counter-clockwise), turned outward by `lift`; the outer side of its line is clockwise of it */
const wheelDirs: Dirs = (foot, lift) => {
  const tan: V2 = mul([-foot[1], foot[0]], 1 / len(foot));
  const out: V2 = mul(foot, 1 / len(foot));
  const dir: V2 = add(mul(tan, Math.cos(lift)), mul(out, Math.sin(lift)));
  return { dir, up: [dir[1], -dir[0]] };
};
/** the arm along a straight bar's length (toward +x), turned up from it by `lift`; the outer side of its line (away from the bar, +y) is counter-clockwise of it */
const barDirs: Dirs = (_foot, lift) => { const dir: V2 = [Math.cos(lift), Math.sin(lift)]; return { dir, up: [-dir[1], dir[0]] }; };
/** the nose as deep along the face as the body's outline lets it: the arm along its tangent first, then turned further from it, the deepest nose first, until the pawl crosses nothing of the body and keeps a little off every corner of it */
function findPawl(body: readonly V2[], t: V2, g: V2, arm: number, boss: number, dirs: Dirs): ReturnType<typeof pawlFor> {
  for (let lift = 0; lift <= rad(40) + 1e-9; lift += rad(2.5)) for (let to = FACE_TO_MAX; to >= FACE_FROM + 0.1 - 1e-9; to -= 0.05) {
    const p = pawlFor(t, g, FACE_FROM, to, arm, boss, lift, dirs);
    if (!p) continue;
    const clear = !body.some((q) => inside(p.points, q)) && !body.some((a, i) => { const b = body[(i + 1) % body.length]!; return p.points.some((c, j) => onSegments(a, b, c, p.points[(j + 1) % p.points.length]!)); });
    if (clear && Math.min(...body.map((q) => edgeDistance(p.points, q))) >= CLEAR) return p;
  }
  return null;
}
/** The straight ratchet (`dec_ratchet`, `in_795`): a bar of `teeth` teeth `pitch` apart along +x, the tips on the line y = 0 and the roots `depth` below it, `base` of bar under the roots, the face of each tooth dropping to its root (leaning back `hook` degrees), and the pawl at the middle tooth's face; free to move toward -x, held against +x. */
export function linearShapes(s: CamSpec): Result<RatchetShapes> {
  const n = Math.round(s.teeth ?? 0);
  const [pitch, depth, hook, base] = [s.pitch ?? 0, s.depth ?? 0, s.hook ?? 0, s.base ?? 0];
  if (!(n >= 2 && n <= 200)) return err("a straight ratchet needs 2 to 200 teeth");
  if (!(pitch > 0)) return err("the teeth need a pitch (the distance from one tip to the next)");
  if (!(depth > 0) || depth >= pitch * 1.5) return err("the teeth need a depth, and not more than one and a half times the pitch");
  if (hook < 0 || hook > 30) return err("the hook is from 0 to 30 degrees");
  if (!(base > 0)) return err("the bar needs a base under the roots");
  const behind = depth * Math.tan(rad(hook)); // how far behind its tip the face's root is
  if (behind >= pitch * 0.9) return err("the face leans so far that it would cut into the tooth behind it: use a smaller hook angle or a shallower tooth");
  // the bar, counter-clockwise: along the bottom, up the right end, and back along the top, tip by tip: the face of a tooth drops from its tip to the root behind it, the ramp climbs from that root to the next tip
  const top: V2[] = [];
  top.push([-behind, -depth]); // the left end's root
  for (let k = 1; k <= n; k++) { top.push([k * pitch, 0]); top.push([k * pitch - behind, -depth]); }
  const [x0, x1] = [-behind, n * pitch - behind];
  const points: V2[] = [[x0, -depth - base], [x1, -depth - base], ...top.slice().reverse().slice(0)];
  const bulges = points.map(() => 0);
  const polys: RatchetShapes["polys"] = [{ points, bulges }];
  const circles: CamShapes["circles"] = [];
  const arm = s.pawl ?? 0;
  if (arm > 0) {
    const boss = (s.width ?? depth * 2) / 2;
    if (!(boss > 0)) return err("the pawl needs a width");
    const k = Math.ceil(n / 2); // the tooth the pawl rests on: the middle one
    const [t, g]: [V2, V2] = [[k * pitch, 0], [k * pitch - behind, -depth]];
    const found = findPawl(points, t, g, arm, boss, barDirs);
    if (!found) return err("the pawl cannot be made to rest on the tooth without crossing the bar: make the arm longer or the width smaller");
    polys.push({ points: found.points, bulges: found.bulges });
    circles.push({ c: found.pivot, r: boss / 2, hole: true }); // (the pivot hole is half the boss's width)
  }
  return ok({ polys, circles });
}
export interface RatchetShapes { polys: { points: V2[]; bulges: number[] }[]; circles: CamShapes["circles"] }
export function ratchetShapes(s: CamSpec): Result<RatchetShapes> {
  const [z, ro] = [Math.round(s.teeth ?? 0), s.diameter / 2];
  const depth = s.depth ?? 0;
  const hook = s.hook ?? 0;
  if (!(z >= 3 && z <= 200)) return err("a ratchet needs 3 to 200 teeth");
  if (!(depth > 0) || depth >= ro) return err("the teeth need a depth, and less than the radius");
  if (hook < 0 || hook > 30) return err("the hook is from 0 to 30 degrees");
  if (s.hole / 2 >= ro - depth - 0.5) return err("the shaft's hole would break into the roots of the teeth: make the hole smaller or the teeth shallower");
  const wheel = wheelPoints(z, ro, depth, hook);
  if (!wheel.ok) return err(wheel.error);
  const polys: RatchetShapes["polys"] = [{ points: wheel.value, bulges: wheel.value.map(() => 0) }];
  const circles: CamShapes["circles"] = s.hole > 0 ? [{ c: [0, 0], r: s.hole / 2, hole: true }] : [];
  const arm = s.pawl ?? 0;
  if (arm > 0) {
    const boss = (s.width ?? depth * 2) / 2;
    if (!(boss > 0)) return err("the pawl needs a width");
    const rr = ro - depth;
    const d = rootBehind(ro, rr, hook)!;
    const [t, g] = [polar(ro, 0), polar(rr, -d)];
    const found = findPawl(wheel.value, t, g, arm, boss, wheelDirs);
    if (!found) return err("the pawl cannot be made to rest on the tooth without crossing the wheel: make the arm longer or the width smaller");
    polys.push({ points: found.points, bulges: found.bulges });
    circles.push({ c: found.pivot, r: boss / 2, hole: true });
  }
  return ok({ polys, circles });
}

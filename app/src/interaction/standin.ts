// The stand-in for a gear's body that is still being made (`dec_gear_standin`, `in_702`, `in_707`): a plain disc (a ring, with a bore or for an internal gear) at the gear's outside diameter, worked out from the gear's record and the step, with no kernel.
// Pure: a scene and what the kernel has answered so far in, the discs to draw out.
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Step } from "../operation/scene.ts";
import { gearShapeOf } from "../operation/gearshape.ts";
import { wormOf } from "../operation/worm.ts";
import { figuresOf, lookup } from "../operation/scene.ts";
import { walkPath } from "../operation/path.ts";
import { pointOf, curveMid } from "../operation/part.ts";

/** How long the kernel has been working before a disc is drawn for a gear it has not made (ms): a gear that comes at once is not preceded by a flash. */
export const STANDIN_MS = 250;

/** The label's words for a wait of `seconds` whole seconds: nothing about time for the first two (a body that comes at once is not timed), `in_847`. */
export function standInWords(seconds: number): string {
  return seconds >= 2 ? `Building… ${seconds} s` : "Building…";
}

/** A disc: its middle, the way it faces, how thick it is (along the normal, from the middle's plane; negative goes the other way), its outside radius and, if it is a ring, the radius of its hole. */
export interface StandIn { step: string; centre: Vec3; normal: Vec3; depth: number; radius: number; hole: number;
  /** a swept body (`in_850`): the points of its path, which the stand-in is a tube along (then `centre` is the path's middle, `depth` 0 and `radius` the tube's) */ path?: Vec3[] }

/** What of the kernel's last answer matters here: whether it is still being worked out, and the steps it has made. */
export interface KernelSeen { stale?: boolean; ops: readonly { id: string }[] }

/** The stand-ins to draw: a disc for each step that makes a gear's body, a tube for a sweep while the kernel is working and has not made that step yet. */
export function standIns(sc: Scene, kernel: KernelSeen | null | undefined): StandIn[] {
  if (!kernel?.stale) return [];
  const made = new Set(kernel.ops.map((o) => o.id));
  const out: StandIn[] = [];
  for (const st of sc.steps) {
    if (made.has(`x_${st.id}`) || made.has(`s_${st.id}`)) continue;
    const one = standInOf(sc, st);
    if (one) out.push(one);
  }
  return out;
}

function standInOf(sc: Scene, st: Step): StandIn | null {
  const shape = gearShapeOf(sc, st);
  const g = shape && sc.gears?.find((r) => r.id === shape.gear)?.spec.worm ? null : shape; // (a worm has a shape for its parts, and its stand-in at its thread, `in_849`, `in_827`)
  if (!g) return st.type === "sweep" ? sweepStandInOf(sc, st) : wormStandInOf(sc, st);
  return { step: g.step, centre: g.centre, normal: g.normal, depth: g.depth, radius: g.radius, hole: g.hole };
}

/** A worm's thread is its heavy step (a helical sweep: its core is quick): a disc as long as the worm, at the thread's outside radius, along the worm's axis (`in_849`; the first thread step of the worm stands for the body). */
function wormStandInOf(sc: Scene, st: Step): StandIn | null {
  if (st.type !== "revolve" || st.params.mode !== "add" || !(Number(st.params.advance) > 0) || typeof st.params.gear !== "string") return null;
  const rec = sc.gears?.find((g) => g.id === st.params.gear);
  if (!rec?.spec.worm) return null;
  const first = sc.steps.find((o) => o.type === "revolve" && o.params.gear === rec.id && o.params.mode === "add" && Number(o.params.advance) > 0);
  if (first?.id !== st.id) return null;
  const g = wormOf(rec.spec), plane = sc.parts[rec.plane];
  if (!g.ok || !plane || plane.kind !== "plane") return null;
  const [c, sn] = [Math.cos(rec.turn ?? 0), Math.sin(rec.turn ?? 0)];
  const x: Vec3 = [0, 1, 2].map((k) => plane.u[k]! * c + plane.v[k]! * sn) as unknown as Vec3;
  const len = rec.spec.worm.length, hole = (rec.spec.bore ?? 0) / 2;
  const radius = g.value.rTip;
  return { step: st.id, centre: [0, 1, 2].map((k) => rec.at[k]! - x[k]! * len / 2) as unknown as Vec3, normal: x, depth: len, radius, hole: hole < radius ? hole : 0 };
}

/** The points along a path's sides: a line is its two ends, an arc eight points on the circle through its ends and its middle. */
function pathPoints(sides: readonly { a: Vec3; b: Vec3; m: Vec3 | null }[]): Vec3[] {
  const out: Vec3[] = [sides[0]!.a];
  for (const sd of sides) {
    if (sd.m) out.push(...arcBetween(sd.a, sd.m, sd.b));
    out.push(sd.b);
  }
  return out;
}
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** The points strictly between `a` and `b` on the circular arc through `a`, `m` and `b` (none if they are in a line). */
function arcBetween(a: Vec3, m: Vec3, b: Vec3): Vec3[] {
  const p = sub(m, a), q = sub(b, a), w = crs(p, q), w2 = dot(w, w);
  if (w2 < 1e-18) return [];
  const t = crs([0, 1, 2].map((i) => dot(p, p) * q[i]! - dot(q, q) * p[i]!) as unknown as Vec3, w);
  const c: Vec3 = [0, 1, 2].map((i) => a[i]! + t[i]! / (2 * w2)) as unknown as Vec3;
  const ra = sub(a, c), rb = sub(b, c), axis = unit(w); // (a, m, b run counter-clockwise about `w`)
  let total = Math.atan2(dot(axis, crs(ra, rb)), dot(ra, rb));
  if (total <= 0) total += 2 * Math.PI;
  const out: Vec3[] = [];
  const N = 8, cr = crs(axis, ra), d = dot(axis, ra);
  for (let i = 1; i < N; i++) {
    const th = total * i / N, co = Math.cos(th), si = Math.sin(th);
    out.push([0, 1, 2].map((k) => c[k]! + ra[k]! * co + cr[k]! * si + axis[k]! * d * (1 - co)) as unknown as Vec3);
  }
  return out;
}
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** A sweep that the kernel has not made yet is a tube along its path (`in_850`), as thick as the shape is (a tube of the same area as the shape's box). */
function sweepStandInOf(sc: Scene, st: Step): StandIn | null {
  const get = lookup(sc);
  const walked = walkPath(get, String(st.params.path ?? "").split(",").filter(Boolean) as never);
  const fig = figuresOf(st)[0];
  if (!walked.ok || !fig) return null;
  const pts: Vec3[] = [];
  let circle = 0;
  for (const r of fig.outer) {
    const p = get(r);
    if (p?.kind === "circle") circle = p.radius;
    else if (p?.kind === "line") { const a = pointOf(get, p.a), b = pointOf(get, p.b), m = curveMid(get, p); for (const q of [a, b, m]) if (q) pts.push(q); }
  }
  const radius = circle > 0 ? circle : Math.sqrt(hullArea(pts) / Math.PI);
  const path = pathPoints(walked.sides);
  const mid = path[Math.floor(path.length / 2)]!;
  if (!(radius > 0) || !path.every((q) => q.every(Number.isFinite))) return null;
  return { step: st.id, centre: mid, normal: [0, 0, 1], depth: 0, radius, hole: 0, path };
}

/** The area of the convex hull of points that lie in one plane (0 for fewer than three, or a line): the shape's own area when it is convex. */
function hullArea(pts: readonly Vec3[]): number {
  if (pts.length < 3) return 0;
  const c: Vec3 = [0, 1, 2].map((i) => pts.reduce((t, q) => t + q[i]!, 0) / pts.length) as unknown as Vec3;
  const far = pts.reduce((best, q) => (dot(sub(q, c), sub(q, c)) > dot(sub(best, c), sub(best, c)) ? q : best), pts[0]!);
  const e1 = sub(far, c);
  const other = pts.reduce((best, q) => (dot(crs(e1, sub(q, c)), crs(e1, sub(q, c))) > dot(crs(e1, sub(best, c)), crs(e1, sub(best, c))) ? q : best), pts[0]!);
  const n = unit(crs(e1, sub(other, c))), ux = unit(e1), uy = crs(n, ux);
  if (dot(crs(e1, sub(other, c)), crs(e1, sub(other, c))) < 1e-12) return 0;
  const p2 = pts.map((q) => [dot(sub(q, c), ux), dot(sub(q, c), uy)] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (list: [number, number][]): [number, number][] => {
    const h: [number, number][] = [];
    for (const q of list) {
      while (h.length >= 2 && (h[h.length - 1]![0] - h[h.length - 2]![0]) * (q[1] - h[h.length - 2]![1]) - (h[h.length - 1]![1] - h[h.length - 2]![1]) * (q[0] - h[h.length - 2]![0]) <= 0) h.pop();
      h.push(q);
    }
    return h;
  };
  const hull = [...half(p2).slice(0, -1), ...half([...p2].reverse()).slice(0, -1)];
  let a = 0;
  for (let i = 0; i < hull.length; i++) { const [p, q] = [hull[i]!, hull[(i + 1) % hull.length]!]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}

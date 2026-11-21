// The mover orb: one orb for everything that is moved (prototype: the old app's many orbs, `docs/decisions/dec_unified_orb.md`, made one). It has three modes:
//   move    arrows along X, Y, Z from a ball at the middle;
//   rotate  a ring about each of X, Y, Z;
//   copy    the move arrows with a second arrow beyond the end of each: dragged, it makes a copy.
// Pure: where the handles are, which one the pointer is at, and what a drag of one means. The drawing and the page's buttons are elsewhere.
import { add, cross, dot, len, scale, sub, unit, type V3 } from "./vec.ts";
import { project, rayFrom, viewHeight, forwardDepth, type Cam } from "./camera.ts";
import { settings } from "./settings.ts";

export interface Orb { centre: V3; /** the orb's own axes (they are the world's unless it has been oriented) */ frame?: V3[]; /** the orb itself is being moved and turned, not the thing it stands for */ orient?: boolean; /** the axes a drag is held to (chosen with Shift): one is a line, two a plane */ held: number[]; /** the second arrows beyond the straight ones: an operation has them or not (off unless it says), the user does not choose */ extras?: boolean }
export type HandleKind = "arrow" | "turn" | "ball";
/** `points` is the handle's line, to the tip of its arrow; `also` more lines that belong to it (the stem of a curved arrow). */
export interface Handle { id: string; kind: HandleKind; axis: 0 | 1 | 2 | null; points: V3[]; also?: V3[][]; /** the second arrow of an operation that has one */ extra?: true }
export const AXES: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export const AXIS_LETTER = ["X", "Y", "Z"] as const;

/** How big the orb is: a share of how far the view is from it, so it is the same size on the screen wherever it is. */
export function unitOf(c: Cam, centre: V3): number {
  const depth = Math.max(forwardDepth(c, centre), 1e-3), tan = Math.tan((settings.view.fovDeg * Math.PI) / 360);
  return viewHeight(c, depth) / (2 * tan) * settings.mover.sizeOfView;
}
/**
 * The orb: from the ball, on each axis, a straight arrow out one side (it moves along the axis) and a curved arrow out the other (it turns about the axis): a stem along the
 * axis to the middle of an open circle round it, with a head on the circle.
 */
export function handlesOf(o: Orb, c: Cam): Handle[] {
  const L = unitOf(c, o.centre), M = settings.mover, A = M.arrowShare * L, g = M.gapShare * L, out: Handle[] = []; // (the arrows start `g` out from the middle: they stop short of the ball)
  (o.frame ?? AXES).forEach((d, i) => {
    const a = i as 0 | 1 | 2, letter = AXIS_LETTER[i];
    out.push({ id: `move:${letter}`, kind: "arrow", axis: a, points: [add(o.centre, scale(d, g)), add(o.centre, scale(d, g + A))] });
    if (o.extras) out.push({ id: `copy:${letter}`, kind: "arrow", axis: a, extra: true, points: [add(o.centre, scale(d, g + A * (1 + M.extraGap))), add(o.centre, scale(d, g + A * (1 + M.extraGap + M.extraShare)))] });
    const stemEnd = sub(o.centre, scale(d, g + A * M.stemShare)), r = A * M.turnShare, u = unit(cross(Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], d)), v = cross(d, u), arc: V3[] = [];
    const from = (M.turnStartDeg * Math.PI) / 180, span = (M.turnSpanDeg * Math.PI) / 180;
    for (let k = 0; k <= M.arcSegments; k++) { const t = from + (k / M.arcSegments) * span; arc.push(add(stemEnd, scale(add(scale(u, Math.cos(t)), scale(v, Math.sin(t))), r))); }
    out.push({ id: `turn:${letter}`, kind: "turn", axis: a, points: arc, also: [[sub(o.centre, scale(d, g)), stemEnd]] });
  });
  out.push({ id: "ball", kind: "ball", axis: null, points: [o.centre] });
  return out;
}

const toSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy, u = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return Math.hypot(px - (ax + vx * u), py - (ay + vy * u));
};
/** The handle nearest the pointer, if one is within `hitPx` (the ball is favoured a little: it is small). */
export function hitHandle(hs: Handle[], c: Cam, w: number, h: number, px: number, py: number, hitPx = settings.mover.hitPx): Handle | null {
  let best: { d: number; h: Handle } | null = null;
  for (const hd of hs) {
    let d = Infinity;
    for (const line of [hd.points, ...(hd.also ?? [])]) {
      const ps = line.map((p) => project(c, p, w, h));
      if (c.ortho === null && ps.some((q) => q.depth <= 1e-6)) continue;
      if (hd.kind === "ball") d = Math.hypot(ps[0]!.x - px, ps[0]!.y - py) - 4;
      else for (let i = 0; i + 1 < ps.length; i++) d = Math.min(d, toSegment(px, py, ps[i]!.x, ps[i]!.y, ps[i + 1]!.x, ps[i + 1]!.y));
    }
    if (d <= hitPx && (!best || d < best.d)) best = { d, h: hd };
  }
  return best ? best.h : null;
}

// ---- what a drag means ----
const rayOf = (c: Cam, w: number, h: number, px: number, py: number) => rayFrom(c, (px / w) * 2 - 1, -((py / h) * 2 - 1), w / h);
/** Where the pointer's ray meets the plane through `p` with normal `n`. */
function onPlane(r: { o: V3; d: V3 }, p: V3, n: V3): V3 | null {
  const den = dot(r.d, n);
  if (Math.abs(den) < 1e-6) return null;
  const t = dot(sub(p, r.o), n) / den;
  return add(r.o, scale(r.d, t));
}
/** How far along the line through `p` in direction `d` the pointer's ray comes nearest to it. */
function alongLine(r: { o: V3; d: V3 }, p: V3, d: V3): number | null {
  const w0 = sub(p, r.o), b = dot(d, r.d), dd = dot(d, w0), e = dot(r.d, w0), den = 1 - b * b;
  return den < 1e-4 ? null : (b * e - dd) / den;
}
/** A drag in progress: the handle, the orb's middle, and where the pointer took hold: along a line (how far), in a plane (the point), or round an axis (the vector from the middle). */
export type Grab = { handle: Handle; centre: V3 } & ({ kind: "line"; dir: V3; s0: number } | { kind: "plane"; dir: V3; q0: V3 } | { kind: "ring"; dir: V3; v0: V3 });
export function startGrab(o: Orb, hd: Handle, c: Cam, w: number, h: number, px: number, py: number, forward: V3): Grab | null {
  const r = rayOf(c, w, h, px, py), axes = o.frame ?? AXES, base = { handle: hd, centre: o.centre };
  const inPlane = (dir: V3): Grab | null => { const q0 = onPlane(r, o.centre, dir); return q0 ? { ...base, kind: "plane", dir, q0 } : null; };
  if (hd.kind === "turn") { const dir = axes[hd.axis!]!, q = onPlane(r, o.centre, dir); return q ? { ...base, kind: "ring", dir, v0: sub(q, o.centre) } : null; }
  // a drag of a held arrow, or of the ball, goes in the plane of two held axes, or freely across the view with three (or with none, for the ball)
  const held = hd.kind === "ball" || (hd.axis !== null && o.held.includes(hd.axis)) ? o.held : [];
  if (held.length >= 3 || (hd.kind === "ball" && held.length < 2)) return inPlane(scale(forward, -1));
  if (held.length === 2) return inPlane(axes[[0, 1, 2].find((i) => !held.includes(i))!]!);
  const dir = axes[hd.axis!]!, s0 = alongLine(r, o.centre, dir);
  return s0 === null ? null : { ...base, kind: "line", dir, s0 };
}
/** What a drag has done so far, from where it began: a move, or a turn about an axis; and its size (mm, or radians) to tell whether it has gone anywhere. */
export interface Dragged { move?: V3; turn?: { axis: V3; angle: number }; value: number }
export function dragTo(g: Grab, c: Cam, w: number, h: number, px: number, py: number): Dragged | null {
  const r = rayOf(c, w, h, px, py);
  if (g.kind === "line") { const s = alongLine(r, g.centre, g.dir); return s === null ? null : { move: scale(g.dir, s - g.s0), value: s - g.s0 }; }
  const q = onPlane(r, g.centre, g.dir);
  if (!q) return null;
  if (g.kind === "plane") { const d = sub(q, g.q0); return { move: d, value: len(d) }; }
  const v = sub(q, g.centre), angle = Math.atan2(dot(g.dir, cross(g.v0, v)), dot(g.v0, v));
  return { turn: { axis: g.dir, angle }, value: angle };
}

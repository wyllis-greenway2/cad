// Constraint hints while a line is being drawn (`in_152`, `q_snap_suggestions`): when the end of the line is close to being level, upright, parallel or square to another line,
// on another line, tangent to a circle, or as long as another line, the end takes that exactly and says so; a click then makes the line with that constraint.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, dist } from "../math/vec.ts";
import type { PointerView, Plane } from "../operation/part.ts";
import { segmentOf, circleOf, pointOf, normalOfPlane } from "../operation/part.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import { live } from "../operation/ownership.ts";
import type { Command } from "../operation/commands.ts";
import { settings } from "../shared/settings.ts";
import { localOf } from "./tools.ts";

export interface Hint { /** (an arc's tangent: which end of the arc touches the circle) */ end?: 0 | 1; kind: "horizontal" | "vertical" | "parallel" | "perpendicular" | "onLine" | "onCircle" | "concentric" | "tangent" | "equalLength"; ref?: Ref }
type V2 = [number, number];

const lift = (pl: Plane, [x, y]: V2): Vec3 => add(pl.at, add(scale(pl.u, x), scale(pl.v, y)));
const lenOf = (v: V2) => Math.hypot(v[0], v[1]);
const unit = (v: V2): V2 => { const l = lenOf(v) || 1; return [v[0] / l, v[1] / l]; };

/** A circle or an arc: what a line can end on or be tangent to. An arc's ends say which part of its circle is there (`in_230`: an arc is a circle too, and lit when it is the one the end is on). */
interface Round { ref: Ref; center: Vec3; radius: number; arc?: { a: Vec3; b: Vec3; ccw: boolean } }
function roundsOf(scene: Scene, get: (r: Ref) => Scene["parts"][string] | undefined): Round[] {
  const out: Round[] = [];
  for (const c of Object.values(scene.parts)) {
    if (c.kind === "circle") { const ci = circleOf(get, c.ref); if (ci) out.push({ ref: c.ref, ...ci }); continue; }
    if (c.kind === "line" && c.origin === "drawn" && c.center && !c.derived) { // (a piece an extrusion cut from the arc is not the arc: the arc is what constraints name)
      const [m, a, b] = [pointOf(get, c.center), pointOf(get, c.a), pointOf(get, c.b)];
      if (m && a && b) out.push({ ref: c.ref, center: m, radius: dist(m, a), arc: { a, b, ccw: c.ccw !== false } });
    }
  }
  return out;
}
/** Is this point (in the plane's own numbers) on the part of the circle the arc covers? */
function withinArc(pl: Plane, r: Round, p: V2): boolean {
  if (!r.arc) return true;
  const m = localOf(pl, r.center);
  const ang = (q: V2) => Math.atan2(q[1] - m[1], q[0] - m[0]);
  const TAU = Math.PI * 2;
  const wrap = (x: number) => ((x % TAU) + TAU) % TAU;
  const [a, b] = [ang(localOf(pl, r.arc.a)), ang(localOf(pl, r.arc.b))];
  const span = r.arc.ccw ? wrap(b - a) : wrap(a - b);
  const at = r.arc.ccw ? wrap(ang(p) - a) : wrap(a - ang(p));
  return at <= span + 1e-6;
}


/**
 * The nearest point on a drawn straight line, or on a circle or an arc, within the snap distance of the pointer on the screen (`e` is the pointer on the plane, in the plane's own numbers):
 * where a point being placed would lie on it, and the constraint that says so (`onLine`, `onCircle`). A line `skip` says does not count (the one that starts at the point already placed).
 */
function outlineSnap(scene: Scene, pl: Plane, pv: PointerView, e: V2, skip: (line: Ref) => boolean = () => false): { at: V2; hint: Hint } | null {
  const get = (r: Ref) => scene.parts[r];
  const n = normalOfPlane(pl);
  const onPlane = (p: Vec3) => Math.abs(dot(sub(p, pl.at), n)) < 1e-3;
  const lines = Object.values(scene.parts).filter((p) => p.kind === "line" && p.origin === "drawn" && !p.center && !p.derived);
  // on a line: close to a line (not one that starts here)
  let best: { at: V2; ref: Ref; px: number } | null = null;
  for (const l of lines) {
    const qs = segmentOf(get, l.ref);
    if (!qs || !onPlane(qs[0]) || !onPlane(qs[1]) || skip(l.ref)) continue;
    const q: [V2, V2] = [localOf(pl, qs[0]), localOf(pl, qs[1])];
    const ab: V2 = [q[1][0] - q[0][0], q[1][1] - q[0][1]];
    const t = Math.max(0, Math.min(1, ((e[0] - q[0][0]) * ab[0] + (e[1] - q[0][1]) * ab[1]) / (dot([ab[0], ab[1], 0], [ab[0], ab[1], 0]) || 1)));
    const c: V2 = [q[0][0] + ab[0] * t, q[0][1] + ab[1] * t];
    if (t < 0.02 || t > 0.98) continue; // at an end: that is a corner, not "on line"
    const [px, py] = pv.project(lift(pl, c));
    const px2 = Math.hypot(px - pv.x, py - pv.y);
    if (px2 <= settings.sketch.snapPx && (!best || px2 < best.px)) best = { at: c, ref: l.ref, px: px2 };
  }
  if (best) return { at: best.at, hint: { kind: "onLine", ref: best.ref } };
  // on a circle: the point is at the edge of a circle or an arc
  let onCircle: { at: V2; ref: Ref; px: number } | null = null;
  for (const c of roundsOf(scene, get).filter((r) => onPlane(r.center))) {
    const m = localOf(pl, c.center);
    const w: V2 = [e[0] - m[0], e[1] - m[1]];
    const D = lenOf(w);
    if (D < 1e-9) continue;
    const q: V2 = [m[0] + (w[0] / D) * c.radius, m[1] + (w[1] / D) * c.radius];
    if (!withinArc(pl, c, q)) continue;
    const [px, py] = pv.project(lift(pl, q));
    const px2 = Math.hypot(px - pv.x, py - pv.y);
    if (px2 <= settings.sketch.snapPx && (!onCircle || px2 < onCircle.px)) onCircle = { at: q, ref: c.ref, px: px2 };
  }
  return onCircle ? { at: onCircle.at, hint: { kind: "onCircle", ref: onCircle.ref } } : null;
}

/** A point of an arc being drawn (an end): on a line or on a circle, if the pointer is near one (`base` is the pointer already snapped to corners and the rounding). */
export function pointHint(spent: Scene, pl: Plane, pv: PointerView, base: Vec3): { at: Vec3; hints: Hint[] } {
  const scene = live(spent);
  const n = normalOfPlane(pl);
  for (const p of Object.values(scene.parts)) if (p.kind === "corner" && Math.abs(dot(sub(p.at, pl.at), n)) < 1e-3 && dist(p.at, base) < 1e-6) return { at: base, hints: [] }; // (at a corner: that is its own constraint)
  const snapped = outlineSnap(scene, pl, pv, localOf(pl, base));
  return snapped ? { at: lift(pl, snapped.at), hints: [snapped.hint] } : { at: base, hints: [] };
}

/** The end of a line from `start` that the pointer is at, `base` (already snapped to corners and the rounding), made to satisfy any constraint it is close to. */
export function lineHint(spent: Scene, pl: Plane, start: Vec3, pv: PointerView, base: Vec3): { at: Vec3; hints: Hint[] } {
  const scene = live(spent); // (what an extrude used up, or a deleted body took, is not there to suggest a constraint to)
  const none = { at: base, hints: [] as Hint[] };
  const n = normalOfPlane(pl);
  const onPlane = (p: Vec3) => Math.abs(dot(sub(p, pl.at), n)) < 1e-3;
  for (const p of Object.values(scene.parts)) if (p.kind === "corner" && onPlane(p.at) && dist(p.at, base) < 1e-6) return none; // it is at a corner: that is its own constraint
  const s = localOf(pl, start);
  const e = localOf(pl, base);
  const d: V2 = [e[0] - s[0], e[1] - s[1]];
  const len = lenOf(d);
  if (len < 1e-6) return none;
  const get = (r: Ref) => scene.parts[r];
  const tol = (settings.sketch.hintDeg * Math.PI) / 180;
  const lines = Object.values(scene.parts).filter((p) => p.kind === "line" && p.origin === "drawn" && !p.center && !p.derived); // (a piece a crossing cut from a line is not the line: constraints name the line, and the piece goes when the crossing does, `in_251`)
  const seg = (ref: Ref): [V2, V2] | null => { const q = segmentOf(get, ref); return q && onPlane(q[0]) && onPlane(q[1]) ? [localOf(pl, q[0]), localOf(pl, q[1])] : null; };
  const touchesStart = (ref: Ref) => { const q = segmentOf(get, ref); return !!q && (dist(q[0], start) < 1e-6 || dist(q[1], start) < 1e-6); };

  // on a line, or on a circle or an arc: the end takes the nearest point on it
  const snapped = outlineSnap(scene, pl, pv, e, (ref) => touchesStart(ref));
  if (snapped) return { at: lift(pl, snapped.at), hints: [snapped.hint] };
  const rounds = roundsOf(scene, get).filter((r) => onPlane(r.center));

  // directions the end could take: level, upright, parallel or square to a line, tangent to a circle; the nearest one inside the tolerance wins
  const cands: { dir: V2; err: number; hint: Hint }[] = [];
  const angleTo = (dir: V2) => Math.acos(Math.max(-1, Math.min(1, Math.abs(dot([d[0], d[1], 0], [dir[0], dir[1], 0]) / len))));
  cands.push({ dir: [1, 0], err: angleTo([1, 0]), hint: { kind: "horizontal" } }, { dir: [0, 1], err: angleTo([0, 1]), hint: { kind: "vertical" } });
  for (const l of lines) {
    const q = seg(l.ref);
    if (!q) continue;
    const ld = unit([q[1][0] - q[0][0], q[1][1] - q[0][1]]);
    if (!touchesStart(l.ref)) cands.push({ dir: ld, err: angleTo(ld), hint: { kind: "parallel", ref: l.ref } });
    const perp: V2 = [-ld[1], ld[0]];
    cands.push({ dir: perp, err: angleTo(perp), hint: { kind: "perpendicular", ref: l.ref } });
  }
  for (const c of rounds) {
    const w: V2 = [localOf(pl, c.center)[0] - s[0], localOf(pl, c.center)[1] - s[1]];
    const D = lenOf(w);
    if (D <= c.radius * 1.001) continue;
    const a0 = Math.atan2(w[1], w[0]);
    const off = Math.asin(c.radius / D);
    for (const sgn of [-1, 1]) {
      const dir: V2 = [Math.cos(a0 + sgn * off), Math.sin(a0 + sgn * off)];
      cands.push({ dir, err: Math.acos(Math.max(-1, Math.min(1, dot([d[0], d[1], 0], [dir[0], dir[1], 0]) / len))), hint: { kind: "tangent", ref: c.ref } }); // (the signed direction: a tangent is one way only)
    }
  }
  const ok = cands.filter((c) => c.err <= tol).sort((a, b) => a.err - b.err);
  let dir: V2 = unit(d);
  const hints: Hint[] = [];
  if (ok.length) {
    const first = ok[0]!;
    dir = first.hint.kind === "tangent" ? first.dir : (dot([d[0], d[1], 0], [first.dir[0], first.dir[1], 0]) >= 0 ? first.dir : [-first.dir[0], -first.dir[1]]);
    hints.push(first.hint);
    for (const o of ok.slice(1)) if (Math.abs(dot([dir[0], dir[1], 0], [o.dir[0], o.dir[1], 0])) > Math.cos(1e-3) && o.hint.kind !== first.hint.kind) hints.push(o.hint); // another that gives the same direction
  }
  // as long as another line (within 2 %)
  let length = hints.length ? Math.abs(dot([d[0], d[1], 0], [dir[0], dir[1], 0])) : len;
  for (const l of lines) {
    const q = seg(l.ref);
    if (!q || touchesStart(l.ref)) continue;
    const L = lenOf([q[1][0] - q[0][0], q[1][1] - q[0][1]]);
    if (Math.abs(L - length) <= 0.02 * L) { length = L; hints.push({ kind: "equalLength", ref: l.ref }); break; }
  }
  if (!hints.length) return none;
  return { at: lift(pl, [s[0] + dir[0] * length, s[1] + dir[1] * length]), hints };
}


/**
 * The bow of an arc being drawn (`cursor` is the pointer, and its distance from the chord is how far the middle stands out): when an end of the arc is on a circle or an arc and the bow is close to the one that makes
 * the two meet smoothly there (the same direction), the bow takes it exactly and says "tangent" (`in_280`).
 */
export function arcBulgeHint(spent: Scene, pl: Plane, a: Vec3, b: Vec3, cursor: Vec3): { at: Vec3; hints: Hint[] } {
  const scene = live(spent);
  const none = { at: cursor, hints: [] as Hint[] };
  const get = (r: Ref) => scene.parts[r];
  const n = normalOfPlane(pl);
  const A = localOf(pl, a), B = localOf(pl, b), q = localOf(pl, cursor);
  const chord: V2 = [B[0] - A[0], B[1] - A[1]];
  const L = lenOf(chord);
  if (L < 1e-9) return none;
  const u = unit(chord);
  const perp: V2 = [-u[1], u[0]]; // (the side `arcOf` measures on: the plane's normal crossed with the chord)
  const M: V2 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const h = (q[0] - M[0]) * perp[0] + (q[1] - M[1]) * perp[1];
  if (Math.abs(h) < 1e-9) return none;
  const tol = (settings.sketch.hintDeg * Math.PI) / 180;
  const cross = (p: V2, r: V2) => p[0] * r[1] - p[1] * r[0];
  const centreNow: V2 = ((): V2 => { const t = (h * h - (L / 2) * (L / 2)) / (2 * h); return [M[0] + perp[0] * t, M[1] + perp[1] * t]; })();
  let best: { err: number; h: number; hint: Hint } | null = null;
  for (const R of roundsOf(scene, get)) {
    if (Math.abs(dot(sub(R.center, pl.at), n)) > 1e-3) continue;
    const Rc = localOf(pl, R.center);
    for (const end of [0, 1] as const) {
      const P = end === 0 ? A : B;
      if (Math.abs(Math.hypot(P[0] - Rc[0], P[1] - Rc[1]) - R.radius) > 1e-4 * Math.max(1, R.radius) || !withinArc(pl, R, P)) continue; // (this end is not on that circle)
      const dRc = unit([Rc[0] - P[0], Rc[1] - P[1]]);
      const den = cross(perp, dRc);
      if (Math.abs(den) < 1e-9) continue;
      const t = cross([P[0] - M[0], P[1] - M[1]], dRc) / den; // (where the centre of the arc that meets R smoothly at P stands on the chord's bisector)
      const root = Math.sqrt(t * t + (L / 2) * (L / 2));
      const target = h > 0 ? t + root : t - root;
      const r1 = unit([P[0] - centreNow[0], P[1] - centreNow[1]]);
      const r2 = unit([P[0] - Rc[0], P[1] - Rc[1]]);
      const err = Math.acos(Math.max(-1, Math.min(1, Math.abs(r1[0] * r2[0] + r1[1] * r2[1]))));
      if (err <= tol && (!best || err < best.err)) best = { err, h: target, hint: { kind: "tangent", ref: R.ref, end } };
    }
  }
  return best ? { at: lift(pl, [M[0] + perp[0] * best.h, M[1] + perp[1] * best.h]), hints: [best.hint] } : none;
}

/** The constraints (kind and parts) to add once an arc is made: for each end that was put on a line or a circle, and for a tangent (which also puts its end on that circle, if it was not already). */
export function arcHintRelations(scene: Scene, arc: Ref, ends: readonly (readonly Hint[])[], bow: readonly Hint[]): { kind: Hint["kind"]; parts: Ref[] }[] {
  const part = scene.parts[arc];
  if (part?.kind !== "line") return [];
  const out: { kind: Hint["kind"]; parts: Ref[] }[] = [];
  const have = new Set<string>();
  ends.forEach((hs, i) => { for (const h of hs) if (h.ref) { have.add(`${i}:${h.ref}`); out.push({ kind: h.kind, parts: [i === 0 ? part.a : part.b, h.ref] }); } });
  for (const h of bow) {
    if (h.kind !== "tangent" || !h.ref) continue;
    const i = h.end ?? 0;
    if (!have.has(`${i}:${h.ref}`)) out.push({ kind: "onCircle", parts: [i === 0 ? part.a : part.b, h.ref] });
    out.push({ kind: "tangent", parts: [arc, h.ref] });
  }
  return out;
}

/** The constraint to add once the line is made, for one hint: `line` is the new line, `corner` its end corner. */
export function hintCommand(scene: Scene, line: Ref, corner: Ref, h: Hint): Command {
  const parts = h.kind === "horizontal" || h.kind === "vertical" ? [line] : h.kind === "onLine" || h.kind === "onCircle" ? [corner, h.ref!] : [line, h.ref!];
  return { type: "addRelation", relation: { id: nextId(scene, "r"), kind: h.kind, parts } };
}

/** The circle whose centre is exactly here, on this plane: drawing a circle's centre on it asks to make them concentric. */
export function circleCentredAt(spent: Scene, pl: Plane, at: Vec3): Ref | null {
  const scene = live(spent);
  for (const c of Object.values(scene.parts)) {
    if (c.kind !== "circle" || c.origin !== "drawn" || c.plane !== pl.ref) continue;
    const centre = scene.parts[c.center];
    if (centre?.kind === "corner" && dist(centre.at, at) < 1e-6) return c.ref;
  }
  return null;
}

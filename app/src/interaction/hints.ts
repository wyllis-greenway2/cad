// Constraint hints while a line is being drawn (`in_152`, `q_snap_suggestions`): when the end of the line is close to being level, upright, parallel or square to another line,
// on another line, tangent to a circle, or as long as another line, the end takes that exactly and says so; a click then makes the line with that constraint.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, dist } from "../math/vec.ts";
import type { PointerView, Plane } from "../operation/part.ts";
import { segmentOf, circleOf, pointOf, normalOfPlane, localOf, liftOf } from "../operation/part.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import { live } from "../operation/ownership.ts";
import { anchorRounds, anchorLines } from "../operation/anchors.ts";
import type { Command } from "../operation/commands.ts";
import { settings } from "../shared/settings.ts";

export interface Hint { /** (an arc's tangent: which end of the arc touches the circle) */ end?: 0 | 1; kind: "horizontal" | "vertical" | "parallel" | "perpendicular" | "onLine" | "onCircle" | "concentric" | "tangent" | "equalLength"; ref?: Ref }
type V2 = [number, number];

const lenOf = (v: V2) => Math.hypot(v[0], v[1]);
const unit = (v: V2): V2 => { const l = lenOf(v) || 1; return [v[0] / l, v[1] / l]; };

/** A circle or an arc: what a line can end on or be tangent to. An arc's ends say which part of its circle is there (`in_230`: an arc is a circle too, and lit when it is the one the end is on). */
interface Round { ref: Ref; center: Vec3; radius: number; arc?: { a: Vec3; b: Vec3; ccw: boolean } }
function roundsOf(scene: Scene, get: (r: Ref) => Scene["parts"][string] | undefined, pl?: Plane): Round[] {
  const out: Round[] = [];
  if (pl) for (const a of anchorRounds(scene, pl)) out.push({ ref: a.ref, center: a.center, radius: a.radius }); // (the circular edges of the body in this plane: anchors, `in_308`)
  for (const c of Object.values(scene.parts)) {
    if (c.kind === "circle") { const ci = circleOf(get, c.ref); if (ci) out.push({ ref: c.ref, ...ci }); continue; }
    if (c.kind === "line" && c.origin === "drawn" && c.center && !c.derived) { // (a piece an extrusion cut from the arc is not the arc: the arc is what constraints name)
      const [m, a, b] = [pointOf(get, c.center), pointOf(get, c.a), pointOf(get, c.b)];
      if (m && a && b) out.push({ ref: c.ref, center: m, radius: dist(m, a), arc: { a, b, ccw: c.ccw !== false } });
    }
  }
  return out;
}
/** The circles and arcs whose edge this point (in the plane's own numbers) lies on: what a line or an arc that starts or ends there can meet smoothly. */
function roundsThrough(scene: Scene, pl: Plane, P: V2): Round[] {
  const n = normalOfPlane(pl);
  const get = (r: Ref) => scene.parts[r];
  return roundsOf(scene, get, pl).filter((R) => {
    if (Math.abs(dot(sub(R.center, pl.at), n)) > 1e-3) return false;
    const Rc = localOf(pl, R.center);
    return Math.abs(Math.hypot(P[0] - Rc[0], P[1] - Rc[1]) - R.radius) <= 1e-4 * Math.max(1, R.radius) && withinArc(pl, R, P);
  });
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
function outlineSnap(scene: Scene, pl: Plane, pv: PointerView, e: V2, skip: (ref: Ref) => boolean = () => false): { at: V2; hint: Hint } | null {
  const get = (r: Ref) => scene.parts[r];
  const n = normalOfPlane(pl);
  const onPlane = (p: Vec3) => Math.abs(dot(sub(p, pl.at), n)) < 1e-3;
  const anchored = new Set(anchorLines(scene, pl).map((l) => l.ref)); // (the straight edges of the body in this plane are lines too, read-only, `in_310`)
  const lines = Object.values(scene.parts).filter((p) => p.kind === "line" && ((p.origin === "drawn" && !p.center && !p.derived) || anchored.has(p.ref)));
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
    const [px, py] = pv.project(liftOf(pl, c));
    const px2 = Math.hypot(px - pv.x, py - pv.y);
    if (px2 <= settings.sketch.snapPx && (!best || px2 < best.px)) best = { at: c, ref: l.ref, px: px2 };
  }
  if (best) return { at: best.at, hint: { kind: "onLine", ref: best.ref } };
  // on a circle: the point is at the edge of a circle or an arc
  let onCircle: { at: V2; ref: Ref; px: number } | null = null;
  for (const c of roundsOf(scene, get, pl).filter((r) => onPlane(r.center) && !skip(r.ref))) {
    const m = localOf(pl, c.center);
    const w: V2 = [e[0] - m[0], e[1] - m[1]];
    const D = lenOf(w);
    if (D < 1e-9) continue;
    const q: V2 = [m[0] + (w[0] / D) * c.radius, m[1] + (w[1] / D) * c.radius];
    if (!withinArc(pl, c, q)) continue;
    const [px, py] = pv.project(liftOf(pl, q));
    const px2 = Math.hypot(px - pv.x, py - pv.y);
    if (px2 <= settings.sketch.snapPx && (!onCircle || px2 < onCircle.px)) onCircle = { at: q, ref: c.ref, px: px2 };
  }
  return onCircle ? { at: onCircle.at, hint: { kind: "onCircle", ref: onCircle.ref } } : null;
}

/** A point of an arc being drawn (an end): on a line or on a circle, if the pointer is near one (`base` is the pointer already snapped to corners and the rounding). */
export function pointHint(spent: Scene, pl: Plane, pv: PointerView, base: Vec3, skip: (ref: Ref) => boolean = () => false): { at: Vec3; hints: Hint[] } {
  const scene = live(spent);
  const n = normalOfPlane(pl);
  for (const p of Object.values(scene.parts)) if (p.kind === "corner" && Math.abs(dot(sub(p.at, pl.at), n)) < 1e-3 && dist(p.at, base) < 1e-6) return { at: base, hints: [] }; // (at a corner: that is its own constraint)
  const snapped = outlineSnap(scene, pl, pv, localOf(pl, base), skip);
  return snapped ? { at: liftOf(pl, snapped.at), hints: [snapped.hint] } : { at: base, hints: [] };
}

/**
 * The edge of a circle being drawn about `center`, at the pointer (`raw`): where that makes it touch another circle (outside it, or inside it, or with the other circle inside it) the radius is taken exactly and says "tangent" (`in_296`).
 * The same snap as dragging the edge of a circle that is already drawn.
 */
export function circleRadiusHint(spent: Scene, pl: Plane, center: Vec3, pv: PointerView, raw: Vec3): { at: Vec3; hints: Hint[] } | null {
  const scene = live(spent);
  const n = normalOfPlane(pl);
  const w = sub(raw, center);
  const D = Math.hypot(w[0], w[1], w[2]);
  if (D < 1e-9) return null;
  let best: { at: Vec3; ref: Ref; px: number } | null = null;
  for (const o of Object.values(scene.parts)) {
    if (o.kind !== "circle" || o.origin !== "drawn") continue;
    const oc = scene.parts[o.center];
    if (oc?.kind !== "corner" || Math.abs(dot(sub(oc.at, pl.at), n)) > 1e-3) continue;
    const d = dist(center, oc.at);
    if (d < 1e-9) continue; // (the same centre: concentric, not tangent)
    for (const want of [d + o.radius, Math.abs(d - o.radius), o.radius - d]) { // (outside it, or one inside the other)
      if (want < 1e-6) continue;
      const at = add(center, scale(w, want / D));
      const [x, y] = pv.project(at);
      const px = Math.hypot(x - pv.x, y - pv.y);
      if (px <= settings.sketch.snapPx && (!best || px < best.px)) best = { at, ref: o.ref, px };
    }
  }
  return best ? { at: best.at, hints: [{ kind: "tangent", ref: best.ref }] } : null;
}

/**
 * The centre of a circle of `radius` taken to `at`: where that makes its edge touch another circle drawn on the plane (outside, or one inside the other) within `tolMm`, the centre goes exactly there and the circle is named (`in_294`, `in_300`:
 * the same for a circle being moved as it is drawn and one already drawn). `skip`: the circle that is being moved.
 */
export function tangentCentre(spent: Scene, pl: Plane, radius: number, at: Vec3, tolMm: number, skip: Ref | null = null): { at: Vec3; ref: Ref } | null {
  const scene = live(spent);
  const n = normalOfPlane(pl);
  let best = tolMm;
  let out: { at: Vec3; ref: Ref } | null = null;
  for (const o of Object.values(scene.parts)) {
    if (o.kind !== "circle" || o.ref === skip || o.origin !== "drawn" || o.plane !== pl.ref) continue;
    const oc = scene.parts[o.center];
    if (oc?.kind !== "corner" || Math.abs(dot(sub(oc.at, pl.at), n)) > 1e-3) continue;
    const dc = dist(at, oc.at);
    if (dc < 1e-9) continue;
    for (const want of [radius + o.radius, Math.abs(radius - o.radius)]) {
      if (want > 1e-6 && Math.abs(dc - want) < best) { best = Math.abs(dc - want); out = { at: add(oc.at, scale(sub(at, oc.at), want / dc)), ref: o.ref }; }
    }
  }
  return out;
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
  const anchored = new Set(anchorLines(scene, pl).map((l) => l.ref)); // (the straight edges of the body in this plane, `in_310`)
  const lines = Object.values(scene.parts).filter((p) => p.kind === "line" && ((p.origin === "drawn" && !p.center && !p.derived) || anchored.has(p.ref))); // (a piece a crossing cut from a line is not the line: constraints name the line, and the piece goes when the crossing does, `in_251`)
  const seg = (ref: Ref): [V2, V2] | null => { const q = segmentOf(get, ref); return q && onPlane(q[0]) && onPlane(q[1]) ? [localOf(pl, q[0]), localOf(pl, q[1])] : null; };
  const touchesStart = (ref: Ref) => { const q = segmentOf(get, ref); return !!q && (dist(q[0], start) < 1e-6 || dist(q[1], start) < 1e-6); };

  // on a line, or on a circle or an arc: the end takes the nearest point on it
  const snapped = outlineSnap(scene, pl, pv, e, (ref) => touchesStart(ref));
  const rounds = roundsOf(scene, get, pl).filter((r) => onPlane(r.center));

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
  // starting on a circle or an arc: the line along the edge there (tangent at its start, as an arc that ends on a circle can meet it smoothly)
  for (const R of roundsThrough(scene, pl, s)) {
    const Rc = localOf(pl, R.center);
    const t0 = unit([-(s[1] - Rc[1]), s[0] - Rc[0]]);
    const dir: V2 = dot([d[0], d[1], 0], [t0[0], t0[1], 0]) >= 0 ? t0 : [-t0[0], -t0[1]];
    cands.push({ dir, err: angleTo(dir), hint: { kind: "tangent", ref: R.ref, end: 0 } });
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
  // the end on a circle or a line takes the place; when the line is also level, upright, parallel, square or tangent from where it starts, and the end is where that direction meets the circle, it keeps that too (`in_301`: a line tangent to one circle that ends on another)
  if (snapped) {
    const R = snapped.hint.kind === "onCircle" ? rounds.find((r) => r.ref === snapped.hint.ref) : undefined;
    const toEnd = unit([snapped.at[0] - s[0], snapped.at[1] - s[1]]);
    if (R && hints.length && Math.acos(Math.max(-1, Math.min(1, dot([toEnd[0], toEnd[1], 0], [dir[0], dir[1], 0])))) <= tol) {
      const C = localOf(pl, R.center);
      const f: V2 = [s[0] - C[0], s[1] - C[1]];
      const b = 2 * (f[0] * dir[0] + f[1] * dir[1]);
      const disc = b * b - 4 * (f[0] * f[0] + f[1] * f[1] - R.radius * R.radius);
      if (disc >= 0) {
        const want = lenOf([snapped.at[0] - s[0], snapped.at[1] - s[1]]);
        const t = [(-b - Math.sqrt(disc)) / 2, (-b + Math.sqrt(disc)) / 2].filter((x) => x > 1e-6).sort((x, y) => Math.abs(x - want) - Math.abs(y - want))[0];
        if (t !== undefined) return { at: liftOf(pl, [s[0] + dir[0] * t, s[1] + dir[1] * t]), hints: [snapped.hint, ...hints] };
      }
    }
    return { at: liftOf(pl, snapped.at), hints: [snapped.hint] };
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
  return { at: liftOf(pl, [s[0] + dir[0] * length, s[1] + dir[1] * length]), hints };
}


/**
 * The bow of an arc being drawn (`cursor` is the pointer, and its distance from the chord is how far the middle stands out): when an end of the arc is on a circle or an arc and the bow is close to the one that makes
 * the two meet smoothly there (the same direction), the bow takes it exactly and says "tangent" (`in_280`).
 */
export function arcBulgeHint(spent: Scene, pl: Plane, a: Vec3, b: Vec3, cursor: Vec3): { at: Vec3; hints: Hint[] } {
  const scene = live(spent);
  const none = { at: cursor, hints: [] as Hint[] };
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
  for (const end of [0, 1] as const) {
    const P = end === 0 ? A : B;
    for (const R of roundsThrough(scene, pl, P)) {
      const Rc = localOf(pl, R.center);
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
  return best ? { at: liftOf(pl, [M[0] + perp[0] * best.h, M[1] + perp[1] * best.h]), hints: [best.hint] } : none;
}

/**
 * The constraints (kind and parts) to add once a line or an arc is made with the hints it took (`in_280`, `in_281`: one function for both): `ends` are what each end was put on (an on-line or on-circle hint for the
 * first and for the second end), `hints` the rest (level, upright, parallel, square, as long as, tangent). A tangent that is at an end also puts that end on the circle, if it was not already.
 */
export function hintRelations(scene: Scene, curve: Ref, ends: readonly (readonly Hint[])[], hints: readonly Hint[]): { kind: Hint["kind"]; parts: Ref[] }[] {
  const part = scene.parts[curve];
  if (part?.kind !== "line") return [];
  const corner = (i: number) => (i === 0 ? part.a : part.b);
  const out: { kind: Hint["kind"]; parts: Ref[] }[] = [];
  const on = new Set<string>();
  ends.forEach((hs, i) => { for (const h of hs) if (h.ref && (h.kind === "onLine" || h.kind === "onCircle")) { on.add(`${i}:${h.ref}`); out.push({ kind: h.kind, parts: [corner(i), h.ref] }); } });
  for (const h of hints) {
    if (h.kind === "onLine" || h.kind === "onCircle") continue; // (an end's: they are in `ends`)
    if (h.kind === "tangent" && h.ref && h.end !== undefined && !on.has(`${h.end}:${h.ref}`)) { on.add(`${h.end}:${h.ref}`); out.push({ kind: "onCircle", parts: [corner(h.end), h.ref] }); }
    out.push({ kind: h.kind, parts: h.kind === "horizontal" || h.kind === "vertical" ? [curve] : [curve, h.ref!] });
  }
  return out;
}

/** The circle whose centre is exactly here, on this plane: drawing a circle's centre on it asks to make them concentric. */
export function circleCentredAt(spent: Scene, pl: Plane, at: Vec3): Ref | null {
  const scene = live(spent);
  for (const a of anchorRounds(scene, pl)) if (dist(a.center, at) < 1e-6) return a.ref; // (the centre of a circular edge of the body)
  for (const c of Object.values(scene.parts)) {
    if (c.kind !== "circle" || c.origin !== "drawn" || c.plane !== pl.ref) continue;
    const centre = scene.parts[c.center];
    if (centre?.kind === "corner" && dist(centre.at, at) < 1e-6) return c.ref;
  }
  return null;
}

/**
 * The centre of a circular edge of the body that the pointer is at (`in_308`): the point of a circle being drawn is taken to it, and the circle is then concentric with the edge. A centre of a drawn circle is a corner and
 * is snapped to like one; the edge of a body has no corner there, so it is found here.
 */
export function anchorCentreAt(spent: Scene, pl: Plane, pv: PointerView): { at: Vec3; ref: Ref } | null {
  let best: { at: Vec3; ref: Ref; px: number } | null = null;
  for (const a of anchorRounds(live(spent), pl)) {
    const [x, y] = pv.project(a.center);
    const px = Math.hypot(x - pv.x, y - pv.y);
    if (px <= settings.sketch.snapPx && (!best || px < best.px)) best = { at: a.center, ref: a.ref, px };
  }
  return best ? { at: best.at, ref: best.ref } : null;
}

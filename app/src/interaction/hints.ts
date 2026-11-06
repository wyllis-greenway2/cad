// Constraint hints while a line is being drawn (`in_152`, `q_snap_suggestions`): when the end of the line is close to being level, upright, parallel or square to another line,
// on another line, tangent to a circle, or as long as another line, the end takes that exactly and says so; a click then makes the line with that constraint.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, dist } from "../math/vec.ts";
import type { PointerView, Plane } from "../operation/part.ts";
import { segmentOf, circleOf, normalOfPlane } from "../operation/part.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import { settings } from "../shared/settings.ts";
import { localOf } from "./tools.ts";

export interface Hint { kind: "horizontal" | "vertical" | "parallel" | "perpendicular" | "onLine" | "onCircle" | "tangent" | "equalLength"; ref?: Ref }
type V2 = [number, number];

const lift = (pl: Plane, [x, y]: V2): Vec3 => add(pl.at, add(scale(pl.u, x), scale(pl.v, y)));
const lenOf = (v: V2) => Math.hypot(v[0], v[1]);
const unit = (v: V2): V2 => { const l = lenOf(v) || 1; return [v[0] / l, v[1] / l]; };

/** The end of a line from `start` that the pointer is at, `base` (already snapped to corners and the rounding), made to satisfy any constraint it is close to. */
export function lineHint(scene: Scene, pl: Plane, start: Vec3, pv: PointerView, base: Vec3): { at: Vec3; hints: Hint[] } {
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
  const lines = Object.values(scene.parts).filter((p) => p.kind === "line" && p.origin === "drawn" && !p.center);
  const seg = (ref: Ref): [V2, V2] | null => { const q = segmentOf(get, ref); return q && onPlane(q[0]) && onPlane(q[1]) ? [localOf(pl, q[0]), localOf(pl, q[1])] : null; };
  const touchesStart = (ref: Ref) => { const q = segmentOf(get, ref); return !!q && (dist(q[0], start) < 1e-6 || dist(q[1], start) < 1e-6); };

  // on a line: the end is close to another line (not one that starts here): it takes the nearest point on it
  let best: { at: V2; ref: Ref; px: number } | null = null;
  for (const l of lines) {
    const q = seg(l.ref);
    if (!q || touchesStart(l.ref)) continue;
    const ab: V2 = [q[1][0] - q[0][0], q[1][1] - q[0][1]];
    const t = Math.max(0, Math.min(1, ((e[0] - q[0][0]) * ab[0] + (e[1] - q[0][1]) * ab[1]) / (dot([ab[0], ab[1], 0], [ab[0], ab[1], 0]) || 1)));
    const c: V2 = [q[0][0] + ab[0] * t, q[0][1] + ab[1] * t];
    if (t < 0.02 || t > 0.98) continue; // at an end: that is a corner, not "on line"
    const [px, py] = pv.project(lift(pl, c));
    const px2 = Math.hypot(px - pv.x, py - pv.y);
    if (px2 <= settings.sketch.snapPx && (!best || px2 < best.px)) best = { at: c, ref: l.ref, px: px2 };
  }
  if (best) return { at: lift(pl, best.at), hints: [{ kind: "onLine", ref: best.ref }] };
  // on a circle: the end is at the edge of a circle (a line from its centre to its edge ends exactly on it)
  let onCircle: { at: V2; ref: Ref; px: number } | null = null;
  for (const c of Object.values(scene.parts)) {
    if (c.kind !== "circle") continue;
    const ci = circleOf(get, c.ref);
    if (!ci || !onPlane(ci.center)) continue;
    const m = localOf(pl, ci.center);
    const w: V2 = [e[0] - m[0], e[1] - m[1]];
    const D = lenOf(w);
    if (D < 1e-9) continue;
    const q: V2 = [m[0] + (w[0] / D) * ci.radius, m[1] + (w[1] / D) * ci.radius];
    const [px, py] = pv.project(lift(pl, q));
    const px2 = Math.hypot(px - pv.x, py - pv.y);
    if (px2 <= settings.sketch.snapPx && (!onCircle || px2 < onCircle.px)) onCircle = { at: q, ref: c.ref, px: px2 };
  }
  if (onCircle) return { at: lift(pl, onCircle.at), hints: [{ kind: "onCircle", ref: onCircle.ref }] };

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
  for (const c of Object.values(scene.parts)) {
    if (c.kind !== "circle") continue;
    const ci = circleOf(get, c.ref);
    if (!ci || !onPlane(ci.center)) continue;
    const w: V2 = [localOf(pl, ci.center)[0] - s[0], localOf(pl, ci.center)[1] - s[1]];
    const D = lenOf(w);
    if (D <= ci.radius * 1.001) continue;
    const a0 = Math.atan2(w[1], w[0]);
    const off = Math.asin(ci.radius / D);
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

/** The constraint to add once the line is made, for one hint: `line` is the new line, `corner` its end corner. */
export function hintCommand(scene: Scene, line: Ref, corner: Ref, h: Hint): Command {
  const parts = h.kind === "horizontal" || h.kind === "vertical" ? [line] : h.kind === "onLine" || h.kind === "onCircle" ? [corner, h.ref!] : [line, h.ref!];
  return { type: "addRelation", relation: { id: nextId(scene, "r"), kind: h.kind, parts } };
}

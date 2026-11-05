// The one picking function (`dec_clean_engine_design` section 4): what is under the pointer, as an ordered list of candidates.
// Order: corners, then lines (and circles), then faces and planes (a shape before the face under it); inside a class nearest first
// (pixels for points and lines, along the ray for surfaces). Hover is the first candidate; repeated clicks cycle (`selection.click`).
// Drawn, body and world parts are treated alike: nothing here asks where a part came from (`in_088`).
import type { Ref } from "../shared/ref.ts";
import type { Kind, Part, PointerView } from "../operation/part.ts";
import { hitPart, depthOf, outlineOf } from "../operation/part.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import { consumed } from "../operation/ownership.ts";

export interface Candidate { ref: Ref; kind: Kind; rank: number; /** pixels (points, lines) or distance along the ray (surfaces) */ score: number }
export interface PickOptions {
  /** how close (pixels) a pointer must be to a corner / to a line or circle; the look and input values decide, not this file */
  pointTol: number;
  lineTol: number;
}
const DEFAULT_PICK: PickOptions = { pointTol: 10, lineTol: 8 };

const RANK: Record<Kind, number> = { corner: 0, line: 1, circle: 1, axis: 1, face: 2, plane: 2, body: 3 };

/** Where along the ray the nearest point of the segment is, and the point (closest approach of a ray and a segment). */
function closestOnSegment(o: Vec3, d: Vec3, a: Vec3, b: Vec3): Vec3 {
  const u = sub(b, a);
  const w = sub(a, o);
  const [uu, ud, dd, uw, dw] = [dot(u, u), dot(u, d), dot(d, d), dot(u, w), dot(d, w)];
  const den = uu * dd - ud * ud;
  const s = den < 1e-12 ? 0 : Math.min(1, Math.max(0, (ud * dw - dd * uw) / den));
  return add(a, scale(u, s));
}
/** The point of a curve that is nearest the pointer on the screen (the one to ask whether the body hides). */
function nearestOnScreen(pts: Vec3[], pv: PointerView): Vec3 {
  let best = pts[0]!;
  let bd = Infinity;
  for (const p of pts) { const [x, y] = pv.project(p); const d = Math.hypot(x - pv.x, y - pv.y); if (d < bd) { bd = d; best = p; } }
  return best;
}
const ORIGIN_ORDER = { drawn: 0, body: 1, world: 2 } as const;

export function candidatesAt(scene: Scene, pv: PointerView, opts: PickOptions = DEFAULT_PICK): Candidate[] {
  const get = lookup(scene);
  const used = consumed(scene); // what an extrude has used up is neither drawn nor picked
  const parts = Object.values(scene.parts).filter((p) => !used.has(p.ref));
  // surfaces first: only the nearest one counts, plus anything flush with it (a shape drawn on a face, a pane lying in a face); things behind it are hidden
  const surfaces: { p: Part; t: number }[] = [];
  for (const p of parts) {
    if (RANK[p.kind] !== 2) continue;
    const t = depthOf(get, p, pv);
    if (t !== null) surfaces.push({ p, t });
  }
  // an infinite world plane is only the background, whatever lies in front of what: it is what a click lands on only when there is no other surface under the pointer, even if the
  // plane is between the eye and a model (so a figure drawn on it is not always "overlapping" it, and a model seen through a plane is clicked, not the plane)
  const isBackground = (p: Part) => p.origin === "world" && p.kind === "plane" && !!p.infinite;
  const real = surfaces.filter((x) => !isBackground(x.p));
  const tmin = real.reduce((m, x) => Math.min(m, x.t), Infinity);
  const flush = (t: number) => t <= tmin + 1e-3 + 1e-6 * tmin;
  const out: Candidate[] = real.filter((x) => flush(x.t)).map((x) => ({ ref: x.p.ref, kind: x.p.kind, rank: 2, score: x.t }));
  const bgs = surfaces.filter((x) => isBackground(x.p));
  const bmin = bgs.reduce((m, x) => Math.min(m, x.t), Infinity);
  const background = bgs.filter((x) => x.t <= bmin + 1e-3 + 1e-6 * bmin).map((x) => ({ ref: x.p.ref, kind: x.p.kind, rank: 2, score: x.t }));
  // corners and lines are hidden when a face of the body is in front of them
  const occluders = parts.filter((p) => p.kind === "plane" && p.origin === "body");
  const visible = (point: Vec3): boolean => {
    if (!pv.rayAt || !occluders.length) return true;
    const [x, y] = pv.project(point);
    const ray = pv.rayAt(x, y);
    const tp = dot(sub(point, ray.o), ray.d);
    for (const o of occluders) {
      const t = depthOf(get, o, { ...pv, ray });
      if (t !== null && t < tp - 1e-3 - 1e-6 * tp) return false;
    }
    return true;
  };
  for (const p of parts) {
    const rank = RANK[p.kind];
    if (rank > 1) continue;
    const d = hitPart(get, p, pv);
    if (d === null || d > (rank === 0 ? opts.pointTol : opts.lineTol)) continue;
    if (pv.ray) {
      const o = outlineOf(get, p);
      const at = o.shape === "point" ? o.at : o.shape === "segment" ? closestOnSegment(pv.ray.o, pv.ray.d, o.a, o.b) : o.shape === "polyline" ? nearestOnScreen(o.pts, pv) : o.shape === "circle" ? o.center : null;
      if (at && !visible(at)) continue;
    }
    out.push({ ref: p.ref, kind: p.kind, rank, score: d });
  }
  if (!out.length) out.push(...background);
  const order = (c: Candidate) => ORIGIN_ORDER[scene.parts[c.ref]!.origin];
  return out.sort((a, b) => a.rank - b.rank || (a.rank === 2 ? order(a) - order(b) || a.score - b.score : a.score - b.score) || (a.ref < b.ref ? -1 : 1));
}
export const refsAt = (scene: Scene, pv: PointerView, opts?: PickOptions): Ref[] => candidatesAt(scene, pv, opts).map((c) => c.ref);
/** The part to highlight on hover. */
export const hoverAt = (scene: Scene, pv: PointerView, opts?: PickOptions): Ref | undefined => candidatesAt(scene, pv, opts)[0]?.ref;

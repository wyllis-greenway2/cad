// Hold (`q_unified_snapping`, `in_1337`, step one): what a point being placed on a plane can be held to. One reference set for the plane (the drawn corners, the middles of regular polygons, the body's corners
// and edges as they fall on the plane, the corners of a cross section's cut, the middles of straight lines) and one function over it, so the sketch tools do not each decide for themselves what counts.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot, scale, add } from "../math/vec.ts";
import type { PointerView, Plane } from "../operation/part.ts";
import { normalOfPlane, pointOf, segmentOf } from "../operation/part.ts";
import type { Scene } from "../operation/scene.ts";
import { anchorCorners, anchorLines, anchorCutCorners, anchorRounds } from "../operation/anchors.ts";
import { regularCentres } from "./polygoncentre.ts";
import { candidatesAt, visibleFrom } from "./picking.ts";
import { settings } from "../shared/settings.ts";

/** Where a hold is, what it is of (a part, or a place made of parts), and how it ranks: the lower number is taken first. */
export type HoldKind = "corner" | "centre" | "foot" | "cut" | "mid";
export interface Hold { at: Vec3; kind: HoldKind; ref: Ref | null; /** pixels from the pointer */ px: number }
const RANK: Record<HoldKind, number> = { corner: 0, centre: 1, foot: 2, cut: 3, mid: 4 };

/** The centres of the circular edges and round faces of the body as they fall on the plane (a disk's rim has no corner at its middle, so its middle is found here, `in_1325`): a point to take and to line up with. `seen` leaves out what is out of sight. */
export function roundCentres(scene: Scene, pl: Plane, seen?: (q: Vec3) => boolean): Vec3[] {
  return anchorRounds(scene, pl, seen ? { seen } : {}).map((r) => r.center);
}

const inPlane = (pl: Plane, p: Vec3): boolean => Math.abs(dot(sub(p, pl.at), normalOfPlane(pl))) < 1e-3;

/**
 * The points on the plane a pointer can be held to: every one within the snap distance on the screen, nearest first within its kind, the kinds in a fixed order (a corner before a middle). `scene` is the live scene.
 * `skip`: a corner that does not count (the one being dragged).
 */
export function holdsAt(scene: Scene, pv: PointerView, pl: Plane, skip?: Ref): Hold[] {
  const n = normalOfPlane(pl);
  const seen = (q: Vec3) => visibleFrom(scene, pv, q, { at: pl.at, n });
  const px = (p: Vec3): number => { const [x, y] = pv.project(p); return Math.hypot(x - pv.x, y - pv.y); };
  const out: Hold[] = [];
  const add1 = (kind: HoldKind, at: Vec3, ref: Ref | null) => { const d = px(at); if (d <= settings.sketch.snapPx) out.push({ at, kind, ref, px: d }); };
  for (const c of candidatesAt(scene, pv, { pointTol: settings.sketch.snapPx, lineTol: 0 })) { // (a corner of the scene that is in the plane)
    if (c.kind !== "corner" || c.ref === skip) continue;
    const q = pointOf((r) => scene.parts[r], c.ref);
    if (q && inPlane(pl, q)) out.push({ at: q, kind: "corner", ref: c.ref, px: px(q) });
  }
  for (const c of [...regularCentres(scene, pl), ...roundCentres(scene, pl, seen)]) add1("centre", c, null); // (the middle of a regular polygon is taken like a corner, `in_1285`)
  for (const c of anchorCorners(scene, pl, { seen })) if (Math.abs(c.offset) > 1e-3) add1("foot", c.at, c.ref); // (a corner of the body that is not in the plane but falls on it, `in_311`)
  for (const c of anchorCutCorners(scene, pl)) add1("cut", c.at, null); // (a corner of the cut of a cross section plane, `in_398`)
  const projected = new Map(anchorLines(scene, pl, { seen }).map((l) => [l.ref, [l.a, l.b] as [Vec3, Vec3]]));
  for (const l of Object.values(scene.parts)) { // (the middle of a straight line, drawn or an edge or flat face of the body as it falls on the plane, `in_381`)
    if (!(l.kind === "line" || (l.kind === "plane" && l.origin === "body" && projected.has(l.ref))) || (l.kind === "line" && (l.center || l.derived)) || (l.origin !== "drawn" && !projected.has(l.ref))) continue;
    const q = projected.get(l.ref) ?? segmentOf((r) => scene.parts[r], l.ref);
    if (!q || !inPlane(pl, q[0]) || !inPlane(pl, q[1])) continue;
    add1("mid", scale(add(q[0], q[1]), 0.5), l.ref);
  }
  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.px - b.px);
}

/**
 * The places a point being placed can line up with, level or upright on the plane: the corners drawn on it, the middles of regular polygons, and (new) the body's corners as they fall on it, the feet of its vertical
 * edges among them, so a point can be put in line with the corner of the block it is drawn on.
 */
export function alignPoints(scene: Scene, pv: PointerView, pl: Plane, skip?: Ref): Vec3[] {
  const n = normalOfPlane(pl);
  const seen = (q: Vec3) => visibleFrom(scene, pv, q, { at: pl.at, n });
  const drawn = Object.values(scene.parts).flatMap((p) => (p.kind === "corner" && p.ref !== skip && inPlane(pl, p.at) ? [p.at] : []));
  return [...drawn, ...regularCentres(scene, pl), ...roundCentres(scene, pl, seen), ...anchorCorners(scene, pl, { seen }).filter((c) => Math.abs(c.offset) > 1e-3).map((c) => c.at)];
}

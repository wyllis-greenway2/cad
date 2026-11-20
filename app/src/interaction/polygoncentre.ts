// The middle of a regular polygon that is drawn (`dec_polygon_tool`, `in_1285`): a closed figure of straight sides of one length with every corner the same distance from the middle has a middle that tools snap to, as they do to a corner, so a circle can be drawn in a
// hexagon on its middle. The middle is worked out from the figure each time (it is no part of the drawing: nothing to keep in step when the polygon is moved or changed). Pure: a scene and a plane in; points out.
import type { Scene } from "../operation/scene.ts";
import type { Plane } from "../operation/part.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot, length } from "../math/vec.ts";
import { segmentOf, pointOf } from "../operation/part.ts";
import { normalOfPlane } from "../operation/part.ts";

const TOL = 1e-4;
/** The middles of the regular polygons drawn on this plane. */
export function regularCentres(scene: Scene, pl: Plane): Vec3[] {
  const get = (r: string) => scene.parts[r as never];
  const n = normalOfPlane(pl);
  const out: Vec3[] = [];
  for (const f of Object.values(scene.parts)) {
    if (f.kind !== "face" || f.origin !== "drawn" || f.disk || f.plane !== pl.ref || f.loop.length < 3) continue;
    const sides = f.loop.map((l) => { const p = scene.parts[l]; return p?.kind === "line" && !p.bulge && !p.center && !p.spline ? segmentOf(get, l) : null; });
    if (sides.some((s) => !s)) continue;
    const segs = sides as [Vec3, Vec3][];
    if (segs.some((s) => Math.abs(dot(sub(s[0], pl.at), n)) > 1e-3)) continue;
    const lens = segs.map((s) => length(sub(s[1], s[0])));
    if (lens.some((l) => Math.abs(l - lens[0]!) > TOL * Math.max(1, lens[0]!))) continue; // (the sides are alike)
    const pts = f.corners.map((r) => pointOf(get, r));
    if (pts.some((p) => !p) || pts.length !== segs.length) continue;
    const ps = pts as Vec3[];
    const c: Vec3 = [0, 1, 2].map((k) => ps.reduce((t, p) => t + p[k]!, 0) / ps.length) as unknown as Vec3;
    const rs = ps.map((p) => length(sub(p, c)));
    if (rs.some((r) => Math.abs(r - rs[0]!) > TOL * Math.max(1, rs[0]!))) continue; // (and the corners are on a circle: a regular polygon, not a rhombus)
    out.push(c);
  }
  return out;
}

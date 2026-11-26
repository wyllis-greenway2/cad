// Rounds past the kernel's limit (E34 to E36): what the rod-end rim is, and the pointed end built from it. The kernel's rounds stay in `kernel.ts` and the `round` step; this is the second tier,
// our own construction for the cases we have defined (a rim of a rod: a flat disc end and a cylinder wall on one axis).
import * as K from "./kernel.ts";
import type { Body, EdgeRec } from "./lineage.ts";

type V3 = K.V3;
export interface Rim {
  /** the centre of the end disc */ c: V3;
  /** the way out of the rod */ outward: V3;
  r: number;
  /** how far the wall runs from the end to where it stops */ height: number;
  cap: unknown;
  wall: unknown;
}
/** is this edge the rim of a rod's flat end: a whole circle between a flat disc (nothing else on it) and a cylinder wall on the same axis? */
export function rimOf(body: Body, e: EdgeRec): Rim | null {
  if (e.faces.length !== 2) return null;
  const cap = e.faces.find((f) => K.facts(f.h).type === "PLANE"),
    wall = e.faces.find((f) => K.facts(f.h).type === "CYLINDRE");
  if (!cap || !wall) return null;
  if (K.faceEdges(cap.h).length !== 1) return null; // a disc with nothing else on it
  const circ = K.edgeCircle(e.h);
  if (!circ || !circ.closed) return null;
  const cyl = K.cylinderOf(wall.h),
    d = cyl.dir,
    n = K.outwardAtEdge(cap.h).normal;
  if (
    Math.abs(Math.abs(d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) - 1) > 1e-9 ||
    Math.abs(cyl.r - circ.r) > 1e-9 * Math.max(1, cyl.r)
  )
    return null;
  const off = [circ.c[0] - cyl.point[0], circ.c[1] - cyl.point[1], circ.c[2] - cyl.point[2]],
    along = off[0]! * d[0] + off[1]! * d[1] + off[2]! * d[2];
  if (Math.hypot(off[0]! - along * d[0], off[1]! - along * d[1], off[2]! - along * d[2]) > 1e-7 * Math.max(1, cyl.r))
    return null; // on the same axis
  let low = 0;
  for (const x of K.faceEdges(wall.h))
    for (const p of K.edgeEnds(x))
      low = Math.min(low, (p[0] - circ.c[0]) * n[0] + (p[1] - circ.c[1]) * n[1] + (p[2] - circ.c[2]) * n[2]);
  void body;
  return { c: circ.c, outward: n, r: cyl.r, height: -low, cap, wall };
}
/** the largest size of a pointed end: where the arc's tangent point reaches the other end of the wall (`t = height`) */
export const pointedLimit = (r: number, height: number): number => (height * height + r * r) / (2 * r);

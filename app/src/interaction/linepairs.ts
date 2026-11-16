// Every straight line and circle of the scene that is drawn, whatever its origin, as flat pairs of points: the lists the view draws its lines from. A line marked score or engrave (`in_564`) is in its own list,
// so the view can draw it in its own colour; the usual (cut) list is what an unmarked line is in. Pure: no three.js.
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import { outlineOf } from "../operation/part.ts";
import type { Use } from "../operation/part.ts";
import { ringPoints } from "../math/ring.ts";

export function linePairs(s: Scene, skip: ReadonlySet<Ref>, only: Use = "cut"): number[] {
  const get = lookup(s);
  const out: number[] = [];
  for (const p of Object.values(s.parts)) {
    if (skip.has(p.ref) || p.origin === "world" || p.origin === "body") continue; // the world is drawn by ui/world.ts; the body's lines come from its mesh
    if ((p.kind === "line" || p.kind === "circle" ? p.use ?? "cut" : "cut") !== only) continue;
    const o = outlineOf(get, p);
    if (o.shape === "segment") out.push(...o.a, ...o.b);
    else if (o.shape === "polyline") for (let i = 0; i + 1 < o.pts.length; i++) out.push(...o.pts[i]!, ...o.pts[i + 1]!); // a drawn arc: the same black line as the others
    else if (o.shape === "circle") {
      const ring = ringPoints(o.center, o.radius, o.normal);
      for (let i = 0; i + 5 < ring.length; i += 3) out.push(ring[i]!, ring[i + 1]!, ring[i + 2]!, ring[i + 3]!, ring[i + 4]!, ring[i + 5]!);
    }
  }
  return out;
}

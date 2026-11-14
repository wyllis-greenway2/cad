// A body's edge and the sketch part behind it (`in_207`, `in_209`): the body is made from sketches that were hidden when they were used, and an edge of the body that lies where one of their curves or
// lines was says what that sketch part says (its radius, its centre, the constraints it carries) and can be changed through it. Found by where things are, nothing is stored.
import type { Vec3 } from "../math/vec.ts";
import { sub, dot, scale } from "../math/vec.ts";
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "./scene.ts";
import { figureRefs } from "./scene.ts";
import { normalOfPlane } from "./part.ts";
import type { Line } from "./part.ts";

export interface EdgeSource {
  /** the sketch part: a drawn line, an arc or a circle */
  ref: Ref;
  /** how far the edge is from the sketch part (along the way it was extruded): what to move the sketch part's annotations by */
  shift: Vec3;
  /** the middle of the curve, where the edge is (a curved edge only) */
  centre: Vec3 | null;
  /** the sketch's own middle point (a corner), for a curved edge */
  centreRef: Ref | null;
}

const near = (a: number, b: number, t = 2e-3) => Math.abs(a - b) <= t;

/** The centre of a circular body edge (the circle the kernel says it is part of); an edge that is any other curve has none (`in_344`). */
export function edgeCentre(scene: Scene, l: Line): Vec3 | null {
  return l.circle ? l.circle.center : null;
}

/** The sketch part (one an extrusion used) that lies where this edge of the body is, or null. */
export function sketchOfEdge(scene: Scene, edge: Ref): EdgeSource | null {
  const l = scene.parts[edge];
  if (l?.kind !== "line" || l.origin !== "body") return null;
  const [a, b] = [scene.parts[l.a], scene.parts[l.b]];
  if (a?.kind !== "corner" || b?.kind !== "corner") return null;
  const centre = edgeCentre(scene, l);
  const used = new Set<Ref>();
  for (const st of scene.steps) if (st.type === "extrude") for (const r of figureRefs(st)) { const p = scene.parts[r]; used.add(p?.kind === "line" && p.derived ? (`d/${r.split("@")[1] ?? ""}` as Ref) : r); }
  for (const ref of used) {
    const s = scene.parts[ref];
    if (!s || s.origin !== "drawn" || !s.plane) continue;
    const pl = scene.parts[s.plane];
    if (pl?.kind !== "plane") continue;
    const n = normalOfPlane(pl);
    if (centre && (s.kind === "circle" || (s.kind === "line" && s.center))) {
      const cs = scene.parts[s.center!];
      if (cs?.kind !== "corner") continue;
      const radius = s.kind === "circle" ? s.radius : Math.hypot(...sub((scene.parts[s.a] as { at: Vec3 }).at, cs.at));
      const edgeR = l.circle?.radius ?? Math.hypot(...sub(a.at, centre));
      const off = sub(centre, cs.at);
      const along = dot(off, n);
      if (near(edgeR, radius) && Math.hypot(...sub(off, scale(n, along))) < 2e-3 && Math.abs(dot(l.circle?.normal ?? n, n)) > 1 - 1e-5) return { ref, shift: scale(n, along), centre, centreRef: s.center! };
    } else if (!centre && s.kind === "line" && !s.center) {
      const [sa, sb] = [scene.parts[s.a], scene.parts[s.b]];
      if (sa?.kind !== "corner" || sb?.kind !== "corner") continue;
      const d = sub(sb.at, sa.at);
      const len = Math.hypot(...d);
      if (len < 1e-9) continue;
      const u = scale(d, 1 / len);
      const flat = (p: Vec3): { t: number; off: Vec3 } => { const q = sub(p, sa.at); const q2 = sub(q, scale(n, dot(q, n))); const t = dot(q2, u); return { t, off: sub(q2, scale(u, t)) }; };
      const [fa, fb] = [flat(a.at), flat(b.at)];
      if (Math.hypot(...fa.off) > 2e-3 || Math.hypot(...fb.off) > 2e-3 || Math.abs(dot(sub(b.at, a.at), n)) > 1e-3 || Math.hypot(...sub(b.at, a.at)) < 1e-6) continue;
      if (Math.min(fa.t, fb.t) < -2e-3 || Math.max(fa.t, fb.t) > len + 2e-3) continue; // (a whole side or a piece of it)
      return { ref, shift: scale(n, dot(sub(a.at, sa.at), n)), centre: null, centreRef: null };
    }
  }
  return null;
}

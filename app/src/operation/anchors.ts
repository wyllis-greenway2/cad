// Anchors (`in_308`, `q_body_constraints`): the geometry of the body that a sketch can be held to, read-only. Found from the scene when asked; nothing is stored.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Relation, EdgeAnchor } from "./scene.ts";
import { lookup } from "./scene.ts";
import type { Plane } from "./part.ts";
import { normalOfPlane, roundOf } from "./part.ts";

export interface AnchorRound { ref: Ref; center: Vec3; radius: number }

/** The circular edges of the body that lie in this plane (their circle faces the same way and its centre is on the plane): a circle or an arc drawn there can be tied to them. */
export function anchorRounds(scene: Scene, pl: Plane): AnchorRound[] {
  const get = lookup(scene);
  const n = normalOfPlane(pl);
  const out: AnchorRound[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "line" || p.origin !== "body" || !(p.circle || p.mid)) continue;
    const r = roundOf(get, p.ref);
    if (!r?.normal) continue;
    if (Math.abs(r.normal[0] * n[0] + r.normal[1] * n[1] + r.normal[2] * n[2]) < 1 - 1e-4) continue;
    const off = (r.center[0] - pl.at[0]) * n[0] + (r.center[1] - pl.at[1]) * n[1] + (r.center[2] - pl.at[2]) * n[2];
    if (Math.abs(off) > 1e-3) continue;
    out.push({ ref: p.ref, center: r.center, radius: r.radius });
  }
  return out;
}

const dot3 = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/** Where along its facing a point stands in the box of the body it is in (0 at the bottom, 1 at the top); with no body box, 0.5. */
function heightIn(scene: Scene, at: Vec3, normal: Vec3): number {
  const boxes = Object.values(scene.parts).filter((p): p is Extract<typeof p, { kind: "body" }> => p.kind === "body" && !!p.bbox);
  const inside = (b: { min: Vec3; max: Vec3 }) => [0, 1, 2].every((i) => at[i]! >= b.min[i]! - 1e-3 && at[i]! <= b.max[i]! + 1e-3);
  const box = boxes.find((b) => inside(b.bbox!))?.bbox ?? boxes[0]?.bbox;
  if (!box) return 0.5;
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((k): Vec3 => [k & 1 ? box.max[0] : box.min[0], k & 2 ? box.max[1] : box.min[1], k & 4 ? box.max[2] : box.min[2]]);
  const along = corners.map((c) => dot3(c, normal));
  const [lo, hi] = [Math.min(...along), Math.max(...along)];
  return hi - lo < 1e-9 ? 0.5 : (dot3(at, normal) - lo) / (hi - lo);
}

/** How a circular edge of the body looks now, or null if the part is not one. */
function describeEdge(scene: Scene, ref: Ref): EdgeAnchor | null {
  const r = roundOf(lookup(scene), ref);
  if (!r?.anchor || !r.normal) return null;
  return { center: [...r.center] as [number, number, number], radius: r.radius, normal: [...r.normal] as [number, number, number], t: heightIn(scene, r.center, r.normal) };
}

/** The relation with a description of each circular edge of the body it names, so that the edge can be found again (`in_309`). */
export function withAnchors(scene: Scene, rel: Relation): Relation {
  const anchors: Record<string, EdgeAnchor> = { ...(rel.anchors ?? {}) };
  for (const r of rel.parts) if (!(r in anchors)) { const a = describeEdge(scene, r); if (a) anchors[r] = a; }
  return Object.keys(anchors).length ? { ...rel, anchors } : rel;
}

/**
 * The relations whose circular edge of the body is gone (the body changed: a depth, a size, a chamfer) name the edge that looks most like it now: facing the same way, with its centre and radius changed least, and at the same
 * height in the body (`dec_stable_references`: names first, geometry as the fallback). Only a clear winner is taken; with none, or two that are alike, the relation is left pointing at nothing and is listed in `lost`.
 */
export function rebindAnchors(scene: Scene): { scene: Scene; lost: string[] } {
  if (!scene.relations.some((r) => r.anchors)) return { scene, lost: [] };
  const get = lookup(scene);
  const edges = Object.values(scene.parts).filter((p) => p.kind === "line" && p.origin === "body" && (p.circle || p.mid)).map((p) => ({ ref: p.ref, a: describeEdge(scene, p.ref) })).filter((e): e is { ref: Ref; a: EdgeAnchor } => !!e.a);
  const lost: string[] = [];
  const relations = scene.relations.map((rel) => {
    if (!rel.anchors) return rel;
    let parts = rel.parts;
    let anchors = rel.anchors;
    for (const [i, ref] of rel.parts.entries()) {
      const want = rel.anchors[ref];
      if (!want || get(ref)) continue; // (not a named edge, or still there)
      const scored = edges
        .filter((e) => Math.abs(dot3(e.a.normal, want.normal)) >= 1 - 1e-4)
        .map((e) => {
          const d = [e.a.center[0] - want.center[0], e.a.center[1] - want.center[1], e.a.center[2] - want.center[2]];
          const along = dot3(d, want.normal);
          const across = Math.hypot(d[0]! - along * want.normal[0], d[1]! - along * want.normal[1], d[2]! - along * want.normal[2]);
          return { ref: e.ref, a: e.a, score: across + Math.abs(e.a.radius - want.radius) + 5 * Math.abs(e.a.t - want.t) };
        })
        .sort((x, y) => x.score - y.score);
      const [best, next] = scored;
      const reach = 0.6 * want.radius + 1;
      if (!best || best.score > reach || (next && next.score - best.score < 0.5)) { lost.push(rel.id); continue; }
      parts = parts.map((q, k) => (k === i ? best.ref : q));
      const { [ref]: _old, ...rest } = anchors;
      anchors = { ...rest, [best.ref]: want }; // (the description stays the one it was made with: the next change is judged against it)
    }
    return parts === rel.parts ? rel : { ...rel, parts, anchors };
  });
  return { scene: relations.some((r, i) => r !== scene.relations[i]) ? { ...scene, relations } : scene, lost };
}

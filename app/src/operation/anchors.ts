// Anchors (`in_308`, `q_body_constraints`): the geometry of the body that a sketch can be held to, read-only. Found from the scene when asked; nothing is stored.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Relation, EdgeAnchor } from "./scene.ts";
import { lookup } from "./scene.ts";
import type { Plane } from "./part.ts";
import { normalOfPlane, roundOf } from "./part.ts";

export interface AnchorRound { ref: Ref; center: Vec3; radius: number }
export interface AnchorLine { ref: Ref; a: Vec3; b: Vec3 }
export interface AnchorCorner { ref: Ref; at: Vec3 }

const onPlaneAt = (pl: Plane, n: Vec3, p: Vec3): boolean => Math.abs((p[0] - pl.at[0]) * n[0] + (p[1] - pl.at[1]) * n[1] + (p[2] - pl.at[2]) * n[2]) <= 1e-3;

/** The straight edges of the body that lie in this plane (both ends on it): a line drawn there can be level with them, parallel, square, on them (`in_310`). */
export function anchorLines(scene: Scene, pl: Plane): AnchorLine[] {
  const get = lookup(scene);
  const n = normalOfPlane(pl);
  const out: AnchorLine[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "line" || p.origin !== "body" || p.circle || p.mid) continue;
    const [a, b] = [get(p.a), get(p.b)];
    if (a?.kind !== "corner" || b?.kind !== "corner" || !onPlaneAt(pl, n, a.at) || !onPlaneAt(pl, n, b.at)) continue;
    out.push({ ref: p.ref, a: a.at, b: b.at });
  }
  return out;
}

/** The corners of the body that lie in this plane: a point or a curve drawn there can be put on them. */
export function anchorCorners(scene: Scene, pl: Plane): AnchorCorner[] {
  const n = normalOfPlane(pl);
  return Object.values(scene.parts).flatMap((p) => (p.kind === "corner" && p.origin === "body" && onPlaneAt(pl, n, p.at) ? [{ ref: p.ref, at: p.at }] : []));
}

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

/** How a circular edge, a straight edge or a corner of the body looks now, or null if the part is none of these. `axis`: the facing of the sketch's plane, for a straight edge and a corner. */
function describeEdge(scene: Scene, ref: Ref, axis: Vec3 | null): EdgeAnchor | null {
  const get = lookup(scene);
  const p = get(ref);
  if (p?.origin !== "body") return null;
  const r = roundOf(get, ref);
  if (r?.anchor && r.normal) return { center: [...r.center] as [number, number, number], radius: r.radius, normal: [...r.normal] as [number, number, number], t: heightIn(scene, r.center, r.normal) };
  if (!axis) return null;
  const ax = [...axis] as [number, number, number];
  if (p.kind === "corner") return { kind: "point", center: [...p.at] as [number, number, number], radius: 0, normal: ax, t: heightIn(scene, p.at, axis), axis: ax };
  if (p.kind === "line" && !p.circle && !p.mid) {
    const [a, b] = [get(p.a), get(p.b)];
    if (a?.kind !== "corner" || b?.kind !== "corner") return null;
    const d: Vec3 = [b.at[0] - a.at[0], b.at[1] - a.at[1], b.at[2] - a.at[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-9) return null;
    const mid: [number, number, number] = [(a.at[0] + b.at[0]) / 2, (a.at[1] + b.at[1]) / 2, (a.at[2] + b.at[2]) / 2];
    return { kind: "line", center: mid, radius: len / 2, normal: [d[0] / len, d[1] / len, d[2] / len], t: heightIn(scene, mid, axis), axis: ax };
  }
  return null;
}

/** The relation with a description of each part of the body it names (a circular edge, a straight edge, a corner), so that the part can be found again (`in_309`, `in_310`). */
export function withAnchors(scene: Scene, rel: Relation): Relation {
  const get = lookup(scene);
  const drawn = rel.parts.map((r) => get(r)).find((p) => p?.origin === "drawn" && p.kind !== "plane" && "plane" in p && p.plane);
  const pl = drawn && "plane" in drawn && drawn.plane ? get(drawn.plane) : undefined;
  const axis = pl?.kind === "plane" ? normalOfPlane(pl) : null; // (the facing of the sketch the relation is in)
  const anchors: Record<string, EdgeAnchor> = { ...(rel.anchors ?? {}) };
  for (const r of rel.parts) if (!(r in anchors)) { const a = describeEdge(scene, r, axis); if (a) anchors[r] = a; }
  return Object.keys(anchors).length ? { ...rel, anchors } : rel;
}

/**
 * The relations whose part of the body is gone (the body changed: a depth, a size, a chamfer) name the one that looks most like it now (`dec_stable_references`: names first, geometry as the fallback). A circular edge: facing the same way,
 * its centre and radius changed least, at the same height in the body; a straight edge: parallel, its middle moved least across the sketch's plane, its length changed least, at the same height; a corner: moved least across the plane, at the
 * same height. Only a clear winner is taken; with none, or two that are alike, the relation is left pointing at nothing and is listed in `lost`.
 */
export function rebindAnchors(scene: Scene): { scene: Scene; lost: string[] } {
  if (!scene.relations.some((r) => r.anchors)) return { scene, lost: [] };
  const get = lookup(scene);
  const kindOf = (a: EdgeAnchor) => a.kind ?? "circle";
  const now: { ref: Ref; kind: string; a: EdgeAnchor }[] = [];
  const seen = { circle: false, line: false, point: false };
  const lazy = (kind: "circle" | "line" | "point") => {
    if (seen[kind]) return;
    seen[kind] = true;
    for (const p of Object.values(scene.parts)) {
      if (p.origin !== "body") continue;
      const isCircle = p.kind === "line" && !!(p.circle || p.mid);
      const isLine = p.kind === "line" && !isCircle;
      if (kind === "circle" ? !isCircle : kind === "line" ? !isLine : p.kind !== "corner") continue;
      const a = describeEdge(scene, p.ref, [0, 0, 1]); // (the axis is only the stand-in for the height: it is replaced below by the one each relation kept)
      if (a) now.push({ ref: p.ref, kind, a });
    }
  };
  const lost: string[] = [];
  const relations = scene.relations.map((rel) => {
    if (!rel.anchors) return rel;
    let parts = rel.parts;
    let anchors = rel.anchors;
    for (const [i, ref] of rel.parts.entries()) {
      const want = rel.anchors[ref];
      if (!want || get(ref)) continue; // (not a named part of the body, or still there)
      const kind = kindOf(want) as "circle" | "line" | "point";
      lazy(kind);
      const axis = (want.axis ?? want.normal) as Vec3;
      const scored = now
        .filter((e) => e.kind === kind)
        .flatMap((e) => {
          const cand = kind === "circle" ? e.a : describeEdge(scene, e.ref, axis);
          if (!cand) return [];
          if (kind !== "point" && Math.abs(dot3(cand.normal, want.normal)) < 1 - 1e-4) return []; // (not facing / running the same way)
          const d = [cand.center[0] - want.center[0], cand.center[1] - want.center[1], cand.center[2] - want.center[2]];
          const ax = (kind === "circle" ? want.normal : axis) as readonly number[];
          const along = dot3(d, ax);
          const across = Math.hypot(d[0]! - along * ax[0]!, d[1]! - along * ax[1]!, d[2]! - along * ax[2]!);
          return [{ ref: e.ref, score: across + Math.abs(cand.radius - want.radius) + 5 * Math.abs(cand.t - want.t) }];
        })
        .sort((x, y) => x.score - y.score);
      const [best, next] = scored;
      const reach = kind === "point" ? 3 : 0.6 * want.radius + 1;
      if (!best || best.score > reach || (next && next.score - best.score < 0.5)) { lost.push(rel.id); continue; }
      parts = parts.map((q, k) => (k === i ? best.ref : q));
      const { [ref]: _old, ...rest } = anchors;
      anchors = { ...rest, [best.ref]: want }; // (the description stays the one it was made with: the next change is judged against it)
    }
    return parts === rel.parts ? rel : { ...rel, parts, anchors };
  });
  return { scene: relations.some((r, i) => r !== scene.relations[i]) ? { ...scene, relations } : scene, lost };
}

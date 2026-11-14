// Anchors (`in_308`, `q_body_constraints`): the geometry of the body that a sketch can be held to, read-only. Found from the scene when asked; nothing is stored.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Relation, EdgeAnchor } from "./scene.ts";
import { lookup } from "./scene.ts";
import type { Plane } from "./part.ts";
import { normalOfPlane, roundOf, traceOfFace } from "./part.ts";

export interface AnchorRound { ref: Ref; center: Vec3; radius: number; /** how far the edge is from the plane, along its facing (0: in it) */ offset: number }
export interface AnchorLine { ref: Ref; a: Vec3; b: Vec3; offset: number }
export interface AnchorCorner { ref: Ref; at: Vec3; offset: number }

const along = (pl: Plane, n: Vec3, p: Vec3): number => (p[0] - pl.at[0]) * n[0] + (p[1] - pl.at[1]) * n[1] + (p[2] - pl.at[2]) * n[2];
/** The point as it falls on the plane (straight down its facing). */
const onto = (pl: Plane, n: Vec3, p: Vec3): Vec3 => { const d = along(pl, n, p); return [p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d]; };
/** Of several that fall on one place, the one nearest the plane (`offset`). */
function nearest<T extends { offset: number }>(items: T[], same: (a: T, b: T) => boolean): T[] {
  const out: T[] = [];
  for (const it of [...items].sort((x, y) => Math.abs(x.offset) - Math.abs(y.offset))) if (!out.some((o) => same(o, it))) out.push(it);
  return out;
}
/** Which of the body's parts to offer: `seen` says whether a point of the model can be seen (`in_312`: an edge that is not in the plane and cannot be seen is not offered by proximity; it can still be chosen by selecting it). */
export interface AnchorOpts { seen?: (p: Vec3) => boolean }
const near3 = (a: Vec3, b: Vec3, t = 1e-3): boolean => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= t;

/**
 * The straight edges of the body as they fall on this plane (`in_310`, and not only the ones in it, `in_311`): a line drawn there can be level with them, parallel, square, on them. An edge that runs along the plane's
 * facing falls on a point and is left out; of two that fall on one line (the top and the bottom of a wall) the nearer to the plane is the one. `a` and `b` are the ends as they fall on the plane.
 */
export function anchorLines(scene: Scene, pl: Plane, opts: AnchorOpts = {}): AnchorLine[] {
  const get = lookup(scene);
  const n = normalOfPlane(pl);
  const found: AnchorLine[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "line" || p.origin !== "body" || p.circle || p.mid) continue;
    const [a, b] = [get(p.a), get(p.b)];
    if (a?.kind !== "corner" || b?.kind !== "corner") continue;
    const [pa, pb] = [onto(pl, n, a.at), onto(pl, n, b.at)];
    if (Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]) < 1e-6) continue;
    const off = Math.max(Math.abs(along(pl, n, a.at)), Math.abs(along(pl, n, b.at)));
    if (off > 1e-3 && opts.seen && ![a.at, b.at, [(a.at[0] + b.at[0]) / 2, (a.at[1] + b.at[1]) / 2, (a.at[2] + b.at[2]) / 2] as Vec3].some(opts.seen)) continue; // (out of sight)
    found.push({ ref: p.ref, a: pa, b: pb, offset: Math.max(Math.abs(along(pl, n, a.at)), Math.abs(along(pl, n, b.at))) });
  }
  // the flat faces of the body that cut the plane: the line where each does (`in_313`); where an edge is that line already, the edge stays
  for (const p of Object.values(scene.parts)) {
    const t = p.kind === "plane" && p.origin === "body" ? traceOfFace(p, pl) : null;
    if (t) found.push({ ref: p.ref, a: t[0], b: t[1], offset: 0 });
  }
  return nearest(found, (x, y) => (near3(x.a, y.a) && near3(x.b, y.b)) || (near3(x.a, y.b) && near3(x.b, y.a)));
}

/** The corners of the body as they fall on this plane, the nearer to the plane where two fall on one place: a point or a curve drawn there can be put on them. */
export function anchorCorners(scene: Scene, pl: Plane, opts: AnchorOpts = {}): AnchorCorner[] {
  const n = normalOfPlane(pl);
  const found = Object.values(scene.parts).flatMap((p): AnchorCorner[] => (p.kind === "corner" && p.origin === "body" && !(Math.abs(along(pl, n, p.at)) > 1e-3 && opts.seen && !opts.seen(p.at)) ? [{ ref: p.ref, at: onto(pl, n, p.at), offset: along(pl, n, p.at) }] : []));
  return nearest(found, (x, y) => near3(x.at, y.at));
}

/** The circular edges of the body as they fall on this plane (their circle faces the same way as the plane; its centre falls on the plane): a circle or an arc drawn there can be tied to them. */
export function anchorRounds(scene: Scene, pl: Plane, opts: AnchorOpts = {}): AnchorRound[] {
  const get = lookup(scene);
  const n = normalOfPlane(pl);
  const found: AnchorRound[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "line" || p.origin !== "body" || !p.circle) continue; // (an edge that is another curve is no round, `in_344`)
    const r = roundOf(get, p.ref);
    if (!r?.normal || Math.abs(r.normal[0] * n[0] + r.normal[1] * n[1] + r.normal[2] * n[2]) < 1 - 1e-4) continue;
    const offset = along(pl, n, r.center);
    if (Math.abs(offset) > 1e-3 && opts.seen) {
      const [a, b] = [get(p.a), get(p.b)];
      const samples: Vec3[] = [...(a?.kind === "corner" ? [a.at] : []), ...(b?.kind === "corner" ? [b.at] : []), ...(p.mid ? [p.mid] : [])]; // (the ends and the middle of the edge)
      if (p.circle) { // (a rim that is a circle of its own: eight points round it)
        const c = p.circle;
        const ref0: Vec3 = Math.abs(c.normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        const u0: Vec3 = [c.normal[1] * ref0[2] - c.normal[2] * ref0[1], c.normal[2] * ref0[0] - c.normal[0] * ref0[2], c.normal[0] * ref0[1] - c.normal[1] * ref0[0]];
        const ul = Math.hypot(u0[0], u0[1], u0[2]) || 1;
        const u: Vec3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
        const v: Vec3 = [c.normal[1] * u[2] - c.normal[2] * u[1], c.normal[2] * u[0] - c.normal[0] * u[2], c.normal[0] * u[1] - c.normal[1] * u[0]];
        for (let k = 0; k < 8; k++) { const t = (k * Math.PI) / 4; samples.push([c.center[0] + c.radius * (Math.cos(t) * u[0] + Math.sin(t) * v[0]), c.center[1] + c.radius * (Math.cos(t) * u[1] + Math.sin(t) * v[1]), c.center[2] + c.radius * (Math.cos(t) * u[2] + Math.sin(t) * v[2])]); }
      }
      if (!samples.some(opts.seen)) continue; // (out of sight)
    }
    found.push({ ref: p.ref, center: onto(pl, n, r.center), radius: r.radius, offset });
  }
  // the round faces of the body (a post, a hole, a piece of one): the circle each cuts across its axis (`in_313`). The plane cuts the face when it is within the face's own extent along the axis (offset 0); else the circle is only
  // where the face falls on it, as far from the plane as the nearer end of the face, and it must be seen to be offered (`in_312`)
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "plane" || p.origin !== "body" || !p.mesh || p.mesh.length < 9) continue;
    const r = roundOf(get, p.ref);
    if (!r?.normal || Math.abs(r.normal[0] * n[0] + r.normal[1] * n[1] + r.normal[2] * n[2]) < 1 - 1e-4) continue;
    const m = p.mesh;
    let [lo, hi] = [Infinity, -Infinity];
    for (let i = 0; i + 2 < m.length; i += 3) { const d = along(pl, n, [m[i]!, m[i + 1]!, m[i + 2]!]); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    const offset = lo <= 1e-3 && hi >= -1e-3 ? 0 : lo > 0 ? lo : hi;
    if (Math.abs(offset) > 1e-3 && opts.seen) {
      const samples: Vec3[] = [];
      const step = Math.max(3, Math.floor(m.length / 3 / 12) * 3); // (about twelve vertices of the face)
      for (let i = 0; i + 2 < m.length; i += step) samples.push([m[i]!, m[i + 1]!, m[i + 2]!]);
      if (!samples.some(opts.seen)) continue; // (out of sight)
    }
    found.push({ ref: p.ref, center: onto(pl, n, r.center), radius: r.radius, offset });
  }
  return nearest(found, (x, y) => near3(x.center, y.center) && Math.abs(x.radius - y.radius) <= 1e-3);
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
  if (p.kind === "plane" && p.mesh && p.mesh.length >= 9 && !p.curved && !p.round && !p.rounded) { // a flat face: where it is and which way it faces (`in_313`)
    const m = p.mesh;
    let [x, y, z, k] = [0, 0, 0, 0];
    for (let i = 0; i + 2 < m.length; i += 3) { x += m[i]!; y += m[i + 1]!; z += m[i + 2]!; k++; }
    const centre: [number, number, number] = [x / k, y / k, z / k];
    const nf = normalOfPlane(p);
    return { kind: "face", center: centre, radius: 0, normal: [...nf] as [number, number, number], t: heightIn(scene, centre, nf) };
  }
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
  const seen = { circle: false, line: false, point: false, face: false };
  const lazy = (kind: "circle" | "line" | "point" | "face") => {
    if (seen[kind]) return;
    seen[kind] = true;
    for (const p of Object.values(scene.parts)) {
      if (p.origin !== "body") continue;
      const isCircle = (p.kind === "line" && !!p.circle) || (p.kind === "plane" && !!roundOf(get, p.ref)); // (a rim, or a round face)
      const isLine = p.kind === "line" && !p.circle && !p.mid; // (a straight edge: another curve is neither, `in_344`)
      const isFace = p.kind === "plane" && !isCircle && !!p.mesh && !p.curved && !p.round && !p.rounded;
      if (kind === "circle" ? !isCircle : kind === "line" ? !isLine : kind === "face" ? !isFace : p.kind !== "corner") continue;
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
      const kind = kindOf(want) as "circle" | "line" | "point" | "face";
      lazy(kind);
      const axis = (want.axis ?? want.normal) as Vec3;
      const scored = now
        .filter((e) => e.kind === kind)
        .flatMap((e) => {
          const cand = kind === "circle" || kind === "face" ? e.a : describeEdge(scene, e.ref, axis);
          if (!cand) return [];
          // not facing / running the same way (a face must face the same way, not the opposite one); a wall or an edge may turn a little when a size changes (a tangent line between two circles), so up to eight degrees, with the turn counted against it
          const cosine = dot3(cand.normal, want.normal);
          const loose = kind === "face" || kind === "line";
          if (kind === "face" ? cosine < 0.99 : kind === "line" ? Math.abs(cosine) < 0.99 : kind !== "point" && Math.abs(cosine) < 1 - 1e-4) return [];
          const turn = loose ? 30 * Math.acos(Math.min(1, Math.abs(cosine))) : 0;
          const d = [cand.center[0] - want.center[0], cand.center[1] - want.center[1], cand.center[2] - want.center[2]];
          const ax = (kind === "circle" || kind === "face" ? want.normal : axis) as readonly number[];
          const along = dot3(d, ax);
          const across = Math.hypot(d[0]! - along * ax[0]!, d[1]! - along * ax[1]!, d[2]! - along * ax[2]!);
          return [{ ref: e.ref, score: (kind === "face" ? Math.abs(along) : across + Math.abs(cand.radius - want.radius)) + 5 * Math.abs(cand.t - want.t) + turn }]; // (a face is judged by how far along its facing it moved, not by how it grew)
        })
        .sort((x, y) => x.score - y.score);
      const [best, next] = scored;
      const reach = kind === "point" || kind === "face" ? 3 : 0.6 * want.radius + 1;
      if (!best || best.score > reach || (next && next.score - best.score < 0.5)) { lost.push(rel.id); continue; }
      parts = parts.map((q, k) => (k === i ? best.ref : q));
      const { [ref]: _old, ...rest } = anchors;
      anchors = { ...rest, [best.ref]: want }; // (the description stays the one it was made with: the next change is judged against it)
    }
    return parts === rel.parts ? rel : { ...rel, parts, anchors };
  });
  return { scene: relations.some((r, i) => r !== scene.relations[i]) ? { ...scene, relations } : scene, lost };
}

/**
 * The command with each relation it adds already described (`withAnchors`): what is saved is the command, and a file opened in the browser is replayed before the kernel has answered, when the body is not there to describe;
 * the description made when the relation was, is in the command (`in_316`).
 */
export function describedCommand<C extends { type: string }>(scene: Scene, c: C): C {
  const cmd = c as unknown as { type: string; relation?: Relation; commands?: { type: string }[] };
  if (cmd.type === "addRelation" && cmd.relation) return { ...c, relation: withAnchors(scene, cmd.relation) } as C;
  if (cmd.type === "batch" && cmd.commands) return { ...c, commands: cmd.commands.map((x) => describedCommand(scene, x)) } as C;
  return c;
}

// The one picking function (`dec_clean_engine_design` section 4): what is under the pointer, as an ordered list of candidates.
// Order: corners, then lines (and circles), then faces and planes (a shape before the face under it); inside a class nearest first
// (pixels for points and lines, along the ray for surfaces). Hover is the first candidate; repeated clicks cycle (`selection.click`).
// Drawn, body and world parts are treated alike: nothing here asks where a part came from (`in_088`).
import { settings } from "../shared/settings.ts";
import type { Ref } from "../shared/ref.ts";
import type { Kind, Part, PointerView, Plane } from "../operation/part.ts";
import type { Camera } from "./camera.ts";
import { projector } from "./camera.ts";
import { hitPart, depthOf, outlineOf, normalOfPlane } from "../operation/part.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import { consumed } from "../operation/ownership.ts";
import { inHiddenBody } from "./objects.ts";
import { buildTree } from "../operation/collide.ts";
import type { Tree } from "../operation/collide.ts";

export interface Candidate { ref: Ref; kind: Kind; rank: number; /** pixels (points, lines) or distance along the ray (surfaces) */ score: number }
export interface PickOptions {
  /** how close (pixels) a pointer must be to a corner / to a line or circle; the look and input values decide, not this file */
  pointTol: number;
  lineTol: number;
  /** the world plane that is on: the other two are not there to point at (`in_190`) */
  world?: Ref;
  /** a plane being sketched on, looked at straight: whatever lies between it and the camera is not there to point at (`in_194`). `side` is the side of the plane the camera is on (+1 along its normal) */
  inFront?: { at: Vec3; n: Vec3; side: 1 | -1 };
  /** the middle points shown on selected curved edges of the body: where they are drawn, and the corner of the sketch each is (`in_214`) */
  centres?: { at: Vec3; ref: Ref }[];
  /** the cross section (`in_395`): what lies on the side of the plane its normal points to is not drawn, so it is not there to point at */
  clips?: { at: Vec3; n: Vec3 }[];
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
  // a plane being sketched on: what lies wholly between it and the camera is not there (`in_194`); a surface is hidden where it is nearer than the plane along the ray
  const f = opts.inFront;
  const ahead = (q: Vec3): number => dot(sub(q, f!.at), f!.n) * f!.side;
  const tPlane = f && pv.ray ? (() => { const den = dot(f.n, pv.ray!.d); return Math.abs(den) < 1e-9 ? null : dot(f.n, sub(f.at, pv.ray!.o)) / den; })() : null;
  const cut = (q: Vec3): boolean => !!opts.clips && opts.clips.some((c) => dot(sub(q, c.at), c.n) > 1e-3); // (any sheet that cuts: what lies on the side cut away is not there, `in_459`)
  const before = (p: Part): boolean => {
    if (opts.clips?.length && p.origin !== "world") { if (p.kind === "corner" && cut(p.at)) return true; if (p.kind === "line") { const [a, b] = [scene.parts[p.a], scene.parts[p.b]]; if (a?.kind === "corner" && b?.kind === "corner" && cut(a.at) && cut(b.at)) return true; } }
    if (!f || p.origin === "world") return false;
    if (p.kind === "corner") return ahead(p.at) > 1e-3;
    if (p.kind === "line") { const [a, b] = [scene.parts[p.a], scene.parts[p.b]]; return a?.kind === "corner" && b?.kind === "corner" && ahead(a.at) > 1e-3 && ahead(b.at) > 1e-3; }
    return false;
  };
  const parts = Object.values(scene.parts).filter((p) => !before(p) && !inHiddenBody(scene, p) && !(opts.world && p.origin === "world" && p.kind === "plane" && p.infinite && p.ref !== opts.world) && !used.has(p.ref) && !(p.kind === "plane" && !!p.section && !!p.hidden) && !((p.kind === "line" || p.kind === "corner") && p.derived));
  // surfaces first: only the nearest one counts, plus anything flush with it (a shape drawn on a face, a pane lying in a face); things behind it are hidden
  const surfaces: { p: Part; t: number }[] = [];
  for (const p of parts) {
    if (RANK[p.kind] !== 2) continue;
    const t = depthOf(get, p, pv);
    if (t !== null && opts.clips?.length && p.origin !== "world" && pv.ray && cut(add(pv.ray.o, scale(pv.ray.d, t)))) continue; // (the part of a surface that is cut away cannot be hit)
    if (t !== null && !(tPlane !== null && p.origin !== "world" && p.origin !== "drawn" && t < tPlane - 1e-3)) surfaces.push({ p, t });
  }
  // an infinite world plane is only the background, whatever lies in front of what: it is what a click lands on only when there is no other surface under the pointer, even if the
  // plane is between the eye and a model (so a figure drawn on it is not always "overlapping" it, and a model seen through a plane is clicked, not the plane)
  const isBackground = (p: Part) => (p.origin === "world" && p.kind === "plane" && !!p.infinite) || false; // (a sheet that is not invisible is a face like any other, `in_459`)
  const real = surfaces.filter((x) => !isBackground(x.p));
  const tmin = real.reduce((m, x) => Math.min(m, x.t), Infinity);
  const flush = (t: number) => t <= tmin + 1e-3 + 1e-6 * tmin;
  let out: Candidate[] = real.filter((x) => flush(x.t)).map((x) => ({ ref: x.p.ref, kind: x.p.kind, rank: 2, score: x.t }));
  // a sheet lies where its own cut face is: over the part, the cut face is what is under the pointer (the sheet is reached past the part's edge, `in_681`)
  if (out.some((c) => { const q = scene.parts[c.ref]; return q?.kind === "plane" && !!q.cap; })) out = out.filter((c) => { const q = scene.parts[c.ref]; return !(q?.kind === "plane" && !!q.section); });
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
      if (t !== null && opts.clips?.length && cut(add(ray.o, scale(ray.d, t)))) continue; // (a face cut away on the screen hides nothing behind it: the inside edges of a body opened by a cross section are there to point at)
      if (t !== null && t < tp - 1e-3 - 1.5e-3 * tp && !(tPlane !== null && t < tPlane - 1e-3)) return false; // (a face between the camera and the plane being sketched on hides nothing) // (the mesh of a curved face lies a hair inside the true surface, so an edge between two curved faces must not be taken for hidden behind them)
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
  for (const c of opts.centres ?? []) {
    const [x, y] = pv.project(c.at);
    const d = Math.hypot(x - pv.x, y - pv.y);
    if (d <= opts.pointTol && scene.parts[c.ref]) out.push({ ref: c.ref, kind: "corner", rank: 0, score: d });
  }
  if (!out.length) out.push(...background);
  const order = (c: Candidate) => ORIGIN_ORDER[scene.parts[c.ref]!.origin];
  // corners and lines are ordered by how near the pointer is, a corner with a little advantage (you aim at a corner on purpose), not corners first however far they are: pointing at a circle's edge
  // a few pixels from its centre point picks the edge, not the point (`in_166`)
  const near = (c: Candidate) => c.score - (c.rank === 0 ? settings.pick.cornerBonusPx : 0);
  return out.sort((a, b) => (a.rank === 2 || b.rank === 2 ? a.rank - b.rank : 0) || (a.rank === 2 ? order(a) - order(b) || a.score - b.score : near(a) - near(b) || a.rank - b.rank) || (a.ref < b.ref ? -1 : 1));
}
export const refsAt = (scene: Scene, pv: PointerView, opts?: PickOptions): Ref[] => candidatesAt(scene, pv, opts).map((c) => c.ref);
/** The part to highlight on hover. */
export const hoverAt = (scene: Scene, pv: PointerView, opts?: PickOptions): Ref | undefined => candidatesAt(scene, pv, opts)[0]?.ref;

const seenMemo = new WeakMap<Scene, Map<string, boolean>>();

/** The faces of the bodies as one tree of boxes (found once for a scene), for asking whether anything lies on a ray; the faces that have no mesh are kept apart and asked one by one. */
const faceTrees = new WeakMap<Scene, { tree: Tree | null; loose: Part[] }>();
/** The last tree made, kept for the meshes it was made of: a scene changes with every sketch drawn, the faces of its bodies do not (the same mesh arrays), and a tree of thousands of triangles is not made again for a new corner. */
let lastTree: { meshes: readonly (readonly number[])[]; tree: Tree | null } | null = null;
function facesOf(scene: Scene): { tree: Tree | null; loose: Part[] } {
  let got = faceTrees.get(scene);
  if (got) return got;
  const meshes: (readonly number[])[] = [], loose: Part[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "plane" || p.origin !== "body") continue;
    if (p.mesh && p.mesh.length) meshes.push(p.mesh); else loose.push(p);
  }
  let tree: Tree | null;
  if (lastTree && lastTree.meshes.length === meshes.length && lastTree.meshes.every((m, i) => m === meshes[i])) tree = lastTree.tree;
  else {
    const tris: number[] = [];
    for (const m of meshes) for (let i = 0; i < m.length; i++) tris.push(m[i]!);
    tree = tris.length ? buildTree(tris) : null;
    lastTree = { meshes, tree };
  }
  got = { tree, loose };
  faceTrees.set(scene, got);
  return got;
}
/** Is there a triangle on the ray at a distance from `lo` (kept) up to `hi` (not kept)? The same test of a ray and a triangle as `rayMesh`; the boxes of the tree keep it to the few triangles near the ray (a model of gears has thousands, and this is asked for every corner of it). */
function anyOnRay(tree: Tree, o: Vec3, d: Vec3, lo: number, hi: number): boolean {
  if (!tree.nodes.length) return false;
  const inv = [1 / d[0], 1 / d[1], 1 / d[2]];
  const stack = [0];
  const t = tree.tris;
  while (stack.length) {
    const nd = tree.nodes[stack.pop()!]!;
    let [t0, t1] = [Math.max(lo, 0), hi];
    let miss = false;
    for (let k = 0; k < 3 && !miss; k++) {
      if (Math.abs(d[k]!) < 1e-12) { if (o[k]! < nd.lo[k]! - 1e-9 || o[k]! > nd.hi[k]! + 1e-9) miss = true; continue; }
      let [a, c] = [(nd.lo[k]! - 1e-9 - o[k]!) * inv[k]!, (nd.hi[k]! + 1e-9 - o[k]!) * inv[k]!];
      if (a > c) [a, c] = [c, a];
      if (a > t0) t0 = a;
      if (c < t1) t1 = c;
      if (t0 > t1) miss = true;
    }
    if (miss) continue;
    if (nd.l >= 0) { stack.push(nd.l, nd.r); continue; }
    for (let j = nd.from; j < nd.to; j++) {
      const i = 9 * tree.order[j]!;
      const [ax, ay, az] = [t[i]!, t[i + 1]!, t[i + 2]!];
      const [e1x, e1y, e1z, e2x, e2y, e2z] = [t[i + 3]! - ax, t[i + 4]! - ay, t[i + 5]! - az, t[i + 6]! - ax, t[i + 7]! - ay, t[i + 8]! - az];
      const [hx, hy, hz] = [d[1] * e2z - d[2] * e2y, d[2] * e2x - d[0] * e2z, d[0] * e2y - d[1] * e2x];
      const det = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(det) < 1e-12) continue;
      const f = 1 / det;
      const [sx, sy, sz] = [o[0] - ax, o[1] - ay, o[2] - az];
      const u = f * (sx * hx + sy * hy + sz * hz);
      if (u < 0 || u > 1) continue;
      const [qx, qy, qz] = [sy * e1z - sz * e1y, sz * e1x - sx * e1z, sx * e1y - sy * e1x];
      const v = f * (d[0] * qx + d[1] * qy + d[2] * qz);
      if (v < 0 || u + v > 1) continue;
      const hit = f * (e2x * qx + e2y * qy + e2z * qz);
      if (hit > 1e-9 && hit >= lo && hit < hi) return true;
    }
  }
  return false;
}
/**
 * Whether a point of the model can be seen from the eye of this view: no face of the body is between it and the eye (the mesh of a curved face lies a hair inside the true surface, so a point between two curved faces is not
 * taken for hidden behind them; a face between the eye and the plane being sketched on hides nothing, as in `candidatesAt`, `in_194`). Kept for the same scene and the same eye, so asking again for the same point is free (`in_312`).
 * The faces are one tree of boxes for the scene (`in_969`): drawing round gears asked this for every one of their thousand corners, each against every face.
 */
export function visibleFrom(scene: Scene, pv: PointerView, point: Vec3, plane?: { at: Vec3; n: Vec3 }): boolean {
  if (!pv.rayAt) return true;
  const { tree, loose } = facesOf(scene);
  if (!tree && !loose.length) return true;
  const [x, y] = pv.project(point);
  const ray = pv.rayAt(x, y);
  const eye = pv.straight ? [ray.d[0], ray.d[1], ray.d[2]] : [ray.o[0], ray.o[1], ray.o[2]]; // (parallel rays: the direction is the eye)
  const key = `${eye.map((v) => Math.round(v * 1e3)).join(",")}|${point.map((v) => Math.round(v * 1e3)).join(",")}|${plane ? `${plane.at.join(",")}/${plane.n.join(",")}` : ""}`;
  const memo = seenMemo.get(scene) ?? new Map<string, boolean>();
  seenMemo.set(scene, memo);
  const known = memo.get(key);
  if (known !== undefined) return known;
  const tPlane = plane ? (() => { const den = dot(plane.n, ray.d); return Math.abs(den) < 1e-9 ? null : dot(plane.n, sub(plane.at, ray.o)) / den; })() : null;
  const tp = dot(sub(point, ray.o), ray.d);
  const hi = tp - 1e-3 - 1.5e-3 * tp, lo = tPlane !== null ? tPlane - 1e-3 : -Infinity; // (a face nearer than the plane being sketched on hides nothing)
  let seen = !(tree && anyOnRay(tree, ray.o, ray.d, lo, hi));
  if (seen && loose.length) {
    const get = lookup(scene);
    for (const o of loose) {
      const t = depthOf(get, o, { ...pv, ray });
      if (t !== null && t < hi && !(tPlane !== null && t < lo)) { seen = false; break; }
    }
  }
  memo.set(key, seen);
  return seen;
}

/** Whether a point of the model can be seen from a camera while sketching on a plane: for the suggestions, which do not offer a part of the body that is out of sight (`in_312`). */
export const seenIn = (cam: Camera, sc: Scene, size: { w: number; h: number }) => (plane: Plane, p: Vec3): boolean => visibleFrom(sc, projector(cam, size.w, size.h).view(0, 0), p, { at: plane.at, n: normalOfPlane(plane) });

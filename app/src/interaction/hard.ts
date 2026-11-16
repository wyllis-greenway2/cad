// Hard bodies (`dec_hard_bodies`, `in_473`): which bodies are hard, their triangles, and how much of a motion by hand a group of bodies may make before a hard one of them meets another.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Rigid } from "../operation/frames.ts";
import type { Op } from "./operations.ts";
import { bodyMotion, valueOf, extrudeCap } from "./operations.ts";
import { axisOf, advanceOf } from "./revolve.ts";
import { sweepCarry } from "./sweep.ts";
import { decodeEdge } from "../compiler/body.ts";
import { laterMotion, applyPoint } from "../operation/frames.ts";
import { normalOfPlane } from "../operation/part.ts";
import { patternValues } from "./pattern.ts";
import { mirrorPlane } from "./mirror.ts";
import { placements } from "../operation/repeat.ts";
import { about, aboutDir } from "../math/rotation.ts";
import { NONE } from "../operation/frames.ts";
import { buildTree, collides, collidesMoving, moved, partOf, freePart, contactNormals } from "../operation/collide.ts";
import type { Tree } from "../operation/collide.ts";

interface Mesh { tris: number[]; tree: Tree }
const cache = new WeakMap<Scene, Map<Ref, Mesh>>();

/** Is this body hard (it collides with the other hard bodies while it is moved by hand)? */
export const isHard = (scene: Scene, ref: Ref): boolean => { const p = scene.parts[ref]; return p?.kind === "body" && !!p.id && !!scene.hard?.includes(p.id); };

/** The triangles of a body, from the meshes of its faces, and the tree over them (kept for the scene: a drag tests many places against the same bodies). */
function meshOf(scene: Scene, body: Ref): Mesh | null {
  let by = cache.get(scene);
  if (!by) {
    by = new Map();
    const groups = new Map<Ref, number[]>();
    for (const p of Object.values(scene.parts)) {
      if (p.kind !== "plane" || p.origin !== "body" || !p.mesh || !p.of) continue;
      const list = groups.get(p.of) ?? [];
      for (let i = 0; i < p.mesh.length; i++) list.push(p.mesh[i]!);
      groups.set(p.of, list);
    }
    for (const [ref, tris] of groups) by.set(ref, { tris, tree: buildTree(tris) });
    cache.set(scene, by);
  }
  return by.get(body) ?? null;
}

export interface HardMotion {
  /** how far along the way the first meeting is (0 to 1) */
  t: number;
  /** the hard bodies it is against */
  hit: Ref[];
  /** each body of the group where it ends up (stopped, or slid along the contact) */
  rigidOf: (b: Ref) => Rigid | null;
  /** the whole slide of a motion that is a plain move: where each body goes, set only when it slid or stopped */
  shift?: Vec3;
}

const isMove = (r: Rigid | null): r is Rigid => !!r && Math.abs(r.turn[0] - 1) + Math.abs(r.turn[4] - 1) + Math.abs(r.turn[8] - 1) + Math.abs(r.turn[1]) + Math.abs(r.turn[2]) + Math.abs(r.turn[3]) + Math.abs(r.turn[5]) + Math.abs(r.turn[6]) + Math.abs(r.turn[7]) < 1e-9;
const slideOf = (shift: Vec3): Rigid => ({ turn: [1, 0, 0, 0, 1, 0, 0, 0, 1], shift, k: 1 });

/** How far a step of a drag may go (`in_484`): not more than half of the thinnest of the hard bodies, between 0.2 and 2 mm, so that a long pull cannot jump over a wall between two steps. */
function stepLength(scene: Scene, movers: readonly Ref[], stays: readonly Ref[]): number {
  let thin = Infinity;
  for (const r of [...movers, ...stays]) {
    const b = scene.parts[r];
    if (b?.kind !== "body" || !b.bbox) continue;
    thin = Math.min(thin, ...[0, 1, 2].map((k) => b.bbox!.max[k]! - b.bbox!.min[k]!).filter((v) => v > 1e-6));
  }
  return Math.max(0.2, Math.min(2, thin / 2));
}
/** The farthest a point of these bodies is from their middle (what a turn carries a point by, per radian). */
function reachOf(scene: Scene, bodies: readonly Ref[]): number {
  let far = 0;
  for (const r of bodies) { const b = scene.parts[r]; if (b?.kind === "body" && b.bbox) far = Math.max(far, Math.hypot(...[0, 1, 2].map((k) => (b.bbox!.max[k]! - b.bbox!.min[k]!) / 2))); }
  return far;
}

/**
 * What the motion `rigidOf` gives each body of `group` comes to when the hard bodies of it may not go into the hard bodies that stay: null when nothing is in the way (or nothing is hard). A motion is taken as
 * far as it can go; if it is a plain move (`slide`, a drag by hand) the part of what is left that runs along the surface it is against is made too, round a corner and on (`in_474`). A pair that already
 * overlaps is left out, so that bodies can be pulled out of each other.
 */
export function hardMotion(scene: Scene, group: readonly Ref[], rigidOf: (b: Ref) => Rigid | null, slide = false): HardMotion | null {
  const movers = group.filter((b) => isHard(scene, b));
  if (!movers.length) return null;
  const stays = Object.keys(scene.parts).filter((r) => !group.includes(r as Ref) && isHard(scene, r as Ref)) as Ref[];
  if (!stays.length) return null;
  const clearance = scene.clearance ?? 0;
  const pairs: { m: Ref; s: Ref; fixed: Tree; tris: number[]; mover: Tree; c: number }[] = [];
  for (const m of movers) {
    const a = meshOf(scene, m);
    if (!a) continue;
    for (const s of stays) {
      const b = meshOf(scene, s);
      if (!b || collides(a.tris, b.tree, clearance, false, true)) continue; // (already in each other, deeper than a move leaves two bodies: not held to it)
      pairs.push({ m, s, fixed: b.tree, tris: a.tris, mover: a.tree, c: clearance });
    }
  }
  if (!pairs.length) return null;
  const hitAt = (r: (b: Ref) => Rigid | null, sliding = false): Ref[] => [...new Set(pairs.filter((q) => collidesMoving(q.mover, r(q.m) ?? NONE, q.fixed, Math.max(0, q.c - (sliding ? 5e-4 : 0)))).map((q) => q.s))]; // (sliding along a surface is tested a hair nearer, or a body on it would count as hitting it at every step)
  const part = (t: number) => (b: Ref): Rigid | null => { const r = rigidOf(b); return r ? partOf(r, t) : r; };
  const stepLen = stepLength(scene, movers, stays);
  const reach = reachOf(scene, movers);
  const travel = Math.max(...movers.map((b) => { const r = rigidOf(b); if (!r) return 0; const c = Math.hypot(...r.shift); const a = Math.acos(Math.max(-1, Math.min(1, (r.turn[0] + r.turn[4] + r.turn[8] - 1) / 2))); return c + a * reach; }), 0);
  const t = freePart((p) => hitAt(part(p)).length > 0, Math.min(600, Math.max(24, Math.ceil(travel / stepLen)))); // (steps no longer than a fraction of the thinnest part, so a long pull does not jump over a wall)
  if (t >= 1) return null;
  const hit = hitAt(part(Math.min(1, t + 5e-4)));
  const stop: HardMotion = { t, hit, rigidOf: part(t) };
  // sliding: only a plain move, the same for every body of the group
  const first = movers.map((b) => rigidOf(b));
  if (!slide || !first.every(isMove) || first.some((r) => Math.hypot(r.shift[0] - first[0]!.shift[0], r.shift[1] - first[0]!.shift[1], r.shift[2] - first[0]!.shift[2]) > 1e-9)) return stop;
  let at: Vec3 = [first[0]!.shift[0] * t, first[0]!.shift[1] * t, first[0]!.shift[2] * t]; // (where it has got to)
  let left: Vec3 = [first[0]!.shift[0] * (1 - t), first[0]!.shift[1] * (1 - t), first[0]!.shift[2] * (1 - t)];
  const hits = new Set<Ref>(hit);
  /** How far along `dir` from `from` the group can go (mm). */
  const trial = (from: Vec3, dir: Vec3): number => {
    const len = Math.hypot(...dir);
    const go = (u: number) => (b: Ref): Rigid | null => (movers.includes(b) ? slideOf([from[0] + dir[0] * u, from[1] + dir[1] * u, from[2] + dir[2] * u]) : null);
    return len * freePart((p) => hitAt(go(p), true).length > 0, Math.min(300, Math.max(12, Math.ceil(len / stepLen))));
  };
  let idle = 0;
  for (let k = 0; k < 40 && idle < 3; k++) { // (a wall that bends away from the way it is going is followed in many short legs; given up when three in a row get nowhere)
    // the way the surface it is against faces, from the bodies it just went into
    const probe = Math.hypot(...left) > 1e-9 ? Math.min(1, Math.max(2e-3 / Math.hypot(...left), 5e-4)) : 1;
    const into = (b: Ref): Rigid | null => (movers.includes(b) ? slideOf([at[0] + left[0] * probe, at[1] + left[1] * probe, at[2] + left[2] * probe]) : null);
    const normals: Vec3[] = [];
    for (const q of pairs) for (const c of contactNormals(moved(q.tris, into(q.m) ?? NONE), q.fixed, Math.max(0, q.c - 5e-4), left)) normals.push(c);
    let slid: Vec3 | null = null;
    if (normals.length) {
      // what is left of the motion with what goes into each surface taken out, one surface after another (a floor and a wall at once leave only what runs along both)
      let v: Vec3 = [left[0], left[1], left[2]];
      for (let pass = 0; pass < 3; pass++) for (const n of normals) { const d = n[0] * v[0] + n[1] * v[1] + n[2] * v[2]; if (d < 0) v = [v[0] - n[0] * d, v[1] - n[1] * d, v[2] - n[2] * d]; }
      slid = v;
    }
    if (!slid || Math.hypot(...slid) < 1e-4 || trial(at, slid) < 2e-3) {
      // the contact found does not say which way to go (a rim that faces along the motion, a bend): the motion is tried with each of its parts left out, and the one that gets furthest is taken
      let best: { dir: Vec3; went: number } | null = null;
      const parts: Vec3[] = [[0, left[1], left[2]], [left[0], 0, left[2]], [left[0], left[1], 0], [left[0], 0, 0], [0, left[1], 0], [0, 0, left[2]]];
      for (const dir of parts) { const len = Math.hypot(...dir); if (len < 1e-4) continue; const went = trial(at, dir); if (!best || went > best.went) best = { dir, went }; }
      if (!best || best.went < 2e-3) { if (!slid) break; } else slid = best.dir;
    }
    if (!slid || Math.hypot(...slid) < 1e-4) break;
    if (process.env.DBG) console.log("LEG", k, "at", at.map((v) => +v.toFixed(3)), "left", left.map((v) => +v.toFixed(3)), "slid", slid.map((v) => +v.toFixed(3)));
    const from = at;
    const go = (u: number) => (b: Ref): Rigid | null => (movers.includes(b) ? slideOf([from[0] + slid[0] * u, from[1] + slid[1] * u, from[2] + slid[2] * u]) : null);
    const u = freePart((p) => hitAt(go(p), true).length > 0, Math.min(300, Math.max(12, Math.ceil(Math.hypot(...slid) / stepLen))));
    at = [from[0] + slid[0] * u, from[1] + slid[1] * u, from[2] + slid[2] * u];
    idle = u * Math.hypot(...slid) < 2e-3 ? idle + 1 : 0;
    for (const r of hitAt(go(Math.min(1, u + 5e-4)), true)) hits.add(r);
    if (u >= 1) break;
    left = [slid[0] * (1 - u), slid[1] * (1 - u), slid[2] * (1 - u)];
  }
  const final = slideOf(at);
  return { t, hit: [...hits], rigidOf: (b) => (rigidOf(b) ? final : null), shift: at };
}

/**
 * What releasing a drag of hard bodies makes (`in_473`): the operation taken only as far as it can go (a move's numbers, or a turn's angle, times the part that is free), or the reason it is refused (a number
 * typed for it would run into another hard body, or it is against one already). Null when nothing hard is in the way.
 */
export function limitedOp(scene: Scene, op: Op): { op: Op } | { why: string } | null {
  // copies a repeat or a mirror would make: refused with the reason (`in_475`)
  const copies = hardCopies(scene, op);
  if (copies) return { why: copies.why };
  // a sweep that would run into a hard body is refused with the reason (`in_482`)
  const swept = sweepRuns(scene, op);
  if (swept) return { why: swept.why };
  // a hard body's face pulled out into another hard body: taken as far as it goes, or refused when typed
  const grown = growth(scene, op);
  if (grown) {
    const names = grown.hit.map((r) => nameOf(scene, r)).join(", ");
    if (op.typed !== "") return { why: `it would grow into ${names || "another hard body"}: hard bodies do not go into each other` };
    const d = valueOf(op) ?? 0; // (signed: a sketch is extruded either way)
    if (Math.abs(grown.t * d) < 1e-3) return { why: `it is against ${names || "another hard body"}: hard bodies do not go into each other` };
    const value = Math.round(grown.t * d * 1e4) / 1e4;
    return { op: { ...op, value, ...(op.kind === "revolve" ? { advTyped: "", advValue: advanceOf(op) * grown.t } : {}) } }; // (a turn that stops short advances as far as the same part of its pitch)
  }
  const asked = bodyMotion(scene, op);
  const group = op.parts.filter((r) => scene.parts[r]?.kind === "body");
  if (!asked || !group.length) return null;
  const lim = hardMotion(scene, group, () => asked, op.kind === "move" && !!op.free);
  if (!lim) return null;
  const names = lim.hit.map((r) => { const p = scene.parts[r]; return p?.kind === "body" && p.id ? p.id : r; }).join(", ");
  const typed = op.typed !== "" || op.rot.some((x) => x !== "");
  if (typed) return { why: `it would run into ${names || "another hard body"}: hard bodies do not go into each other (or take the clearance, ${scene.clearance ?? 0} mm, from it)` };
  // (a drag is never refused: it goes as far as it can and slides, and against a wall it simply stays, `in_484`)
  const k = Math.round(lim.t * 1e6) / 1e6;
  const scaled: Op = op.kind === "move" && op.free && lim.shift ? { ...op, free: lim.shift.map((v) => Math.round(v * 1e3) / 1e3) as unknown as Vec3 } : op.kind === "move" && op.free ? { ...op, free: op.free.map((v) => Math.round(v * k * 1e3) / 1e3) as unknown as Vec3 } : { ...op, ...(op.value !== null && op.value !== undefined ? { value: Math.round(op.value * k * 1e4) / 1e4 } : {}) };
  return { op: settled(scene, group, scaled) };
}

/**
 * The step is kept to a thousandth of a millimetre, and a pose that touches a wall may come out a hair inside it by that rounding: then the pair would count as already in each other and the rule would be
 * off for it (`in_484`). The pose of a move is looked at as it will be kept, and moved by a thousandth to a neighbour that is clear when it is not.
 */
function settled(scene: Scene, group: readonly Ref[], op: Op): Op {
  if (op.kind !== "move" || !op.free) return op;
  const at = (f: readonly number[]): Rigid => ({ turn: [1, 0, 0, 0, 1, 0, 0, 0, 1], shift: [f[0]!, f[1]!, f[2]!], k: 1 });
  if (!hardCollision(scene, group, () => at(op.free!)).length) return op;
  const best = op.free.map((v) => Math.round(v * 1e3) / 1e3);
  for (const step of [1e-3, 2e-3, 4e-3]) {
    for (let m = 1; m < 27; m++) {
      const f = best.map((v, i) => v + (((Math.floor(m / 3 ** i) % 3) - 1) * step)); // (every neighbour of the rounded pose, nearest first for the small steps)
      if (!hardCollision(scene, group, () => at(f)).length) return { ...op, free: f.map((v) => Math.round(v * 1e3) / 1e3) as unknown as Vec3 };
    }
  }
  return { ...op, free: [0, 0, 0] as unknown as Vec3 }; // (nowhere clear to put it: it stays)
}

// ---- copies and growth (`in_475`) ----
type Map3 = (p: Vec3) => Vec3;
/** Where the copies of a repeat (a line, a circle of them, a quick copy) or of a mirror put a point: one map for each copy. */
function copyMaps(op: Op): Map3[] {
  if (op.kind === "mirror") {
    const pl = mirrorPlane(op);
    if (!pl) return [];
    const [q, n] = [pl.p, pl.n];
    const l = Math.hypot(...n) || 1;
    return [(p) => { const d = (2 * ((p[0] - q[0]) * n[0] + (p[1] - q[1]) * n[1] + (p[2] - q[2]) * n[2])) / (l * l); return [p[0] - d * n[0], p[1] - d * n[1], p[2] - d * n[2]]; }];
  }
  if (op.kind !== "linear" && op.kind !== "circular" && op.kind !== "copy") return [];
  const kind = op.kind === "circular" ? "circular" : "linear";
  return placements(kind, patternValues(op)).map((pl): Map3 => (p) => {
    if (!pl.turn) return [p[0] + pl.move[0], p[1] + pl.move[1], p[2] + pl.move[2]];
    const m = pl.turn.dir ? aboutDir(pl.turn.dir, pl.turn.angle) : about(pl.turn.axis, pl.turn.angle);
    const c = pl.turn.pivot;
    const w: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    return [c[0] + m[0] * w[0] + m[1] * w[1] + m[2] * w[2] + pl.move[0], c[1] + m[3] * w[0] + m[4] * w[1] + m[5] * w[2] + pl.move[1], c[2] + m[6] * w[0] + m[7] * w[1] + m[8] * w[2] + pl.move[2]];
  });
}
const nameOf = (scene: Scene, r: Ref): string => { const p = scene.parts[r]; return p?.kind === "body" && p.id ? p.id : r; };

/**
 * Do the copies a repeat or a mirror of hard bodies would make run into hard bodies (`in_475`)? The copies are those of the source bodies that are hard; each is tested against every hard body there is (the
 * source and the others), and the copies of one repeat against each other. Null when none does; else which copy it is and what it is against.
 */
export function hardCopies(scene: Scene, op: Op): { why: string; hit: Ref[] } | null {
  if (op.target !== "body") return null;
  const sources = op.parts.filter((r) => isHard(scene, r));
  if (!sources.length) return null;
  const maps = copyMaps(op);
  if (!maps.length || maps.length > 60) return null;
  const clearance = scene.clearance ?? 0;
  const others = Object.keys(scene.parts).filter((r) => isHard(scene, r as Ref)) as Ref[];
  const trees = others.flatMap((r) => { const m = meshOf(scene, r); return m ? [{ ref: r, tree: m.tree }] : []; });
  const copies: { k: number; src: Ref; tris: number[]; tree: Tree }[] = [];
  for (const src of sources) {
    const a = meshOf(scene, src);
    if (!a) continue;
    maps.forEach((f, k) => { const tris: number[] = new Array(a.tris.length); for (let i = 0; i < a.tris.length; i += 3) { const q = f([a.tris[i]!, a.tris[i + 1]!, a.tris[i + 2]!]); tris[i] = q[0]; tris[i + 1] = q[1]; tris[i + 2] = q[2]; } copies.push({ k, src, tris, tree: buildTree(tris) }); });
  }
  for (const c of copies) {
    const hits = trees.filter((t) => collides(c.tris, t.tree, clearance));
    if (hits.length) return { why: `copy ${c.k + 1} would run into ${hits.map((h) => nameOf(scene, h.ref)).join(", ")}: hard bodies do not go into each other`, hit: hits.map((h) => h.ref) };
    const other = copies.find((d) => d !== c && d.src === c.src && d.k < c.k && collides(c.tris, d.tree, clearance));
    if (other) return { why: `copy ${c.k + 1} would run into copy ${other.k + 1}: hard bodies do not go into each other`, hit: [c.src] };
  }
  return null;
}

/** A piece of surface that grows with the distance of the operation (`in_475`, `in_481`): `at(u)` is where its triangles are when u (0 to 1) of the distance is made. */
interface Piece { at: (u: number) => ArrayLike<number>; tris: number[]; tree?: Tree; /** a piece that is carried whole: the motion it has made at u (0 to 1) of the way */ rigid?: (u: number) => Rigid }

/** Does a triangle of `a` have its middle in a triangle of `b`, the two lying in one plane? (a drawn figure on the face of a body) */
function overlapsFlat(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i + 8 < a.length; i += 9) {
    const m: Vec3 = [(a[i]! + a[i + 3]! + a[i + 6]!) / 3, (a[i + 1]! + a[i + 4]! + a[i + 7]!) / 3, (a[i + 2]! + a[i + 5]! + a[i + 8]!) / 3];
    for (let j = 0; j + 8 < b.length; j += 9) {
      const p: Vec3 = [b[j]!, b[j + 1]!, b[j + 2]!], q: Vec3 = [b[j + 3]!, b[j + 4]!, b[j + 5]!], r: Vec3 = [b[j + 6]!, b[j + 7]!, b[j + 8]!];
      const n: Vec3 = [(q[1] - p[1]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[1] - p[1]), (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]), (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])];
      const side = (u: Vec3, v: Vec3): number => ((v[1] - u[1]) * (m[2] - u[2]) - (v[2] - u[2]) * (m[1] - u[1])) * n[0] + ((v[2] - u[2]) * (m[0] - u[0]) - (v[0] - u[0]) * (m[2] - u[2])) * n[1] + ((v[0] - u[0]) * (m[1] - u[1]) - (v[1] - u[1]) * (m[0] - u[0])) * n[2];
      if (side(p, q) >= 0 && side(q, r) >= 0 && side(r, p) >= 0) return true;
    }
  }
  return false;
}

/**
 * The hard bodies that have a flat face the sketch `tris` lies on (and overlaps), with the sketch going away from the body when `dir` is given: what a sketch drawn on a face grows out of (`in_481`, `in_482`).
 */
function ownersOnFace(scene: Scene, tris: readonly number[], dir: Vec3 | null): Ref[] {
  return Object.keys(scene.parts).filter((r) => {
    const b = scene.parts[r];
    if (b?.kind !== "body" || !isHard(scene, r as Ref) || !b.bbox) return false;
    const mid: Vec3 = [(b.bbox.min[0] + b.bbox.max[0]) / 2, (b.bbox.min[1] + b.bbox.max[1]) / 2, (b.bbox.min[2] + b.bbox.max[2]) / 2];
    return Object.values(scene.parts).some((f) => {
      if (f.kind !== "plane" || f.origin !== "body" || f.of !== r || !f.mesh || f.curved || f.rounded) return false;
      const n = normalOfPlane(f);
      const c: Vec3 = [f.mesh[0]!, f.mesh[1]!, f.mesh[2]!];
      const out = (n[0] * (c[0] - mid[0]) + n[1] * (c[1] - mid[1]) + n[2] * (c[2] - mid[2])) >= 0 ? 1 : -1;
      const tilt = dir ? n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] : 1;
      if (dir && (Math.abs(tilt) < 0.999 || out * tilt <= 0)) return false; // (an extrusion goes away from the body; a turned figure goes both ways)
      if (Math.abs(n[0] * (tris[0]! - c[0]) + n[1] * (tris[1]! - c[1]) + n[2] * (tris[2]! - c[2])) > 1e-3) return false; // (not the plane of the sketch)
      return overlapsFlat(tris, f.mesh);
    });
  }) as Ref[];
}

/**
 * How far a hard body may grow before it meets another hard body: the part of the distance (0 to 1) and what it meets; null when nothing is in the way. A flat face pulled out is a piece of surface moved along its normal;
 * a round wall (a post or a hole) grows or shrinks about its axis (its radius changes by the distance, `in_481`); a sketch extruded off a hard body's face is the sketch moved along (its walls and top are the piece that
 * sweeps the new volume, `in_481`).
 */
function growth(scene: Scene, op: Op): { t: number; hit: Ref[]; owners: Ref[] } | null {
  if (op.kind !== "pushpull" && op.kind !== "extrude" && op.kind !== "revolve") return null;
  const d0 = valueOf(op);
  const rounding = op.kind === "pushpull" && op.rounded && !op.roundAxis && op.edit?.kind === "edgeSize"; // (the face of a fillet or a chamfer: its size changes, either way)
  if (d0 === null || (op.kind === "pushpull" && d0 <= 0 && !rounding) || d0 === 0) return null; // (pushed in, a body does not grow into anything; a sketch is extruded, or turned, either way)
  const d = Math.abs(d0);
  const clearance = scene.clearance ?? 0;
  let owners: Ref[] = [];
  let pieces: Piece[] = [];
  if (op.kind === "extrude" || op.kind === "revolve") {
    const cap = extrudeCap(scene, op);
    if (!cap) return null;
    const dir = unit(op.kind === "revolve" || d0 >= 0 ? cap.normal : [-cap.normal[0], -cap.normal[1], -cap.normal[2]]);
    owners = ownersOnFace(scene, cap.tris, op.kind === "extrude" ? dir : null);
    const axis = op.kind === "revolve" ? axisOf(op) : null;
    if (op.kind === "revolve" && !axis) return null;
    const adv = op.kind === "revolve" ? advanceOf(op) : 0;
    const rigid = (u: number): Rigid => {
      if (!axis) return { turn: [1, 0, 0, 0, 1, 0, 0, 0, 1], shift: [dir[0] * d * u, dir[1] * d * u, dir[2] * d * u], k: 1 };
      const ad = unit(axis.d);
      const R = aboutDir(ad, d0 * u), c = axis.p;
      const rc: Vec3 = [R[0] * c[0] + R[1] * c[1] + R[2] * c[2], R[3] * c[0] + R[4] * c[1] + R[5] * c[2], R[6] * c[0] + R[7] * c[1] + R[8] * c[2]];
      return { turn: R, shift: [c[0] - rc[0] + ad[0] * adv * u, c[1] - rc[1] + ad[1] * adv * u, c[2] - rc[2] + ad[2] * adv * u], k: 1 };
    };
    pieces = [{ tris: cap.tris, tree: buildTree(cap.tris), rigid, at: () => cap.tris }];
  } else {
    const faces = op.parts.map((r) => scene.parts[r]).filter((p) => p?.kind === "plane" && p.origin === "body" && !!p.mesh && !!p.of);
    const edge = rounding ? sharpEdge(scene, op, faces) : null;
    if (rounding && !edge) return null; // (a size that changes along the edge, a chamfer with two distances, or an edge that cannot be found: not looked ahead)
    owners = [...new Set(faces.map((p) => (p as { of: Ref }).of))].filter((b) => isHard(scene, b));
    const round = op.curved ? { center: op.curved.center, dir: op.curved.dir ?? ([0, 0, 0] as Vec3).map((_, i) => (i === op.curved!.axis ? 1 : 0)) as unknown as Vec3, radius: op.curved.radius } : op.rounded && op.roundAxis && op.dim ? { center: op.roundAxis.center, dir: op.roundAxis.dir, radius: op.dim.base / 2 } : null;
    if (op.rounded && !round && !edge) return null;
    pieces = faces.flatMap((p, i) => {
      const f = p as { of: Ref; mesh: readonly number[] };
      if (!owners.includes(f.of)) return [];
      const tris = Array.from(f.mesh);
      if (round) {
        const axis = unit(round.dir), c = round.center;
        const o: Vec3 = [(op.origin ?? c)[0] - c[0], (op.origin ?? c)[1] - c[1], (op.origin ?? c)[2] - c[2]];
        const al = o[0] * axis[0] + o[1] * axis[1] + o[2] * axis[2];
        const out: Vec3 = [o[0] - axis[0] * al, o[1] - axis[1] * al, o[2] - axis[2] * al];
        const convex = op.normal ? op.normal[0] * out[0] + op.normal[1] * out[1] + op.normal[2] * out[2] > 0 : true;
        const sign = convex ? 1 : -1;
        return [{ tris, at: (u: number) => radial(tris, c, axis, round.radius, sign * d * u) }];
      }
      if (edge) { // the face is taken towards the sharp edge or away from it, about the edge, as much as the size changes: a fillet or a chamfer is the same shape at any size, seen from the edge
        const size = op.edit!.kind === "edgeSize" ? op.edit!.value : 1;
        return [{ tris, at: (u: number) => homothety(tris, edge, (size - d0 * u) / size) }];
      }
      const n = op.faces?.[i]?.normal ?? op.normal;
      return n ? [{ tris, tree: buildTree(tris), rigid: (u: number): Rigid => ({ turn: [1, 0, 0, 0, 1, 0, 0, 0, 1], shift: [n[0] * d * u, n[1] * d * u, n[2] * d * u], k: 1 }), at: () => tris }] : [];
    });
  }
  if (!owners.length) return null;
  const stays = Object.keys(scene.parts).filter((r) => !owners.includes(r as Ref) && isHard(scene, r as Ref)) as Ref[];
  if (!stays.length) return null;
  const pairs = pieces.flatMap((q) => stays.flatMap((s) => { const m = meshOf(scene, s); return m && !collides(q.tris, m.tree, clearance, true, true) ? [{ q, s, tree: m.tree }] : []; }));
  if (!pairs.length) return null;
  const hitAt = (u: number): Ref[] => [...new Set(pairs.filter((x) => {
    const r = x.q.rigid;
    return r ? collidesMoving(x.q.tree!, r(u), x.tree, clearance, true) : collides(x.q.at(u), x.tree, clearance, true);
  }).map((x) => x.s))];
  const t = freePart((u) => hitAt(u).length > 0);
  return t >= 1 ? null : { t, hit: hitAt(Math.min(1, t + 5e-4)), owners };
}
const unit = (v: Vec3): Vec3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** The sharp edge a fillet or a chamfer face rounds (`in_483`): the edge of its step nearest the face, brought to where the body stands now; null for a step the size of which is not one number along the whole edge. */
function sharpEdge(scene: Scene, op: Op, faces: readonly unknown[]): { a: Vec3; b: Vec3 } | null {
  if (op.edit?.kind !== "edgeSize") return null;
  const i = scene.steps.findIndex((s) => s.id === (op.edit as { step: string }).step);
  const st = scene.steps[i];
  if (!st || st.type !== "edgeMod" || st.params.end !== undefined || st.params.d2 !== undefined) return null;
  const here = laterMotion(scene.steps, i);
  const mesh = (faces[0] as { mesh?: readonly number[] } | undefined)?.mesh;
  if (!mesh || mesh.length < 9) return null;
  const mid: [number, number, number] = [0, 0, 0];
  for (let k = 0; k + 2 < mesh.length; k += 3) { mid[0] += mesh[k]!; mid[1] += mesh[k + 1]!; mid[2] += mesh[k + 2]!; }
  const n = mesh.length / 3;
  const c: Vec3 = [mid[0] / n, mid[1] / n, mid[2] / n];
  let best: { a: Vec3; b: Vec3; d: number } | null = null;
  for (const r of st.parts) {
    const e = decodeEdge(r);
    if (!e) continue;
    const [a, b] = [applyPoint(here, e.a), applyPoint(here, e.b)];
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    if (l2 < 1e-12) continue;
    const k = Math.max(0, Math.min(1, ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / l2));
    const d = Math.hypot(a[0] + ab[0] * k - c[0], a[1] + ab[1] * k - c[1], a[2] + ab[2] * k - c[2]);
    if (!best || d < best.d) best = { a, b, d };
  }
  return best ? { a: best.a, b: best.b } : null;
}
/** The triangles seen from a line, every point taken along the way to the line (and past it) by `ratio` times: the cross section of a fillet or a chamfer at another size. */
function homothety(tris: readonly number[], edge: { a: Vec3; b: Vec3 }, ratio: number): number[] {
  const d = unit([edge.b[0] - edge.a[0], edge.b[1] - edge.a[1], edge.b[2] - edge.a[2]]);
  const out: number[] = new Array(tris.length);
  for (let i = 0; i + 2 < tris.length; i += 3) {
    const o: Vec3 = [tris[i]! - edge.a[0], tris[i + 1]! - edge.a[1], tris[i + 2]! - edge.a[2]];
    const al = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
    const r: Vec3 = [o[0] - d[0] * al, o[1] - d[1] * al, o[2] - d[2] * al];
    out[i] = edge.a[0] + d[0] * al + r[0] * ratio; out[i + 1] = edge.a[1] + d[1] * al + r[1] * ratio; out[i + 2] = edge.a[2] + d[2] * al + r[2] * ratio;
  }
  return out;
}
/** The triangles of a round wall with its radius made `by` bigger (smaller when negative): every point taken along the way out from the axis. */
function radial(tris: readonly number[], c: Vec3, axis: Vec3, radius: number, by: number): number[] {
  const out: number[] = new Array(tris.length);
  for (let i = 0; i + 2 < tris.length; i += 3) {
    const o: Vec3 = [tris[i]! - c[0], tris[i + 1]! - c[1], tris[i + 2]! - c[2]];
    const al = o[0] * axis[0] + o[1] * axis[1] + o[2] * axis[2];
    const r: Vec3 = [o[0] - axis[0] * al, o[1] - axis[1] * al, o[2] - axis[2] * al];
    const l = Math.hypot(...r);
    const k = l > 1e-9 ? Math.max(0, l + by * (l / Math.max(radius, 1e-9))) / l : 1; // (a point of the wall that is not on the circle (a piece of it, tilted) moves by its share)
    out[i] = c[0] + axis[0] * al + r[0] * k; out[i + 1] = c[1] + axis[1] * al + r[1] * k; out[i + 2] = c[2] + axis[2] * al + r[2] * k;
  }
  return out;
}

/**
 * What a sweep of a sketch that stands on a hard body would run into (`in_482`): the shape is taken along the path (stations along it), and the hard bodies it comes into are named. A sweep has no distance to take
 * part of, so it is all or nothing. Null when the sketch is on no hard body's face, or nothing is in the way.
 */
function sweepRuns(scene: Scene, op: Op): { why: string; hit: Ref[] } | null {
  if (op.kind !== "sweep" || !scene.hard?.length) return null;
  const carry = sweepCarry(scene, op);
  if (!carry) return null;
  const owners = ownersOnFace(scene, carry.tris, null);
  if (!owners.length) return null;
  const clearance = scene.clearance ?? 0;
  const tree = buildTree(carry.tris);
  const hit = new Set<Ref>();
  for (const s of Object.keys(scene.parts) as Ref[]) {
    if (owners.includes(s) || !isHard(scene, s)) continue;
    const m = meshOf(scene, s);
    if (!m || collides(carry.tris, m.tree, clearance, true, true)) continue; // (already in it: not held to it)
    if (carry.carries.some((r) => collidesMoving(tree, r, m.tree, clearance, true))) hit.add(s);
  }
  return hit.size ? { why: `it would run into ${[...hit].map((r) => nameOf(scene, r)).join(", ")}: hard bodies do not go into each other`, hit: [...hit] } : null;
}

/** What a repeat, a mirror or a push / pull that is open runs into, for the picture while it is set up (the body it is against flashes, and what is said): null when nothing. */
export function hardNote(scene: Scene, op: Op): { why: string; hit: Ref[] } | null {
  if (!scene.hard?.length) return null;
  const copies = hardCopies(scene, op);
  if (copies) return copies;
  const swept = sweepRuns(scene, op);
  if (swept) return swept;
  const grown = growth(scene, op);
  return grown ? { why: `it can grow only as far as it meets ${grown.hit.map((r) => nameOf(scene, r)).join(", ")}`, hit: grown.hit } : null;
}

/**
 * The hard bodies that the bodies of `group`, each put where `rigidOf` puts it, are in (`in_477`): what a motion that the mates have settled, or a mate that is made, comes to, with no path taken to it. A pair that
 * already overlaps is left out.
 */
export function hardCollision(scene: Scene, group: readonly Ref[], rigidOf: (b: Ref) => Rigid | null): Ref[] {
  const movers = group.filter((b) => isHard(scene, b));
  if (!movers.length) return [];
  const stays = Object.keys(scene.parts).filter((r) => !group.includes(r as Ref) && isHard(scene, r as Ref)) as Ref[];
  const clearance = scene.clearance ?? 0;
  const hits = new Set<Ref>();
  for (const m of movers) {
    const a = meshOf(scene, m);
    const r = rigidOf(m);
    if (!a || !r) continue;
    for (const s of stays) {
      const b = meshOf(scene, s);
      if (!b || collides(a.tris, b.tree, clearance, false, true)) continue; // (already in each other)
      if (collidesMoving(a.tree, r, b.tree, clearance)) hits.add(s);
    }
  }
  return [...hits];
}
export const hardNames = (scene: Scene, refs: readonly Ref[]): string => refs.map((r) => nameOf(scene, r)).join(", ");

// ---- the history replayed (`in_478`) ----
const overlapCache = new WeakMap<Scene, { a: Ref; b: Ref }[]>();
/**
 * The pairs of hard bodies that overlap (or are nearer than the clearance) as the scene stands. The rule is for the moment of moving, so a model made of steps can come to have hard bodies in each other
 * when an earlier step is changed and the history is replayed; this finds them, and `overlapBlame` the step to look at.
 */
export function hardOverlaps(scene: Scene): { a: Ref; b: Ref }[] {
  if (!scene.hard?.length) return [];
  const known = overlapCache.get(scene);
  if (known) return known;
  const bodies = Object.keys(scene.parts).filter((r) => isHard(scene, r as Ref)) as Ref[];
  const out: { a: Ref; b: Ref }[] = [];
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const [ma, mb] = [meshOf(scene, bodies[i]!), meshOf(scene, bodies[j]!)];
    if (ma && mb && collides(ma.tris, mb.tree, scene.clearance ?? 0, false, true)) out.push({ a: bodies[i]!, b: bodies[j]! });
  }
  overlapCache.set(scene, out);
  return out;
}

/** The last step that made or moved either body (the one to look at when they overlap), or null. */
export function overlapBlame(scene: Scene, pair: { a: Ref; b: Ref }): string | null {
  const ids = [pair.a, pair.b].map((r) => { const p = scene.parts[r]; return p?.kind === "body" ? p.id : undefined; }).filter((x): x is string => !!x);
  for (let i = scene.steps.length - 1; i >= 0; i--) {
    const st = scene.steps[i]!;
    if (st.params.body !== undefined && ids.includes(String(st.params.body))) return st.id;
    if (ids.includes(`x_${st.id}`) || st.parts.some((r) => r === pair.a || r === pair.b)) return st.id;
  }
  return null;
}

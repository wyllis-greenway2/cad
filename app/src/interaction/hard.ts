// Hard bodies (`dec_hard_bodies`, `in_473`): which bodies are hard, their triangles, and how much of a motion by hand a group of bodies may make before a hard one of them meets another.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Rigid } from "../operation/frames.ts";
import type { Op } from "./operations.ts";
import { bodyMotion } from "./operations.ts";
import { NONE } from "../operation/frames.ts";
import { buildTree, collides, moved, partOf, freePart, contactNormal } from "../operation/collide.ts";
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
  const pairs: { m: Ref; s: Ref; fixed: Tree; tris: number[] }[] = [];
  for (const m of movers) {
    const a = meshOf(scene, m);
    if (!a) continue;
    for (const s of stays) {
      const b = meshOf(scene, s);
      if (!b || collides(a.tris, b.tree, clearance)) continue; // (already in each other: not held to it)
      pairs.push({ m, s, fixed: b.tree, tris: a.tris });
    }
  }
  if (!pairs.length) return null;
  const hitAt = (r: (b: Ref) => Rigid | null, c: number): Ref[] => [...new Set(pairs.filter((q) => collides(moved(q.tris, r(q.m) ?? NONE), q.fixed, c)).map((q) => q.s))];
  const part = (t: number) => (b: Ref): Rigid | null => { const r = rigidOf(b); return r ? partOf(r, t) : r; };
  const t = freePart((p) => hitAt(part(p), clearance).length > 0);
  if (t >= 1) return null;
  const hit = hitAt(part(Math.min(1, t + 5e-4)), clearance);
  const stop: HardMotion = { t, hit, rigidOf: part(t) };
  // sliding: only a plain move, the same for every body of the group
  const first = movers.map((b) => rigidOf(b));
  if (!slide || !first.every(isMove) || first.some((r) => Math.hypot(r.shift[0] - first[0]!.shift[0], r.shift[1] - first[0]!.shift[1], r.shift[2] - first[0]!.shift[2]) > 1e-9)) return stop;
  let at: Vec3 = [first[0]!.shift[0] * t, first[0]!.shift[1] * t, first[0]!.shift[2] * t]; // (where it has got to)
  let left: Vec3 = [first[0]!.shift[0] * (1 - t), first[0]!.shift[1] * (1 - t), first[0]!.shift[2] * (1 - t)];
  const hits = new Set<Ref>(hit);
  const slack = Math.max(0, clearance - 5e-4); // (a body that is on the surface it slides along is within a hair of the clearance already)
  for (let k = 0; k < 4; k++) {
    // the way the surface it is against faces, from the bodies it just went into
    const probe = Math.hypot(...left) > 1e-9 ? Math.min(1, Math.max(2e-3 / Math.hypot(...left), 5e-4)) : 1;
    const into = (b: Ref): Rigid | null => (movers.includes(b) ? slideOf([at[0] + left[0] * probe, at[1] + left[1] * probe, at[2] + left[2] * probe]) : null);
    let n: Vec3 | null = null;
    for (const q of pairs) { const c = contactNormal(moved(q.tris, into(q.m) ?? NONE), q.fixed, slack, left); if (c) n = n ? [n[0] + c[0], n[1] + c[1], n[2] + c[2]] : c; }
    if (!n) break;
    const nl = Math.hypot(...n);
    n = [n[0] / nl, n[1] / nl, n[2] / nl];
    const into2 = n[0] * left[0] + n[1] * left[1] + n[2] * left[2];
    if (into2 > 0) n = [-n[0], -n[1], -n[2]]; // (facing against the motion)
    const d = Math.abs(into2);
    const slid: Vec3 = [left[0] + n[0] * d, left[1] + n[1] * d, left[2] + n[2] * d]; // (what is left of the motion with what goes into the surface taken out)
    if (Math.hypot(...slid) < 1e-4) break;
    const from = at;
    const go = (u: number) => (b: Ref): Rigid | null => (movers.includes(b) ? slideOf([from[0] + slid[0] * u, from[1] + slid[1] * u, from[2] + slid[2] * u]) : null);
    const u = freePart((p) => hitAt(go(p), slack).length > 0, 12);
    at = [from[0] + slid[0] * u, from[1] + slid[1] * u, from[2] + slid[2] * u];
    for (const r of hitAt(go(Math.min(1, u + 5e-4)), slack)) hits.add(r);
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
  if (op.target !== "body" || (op.kind !== "move" && op.kind !== "rotate")) return null;
  const asked = bodyMotion(scene, op);
  const group = op.parts.filter((r) => scene.parts[r]?.kind === "body");
  if (!asked || !group.length) return null;
  const lim = hardMotion(scene, group, () => asked, op.kind === "move" && !!op.free);
  if (!lim) return null;
  const names = lim.hit.map((r) => { const p = scene.parts[r]; return p?.kind === "body" && p.id ? p.id : r; }).join(", ");
  const typed = op.typed !== "" || op.rot.some((x) => x !== "");
  if (typed) return { why: `it would run into ${names || "another hard body"}: hard bodies do not go into each other (or take the clearance, ${scene.clearance ?? 0} mm, from it)` };
  if (lim.shift ? Math.hypot(...lim.shift) < 1e-3 : lim.t < 1e-3) return { why: `it is against ${names || "another hard body"}: hard bodies do not go into each other` };
  const k = Math.round(lim.t * 1e6) / 1e6;
  const scaled: Op = op.kind === "move" && op.free && lim.shift ? { ...op, free: lim.shift.map((v) => Math.round(v * 1e3) / 1e3) as unknown as Vec3 } : op.kind === "move" && op.free ? { ...op, free: op.free.map((v) => Math.round(v * k * 1e3) / 1e3) as unknown as Vec3 } : { ...op, ...(op.value !== null && op.value !== undefined ? { value: Math.round(op.value * k * 1e4) / 1e4 } : {}) };
  return { op: scaled };
}

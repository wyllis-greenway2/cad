// Hard bodies (`dec_hard_bodies`, `in_473`): which bodies are hard, their triangles, and how much of a motion by hand a group of bodies may make before a hard one of them meets another.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Rigid } from "../operation/frames.ts";
import type { Op } from "./operations.ts";
import { bodyMotion } from "./operations.ts";
import { NONE } from "../operation/frames.ts";
import { buildTree, collides, moved, partOf, freePart } from "../operation/collide.ts";
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

/**
 * How much of the motion `rigidOf` gives each body of `group` may be made before a hard body of the group meets a hard body that stays: `t` from 0 to 1 and the bodies it is against; null when nothing is in
 * the way (or nothing is hard). A pair that already overlaps is left out, so that bodies can be pulled out of each other.
 */
export function hardLimit(scene: Scene, group: readonly Ref[], rigidOf: (b: Ref) => Rigid | null): { t: number; hit: Ref[] } | null {
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
  const hitAt = (t: number): Ref[] => pairs.filter((q) => collides(moved(q.tris, partOf(rigidOf(q.m) ?? NONE, t)), q.fixed, clearance)).map((q) => q.s);
  const t = freePart((p) => hitAt(p).length > 0);
  if (t >= 1) return null;
  return { t, hit: [...new Set(hitAt(Math.min(1, t + 5e-4)))] };
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
  const lim = hardLimit(scene, group, () => asked);
  if (!lim) return null;
  const names = lim.hit.map((r) => { const p = scene.parts[r]; return p?.kind === "body" && p.id ? p.id : r; }).join(", ");
  const typed = op.typed !== "" || op.rot.some((x) => x !== "");
  if (typed) return { why: `it would run into ${names || "another hard body"}: hard bodies do not go into each other (or take the clearance, ${scene.clearance ?? 0} mm, from it)` };
  if (lim.t < 1e-3) return { why: `it is against ${names || "another hard body"}: hard bodies do not go into each other` };
  const k = Math.round(lim.t * 1e6) / 1e6;
  const scaled: Op = op.kind === "move" && op.free ? { ...op, free: op.free.map((v) => Math.round(v * k * 1e3) / 1e3) as unknown as Vec3 } : { ...op, ...(op.value !== null && op.value !== undefined ? { value: Math.round(op.value * k * 1e4) / 1e4 } : {}) };
  return { op: scaled };
}

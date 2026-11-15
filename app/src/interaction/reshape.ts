// Shaping a body by its parts (`dec_direct_shape_editing`): a corner, an edge or a face selected and moved or turned takes the corners it is made of with it, and the body is made again from
// its flat faces with those corners in their new places (the kernel's `reshape` step). The corners are carried by the operation itself (`op.sub`), found again after each step by what the steps did.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import type { Part } from "../operation/part.ts";
import { pointOf } from "../operation/part.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import { objectOf } from "./objects.ts";
import { nextId } from "../operation/scene.ts";

const near = (a: Vec3, b: Vec3): boolean => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-4;
const mean = (p: Vec3[]): Vec3 => [0, 1, 2].map((i) => p.reduce((s, q) => s + q[i]!, 0) / p.length) as unknown as Vec3;

/** The moves a reshape step holds, as pairs. */
export const movesOf = (text: unknown): { from: Vec3; to: Vec3 }[] =>
  String(text ?? "").split(";").filter(Boolean).map((m) => { const [a, b] = m.split(">").map((q) => q.split(",").map(Number) as unknown as Vec3); return { from: a!, to: b! }; });
const textOf = (moves: { from: Vec3; to: Vec3 }[]): string => moves.map((m) => `${m.from.join(",")}>${m.to.map((x) => Math.round(x * 1e9) / 1e9).join(",")}`).join(";");

/**
 * The corners a selection of the body's own parts is made of, and the body they are in; or why not. A corner is itself, an edge its two ends, a flat face every corner of its outline.
 */
export function partCorners(scene: Scene, parts: readonly Part[]): { ok: true; corners: Vec3[]; body: Ref } | { ok: false; why: string } {
  const get = (r: Ref) => scene.parts[r];
  const out: Vec3[] = [];
  const add = (p: Vec3) => { if (!out.some((q) => near(q, p))) out.push(p); };
  const bodies = new Set<Ref>();
  for (const p of parts) {
    bodies.add(objectOf(scene, p.ref));
    if (p.kind === "corner") add(p.at);
    else if (p.kind === "line") {
      if (p.mid || p.circle || p.path) return { ok: false, why: "a round edge cannot be moved on its own: only a body of flat faces can be shaped by its parts" };
      const [a, b] = [pointOf(get, p.a), pointOf(get, p.b)];
      if (!a || !b) return { ok: false, why: "that edge has no ends to move" };
      add(a); add(b);
    } else if (p.kind === "plane") {
      if (!p.mesh || p.mesh.length < 9 || p.curved || p.rounded || p.round) return { ok: false, why: "a round face cannot be moved on its own: only a body of flat faces can be shaped by its parts" };
      for (let i = 0; i + 2 < p.mesh.length; i += 3) add([p.mesh[i]!, p.mesh[i + 1]!, p.mesh[i + 2]!]);
    } else return { ok: false, why: "select a corner, an edge or a face of the body" };
  }
  if (bodies.size !== 1) return { ok: false, why: "select the parts of one body" };
  return out.length ? { ok: true, corners: out, body: [...bodies][0]! } : { ok: false, why: "nothing to move" };
}

/** Where the carried corners are now: the reshape steps made since the operation began took them where they went. */
export function currentCorners(scene: Scene, sub: readonly Vec3[], stepsAt: number): Vec3[] {
  let pts = sub.map((p) => p);
  for (const st of scene.steps.slice(stepsAt)) {
    if (st.type !== "reshape") continue;
    const moves = movesOf(st.params.moves);
    pts = pts.map((p) => moves.find((m) => near(m.from, p))?.to ?? p);
  }
  return pts;
}

/** The turn of a point about the axis `dir` through `pivot` by `deg` degrees (the right-hand rule). */
export function turned(p: Vec3, pivot: Vec3, dir: Vec3, deg: number): Vec3 {
  const l = Math.hypot(...dir) || 1;
  const k = dir.map((x) => x / l) as unknown as Vec3;
  const d: Vec3 = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const kd = k[0] * d[0] + k[1] * d[1] + k[2] * d[2];
  const cr: Vec3 = [k[1] * d[2] - k[2] * d[1], k[2] * d[0] - k[0] * d[2], k[0] * d[1] - k[1] * d[0]];
  return [0, 1, 2].map((m) => pivot[m]! + d[m]! * c + cr[m]! * s + k[m]! * kd * (1 - c)) as unknown as Vec3;
}

/** The step that moves (by `v` along `dir`) or turns (by `v` degrees about `dir` through `pivot`) the carried corners. Null for nothing. */
export function reshapeCommand(scene: Scene, op: { kind: string; sub?: Vec3[]; stepsAt?: number; pivot: Vec3 | null; bodyId?: string }, v: number, dir: Vec3): Command | null {
  if (!op.sub || v === 0) return null;
  const now = currentCorners(scene, op.sub, op.stepsAt ?? scene.steps.length);
  const pivot = op.kind === "rotate" ? (op.pivot ?? mean(now)) : mean(now);
  const to = now.map((p): Vec3 => (op.kind === "rotate" ? turned(p, pivot, dir, v) : [p[0] + dir[0] * v, p[1] + dir[1] * v, p[2] + dir[2] * v]));
  const params: Record<string, string | number> = { moves: textOf(now.map((from, i) => ({ from, to: to[i]! }))) };
  if (op.bodyId) params.body = op.bodyId;
  return { type: "addStep", step: { id: nextId(scene, "s"), type: "reshape", parts: [], params } };
}

/** The name of the body for the step: none when the model has one body. */
export const bodyIdOf = (scene: Scene, body: Ref): string | undefined => {
  const b = scene.parts[body];
  return body !== BODY_OBJECT && b?.kind === "body" && b.id ? b.id : undefined;
};

// Mates between bodies as relations (`in_314`, `in_315`, `dec_body_mates`): what a mate says (two faces, a kind, a gap), found again when the bodies change, and whether it is still true. Pure; the scene in, facts out.
// A mate relation names the two bodies and keeps how the faces stand when it is true: for each, its direction, a point on it and (a round face) its radius. The faces are found again by those, as anchors are.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot, normalize } from "../math/vec.ts";
import type { Scene, Relation } from "./scene.ts";
import { lookup } from "./scene.ts";
import type { Part } from "./part.ts";
import { normalOfPlane, roundOf } from "./part.ts";

/** flush: face on face with a gap; coaxial: round face on round face; parallel: only turned until the flat faces are parallel; parallelAxes: only turned until the axes of the round faces are parallel (`in_317`) */
export type MateMode = "flush" | "coaxial" | "parallel" | "parallelAxes";
const MODES: MateMode[] = ["flush", "coaxial", "parallel", "parallelAxes"];
const modeOf = (n: number | undefined): MateMode => MODES[n ?? 0] ?? "flush";
const numberOfMode = (m: MateMode): number => MODES.indexOf(m);
/** Does the mate join flat faces (else round ones)? */
export const isFlatMode = (m: MateMode): boolean => m === "flush" || m === "parallel";
const MATE_KIND = "mate";
/** A face of a body as something to mate: a flat face by a point on it and its outward normal; a round face by a point on its axis, the axis and its radius. */
export interface MateFeature { ref: Ref; body: Ref; bodyId: string; point: Vec3; dir: Vec3; radius: number }

export function featureOf(scene: Scene, ref: Ref, mode: MateMode): MateFeature | null {
  const p = scene.parts[ref];
  if (p?.kind !== "plane" || p.origin !== "body" || !p.of) return null;
  const body = scene.parts[p.of];
  if (body?.kind !== "body" || !body.id) return null;
  if (isFlatMode(mode)) return p.curved || p.round || p.rounded ? null : { ref, body: body.ref, bodyId: body.id, point: p.at, dir: normalOfPlane(p), radius: 0 };
  const r = roundOf(lookup(scene), ref);
  return r?.normal ? { ref, body: body.ref, bodyId: body.id, point: r.center, dir: normalize(r.normal), radius: r.radius } : null;
}

const KEYS = ["x", "y", "z"] as const;
const put = (o: Record<string, number>, prefix: string, f: { point: Vec3; dir: Vec3; radius: number }) => { KEYS.forEach((k, i) => { o[`${prefix}d${k}`] = f.dir[i]!; o[`${prefix}p${k}`] = f.point[i]!; }); o[`${prefix}r`] = f.radius; };
const get = (p: Record<string, number>, prefix: string): { point: Vec3; dir: Vec3; radius: number } => ({ dir: KEYS.map((k) => p[`${prefix}d${k}`] ?? 0) as unknown as Vec3, point: KEYS.map((k) => p[`${prefix}p${k}`] ?? 0) as unknown as Vec3, radius: p[`${prefix}r`] ?? 0 });

/** The relation that records a mate, with the faces as they stand when it is true. */
export function mateRelation(id: string, mode: MateMode, gap: number, mover: MateFeature, other: MateFeature, whenTrue: { mover: { point: Vec3; dir: Vec3 }; other: { point: Vec3; dir: Vec3 } }): Relation {
  const params: Record<string, number> = { mode: numberOfMode(mode), gap };
  put(params, "m", { ...whenTrue.mover, radius: mover.radius });
  put(params, "o", { ...whenTrue.other, radius: other.radius });
  return { id, kind: MATE_KIND, parts: [mover.body, other.body], params, locked: true };
}

const angle = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b)))));
/** The face of a body that looks most like the one the mate remembers (the same way round, nearest to it), or null if none is near enough. */
function findFace(scene: Scene, body: Ref, mode: MateMode, want: { point: Vec3; dir: Vec3; radius: number }): MateFeature | null {
  let best: { f: MateFeature; score: number } | null = null;
  for (const p of Object.values(scene.parts) as Part[]) {
    if (p.kind !== "plane" || p.origin !== "body" || p.of !== body) continue;
    const f = featureOf(scene, p.ref, mode);
    if (!f) continue;
    const turn = mode === "flush" ? angle(f.dir, want.dir) : Math.min(angle(f.dir, want.dir), Math.PI - angle(f.dir, want.dir)); // (a flush face has its way round; a round face's axis, and a face that is only parallel, have none)
    const loose = mode === "parallel" || mode === "parallelAxes"; // (a parallel mate is about the turn: the face may have been turned a good way since, and is still the one)
    if (turn > (loose ? 0.8 : 0.14)) continue; // (more than eight degrees from it, or forty-five for a parallel mate)
    const d = sub(f.point, want.point);
    const along = dot(d, want.dir);
    const score = (isFlatMode(mode) ? Math.abs(along) : Math.hypot(d[0] - want.dir[0] * along, d[1] - want.dir[1] * along, d[2] - want.dir[2] * along) + Math.abs(f.radius - want.radius)) + (loose ? 5 : 30) * turn;
    if (!best || score < best.score) best = { f, score };
  }
  return best && best.score <= 10 ? best.f : null;
}

export interface MateState {
  id: string;
  mode: MateMode;
  gap: number;
  /** ok: still true; off: the faces are there but no longer as mated; lost: a body or a face is gone */
  state: "ok" | "off" | "lost";
  /** the faces now (when found) */
  mover?: MateFeature;
  other?: MateFeature;
  /** how far from true: mm along the faces' normal or across the axes; degrees for a parallel mate */
  residual?: number;
  unit?: "mm" | "deg";
}

/** Whether each mate of the scene is still true. */
export function mateStatus(scene: Scene): MateState[] {
  const out: MateState[] = [];
  for (const rel of scene.relations) {
    if (rel.kind !== MATE_KIND || !rel.params) continue;
    const mode = modeOf(rel.params.mode);
    const gap = rel.params.gap ?? 0;
    const base = { id: rel.id, mode, gap };
    const [mb, ob] = rel.parts;
    if (!mb || !ob || scene.parts[mb]?.kind !== "body" || scene.parts[ob]?.kind !== "body") { out.push({ ...base, state: "lost" }); continue; }
    const [mover, other] = [findFace(scene, mb, mode, get(rel.params, "m")), findFace(scene, ob, mode, get(rel.params, "o"))];
    if (!mover || !other) { out.push({ ...base, state: "lost", ...(mover ? { mover } : {}), ...(other ? { other } : {}) }); continue; }
    let residual: number;
    let ok: boolean;
    let unit: "mm" | "deg" = "mm";
    if (mode === "flush") {
      residual = Math.abs(dot(sub(mover.point, other.point), other.dir) - gap);
      ok = residual < 1e-3 && angle(mover.dir, [-other.dir[0], -other.dir[1], -other.dir[2]]) <= 1e-4;
    } else if (mode === "coaxial") {
      const w = sub(mover.point, other.point);
      const along = dot(w, other.dir);
      residual = Math.hypot(w[0] - other.dir[0] * along, w[1] - other.dir[1] * along, w[2] - other.dir[2] * along);
      ok = residual < 1e-3 && Math.min(angle(mover.dir, other.dir), Math.PI - angle(mover.dir, other.dir)) <= 1e-4;
    } else { // only parallel
      const a = Math.min(angle(mover.dir, other.dir), Math.PI - angle(mover.dir, other.dir));
      residual = (a * 180) / Math.PI;
      unit = "deg";
      ok = a <= 1e-4;
    }
    out.push({ ...base, state: ok ? "ok" : "off", mover, other, residual, unit });
  }
  return out;
}

/** The middle of a face of the body (the middle of its triangles), or where its plane is when it has none: where a mark for a mate goes. */
export function faceMiddle(scene: Scene, ref: Ref): Vec3 | null {
  const p = scene.parts[ref];
  if (p?.kind !== "plane") return null;
  const m = p.mesh;
  if (!m || m.length < 9) return p.at;
  let [x, y, z, n] = [0, 0, 0, 0];
  for (let i = 0; i + 2 < m.length; i += 3) { x += m[i]!; y += m[i + 1]!; z += m[i + 2]!; n++; }
  return [x / n, y / n, z / n];
}

/** The mate already recorded between these two bodies of this kind, if any: making it again with another gap replaces it. */
export function existingMate(scene: Scene, mode: MateMode, mover: Ref, other: Ref): string | null {
  return scene.relations.find((r) => r.kind === MATE_KIND && r.parts[0] === mover && r.parts[1] === other && modeOf(r.params?.mode) === mode)?.id ?? null;
}

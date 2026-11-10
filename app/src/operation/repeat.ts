// A repeat of a drawn figure that keeps its numbers (`in_257`, `q_repeat_parameters`): the scene holds a record (the parts repeated, the plane, the numbers) and the copies are made from it each time the scene is
// derived, so they follow the original and can be changed by changing the numbers. A copy's name says which copy of which part it is (`d/q_003.c2_e_001_c`), so a step made from copy 2 still finds it when the
// count goes from 4 to 6. The copies are locked (they are the repeat's, not drawn); "break the repeat" frees them as ordinary parts. Pure: scenes in, scenes out.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, sub, dot, cross } from "../math/vec.ts";
import { about } from "../math/rotation.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene } from "./scene.ts";
import { figureRefs } from "./scene.ts";
import type { Part } from "./part.ts";
import { normalOfPlane } from "./part.ts";

/** `params` are the numbers of the repeat tool: linear [nX, dX, nY, dY, nZ, dZ] (how many along each axis, how far apart), circular [count, degrees, axis (0 X, 1 Y, 2 Z), x, y, z of the point it turns about]. */
export interface PatternRecord { id: string; kind: "linear" | "circular"; parts: Ref[]; plane: Ref; params: number[] }

export const patternsOf = (s: Scene): readonly PatternRecord[] => s.patterns ?? [];
const MOST = 200;

export interface Placement { move: Vec3; turn: { axis: 0 | 1 | 2; angle: number; pivot: Vec3 } | null }
/** The copies of a repeat as the places they go to: how far each is moved, or turned about the axis through the point (the original, the first, is not in the list). Too many copies make none. */
export function placements(kind: "linear" | "circular", v: readonly number[]): Placement[] {
  if (v.length < 6) return [];
  const out: Placement[] = [];
  if (kind === "linear") {
    const [nx, ny, nz] = [Math.max(1, Math.round(v[0]!)), Math.max(1, Math.round(v[2]!)), Math.max(1, Math.round(v[4]!))];
    if (nx * ny * nz > MOST) return [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) if (i || j || k) out.push({ move: [i * v[1]!, j * v[3]!, k * v[5]!], turn: null });
    return out;
  }
  const count = Math.max(1, Math.round(v[0]!));
  if (count > MOST) return [];
  const angle = v[1]!;
  const step = Math.abs(angle) >= 360 ? angle / count : count > 1 ? angle / (count - 1) : 0;
  const axis = Math.min(2, Math.max(0, Math.round(v[2]!))) as 0 | 1 | 2;
  for (let i = 1; i < count; i++) out.push({ move: [0, 0, 0], turn: { axis, angle: step * i, pivot: [v[3]!, v[4]!, v[5]!] } });
  return out;
}
const turnVec = (v: Vec3, axis: 0 | 1 | 2, angle: number): Vec3 => { const m = about(axis, angle); return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; };

const nameOf = (id: string, k: number, r: Ref): Ref => drawnRef(`${id}.c${k}_${r.slice(2).replace(/[./]/g, "_")}`);
const planeName = (id: string, k: number): Ref => drawnRef(`${id}.p${k}`);
/** Whether this part is made by the repeat `id` (a copy, or a plane of one). */
const isMade = (id: string, ref: Ref): boolean => ref.startsWith(`d/${id}.c`) || ref.startsWith(`d/${id}.p`);

/** The parts of a repeat's copies: the corners, lines, circles of each copy, and a plane for each copy that does not lie on the original's. Locked. Empty if the original is not there or the numbers make no copy. */
function copiesOf(s: Scene, rec: PatternRecord): Part[] {
  const plane = s.parts[rec.plane];
  if (!plane || plane.kind !== "plane") return [];
  const sources = rec.parts.map((r) => s.parts[r]).filter((p): p is Part => !!p && (p.kind === "corner" || p.kind === "line" || p.kind === "circle") && !(p.kind !== "circle" && p.derived));
  const corners = new Set(sources.filter((p) => p.kind === "corner").map((p) => p.ref));
  const n0 = normalOfPlane(plane);
  const out: Part[] = [];
  placements(rec.kind, rec.params).forEach((c, k) => {
    const place = (p: Vec3): Vec3 => (c.turn ? add(c.turn.pivot, turnVec(sub(p, c.turn.pivot), c.turn.axis, c.turn.angle)) : add(p, c.move));
    const at2 = place(plane.at);
    const u2 = c.turn ? turnVec(plane.u, c.turn.axis, c.turn.angle) : plane.u;
    const v2 = c.turn ? turnVec(plane.v, c.turn.axis, c.turn.angle) : plane.v;
    const n2 = c.turn ? turnVec(n0, c.turn.axis, c.turn.angle) : n0;
    const same = Math.abs(dot(n2, n0) - 1) < 1e-9 && Math.abs(dot(sub(at2, plane.at), n0)) < 1e-9;
    let target: Ref = plane.ref;
    if (!same) {
      target = planeName(rec.id, k);
      out.push({ ref: target, kind: "plane", origin: "drawn", plane: null, movable: false, at: at2, u: u2, v: v2 });
    }
    const base = { origin: "drawn" as const, plane: target, movable: false };
    for (const p of sources) if (p.kind === "corner") out.push({ ...base, ref: nameOf(rec.id, k, p.ref), kind: "corner", at: place(p.at) });
    for (const p of sources) {
      if (p.kind === "line" && corners.has(p.a) && corners.has(p.b) && (!p.center || corners.has(p.center))) out.push({ ...base, ref: nameOf(rec.id, k, p.ref), kind: "line", a: nameOf(rec.id, k, p.a), b: nameOf(rec.id, k, p.b), ...(p.bulge ? { bulge: p.bulge } : {}), ...(p.center ? { center: nameOf(rec.id, k, p.center), ccw: p.ccw } : {}) });
      else if (p.kind === "circle" && corners.has(p.center)) out.push({ ...base, ref: nameOf(rec.id, k, p.ref), kind: "circle", center: nameOf(rec.id, k, p.center), radius: p.radius });
    }
  });
  return out;
}

/** The scene with the copies of its repeats made again from the originals as they are now (the old copies taken out first). */
export function withPatterns(s: Scene): Scene {
  const recs = patternsOf(s);
  if (!recs.length) return s;
  const parts: Record<string, Part> = {};
  for (const p of Object.values(s.parts)) if (!recs.some((r) => isMade(r.id, p.ref))) parts[p.ref] = p;
  const made = { ...s, parts };
  for (const r of recs) for (const p of copiesOf(made, r)) parts[p.ref] = p;
  return made;
}

/** The repeat a part belongs to, as a copy (or a face made of copies) or as an original, if it does. */
function patternOf(s: Scene, ref: Ref): PatternRecord | undefined {
  return patternsOf(s).find((r) => r.parts.includes(ref) || isMade(r.id, ref) || ref.includes(`@${r.id}.c`));
}
/** The one repeat that all of these belong to, or null (nothing selected, or parts of different repeats, or something that is not in one). */
export function patternOfAll(s: Scene, refs: readonly Ref[]): PatternRecord | null {
  const found = refs.map((r) => patternOf(s, r));
  return found.length && found.every((r) => r && r === found[0]) ? found[0]! : null;
}

export function addPattern(s: Scene, rec: PatternRecord): Result<Scene> {
  if (patternsOf(s).some((r) => r.id === rec.id)) return err(`repeat ${rec.id} already exists`);
  if (!(rec.plane in s.parts)) return err(`plane ${rec.plane} does not exist`);
  if (!rec.parts.some((r) => s.parts[r]?.kind === "corner" || s.parts[r]?.kind === "circle")) return err("there is nothing to repeat");
  for (const r of rec.parts) { if (!(r in s.parts)) return err(`${r} does not exist`); if (patternOf(s, r)) return err(`${r} is already repeated by another repeat or is a copy`); }
  return ok({ ...s, patterns: [...patternsOf(s), { ...rec, parts: [...rec.parts], params: [...rec.params] }] });
}

/** Why a part's removal from the scene is refused: something is made from it. */
const useOf = (s: Scene, gone: ReadonlySet<Ref>): string | null => {
  const rel = s.relations.find((r) => r.parts.some((q) => gone.has(q)));
  if (rel) return `a constraint (${rel.kind}) uses a copy that would go`;
  const st = s.steps.find((x) => [...x.parts, ...figureRefs(x)].some((q) => gone.has(q)));
  return st ? `step ${st.id} is made from a copy that would go` : null;
};
/** New numbers for a repeat. Refused if a copy that is used (by a constraint or a step) would be gone, naming what uses it: the copies that stay keep their names. */
export function setPattern(s: Scene, id: string, params: readonly number[]): Result<Scene> {
  const rec = patternsOf(s).find((r) => r.id === id);
  if (!rec) return err(`repeat ${id} does not exist`);
  const next = { ...rec, params: [...params] };
  const after = new Set(copiesOf(s, next).map((p) => p.ref));
  const lost = new Set(Object.keys(s.parts).filter((r) => isMade(id, r as Ref) && !after.has(r as Ref)) as Ref[]);
  const why = useOf(s, lost);
  if (why) return err(`that would take away copies: ${why}`);
  return ok({ ...s, patterns: patternsOf(s).map((r) => (r === rec ? next : r)) });
}
/** Break a repeat: the copies stay, as ordinary parts that can be moved and drawn on. */
export function breakPattern(s: Scene, id: string): Result<Scene> {
  if (!patternsOf(s).some((r) => r.id === id)) return err(`repeat ${id} does not exist`);
  const parts: Record<string, Part> = {};
  for (const p of Object.values(s.parts)) parts[p.ref] = isMade(id, p.ref) && p.origin === "drawn" && p.kind !== "plane" ? { ...p, movable: true } : p;
  return ok({ ...s, parts, patterns: patternsOf(s).filter((r) => r.id !== id) });
}
/** After parts are deleted: they leave the repeats that had them as originals; a repeat with nothing left to repeat goes, and the constraints on its copies with it. */
export function patternsWithout(s: Scene, gone: ReadonlySet<Ref>): Scene {
  const recs = patternsOf(s);
  if (!recs.some((r) => r.parts.some((q) => gone.has(q)))) return s;
  const next = recs.map((r) => ({ ...r, parts: r.parts.filter((q) => !gone.has(q)) })).filter((r) => r.parts.some((q) => s.parts[q]?.kind === "corner" || s.parts[q]?.kind === "circle"));
  const alive = (ref: Ref) => !recs.some((r) => isMade(r.id, ref)) || next.some((r) => isMade(r.id, ref));
  return { ...s, patterns: next, parts: Object.fromEntries(Object.entries(s.parts).filter(([k]) => alive(k as Ref))), relations: s.relations.filter((rel) => rel.parts.every(alive)) };
}

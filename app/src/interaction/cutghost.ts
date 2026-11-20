// The ghost "negative body" of a cut (`dec_cut_tools`, `in_1348`): the tool of an extrude step that cuts, drawn from its figure by arithmetic (no kernel), and the parts a click on it selects (its figure), so a cut is seen, picked and
// moved as a body is. Pure: a scene in, triangles out.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, sub, scale, dot, cross, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { figuresOf, figureDepths } from "../operation/scene.ts";
import type { Part } from "../operation/part.ts";
import { normalOfPlane } from "../operation/part.ts";
import { triangulate } from "../operation/polygon.ts";
import { figurePoints } from "./revolve.ts";

export interface CutGhost {
  /** the step that cuts */
  step: string;
  /** what a click on the ghost selects: the faces of the cut's figures */
  parts: Ref[];
  /** the triangles of the tool, flat xyz */
  tris: number[];
  both: boolean;
}

type Face = Extract<Part, { kind: "face" }>;
/** The drawn face a figure (the refs of its sides, or its circle) is the outline of. */
function faceOf(scene: Scene, outer: readonly Ref[]): Face | undefined {
  const set = new Set<Ref>(outer);
  for (const q of Object.values(scene.parts)) {
    if (q.kind !== "face" || q.origin !== "drawn") continue;
    if (q.disk ? set.has(q.disk) : q.loop.length === set.size && q.loop.every((l) => set.has(l))) return q;
  }
  return undefined;
}

/** The triangles of one figure extruded from its plane by `from` to `to` along its normal (the caps and the sides). */
function prism(scene: Scene, face: Face, from: number, to: number): number[] {
  const pl = face.plane ? scene.parts[face.plane] : undefined;
  if (!pl || pl.kind !== "plane") return [];
  const pts = figurePoints(scene, face);
  if (pts.length < 3) return [];
  const n = normalize(normalOfPlane(pl));
  const [u, v] = [normalize(pl.u), normalize(cross(n, normalize(pl.u)))];
  const at = (p: Vec3, d: number): Vec3 => add(p, scale(n, d));
  const out: number[] = [];
  const poly = pts.map((q): [number, number] => { const w = sub(q, pl.at); return [dot(w, u), dot(w, v)]; });
  const idx = triangulate(poly);
  for (const [d] of [[from], [to]] as const) for (const i of idx) out.push(...at(pts[i]!, d));
  for (let i = 0; i < pts.length; i++) {
    const [a, b] = [pts[i]!, pts[(i + 1) % pts.length]!];
    out.push(...at(a, from), ...at(b, from), ...at(b, to), ...at(a, from), ...at(b, to), ...at(a, to));
  }
  return out;
}

const kept = new WeakMap<Scene, CutGhost[]>();
/** The ghost of every cut step (an extrude that cuts, with its figures drawn on a plane); kept while the scene is the same object. */
export function cutGhosts(scene: Scene): CutGhost[] {
  const hit = kept.get(scene);
  if (hit) return hit;
  const made = ghostsOf(scene);
  kept.set(scene, made);
  return made;
}
function ghostsOf(scene: Scene): CutGhost[] {
  const out: CutGhost[] = [];
  for (const st of scene.steps) {
    if (st.type !== "extrude" || st.params.mode !== "cut") continue;
    const depths = figureDepths(st);
    const both = Number(st.params.both ?? 0) === 1;
    const tris: number[] = [];
    const parts: Ref[] = [];
    figuresOf(st).forEach((fig, i) => {
      const face = faceOf(scene, fig.outer);
      if (!face) return;
      const d = depths[i] ?? 0;
      tris.push(...prism(scene, face, both ? -Math.abs(d) : 0, both ? Math.abs(d) : d));
      parts.push(face.ref);
    });
    if (tris.length) out.push({ step: st.id, parts, tris, both });
  }
  return out;
}

/** The nearest ghost a ray goes through (Möller–Trumbore on its triangles), its distance along the ray, or null. */
export function ghostHit(ghosts: readonly CutGhost[], origin: Vec3, dir: Vec3): { ghost: CutGhost; t: number } | null {
  let best: { ghost: CutGhost; t: number } | null = null;
  for (const g of ghosts) {
    const T = g.tris;
    for (let i = 0; i + 8 < T.length; i += 9) {
      const p0: Vec3 = [T[i]!, T[i + 1]!, T[i + 2]!], p1: Vec3 = [T[i + 3]!, T[i + 4]!, T[i + 5]!], p2: Vec3 = [T[i + 6]!, T[i + 7]!, T[i + 8]!];
      const e1 = sub(p1, p0), e2 = sub(p2, p0);
      const h = cross(dir, e2);
      const a = dot(e1, h);
      if (Math.abs(a) < 1e-12) continue;
      const f = 1 / a, s = sub(origin, p0);
      const u = f * dot(s, h);
      if (u < 0 || u > 1) continue;
      const q = cross(s, e1);
      const w = f * dot(dir, q);
      if (w < 0 || u + w > 1) continue;
      const t = f * dot(e2, q);
      if (t > 1e-9 && (!best || t < best.t)) best = { ghost: g, t };
    }
  }
  return best;
}

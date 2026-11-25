// The helpers of drawing, as one rule set (`in_1579`, `dec_helpers_one_rule`; the old app's hints and guides, `dec_hints_place_only`): pure, over the engine's definition.
//   A helper is a LOCUS: a point or a line in the sketch plane that the place being drawn is drawn toward, from a SOURCE (a part of the sketch, or the figure's own first place).
//   Where they come from (the only list): every point of the sketch gives its level and its upright line (guided); every drawn line gives its middle;
//   from the figure's first place: the level and upright lines, the parallel and square line to every drawn line, the two tangent lines to every circle and arc.
//   What they do (the only rule): a point within 12 px takes the place; else the nearest line within 6 px takes it (the foot of the pointer on it), then one more line, not parallel, within 6 px of that: the place is where they cross. No constraint is made.
//   How they show (the only look): a guided locus is a dashed teal line from its source to the place; the part a helper is about is lit amber; the middle of a circle under the place has a dashed cross through it.
import type { SketchParams } from "../engine/sketch.ts";
import { segsOf } from "../engine/definition.ts";
import type { Pt } from "../engine/region.ts";
import type { Sol } from "./drawing.ts";

export type HelperName = "aligned" | "horizontal" | "vertical" | "parallel" | "perpendicular" | "tangent" | "midpoint";
/** a point (`at`) or a line (`from`, unit `dir`); `part` the part it is about; `guided`: shown as a dashed line from `from`; `far`: only once the place is some way from `from` */
export interface Locus { name: HelperName; part?: string; at?: Pt; from?: Pt; dir?: Pt; guided?: boolean; far?: boolean }
export interface Helped { at: Pt; held: Locus[] }
export const POINT_PX = 12, LINE_PX = 6;

const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const unit = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };

/** every locus there is for a sketch and the first place of the figure (null before it) */
export function lociOf(p: SketchParams, s: Sol, start: Pt | null): Locus[] {
  const out: Locus[] = [], segs = segsOf(p, s.points, s.radii);
  for (const g of segs) if (g.kind === "line") out.push({ name: "midpoint", part: g.name, at: [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2] });
  for (const q of p.points) { const c = s.points[q.id]; if (c) for (const dir of [[1, 0], [0, 1]] as Pt[]) out.push({ name: "aligned", from: c, dir, guided: true }); }
  if (!start) return out;
  const through = (name: HelperName, dir: Pt, part?: string) => out.push({ name, from: start, dir, far: true, ...(part ? { part } : {}) });
  through("horizontal", [1, 0]); through("vertical", [0, 1]);
  for (const g of segs) {
    if (g.kind === "line") { const d = unit(sub(g.b, g.a)); if (Number.isFinite(d[0])) { through("parallel", d, g.name); through("perpendicular", [-d[1], d[0]], g.name); } continue; }
    const c = sub(g.c, start), dist = Math.hypot(c[0], c[1]);
    if (dist < 1e-9) continue;
    const phi = Math.atan2(c[1], c[0]);
    if (Math.abs(dist - g.r) < 1e-6 * (1 + g.r)) through("tangent", [Math.cos(phi + Math.PI / 2), Math.sin(phi + Math.PI / 2)], g.name); // (on its edge: along it)
    else if (dist > g.r) { const a = Math.asin(g.r / dist); through("tangent", [Math.cos(phi + a), Math.sin(phi + a)], g.name); through("tangent", [Math.cos(phi - a), Math.sin(phi - a)], g.name); }
  }
  return out;
}

/** the place the pointer `q` is drawn to; `mm` is the size of a pixel there */
export function place(p: SketchParams, s: Sol, start: Pt | null, q: Pt, mm: number): Helped {
  const loci = lociOf(p, s, start);
  for (const l of loci) if (l.at && Math.hypot(q[0] - l.at[0], q[1] - l.at[1]) < POINT_PX * mm) return { at: l.at, held: [l] };
  let at = q; const held: Locus[] = [];
  for (let round = 0; round < 2; round++) {
    let best: Locus | null = null, bd = LINE_PX * mm;
    for (const l of loci) {
      if (!l.dir || !l.from || held.includes(l)) continue;
      if (l.far && Math.hypot(at[0] - l.from[0], at[1] - l.from[1]) < 2 * LINE_PX * mm) continue;
      if (round === 1 && Math.abs(cross(held[0]!.dir!, l.dir)) < 0.3) continue;
      const d = Math.abs(cross(sub(at, l.from), l.dir));
      if (d < bd - 1e-12) { bd = d; best = l; }
    }
    if (!best) break;
    if (round === 0) { const t = (at[0] - best.from![0]) * best.dir![0] + (at[1] - best.from![1]) * best.dir![1]; at = [best.from![0] + t * best.dir![0], best.from![1] + t * best.dir![1]]; }
    else { const a = held[0]!, t = cross(sub(best.from!, a.from!), best.dir!) / cross(a.dir!, best.dir!); at = [a.from![0] + t * a.dir![0], a.from![1] + t * a.dir![1]]; }
    held.push(best);
  }
  return { at, held };
}

export interface Shown { kind: "guide" | "tie"; pts: Pt[] }
/** how a placed helper looks: the guided loci dashed from their source to the place, the parts lit amber (`shape` is a part's line as points); `centre` the circle or arc whose middle the place is on */
export function showOf(p: SketchParams, s: Sol, placed: Helped, shape: (part: string) => Pt[] | null, centre: string | null): Shown[] {
  const out: Shown[] = [];
  for (const l of placed.held) {
    if (l.guided && l.from) out.push({ kind: "guide", pts: [l.from, placed.at] });
    const g = l.part ? shape(l.part) : null; if (g) out.push({ kind: "tie", pts: g });
  }
  if (centre) for (const k of [...(p.circles ?? []), ...(p.arcs ?? [])]) {
    if (k.c !== centre) continue; const m = s.points[k.c], r = s.radii[k.id]; if (!m || !r) continue;
    for (const d of [[1, 0], [0, 1]] as Pt[]) out.push({ kind: "guide", pts: [[m[0] - d[0] * r * 1.25, m[1] - d[1] * r * 1.25], [m[0] + d[0] * r * 1.25, m[1] + d[1] * r * 1.25]] });
  }
  return out;
}

// The helpers of drawing (`in_1574`, `dec_hints_place_only`; the old app's `interaction/hints.ts`, `hold.ts`, recoded over the engine's definition): while a figure is drawn, the place under the pointer is lined up with what is there and the person is told what it is lined up with. A helper
// helps position: it moves the place, shows a cue, and makes **no constraint** (the person asks for those). Pure: the definition, the first place of the line and the pointer's place in; the place, the hints, the dashed guides and the parts lit out.
//   level or upright with the first place, parallel or square to a line already drawn: within 4 degrees the end takes that direction exactly
//   in line with a corner that is there (level or upright), within 6 px: the place takes its coordinate, with a dashed guide drawn to it
//   the middle of a drawn line, within 10 px: the place takes it
import type { SketchParams } from "../engine/sketch.ts";
import { segsOf } from "../engine/definition.ts";
import type { Pt } from "../engine/region.ts";
import type { Sol } from "./drawing.ts";

export type HintKind = "horizontal" | "vertical" | "parallel" | "perpendicular" | "tangent" | "midpoint";
export interface Hint { kind: HintKind; /** the part the hint is about, lit while it holds (a parallel's line, a midpoint's line) */ part?: string }
export interface Hinted { at: Pt; hints: Hint[]; /** dashed lines from the corner a place is lined up with, to the place */ guides: [Pt, Pt][] }
const HINT_DEG = 4, ALIGN_PX = 6, MID_PX = 10;

/** the place lined up: `start` is the first place of the line under way (null: before the first click); `mm` is the size of a pixel in mm there */
export function hintAt(p: SketchParams, s: Sol, start: Pt | null, q: Pt, mm: number): Hinted {
  let at: Pt = [q[0], q[1]]; const hints: Hint[] = [], guides: [Pt, Pt][] = [];
  const segs = segsOf(p, s.points, s.radii).filter((g) => g.kind === "line");
  // the middle of a drawn line
  for (const g of segs) if (g.kind === "line") { const m: Pt = [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2]; if (Math.hypot(q[0] - m[0], q[1] - m[1]) < MID_PX * mm) { return { at: m, hints: [{ kind: "midpoint", part: g.name }], guides: [] }; } }
  // direction from the first place of the line: level, upright, parallel or square to a line there
  if (start) {
    const dx = q[0] - start[0], dy = q[1] - start[1], len = Math.hypot(dx, dy);
    if (len > 1e-9) {
      const ang = Math.atan2(dy, dx), cands: { th: number; hint: Hint }[] = [
        { th: 0, hint: { kind: "horizontal" } }, { th: Math.PI, hint: { kind: "horizontal" } }, { th: Math.PI / 2, hint: { kind: "vertical" } }, { th: -Math.PI / 2, hint: { kind: "vertical" } },
        ...segs.flatMap((g): { th: number; hint: Hint }[] => { if (g.kind !== "line") return []; const th = Math.atan2(g.b[1] - g.a[1], g.b[0] - g.a[0]); return [
          ...[th, th + Math.PI].map((t) => ({ th: t, hint: { kind: "parallel", part: g.name } as Hint })),
          ...[th + Math.PI / 2, th - Math.PI / 2].map((t) => ({ th: t, hint: { kind: "perpendicular", part: g.name } as Hint })),
        ]; }),
      ];
      // tangent to a circle or arc (the old app's `tangent`): from outside it, the two directions that just touch; from a point on its edge, along the edge
      for (const g of segsOf(p, s.points, s.radii)) {
        if (g.kind !== "arc") continue;
        const cx = g.c[0] - start[0], cy = g.c[1] - start[1], d = Math.hypot(cx, cy);
        if (d < 1e-9) continue;
        if (Math.abs(d - g.r) < ALIGN_PX * mm * 0.5) { const th = Math.atan2(cy, cx) + Math.PI / 2; for (const t of [th, th + Math.PI]) cands.push({ th: t, hint: { kind: "tangent", part: g.name } }); }
        else if (d > g.r) { const phi = Math.atan2(cy, cx), a = Math.asin(g.r / d); for (const t of [phi + a, phi - a]) cands.push({ th: t, hint: { kind: "tangent", part: g.name } }); }
      }
      const turn = (a: number, b: number) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
      let best: { th: number; hint: Hint } | null = null, bd = (HINT_DEG * Math.PI) / 180;
      for (const c of cands) { const d = turn(ang, c.th); if (d < bd - 1e-12) { bd = d; best = c; } }
      if (best) { at = [start[0] + len * Math.cos(best.th), start[1] + len * Math.sin(best.th)]; hints.push(best.hint); }
    }
  }
  // in line with a corner that is there, level or upright, when the direction has not already been chosen
  if (!hints.length) {
    for (const pt of p.points) {
      const c = s.points[pt.id]; if (!c) continue;
      if (Math.abs(at[1] - c[1]) < ALIGN_PX * mm && Math.abs(at[0] - c[0]) > ALIGN_PX * mm) { at = [at[0], c[1]]; guides.push([c, at]); break; }
    }
    for (const pt of p.points) {
      const c = s.points[pt.id]; if (!c) continue;
      if (Math.abs(at[0] - c[0]) < ALIGN_PX * mm && Math.abs(at[1] - c[1]) > ALIGN_PX * mm) { at = [c[0], at[1]]; guides.push([c, at]); break; }
    }
  }
  return { at, hints, guides };
}

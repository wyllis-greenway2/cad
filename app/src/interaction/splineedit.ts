// Adding and taking away the points of a spline (`dec_spline_and_cams`): a double click on the curve of a selected spline puts a point there (on the curve, so its shape hardly changes); a double click on one of its
// points takes that point away. Pure: the scene, what is selected and where the pointer is on the screen in; a command (or the reason it cannot be) out.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import { lookup } from "../operation/scene.ts";
import { splineWorld, splineStored, splineEnds, normalOfPlane } from "../operation/part.ts";
import { splineSetCommand } from "../operation/splinering.ts";
import { splinePoints } from "../operation/spline.ts";

const FINE = 64;
export function splineEdit(sc: Scene, sel: readonly Ref[], project: (p: Vec3) => [number, number], x: number, y: number, pointPx: number, linePx: number): Command | string | null {
  const get = lookup(sc);
  for (const r of sel) {
    const line = sc.parts[r];
    if (line?.kind !== "line" || !line.spline) continue;
    const pl = line.plane ? sc.parts[line.plane] : undefined;
    const w = splineWorld(get, line);
    if (!w || pl?.kind !== "plane") continue;
    const normal = normalOfPlane(pl);
    const at = (q: Vec3) => { const [px, py] = project(q); return Math.hypot(px - x, py - y); };
    // on one of its points: that point goes
    let knot = -1, kd = pointPx;
    w.slice(1, -1).forEach((q, k) => { const d = at(q); if (d <= kd) { kd = d; knot = k; } });
    if (knot >= 0) {
      if (w.length <= 3) return "a spline needs at least one point between its ends: to make it straight, draw a line";
      const stored = splineStored(w.filter((_, k) => k !== knot + 1), normal);
      return stored ? splineSetCommand(sc, r, stored) : null;
    }
    // on the curve: a point is put there, between the two points either side of it
    const dense = splinePoints(w, FINE, splineEnds(get, line));
    let best = -1, bd = linePx;
    dense.forEach((q, k) => { const d = at(q); if (d <= bd) { bd = d; best = k; } });
    if (best < 0) continue;
    const span = Math.min(w.length - 2, Math.floor(best / FINE));
    if (best % FINE === 0) continue; // (on a point already: nothing to put there)
    const stored = splineStored([...w.slice(0, span + 1), dense[best]!, ...w.slice(span + 1)], normal);
    return stored ? splineSetCommand(sc, r, stored) : null;
  }
  return null;
}

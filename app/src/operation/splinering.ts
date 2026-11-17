// A closed spline (`dec_spline_and_cams`): a smooth curve that comes back to its start, made of two spline sides between the same two corners, each walking half way round, so a closed shape is always a loop of sides between
// corners as every other shape is. Each half keeps the points of the closed curve just outside its two ends (`Line.around`), so where the halves meet the curve goes on as one, not with a corner; those are kept right when a
// point of either half is moved, added or taken away (`splineSetCommand`).
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { dist } from "../math/vec.ts";
import type { Scene } from "./scene.ts";
import type { Command } from "./commands.ts";
import type { Line } from "./part.ts";
import { lookup } from "./scene.ts";
import { splineWorld, splineStored, normalOfPlane } from "./part.ts";
import { drawChain } from "./build.ts";
import { loopFaceRef } from "./loops.ts";
import { distinctPoints } from "./spline.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";

type Around = NonNullable<Line["around"]>;
/** a point as stored for a spline side that runs from `a` to `b` (along the chord and out from it) */
function inChord(a: Vec3, b: Vec3, q: Vec3, normal: Vec3): [number, number] {
  return splineStored([a, q, b], normal)![0]!;
}
/** the two halves of a ring of points (not repeating the first): from the first point to the one half way round, and on round to the first again, with what lies outside each end */
function halves(ring: readonly Vec3[]): { pts: Vec3[]; before: Vec3; after: Vec3 }[] {
  const n = ring.length;
  const k = Math.floor(n / 2);
  return [
    { pts: ring.slice(0, k + 1), before: ring[n - 1]!, after: ring[k + 1]! },
    { pts: [...ring.slice(k), ring[0]!], before: ring[k - 1]!, after: ring[1]! },
  ];
}
/** The command that draws a closed spline through these points (three or more, the curve coming back from the last to the first), and the face it makes. */
export function drawClosedSpline(scene: Scene, plane: Ref, points: readonly Vec3[], normal: Vec3): Result<{ command: Command; lines: Ref[]; select: Ref[] }> {
  const ring = distinctPoints(points);
  if (ring.length > 1 && dist(ring[0]!, ring[ring.length - 1]!) < 1e-9) ring.pop();
  if (ring.length < 3) return err("a closed curve needs at least three points");
  let cur = scene;
  const commands: Command[] = [];
  const lines: Ref[] = [];
  for (const h of halves(ring)) {
    const stored = splineStored(h.pts, normal);
    if (!stored) return err("the curve's two ends are one point");
    const d = drawChain(cur, plane, [h.pts[0]!, h.pts[h.pts.length - 1]!], false, { reuse: true });
    const around: Around = { before: inChord(h.pts[0]!, h.pts[h.pts.length - 1]!, h.before, normal), after: inChord(h.pts[0]!, h.pts[h.pts.length - 1]!, h.after, normal) };
    const made: Command[] = [];
    for (const c2 of (d.command as { type: "batch"; commands: Command[] }).commands) made.push(c2.type === "addPart" && c2.part.kind === "line" ? { type: "addPart", part: { ...c2.part, spline: stored, around } } : c2);
    const batch: Command = { type: "batch", commands: made };
    commands.push(batch);
    lines.push(d.lines[0]!);
    const into = (sc: Scene, c2: Command): Scene => (c2.type === "batch" ? c2.commands.reduce(into, sc) : c2.type === "addPart" ? { ...sc, parts: { ...sc.parts, [c2.part.ref]: c2.part } } : sc);
    cur = { ...into(cur, batch), counter: cur.counter + 1 };
  }
  return ok({ command: { type: "batch", commands }, lines, select: [loopFaceRef(lines)] });
}

/** The other half of a closed spline that this side is half of (the spline side that runs between the same two corners the other way round), if any. */
export function otherHalf(scene: Scene, line: Line): Line | null {
  if (!line.around) return null;
  const found = Object.values(scene.parts).find((p): p is Line => p.kind === "line" && p.ref !== line.ref && p.origin === "drawn" && !!p.spline && !!p.around && p.a === line.b && p.b === line.a);
  return found ?? null;
}
/** The command that gives a spline side these points between its ends: when it is half of a closed spline, the points either side of where the two halves meet are made right too, in both. */
export function splineSetCommand(scene: Scene, ref: Ref, spline: [number, number][]): Command {
  const line = scene.parts[ref];
  const plane = line?.kind === "line" && line.plane ? scene.parts[line.plane] : undefined;
  const other = line?.kind === "line" ? otherHalf(scene, line) : null;
  if (line?.kind !== "line" || !other || plane?.kind !== "plane") return { type: "setSpline", ref, spline };
  const now: Scene = { ...scene, parts: { ...scene.parts, [ref]: { ...line, spline } } };
  const get = lookup(now);
  const [wa, wb] = [splineWorld(get, now.parts[ref] as Line), splineWorld(get, other)];
  if (!wa || !wb) return { type: "setSpline", ref, spline };
  const normal = normalOfPlane(plane);
  const mine: Around = { before: inChord(wa[0]!, wa[wa.length - 1]!, wb[wb.length - 2]!, normal), after: inChord(wa[0]!, wa[wa.length - 1]!, wb[1]!, normal) };
  const theirs: Around = { before: inChord(wb[0]!, wb[wb.length - 1]!, wa[wa.length - 2]!, normal), after: inChord(wb[0]!, wb[wb.length - 1]!, wa[1]!, normal) };
  return { type: "batch", commands: [{ type: "setSpline", ref, spline, around: mine }, { type: "setSpline", ref: other.ref, spline: other.spline!, around: theirs }] };
}

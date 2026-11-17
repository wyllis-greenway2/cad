// Revolve with turns and a pitch (`dec_spiral_extrude`, `in_427`, `in_428`): a closed figure turned about a line in its own plane, through any angle, advancing along the line for a spiral. This file is what the
// interaction needs of it: the lines the figure can turn about, the step it makes, and the numbers its bubble shows. The kernel makes the body (`revolve` in `interpreter.mjs`).
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup, nextId, figureParams } from "../operation/scene.ts";
import { formatId } from "../shared/ref.ts";
import type { Part } from "../operation/part.ts";
import { pointOf, loopPoints } from "../operation/part.ts";
import type { Command } from "../operation/commands.ts";
import { typedNumber } from "../shared/numbers.ts";
import { typedLength } from "../shared/units.ts";
import type { Op } from "./operations.ts";

/** The line a figure turns about: a point on it and its direction (unit): the mover's orb and the axis of its frame (`in_438`). */
export interface RevAxis { p: Vec3; d: Vec3; label: string }

/**
 * Where the orb starts (`in_438`): on the longest straight line of the first figure (a line selected with it is the one), really on it, its middle; the mover's axes with X along that line and Z across the figure's
 * plane. A figure with no straight side (a circle) starts at its middle with the plane's own axes. `chosen` is a line selected with the figures.
 */
export function revolveStart(scene: Scene, faces: readonly Extract<Part, { kind: "face" }>[], chosen: readonly Extract<Part, { kind: "line" }>[]): { pivot: Vec3; frame: [Vec3, Vec3, Vec3] } | null {
  const get = lookup(scene);
  const face = faces[0];
  const pl = face?.plane ? get(face.plane) : undefined;
  if (!face || !pl || pl.kind !== "plane") return null;
  const n = normalize(cross3(pl.u, pl.v));
  const straight = (l: Part | undefined): l is Extract<Part, { kind: "line" }> => l?.kind === "line" && !l.center && !l.bulge && !l.spline && !l.circle;
  const own = face.loop.map((r) => get(r)).filter(straight);
  const pool = chosen.filter(straight).length ? chosen.filter(straight) : own;
  let best: { a: Vec3; b: Vec3; len: number } | null = null;
  for (const l of pool) {
    const [a, b] = [pointOf(get, l.a), pointOf(get, l.b)];
    if (!a || !b) continue;
    const len = Math.hypot(...sub(b, a));
    if (!best || len > best.len) best = { a, b, len };
  }
  if (!best || best.len < 1e-9) { const m = middleOf(scene, face); return m ? { pivot: m, frame: [normalize(pl.u), normalize(pl.v), n] } : null; }
  const d = normalize(sub(best.b, best.a));
  return { pivot: scale(add(best.a, best.b), 0.5), frame: [d, cross3(n, d), n] };
}
/** The middle of a drawn figure: a circle's centre, else the mean of its corners. */
export function middleOf(scene: Scene, face: Extract<Part, { kind: "face" }>): Vec3 | null {
  const get = lookup(scene);
  const disk = face.disk ? get(face.disk) : undefined;
  if (disk?.kind === "circle") return pointOf(get, disk.center);
  const corners = face.corners.map((c) => pointOf(get, c)).filter((q): q is Vec3 => !!q);
  return corners.length ? scale(corners.reduce((a, q) => add(a, q), [0, 0, 0] as Vec3), 1 / corners.length) : null;
}
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The line being turned about. */
export const axisOf = (op: Op): RevAxis | null => (op.pivot && op.frame ? { p: op.pivot, d: op.frame[op.axis], label: "the mover's axis" } : null); // (the orb's place and the axis of its frame the person chose, `in_438`)
/** The advance along the axis over the whole turn: what is typed, else what the arrow was dragged to, else none. */
export const advanceOf = (op: Op): number => { const t = typedLength(op.advTyped ?? ""); return t !== null ? t : op.advValue ?? 0; };
/** Where the ring and the arrow stand: the orb, on the axis. */
export const revolveCentre = (op: Op): Vec3 | null => op.pivot ?? null;

/**
 * The step: the figure, the line it turns about (as numbers), the angle and the advance. Null with no angle yet. Several figures selected together are a step each, and so a body each, as for an extrusion (`in_353`),
 * all turned the same; about "each figure's middle" each turns about its own.
 */
export function revolveCommand(scene: Scene, op: Op, angle: number): Command | null {
  const a = axisOf(op);
  if (!a || angle === 0) return null;
  const id = nextId(scene, "s");
  const figs = op.revFigs?.length ? op.revFigs : [{ fig: { outer: op.parts, holes: [] }, middle: op.origin ?? a.p }];
  const first = Number(id.slice(id.lastIndexOf("_") + 1));
  const one = (f: (typeof figs)[number], i: number): Command => {
    const twist = !!op.normal && Math.abs(Math.abs(dot(a.d, op.normal)) - 1) < 1e-9 && !!op.origin && Math.hypot(...sub(a.p, op.origin)) < 1e-6; // (about the plane's normal through the first figure's middle: each figure about its own middle, a twist)
    const at = twist ? f.middle : a.p;
    return { type: "addStep", step: { id: figs.length > 1 ? formatId("s", first + i) : id, type: "revolve", parts: f.fig.outer, params: { ...figureParams([f.fig]), angle, advance: advanceOf(op), ax: at[0], ay: at[1], az: at[2], dx: a.d[0], dy: a.d[1], dz: a.d[2] } } };
  };
  return figs.length > 1 ? { type: "batch", commands: figs.map(one) } : one(figs[0]!, 0);
}

/**
 * Why the turn cannot be made when its axis cuts across a figure (`in_520`): the axis lies in the figure's plane and the figure has parts on both sides of it, so it would turn into itself. Null when the axis is on the
 * figure's edge, outside it, across the plane (a twist) or not in the plane at all (the kernel judges those).
 */
export function axisAcross(scene: Scene, op: Op): string | null {
  const a = axisOf(op);
  if (!a || !op.normal) return null;
  const get = lookup(scene);
  const n = normalize(op.normal);
  const d = normalize(a.d);
  if (Math.abs(dot(d, n)) > 1e-6) return null; // (across the plane: a twist, or tilted)
  const figs = op.revFigs?.length ? op.revFigs.map((f) => f.fig.outer) : [op.parts];
  for (const outer of figs) {
    const face = Object.values(scene.parts).find((q): q is Extract<Part, { kind: "face" }> => q.kind === "face" && q.origin === "drawn" && (q.disk ? outer.length === 1 && q.disk === outer[0] : q.loop.length === outer.length && outer.every((r) => q.loop.includes(r))));
    if (!face) continue;
    const pl = face.plane ? get(face.plane) : undefined;
    if (!pl || pl.kind !== "plane" || Math.abs(dot(sub(a.p, pl.at), n)) > 1e-6) continue; // (an axis off the plane is not across the figure)
    let pts: Vec3[];
    const disk = face.disk ? get(face.disk) : undefined;
    if (disk?.kind === "circle") {
      const c = pointOf(get, disk.center);
      if (!c) continue;
      const [u, v] = [normalize(pl.u), normalize(pl.v)];
      pts = Array.from({ length: 64 }, (_, i) => { const t = (i / 64) * Math.PI * 2; return add(c, add(scale(u, Math.cos(t) * disk.radius), scale(v, Math.sin(t) * disk.radius))); });
    } else pts = loopPoints(get, face.loop, face.corners);
    const across = cross3(n, d); // (in the plane, square to the axis)
    const side = pts.map((q) => dot(sub(q, a.p), across));
    const tol = 1e-6 * Math.max(1, ...side.map(Math.abs));
    if (Math.max(...side) > tol && Math.min(...side) < -tol) return "the axis cuts across the figure, which would turn into itself: put the orb on one of its edges, or out beside it";
  }
  return null;
}

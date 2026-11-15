// Revolve with turns and a pitch (`dec_spiral_extrude`, `in_420`, `in_421`): a closed figure turned about a line in its own plane, through any angle, advancing along the line for a spiral. This file is what the
// interaction needs of it: the lines the figure can turn about, the step it makes, and the numbers its bubble shows. The kernel makes the body (`revolve` in `interpreter.mjs`).
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup, nextId } from "../operation/scene.ts";
import type { Part } from "../operation/part.ts";
import { pointOf } from "../operation/part.ts";
import type { Command } from "../operation/commands.ts";
import { typedNumber } from "../shared/numbers.ts";
import type { Op } from "./operations.ts";

/** A line the figure can turn about: a point on it, its direction (unit), and what to call it. */
export interface RevAxis { p: Vec3; d: Vec3; label: string }

const WORLD: { d: Vec3; label: string }[] = [{ d: [1, 0, 0], label: "X axis" }, { d: [0, 1, 0], label: "Y axis" }, { d: [0, 0, 1], label: "Z axis" }];

/**
 * The lines in the plane of this figure that it can turn about, best first: the line selected with it, the world axes that lie in its plane, then its own straight sides. A line the figure crosses is left out (the
 * turn would lie on itself). `figure` is the figure's corners and, for a circle, its centre and radius.
 */
export function revolveAxes(scene: Scene, face: Extract<Part, { kind: "face" }>, chosen: readonly Extract<Part, { kind: "line" }>[]): RevAxis[] {
  const get = lookup(scene);
  const pl = face.plane ? get(face.plane) : undefined;
  if (!pl || pl.kind !== "plane") return [];
  const n = normalize(cross3(pl.u, pl.v));
  const corners = face.corners.map((c) => pointOf(get, c)).filter((q): q is Vec3 => !!q);
  const disk = face.disk ? get(face.disk) : undefined;
  const round = disk?.kind === "circle" ? { c: pointOf(get, disk.center), r: disk.radius } : null;
  // which side of the line the figure is on: all of it on one side, or it is crossed
  const ok = (a: Vec3, d: Vec3): boolean => {
    const side = (q: Vec3) => { const w = sub(q, a); return dot(w, normalize(cross3(n, d))); };
    if (round?.c) return Math.abs(side(round.c)) >= round.r - 1e-6;
    return corners.length > 0 && (corners.every((q) => side(q) >= -1e-6) || corners.every((q) => side(q) <= 1e-6));
  };
  const out: RevAxis[] = [];
  const add1 = (a: Vec3, b: Vec3, label: string) => {
    const l = Math.hypot(...sub(b, a));
    if (l < 1e-9) return;
    const d = scale(sub(b, a), 1 / l);
    if (Math.abs(dot(d, n)) > 1e-6 || Math.abs(dot(sub(a, pl.at), n)) > 1e-6) return; // (not in the figure's plane)
    if (ok(a, d)) out.push({ p: a, d, label });
  };
  for (const l of chosen) { const [a, b] = [pointOf(get, l.a), pointOf(get, l.b)]; if (a && b && !l.center) add1(a, b, "the line you chose"); }
  for (const w of WORLD) if (Math.abs(dot(w.d, n)) < 1e-9 && Math.abs(dot(pl.at, n)) < 1e-6) { const q = add([0, 0, 0], scale(w.d, 1)); void q; if (ok([0, 0, 0], w.d)) out.push({ p: [0, 0, 0], d: w.d, label: w.label }); }
  face.loop.map((r) => get(r)).filter((x): x is Extract<Part, { kind: "line" }> => x?.kind === "line" && !x.center).forEach((l, i) => { const [a, b] = [pointOf(get, l.a), pointOf(get, l.b)]; if (a && b) add1(a, b, `side ${i + 1}`); });
  return out;
}
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The line being turned about. */
export const axisOf = (op: Op): RevAxis | null => op.revAxes?.[op.axisIx ?? 0] ?? null;
/** The advance along the axis over the whole turn: what is typed, else what the arrow was dragged to, else none. */
export const advanceOf = (op: Op): number => { const t = typedNumber(op.advTyped ?? ""); return t !== null ? t : op.advValue ?? 0; };
/** The point on the axis nearest the figure's middle, where the ring and the arrow stand. */
export function revolveCentre(op: Op): Vec3 | null {
  const a = axisOf(op);
  return a && op.origin ? add(a.p, scale(a.d, dot(sub(op.origin, a.p), a.d))) : null;
}

/** The step: the figure, the line it turns about (as numbers), the angle and the advance. Null with no angle yet. */
export function revolveCommand(scene: Scene, op: Op, angle: number): Command | null {
  const a = axisOf(op);
  if (!a || angle === 0) return null;
  const id = nextId(scene, "s");
  return { type: "addStep", step: { id, type: "revolve", parts: op.parts, params: { angle, advance: advanceOf(op), ax: a.p[0], ay: a.p[1], az: a.p[2], dx: a.d[0], dy: a.d[1], dz: a.d[2] } } };
}

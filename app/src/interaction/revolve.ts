// Revolve with turns and a pitch (`dec_spiral_extrude`, `in_427`, `in_428`): a closed figure turned about a line in its own plane, through any angle, advancing along the line for a spiral. This file is what the
// interaction needs of it: the lines the figure can turn about, the step it makes, and the numbers its bubble shows. The kernel makes the body (`revolve` in `interpreter.mjs`).
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup, nextId, figureParams } from "../operation/scene.ts";
import { formatId } from "../shared/ref.ts";
import type { Part } from "../operation/part.ts";
import { pointOf } from "../operation/part.ts";
import type { Command } from "../operation/commands.ts";
import { typedNumber } from "../shared/numbers.ts";
import type { Op } from "./operations.ts";

/** A line the figure can turn about: a point on it, its direction (unit), and what to call it. */
export interface RevAxis { p: Vec3; d: Vec3; label: string; /** the plane's normal: the figure is carried along it while it turns (a twist) */ twist?: "middle" | "origin"; /** a line through the rotate tool (the sphere put where the person likes, `Op.pivot`) along the figure's own X or Y (`in_433`) */ tool?: "u" | "v" }

const WORLD: { d: Vec3; label: string }[] = [{ d: [1, 0, 0], label: "X axis" }, { d: [0, 1, 0], label: "Y axis" }, { d: [0, 0, 1], label: "Z axis" }];

/**
 * The lines in the plane of this figure that it can turn about, best first: the line selected with it, the world axes that lie in its plane, then its own straight sides. A line the figure crosses is left out (the
 * turn would lie on itself). `figure` is the figure's corners and, for a circle, its centre and radius.
 */
export function revolveAxes(scene: Scene, faces: readonly Extract<Part, { kind: "face" }>[], chosen: readonly Extract<Part, { kind: "line" }>[]): RevAxis[] {
  const get = lookup(scene);
  const face = faces[0];
  const pl = face?.plane ? get(face.plane) : undefined;
  if (!face || !pl || pl.kind !== "plane") return [];
  const n = normalize(cross3(pl.u, pl.v));
  const figs = faces.map((f) => ({ corners: f.corners.map((c) => pointOf(get, c)).filter((q): q is Vec3 => !!q), disk: f.disk ? get(f.disk) : undefined }));
  const middles = faces.map((f) => middleOf(scene, f));
  // which side of the line every figure is on: each all on one side, or it is crossed
  const ok = (a: Vec3, d: Vec3): boolean => {
    const side = (q: Vec3) => { const w = sub(q, a); return dot(w, normalize(cross3(n, d))); };
    return figs.every(({ corners, disk }) => {
      const c = disk?.kind === "circle" ? pointOf(get, disk.center) : null;
      if (disk?.kind === "circle" && c) return Math.abs(side(c)) >= disk.radius - 1e-6;
      return corners.length > 0 && (corners.every((q) => side(q) >= -1e-6) || corners.every((q) => side(q) <= 1e-6));
    });
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
  for (const w of WORLD) if (Math.abs(dot(w.d, n)) < 1e-9 && Math.abs(dot(pl.at, n)) < 1e-6 && ok([0, 0, 0], w.d)) out.push({ p: [0, 0, 0], d: w.d, label: w.label });
  faces.forEach((f, k) => f.loop.map((r) => get(r)).filter((x): x is Extract<Part, { kind: "line" }> => x?.kind === "line" && !x.center).forEach((l, i) => { const [a, b] = [pointOf(get, l.a), pointOf(get, l.b)]; if (a && b) add1(a, b, faces.length > 1 ? `figure ${k + 1} side ${i + 1}` : `side ${i + 1}`); }));
  // the rotate tool: a line through the sphere, which is put wherever the person likes, along the figure's own X or Y (`in_433`)
  if (middles[0]) { out.push({ p: middles[0], d: normalize(pl.u), label: "the tool, along the figure's X", tool: "u" }); out.push({ p: middles[0], d: normalize(pl.v), label: "the tool, along the figure's Y", tool: "v" }); }
  // and the plane's own normal, through each figure's middle or the origin's foot on the plane: the figure is carried along it while it turns, a twisted extrusion (`in_429`)
  if (middles[0]) out.push({ p: middles[0], d: n, label: faces.length > 1 ? "twist about each figure's middle" : "twist about the figure's middle", twist: "middle" });
  out.push({ p: scale(n, dot(pl.at, n)), d: n, label: "twist about the origin", twist: "origin" });
  return out;
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
export const axisOf = (op: Op): RevAxis | null => {
  const a = op.revAxes?.[op.axisIx ?? 0] ?? null;
  if (!a || !a.tool || !op.pivot || !op.normal || !op.origin) return a;
  const off = dot(sub(op.pivot, op.origin), op.normal); // (the sphere is dragged on the screen: its foot on the figure's plane)
  return { ...a, p: sub(op.pivot, scale(op.normal, off)) };
};
/** The advance along the axis over the whole turn: what is typed, else what the arrow was dragged to, else none. */
export const advanceOf = (op: Op): number => { const t = typedNumber(op.advTyped ?? ""); return t !== null ? t : op.advValue ?? 0; };
/** The point on the axis nearest the figure's middle, where the ring and the arrow stand. */
export function revolveCentre(op: Op): Vec3 | null {
  const a = axisOf(op);
  return a && op.origin ? add(a.p, scale(a.d, dot(sub(op.origin, a.p), a.d))) : null;
}

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
    const at = a.twist === "middle" ? f.middle : a.p;
    return { type: "addStep", step: { id: figs.length > 1 ? formatId("s", first + i) : id, type: "revolve", parts: f.fig.outer, params: { ...figureParams([f.fig]), angle, advance: advanceOf(op), ax: at[0], ay: at[1], az: at[2], dx: a.d[0], dy: a.d[1], dz: a.d[2] } } };
  };
  return figs.length > 1 ? { type: "batch", commands: figs.map(one) } : one(figs[0]!, 0);
}

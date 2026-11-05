// The drawing tools (`dec_interaction_spec`, "Drawing and relations"): rectangle, circle, line. A tool is armed (L, R, C or the menu), the first click on any surface
// sets the plane and the first point, and the figure is finished by a second click or by typing sizes (Enter). A tool draws ONE figure, selects it, and hands back
// to normal selection. Pure: the controller feeds it points and keys; it returns the new tool state and, when a figure is done, the command and what to select.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, dist } from "../math/vec.ts";
import type { PointerView, Plane } from "../operation/part.ts";
import { normalOfPlane, pointOf } from "../operation/part.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import { drawSquaredRectangle, drawCircle, drawChain } from "../operation/build.ts";
import { loopFaceRef, diskFaceRef } from "../operation/loops.ts";
import { candidatesAt } from "./picking.ts";
import { settings } from "../shared/settings.ts";
import { drawnRef } from "../shared/ref.ts";

export type ToolKind = "rect" | "circle" | "line";
export interface Tool {
  kind: ToolKind;
  /** null while armed (waiting for the first click on a surface) */
  plane: Ref | null;
  /** placed points on the plane (the first corner, the line's corners so far) */
  points: Vec3[];
  /** where the pointer is on the plane, snapped */
  cursor: Vec3 | null;
  /** typed sizes: rectangle width and height; circle diameter (field 0); line length (field 0) */
  typed: [string, string];
  field: 0 | 1;
}
/** A tool that waits for its first click; given a plane (chosen from the pencil bubble) the click is taken on that plane. */
export const armTool = (kind: ToolKind, plane: Ref | null = null): Tool => ({ kind, plane, points: [], cursor: null, typed: ["", ""], field: 0 });

export const FIELDS: Record<ToolKind, string[]> = { rect: ["Width", "Height"], circle: ["Diameter"], line: ["Length"] };

// ---- points on a plane ----
function pointOnPlane(pv: PointerView, pl: Plane): Vec3 | null {
  if (!pv.ray) return null;
  const n = normalOfPlane(pl);
  const den = dot(n, pv.ray.d);
  if (Math.abs(den) < 1e-6) return null;
  const t = dot(n, sub(pl.at, pv.ray.o)) / den;
  return t > 0 ? add(pv.ray.o, scale(pv.ray.d, t)) : null;
}
export const localOf = (pl: Plane, p: Vec3): [number, number] => [dot(sub(p, pl.at), pl.u), dot(sub(p, pl.at), pl.v)];
const liftOf = (pl: Plane, [x, y]: readonly [number, number]): Vec3 => add(pl.at, add(scale(pl.u, x), scale(pl.v, y)));
const round = (v: number, step: number) => Math.round(v / step) * step;

/**
 * The point to use for the pointer on a plane: a corner of the scene that is within the snap distance on the screen and on the plane, else the point rounded to
 * `roundMm` in the plane's own coordinates (so sizes read 40.00 and not 39.999999).
 */
export function snapOnPlane(scene: Scene, pv: PointerView, pl: Plane): Vec3 | null {
  const raw = pointOnPlane(pv, pl);
  if (!raw) return null;
  for (const c of candidatesAt(scene, pv, { pointTol: settings.sketch.snapPx, lineTol: 0 })) {
    if (c.kind !== "corner") continue;
    const q = pointOf((r) => scene.parts[r], c.ref);
    if (q && Math.abs(dot(sub(q, pl.at), normalOfPlane(pl))) < 1e-3) return q;
  }
  const [x, y] = localOf(pl, raw);
  return liftOf(pl, [round(x, settings.sketch.roundMm), round(y, settings.sketch.roundMm)]);
}

// ---- typing ----
const num = (s: string): number | null => {
  const v = Number(s);
  return s !== "" && s !== "-" && s !== "." && Number.isFinite(v) ? v : null;
};
/** A key typed into the current field. Returns the new tool state; Tab changes field, Backspace deletes. Keys that are not numbers are ignored. */
export function typeKey(t: Tool, key: string): Tool {
  const n = FIELDS[t.kind].length;
  if (key === "Tab") return { ...t, field: n > 1 ? ((t.field === 0 ? 1 : 0) as 0 | 1) : 0 };
  const cur = t.typed[t.field];
  let next = cur;
  if (key === "Backspace") next = cur.slice(0, -1);
  else if (/^[0-9]$/.test(key)) next = cur + key;
  else if (key === "." && !cur.includes(".")) next = cur + (cur === "" ? "0." : ".");
  else if (key === "-" && cur === "") next = "-";
  else return t;
  const typed: [string, string] = t.field === 0 ? [next, t.typed[1]] : [t.typed[0], next];
  return { ...t, typed };
}
const typedValues = (t: Tool): [number | null, number | null] => [num(t.typed[0]), num(t.typed[1])];

// ---- the figure being drawn ----
/** The second corner of a rectangle from the first, the cursor and typed sizes (a typed size keeps the side the cursor is on). */
export function rectEnd(pl: Plane, t: Tool): Vec3 | null {
  const a = t.points[0];
  const c = t.cursor ?? a;
  if (!a || !c) return null;
  const [ax, ay] = localOf(pl, a);
  const [cx, cy] = localOf(pl, c);
  const [tw, th] = typedValues(t);
  const sx = cx - ax >= 0 ? 1 : -1;
  const sy = cy - ay >= 0 ? 1 : -1;
  const w = tw !== null ? Math.abs(tw) * sx : cx - ax;
  const h = th !== null ? Math.abs(th) * sy : cy - ay;
  return liftOf(pl, [ax + w, ay + h]);
}
/** The radius of a circle from its centre, the cursor and a typed diameter. */
export function circleRadius(pl: Plane, t: Tool): number {
  const [d] = typedValues(t);
  if (d !== null) return Math.abs(d) / 2;
  const a = t.points[0];
  const c = t.cursor;
  return a && c ? dist(a, c) : 0;
}
/** The next corner of a line from the last one, the cursor and a typed length (along the cursor's direction). */
export function lineNext(t: Tool): Vec3 | null {
  const a = t.points[t.points.length - 1];
  const c = t.cursor;
  if (!a || !c) return null;
  const [len] = typedValues(t);
  if (len === null) return c;
  const d = sub(c, a);
  const l = Math.hypot(d[0], d[1], d[2]);
  return l < 1e-9 ? null : add(a, scale(d, Math.abs(len) / l));
}

/** What to draw while a figure is being made (the view draws it; it is not part of the scene). */
export interface Preview {
  segments: [Vec3, Vec3][];
  circle: { center: Vec3; radius: number; normal: Vec3 } | null;
  /** where the pointer is on the plane (a small ball marks it) */
  cursor: Vec3 | null;
}
export function previewOf(scene: Scene, t: Tool): Preview | null {
  const pl = t.plane ? (scene.parts[t.plane] as Plane | undefined) : undefined;
  if (!pl || pl.kind !== "plane" || !t.points.length) return null;
  const n = normalOfPlane(pl);
  if (t.kind === "rect") {
    const a = t.points[0]!;
    const e = rectEnd(pl, t);
    if (!e) return null;
    const [ax, ay] = localOf(pl, a);
    const [ex, ey] = localOf(pl, e);
    const c = [liftOf(pl, [ax, ay]), liftOf(pl, [ex, ay]), liftOf(pl, [ex, ey]), liftOf(pl, [ax, ey])] as Vec3[];
    return { segments: c.map((p, i): [Vec3, Vec3] => [p, c[(i + 1) % 4]!]), circle: null, cursor: t.cursor };
  }
  if (t.kind === "circle") return { segments: [], circle: { center: t.points[0]!, radius: circleRadius(pl, t), normal: n }, cursor: t.cursor };
  const pts = [...t.points];
  const nx = lineNext(t);
  if (nx) pts.push(nx);
  return { segments: pts.slice(1).map((p, i): [Vec3, Vec3] => [pts[i]!, p]), circle: null, cursor: t.cursor };
}

export interface Finished { command: Command; select: Ref[] }
/** The figure as a command (and what to select afterwards), or null if it is not a figure yet (zero size). */
export function finish(scene: Scene, t: Tool, closeLine = false): Finished | null {
  const pl = t.plane ? (scene.parts[t.plane] as Plane | undefined) : undefined;
  if (!pl || pl.kind !== "plane" || !t.points.length) return null;
  if (t.kind === "rect") {
    const e = rectEnd(pl, t);
    const a = t.points[0]!;
    if (!e) return null;
    const [ax, ay] = localOf(pl, a);
    const [ex, ey] = localOf(pl, e);
    if (Math.abs(ex - ax) < 1e-6 || Math.abs(ey - ay) < 1e-6) return null;
    const r = drawSquaredRectangle(scene, pl.ref, a, e, pl.u, pl.v);
    return { command: r.command, select: [loopFaceRef(r.lines)] };
  }
  if (t.kind === "circle") {
    const radius = circleRadius(pl, t);
    if (radius < 1e-6) return null;
    const c = drawCircle(scene, pl.ref, t.points[0]!, radius);
    return { command: c.command, select: [diskFaceRef(c.circle)] };
  }
  const pts = [...t.points];
  if (pts.length < 2) return null;
  const d = drawChain(scene, pl.ref, pts, closeLine && pts.length >= 3);
  return { command: d.command, select: closeLine && pts.length >= 3 ? [loopFaceRef(d.lines)] : d.lines };
}

/** A drawn copy of a plane that is a face of the body (or any plane that is not already drawn or world), so a sketch on it does not depend on the body's name staying the same. */
export function planeForDrawing(scene: Scene, planeRef: Ref): { plane: Ref; command: Command | null } {
  const pl = scene.parts[planeRef];
  if (!pl || pl.kind !== "plane" || pl.origin !== "body") return { plane: planeRef, command: null };
  const same = Object.values(scene.parts).find((p) => p.kind === "plane" && p.origin === "drawn" && dist(p.at, pl.at) < 1e-6 && dist(p.u, pl.u) < 1e-6 && dist(p.v, pl.v) < 1e-6);
  if (same) return { plane: same.ref, command: null };
  const ref = drawnRef(nextId(scene, "p"));
  return { plane: ref, command: { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: false, at: pl.at, u: pl.u, v: pl.v } } };
}

// The drawing tools (`dec_interaction_spec`, "Drawing and relations"): rectangle, circle, line. A tool is armed (L, R, C or the menu), the first click on any surface
// sets the plane and the first point, and the figure is finished by a second click or by typing sizes (Enter). A tool draws ONE figure, selects it, and hands back
// to normal selection. Pure: the controller feeds it points and keys; it returns the new tool state and, when a figure is done, the command and what to select.
import { typedNumber } from "../shared/numbers.ts";
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, dist, cross } from "../math/vec.ts";
import type { PointerView, Plane } from "../operation/part.ts";
import { normalOfPlane, pointOf, segmentOf, arcPoints, localOf, liftOf } from "../operation/part.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import { live } from "../operation/ownership.ts";
import type { Command } from "../operation/commands.ts";
import { drawSquaredRectangle, drawCircle, drawChain, drawArc, joinedAtCorners } from "../operation/build.ts";
import { loopFaceRef, diskFaceRef } from "../operation/loops.ts";
import { candidatesAt, visibleFrom } from "./picking.ts";
import { anchorCorners, anchorLines, anchorCutCorners } from "../operation/anchors.ts";
import { settings } from "../shared/settings.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Hint } from "./hints.ts";
import { gearOutline, moduleForOutside } from "../operation/gear.ts";
import type { GearSpec, GearOutline } from "../operation/gear.ts";
import { gearRefs } from "../operation/gearscene.ts";

export type ToolKind = "rect" | "circle" | "line" | "arc" | "trim" | "gear";
export interface Tool {
  kind: ToolKind;
  /** null while armed (waiting for the first click on a surface) */
  plane: Ref | null;
  /** begun on the edge of a body: the hidden sketch behind it is shown and snapped to while this tool is on (`in_211`) */
  reveal?: true;
  /** placed points on the plane (the first corner, the line's corners so far) */
  points: Vec3[];
  /** where the pointer is on the plane, snapped */
  cursor: Vec3 | null;
  /** typed sizes: rectangle width and height; circle diameter (field 0); line length (field 0) */
  typed: [string, string];
  field: 0 | 1;
  /** the constraints the end of the line being drawn is close to (and has taken): a click makes the line with them */
  hints?: Hint[];
  /** a finger holds the cursor at `cursor` (it has no hover): the next tap sets the point there (`in_286`) */
  held?: true;
  /** how many figures have been made while this tool has been on (`in_283`): after the first, the chip at the top shows a check (done) in place of the cross, and flashes green at each one */
  made?: number;
  /** an arc being drawn: what each end placed so far was put on (a line or a circle), made into constraints when the arc is (`in_280`) */
  ends?: Hint[][];
  /** a circle being drawn about the centre of another circle: that circle (the new one is made concentric with it) */
  concentric?: Ref;
  /** before the first click (armed, or no point yet): the dashed lines to what the pointer lines up with, so the first corner can be aligned too (`in_381`) */
  guides?: [Vec3, Vec3][];
  /** trim: the part of a line or circle under the pointer that a click would cut off (shown as it is) */
  trimming?: { ref: Ref; span: Vec3[] };
  /** a gear (`dec_gear_tool`): a ring or an outside gear, the numbers typed, the field being typed in, and, when its numbers are being changed, which gear and how it is now */
  gear?: GearState;
}
export interface GearState { internal: boolean; typed: string[]; field: number; editing?: string; base?: GearSpec }
/** The numbers of a gear in the order the number box shows them (a ring has a wall where a gear has a shift). */
export const gearFields = (internal: boolean): { key: "teeth" | "module" | "pressure" | "shift" | "backlash" | "rim"; label: string }[] => [
  { key: "teeth", label: "Teeth" }, { key: "module", label: "Module" }, { key: "pressure", label: "Pressure" },
  internal ? { key: "rim", label: "Wall" } : { key: "shift", label: "Shift" }, { key: "backlash", label: "Backlash" },
];
const gearState = (t: Tool): GearState => t.gear ?? { internal: false, typed: [], field: 0 };
/** A tool that waits for its first click on a surface. */
export const armTool = (kind: ToolKind, internal = false): Tool => ({ kind, plane: null, points: [], cursor: null, typed: ["", ""], field: 0, ...(kind === "gear" ? { gear: { internal, typed: ["", "", "", "", ""], field: 0 } } : {}) });
/** The tool opened on a gear that is already made, to change its numbers: its plane and centre, and its numbers as they are. */
export const editGearTool = (rec: { id: string; plane: Ref; at: Vec3; spec: GearSpec }): Tool => ({ ...armTool("gear", !!rec.spec.internal), plane: rec.plane, points: [rec.at], cursor: rec.at, gear: { internal: !!rec.spec.internal, typed: ["", "", "", "", ""], field: 0, editing: rec.id, base: rec.spec } });

export const FIELDS: Record<ToolKind, string[]> = { rect: ["Width", "Height"], circle: ["Diameter"], line: ["Length"], arc: ["Height"], trim: [], gear: ["Teeth", "Module"] };

// ---- points on a plane ----
export function pointOnPlane(pv: PointerView, pl: Plane): Vec3 | null {
  if (!pv.ray) return null;
  const n = normalOfPlane(pl);
  const den = dot(n, pv.ray.d);
  if (Math.abs(den) < 1e-6) return null;
  const t = dot(n, sub(pl.at, pv.ray.o)) / den;
  return t > 0 ? add(pv.ray.o, scale(pv.ray.d, t)) : null;
}
const round = (v: number, step: number) => Math.round(v / step) * step;

/**
 * The point to use for the pointer on a plane: a corner of the scene that is within the snap distance on the screen and on the plane, else the point rounded to
 * `roundMm` in the plane's own coordinates (so sizes read 40.00 and not 39.999999).
 */
export function snapOnPlane(spent: Scene, pv: PointerView, pl: Plane, skip?: Ref): Vec3 | null {
  const scene = live(spent); // (what is hidden is not snapped to)
  const raw = pointOnPlane(pv, pl);
  if (!raw) return null;
  for (const c of candidatesAt(scene, pv, { pointTol: settings.sketch.snapPx, lineTol: 0 })) {
    if (c.kind !== "corner" || c.ref === skip) continue;
    const q = pointOf((r) => scene.parts[r], c.ref);
    if (q && Math.abs(dot(sub(q, pl.at), normalOfPlane(pl))) < 1e-3) return q;
  }
  // a corner of the body that is not in the plane but falls on it (the bottom of a wall, the far end of an edge): the pointer near where it falls is taken there (`in_311`)
  for (const c of anchorCorners(scene, pl, { seen: (q) => visibleFrom(scene, pv, q, { at: pl.at, n: normalOfPlane(pl) }) })) { // (the ones out of sight are not offered, `in_312`)
    if (Math.abs(c.offset) <= 1e-3) continue;
    const [qx, qy] = pv.project(c.at);
    if (Math.hypot(qx - pv.x, qy - pv.y) <= settings.sketch.snapPx) return c.at;
  }
  // a corner of the cut of a cross section plane: the pointer near it is taken there (`in_398`)
  for (const c of anchorCutCorners(scene, pl)) {
    const [qx, qy] = pv.project(c.at);
    if (Math.hypot(qx - pv.x, qy - pv.y) <= settings.sketch.snapPx) return c.at;
  }
  // the middle of a straight line (drawn, or an edge of the body as it falls on the plane) within the snap distance: the pointer takes it, and a point there lies on the line (`in_381`)
  const seen = (q: Vec3) => visibleFrom(scene, pv, q, { at: pl.at, n: normalOfPlane(pl) });
  const projected = new Map(anchorLines(scene, pl, { seen }).map((l) => [l.ref, [l.a, l.b] as [Vec3, Vec3]]));
  let mid: { at: Vec3; px: number } | null = null;
  for (const l of Object.values(scene.parts)) {
    if (!(l.kind === "line" || (l.kind === "plane" && l.origin === "body" && projected.has(l.ref))) || (l.kind === "line" && (l.center || l.derived)) || (l.origin !== "drawn" && !projected.has(l.ref))) continue; // (the cut of a flat face is a line too)
    const q = projected.get(l.ref) ?? segmentOf((r) => scene.parts[r], l.ref);
    if (!q || Math.abs(dot(sub(q[0], pl.at), normalOfPlane(pl))) > 1e-3 || Math.abs(dot(sub(q[1], pl.at), normalOfPlane(pl))) > 1e-3) continue;
    const m = scale(add(q[0], q[1]), 0.5);
    const [mx, my] = pv.project(m);
    const px = Math.hypot(mx - pv.x, my - pv.y);
    if (px <= settings.sketch.snapPx && (!mid || px < mid.px)) mid = { at: m, px };
  }
  if (mid) return mid.at;
  const [x, y] = localOf(pl, raw);
  let [sx, sy] = [round(x, settings.sketch.roundMm), round(y, settings.sketch.roundMm)];
  // in line with a corner of the scene (level or upright on the plane) within the snap distance on the screen: the pointer takes that line (the guide is drawn by `previewOf`)
  const near = (p: Vec3): boolean => { const [a, b] = pv.project(p); return Math.hypot(a - pv.x, b - pv.y) <= settings.sketch.alignPx; };
  let [ax, ay] = [false, false];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "corner" || p.ref === skip) continue;
    if (Math.abs(dot(sub(p.at, pl.at), normalOfPlane(pl))) > 1e-3) continue;
    const [qx, qy] = localOf(pl, p.at);
    if (!ax && near(liftOf(pl, [qx, y]))) { sx = qx; ax = true; }
    if (!ay && near(liftOf(pl, [x, qy]))) { sy = qy; ay = true; }
  }
  return liftOf(pl, [sx, sy]);
}

// ---- typing ----
/** A key typed into the current field. Returns the new tool state; Tab changes field, Backspace deletes. Keys that are not numbers are ignored. */
export function typeKey(t: Tool, key: string): Tool {
  if (t.kind === "gear") {
    const g = gearState(t);
    if (key === "Tab") return { ...t, gear: { ...g, field: (g.field + 1) % gearFields(g.internal).length } };
    const typed = typeInto(g.typed[g.field] ?? "", key);
    return typed === null ? t : { ...t, gear: { ...g, typed: Array.from({ length: 5 }, (_, i) => (i === g.field ? typed : g.typed[i] ?? "")) } };
  }
  const n = FIELDS[t.kind].length;
  if (key === "Tab") return { ...t, field: n > 1 ? ((t.field === 0 ? 1 : 0) as 0 | 1) : 0 };
  const next = typeInto(t.typed[t.field], key);
  if (next === null) return t;
  const typed: [string, string] = t.field === 0 ? [next, t.typed[1]] : [t.typed[0], next];
  return { ...t, typed };
}
/** What a field says after a key is typed into it (null: the key is not for a number). */
function typeInto(cur: string, key: string): string | null {
  if (key === "Backspace") return cur.slice(0, -1);
  if (/^[0-9]$/.test(key)) return cur + key;
  if (key === "." && !cur.includes(".")) return cur + (cur === "" ? "0." : ".");
  if (key === "-" && cur === "") return "-";
  return null;
}
/** The text of a field of a gear's number box changed (typed in the box itself). */
export function gearTyped(t: Tool, field: number, text: string): Tool {
  const g = gearState(t);
  return { ...t, gear: { ...g, field, typed: Array.from({ length: 5 }, (_, i) => (i === field ? text : g.typed[i] ?? "")) } };
}
const typedValues = (t: Tool): [number | null, number | null] => [typedNumber(t.typed[0]), typedNumber(t.typed[1])];

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
/** The numbers of the gear being drawn or changed: each as typed, else as the gear has it now, else the default (20 teeth, 20 degrees, no shift or backlash, a wall of 2 modules); with no module typed and none to start from, the one (to the nearest 0.05) that makes the outside as wide as the pointer is from the centre. Null while there is no size. */
function gearSpecOf(t: Tool): GearSpec | null {
  const g = gearState(t);
  const fields = gearFields(g.internal);
  const typed = (k: string) => { const i = fields.findIndex((f) => f.key === k); return i < 0 ? null : typedNumber(g.typed[i] ?? ""); };
  const b = g.base;
  const teeth = Math.round(typed("teeth") ?? b?.teeth ?? 20);
  const pressure = typed("pressure") ?? b?.pressure;
  const shift = g.internal ? undefined : typed("shift") ?? b?.shift;
  const backlash = typed("backlash") ?? b?.backlash;
  const rim = g.internal ? typed("rim") ?? b?.rim : undefined;
  const typedModule = typed("module");
  let module = typedModule !== null && typedModule > 0 ? typedModule : b?.module;
  if (module === undefined) {
    const [a, c] = [t.points[0], t.cursor];
    const reach = a && c ? dist(a, c) : 0;
    if (reach < 1e-6) return null;
    module = Math.max(0.1, Math.round((g.internal ? reach / (teeth / 2 + 1.25 + (rim ?? 2)) : moduleForOutside(teeth, 2 * reach, shift ?? 0)) / 0.05) * 0.05);
  }
  return { teeth, module, ...(pressure !== undefined ? { pressure } : {}), ...(shift !== undefined ? { shift } : {}), ...(backlash !== undefined ? { backlash } : {}), ...(g.internal ? { internal: true as const } : {}), ...(rim !== undefined ? { rim } : {}) };
}
/** What each field of the number box says while nothing is typed in it: the numbers as they are now. */
export function gearLive(t: Tool): number[] | null {
  const s = gearSpecOf(t);
  return s ? gearFields(!!s.internal).map((f) => ({ teeth: s.teeth, module: s.module, pressure: s.pressure ?? 20, shift: s.shift ?? 0, backlash: s.backlash ?? 0, rim: s.rim ?? 2 })[f.key]) : null;
}
/** The outline of the gear being drawn, or null while it is not a gear (no size yet, or numbers that make none). */
function gearOf(t: Tool): GearOutline | null {
  const s = gearSpecOf(t);
  const o = s ? gearOutline(s) : null;
  return o && o.ok ? o.value : null;
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
  /** dashed lines from the cursor to what it lines up with (not part of the figure, `in_381`) */
  guides?: [Vec3, Vec3][];
  circle: { center: Vec3; radius: number; normal: Vec3 } | null;
  /** where the pointer is on the plane (a small ball marks it) */
  cursor: Vec3 | null;
}
/** Thin lines from the cursor to the corners it lines up with (level or upright), so you can see what it is aligned to. */
export function guidesOf(spent: Scene, pl: Plane, cursor: Vec3 | null): [Vec3, Vec3][] {
  if (!cursor) return [];
  const scene = live(spent);
  const [cx, cy] = localOf(pl, cursor);
  const out: [Vec3, Vec3][] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "corner" || Math.abs(dot(sub(p.at, pl.at), normalOfPlane(pl))) > 1e-3) continue;
    const [qx, qy] = localOf(pl, p.at);
    const same = (Math.abs(qx - cx) < 1e-6 ? 1 : 0) + (Math.abs(qy - cy) < 1e-6 ? 1 : 0);
    if (same === 1) out.push([p.at, cursor]);
  }
  return out;
}
export function previewOf(scene: Scene, t: Tool): Preview | null {
  if (t.kind === "trim") return t.trimming ? { segments: t.trimming.span.slice(1).map((p, i): [Vec3, Vec3] => [t.trimming!.span[i]!, p]), circle: null, cursor: null } : null; // the part that would be cut off
  const pl = t.plane ? (scene.parts[t.plane] as Plane | undefined) : undefined;
  if (!pl || pl.kind !== "plane" || !t.points.length) {
    const guides = pl && pl.kind === "plane" ? guidesOf(scene, pl, t.cursor) : t.guides ?? []; // (nothing placed yet: only what the pointer lines up with)
    return guides.length ? { segments: [], guides, circle: null, cursor: t.cursor } : null;
  }
  const p = previewShape(scene, t, pl);
  return p ? { ...p, guides: guidesOf(scene, pl, t.cursor) } : p;
}
function previewShape(scene: Scene, t: Tool, pl: Plane): Preview | null {
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
  if (t.kind === "gear") {
    const o = gearOf(t);
    if (!o) return null;
    const [cx, cy] = localOf(pl, t.points[0]!);
    const at = (q: readonly [number, number]): Vec3 => liftOf(pl, [cx + q[0], cy + q[1]]);
    const segments: [Vec3, Vec3][] = [];
    o.points.forEach((a, i) => { // (each side as two short lines through its middle: close enough to see the teeth)
      const b = o.points[(i + 1) % o.points.length]!;
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const k = o.bulges[i]!;
      const m: [number, number] = [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k];
      segments.push([at(a), at(m)], [at(m), at(b)]);
    });
    return { segments, circle: o.outerRadius !== undefined ? { center: t.points[0]!, radius: o.outerRadius, normal: n } : null, cursor: t.cursor };
  }
  if (t.kind === "arc") {
    const arc = t.points.length >= 2 ? arcOf(pl, t) : null;
    if (arc) { const pts = arcPoints(arc.a, arc.mid, arc.b); return { segments: pts.slice(1).map((p, i): [Vec3, Vec3] => [pts[i]!, p]), circle: null, cursor: t.cursor }; }
    const [a, b] = [t.points[0]!, t.points[1] ?? t.cursor];
    return { segments: b ? [[a, b]] : [], circle: null, cursor: t.cursor };
  }
  const pts = [...t.points];
  const nx = lineNext(t);
  if (nx) pts.push(nx);
  return { segments: pts.slice(1).map((p, i): [Vec3, Vec3] => [pts[i]!, p]), circle: null, cursor: t.cursor };
}

/** An arc by its two ends and how far its middle stands out from the chord (the pointer's distance from the chord, or the typed height on the side the pointer is). Null while there are not two ends. */
export function arcOf(pl: Plane, t: Tool): { a: Vec3; b: Vec3; mid: Vec3; bulge: number } | null {
  const [a, b] = [t.points[0], t.points[1]];
  const c = t.cursor;
  if (!a || !b || !c) return null;
  const chord = sub(b, a);
  const len = Math.hypot(...chord);
  if (len < 1e-9) return null;
  const perp = cross(normalOfPlane(pl), scale(chord, 1 / len));
  const m = scale(add(a, b), 0.5);
  const side = dot(sub(c, m), perp);
  const typed = typedNumber(t.typed[0]);
  const h = typed !== null ? Math.abs(typed) * (side < 0 ? -1 : 1) : side;
  return Math.abs(h) < 1e-9 ? null : { a, b, mid: add(m, scale(perp, h)), bulge: h / len };
}

export interface Finished { command: Command; select: Ref[] }
/** The figure as a command (and what to select afterwards), or null if it is not a figure yet (zero size). */
export function finish(scene: Scene, t: Tool): Finished | null {
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
    return { command: joinedAtCorners(scene, pl.ref, r.command), select: [loopFaceRef(r.lines)] };
  }
  if (t.kind === "circle") {
    const radius = circleRadius(pl, t);
    if (radius < 1e-6) return null;
    const c = drawCircle(scene, pl.ref, t.points[0]!, radius);
    return { command: joinedAtCorners(scene, pl.ref, c.command), select: [diskFaceRef(c.circle)] };
  }
  if (t.kind === "gear") {
    const spec = gearSpecOf(t);
    if (!spec || !gearOutline(spec).ok) return null;
    const id = t.gear?.editing ?? nextId(scene, "g");
    const refs = gearRefs({ id, plane: pl.ref, at: t.points[0]!, spec });
    const select = [refs.wall ? diskFaceRef(refs.wall) : loopFaceRef(refs.lines)];
    return { command: t.gear?.editing ? { type: "setGear", id, spec } : { type: "gear", id, plane: pl.ref, at: t.points[0]!, spec }, select };
  }
  if (t.kind === "arc") {
    const arc = arcOf(pl, t);
    if (!arc) return null;
    const d = drawArc(scene, pl.ref, arc.a, arc.mid, arc.b, normalOfPlane(pl));
    return d ? { command: joinedAtCorners(scene, pl.ref, d.command), select: [d.line] } : null;
  }
  const pts = [...t.points];
  if (pts.length < 2) return null;
  const d = drawChain(scene, pl.ref, pts, false, { reuse: true }); // a line: it ends at an existing corner when it is drawn to one (so lines meeting in a loop make a shape)
  return { command: joinedAtCorners(scene, pl.ref, d.command), select: d.lines }; // (a line that ends at a corner of the body is held to it, `in_310`)
}

/** A drawn copy of a plane that is a face of the body (or any plane that is not already drawn or world), so a sketch on it does not depend on the body's name staying the same. */
export function planeForDrawing(scene: Scene, planeRef: Ref): { plane: Ref; command: Command | null } {
  const pl = scene.parts[planeRef];
  if (!pl || pl.kind !== "plane" || pl.origin !== "body") return { plane: planeRef, command: null };
  const owner = pl.of && (scene.parts[pl.of] as { id?: string } | undefined)?.id; // (with several bodies, the body this face is of: bodies' faces can lie in one plane, and each body's sketches belong to it, `in_277`)
  const same = Object.values(scene.parts).find((p) => p.kind === "plane" && p.origin === "drawn" && dist(p.at, pl.at) < 1e-6 && dist(p.u, pl.u) < 1e-6 && dist(p.v, pl.v) < 1e-6 && p.body === (owner || undefined));
  if (same) return { plane: same.ref, command: null };
  const ref = drawnRef(nextId(scene, "p"));
  return { plane: ref, command: { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: false, at: pl.at, u: pl.u, v: pl.v, onBody: true, ...(owner && scene.parts[pl.of!]?.kind === "body" ? { body: owner } : {}) } } };
}

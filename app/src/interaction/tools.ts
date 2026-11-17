// The drawing tools (`dec_interaction_spec`, "Drawing and relations"): rectangle, circle, line. A tool is armed (L, R, C or the menu), the first click on any surface
// sets the plane and the first point, and the figure is finished by a second click or by typing sizes (Enter). A tool draws ONE figure, selects it, and hands back
// to normal selection. Pure: the controller feeds it points and keys; it returns the new tool state and, when a figure is done, the command and what to select.
import { typedNumber } from "../shared/numbers.ts";
import { typedLength } from "../shared/units.ts";
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
import { gearOutline, moduleForOutside, helixTwist } from "../operation/gear.ts";
import type { GearSpec, PulleyKind } from "../operation/gear.ts";
import { standardKey } from "../operation/bore.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { gearRefs } from "../operation/gearscene.ts";
import { chainOf } from "../operation/chains.ts";
import type { GearRecord } from "../operation/gearscene.ts";
import { meshWith } from "../operation/mesh.ts";

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
export interface GearState {
  internal: boolean; typed: string[]; field: number; editing?: string; base?: GearSpec;
  /** the turn the gear being changed has (radians), so its preview stands as it does */ turn?: number;
  /** a rack (`in_547`) */ rack?: boolean;
  /** a helical gear (`in_566`): the twisted body is made with it */ helical?: true;
  /** a timing pulley for this belt (`in_551`) */ pulley?: PulleyKind;
  /** a roller chain sprocket (`in_552`) */ sprocket?: true;
  /** the ISO 606 tooth form of it (`in_556`) */ iso?: true;
  /** a cycloidal (clock) gear (`in_553`) */ cycloidal?: true;
  /** a gear or a rack made to mesh with `src` (`in_547`); `rack`: the partner is a rack */ mesh?: { src: GearRecord; rack: boolean; ring?: boolean };
}
export type GearKey = "teeth" | "module" | "pressure" | "shift" | "backlash" | "rim" | "bore" | "ratio" | "angle" | "offset" | "clearance" | "chain" | "pitch" | "roller" | "circle" | "addendum" | "dedendum" | "fit" | "flat" | "key" | "keydepth" | "fillet" | "detail" | "helix" | "width";
/** The numbers of a gear in the order the number box shows them (a ring has a wall where a gear has a shift; a rack has the bar under its teeth; a partner has its tooth count, ratio and the direction it stands in). */
export const gearFields = (g: { internal: boolean; helical?: true; rack?: boolean; pulley?: PulleyKind; sprocket?: true; iso?: true; cycloidal?: true; mesh?: { src: GearRecord; rack: boolean; ring?: boolean } }): { key: GearKey; label: string }[] => {
  const f = (key: GearKey, label: string) => ({ key, label });
  const fs = gearFieldsBase(g, f);
  const at = fs.findIndex((x) => x.key === "bore");
  return at < 0 ? fs : [...fs.slice(0, at + 1), f("flat", "Flat"), f("key", "Key"), f("keydepth", "Key depth"), ...fs.slice(at + 1)]; // (a bore can have a D flat or a keyway, `in_557`)
};
const gearFieldsBase = (g: { internal: boolean; helical?: true; rack?: boolean; pulley?: PulleyKind; sprocket?: true; iso?: true; cycloidal?: true; mesh?: { src: GearRecord; rack: boolean; ring?: boolean } }, f: (key: GearKey, label: string) => { key: GearKey; label: string }): { key: GearKey; label: string }[] => {
  if (g.mesh) return g.mesh.src.spec.rack ? [f("teeth", "Teeth"), f("offset", "Offset"), f("bore", "Bore")] : g.mesh.rack ? [f("teeth", "Teeth"), f("angle", "Angle")] : g.mesh.ring ? [f("teeth", "Teeth"), f("ratio", "Ratio"), f("angle", "Angle")] : [f("teeth", "Teeth"), f("ratio", "Ratio"), f("angle", "Angle"), f("bore", "Bore")]; // (a gear made to mesh can have its bore at once, `in_556`)
  if (g.pulley) return [f("teeth", "Teeth"), f("clearance", "Clearance"), f("bore", "Bore")];
  if (g.cycloidal) return [f("teeth", "Teeth"), f("module", "Module"), f("backlash", "Backlash"), f("circle", "Circle"), f("addendum", "Addendum"), f("dedendum", "Dedendum"), g.internal ? f("rim", "Wall") : g.rack ? f("rim", "Base") : f("bore", "Bore")];
  if (g.sprocket) return [f("teeth", "Teeth"), f("chain", "Chain"), f("pitch", "Pitch"), f("roller", "Roller"), ...(g.iso ? [f("fit", "Fit")] : []), f("bore", "Bore")];
  if (g.rack) return [f("teeth", "Teeth"), f("module", "Module"), f("pressure", "Pressure"), f("backlash", "Backlash"), f("rim", "Base"), f("clearance", "Clearance")];
  return [f("teeth", "Teeth"), f("module", "Module"), f("pressure", "Pressure"), g.internal ? f("rim", "Wall") : f("shift", "Shift"), f("backlash", "Backlash"), f("clearance", "Clearance"), ...(g.internal ? [] : [f("fillet", "Fillet"), f("detail", "Detail"), ...(g.helical ? [f("helix", "Helix"), f("width", "Width")] : []), f("bore", "Bore")])]; // (the root as the cutter leaves it, `in_560`)
};
const gearState = (t: Tool): GearState => t.gear ?? { internal: false, typed: [], field: 0 };
/** A tool that waits for its first click on a surface. */
export type GearVariant = "gear" | "helical" | "ring" | "rack" | "gt2" | "gt3" | "htd5" | "htd8" | "sprocket" | "isosprocket" | "clock" | "clockring" | "clockrack";
export const variantOf = (g: { internal?: boolean; rack?: boolean; pulley?: PulleyKind; sprocket?: unknown; iso?: unknown; cycloidal?: unknown } | undefined): GearVariant => (g?.cycloidal ? (g.internal ? "clockring" : g.rack ? "clockrack" : "clock") : g?.sprocket ? (g.iso ? "isosprocket" : "sprocket") : g?.pulley === "2GT" ? "gt2" : g?.pulley === "3GT" ? "gt3" : g?.internal ? "ring" : g?.rack ? "rack" : "gear");
export const armTool = (kind: ToolKind, variant: GearVariant = "gear"): Tool => ({ kind, plane: null, points: [], cursor: null, typed: ["", ""], field: 0, ...(kind === "gear" ? { gear: { internal: variant === "ring" || variant === "clockring", ...(variant === "helical" ? { helical: true as const } : {}), typed: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], field: 0, ...(variant === "rack" || variant === "clockrack" ? { rack: true } : {}), ...(variant === "gt2" ? { pulley: "2GT" as const } : variant === "gt3" ? { pulley: "3GT" as const } : variant === "htd5" ? { pulley: "HTD5M" as const } : variant === "htd8" ? { pulley: "HTD8M" as const } : {}), ...(variant === "sprocket" || variant === "isosprocket" ? { sprocket: true as const } : {}), ...(variant === "isosprocket" ? { iso: true as const } : {}), ...(variant === "clock" || variant === "clockring" || variant === "clockrack" ? { cycloidal: true as const } : {}) } } : {}) });
/** The tool opened to make a gear or a rack that meshes with `src`: its centre is the gear's, the pointer says where the partner goes. */
export const meshGearTool = (src: GearRecord, rack: boolean, ring = false): Tool => ({ ...armTool("gear"), plane: src.plane, points: [src.at], cursor: src.at, gear: { internal: ring, typed: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], field: 0, mesh: { src, rack, ring } } });
/** The tool opened on a gear that is already made, to change its numbers: its plane and centre, and its numbers as they are. */
export const editGearTool = (rec: { id: string; plane: Ref; at: Vec3; spec: GearSpec; turn?: number }): Tool => ({ ...armTool("gear", variantOf(rec.spec)), plane: rec.plane, points: [rec.at], cursor: rec.at, gear: { internal: !!rec.spec.internal, ...(rec.spec.helix !== undefined ? { helical: true as const } : {}), ...(rec.spec.rack ? { rack: true } : {}), ...(rec.spec.pulley ? { pulley: rec.spec.pulley } : {}), ...(rec.spec.sprocket ? { sprocket: true as const } : {}), ...(rec.spec.sprocket?.iso ? { iso: true as const } : {}), ...(rec.spec.cycloidal ? { cycloidal: true as const } : {}), typed: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], field: 0, editing: rec.id, base: rec.spec, ...(rec.turn ? { turn: rec.turn } : {}) } });

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
    if (key === "Tab") return { ...t, gear: { ...g, field: (g.field + 1) % gearFields(g).length } };
    const typed = typeInto(g.typed[g.field] ?? "", key);
    return typed === null ? t : { ...t, gear: { ...g, typed: Array.from({ length: 16 }, (_, i) => (i === g.field ? typed : g.typed[i] ?? "")) } };
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
  return { ...t, gear: { ...g, field, typed: Array.from({ length: 16 }, (_, i) => (i === field ? text : g.typed[i] ?? "")) } };
}
const typedValues = (t: Tool): [number | null, number | null] => [typedLength(t.typed[0]), typedLength(t.typed[1])];

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
/** The numbers of the gear being drawn or changed: each as typed, else as the gear has it now, else the default (20 teeth, 20 degrees, no shift or backlash, a wall or a bar of 2 modules); with no module typed and none to start from, the one (to the nearest 0.05) that makes the outside as wide as the pointer is from the centre (a rack: as long as twice that). Null while there is no size. */
/** The bore's shape as typed (or as the gear had it): a flat, a keyway and its depth. */
const shapeOf = (typed: (k: string) => number | null, b: GearSpec | undefined) => {
  const [flat, key, keyDepth] = [typed("flat") ?? b?.flat, typed("key") ?? b?.key, typed("keydepth") ?? b?.keyDepth];
  return { ...(flat ? { flat } : {}), ...(key ? { key } : {}), ...(keyDepth ? { keyDepth } : {}) };
};
function gearSpecOf(t: Tool): GearSpec | null {
  const g = gearState(t);
  const fields = gearFields(g);
  const typed = (k: string) => { const i = fields.findIndex((f) => f.key === k); return i < 0 ? null : typedNumber(g.typed[i] ?? ""); };
  const b = g.base;
  if (g.pulley) { // a timing pulley: its grooves, how much bigger than the belt tooth they are, and a bore; the belt fixes the rest
    const [clearance, bore] = [typed("clearance") ?? b?.clearance, typed("bore") ?? b?.bore];
    return { teeth: Math.round(typed("teeth") ?? b?.teeth ?? 20), module: g.pulley === "2GT" ? 2 : g.pulley === "3GT" ? 3 : g.pulley === "HTD8M" ? 8 : 5, pulley: g.pulley, ...(clearance ? { clearance } : {}), ...(bore ? { bore, ...shapeOf(typed, b) } : {}) };
  }
  if (g.cycloidal) { // a clock gear: the generating circle (radius), addendum and dedendum in modules, the same circle for gears that are to mesh
    const [circle, addendum, dedendum] = [typed("circle") ?? b?.cycloidal?.circle, typed("addendum") ?? b?.cycloidal?.addendum, typed("dedendum") ?? b?.cycloidal?.dedendum];
    const [teeth, backlash, typedModule] = [Math.round(typed("teeth") ?? b?.teeth ?? (g.rack ? 10 : 20)), typed("backlash") ?? b?.backlash, typed("module")];
    const bore = g.internal || g.rack ? undefined : typed("bore") ?? b?.bore;
    const rim = g.internal || g.rack ? typed("rim") ?? b?.rim : undefined;
    let module = typedModule !== null && typedModule > 0 ? typedModule : b?.module;
    if (module === undefined) {
      const [a, c] = [t.points[0], t.cursor];
      const reach = a && c ? dist(a, c) : 0;
      if (reach < 1e-6) return null;
      const exact = g.rack ? (2 * reach) / (Math.PI * Math.max(1, teeth)) : g.internal ? reach / (teeth / 2 + (dedendum ?? 1.25) + (rim ?? 2)) : moduleForOutside(teeth, 2 * reach, (addendum ?? 1) - 1);
      module = Math.max(0.1, Math.round(exact / 0.05) * 0.05);
    }
    return { teeth, module, ...(g.internal ? { internal: true as const } : {}), ...(g.rack ? { rack: true as const } : {}), ...(rim !== undefined ? { rim } : {}), cycloidal: { ...(circle ? { circle } : {}), ...(addendum ? { addendum } : {}), ...(dedendum ? { dedendum } : {}) }, ...(backlash !== undefined ? { backlash } : {}), ...(bore ? { bore, ...shapeOf(typed, b) } : {}) };
  }
  if (g.sprocket) { // a roller chain sprocket: its teeth, the chain by its ANSI number, or its own pitch and roller diameter (mm), and a bore
    const [chain, pitch, roller, bore] = [typed("chain") ?? b?.sprocket?.chain, typed("pitch") ?? b?.sprocket?.pitch, typed("roller") ?? b?.sprocket?.roller, typed("bore") ?? b?.bore];
    const fit = g.iso ? typed("fit") ?? b?.sprocket?.fit : undefined;
    return { teeth: Math.round(typed("teeth") ?? b?.teeth ?? (g.iso ? 20 : 18)), module: 1, sprocket: { chain: chain ?? (pitch || roller ? undefined : g.iso ? 8 : 40), ...(pitch ? { pitch } : {}), ...(roller ? { roller } : {}), ...(g.iso ? { iso: true } : {}), ...(fit !== undefined ? { fit } : {}) }, ...(bore ? { bore, ...shapeOf(typed, b) } : {}) };
  }
  const teeth = Math.round(typed("teeth") ?? b?.teeth ?? (g.rack ? 10 : 20));
  const pressure = typed("pressure") ?? b?.pressure;
  const shift = g.internal || g.rack ? undefined : typed("shift") ?? b?.shift;
  const backlash = typed("backlash") ?? b?.backlash;
  const clearance = typed("clearance") ?? b?.clearance; // (the root clearance, in modules)
  const rim = g.internal || g.rack ? typed("rim") ?? b?.rim : undefined;
  const bore = g.internal || g.rack ? undefined : typed("bore") ?? b?.bore;
  const fillet = g.internal || g.rack ? undefined : typed("fillet") ?? b?.fillet;
  const detail = g.internal || g.rack ? undefined : typed("detail") ?? b?.detail;
  const [helix, width] = g.helical ? [typed("helix") ?? b?.helix ?? 15, typed("width") ?? b?.width] : [undefined, undefined]; // (a helical gear: its helix angle, and its width, six modules if none is given)
  const typedModule = typed("module");
  let module = typedModule !== null && typedModule > 0 ? typedModule : b?.module;
  if (module === undefined) {
    const [a, c] = [t.points[0], t.cursor];
    const reach = a && c ? dist(a, c) : 0;
    if (reach < 1e-6) return null;
    const exact = g.rack ? (2 * reach) / (Math.PI * Math.max(1, teeth)) : g.internal ? reach / (teeth / 2 + 1 + (clearance ?? 0.25) + (rim ?? 2)) : moduleForOutside(teeth, 2 * reach, shift ?? 0);
    module = Math.max(0.1, Math.round(exact / 0.05) * 0.05);
  }
  return { teeth, module, ...(pressure !== undefined ? { pressure } : {}), ...(shift !== undefined ? { shift } : {}), ...(backlash !== undefined ? { backlash } : {}), ...(clearance !== undefined ? { clearance } : {}), ...(g.internal ? { internal: true as const } : {}), ...(g.rack ? { rack: true as const } : {}), ...(rim !== undefined ? { rim } : {}), ...(fillet ? { fillet } : {}), ...(detail ? { detail } : {}), ...(helix !== undefined ? { helix, width: width ?? 6 * module } : {}), ...(bore ? { bore, ...shapeOf(typed, b) } : {}) };
}
type GearTarget = { spec: GearSpec; at: Vec3; turn: number; live: Partial<Record<GearKey, number>> };
/** The gear the tool would make, or why it would make none (`in_548`: said when Enter or a click makes nothing); null while there is nothing to say yet (no size, no plane). */
function gearMade(scene: Scene, t: Tool): Result<GearTarget> | null {
  const g = gearState(t);
  const pl = t.plane ? scene.parts[t.plane] : undefined;
  if (!g.mesh) {
    const spec = gearSpecOf(t);
    const at = t.points[0];
    if (!spec || !at) return null;
    const o = gearOutline(spec);
    if (!o.ok) return err(o.error);
    return ok({ spec, at, turn: g.turn ?? 0, live: { teeth: spec.teeth, module: spec.module, pressure: spec.pressure ?? 20, shift: spec.shift ?? 0, backlash: spec.backlash ?? 0, rim: spec.rim ?? 2, bore: spec.bore ?? 0, fillet: spec.fillet ?? 0, detail: spec.detail ?? 4, helix: spec.helix ?? 15, width: spec.width ?? 0, flat: spec.flat ?? 0, key: spec.key ?? 0, keydepth: spec.keyDepth ?? (spec.bore ? standardKey(spec.bore)?.t2 ?? 0 : 0), clearance: spec.clearance ?? (spec.pulley === "HTD5M" ? 0.07 : spec.pulley ? 0 : 0.25), circle: spec.cycloidal?.circle ?? 3, addendum: spec.cycloidal?.addendum ?? 1, dedendum: spec.cycloidal?.dedendum ?? 1.25, chain: spec.sprocket?.chain ?? 0, fit: spec.sprocket?.fit ?? 0.5, ...(spec.sprocket ? (() => { const c = chainOf(spec.sprocket); return c ? { pitch: c.pitch, roller: c.roller } : {}; })() : {}) } });
  }
  if (!pl || pl.kind !== "plane") return null;
  const { src, rack, ring } = g.mesh;
  const fields = gearFields(g);
  const typed = (k: string) => { const i = fields.findIndex((f) => f.key === k); return i < 0 ? null : typedNumber(g.typed[i] ?? ""); };
  const srcRack = !!src.spec.rack;
  const ratio = typed("ratio");
  const teeth = Math.round(typed("teeth") ?? (ratio !== null && ratio > 0 && !srcRack ? ratio * src.spec.teeth : srcRack ? 16 : rack ? 10 : ring ? 2 * src.spec.teeth : src.spec.internal ? Math.max(3, Math.floor(src.spec.teeth / 2)) : src.spec.teeth)); // (a partner has as many teeth as the gear it meshes with, but a gear in a ring has half the ring's and a ring round a gear twice the gear's: the same number would be refused, `in_593`)
  const [cx, cy] = localOf(pl, src.at);
  const [px, py] = t.cursor ? localOf(pl, t.cursor) : [cx, cy];
  let where: number;
  if (srcRack) {
    const tr = src.turn ?? 0;
    where = typed("offset") ?? (px - cx) * Math.cos(tr) + (py - cy) * Math.sin(tr);
  } else {
    const a = typed("angle");
    where = a !== null ? (a * Math.PI) / 180 : Math.hypot(px - cx, py - cy) > 1e-6 ? Math.atan2(py - cy, px - cx) : 0;
  }
  const r = meshWith(src, pl.u, pl.v, { teeth, rack, ring }, where);
  if (!r.ok) return err(r.error);
  const bore = rack ? null : typed("bore");
  const spec = bore ? { ...r.value.spec, bore, ...shapeOf(typed, undefined) } : r.value.spec;
  const o = gearOutline(spec);
  if (!o.ok) return err(o.error);
  return ok({ ...r.value, spec, live: { teeth, ratio: srcRack ? 0 : teeth / src.spec.teeth, angle: (where * 180) / Math.PI, offset: where, bore: 0 } });
}
/** The gear to be made (or changed) by the tool as it stands: its numbers, where it stands and how it is turned, and what each field of the box says while nothing is typed in it. A partner (`in_547`) is where the pointer says (a gear: the direction of it from the gear it meshes with; a gear on a rack: how far along the rack), or as typed. Null while there is none. */
function gearTarget(scene: Scene, t: Tool): GearTarget | null {
  const r = gearMade(scene, t);
  return r && r.ok ? r.value : null;
}
/** Why the gear the tool stands at makes none (what Enter or a click says), or null. */
export function gearProblem(scene: Scene, t: Tool): string | null {
  const r = gearMade(scene, t);
  return r && !r.ok ? r.error : null;
}
/** What each field of the number box says while nothing is typed in it: the numbers as they are now. */
export function gearLive(scene: Scene, t: Tool): number[] | null {
  const g = gearTarget(scene, t);
  return g ? gearFields(gearState(t)).map((f) => g.live[f.key] ?? 0) : null;
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
    const target = gearTarget(scene, t);
    const o = target ? gearOutline(target.spec) : null;
    if (!target || !o || !o.ok) return null;
    const [cx, cy] = localOf(pl, target.at);
    const [ct, st] = [Math.cos(target.turn), Math.sin(target.turn)];
    const at = (q: readonly [number, number]): Vec3 => liftOf(pl, [cx + q[0] * ct - q[1] * st, cy + q[0] * st + q[1] * ct]);
    const segments: [Vec3, Vec3][] = [];
    o.value.points.forEach((a, i) => { // (each side as two short lines through its middle: close enough to see the teeth)
      const b = o.value.points[(i + 1) % o.value.points.length]!;
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const k = o.value.bulges[i]!;
      const m: [number, number] = [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k];
      segments.push([at(a), at(m)], [at(m), at(b)]);
    });
    const twist = helixTwist(target.spec);
    if (twist !== null) { // a helical gear (`in_566`): the outline again at the far end, turned by the twist, and one edge of each tooth carried between the two, as a screw motion (worked out here, the kernel is not asked)
      const turned = (q: readonly [number, number], f: number): Vec3 => { const a = (twist * Math.PI) / 180 * f; const [c, s] = [Math.cos(a), Math.sin(a)]; const p = at([q[0] * c - q[1] * s, q[0] * s + q[1] * c]); return [p[0] + n[0] * target.spec.width! * f, p[1] + n[1] * target.spec.width! * f, p[2] + n[2] * target.spec.width! * f]; };
      const pts = o.value.points;
      const per = pts.length / Math.max(1, Math.round(target.spec.teeth));
      pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]!; segments.push([turned(a, 1), turned(b, 1)]); });
      for (let i = 0; i < pts.length; i += Math.max(1, Math.round(per))) for (let k = 0; k < 4; k++) segments.push([turned(pts[i]!, k / 4), turned(pts[i]!, (k + 1) / 4)]);
    }
    const bore = target.spec.bore ?? 0; // (a ring's wall, or a gear's bore, as the one circle of the preview)
    return { segments, circle: o.value.outerRadius !== undefined ? { center: target.at, radius: o.value.outerRadius, normal: n } : bore > 0 ? { center: target.at, radius: bore / 2, normal: n } : null, cursor: t.cursor };
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
  const typed = typedLength(t.typed[0]);
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
    const target = gearTarget(scene, t);
    if (!target || !gearOutline(target.spec).ok) return null;
    const id = t.gear?.editing ?? nextId(scene, "g");
    const refs = gearRefs({ id, plane: pl.ref, at: target.at, spec: target.spec });
    const select = target.spec.helix !== undefined ? [] : [refs.wall ? diskFaceRef(refs.wall) : loopFaceRef(refs.lines)]; // (a helical gear is made into its body at once, like an extrusion: nothing is left selected)
    return { command: t.gear?.editing ? { type: "setGear", id, spec: target.spec } : { type: "gear", id, plane: pl.ref, at: target.at, spec: target.spec, ...(target.turn ? { turn: target.turn } : {}) }, select };
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

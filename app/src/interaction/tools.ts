// The drawing tools (`dec_interaction_spec`, "Drawing and relations"): rectangle, circle, line. A tool is armed (L, R, C or the menu), the first click on any surface
// sets the plane and the first point, and the figure is finished by a second click or by typing sizes (Enter). A tool draws ONE figure, selects it, and hands back
// to normal selection. Pure: the controller feeds it points and keys; it returns the new tool state and, when a figure is done, the command and what to select.
import { typedNumber } from "../shared/numbers.ts";
import { typedLength, lengthText } from "../shared/units.ts";
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, dist, cross } from "../math/vec.ts";
import type { PointerView, Plane } from "../operation/part.ts";
import { normalOfPlane, pointOf, segmentOf, arcPoints, localOf, liftOf } from "../operation/part.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import { live } from "../operation/ownership.ts";
import type { Command } from "../operation/commands.ts";
import { drawSquaredRectangle, drawCircle, drawChain, drawArc, drawSpline, joinedAtCorners } from "../operation/build.ts";
import { distinctPoints, splinePoints } from "../operation/spline.ts";
import { drawClosedSpline } from "../operation/splinering.ts";
import type { CamKind, CamLaw, CamSpec } from "../operation/cams.ts";
import { camShapes, camShapesQuick } from "../operation/cams.ts";
import { camFace } from "../operation/camscene.ts";
import { loopFaceRef, diskFaceRef } from "../operation/loops.ts";
import { candidatesAt, visibleFrom } from "./picking.ts";
import { anchorCorners, anchorLines, anchorCutCorners } from "../operation/anchors.ts";
import { settings } from "../shared/settings.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Hint } from "./hints.ts";
import { gearOutline, moduleForOutside, helixTwist, helixShear, hasBody } from "../operation/gear.ts";
import { bevelOf, bevelFrame, bevelRaw, bevelLayout } from "../operation/bevel.ts";
import { wormOf, wheelOf, wormLayout } from "../operation/worm.ts";
import type { GearSpec, PulleyKind } from "../operation/gear.ts";
import { standardKey, boreLoop, boreProblem } from "../operation/bore.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { gearRefs } from "../operation/gearscene.ts";
import { chainOf } from "../operation/chains.ts";
import type { GearRecord } from "../operation/gearscene.ts";
import { problemsOf, fromRatio, layoutOf, ratios as planetaryRatios, defaultPin } from "../operation/planetary.ts";
import type { PlanetarySpec, PlanetaryRecord, Problem, Hold } from "../operation/planetary.ts";
import { meshWith } from "../operation/mesh.ts";

export type ToolKind = "rect" | "circle" | "line" | "arc" | "spline" | "cam" | "trim" | "gear";
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
  /** a gear whose size has been set by a click: the pointer no longer changes it, the number box stays open, and the next click in space makes the gear (`in_688`) */
  sized?: true;
  /** a gear (`dec_gear_tool`): a ring or an outside gear, the numbers typed, the field being typed in, and, when its numbers are being changed, which gear and how it is now */
  gear?: GearState;
  /** a cam (`dec_spline_and_cams`): which, and the numbers typed (diameter, lift or offset, the shaft's hole) and the one being typed in */
  cam?: CamState;
}
export interface CamState { kind: CamKind; typed: string[]; field: number; /** a disc cam: the law of its follower's motion */ law?: CamLaw; /** its numbers are being changed: the record (`gearscene.ts`) of the cam */ editing?: string }
/** the numbers of each cam, in the order the box shows them (the rise, dwell and return are degrees) */
export const CAM_FIELDS: Record<CamKind, string[]> = { eccentric: ["Diameter", "Offset", "Hole"], snail: ["Diameter", "Lift", "Hole"], disc: ["Diameter", "Lift", "Rise", "Dwell", "Return", "Hole", "Roller"], ratchet: ["Teeth", "Diameter", "Depth", "Hook", "Hole", "Pawl", "Width", "Angle"], geneva: ["Slots", "Crank", "Pin", "Clearance", "Hole", "Lock"], linear: ["Teeth", "Pitch", "Depth", "Hook", "Base", "Pawl", "Width", "Angle"] };
/** A tool armed to draw a cam: the first click is the shaft, the pointer's distance from it sets the diameter, and numbers can be typed for the rest. */
export const armCam = (kind: CamKind, law?: CamLaw): Tool => ({ ...armTool("cam"), cam: { kind, typed: CAM_FIELDS[kind].map(() => ""), field: 0, ...(law ? { law } : {}) } });
export function camTyped(t: Tool, field: number, text: string): Tool { const c = t.cam!; return { ...t, cam: { ...c, field, typed: c.typed.map((x, i) => (i === field ? text : x)) } }; }
/** The cam being drawn: each number as typed, else the diameter from the pointer's distance from the shaft, the lift or offset a quarter of the radius (an eighth for an offset: the follower moves twice it), the hole a fifth of the diameter. */
export function camSpecOf(t: Tool): CamSpec | null {
  const c = t.cam;
  const at = t.points[0];
  if (!c || !at) return null;
  const typed = (i: number) => typedLength(c.typed[i] ?? "");
  const degrees = (i: number): number | null => { const x = c.typed[i] ?? ""; const n = x === "" || x === "-" ? NaN : Number(x); return Number.isFinite(n) ? n : null; }; // (an angle is not a length: it is not changed by the number system)
  const diameter = typed(0) ?? (t.cursor ? 2 * dist(at, t.cursor) : 0);
  if (c.kind === "linear") {
    const teeth = Math.round(degrees(0) ?? 10);
    const pitch = typed(1) ?? (t.cursor ? dist(at, t.cursor) / Math.max(1, teeth) : 0); // (the pointer's distance from the first click is the bar's length)
    const depth = typed(2) ?? 0.4 * pitch;
    return { kind: "linear", teeth, diameter: 0, pitch, depth, hook: degrees(3) ?? 0, base: typed(4) ?? 1.5 * depth, hole: 0, pawl: typed(5) ?? 3 * pitch, width: typed(6) ?? Math.max(2 * depth, pitch / 2), lift: 0, turn: degrees(7) ?? 0 };
  }
  if (c.kind === "geneva") {
    const crank = typed(1) ?? (t.cursor ? dist(at, t.cursor) : 0);
    return { kind: "geneva", teeth: Math.round(degrees(0) ?? 4), diameter: 2 * crank, crank, pin: typed(2) ?? crank / 4, clearance: typed(3) ?? 0.3, hole: typed(4) ?? -1, ...(typed(5) !== null ? { lock: typed(5)! } : {}), lift: 0 }; // (a hole left empty is worked out from the room there is, `genevaShapes`)
  }
  if (c.kind === "ratchet") {
    const teeth = Math.round(degrees(0) ?? 20);
    const diameter = typed(1) ?? (t.cursor ? 2 * dist(at, t.cursor) : 0);
    const pitch = (Math.PI * diameter) / Math.max(1, teeth);
    const depth = typed(2) ?? 0.4 * pitch;
    return { kind: "ratchet", teeth, diameter, depth, hook: degrees(3) ?? 0, hole: typed(4) ?? diameter / 5, pawl: typed(5) ?? 0.7 * diameter, width: typed(6) ?? Math.max(2 * depth, diameter / 10), lift: 0, turn: degrees(7) ?? 0 };
  }
  if (c.kind === "disc") return { kind: "disc", law: c.law ?? "cycloidal", diameter, lift: typed(1) ?? diameter / 8, rise: degrees(2) ?? 120, dwell: degrees(3) ?? 30, ret: degrees(4) ?? 120, hole: typed(5) ?? diameter / 5, roller: typed(6) ?? 0 };
  return { kind: c.kind, diameter, lift: typed(1) ?? diameter / (c.kind === "eccentric" ? 16 : 8), hole: typed(2) ?? diameter / 5 };
}
export interface GearState {
  internal: boolean; typed: string[]; field: number; editing?: string; base?: GearSpec;
  /** the box opened on this number: its text is taken into the box's focus and scrolled to when it opens (`in_771`: the Helix item of a gear's icon) */ focus?: true;
  /** the number that was taken back to a value that makes a gear (`in_690`): its field, and when (the box and the drawing flash red for a moment) */ bad?: { field: number; at: number };
  /** the turn the gear being changed has (radians), so its preview stands as it does */ turn?: number;
  /** a rack (`in_579`) */ rack?: boolean;
  /** a worm (`in_608`) and the wheel for a worm */ worm?: true; wheel?: true;
  /** a straight bevel gear (`in_735`): an approximation of the standard tooth */ bevel?: true;
  /** a timing pulley for this belt (`in_583`) */ pulley?: PulleyKind;
  /** a roller chain sprocket (`in_584`) */ sprocket?: true;
  /** the ISO 606 tooth form of it (`in_588`) */ iso?: true;
  /** a cycloidal (clock) gear (`in_585`) */ cycloidal?: true;
  /** a planetary set (`dec_planetary_gears`): the numbers of a sun, planets, ring and carrier; when its numbers are being changed, the set as it is now */ planetary?: true; planetaryBase?: PlanetarySpec;
  /** a gear or a rack made to mesh with `src` (`in_672`); `rack`: the partner is a rack */ mesh?: { src: GearRecord; rack: boolean; ring?: boolean };
}
export type GearKey = "teeth" | "module" | "pressure" | "shift" | "backlash" | "rim" | "bore" | "ratio" | "angle" | "offset" | "clearance" | "chain" | "pitch" | "roller" | "circle" | "addendum" | "dedendum" | "fit" | "flat" | "key" | "keydepth" | "fillet" | "helix" | "width" | "land" | "diameter" | "length" | "starts" | "journal" | "runout" | "mate" | "shaft" | "face" | "sun" | "planet" | "planets" | "pin" | "pingap" | "carrier" | "chamfer" | "plategap" | "spacing" | "housing" | "cap" | "housingfit";
/** The numbers of a gear in the order the number box shows them (a ring has a wall where a gear has a shift; a rack has the bar under its teeth; a partner has its tooth count, ratio and the direction it stands in). */
export const gearFields = (g: { planetary?: true; internal: boolean; worm?: true; wheel?: true; bevel?: true; rack?: boolean; pulley?: PulleyKind; sprocket?: true; iso?: true; cycloidal?: true; mesh?: { src: GearRecord; rack: boolean; ring?: boolean } }): { key: GearKey; label: string }[] => {
  const f = (key: GearKey, label: string) => ({ key, label });
  if (g.planetary) return [f("sun", "Sun teeth"), f("planet", "Planet teeth"), f("planets", "Planets"), f("ratio", "Ratio"), f("module", "Module"), f("width", "Width"), f("helix", "Helix"), f("pressure", "Pressure"), f("backlash", "Backlash"), f("clearance", "Clearance"), f("bore", "Sun bore"), f("rim", "Wall"), f("pin", "Pin"), f("pingap", "Pin gap"), f("carrier", "Carrier"), f("plategap", "Plate gap"), f("spacing", "Spacing"), f("housing", "Housing"), f("cap", "Housing cap"), f("housingfit", "Housing fit")]; // (a planetary set, `dec_planetary_gears`)
  const fs = gearFieldsBase(g, f);
  const at = fs.findIndex((x) => x.key === "bore");
  const withBore = at < 0 ? fs : [...fs.slice(0, at + 1), f("flat", "Flat"), f("key", "Key"), f("keydepth", "Key depth"), ...fs.slice(at + 1)]; // (a bore can have a D flat or a keyway, `in_589`)
  const plain = !g.worm && !g.wheel && !g.bevel && !g.rack && !g.pulley && !g.sprocket && !g.cycloidal && !g.mesh;
  return plain ? [...withBore, f("chamfer", "Chamfer")] : withBore; // (the tips of the teeth broken at the faces, last so that the numbers before it keep their places, `in_791`)
};
const gearFieldsBase = (g: { internal: boolean; worm?: true; wheel?: true; bevel?: true; rack?: boolean; pulley?: PulleyKind; sprocket?: true; iso?: true; cycloidal?: true; mesh?: { src: GearRecord; rack: boolean; ring?: boolean } }, f: (key: GearKey, label: string) => { key: GearKey; label: string }): { key: GearKey; label: string }[] => {
  if (g.bevel) return [f("teeth", "Teeth"), f("mate", "Mate teeth"), f("module", "Module"), f("pressure", "Pressure"), f("shaft", "Shaft angle"), f("face", "Face width"), f("backlash", "Backlash"), f("bore", "Bore")]; // (an approximation of the standard tooth, `in_735`)
  if (g.worm) return [f("teeth", "Starts"), f("module", "Module"), f("pressure", "Pressure"), f("diameter", "Diameter"), f("length", "Length"), f("journal", "Journal"), f("runout", "Run-out"), f("bore", "Bore")];
  if (g.wheel) return [f("teeth", "Teeth"), f("starts", "Starts"), f("module", "Module"), f("pressure", "Pressure"), f("diameter", "Worm diameter"), f("width", "Width"), f("land", "Land"), f("bore", "Bore")];
  if (g.mesh?.src.spec.worm) return [f("teeth", "Teeth"), f("offset", "Offset"), f("width", "Width"), f("land", "Land"), f("bore", "Bore")]; // (the wheel for a worm: how many teeth, how far along the worm, how wide)
  if (g.mesh?.src.spec.wheel) return [f("teeth", "Starts"), f("offset", "Offset"), f("length", "Length"), f("bore", "Bore")]; // (the worm for a worm wheel, `in_697`)
  if (g.mesh) return g.mesh.src.spec.rack ? [f("teeth", "Teeth"), f("offset", "Offset"), f("bore", "Bore")] : g.mesh.rack ? [f("teeth", "Teeth"), f("angle", "Angle")] : g.mesh.ring ? [f("teeth", "Teeth"), f("ratio", "Ratio"), f("angle", "Angle")] : [f("teeth", "Teeth"), f("ratio", "Ratio"), f("angle", "Angle"), f("bore", "Bore")]; // (a gear made to mesh can have its bore at once, `in_588`)
  if (g.pulley) return [f("teeth", "Teeth"), f("clearance", "Clearance"), f("bore", "Bore")];
  if (g.cycloidal) return [f("teeth", "Teeth"), f("module", "Module"), f("backlash", "Backlash"), f("circle", "Circle"), f("addendum", "Addendum"), f("dedendum", "Dedendum"), g.internal ? f("rim", "Wall") : g.rack ? f("rim", "Base") : f("bore", "Bore")];
  if (g.sprocket) return [f("teeth", "Teeth"), f("chain", "Chain"), f("pitch", "Pitch"), f("roller", "Roller"), ...(g.iso ? [f("fit", "Fit")] : []), f("bore", "Bore")];
  if (g.rack) return [f("teeth", "Teeth"), f("module", "Module"), f("pressure", "Pressure"), f("backlash", "Backlash"), f("rim", "Base"), f("clearance", "Clearance"), f("helix", "Helix"), f("width", "Thickness")];
  return [f("teeth", "Teeth"), f("module", "Module"), f("pressure", "Pressure"), g.internal ? f("rim", "Wall") : f("shift", "Shift"), f("backlash", "Backlash"), f("clearance", "Clearance"), ...(g.internal ? [f("helix", "Helix"), f("width", "Thickness")] : [f("fillet", "Fillet"), f("helix", "Helix"), f("width", "Thickness"), f("bore", "Bore")])]; // (the root as the cutter leaves it, `in_592`)
};
const gearState = (t: Tool): GearState => t.gear ?? { internal: false, typed: [], field: 0 };
/** A tool that waits for its first click on a surface. */
export type GearVariant = "planetary" | "gear" | "bevel" | "worm" | "wormwheel" | "ring" | "rack" | "gt2" | "gt3" | "htd5" | "htd8" | "sprocket" | "isosprocket" | "clock" | "clockring" | "clockrack";
export const variantOf = (g: { planetary?: true; bevel?: unknown; internal?: boolean; rack?: boolean; pulley?: PulleyKind; sprocket?: unknown; iso?: unknown; cycloidal?: unknown } | undefined): GearVariant => (g?.planetary ? "planetary" : g?.bevel ? "bevel" : g?.cycloidal ? (g.internal ? "clockring" : g.rack ? "clockrack" : "clock") : g?.sprocket ? (g.iso ? "isosprocket" : "sprocket") : g?.pulley === "2GT" ? "gt2" : g?.pulley === "3GT" ? "gt3" : g?.internal ? "ring" : g?.rack ? "rack" : "gear");
export const armTool = (kind: ToolKind, variant: GearVariant = "gear"): Tool => ({ kind, plane: null, points: [], cursor: null, typed: ["", ""], field: 0, ...(kind === "gear" ? { gear: { internal: variant === "ring" || variant === "clockring", ...(variant === "planetary" ? { planetary: true as const } : {}), ...(variant === "worm" ? { worm: true as const } : {}), ...(variant === "bevel" ? { bevel: true as const } : {}), ...(variant === "wormwheel" ? { wheel: true as const } : {}), typed: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], field: 0, ...(variant === "rack" || variant === "clockrack" ? { rack: true } : {}), ...(variant === "gt2" ? { pulley: "2GT" as const } : variant === "gt3" ? { pulley: "3GT" as const } : variant === "htd5" ? { pulley: "HTD5M" as const } : variant === "htd8" ? { pulley: "HTD8M" as const } : {}), ...(variant === "sprocket" || variant === "isosprocket" ? { sprocket: true as const } : {}), ...(variant === "isosprocket" ? { iso: true as const } : {}), ...(variant === "clock" || variant === "clockring" || variant === "clockrack" ? { cycloidal: true as const } : {}) } } : {}) });
/** Whether a gear can have a helix put on it (`in_692`): a plain outside spur gear, or one that has it already; the other kinds (rings, racks, pulleys, sprockets, clock gears, worms) have none yet. */
export const canHelix = (spec: GearSpec): boolean => !spec.bevel && !spec.pulley && !spec.sprocket && !spec.cycloidal && !spec.worm && !spec.wheel;
/** The tool opened to make a gear or a rack that meshes with `src`: its centre is the gear's, the pointer says where the partner goes. */
export const meshGearTool = (src: GearRecord, rack: boolean, ring = false): Tool => ({ ...armTool("gear"), plane: src.plane, points: [src.at], cursor: src.at, gear: { internal: ring, typed: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], field: 0, mesh: { src, rack, ring } } });
/** The tool opened on a planetary set that is already made, to change its numbers: the whole set, as it was when it was made (`dec_planetary_gears`). */
export const editPlanetaryTool = (rec: PlanetaryRecord): Tool => ({ ...armTool("gear", "planetary"), plane: rec.plane, points: [rec.at], cursor: rec.at, gear: { internal: false, planetary: true, typed: Array.from({ length: 24 }, () => ""), field: 0, editing: rec.id, planetaryBase: rec.spec, ...(rec.turn ? { turn: rec.turn } : {}) } });
/** The tool opened on a cam or a ratchet that is already made, to change its numbers: its plane and shaft, and its numbers as they are now (in the number system in use; the angles in degrees). */
export function editCamTool(rec: { id: string; plane: Ref; at: Vec3; spec: GearSpec; turn?: number }): Tool {
  const c = rec.spec.cam!;
  const len = (n: number | undefined): string => (n === undefined ? "" : lengthText(n));
  const num = (n: number | undefined): string => (n === undefined ? "" : String(Math.round(n * 1e6) / 1e6));
  const typed = c.kind === "linear" ? [num(c.teeth), len(c.pitch), len(c.depth), num(c.hook ?? 0), len(c.base), len(c.pawl), len(c.width), num(Math.round((((rec.turn ?? 0) * 180) / Math.PI) * 1e6) / 1e6)] : c.kind === "geneva" ? [num(c.teeth), len(c.crank), len(c.pin), len(c.clearance), c.hole >= 0 ? len(c.hole) : "", c.lock === undefined ? "" : len(c.lock)] : c.kind === "ratchet" ? [num(c.teeth), len(c.diameter), len(c.depth), num(c.hook ?? 0), len(c.hole), len(c.pawl), len(c.width), num(Math.round((((rec.turn ?? 0) * 180) / Math.PI) * 1e6) / 1e6)]
    : c.kind === "disc" ? [len(c.diameter), len(c.lift), num(c.rise), num(c.dwell), num(c.ret), len(c.hole), len(c.roller ?? 0)]
    : [len(c.diameter), len(c.lift), len(c.hole)];
  return { ...armCam(c.kind, c.law), plane: rec.plane, points: [rec.at], cursor: rec.at, cam: { kind: c.kind, typed, field: 0, ...(c.law ? { law: c.law } : {}), editing: rec.id } };
}
/** The tool opened on a gear that is already made, to change its numbers (`focus`: the number the box starts at, as the helix item does, `in_693`): its plane and centre, and its numbers as they are. */
export const editGearTool = (rec: { id: string; plane: Ref; at: Vec3; spec: GearSpec; turn?: number }, focus?: GearKey): Tool => ({ ...armTool("gear", variantOf(rec.spec)), plane: rec.plane, points: [rec.at], cursor: rec.at, gear: { internal: !!rec.spec.internal, ...(rec.spec.bevel ? { bevel: true as const } : {}), ...(rec.spec.worm ? { worm: true as const } : {}), ...(rec.spec.wheel ? { wheel: true as const } : {}), ...(rec.spec.rack ? { rack: true } : {}), ...(rec.spec.pulley ? { pulley: rec.spec.pulley } : {}), ...(rec.spec.sprocket ? { sprocket: true as const } : {}), ...(rec.spec.sprocket?.iso ? { iso: true as const } : {}), ...(rec.spec.cycloidal ? { cycloidal: true as const } : {}), typed: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], field: Math.max(0, gearFields({ internal: !!rec.spec.internal, ...(rec.spec.bevel ? { bevel: true as const } : {}), ...(rec.spec.worm ? { worm: true as const } : {}), ...(rec.spec.wheel ? { wheel: true as const } : {}), ...(rec.spec.rack ? { rack: true } : {}), ...(rec.spec.pulley ? { pulley: rec.spec.pulley } : {}), ...(rec.spec.sprocket ? { sprocket: true as const } : {}), ...(rec.spec.sprocket?.iso ? { iso: true as const } : {}), ...(rec.spec.cycloidal ? { cycloidal: true as const } : {}) }).findIndex((f) => f.key === focus)), editing: rec.id, base: rec.spec, ...(focus ? { focus: true as const } : {}), ...(rec.turn ? { turn: rec.turn } : {}) } });

export const FIELDS: Record<ToolKind, string[]> = { rect: ["Width", "Height"], circle: ["Diameter"], line: ["Length"], arc: ["Height"], spline: [], cam: [], trim: [], gear: ["Teeth", "Module"] };

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
    return typed === null ? t : { ...t, gear: { ...g, typed: Array.from({ length: 24 }, (_, i) => (i === g.field ? typed : g.typed[i] ?? "")) } };
  }
  if (t.kind === "cam" && t.cam) {
    if (key === "Tab") return { ...t, cam: { ...t.cam, field: (t.cam.field + 1) % t.cam.typed.length } };
    const typed = typeInto(t.cam.typed[t.cam.field] ?? "", key);
    return typed === null ? t : camTyped(t, t.cam.field, typed);
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
  return { ...t, gear: { ...g, field, typed: Array.from({ length: 24 }, (_, i) => (i === field ? text : g.typed[i] ?? "")) } };
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
/** What the ends of a worm are while nothing is typed for them: its journal and the run-out of its thread. */
function wormEndsLive(spec: GearSpec): { journal: number; runout: number } | Record<string, never> {
  const g = spec.worm ? wormOf(spec) : null;
  if (!g || !g.ok) return {};
  const l = wormLayout(g.value, spec.worm!);
  return { journal: l.journal, runout: l.runout };
}
/** The bore a new gear has unless 0 is typed (`in_691`): 5 mm, the common small shaft, or less where the gear is too small to take it (two fifths of the root circle's diameter), to the half millimetre below; none under 1 mm. */
const defaultBore = (teeth: number, module: number): number => { const d = Math.min(5, 0.4 * module * (teeth - 2.5)); return d >= 1 ? Math.floor(d * 2) / 2 : 0; };
const shapeOf = (typed: (k: string) => number | null, b: GearSpec | undefined, focus?: string) => {
  const [flat, key, keyDepth] = [typed("flat") ?? b?.flat, typed("key") ?? b?.key, typed("keydepth") ?? b?.keyDepth];
  // a bore has a flat or a keyway, not both: the one typed last takes the other's numbers to nothing (`in_689`)
  const flatNew = !!typed("flat"), keyNew = !!(typed("key") || typed("keydepth"));
  const keep = flatNew && keyNew ? (focus === "flat" ? "flat" : "key") : flatNew ? "flat" : keyNew ? "key" : flat ? "flat" : "key";
  return keep === "flat" ? { ...(flat ? { flat } : {}) } : { ...(key ? { key } : {}), ...(keyDepth ? { keyDepth } : {}) };
};
function gearSpecOf(t: Tool): GearSpec | null {
  const g = gearState(t);
  const fields = gearFields(g);
  const typed = (k: string) => { const i = fields.findIndex((f) => f.key === k); return i < 0 ? null : typedNumber(g.typed[i] ?? ""); };
  const b = g.base;
  if (g.bevel) { // a straight bevel gear (`in_735`): an approximation of the standard tooth; the module is 2 unless another is typed, its mate has as many teeth again as it unless typed, the shafts are at 90 degrees, the face a third of the cone distance
    const teeth = Math.round(typed("teeth") ?? b?.teeth ?? 20);
    const module = typed("module") ?? b?.module ?? 2;
    const [pressure, backlash] = [typed("pressure") ?? b?.pressure, typed("backlash") ?? b?.backlash];
    const [mate, shaft, face] = [Math.round(typed("mate") ?? b?.bevel?.mate ?? teeth), typed("shaft") ?? b?.bevel?.shaft, typed("face") ?? b?.bevel?.face];
    const bore = typed("bore") ?? b?.bore ?? (b ? undefined : defaultBore(teeth, module) || undefined);
    return { teeth, module, ...(pressure !== undefined ? { pressure } : {}), ...(backlash !== undefined ? { backlash } : {}), bevel: { mate, ...(shaft !== undefined && shaft !== 90 ? { shaft } : {}), ...(face !== undefined ? { face } : {}), ...(b?.bevel?.frame ? { frame: b.bevel.frame } : {}), ...(b?.bevel?.with ? { with: b.bevel.with } : {}), ...(b?.bevel?.dir !== undefined ? { dir: b.bevel.dir } : {}) }, ...(bore ? { bore, ...shapeOf(typed, b, fields[g.field]?.key) } : {}) };
  }
  if (g.worm || g.wheel) { // a worm or a worm wheel (`in_608`): the module is 2 unless another is typed, the worm's pitch diameter ten modules, its length 15 (or 2.5 leads, if more)
    const module = typed("module") ?? b?.module ?? 2;
    const pressure = typed("pressure") ?? b?.pressure;
    const bore = typed("bore") ?? b?.bore;
    const diameter = typed("diameter") ?? b?.worm?.diameter ?? b?.wheel?.diameter ?? 10 * module;
    if (g.worm) {
      const starts = Math.round(typed("teeth") ?? b?.teeth ?? 1);
      const length = typed("length") ?? b?.worm?.length ?? Math.max(15, 2.5 * Math.PI * Math.max(1, starts)) * module;
      const [journal, runout] = [typed("journal") ?? b?.worm?.journal, typed("runout") ?? b?.worm?.runout]; // (left empty: the default for this worm, `in_696`)
      return { teeth: starts, module, ...(pressure !== undefined ? { pressure } : {}), worm: { diameter, length, ...(journal !== undefined ? { journal } : {}), ...(runout !== undefined ? { runout } : {}) }, ...(bore ? { bore, ...shapeOf(typed, b, fields[g.field]?.key) } : {}) };
    }
    const starts = Math.round(typed("starts") ?? b?.wheel?.starts ?? 1);
    const throat = diameter / 2 - 1.25 * module + 0.25 * module;
    const width = typed("width") ?? b?.wheel?.width ?? Math.min(6 * module, 1.2 * throat);
    return { teeth: Math.round(typed("teeth") ?? b?.teeth ?? 30), module, ...(pressure !== undefined ? { pressure } : {}), wheel: { starts, diameter, width, land: typed("land") ?? b?.wheel?.land ?? 0 }, ...(bore ? { bore, ...shapeOf(typed, b, fields[g.field]?.key) } : {}) };
  }
  if (g.pulley) { // a timing pulley: its grooves, how much bigger than the belt tooth they are, and a bore; the belt fixes the rest
    const [clearance, bore] = [typed("clearance") ?? b?.clearance, typed("bore") ?? b?.bore];
    return { teeth: Math.round(typed("teeth") ?? b?.teeth ?? 20), module: g.pulley === "2GT" ? 2 : g.pulley === "3GT" ? 3 : g.pulley === "HTD8M" ? 8 : 5, pulley: g.pulley, ...(clearance ? { clearance } : {}), ...(bore ? { bore, ...shapeOf(typed, b, fields[g.field]?.key) } : {}) };
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
    return { teeth, module, ...(g.internal ? { internal: true as const } : {}), ...(g.rack ? { rack: true as const } : {}), ...(rim !== undefined ? { rim } : {}), cycloidal: { ...(circle ? { circle } : {}), ...(addendum ? { addendum } : {}), ...(dedendum ? { dedendum } : {}) }, ...(backlash !== undefined ? { backlash } : {}), ...(bore ? { bore, ...shapeOf(typed, b, fields[g.field]?.key) } : {}) };
  }
  if (g.sprocket) { // a roller chain sprocket: its teeth, the chain by its ANSI number, or its own pitch and roller diameter (mm), and a bore
    const [chain, pitch, roller, bore] = [typed("chain") ?? b?.sprocket?.chain, typed("pitch") ?? b?.sprocket?.pitch, typed("roller") ?? b?.sprocket?.roller, typed("bore") ?? b?.bore];
    const fit = g.iso ? typed("fit") ?? b?.sprocket?.fit : undefined;
    return { teeth: Math.round(typed("teeth") ?? b?.teeth ?? (g.iso ? 20 : 18)), module: 1, sprocket: { chain: chain ?? (pitch || roller ? undefined : g.iso ? 8 : 40), ...(pitch ? { pitch } : {}), ...(roller ? { roller } : {}), ...(g.iso ? { iso: true } : {}), ...(fit !== undefined ? { fit } : {}) }, ...(bore ? { bore, ...shapeOf(typed, b, fields[g.field]?.key) } : {}) };
  }
  const teeth = Math.round(typed("teeth") ?? b?.teeth ?? (g.rack ? 10 : 20));
  const pressure = typed("pressure") ?? b?.pressure;
  const shift = g.internal || g.rack ? undefined : typed("shift") ?? b?.shift;
  const backlash = typed("backlash") ?? b?.backlash;
  const clearance = typed("clearance") ?? b?.clearance; // (the root clearance, in modules)
  const rim = g.internal || g.rack ? typed("rim") ?? b?.rim : undefined;
  const boreTyped = g.internal || g.rack ? undefined : typed("bore") ?? b?.bore;
  const fillet = g.internal || g.rack ? undefined : typed("fillet") ?? b?.fillet;
  const chamfer = g.rack ? undefined : typed("chamfer") ?? b?.chamfer; // (the tips of the teeth broken at the faces, in modules, `in_791`)
  const detail = g.internal || g.rack ? undefined : b?.detail;
  const helixAsked = typed("helix") ?? b?.helix ?? 0; // (a gear with a helix is a body: 0 is a plain gear, `in_693`)
  const thickAsked = typed("width") ?? b?.width ?? 0; // (and so is a gear with a thickness: 0 with no helix is a flat outline, `in_697`)
  const helix = helixAsked || undefined;
  const typedModule = typed("module");
  let module = typedModule !== null && typedModule > 0 ? typedModule : b?.module;
  if (module === undefined) {
    const [a, c] = [t.points[0], t.cursor];
    const reach = a && c ? dist(a, c) : 0;
    if (reach < 1e-6) return null;
    const exact = g.rack ? (2 * reach) / (Math.PI * Math.max(1, teeth)) : g.internal ? reach / (teeth / 2 + 1 + (clearance ?? 0.25) + (rim ?? 2)) : moduleForOutside(teeth, 2 * reach, shift ?? 0);
    module = Math.max(0.1, Math.round(exact / 0.05) * 0.05);
  }
  const bore = boreTyped ?? (g.internal || g.rack || b ? undefined : defaultBore(teeth, module)); // (a new gear has a bore unless 0 is typed, `in_691`)
  return { teeth, module, ...(pressure !== undefined ? { pressure } : {}), ...(shift !== undefined ? { shift } : {}), ...(backlash !== undefined ? { backlash } : {}), ...(clearance !== undefined ? { clearance } : {}), ...(g.internal ? { internal: true as const } : {}), ...(g.rack ? { rack: true as const } : {}), ...(rim !== undefined ? { rim } : {}), ...(fillet ? { fillet } : {}), ...(chamfer ? { chamfer } : {}), ...(detail ? { detail } : {}), ...(helix !== undefined || thickAsked > 0 ? { ...(helix !== undefined ? { helix } : {}), width: thickAsked > 0 ? thickAsked : 6 * module } : {}), ...(bore ? { bore, ...shapeOf(typed, b, fields[g.field]?.key) } : {}) };
}
type GearTarget = { spec: GearSpec; at: Vec3; turn: number; live: Partial<Record<GearKey, number>>; /** a planetary set: its numbers, the ratio for each part held, and what is worth a warning */ planetary?: { spec: PlanetarySpec; ratios: Record<Hold, number>; warnings: Problem[]; ringTeeth: number } };
/** The gear the tool would make, or why it would make none (`in_580`: said when Enter or a click makes nothing); null while there is nothing to say yet (no size, no plane). */
/**
 * The planetary set the tool would make (`dec_planetary_gears`): the teeth as typed, or, when a ratio is typed (with the ring held), the nearest set of whole teeth for the number of planets, keeping the sun's or the planet's teeth if one of them is typed too;
 * everything else as typed, else as the set has it now, else the default (3 planets, module 2, 6 mm wide, a sun of 24 teeth and planets of 18). `target.spec` is the sun's gear, so the generic code that looks at a gear's outline sees one.
 */
function planetaryMade(scene: Scene, t: Tool): Result<GearTarget> | null {
  const g = gearState(t);
  const pl = t.plane ? scene.parts[t.plane] : undefined;
  const at = t.points[0];
  if (!pl || pl.kind !== "plane" || !at) return null;
  const fields = gearFields(g);
  const typed = (k: string) => { const i = fields.findIndex((f) => f.key === k); return i < 0 ? null : typedNumber(g.typed[i] ?? ""); };
  const b = g.planetaryBase;
  const planets = Math.round(typed("planets") ?? b?.planets ?? 3);
  const module = typed("module") ?? b?.module ?? 2;
  const width = typed("width") ?? b?.width ?? 6;
  const helixT = typed("helix") ?? b?.helix;
  const helix = helixT ? helixT : undefined;
  const pressure = typed("pressure") ?? b?.pressure;
  const base = { planets, module, width, ...(helix ? { helix } : {}), ...(pressure !== undefined ? { pressure } : {}), ...(typed("spacing") ?? b?.spacing ? { spacing: 1 } : {}) };
  const [sunT, planetT, ratioT] = [typed("sun"), typed("planet"), typed("ratio")];
  let sun = Math.round(sunT ?? b?.sun ?? 24), planet = Math.round(planetT ?? b?.planet ?? 18);
  if (ratioT !== null && !(sunT !== null && planetT !== null)) { // the ratio is asked for: its teeth are worked out (what is typed of the teeth is kept)
    if (!(ratioT > 1)) return err("the ratio (ring held, sun in, carrier out) is above 1");
    const found = fromRatio(ratioT, "ring", base).filter((x) => (sunT === null || x.sun === Math.round(sunT)) && (planetT === null || x.planet === Math.round(planetT)));
    const best = found[0];
    if (!best) return err(`no set of whole teeth makes ${ratioT}:1 with ${planets} planets${sunT !== null || planetT !== null ? " and the teeth typed" : ""}`);
    [sun, planet] = [best.sun, best.planet];
  }
  const num = (k: string, d: number | undefined) => typed(k) ?? d;
  const boreT = typed("bore");
  const spec: PlanetarySpec = {
    sun, planet, planets, module, width, ...(helix ? { helix } : {}), ...(pressure !== undefined ? { pressure } : {}),
    ...(num("backlash", b?.backlash) ? { backlash: num("backlash", b?.backlash)! } : {}), ...(num("clearance", b?.clearance) !== undefined ? { clearance: num("clearance", b?.clearance)! } : {}),
    ...(boreT !== null ? { bore: boreT } : b?.bore !== undefined ? { bore: b.bore } : {}), ...(num("rim", b?.rim) !== undefined ? { rim: num("rim", b?.rim)! } : {}),
    ...(num("pin", b?.pin) !== undefined ? { pin: num("pin", b?.pin)! } : {}), ...(num("pingap", b?.pinGap) !== undefined ? { pinGap: num("pingap", b?.pinGap)! } : {}), ...(num("carrier", b?.carrier) ? { carrier: num("carrier", b?.carrier)! } : {}), ...(num("plategap", b?.plateGap) ? { plateGap: num("plategap", b?.plateGap)! } : {}), ...(num("spacing", b?.spacing) ? { spacing: 1 } : {}),
    ...(num("housing", b?.housing) ? { housing: num("housing", b?.housing)! } : {}), ...(num("cap", b?.housingCap) ? { housingCap: num("cap", b?.housingCap)! } : {}), ...(num("housingfit", b?.housingFit) !== undefined ? { housingFit: num("housingfit", b?.housingFit)! } : {}),
  };
  const bad = problemsOf(spec).find((p) => p.fatal);
  if (bad) return err(bad.text);
  const turn = g.turn ?? 0;
  const lay = layoutOf(spec, pl, at, turn);
  if (!lay.ok) return err(lay.error);
  for (const x of [lay.value.sun, lay.value.planets[0]!, lay.value.ring]) { const o = gearOutline(x.spec); if (!o.ok) return err(o.error); }
  const r = planetaryRatios(spec);
  const live: Partial<Record<GearKey, number>> = { sun: spec.sun, planet: spec.planet, planets: spec.planets, ratio: r.ring, module, width, helix: helix ?? 0, pressure: pressure ?? 20, backlash: spec.backlash ?? 0, clearance: spec.clearance ?? 0.25, bore: lay.value.sun.spec.bore ?? 0, rim: spec.rim ?? 2, pin: spec.pin ?? defaultPin(spec), pingap: spec.pinGap ?? 0.2, carrier: spec.carrier ?? 0, plategap: spec.plateGap ?? 0, spacing: spec.spacing ?? 0, housing: spec.housing ?? 0, cap: spec.housingCap ?? 0, housingfit: spec.housingFit ?? 0.2 };
  return ok({ spec: lay.value.sun.spec, at, turn, live, planetary: { spec, ratios: r, warnings: problemsOf(spec).filter((p) => !p.fatal), ringTeeth: spec.sun + 2 * spec.planet } });
}
/** The ratios of the set the tool would make, as a line for the box (each part held, the ring's teeth), and what is worth a warning; null for a tool that is not a planetary set or makes none. */
export function planetaryInfo(scene: Scene, t: Tool): string | null {
  if (t.kind !== "gear" || !t.gear?.planetary) return null;
  const r = planetaryMade(scene, t);
  const p = r && r.ok ? r.value.planetary : null;
  if (!p) return null;
  const x = (v: number) => `${Math.abs(v) < 100 ? +v.toFixed(3) : Math.round(v)}:1`;
  return [`Ring ${p.ringTeeth} teeth.`, `Ring held (sun in, carrier out): ${x(p.ratios.ring)}.`, `Carrier held (sun in, ring out, reversed): ${x(p.ratios.carrier)}.`, `Sun held (ring in, carrier out): ${x(p.ratios.sun)}.`, ...p.warnings.map((w) => w.text.charAt(0).toUpperCase() + w.text.slice(1) + ".")].join(" ");
}
function gearMade(scene: Scene, t: Tool): Result<GearTarget> | null {
  const g = gearState(t);
  if (g.planetary) return planetaryMade(scene, t);
  const pl = t.plane ? scene.parts[t.plane] : undefined;
  if (!g.mesh) {
    const spec = gearSpecOf(t);
    const at = t.points[0];
    if (!spec || !at) return null;
    const o = gearOutline(spec);
    if (!o.ok) return err(o.error);
    return ok({ spec, at, turn: g.turn ?? 0, live: { ...(spec.bevel ? { mate: spec.bevel.mate, shaft: spec.bevel.shaft ?? 90, face: Math.round((spec.bevel.face ?? 1 / 3) * 1000) / 1000 } : {}), teeth: spec.teeth, module: spec.module, pressure: spec.pressure ?? 20, shift: spec.shift ?? 0, backlash: spec.backlash ?? 0, rim: spec.rim ?? 2, bore: spec.bore ?? 0, fillet: spec.fillet ?? 0, chamfer: spec.chamfer ?? 0, helix: spec.helix ?? 0, diameter: spec.worm?.diameter ?? spec.wheel?.diameter ?? 0, land: spec.wheel?.land ?? 0, length: spec.worm?.length ?? 0, ...wormEndsLive(spec), starts: spec.wheel?.starts ?? 1, width: spec.width ?? 0, flat: spec.flat ?? 0, key: spec.key ?? 0, keydepth: spec.keyDepth ?? (spec.bore ? standardKey(spec.bore)?.t2 ?? 0 : 0), clearance: spec.clearance ?? (spec.pulley === "HTD5M" ? 0.07 : spec.pulley ? 0 : 0.25), circle: spec.cycloidal?.circle ?? 3, addendum: spec.cycloidal?.addendum ?? 1, dedendum: spec.cycloidal?.dedendum ?? 1.25, chain: spec.sprocket?.chain ?? 0, fit: spec.sprocket?.fit ?? 0.5, ...(spec.sprocket ? (() => { const c = chainOf(spec.sprocket); return c ? { pitch: c.pitch, roller: c.roller } : {}; })() : {}) } });
  }
  if (!pl || pl.kind !== "plane") return null;
  const { src, rack, ring } = g.mesh;
  const fields = gearFields(g);
  const typed = (k: string) => { const i = fields.findIndex((f) => f.key === k); return i < 0 ? null : typedNumber(g.typed[i] ?? ""); };
  const srcRack = !!src.spec.rack;
  const ratio = typed("ratio");
  const teeth = Math.round(typed("teeth") ?? (src.spec.worm ? 30 : src.spec.wheel ? src.spec.wheel.starts : ratio !== null && ratio > 0 && !srcRack ? ratio * src.spec.teeth : srcRack ? 16 : rack ? 10 : ring ? 2 * src.spec.teeth : src.spec.internal ? Math.max(3, Math.floor(src.spec.teeth / 2)) : src.spec.teeth)); // (a partner has as many teeth as the gear it meshes with, but a gear in a ring has half the ring's and a ring round a gear twice the gear's: the same number would be refused, `in_686`)
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
  const [wOff, wWidth] = [typed("offset") ?? 0, src.spec.wheel ? typed("length") : typed("width")];
  const wLand = typed("land");
  const r = meshWith(src, pl.u, pl.v, { teeth, rack, ring, ...(src.spec.worm || src.spec.wheel ? { offset: wOff, ...(wWidth ? { width: wWidth } : {}), ...(wLand !== null ? { land: wLand } : {}) } : {}) }, where);
  if (!r.ok) return err(r.error);
  const bore = rack ? null : typed("bore") ?? (src.spec.worm || src.spec.wheel ? null : defaultBore(teeth, r.value.spec.module) || null); // (a partner has a bore too, `in_691`)
  const spec = bore ? { ...r.value.spec, bore, ...shapeOf(typed, undefined, fields[g.field]?.key) } : r.value.spec;
  const o = gearOutline(spec);
  if (!o.ok) return err(o.error);
  return ok({ ...r.value, spec, live: { teeth, ratio: srcRack ? 0 : teeth / src.spec.teeth, angle: (where * 180) / Math.PI, offset: src.spec.worm || src.spec.wheel ? wOff : where, width: r.value.spec.wheel?.width ?? 0, land: r.value.spec.wheel?.land ?? 0, length: r.value.spec.worm?.length ?? 0, bore: spec.bore ?? 0, flat: spec.flat ?? 0, key: spec.key ?? 0, keydepth: spec.keyDepth ?? (spec.bore ? standardKey(spec.bore)?.t2 ?? 0 : 0) } });
}
/** The gear to be made (or changed) by the tool as it stands: its numbers, where it stands and how it is turned, and what each field of the box says while nothing is typed in it. A partner (`in_579`) is where the pointer says (a gear: the direction of it from the gear it meshes with; a gear on a rack: how far along the rack), or as typed. Null while there is none. */
function gearTarget(scene: Scene, t: Tool): GearTarget | null {
  const r = gearMade(scene, t);
  return r && r.ok ? r.value : null;
}
/** Why the gear the tool stands at makes none (what Enter or a click says), or null. */
/** Why a cam that is not made is not (`cams.ts`), for the message line. */
export function camProblemOf(t: Tool): string | null { const spec = camSpecOf(t); const shapes = spec ? camShapes(spec) : null; return shapes && !shapes.ok ? shapes.error : null; }
export function gearProblem(scene: Scene, t: Tool): string | null {
  const r = gearMade(scene, t);
  return r && !r.ok ? r.error : null;
}
/**
 * A gear that cannot be made, put right (`in_690`): the number typed that spoils it is taken back to the nearest value that makes a gear (too few teeth go up to the least that works, a fillet that is too large to the largest),
 * found by trying the numbers between it and what the box has without it. The field and the reason come back so the box can flash and say; null when nothing is wrong or no number typed is to blame.
 */
export function gearFix(scene: Scene, t: Tool): { tool: Tool; field: number; message: string } | null {
  const why = gearProblem(scene, t);
  if (!why) return null;
  const g = gearState(t);
  const fields = gearFields(g);
  const valid = (x: Tool) => { const r = gearMade(scene, x); return !!r && r.ok; };
  const text = (v: number) => String(Number(v.toFixed(4)));
  const order = fields.map((_, i) => i).filter((i) => (g.typed[i] ?? "") !== "").sort((a, b) => (a === g.field ? -1 : 0) - (b === g.field ? -1 : 0));
  for (const i of order) {
    const typedV = typedNumber(g.typed[i]!);
    if (typedV === null) continue;
    const cleared = gearTyped(t, i, "");
    if (!valid(cleared)) continue; // (this number is not alone to blame)
    const home = gearLive(scene, cleared)?.[i] ?? 0;
    const whole = ["teeth", "starts", "sun", "planet", "planets"].includes(fields[i]!.key);
    let [good, bad] = [whole ? Math.round(home) : home, typedV];
    if (whole) {
      bad = Math.round(bad);
      while (Math.abs(bad - good) > 1) { const mid = Math.round((good + bad) / 2); if (valid(gearTyped(t, i, String(mid)))) good = mid; else bad = mid; }
    } else {
      for (let k = 0; k < 28; k++) { const mid = (good + bad) / 2; if (valid(gearTyped(t, i, text(mid)))) good = mid; else bad = mid; }
    }
    if (!valid(gearTyped(t, i, text(good)))) continue;
    const fixed = gearTyped(t, i, text(good));
    return { tool: { ...fixed, gear: { ...gearState(fixed), field: i } }, field: i, message: `${why}: ${fields[i]!.label} ${g.typed[i]} is taken back to ${text(good)}` };
  }
  return null;
}
const guardMemo = new WeakMap<Scene, Map<string, ReturnType<typeof gearFix>>>();
/**
 * A gear that cannot be made while its numbers are being typed (`in_694`): the gear it would be with the number that spoils it taken back to the nearest value that works (what Enter would do), for the drawing to show in red
 * and for the box to mark the field and say why; null while the gear can be made. Worked out once for each set of numbers (the bisection is not done at every frame).
 */
export function gearGuard(scene: Scene, t: Tool): { field: number; why: string; tool: Tool } | null {
  if (t.kind !== "gear") return null;
  const key = JSON.stringify([t.gear?.typed, t.cursor, t.points, t.gear?.editing, t.gear?.field]);
  const memo = guardMemo.get(scene) ?? new Map<string, ReturnType<typeof gearFix>>();
  guardMemo.set(scene, memo);
  if (!memo.has(key)) memo.set(key, gearFix(scene, t));
  const fx = memo.get(key);
  return fx ? { field: fx.field, why: gearProblem(scene, t) ?? fx.message, tool: fx.tool } : null;
}
/**
 * A gear being sized next to a gear of the same kind that would mesh with it (`in_709`): its pitch circle (as the pointer sizes it) all but touches the pitch circle of a plain gear of the same plane, within a module. The gear to mesh with,
 * how many teeth the partner has to be at that distance (the module is the other's), and the direction from it; null while there is none, the module is typed, or the size is set already. A click then makes it the gear that meshes with it.
 */
export function meshSuggestion(scene: Scene, t: Tool): { src: GearRecord; teeth: number; where: number } | null {
  const g = t.gear;
  if (t.kind !== "gear" || !t.plane || !t.points.length || t.sized || !g || g.mesh || g.planetary || g.editing || g.internal || g.rack || g.worm || g.wheel || g.pulley || g.sprocket || g.cycloidal) return null;
  const fields = gearFields(g);
  if (g.typed[fields.findIndex((f) => f.key === "module")]) return null; // (a module that is typed is not the other gear's)
  const target = gearTarget(scene, t);
  const o = target ? gearOutline(target.spec) : null;
  const pl = scene.parts[t.plane];
  if (!o || !o.ok || !pl || pl.kind !== "plane") return null;
  const centre = t.points[0]!;
  let best: { src: GearRecord; teeth: number; where: number; off: number } | null = null;
  for (const rec of scene.gears ?? []) {
    const sp = rec.spec;
    if (rec.plane !== t.plane || sp.internal || sp.rack || sp.pulley || sp.sprocket || sp.cycloidal || sp.worm || sp.wheel || (sp.shift ?? 0) !== 0) continue;
    const oG = gearOutline(sp);
    if (!oG.ok) continue;
    const d = dist(centre, rec.at);
    if (d < 1e-6) continue;
    const m = (sp.module * 2 * oG.value.pitchRadius) / (sp.module * Math.round(sp.teeth)); // (the transverse module: a helical gear's pitch circles are bigger)
    const off = Math.abs(d - (oG.value.pitchRadius + o.value.pitchRadius));
    const teeth = Math.round((2 * (d - oG.value.pitchRadius)) / m);
    if (off > m || teeth < 6 || teeth > 500 || (best && off >= best.off)) continue;
    const [gx, gy] = localOf(pl, rec.at), [cx, cy] = localOf(pl, centre);
    best = { src: rec, teeth, where: Math.atan2(cy - gy, cx - gx), off };
  }
  return best ? { src: best.src, teeth: best.teeth, where: best.where } : null;
}
/** The tool a click turns the gear being sized into when it has a gear to mesh with: the Mesh gear tool on that gear, with the tooth count and the direction, the size set. */
export function snapToMesh(sug: { src: GearRecord; teeth: number }, t: Tool): Tool {
  const m = meshGearTool(sug.src, false);
  return { ...m, cursor: t.points[0]!, sized: true, gear: { ...m.gear!, typed: m.gear!.typed.map((x, i) => (i === 0 ? String(sug.teeth) : x)) } };
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

/** A circle of `r` about `c` across the normal `n`, as short lines in `out` (the wire frame of a wheel). */
function ringAbout(out: [Vec3, Vec3][], pl: Plane, c: Vec3, r: number, to = 48): void {
  let prev: Vec3 | null = null;
  for (let k = 0; k <= to; k++) {
    const a = (2 * Math.PI * k) / to;
    const p: Vec3 = [c[0] + r * (pl.u[0] * Math.cos(a) + pl.v[0] * Math.sin(a)), c[1] + r * (pl.u[1] * Math.cos(a) + pl.v[1] * Math.sin(a)), c[2] + r * (pl.u[2] * Math.cos(a) + pl.v[2] * Math.sin(a))];
    if (prev) out.push([prev, p]);
    prev = p;
  }
}
/** What to draw while a figure is being made (the view draws it; it is not part of the scene). */
export interface Preview {
  segments: [Vec3, Vec3][];
  /** dashed lines from the cursor to what it lines up with (not part of the figure, `in_381`) */
  guides?: [Vec3, Vec3][];
  circle: { center: Vec3; radius: number; normal: Vec3 } | null;
  /** a gear whose number was just put right (`in_690`): drawn red for a moment */
  red?: true;
  /** a gear being sized that would mesh with the one beside it, drawn as that meshed gear (`in_770`) */
  orange?: true;
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
    const sug = meshSuggestion(scene, t); // (a gear that would mesh: it is drawn as that gear, in orange, with a dashed line to the one it meshes with, `in_770`)
    const meshed = sug ? gearTarget(scene, snapToMesh(sug, t)) : null;
    let target = meshed ?? gearTarget(scene, t);
    let red = !!t.gear?.bad;
    if (!target) { const guard = gearGuard(scene, t); target = guard ? gearTarget(scene, guard.tool) : null; red = red || !!target; } // (numbers that make no gear: the nearest that does, in red, `in_694`)
    const o = target ? gearOutline(target.spec) : null;
    if (!target || !o || !o.ok) return null;
    if (target.planetary) { // a planetary set: the outline of every gear, and the carrier's plate and pins
      const lay = layoutOf(target.planetary.spec, pl, target.at, target.turn);
      if (!lay.ok) return null;
      const segments = [lay.value.sun, ...lay.value.planets, lay.value.ring].flatMap((x) => outlineSegments(pl, x.spec, x.at, x.turn));
      if (lay.value.carrier) { segments.push(...circleSegments(pl, target.at, lay.value.carrier.radius)); for (const p of lay.value.carrier.pins) segments.push(...circleSegments(pl, p.at, p.diameter / 2, 16)); }
      if (lay.value.housing) segments.push(...circleSegments(pl, target.at, lay.value.housing.inner), ...circleSegments(pl, target.at, lay.value.housing.outer));
      return { segments, circle: null, cursor: t.cursor, ...(red ? { red: true as const } : {}) };
    }
    const [cx, cy] = localOf(pl, target.at);
    const [ct, st] = [Math.cos(target.turn), Math.sin(target.turn)];
    const at = (q: readonly [number, number]): Vec3 => liftOf(pl, [cx + q[0] * ct - q[1] * st, cy + q[0] * st + q[1] * ct]);
    const segments: [Vec3, Vec3][] = [];
    const ring = (x: number, r: number, h = 0, to = 36): void => { // (a circle about the axis along X at x, or about the plane's normal at height h: points of the plane and its normal)
      let prev: Vec3 | null = null;
      for (let k = 0; k <= to; k++) {
        const a = (2 * Math.PI * k) / to;
        const q = at([x, r * Math.cos(a)]);
        const p: Vec3 = [q[0] + n[0] * r * Math.sin(a), q[1] + n[1] * r * Math.sin(a), q[2] + n[2] * r * Math.sin(a)];
        if (prev) segments.push([prev, p]);
        prev = p;
      }
    };
    if (target.spec.worm) { // a worm (`in_608`, `in_693`): its wire frame in 3D: the tooth profile along the axis the way a rack's is (the thread cut through the axis, on both sides) and the circles of the thread's tips and root at its ends
      const g = wormOf(target.spec);
      const L = target.spec.worm.length / 2;
      if (g.ok) {
        const { rRoot, rTip, px, lead, half } = g.value;
        const lay = wormLayout(g.value, target.spec.worm);
        const reach = lay.sweep + (g.value.starts - 1) * px; // (the first thread's teeth, a start's apart)
        for (const side of [1, -1]) { // (the section: a thread on one side is half a lead along from the other; the thread starts and stops where the worm's does, or runs the whole length when it has no journals)
          const x0 = lay.a0 + (side === 1 ? 0 : lead / 2);
          let prev: [number, number] = [-L, rRoot * side];
          const to = (x: number, r: number) => { const q: [number, number] = [Math.max(-L, Math.min(L, x)), r * side]; if (Math.abs(q[0] - prev[0]) > 1e-9 || Math.abs(q[1] - prev[1]) > 1e-9) segments.push([at(prev), at(q)]); prev = q; };
          for (let k = -Math.ceil(lead / px) - 1; x0 + k * px < L + px; k++) {
            const c = x0 + k * px;
            if (c - x0 < -(lay.flush ? 1e9 : 1e-6) || c - x0 > reach - (side === 1 ? 0 : lead / 2) + (lay.flush ? 1e9 : 1e-6)) continue;
            const full = (xc: number) => { // (the thread's height at a place: it runs out into the shaft over the run-out at each end)
              if (lay.runout <= 0 || lay.flush) return 1;
              const [xs, xe] = [lay.a0, lay.a0 + reach];
              return Math.max(0, Math.min(1, (xc - xs + half(rRoot - 0.5 * g.value.module)) / lay.runout, (xe - xc + half(rRoot - 0.5 * g.value.module)) / lay.runout));
            };
            const h = Math.max(0.05, full(c)), top = rRoot + (rTip - rRoot) * h;
            to(c - half(rRoot), rRoot); to(c - half(top), top); to(c + half(top), top); to(c + half(rRoot), rRoot);
          }
          to(L, rRoot);
        }
        for (const x of [-L, L]) { ring(x, rRoot); ring(x, rTip); }
      } else for (const r of [o.value.rootRadius, -o.value.rootRadius, o.value.tipRadius, -o.value.tipRadius]) segments.push([at([-L, r]), at([L, r])]);
      const b = (target.spec.bore ?? 0) / 2;
      if (b > 0) for (const x of [-L, L]) ring(x, b, 0, 24);
      return { segments, circle: null, cursor: t.cursor, ...(red ? { red: true as const } : {}) };
    }
    if (target.spec.wheel) { // a worm wheel (`in_693`): its wire frame: the circles of its tip surface (an arc about the worm's axis, so smaller at the faces than in the middle), its root and its bore, at the middle and at each face
      const g = wheelOf(target.spec);
      if (g.ok) {
        const hw = g.value.width / 2;
        for (const h of [-hw, 0, hw]) { const c = [target.at[0] + n[0] * h, target.at[1] + n[1] * h, target.at[2] + n[2] * h] as Vec3; ringAbout(segments, pl, c, g.value.tipAt(h)); ringAbout(segments, pl, c, g.value.rootAt(h)); }
        const b = (target.spec.bore ?? 0) / 2;
        if (b > 0) for (const h of [-hw, hw]) ringAbout(segments, pl, [target.at[0] + n[0] * h, target.at[1] + n[1] * h, target.at[2] + n[2] * h], b);
        return { segments, circle: null, cursor: t.cursor, ...(red ? { red: true as const } : {}) };
      }
      return { segments, circle: { center: target.at, radius: o.value.pitchRadius, normal: n }, cursor: t.cursor };
    }
    if (target.spec.bevel) { // a straight bevel gear (`in_735`, `in_776`): the outline of its heel and of its toe on the back cones (the true ends of the teeth, not a section across the axis) and a line from every tooth to it, in the gear's own frame (a partner stands across its mate's, `in_755`)
      const bg = bevelOf(target.spec), raw = bevelRaw(target.spec);
      if (bg.ok && raw.ok) {
        const f = bevelFrame(pl.u, pl.v, target.spec, target.turn);
        const { k, big } = bg.value;
        const place = (q: { x: number; r: number; th: number }, sc: number): Vec3 => { const h = big - sc * q.x, rr = sc * q.r, [cx2, sy2] = [rr * Math.cos(q.th), rr * Math.sin(q.th)]; return [target.at[0] + f.X[0] * cx2 + f.Y[0] * sy2 + f.n[0] * h, target.at[1] + f.X[1] * cx2 + f.Y[1] * sy2 + f.n[1] * h, target.at[2] + f.X[2] * cx2 + f.Y[2] * sy2 + f.n[2] * h]; };
        const pts = raw.value;
        pts.forEach((p0, i) => { const p1 = pts[(i + 1) % pts.length]!; segments.push([place(p0, 1), place(p1, 1)], [place(p0, k), place(p1, k)]); });
        const per = Math.max(1, Math.round(pts.length / Math.max(1, Math.round(target.spec.teeth))));
        for (let i = 0; i < pts.length; i += per) segments.push([place(pts[i]!, 1), place(pts[i]!, k)]);
        const b0 = (target.spec.bore ?? 0) / 2;
        const hubs = bevelLayout(target.spec);
        if (b0 > 0 && hubs.ok) for (const h of [hubs.value.heel.h, hubs.value.toe.h]) { let prev: Vec3 | null = null; for (let j = 0; j <= 24; j++) { const a2 = (2 * Math.PI * j) / 24; const q: Vec3 = [target.at[0] + f.X[0] * b0 * Math.cos(a2) + f.Y[0] * b0 * Math.sin(a2) + f.n[0] * h, target.at[1] + f.X[1] * b0 * Math.cos(a2) + f.Y[1] * b0 * Math.sin(a2) + f.n[1] * h, target.at[2] + f.X[2] * b0 * Math.cos(a2) + f.Y[2] * b0 * Math.sin(a2) + f.n[2] * h]; if (prev) segments.push([prev, q]); prev = q; } }
      }
      return { segments, circle: null, cursor: t.cursor, ...(red ? { red: true as const } : {}) };
    }
    o.value.points.forEach((a, i) => { // (each side as two short lines through its middle: close enough to see the teeth)
      const b = o.value.points[(i + 1) % o.value.points.length]!;
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const k = o.value.bulges[i]!;
      const m: [number, number] = [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k];
      segments.push([at(a), at(m)], [at(m), at(b)]);
    });
    const shear = helixShear(target.spec) ?? 0; // (a helical rack is slid along its length through the thickness, not turned, `in_783`)
    const twist = helixTwist(target.spec) ?? ((target.spec.width ?? 0) > 0 ? 0 : null); // (a helix turns the outline along its thickness, a thickness alone carries it straight)
    if (twist !== null) { // a helical gear (`in_598`): the outline again at the far end, turned by the twist, and one edge of each tooth carried between the two, as a screw motion (worked out here, the kernel is not asked)
      const turned = (q: readonly [number, number], f: number): Vec3 => { const a = (twist * Math.PI) / 180 * f; const [c, s] = [Math.cos(a), Math.sin(a)]; const p = at([q[0] * c - q[1] * s + shear * target.spec.width! * f, q[0] * s + q[1] * c]); return [p[0] + n[0] * target.spec.width! * f, p[1] + n[1] * target.spec.width! * f, p[2] + n[2] * target.spec.width! * f]; };
      const pts = o.value.points;
      const per = pts.length / Math.max(1, Math.round(target.spec.teeth));
      pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]!; segments.push([turned(a, 1), turned(b, 1)]); });
      for (let i = 0; i < pts.length; i += Math.max(1, Math.round(per))) for (let k = 0; k < 4; k++) segments.push([turned(pts[i]!, k / 4), turned(pts[i]!, (k + 1) / 4)]);
    }
    const bore = target.spec.bore ?? 0; // (a ring's wall, or a gear's bore, as the one circle of the preview)
    const shaped = o.value.outerRadius === undefined && !boreProblem(target.spec, 0) ? boreLoop(target.spec) : null; // (a bore with a flat or a keyway: its own outline, drawn as the sides of the tooth outline are, `in_689`)
    if (shaped) shaped.points.forEach((a, i) => {
      const b = shaped.points[(i + 1) % shaped.points.length]!;
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const k = shaped.bulges[i]!;
      const steps = k ? 24 : 1;
      let prev = at(a);
      for (let j = 1; j <= steps; j++) { // (an arc side: the middle of its chord pushed out by the bulge, then bent about it: a quadratic is close enough to see)
        const u = j / steps, w = 4 * u * (1 - u) * k;
        const q = at([a[0] + dx * u - dy * w, a[1] + dy * u + dx * w]);
        segments.push([prev, q]); prev = q;
      }
    });
    return { segments, circle: shaped ? null : o.value.outerRadius !== undefined ? { center: target.at, radius: o.value.outerRadius, normal: n } : bore > 0 ? { center: target.at, radius: bore / 2, normal: n } : null, cursor: t.cursor, ...(red ? { red: true as const } : meshed ? { orange: true as const } : {}), ...(sug ? { guides: [[t.points[0]!, sug.src.at] as [Vec3, Vec3]] } : {}) };
  }
  if (t.kind === "arc") {
    const arc = t.points.length >= 2 ? arcOf(pl, t) : null;
    if (arc) { const pts = arcPoints(arc.a, arc.mid, arc.b); return { segments: pts.slice(1).map((p, i): [Vec3, Vec3] => [pts[i]!, p]), circle: null, cursor: t.cursor }; }
    const [a, b] = [t.points[0]!, t.points[1] ?? t.cursor];
    return { segments: b ? [[a, b]] : [], circle: null, cursor: t.cursor };
  }
  if (t.kind === "cam") { // a cam (`dec_spline_and_cams`): what it is made of, in the plane, round the shaft the first click placed
    const spec = camSpecOf(t);
    const shapes = spec ? camShapesQuick(spec) : null; // (the picture is the quick one: a number typed does not wait for the locking disc's notch)
    if (!spec || !shapes || !shapes.ok) return { segments: [], circle: t.cursor && t.points[0] ? { center: t.points[0], radius: dist(t.points[0], t.cursor), normal: n } : null, cursor: t.cursor };
    const [ox, oy] = localOf(pl, t.points[0]!);
    const [ct, st] = [Math.cos(((spec.turn ?? 0) * Math.PI) / 180), Math.sin(((spec.turn ?? 0) * Math.PI) / 180)];
    const at = (q: readonly [number, number]): Vec3 => liftOf(pl, [ox + q[0] * ct - q[1] * st, oy + q[0] * st + q[1] * ct]);
    const segments: [Vec3, Vec3][] = [];
    const line = (pts: Vec3[]) => pts.slice(1).forEach((p, i) => segments.push([pts[i]!, p]));
    for (const c of shapes.value.circles) line(Array.from({ length: 49 }, (_, i) => at([c.c[0] + c.r * Math.cos((i / 48) * 2 * Math.PI), c.c[1] + c.r * Math.sin((i / 48) * 2 * Math.PI)])));
    if (shapes.value.spiral) { const sp = splinePoints(shapes.value.spiral.map(at)); line([...sp, sp[0]!]); }
    for (const poly of shapes.value.polys ?? []) poly.points.forEach((a, i) => { // a ratchet: its sides, the arc of the pawl's boss through its middle
      const b = poly.points[(i + 1) % poly.points.length]!;
      const k = poly.bulges[i] ?? 0;
      const [pa, pb] = [at(a), at(b)];
      if (!k) { segments.push([pa, pb]); return; }
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const mid = at([(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k]);
      line(arcPoints(pa, mid, pb));
    });
    if (shapes.value.closed) { const ring = shapes.value.closed.map(at); const n = ring.length; line(splinePoints([...ring, ring[0]!], 8, { before: ring[n - 1]!, after: ring[1]! })); }
    return { segments, circle: null, cursor: t.cursor };
  }
  if (t.kind === "spline") { // a spline: the curve through the points placed and the pointer (`dec_spline_and_cams`); its points are the corners to hold it by
    const through = distinctPoints(t.cursor ? [...t.points, t.cursor] : t.points);
    const pts = through.length >= 3 ? splinePoints(through) : through;
    return { segments: pts.slice(1).map((p, i): [Vec3, Vec3] => [pts[i]!, p]), circle: null, cursor: t.cursor };
  }
  const pts = [...t.points];
  const nx = lineNext(t);
  if (nx) pts.push(nx);
  return { segments: pts.slice(1).map((p, i): [Vec3, Vec3] => [pts[i]!, p]), circle: null, cursor: t.cursor };
}

/** A circle about `c` as short lines, in the plane `pl`. */
function circleSegments(pl: Plane, c: Vec3, r: number, to = 48): [Vec3, Vec3][] {
  const [cx, cy] = localOf(pl, c);
  const pts = Array.from({ length: to + 1 }, (_, k) => liftOf(pl, [cx + r * Math.cos((2 * Math.PI * k) / to), cy + r * Math.sin((2 * Math.PI * k) / to)]));
  return pts.slice(1).map((p, i): [Vec3, Vec3] => [pts[i]!, p]);
}
/** The outline of a gear at `at`, turned by `turn`, as short lines in the plane `pl` (an arc side is bent through its middle), with its wall or its bore as a circle. */
function outlineSegments(pl: Plane, spec: GearSpec, at: Vec3, turn: number): [Vec3, Vec3][] {
  const o = gearOutline(spec);
  if (!o.ok) return [];
  const [cx, cy] = localOf(pl, at);
  const [ct, st] = [Math.cos(turn), Math.sin(turn)];
  const P = (q: readonly [number, number]): Vec3 => liftOf(pl, [cx + q[0] * ct - q[1] * st, cy + q[0] * st + q[1] * ct]);
  const out: [Vec3, Vec3][] = [];
  const pts = o.value.points;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    const k = o.value.bulges[i]!;
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const steps = k ? 4 : 1;
    let prev = P(a);
    for (let j = 1; j <= steps; j++) { const u = j / steps, w = 4 * u * (1 - u) * k; const q = P([a[0] + dx * u - dy * w, a[1] + dy * u + dx * w]); out.push([prev, q]); prev = q; }
  });
  if (o.value.outerRadius !== undefined) out.push(...circleSegments(pl, at, o.value.outerRadius));
  else if ((spec.bore ?? 0) > 0) out.push(...circleSegments(pl, at, spec.bore! / 2, 24));
  return out;
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
  if (t.kind === "gear" && t.gear?.planetary) { // a planetary set (`dec_planetary_gears`): made, or its numbers changed, as one command; its bodies are made with it, nothing is left selected
    const target = gearTarget(scene, t);
    if (!target?.planetary) return null;
    const id = t.gear.editing ?? nextId(scene, "q");
    return { command: t.gear.editing ? { type: "setPlanetary", id, spec: target.planetary.spec } : { type: "planetary", id, plane: pl.ref, at: target.at, spec: target.planetary.spec, ...(target.turn ? { turn: target.turn } : {}) }, select: [] };
  }
  if (t.kind === "gear") {
    const target = gearTarget(scene, t);
    if (!target || !gearOutline(target.spec).ok) return null;
    const id = t.gear?.editing ?? nextId(scene, "g");
    const made = hasBody(target.spec) || target.spec.worm || target.spec.wheel; // (hasBody: a bevel gear too) // (a helical gear, a worm and a wheel are made into their bodies at once, like an extrusion: nothing is left selected)
    const refs = made ? null : gearRefs({ id, plane: pl.ref, at: target.at, spec: target.spec });
    const select = refs ? [refs.wall ? diskFaceRef(refs.wall) : loopFaceRef(refs.lines)] : [];
    return { command: t.gear?.editing ? { type: "setGear", id, spec: target.spec } : { type: "gear", id, plane: pl.ref, at: target.at, spec: target.spec, ...(target.turn ? { turn: target.turn } : {}) }, select };
  }
  if (t.kind === "arc") {
    const arc = arcOf(pl, t);
    if (!arc) return null;
    const d = drawArc(scene, pl.ref, arc.a, arc.mid, arc.b, normalOfPlane(pl));
    return d ? { command: joinedAtCorners(scene, pl.ref, d.command), select: [d.line] } : null;
  }
  if (t.kind === "cam") {
    const full = camSpecOf(t);
    if (!full) return null;
    const { turn: degrees, ...cam } = full; // (the turn is the record's, in radians, as a gear's)
    const id = t.cam?.editing ?? nextId(scene, "g");
    const old = t.cam?.editing ? scene.gears?.find((g) => g.id === id) : undefined;
    const turn = cam.kind === "ratchet" || cam.kind === "linear" || !old ? ((degrees ?? 0) * Math.PI) / 180 : old.turn ?? 0; // (only the ratchet has an Angle field: the other cams keep the turn they have, as a move or a turn of them left it)
    const rec = { id, plane: pl.ref, at: t.points[0]!, spec: { teeth: 1, module: 1, cam }, ...(turn ? { turn } : {}) };
    if (!camShapes(cam).ok) return null;
    const face = camFace(rec);
    return { command: t.cam?.editing ? { type: "setGear", id, spec: rec.spec, turn } : { type: "gear", id, plane: pl.ref, at: rec.at, spec: rec.spec, ...(turn ? { turn } : {}) }, select: face ? [face] : [] };
  }
  if (t.kind === "spline") {
    const through = distinctPoints(t.points);
    if (t.points.length > 3 && dist(t.points[0]!, t.points[t.points.length - 1]!) < 1e-6) { // the last point is the first again: a closed curve (`dec_spline_and_cams`)
      const closed = drawClosedSpline(scene, pl.ref, through, normalOfPlane(pl));
      return closed.ok ? { command: joinedAtCorners(scene, pl.ref, closed.value.command), select: closed.value.select } : null;
    }
    if (through.length < 3 || dist(through[0]!, through[through.length - 1]!) < 1e-6) return null; // (two points are a line)
    const d = drawSpline(scene, pl.ref, through, normalOfPlane(pl));
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

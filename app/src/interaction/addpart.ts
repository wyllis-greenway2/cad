// Add part (`dec_parts_interface`, `dec_parts_fastener_pilot`): a dialog with the families, a size and (for a screw) a length, and the steps that make the part at the origin. The tables and the drawing are in `operation/fasteners.ts`;
// this file asks, checks and runs them.
import type { Session } from "./session.ts";
import { run, scene, selection } from "./session.ts";
import type { Dialog } from "./transfer.ts";
import type { Scene } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import { apply } from "../operation/commands.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { typedLength } from "../shared/units.ts";
import type { Vec3 } from "../math/vec.ts";
import { dot } from "../math/vec.ts";
import type { Part } from "../operation/part.ts";
import { normalOfPlane, pointOf, roundOf } from "../operation/part.ts";
import type { Ref } from "../shared/ref.ts";
import type { Path, Pt } from "../operation/pathrepeat.ts";
import { lengthOf, pointAt, pathOf } from "../operation/pathrepeat.ts";
import { rowsFromEdges, rowsAlongLine } from "./holerows.ts";
import type { RowSurface, RowsMade } from "./holerows.ts";
import { readFaceOutline, readLinesPath, planeBasis } from "../operation/pathmaps.ts";
import { pathRuleFields, pathRepeatNumbers, pathRepeatStart } from "./pathrepeat.ts";
import type { PathRepeatValues } from "./pathrepeat.ts";
import { faceEdges } from "./offsetbody.ts";
import { partDrawing, receiverDrawing } from "./partdrawing.ts";
import { FASTENER_FAMILIES, FASTENER_SIZES, FASTENER_SOURCES, CLEARANCE_FIT_LIST as CLEARANCE_FITS, RECEIVER_KINDS, isFastenerSize, receiversText, makeNut, makeCountersunk, makeWasher, farNutSteps, makeSocketHead, lengthAdvice, STANDARD_LENGTHS, countersunkDims, socketHeadDims, clearanceHole, tapHole, chartEngagement, nutTrap, receiverProblem, receiverSteps, screwFor, seatDepth, longestStandard, screwInPlace, nutInPlace, farNutInPlace } from "../operation/fasteners.ts";
import type { FastenerFamily, FastenerSize, PartSteps, ReceiverKind, ClearanceFit, FaceSpot } from "../operation/fasteners.ts";

export interface AddPartValues { family: string; size: string; length: string; /** a socket head screw's head: "knurled" (the default) or "smooth" */ head?: string }
/** The family's name in the words of a message: "hex nut", "flat washer". */
export const familyName = (id: string): string => (FASTENER_FAMILIES.find((f) => f.id === id)?.label ?? "part").toLowerCase();
export const addPartStart = (): AddPartValues => ({ family: "nut", size: "M3", length: "10", head: "knurled" });
const familyOf = (s: string): FastenerFamily => (s === "countersunk" || s === "socketHead" || s === "washer" ? s : "nut");

export function addPartDialog(v: AddPartValues): Dialog {
  const family = familyOf(v.family);
  const size = isFastenerSize(v.size) ? v.size : "M3";
  return {
    title: "Add part",
    ok: "Add",
    fields: [
      { id: "family", label: "Family", type: "choice", layout: "cards", value: family, choices: FASTENER_FAMILIES.map((f) => ({ value: f.id, label: `${f.label} · ${f.standard.replace(/ \(.*$/, "")}`, image: partDrawing(f.id, size, drawnLength(f.id, size, v.length), v.head === "smooth", 96, 64) })), note: `numbers from: ${FASTENER_SOURCES[family]}; placed at the origin, drawn at its nominal size` },
      { id: "size", label: "Size (coarse thread)", type: "choice", layout: "chips", value: size, choices: FASTENER_SIZES.map((s) => ({ value: s, label: s })), note: `matches: ${receiversText(size, family)}` },
      { id: "picture", label: "Drawn at its size", type: "picture", value: partDrawing(family, size, drawnLength(family, size, v.length), v.head === "smooth", 200, 120) },
      ...(family === "countersunk" || family === "socketHead" ? [{ id: "length", label: family === "socketHead" ? "Length under the head (mm)" : "Length from the top of the head (mm)", type: "text" as const, value: v.length, note: lengthNote(family, size, v.length) }] : []),
      ...(family === "socketHead" ? [{ id: "head", label: "Head", type: "choice" as const, layout: "chips" as const, value: v.head === "smooth" ? "smooth" : "knurled", choices: [{ value: "knurled", label: `knurled, largest ${socketHeadDims(size).head.max} mm across` }, { value: "smooth", label: `smooth, largest ${socketHeadDims(size).head.smooth} mm across` }], note: "both are in ISO 4762; the counterbore is cut for the wider (knurled) head" }] : []),
    ],
  };
}

/** The length a picture is drawn at: the one typed when it can be made, else a short usual one (the drawing is of the size, so it never fails for a half-typed number). */
function drawnLength(family: FastenerFamily, size: FastenerSize, text: string): number {
  const n = typedLength(text);
  const ok = n !== null && (family === "socketHead" ? n > 0.5 : family === "countersunk" ? n > countersunkDims(size).headHeight + 0.5 : false);
  return ok ? n! : family === "countersunk" ? countersunkDims(size).headHeight + 8 : 10;
}
/** The line under the length: what ISO 888 says of the number typed, the standard lengths, and what the part is made at. A length that is not a standard one is advised, never refused. */
function lengthNote(family: FastenerFamily, size: FastenerSize, text: string): string {
  const n = typedLength(text);
  const own = family === "socketHead" ? "counted under the head, any length over 0.5 mm is made" : `counted from the top of the head, any length over ${Math.round((countersunkDims(size).headHeight + 0.5) * 1000) / 1000} mm is made`;
  const standard = `standard lengths (ISO 888): ${STANDARD_LENGTHS.filter((l) => l <= 100).join(", ")} mm and longer`;
  return `${n === null ? "" : lengthAdvice(n) + ". "}${standard[0]!.toUpperCase()}${standard.slice(1)}. ${own[0]!.toUpperCase()}${own.slice(1)}; the lengths each size is made in were not read. The part is made at ${family === "socketHead" ? "the largest body size" : "nominal size"}`;
}
/** The advice on the length of the answers, for the message after the part is added ("" for a part with no length or a standard length). */
export function lengthAdviceOf(v: AddPartValues): string {
  const family = familyOf(v.family);
  if (family !== "socketHead" && family !== "countersunk") return "";
  const n = typedLength(v.length);
  return n !== null && !STANDARD_LENGTHS.includes(n) ? lengthAdvice(n) : "";
}

/** The steps for the answers, or why not. */
export function addPartSteps(v: AddPartValues): Result<PartSteps> {
  if (!isFastenerSize(v.size)) return err(`${v.size} is not a size this family has`);
  const family = familyOf(v.family);
  if (family === "nut") return makeNut(v.size);
  if (family === "washer") return makeWasher(v.size);
  const length = typedLength(v.length);
  if (length === null) return err("type the length as a number");
  return family === "socketHead" ? makeSocketHead(v.size, length, v.head === "smooth") : makeCountersunk(v.size, length);
}

/**
 * The steps as ONE command: each is made from the scene the ones before leave (their ids come from its counter), found here by applying them without the kernel, so the kernel is asked once and the part is one step to undo. (The
 * kernel answers after the page has drawn, and a step made while it is still answering is refused, `in_142`: the steps could not be run one after another.)
 */
function oneCommand(sc: Scene, steps: PartSteps): Result<Command> {
  const commands: Command[] = [];
  let at = sc;
  for (const make of steps) {
    const c = make(at);
    const next = apply(at, c);
    if (!next.ok) return next;
    commands.push(c);
    at = next.value;
  }
  return ok({ type: "batch", commands });
}
/** Make the part in the session, in one step. */
export function addPart(session: Session, v: AddPartValues): Result<Session> {
  const steps = addPartSteps(v);
  if (!steps.ok) return steps;
  const c = oneCommand(scene(session), steps.value);
  if (!c.ok) return c;
  const s = run(session, c.value);
  return s.message ? err(s.message) : ok(s);
}

// ---- the receivers: the hole or pocket a fastener goes into, cut into the body whose face is selected ----
export interface ReceiverValues extends Partial<PathRepeatValues> { kind: string; size: string; fit: string; depth: string; dx: string; dy: string; /** where the holes go: "centre" (the middle of the face), "picked" (the corners and circles selected), "outline" (along the face's outline) or "lines" (along the lines selected), `in_845` */ place?: string; /** a hole to tap: the thread engagement in percent; empty is the chart's tap drill */ engagement?: string; /** a nut pocket on the far side of the body as well ("nut"), or none (`in_909`) */ far?: string; /** a drill then tap: how deep the clearance part goes, mm (empty: the tapped part is 1.5 diameters), `in_910` */ drill?: string; /** "screw": the hardware is put into the holes as bodies (the screw, and the nut of a pocket); "none" (the default), `in_910` */ insert?: string; /** the screw's length, mm; empty is the longest standard length that fits */ length?: string; /** which line a face gives the rows (`in_951`): "outline" (its edges stepped in, the default), "edge" (one edge stepped in) or "midline" (one edge stepped in to the middle of the face) */ rows?: string; /** how many rows, and how far apart (mm) */ rowCount?: string; rowGap?: string }
export const receiverStart = (): ReceiverValues => ({ kind: "clearance", size: "M3", fit: "medium", depth: "", dx: "0", dy: "0", engagement: "", ...pathRepeatStart(), value: "30", corners: "each", offset: "10", far: "none", drill: "", insert: "none", length: "", rows: "outline", rowCount: "1", rowGap: "8" });
const kindOf = (s: string): ReceiverKind => (RECEIVER_KINDS.find((k) => k.id === s)?.id ?? "clearance");
const fitOf = (s: string): ClearanceFit => (s === "fine" || s === "coarse" ? s : "medium");

/** A flat face of a body: a plane of the body that is not a round or curved face. */
const isFlatFace = (p: Part | undefined): p is Extract<Part, { kind: "plane" }> => !!p && p.kind === "plane" && p.origin === "body" && !p.rounded && !p.round && !p.curved && !!p.mesh?.length;
/** The place a selected part stands for: a corner is where it is; a circle (drawn, a round face of the body or a circular edge of it) is its centre. Null for anything else. */
function placeOf(sc: Scene, p: Part): Vec3 | null {
  const get = (r: Ref) => sc.parts[r];
  if (p.kind === "corner") return pointOf(get, p.ref);
  return roundOf(get, p.ref)?.center ?? null;
}
/**
 * The box of the body a face belongs to. A face's name does not say which body it is of (every face is `b/body/f@...` whatever the bodies are called, and several bodies may stand in the scene), so it is the smallest body whose box holds the face's own
 * box; with none, the box of all the bodies together (never a made-up large number: the holes' depth and the preview follow from it).
 */
function bodyBoxOf(sc: Scene, face: Extract<Part, { kind: "plane" }>): { min: Vec3; max: Vec3 } | undefined {
  const bodies = Object.values(sc.parts).filter((p): p is Extract<Part, { kind: "body" }> => p.kind === "body" && !!p.bbox);
  const m = face.mesh;
  if (m && m.length >= 3) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i + 2 < m.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, m[i + k]!); hi[k] = Math.max(hi[k]!, m[i + k]!); }
    const holds = bodies.filter((b) => [0, 1, 2].every((k) => lo[k]! >= b.bbox!.min[k]! - 1e-3 && hi[k]! <= b.bbox!.max[k]! + 1e-3));
    const vol = (b: Extract<Part, { kind: "body" }>): number => [0, 1, 2].reduce((a, k) => a * (b.bbox!.max[k]! - b.bbox!.min[k]!), 1);
    holds.sort((a, b) => vol(a) - vol(b));
    if (holds[0]) return holds[0].bbox;
  }
  if (!bodies.length) return undefined;
  return { min: [0, 1, 2].map((k) => Math.min(...bodies.map((b) => b.bbox!.min[k]!))) as unknown as Vec3, max: [0, 1, 2].map((k) => Math.max(...bodies.map((b) => b.bbox!.max[k]!))) as unknown as Vec3 };
}
/**
 * The flat face selected, as a plane with the point the hole is centred on (the middle of the face's box across it), how far the body reaches through, and the places picked: the face with, if wanted, corners and circles
 * selected too (a corner, the centre of a drawn circle, of a round face or of a circular edge of the body, `in_707`), each taken onto the face along its normal. Or why there is none.
 */
export function selectedFace(session: Session): Result<{ spot: FaceSpot; through: number; /** how far the body reaches along the inward normal of the face */ reach: number; points: Vec3[]; /** the lines selected with the face, a path for a row of holes (`in_845`) */ lines: Ref[]; face: Extract<Part, { kind: "plane" }> }> {
  const sc = scene(session);
  const sel = selection(session).map((r) => sc.parts[r]).filter((p): p is NonNullable<typeof p> => !!p);
  let faces = sel.filter(isFlatFace);
  if (!faces.length) { // a line drawn on a flat face of a body stands for that face (`in_882`: select a line, and the holes follow it)
    const own = sel.flatMap((p) => (p.kind === "line" && p.origin === "drawn" && p.plane ? [sc.parts[p.plane]] : []));
    const found = [...new Set(own.filter(isFlatFace))];
    if (found.length === 1) faces = found;
  }
  const face = faces.length === 1 ? faces[0]! : null;
  if (!face) return err(faces.length > 1 ? "select one flat face of a body (and, to place the hole, corners or circles)" : "select one flat face of a body first");
  const picked: Vec3[] = [];
  const lines: Ref[] = [];
  for (const p of sel) {
    if (p === face) continue;
    const at = placeOf(sc, p);
    if (at) picked.push(at);
    else if (p.kind === "line") lines.push(p.ref); // (a straight line or an arc that is not a circle: a path for a row of holes)
    else return err("with the face, select only corners, circles or lines to place the holes by");
  }
  const n = normalOfPlane(face);
  const onFace = (q: Vec3): Vec3 => { const h = dot([q[0] - face.at[0], q[1] - face.at[1], q[2] - face.at[2]], n); return [q[0] - n[0] * h, q[1] - n[1] * h, q[2] - n[2] * h]; };
  const points: Vec3[] = [];
  for (const q of picked.map(onFace)) if (!points.some((o) => Math.hypot(o[0] - q[0], o[1] - q[1], o[2] - q[2]) < 1e-6)) points.push(q); // (two parts at one place are one hole)
  let lo: [number, number] = [Infinity, Infinity], hi: [number, number] = [-Infinity, -Infinity];
  const mesh = face.mesh!;
  for (let i = 0; i + 2 < mesh.length; i += 3) {
    const d: Vec3 = [mesh[i]! - face.at[0], mesh[i + 1]! - face.at[1], mesh[i + 2]! - face.at[2]];
    const [x, y] = [dot(d, face.u), dot(d, face.v)];
    lo = [Math.min(lo[0], x), Math.min(lo[1], y)]; hi = [Math.max(hi[0], x), Math.max(hi[1], y)];
  }
  const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2;
  const centre: Vec3 = [face.at[0] + face.u[0] * cx + face.v[0] * cy, face.at[1] + face.u[1] * cx + face.v[1] * cy, face.at[2] + face.u[2] * cx + face.v[2] * cy];
  const box = bodyBoxOf(sc, face);
  const through = box ? Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) : 1000;
  const nIn = normalOfPlane(face);
  // how far the body goes from this face to its far side, along the way the hole goes: the face's place along the normal less the lowest corner of the body's box
  const along0 = nIn[0] * face.at[0] + nIn[1] * face.at[1] + nIn[2] * face.at[2];
  const lowest = box ? Math.min(...[box.min[0], box.max[0]].flatMap((x) => [box.min[1], box.max[1]].flatMap((y) => [box.min[2], box.max[2]].map((z) => nIn[0] * x + nIn[1] * y + nIn[2] * z)))) : along0 - through;
  const reach = Math.max(0, along0 - lowest);
  return ok({ spot: { plane: face.ref, centre, u: face.u, v: face.v }, through, reach, points, lines, face });
}
export const whyNoReceiver = (session: Session): string | null => { const f = selectedFace(session); return f.ok ? null : f.error; };

/** What the selection offers for placing the holes: how many places were picked, how many lines, and the face's outline and the lines as paths (or why they are not). */
export interface ReceiverContext { /** the surface is a round face (`in_929`) */ curved?: boolean; /** the edges of the face selected with it (`in_951`) */ edges: number; places: number; /** the lines drawn on a plane that are selected: a path of their own */ lines: number; outline: Result<Path> | null; linePath: Result<Path> | null }
export function receiverContext(session: Session): ReceiverContext | null {
  const sc = scene(session);
  const round = selectedRound(session);
  if (round) {
    if (!round.ok) return null;
    const own = new Set(faceEdges(sc, round.value.face));
    const drawn = round.value.lines.filter((x) => !own.has(x));
    const lp = drawn.length ? readLinesPath(sc, drawn, round.value.face) : null;
    return { curved: true, edges: round.value.lines.length - drawn.length, places: round.value.points.length, lines: drawn.length, outline: null, linePath: lp ? (lp.ok ? ok(lp.value.path) : lp) : null };
  }
  const f = selectedFace(session);
  if (!f.ok) return null;
  const outline = readFaceOutline(sc, f.value.face, faceEdges(sc, f.value.face));
  const own = new Set(faceEdges(sc, f.value.face));
  const drawn = f.value.lines.filter((x) => !own.has(x));
  const linePath = drawn.length ? readLinesPath(sc, drawn, f.value.face) : null;
  return { edges: f.value.lines.length - drawn.length, places: f.value.points.length, lines: drawn.length, outline, linePath: linePath ? (linePath.ok ? ok(linePath.value.path) : linePath) : null };
}
/** Where the dialog starts the holes: at the places picked, else along the lines selected, else in the middle of the face. */
export const receiverStartFor = (session: Session): ReceiverValues => { const c = receiverContext(session); return { ...receiverStart(), place: c && c.places ? "picked" : c && c.lines ? "lines" : "centre" }; };
const PLACES = ["centre", "picked", "outline", "edge", "midline", "lines"] as const;
type Where = (typeof PLACES)[number];
const whereOf = (v: ReceiverValues, ctx?: ReceiverContext | null): Where => {
  const w = (PLACES as readonly string[]).includes(v.place ?? "") ? (v.place as Where) : ctx?.places ? "picked" : "centre";
  return w === "picked" && ctx && !ctx.places ? "centre" : w === "lines" && ctx && !ctx.lines ? "centre" : w;
};

/** The receivers the helper bar offers: the id and a short name. */
export const receiverKinds = (): { id: string; label: string }[] => RECEIVER_KINDS.map((k) => ({ id: k.id, label: k.short }));
/** The sizes the helper bar offers. */
export const receiverSizes = (): string[] => [...FASTENER_SIZES];
export function receiverDialog(v: ReceiverValues, places = 0, ctx?: ReceiverContext | null): Dialog {
  const kind = kindOf(v.kind);
  const size = isFastenerSize(v.size) ? v.size : "M3";
  const fit = fitOf(v.fit);
  const family: FastenerFamily = kind === "countersunk" ? "countersunk" : kind === "counterbore" ? "socketHead" : "nut";
  const where = whereOf(v, ctx);
  const rules = pathRuleFields({ ...pathRepeatStart(), ...v } as PathRepeatValues, ctx ? (where === "lines" ? ctx.linePath : ctx.outline) : null, "hole");
  return {
    title: ctx && (where === "outline" || where === "lines") ? "Fastener holes along a path" : places > 1 ? `Fastener holes (${places})` : "Fastener hole",
    ok: "Cut",
    fields: [
      { id: "kind", label: "Receiver", type: "choice", layout: "cards", value: kind, choices: RECEIVER_KINDS.map((k) => ({ value: k.id, label: k.short, image: receiverDrawing(k.id, size, fit, 84, 72) })) },
      { id: "size", label: "Size (coarse thread)", type: "choice", layout: "chips", value: size, choices: FASTENER_SIZES.map((s) => ({ value: s, label: s })), note: `all the receivers: ${receiversText(size, family)}` },
      { id: "picture", label: "Cut across, at its size", type: "picture", value: receiverDrawing(kind, size, fit, 170, 140) },
      ...(kind === "tapped" ? [] : [{ id: "fit", label: "Clearance (ISO 273)", type: "choice" as const, layout: "chips" as const, value: fit, choices: CLEARANCE_FITS.map((f) => ({ value: f, label: `${f} (${clearanceHole(size, f)} mm)` })) }]),
      ...(kind === "tapped" ? [{ id: "engagement", label: "Thread engagement (%), empty is the chart's drill", type: "text" as const, value: v.engagement ?? "", note: engagementNote(size, v.engagement ?? "") }] : []),
      { id: "depth", label: "Depth (mm), empty goes right through", type: "text", value: v.depth, note: kind === "nutPocket" ? `the pocket is ${nutTrap(size).depth} mm deep, the hole goes on through` : "" },
      ...(ctx ? [{ id: "place", label: "Where the holes go", type: "choice" as const, layout: "chips" as const, value: where, choices: [
        { value: "centre", label: "In the middle of the face" },
        { value: "picked", label: places > 1 ? `At the ${places} places picked` : "At the place picked", ...(ctx.places ? {} : { disabled: "select corners or circles with the face" }) },
        { value: "outline", label: "Along the face's outline", ...(ctx.outline?.ok ? {} : { disabled: ctx.outline?.ok === false ? ctx.outline.error : "the face has no outline to follow" }) },
        { value: "lines", label: "Along the lines selected", ...(ctx.lines ? {} : { disabled: "select lines or arcs with the face" }) },
      ] }] : []),
      ...(ctx && (where === "outline" || where === "lines")
        ? [{ ...rules.picture, id: "pathpicture", label: where === "outline" ? "Holes along the outline" : "Holes along the lines" }, ...rules.fields]
        : [
          { id: "dx", label: places ? "Across the face from the place picked (mm)" : "Across the face from its middle (mm)", type: "text" as const, value: v.dx },
          { id: "dy", label: places ? "Up the face from the place picked (mm)" : "Up the face from its middle (mm)", type: "text" as const, value: v.dy, note: "the face's own two directions; the sizes are the standard's own, and the printer's offset is added when the part is made for printing" },
        ]),
    ],
  };
}

/** What the engagement typed gives: the hole it makes, or why it is not one. */
function engagementNote(size: FastenerSize, text: string): string {
  const e = engagementOf(text);
  if (e === null) return "type a number of percent, for example 75";
  const hole = tapHole(size, e);
  return `hole ${hole} mm${e === undefined ? ` (the chart's drill: ${round1(chartEngagement(size) * 100)}% of the ISO basic engaged height)` : ""}; less engagement is a bigger hole: easier to tap, a weaker thread; a percentage here is counted on the ISO basic profile`;
}
const round1 = (x: number): number => Math.round(x * 10) / 10;
/** The engagement typed as a fraction: undefined for empty (the chart's drill), null for something that is not a number. */
const engagementOf = (text: string): number | undefined | null => {
  if (text.trim() === "") return undefined;
  const n = Number(text.trim().replace("%", ""));
  return Number.isFinite(n) ? n / 100 : null;
};

/** How many places the selection names: the corners and circles picked, 0 when none (the hole goes in the middle of the face). */
export const placesPicked = (session: Session): number => { const f = selectedFace(session); return f.ok ? f.value.points.length : 0; };

/** Cut the receiver into the body whose flat face is selected: the steps, one after another from the scene each leaves. */
/** What the answers would cut: the receiver, the size and fit, how deep, the thread engagement, the face's spot (for its two ways and its normal) and the centre of each hole. The cut and the preview are both made from it. */
export interface ReceiverPlan { kind: ReceiverKind; size: FastenerSize; fit: ClearanceFit; depth: number; engagement: number | undefined; spot: FaceSpot; places: Vec3[]; /** a nut pocket is cut on the far side of the body too */ far: boolean; /** the spacing the holes stand at when they follow a path (the adjusted one, for a fit), else null */ spacing: number | null; /** the lines the holes follow, each as a polyline on the surface (none when they do not follow one) */ guide: Vec3[][]; /** how far the body reaches through, along the face's inward normal */ reach: number; /** how far everything in the way reaches from the face (the body and whatever is under it, `in_949`) */ stack: number; /** a drill then tap: how deep the clearance part goes */ drill: number | undefined; /** the spot of each place, with its own way in (the same on a flat face; each its own on a curved one, `in_929`) */ spots: FaceSpot[]; /** the surface is curved */ curved: boolean; /** the hardware put into the holes (`in_910`), or null */ insert: { screw: { family: "countersunk" | "socketHead"; length: number; seat: number } | null; nut: "near" | "far" | null } | null }
/**
 * How far everything in the way reaches from the face, along the way the holes go (`in_949`): from each place a ray goes into the model, and the farthest a body's box lets it go is how far the cut can matter (a lid on an object: the lid and the object under it). Never less than
 * the body of the face itself (`reach`). The boxes are the bodies' boxes, so a body whose box is in the way but whose shape is not is counted: the far end of the preview may be long.
 */
function stackReach(sc: Scene, spot: FaceSpot, places: readonly Vec3[], reach: number): number {
  const n = unit3(cross3v(spot.u, spot.v)); // (out of the body)
  const bodies = Object.values(sc.parts).filter((p): p is Extract<Part, { kind: "body" }> => p.kind === "body" && !!p.bbox);
  let far = reach;
  for (const c of places) for (const b of bodies) {
    let t0 = -Infinity, t1 = Infinity, hit = true;
    for (let k = 0; k < 3; k++) {
      const d = -n[k]!; // (into the model)
      const o = c[k]!;
      if (Math.abs(d) < 1e-9) { if (o < b.bbox!.min[k]! - 1e-6 || o > b.bbox!.max[k]! + 1e-6) hit = false; continue; }
      const [a, e] = [(b.bbox!.min[k]! - o) / d, (b.bbox!.max[k]! - o) / d];
      t0 = Math.max(t0, Math.min(a, e)); t1 = Math.min(t1, Math.max(a, e));
    }
    if (hit && t1 >= Math.max(t0, 0) && t1 > 1e-6) far = Math.max(far, t1);
  }
  return far;
}
/** What the answers say about the receiver itself, whatever the surface: the kind, the depth, the thread, the drilled part, the nut on the far side and the hardware put in. `through` is the depth of a hole right through, `reach` how far the hole can go (the room the screw has). */
interface Hardware { kind: ReceiverKind; depth: number; engagement: number | undefined; drill: number | undefined; far: boolean; insert: ReceiverPlan["insert"] }
function hardwareOf(v: ReceiverValues, through: number, reach: number, stack: number, curved: boolean): Result<Hardware> {
  if (!isFastenerSize(v.size)) return err(`${v.size} is not a size this family has`);
  const kind = kindOf(v.kind);
  const below = stack > reach + 1e-6; // (more body under the one the face is of: a lid on an object, `in_949`)
  const tapLen0 = Math.round(1.5 * Number(v.size.slice(1)) * 10) / 10;
  // empty depth: right through everything in the way; a hole drilled and tapped is blind, so it is the body's thickness and a pilot's length past it
  const depth = v.depth.trim() === "" ? (kindOf(v.kind) === "drillTap" && below ? Math.round((reach + tapLen0) * 100) / 100 : through) : typedLength(v.depth);
  if (depth === null) return err("type the depth and the distances as numbers");
  const engagement = engagementOf(v.engagement ?? "");
  if (engagement === null) return err("type the thread engagement as a number of percent");
  const tapLen = Math.round(1.5 * Number(v.size.slice(1)) * 10) / 10; // (a tapped part by default 1.5 diameters deep)
  const drillTyped = (v.drill ?? "").trim() === "" ? undefined : typedLength(v.drill!);
  if (drillTyped === null) return err("type the drilled depth as a number");
  const drill = kind === "drillTap" ? (drillTyped ?? (below ? Math.round(reach * 100) / 100 : Math.round((Math.min(depth, stack) - tapLen) * 10) / 10)) : undefined; // (clearance as deep as the body of the face, the tapped pilot past it)
  const bad = receiverProblem(kind, v.size, fitOf(v.fit), depth, engagement, drill);
  if (bad) return err(bad);
  const far = v.far === "nut";
  if (far && curved) return err("a nut on the other side is not made for a curved surface yet");
  if (far && (kind === "tapped" || kind === "nutPocket")) return err("a nut on the other side goes with a hole right through: choose a clearance, countersunk or counterbored hole");
  if (far && v.depth.trim() !== "") return err("a nut on the other side needs the hole to go right through: leave the depth empty");
  let insert: ReceiverPlan["insert"] = null;
  if (v.insert === "screw") {
    const family = screwFor(kind);
    let screw: NonNullable<ReceiverPlan["insert"]>["screw"] = null;
    if (family) {
      if (curved && v.depth.trim() === "") return err("type the depth: how far the hole goes is not known on a curved surface, so the screw cannot be fitted to it");
      const seat = seatDepth(kind, v.size);
      const room = Math.min(depth, stack) - seat;
      const typed = (v.length ?? "").trim() === "" ? undefined : typedLength(v.length!);
      if (typed === null) return err("type the screw length as a number");
      const length = typed ?? longestStandard(room);
      if (length === null || length === undefined) return err(`no standard ${v.size} screw is short enough for a hole ${Math.round(room * 10) / 10} mm deep`);
      if (length > room + 1e-9) return err(`a ${length} mm screw is longer than the ${Math.round(room * 10) / 10} mm the hole has`);
      screw = { family, length, seat };
    }
    insert = { screw, nut: kind === "nutPocket" ? "near" : far ? "far" : null };
  }
  return ok({ kind, depth, engagement, drill, far, insert });
}
export function receiverPlan(session: Session, v: ReceiverValues): Result<ReceiverPlan> {
  const round = selectedRound(session);
  if (round) return round.ok ? curvedPlan(session, v, round.value) : round;
  const face = selectedFace(session);
  if (!face.ok) return face;
  const [dx, dy] = [typedLength(v.dx.trim() === "" ? "0" : v.dx), typedLength(v.dy.trim() === "" ? "0" : v.dy)];
  if (dx === null || dy === null) return err("type the depth and the distances as numbers");
  const sp = face.value.spot;
  const sc = scene(session);
  const fv = face.value;
  const edgeRefs = new Set(faceEdges(sc, fv.face));
  const edgeSel = fv.lines.filter((x) => edgeRefs.has(x));
  const drawn = fv.lines.filter((x) => !edgeRefs.has(x));
  const where = whereOf(v, { places: fv.points.length, lines: drawn.length, edges: 0, outline: null, linePath: null });
  let spots: FaceSpot[];
  let guide: Vec3[][] = [];
  let spacing: number | null = null;
  let along = false;
  if (where === "outline" || where === "edge" || where === "midline" || where === "lines") {
    const rules = pathRepeatNumbers({ ...pathRepeatStart(), ...v } as PathRepeatValues);
    if (!rules.ok) return rules;
    const rn = rowNumbers(v);
    if (!rn.ok) return rn;
    const surf = flatSurface(sc, fv);
    let got: Result<RowsMade>;
    if (where === "lines") { // lines drawn on a plane: taken onto the face along its normal
      const l = readLinesPath(sc, drawn, fv.face);
      if (!l.ok) return l;
      const b = planeBasis(l.value.plane);
      const n = normalOfPlane(fv.face);
      const map = (q: Pt): Result<FaceSpot> => {
        const p: Vec3 = [b.at[0] + b.u[0] * q[0] + b.v[0] * q[1], b.at[1] + b.u[1] * q[0] + b.v[1] * q[1], b.at[2] + b.u[2] * q[0] + b.v[2] * q[1]];
        const h = dot([p[0] - fv.face.at[0], p[1] - fv.face.at[1], p[2] - fv.face.at[2]], n);
        return ok({ ...sp, centre: [p[0] - n[0] * h, p[1] - n[1] * h, p[2] - n[2] * h] });
      };
      got = rowsAlongLine(l.value.path, map, rules.value.rules, rn.value.count, rn.value.gap);
    } else {
      const edge = where !== "outline" && edgeSel.length && surf.outline.ok ? flatSideOf(sc, fv.face, edgeSel[0]!, surf.outline.value) : null;
      got = rowsFromEdges(surf, where, edge, rules.value.rules, rn.value.count, rn.value.gap);
    }
    if (!got.ok) return got;
    spots = got.value.places; guide = got.value.guide; spacing = got.value.spacing;
    along = true;
  } else spots = (where === "picked" ? fv.points : [sp.centre]).map((c): FaceSpot => ({ ...sp, centre: c })); // (the places picked, or the middle of the face)
  const [ox, oy] = along ? [0, 0] : [dx, dy]; // (the offsets are from each place; along a line the line's own offset is the way in)
  const places = spots.map((q): Vec3 => [q.centre[0] + sp.u[0] * ox + sp.v[0] * oy, q.centre[1] + sp.u[1] * ox + sp.v[1] * oy, q.centre[2] + sp.u[2] * ox + sp.v[2] * oy]);
  const stack = stackReach(scene(session), face.value.spot, places, face.value.reach);
  const hw = hardwareOf(v, face.value.through, face.value.reach, stack, false);
  if (!hw.ok) return hw;
  const { kind, depth, engagement, drill, far, insert } = hw.value;
  return ok({ kind, size: v.size as FastenerSize, fit: fitOf(v.fit), depth, engagement, spot: sp, places, far, spacing, guide, reach: face.value.reach, stack, drill, insert, spots: places.map((c, i) => ({ ...spots[i]!, centre: c })), curved: false });
}

/** How many rows and how far apart (`in_951`). */
function rowNumbers(v: ReceiverValues): Result<{ count: number; gap: number }> {
  const n = (v.rowCount ?? "1").trim() === "" ? 1 : Number(v.rowCount);
  const g = (v.rowGap ?? "8").trim() === "" ? 0 : typedLength(v.rowGap!);
  if (!Number.isInteger(n) || n < 1) return err("the number of rows must be a whole number, one or more");
  if (g === null || (n > 1 && !(g > 0))) return err("type the distance between the rows as a number above zero");
  return ok({ count: n, gap: g });
}
/** A flat face as a surface for the rows: its outline in the plane's own directions, and a place on the plane with the face's way in. */
function flatSurface(sc: Scene, f: { spot: FaceSpot; face: Extract<Part, { kind: "plane" }> }): RowSurface {
  const b = planeBasis(f.face);
  return {
    outline: readFaceOutline(sc, f.face, faceEdges(sc, f.face)),
    map: (q) => ok({ ...f.spot, centre: [b.at[0] + b.u[0] * q[0] + b.v[0] * q[1], b.at[1] + b.u[1] * q[0] + b.v[1] * q[1], b.at[2] + b.u[2] * q[0] + b.v[2] * q[1]] }),
  };
}
/** The side of the outline an edge of the face stands for (it keeps the way the outline runs, so the inside is on its left), else the edge as a line of its own. */
function flatSideOf(sc: Scene, face: Extract<Part, { kind: "plane" }>, ref: Ref, outline: Path): Path | null {
  const l = readLinesPath(sc, [ref], face);
  if (!l.ok || !l.value.path.segs[0]) return null;
  const e = l.value.path.segs[0];
  const same = (p: Pt, q: Pt): boolean => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-3;
  const hit = outline.segs.find((s) => (same(s.a, e.a) && same(s.b, e.b)) || (same(s.a, e.b) && same(s.b, e.a)));
  return { segs: [hit ?? e], closed: false };
}

// ---- a curved surface (`in_929`): a round face of a body, a line drawn across it, the holes going in along the surface's normal ----
/** The round face selected (a post's wall, a bore, a piece of one), with its axis, and the lines and places selected with it. Null when the selection holds no round face; or why the selection is not usable. */
interface Round { face: Extract<Part, { kind: "plane" }>; axis: Vec3; center: Vec3; radius: number; convex: boolean; range: [number, number]; /** the round face round the axis: from the way `e1` (a way out from the axis, through the middle of the face) turning toward `e2`, from `lo` to `hi` radians; `full`: the whole way round */ turn: { e1: Vec3; e2: Vec3; lo: number; hi: number; full: boolean }; through: number; points: Vec3[]; lines: Ref[] }
const isRoundFace = (p: Part | undefined): p is Extract<Part, { kind: "plane" }> => !!p && p.kind === "plane" && p.origin === "body" && !!p.mesh?.length && !!(p.curved || (p.round && p.radius));
function selectedRound(session: Session): Result<Round> | null {
  const sc = scene(session);
  const sel = selection(session).map((r) => sc.parts[r]).filter((p): p is NonNullable<typeof p> => !!p);
  const faces = sel.filter(isRoundFace);
  if (!faces.length || sel.some(isFlatFace) || sel.some((p) => p.kind === "line" && p.origin === "drawn" && !!p.plane && isFlatFace(sc.parts[p.plane]))) return null; // (a flat face selected, or a line drawn on one: it stands for that face and the round face is only a place to put a hole, as before)
  if (faces.length > 1) return err("select one round face of a body");
  const face = faces[0]!;
  const c = face.curved ?? { axis: face.round!.axis, dir: face.round!.dir, center: face.round!.center, radius: face.radius!, convex: face.round!.convex };
  const axis: Vec3 = unit3(c.dir ?? (c.axis === 0 ? [1, 0, 0] : c.axis === 1 ? [0, 1, 0] : [0, 0, 1]));
  const picked: Vec3[] = [];
  const lines: Ref[] = [];
  for (const p of sel) {
    if (p === face) continue;
    const at = placeOf(sc, p);
    if (at) picked.push(at);
    else if (p.kind === "line") lines.push(p.ref);
    else return err("with the round face, select only corners, circles or lines to place the holes by");
  }
  const mesh = face.mesh!;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i + 2 < mesh.length; i += 3) { const t = dot([mesh[i]! - c.center[0], mesh[i + 1]! - c.center[1], mesh[i + 2]! - c.center[2]], axis); lo = Math.min(lo, t); hi = Math.max(hi, t); }
  // which way round the axis the face goes: the way out from the axis through the middle of it, and how far each side turns from it
  const radial = (k: number): Vec3 => { const d: Vec3 = [mesh[k]! - c.center[0], mesh[k + 1]! - c.center[1], mesh[k + 2]! - c.center[2]]; const t = dot(d, axis); return unit3([d[0] - axis[0] * t, d[1] - axis[1] * t, d[2] - axis[2] * t]); };
  const sum = [0, 0, 0];
  let count = 0;
  for (let i = 0; i + 2 < mesh.length; i += 3) { const r = radial(i); sum[0]! += r[0]; sum[1]! += r[1]; sum[2]! += r[2]; count++; }
  const full = Math.hypot(...sum) / Math.max(1, count) < 0.05;
  const e1 = full ? unit3(Math.abs(axis[0]) < 0.9 ? cross3v(axis, [1, 0, 0]) : cross3v(axis, [0, 1, 0])) : unit3(sum);
  const e2 = cross3v(axis, e1);
  let tlo = 0, thi = 0;
  if (!full) for (let i = 0; i + 2 < mesh.length; i += 3) { const r = radial(i); const t = Math.atan2(dot(r, e2), dot(r, e1)); tlo = Math.min(tlo, t); thi = Math.max(thi, t); }
  const box = bodyBoxOf(sc, face);
  const through = box ? Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) : 1000;
  return ok({ face, axis, center: c.center, radius: c.radius, convex: c.convex, range: [lo, hi], through, points: picked, lines, turn: { e1, e2, lo: full ? 0 : tlo, hi: full ? 2 * Math.PI : thi, full } });
}
const unit3 = (a: readonly number[]): Vec3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l]; };
/** A point of the surface under `q` (taken straight out from the axis), and the spot there: the way out of the body (away from the axis for a post, toward it for a bore), and two ways across. Or why not. */
function spotOnRound(r: Round, q: Vec3): Result<FaceSpot> {
  const d: Vec3 = [q[0] - r.center[0], q[1] - r.center[1], q[2] - r.center[2]];
  const a = dot(d, r.axis);
  const rv: Vec3 = [d[0] - r.axis[0] * a, d[1] - r.axis[1] * a, d[2] - r.axis[2] * a];
  const l = Math.hypot(...rv);
  if (l < 1e-6) return err("a place is on the axis of the round face: it has no way in");
  if (a < r.range[0] - 1e-6 || a > r.range[1] + 1e-6) return err("a place is past the end of the round face");
  const n = unit3(rv);
  const surface: Vec3 = [r.center[0] + r.axis[0] * a + n[0] * r.radius, r.center[1] + r.axis[1] * a + n[1] * r.radius, r.center[2] + r.axis[2] * a + n[2] * r.radius];
  const out: Vec3 = r.convex ? n : [-n[0], -n[1], -n[2]];
  const u = unit3(cross3v(r.axis, out)); // (across the surface, round the axis)
  const v = cross3v(out, u); // (along the axis; u x v = out)
  return ok({ plane: r.face.ref, centre: surface, u, v, own: true });
}
const cross3v = (a: readonly number[], b: readonly number[]): Vec3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
/** A point of space as the round face's own two directions: the way round (the arc length from the middle of the face) and the way along the axis. */
function uvOnRound(r: Round, p: Vec3): Pt {
  const d: Vec3 = [p[0] - r.center[0], p[1] - r.center[1], p[2] - r.center[2]];
  const a = dot(d, r.axis);
  const rv: Vec3 = [d[0] - r.axis[0] * a, d[1] - r.axis[1] * a, d[2] - r.axis[2] * a];
  return [r.radius * Math.atan2(dot(rv, r.turn.e2), dot(rv, r.turn.e1)), a];
}
/** A round face as a surface for the rows, unrolled: along the arc, and along the axis. A face that goes all the way round has only a lowest and a highest line round it. */
function roundSurface(r: Round): RowSurface {
  const { e1, e2, lo, hi, full } = r.turn;
  const at3 = (phi: number, a: number): Vec3 => [r.center[0] + r.axis[0] * a + (Math.cos(phi) * e1[0] + Math.sin(phi) * e2[0]) * r.radius, r.center[1] + r.axis[1] * a + (Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1]) * r.radius, r.center[2] + r.axis[2] * a + (Math.cos(phi) * e1[2] + Math.sin(phi) * e2[2]) * r.radius];
  const mapAt = (phi: number, a: number): Result<FaceSpot> => spotOnRound(r, at3(phi, a));
  const map = (q: Pt): Result<FaceSpot> => mapAt(q[0] / r.radius, q[1]);
  if (full) return { outline: err("a wall that goes all the way round has no edges at its sides"), map, loop: { radius: r.radius, lo: r.range[0], hi: r.range[1], at: mapAt } };
  const [s0, s1] = [r.radius * lo, r.radius * hi];
  return { outline: ok(pathOf([[s0, r.range[0]], [s1, r.range[0]], [s1, r.range[1]], [s0, r.range[1]]], true)), map };
}
/** The side of the unrolled outline nearest to an edge of the round face. */
function roundSideNear(r: Round, sc: Scene, ref: Ref, outline: Path): Path | null {
  const l = sc.parts[ref];
  if (!l || l.kind !== "line") return null;
  const [a, b] = [pointOf((x) => sc.parts[x], l.a), pointOf((x) => sc.parts[x], l.b)];
  if (!a || !b) return null;
  const m = uvOnRound(r, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
  let best: Path | null = null;
  let bd = Infinity;
  for (const s of outline.segs) { const d = Math.hypot((s.a[0] + s.b[0]) / 2 - m[0], (s.a[1] + s.b[1]) / 2 - m[1]); if (d < bd) { bd = d; best = { segs: [s], closed: false }; } }
  return best;
}
function curvedPlan(session: Session, v: ReceiverValues, r: Round): Result<ReceiverPlan> {
  const sc = scene(session);
  const reachR = v.depth.trim() === "" ? 2 * r.radius : r.through;
  const hw = hardwareOf(v, r.through, reachR, reachR, true);
  if (!hw.ok) return hw;
  const rules = pathRepeatNumbers({ ...pathRepeatStart(), ...v } as PathRepeatValues);
  if (!rules.ok) return rules;
  const rn = rowNumbers(v);
  if (!rn.ok) return rn;
  const surf = roundSurface(r);
  const edgeRefs = new Set(faceEdges(sc, r.face));
  const edgeSel = r.lines.filter((x) => edgeRefs.has(x));
  const drawn = r.lines.filter((x) => !edgeRefs.has(x));
  const where = whereOf(v, { places: r.points.length, lines: drawn.length, edges: 0, outline: null, linePath: null });
  let spots: FaceSpot[] = [];
  let guide: Vec3[][] = [];
  let spacing: number | null = null;
  if (where === "picked") for (const q of r.points) { const s = spotOnRound(r, q); if (!s.ok) return s; spots.push(s.value); }
  else if (where === "lines") { // lines drawn on a plane: taken onto the surface (each point straight out from the axis) and followed along it
    const l = readLinesPath(sc, drawn, r.face);
    if (!l.ok) return l;
    const b = planeBasis(l.value.plane);
    const total = lengthOf(l.value.path);
    const pts = Array.from({ length: Math.min(200, Math.max(8, Math.ceil(total))) + 1 }, (_, i) => { const q = pointAt(l.value.path, (total * i) / Math.min(200, Math.max(8, Math.ceil(total)))).at; const p3: Vec3 = [b.at[0] + b.u[0] * q[0] + b.v[0] * q[1], b.at[1] + b.u[1] * q[0] + b.v[1] * q[1], b.at[2] + b.u[2] * q[0] + b.v[2] * q[1]]; return uvOnRound(r, p3); });
    const got = rowsAlongLine(pathOf(pts, false), surf.map, { ...rules.value.rules, corners: "ignore" }, rn.value.count, rn.value.gap);
    if (!got.ok) return got;
    ({ places: spots, guide, spacing } = got.value);
  } else if (where === "outline" || where === "edge" || where === "midline") {
    const edge = where !== "outline" && edgeSel.length && surf.outline.ok ? roundSideNear(r, sc, edgeSel[0]!, surf.outline.value) : null;
    const got = rowsFromEdges(surf, where, edge, rules.value.rules, rn.value.count, rn.value.gap);
    if (!got.ok) return got;
    ({ places: spots, guide, spacing } = got.value);
  } else return err("select the round face, and a line, or corners and circles on it");
  if (!spots.length) return err("the rules leave no hole");
  return ok({ kind: hw.value.kind, size: v.size as FastenerSize, fit: fitOf(v.fit), depth: hw.value.depth, engagement: hw.value.engagement, spot: spots[0]!, places: spots.map((s) => s.centre), far: false, spacing, guide, reach: v.depth.trim() === "" ? 2 * r.radius : hw.value.depth, stack: v.depth.trim() === "" ? 2 * r.radius : hw.value.depth, drill: hw.value.drill, insert: hw.value.insert, spots, curved: true });
}
export function cutReceiver(session: Session, v: ReceiverValues): Result<Session> {
  const plan = receiverPlan(session, v);
  if (!plan.ok) return plan;
  const p = plan.value;
  const steps: PartSteps = p.spots.flatMap((at) => [...receiverSteps(p.kind, p.size, p.fit, p.depth, at, p.engagement, p.drill), ...(p.far ? farNutSteps(p.size, at, p.stack) : [])]);
  if (p.insert) { // (the hardware goes in after every hole is cut: a cut is made on the last body, which a screw must not be)
    const ins = p.insert;
    for (const at of p.spots) {
      const c = at.centre;
      if (ins.screw) steps.push(...screwInPlace(ins.screw.family, p.size, ins.screw.length, at, ins.screw.seat));
      if (ins.nut === "near") steps.push(...nutInPlace(p.size, at.plane, c, at.u, at.v, at.own));
      if (ins.nut === "far") steps.push(...farNutInPlace(p.size, at, p.stack));
    }
  }
  const c = oneCommand(scene(session), steps);
  if (!c.ok) return c;
  const s = run(session, c.value);
  return s.message ? err(s.message) : ok(s);
}

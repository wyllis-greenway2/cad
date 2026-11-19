// Metric fasteners and the receivers that match them (`dec_parts_fastener_pilot`, `dec_parts_library`, `dec_parts_tolerance`): the hex nut (ISO 4032) and the hexagon socket countersunk head screw (ISO 10642), M3 to M8, coarse thread. Pure: tables
// of numbers, what is calculated from them, and the steps that draw a part. Every number is written down only where two sources read in full agree (`docs/decisions/dec_parts_fastener_pilot.md`, "Data status"); a part is made at
// its nominal size, and the printer's offset is left to the manufacturing version (`dec_parts_tolerance`).
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { worldRef } from "../shared/ref.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene } from "./scene.ts";
import { nextId, figureParams } from "./scene.ts";
import type { Command } from "./commands.ts";
import { drawChain, drawCircle } from "./build.ts";

export type FastenerSize = "M3" | "M4" | "M5" | "M6" | "M8";
export const FASTENER_SIZES: readonly FastenerSize[] = ["M3", "M4", "M5", "M6", "M8"];
export type FastenerFamily = "nut" | "countersunk" | "washer" | "socketHead";
export const FASTENER_FAMILIES: readonly { id: FastenerFamily; label: string; standard: string }[] = [
  { id: "nut", label: "Hex nut", standard: "ISO 4032" },
  { id: "countersunk", label: "Countersunk socket screw", standard: "ISO 10642 (the 1997 and 2004 tables)" },
  { id: "socketHead", label: "Socket head cap screw", standard: "ISO 4762" },
  { id: "washer", label: "Flat washer", standard: "ISO 7089" },
];
/** Where the numbers come from, shown to the person and kept with the entry. */
export const FASTENER_SOURCES = {
  clearance: "ISO 273 clearance holes: Albany County Fasteners chart and Optimas tapping sizes (the two agree)",
  nut: "ISO 4032 hexagon nut, style 1: H&B metric hex nut sheet and the omdl ISO 4032 table (the two agree)",
  countersunk: "ISO 10642 countersunk head screw, Table 1 of the 1997 and 2004 editions (read from the iTeh samples) and the Westfield Fasteners sheet, which all agree; the 2019 and 2026 editions' tables are not free to read, and their lists of changes do not touch these head dimensions",
  washer: "ISO 7089 plain washer, normal series: Westfield Fasteners sheet and the omdl ISO 7089 table (the two agree)",
  socketHead: "ISO 4762 socket head cap screw: the ISO 4762:1997 table (iTeh sample), the CDE Fasteners sheet and the omdl table agree; the knurled head's largest diameter (5.68 for M3) is the default and the smooth head's (5.50, also the Misumi figure) is the option",
  tapDrill: "Optimas tapping sizes (coarse thread): the drill is the nominal diameter less the pitch",
} as const;

/** Hex nut, ISO 4032 (mm): width across flats and across corners, thickness (each with its limits). The nut is drawn at the maximum across flats and thickness, which is the nominal of the standard. */
export interface NutDims { pitch: number; acrossFlats: { max: number; min: number }; acrossCorners: { min: number }; thickness: { max: number; min: number } }
const NUTS: Record<FastenerSize, NutDims> = {
  M3: { pitch: 0.5, acrossFlats: { max: 5.5, min: 5.32 }, acrossCorners: { min: 6.01 }, thickness: { max: 2.4, min: 2.15 } },
  M4: { pitch: 0.7, acrossFlats: { max: 7, min: 6.78 }, acrossCorners: { min: 7.66 }, thickness: { max: 3.2, min: 2.9 } },
  M5: { pitch: 0.8, acrossFlats: { max: 8, min: 7.78 }, acrossCorners: { min: 8.79 }, thickness: { max: 4.7, min: 4.4 } },
  M6: { pitch: 1, acrossFlats: { max: 10, min: 9.78 }, acrossCorners: { min: 11.05 }, thickness: { max: 5.2, min: 4.9 } },
  M8: { pitch: 1.25, acrossFlats: { max: 13, min: 12.73 }, acrossCorners: { min: 14.38 }, thickness: { max: 6.8, min: 6.44 } },
};
/** Hexagon socket countersunk head screw, ISO 10642, Table 1 of the 1997 and 2004 editions (mm). `head`: the theoretical head diameter (the diameter of the cone at the top, 90 degrees) and the smallest the real head may be; `shank`: the body's diameter limits; `headHeight`: the cone's height; `socket`: across flats (nominal and smallest) and the smallest depth; `threadLength`: the reference thread length b. */
export interface CountersunkDims {
  pitch: number; head: { theoretical: number; min: number }; shank: { max: number; min: number }; headHeight: number;
  socket: { acrossFlats: number; acrossFlatsMin: number; depthMin: number }; threadLength: number;
}
const COUNTERSUNK: Record<FastenerSize, CountersunkDims> = {
  M3: { pitch: 0.5, head: { theoretical: 6.72, min: 5.54 }, shank: { max: 3, min: 2.86 }, headHeight: 1.86, socket: { acrossFlats: 2, acrossFlatsMin: 2.02, depthMin: 1.1 }, threadLength: 18 },
  M4: { pitch: 0.7, head: { theoretical: 8.96, min: 7.53 }, shank: { max: 4, min: 3.82 }, headHeight: 2.48, socket: { acrossFlats: 2.5, acrossFlatsMin: 2.52, depthMin: 1.5 }, threadLength: 20 },
  M5: { pitch: 0.8, head: { theoretical: 11.2, min: 9.43 }, shank: { max: 5, min: 4.82 }, headHeight: 3.1, socket: { acrossFlats: 3, acrossFlatsMin: 3.02, depthMin: 1.9 }, threadLength: 22 },
  M6: { pitch: 1, head: { theoretical: 13.44, min: 11.34 }, shank: { max: 6, min: 5.82 }, headHeight: 3.72, socket: { acrossFlats: 4, acrossFlatsMin: 4.02, depthMin: 2.2 }, threadLength: 24 },
  M8: { pitch: 1.25, head: { theoretical: 17.92, min: 15.24 }, shank: { max: 8, min: 7.78 }, headHeight: 4.96, socket: { acrossFlats: 5, acrossFlatsMin: 5.02, depthMin: 3 }, threadLength: 28 },
};
/** Flat washer, ISO 7089, normal series (mm): the inside diameter (nominal and the largest), the outside diameter (nominal and the smallest) and the thickness (nominal, with its limits). */
export interface WasherDims { inside: { nom: number; max: number }; outside: { nom: number; min: number }; thickness: { nom: number; max: number; min: number } }
const WASHERS: Record<FastenerSize, WasherDims> = {
  M3: { inside: { nom: 3.2, max: 3.38 }, outside: { nom: 7, min: 6.64 }, thickness: { nom: 0.5, max: 0.55, min: 0.45 } },
  M4: { inside: { nom: 4.3, max: 4.48 }, outside: { nom: 9, min: 8.64 }, thickness: { nom: 0.8, max: 0.9, min: 0.7 } },
  M5: { inside: { nom: 5.3, max: 5.48 }, outside: { nom: 10, min: 9.64 }, thickness: { nom: 1, max: 1.1, min: 0.9 } },
  M6: { inside: { nom: 6.4, max: 6.62 }, outside: { nom: 12, min: 11.57 }, thickness: { nom: 1.6, max: 1.8, min: 1.4 } },
  M8: { inside: { nom: 8.4, max: 8.62 }, outside: { nom: 16, min: 15.57 }, thickness: { nom: 1.6, max: 1.8, min: 1.4 } },
};
/** Hexagon socket head cap screw, ISO 4762 (mm): body diameter (max, min), head diameter (`max`: the largest for a knurled head, `smooth`: the largest for a smooth head, `min`: the smallest, the same for both) and height (max, min), the socket's width across flats (nominal) and its depth (the key engagement, smallest). */
export interface SocketHeadDims {
  pitch: number; shank: { max: number; min: number }; head: { max: number; smooth: number; min: number }; headHeight: { max: number; min: number };
  socket: { acrossFlats: number; depthMin: number };
}
const SOCKET_HEAD: Record<FastenerSize, SocketHeadDims> = {
  M3: { pitch: 0.5, shank: { max: 3, min: 2.86 }, head: { max: 5.68, smooth: 5.5, min: 5.32 }, headHeight: { max: 3, min: 2.86 }, socket: { acrossFlats: 2.5, depthMin: 1.3 } },
  M4: { pitch: 0.7, shank: { max: 4, min: 3.82 }, head: { max: 7.22, smooth: 7, min: 6.78 }, headHeight: { max: 4, min: 3.82 }, socket: { acrossFlats: 3, depthMin: 2 } },
  M5: { pitch: 0.8, shank: { max: 5, min: 4.82 }, head: { max: 8.72, smooth: 8.5, min: 8.28 }, headHeight: { max: 5, min: 4.82 }, socket: { acrossFlats: 4, depthMin: 2.5 } },
  M6: { pitch: 1, shank: { max: 6, min: 5.82 }, head: { max: 10.22, smooth: 10, min: 9.78 }, headHeight: { max: 6, min: 5.7 }, socket: { acrossFlats: 5, depthMin: 3 } },
  M8: { pitch: 1.25, shank: { max: 8, min: 7.78 }, head: { max: 13.27, smooth: 13, min: 12.73 }, headHeight: { max: 8, min: 7.64 }, socket: { acrossFlats: 6, depthMin: 4 } },
};
/** Clearance holes, ISO 273 (mm): the fine, medium and coarse series (tolerance classes H12, H13 and H14). */
export type ClearanceFit = "fine" | "medium" | "coarse";
export const CLEARANCE_FIT_LIST: readonly ClearanceFit[] = ["fine", "medium", "coarse"];
const CLEARANCE: Record<FastenerSize, Record<ClearanceFit, number>> = {
  M3: { fine: 3.2, medium: 3.4, coarse: 3.6 },
  M4: { fine: 4.3, medium: 4.5, coarse: 4.8 },
  M5: { fine: 5.3, medium: 5.5, coarse: 5.8 },
  M6: { fine: 6.4, medium: 6.6, coarse: 7 },
  M8: { fine: 8.4, medium: 9, coarse: 10 },
};
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

// ---- the standard lengths ----
/** The nominal lengths of ISO 888:2012, Table 1 (mm), for metric bolts, screws and studs: the ones to use (read in full from the iTeh sample, the English text). */
export const STANDARD_LENGTHS: readonly number[] = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340, 360, 380, 400, 420, 440, 460, 480, 500];
/** The lengths the same table prints in brackets: "should be avoided, if possible". */
export const AVOID_LENGTHS: readonly number[] = [2.5, 7, 9, 11, 14, 18, 22, 28, 32, 38, 75, 85, 95, 105, 115, 125, 170, 190];
export type LengthStatus = "standard" | "avoid" | "other";
export const lengthStatus = (length: number): LengthStatus => (STANDARD_LENGTHS.includes(length) ? "standard" : AVOID_LENGTHS.includes(length) ? "avoid" : "other");
/** The standard lengths just below and just above a length (the length itself if it is one), nearest first. */
export function nearbyLengths(length: number): number[] {
  const below = [...STANDARD_LENGTHS].reverse().find((l) => l < length);
  const above = STANDARD_LENGTHS.find((l) => l > length);
  return [below, above].filter((l): l is number => l !== undefined).sort((a, b) => Math.abs(a - length) - Math.abs(b - length));
}
/** What ISO 888 says of a length, in a line. It does not say which lengths a screw of this size is made in (the product standards give that range per size in a drawn table that was not read): a standard length may still not be made for a size. */
export function lengthAdvice(length: number): string {
  const l = Number.isFinite(length) ? length : NaN;
  if (Number.isNaN(l)) return "";
  const status = lengthStatus(l);
  if (status === "standard") return `${l} mm is a standard length (ISO 888)`;
  if (status === "avoid") return `${l} mm is in ISO 888's table, but in brackets: to be avoided if possible`;
  const near = nearbyLengths(l);
  return `${l} mm is not a standard length${near.length ? `: the standard lengths nearest are ${near.join(" and ")} mm` : ""}`;
}
export const isFastenerSize = (s: string): s is FastenerSize => (FASTENER_SIZES as readonly string[]).includes(s);
const nominalDiameter = (size: FastenerSize): number => Number(size.slice(1));
export const nutDims = (size: FastenerSize): NutDims => NUTS[size];
export const countersunkDims = (size: FastenerSize): CountersunkDims => COUNTERSUNK[size];
export const washerDims = (size: FastenerSize): WasherDims => WASHERS[size];
export const socketHeadDims = (size: FastenerSize): SocketHeadDims => SOCKET_HEAD[size];

// ---- the receivers: the hole a fastener goes into ----
/** The clearance hole for the shank (mm), in the fit chosen. */
export const clearanceHole = (size: FastenerSize, fit: ClearanceFit): number => CLEARANCE[size][fit];
/** The chart's drill for a threaded hole (mm): the nominal diameter less the pitch (Optimas coarse thread chart). `tapHole` takes an engagement instead. */
export const tapDrill = (size: FastenerSize): number => round3(nominalDiameter(size) - COUNTERSUNK[size].pitch);
/**
 * The engaged height of the ISO basic internal thread, as a fraction of the pitch: 5/8 of the fundamental triangle's height H = (sqrt 3 / 2) P, about 0.5413 P (ISO 68-1 basic profile). A hole of diameter `d - 2 * 0.5413 * P` gives every thread its full engaged height (100%); the engagement of any
 * other hole is `(d - hole) / (2 * 0.5413 * P)`. **This is our convention** (the US charts count percent thread from another height, 0.6495 P, and give other percentages for the same hole); no source read states which one the tap drill chart uses.
 */
const ENGAGED_HEIGHT = (5 / 8) * (Math.sqrt(3) / 2);
/** The smallest and largest thread engagement the setting takes (fractions): 40% to 100% of the basic engaged height. */
export const ENGAGEMENT_RANGE: readonly [number, number] = [0.4, 1];
/** The engagement the chart's tap drill (nominal less pitch) gives, on that convention: about 92%, the same for every size. */
export const chartEngagement = (size: FastenerSize): number => (nominalDiameter(size) - tapDrill(size)) / (2 * ENGAGED_HEIGHT * COUNTERSUNK[size].pitch);
/** The diameter of a hole to tap (mm) for a thread engagement (a fraction: 0.75 is 75%); with none, the chart's tap drill. A smaller engagement is a bigger hole: an easier tap and a weaker thread. */
export const tapHole = (size: FastenerSize, engagement?: number): number => (engagement === undefined ? tapDrill(size) : round3(nominalDiameter(size) - 2 * ENGAGED_HEIGHT * COUNTERSUNK[size].pitch * engagement));
/** The countersink for a countersunk screw: the diameter at the surface (the head's theoretical diameter), the angle (90 degrees) and the depth the cone goes (the head's height). */
export const countersink = (size: FastenerSize): { diameter: number; angle: number; depth: number } => ({ diameter: COUNTERSUNK[size].head.theoretical, angle: 90, depth: COUNTERSUNK[size].headHeight });
/** The pocket for a hex nut, at the nut's own size (the printer's offset is added in the manufacturing version, `dec_parts_tolerance`): across flats, across corners and depth. */
export const nutTrap = (size: FastenerSize): { acrossFlats: number; acrossCorners: number; depth: number } => ({ acrossFlats: NUTS[size].acrossFlats.max, acrossCorners: round3(NUTS[size].acrossFlats.max / Math.cos(Math.PI / 6)), depth: NUTS[size].thickness.max });
/** The counterbore for a socket head cap screw: the head's width plus `COUNTERBORE_EXTRA`, as deep as the head is high. **A rule of ours, not a standard's** (no source was found for counterbore sizes): the extra width is one number to change. */
export const COUNTERBORE_EXTRA = 0.5;
export const counterbore = (size: FastenerSize, washer = false): { diameter: number; depth: number } => ({ diameter: round3(Math.max(SOCKET_HEAD[size].head.max, washer ? WASHERS[size].outside.nom : 0) + COUNTERBORE_EXTRA), depth: round3(SOCKET_HEAD[size].headHeight.max + (washer ? WASHERS[size].thickness.nom : 0)) }); // (with a washer under the head: wide enough for it and deeper by its thickness, `in_1013`)
/** What the receivers of a size are, in words: the numbers a person drills or draws. */
export function receiversText(size: FastenerSize, family: FastenerFamily): string {
  const c = clearanceHole(size, "fine"), m = clearanceHole(size, "medium"), l = clearanceHole(size, "coarse");
  const base = `clearance hole ${c} / ${m} / ${l} mm (fine / medium / coarse), tap drill ${tapDrill(size)} mm`;
  if (family === "countersunk") { const k = countersink(size); return `${base}, countersink ${k.diameter} mm across at ${k.angle}°, ${k.depth} mm deep`; }
  if (family === "socketHead") { const c = counterbore(size); return `${base}, counterbore ${c.diameter} mm across and ${c.depth} mm deep (our rule: the head plus ${COUNTERBORE_EXTRA} mm, no standard)`; }
  if (family === "washer") return `${base}; a washer has no receiver of its own`;
  const t = nutTrap(size);
  return `${base}, nut pocket ${t.acrossFlats} mm across flats (${t.acrossCorners} across corners), ${t.depth} mm deep`;
}

// ---- the parts ----
/** The corners of a regular hexagon of this width across flats, about the origin, the flats facing the plane's first axis (corners on the second). */
export function hexagon(acrossFlats: number): [number, number][] {
  const r = acrossFlats / Math.cos(Math.PI / 6) / 2; // (the corner circle)
  return Array.from({ length: 6 }, (_, i) => [r * Math.cos(Math.PI / 6 + (i * Math.PI) / 3), r * Math.sin(Math.PI / 6 + (i * Math.PI) / 3)] as [number, number]);
}
/** The side view of a countersunk screw as a closed outline (x out from the axis, y along it, the top of the head at 0 and the point at -length): the 90 degree cone, the shank and the axis. */
export function countersunkProfile(size: FastenerSize, length: number): [number, number][] {
  const d = COUNTERSUNK[size];
  const top = d.head.theoretical / 2;
  const r = d.shank.max / 2;
  return [[0, 0], [top, 0], [r, -d.headHeight], [r, -length], [0, -length]];
}
/** Why a countersunk screw of this length cannot be made, or null: the length is counted from the top of the head and must be longer than the head is deep. */
export function lengthProblem(size: FastenerSize, length: number): string | null {
  if (!Number.isFinite(length)) return "the length is not a number";
  const k = COUNTERSUNK[size].headHeight;
  return length > k + 0.5 ? null : `the length is counted from the top of the head and must be more than ${round3(k + 0.5)} mm for ${size}`;
}

/** A part as the steps that draw it, each made from the scene as it is after the one before (ids come from the scene's counter). */
export type PartSteps = ((s: Scene) => Command)[];
const ground: Ref = worldRef("XY");

/** A hex nut at the origin on the ground plane, standing up from it: the hexagon with the thread's hole, extruded the nut's thickness. */
function nutSteps(size: FastenerSize): PartSteps {
  const d = NUTS[size];
  let circle: Ref | null = null;
  let hex: Ref[] = [];
  return [
    (s) => { const r = drawChain(s, ground, hexagon(d.acrossFlats.max).map(([x, y]) => [x, y, 0] as [number, number, number]), true); hex = r.lines; return r.command; },
    (s) => { const r = drawCircle(s, ground, [0, 0, 0], nominalDiameter(size) / 2); circle = r.circle; return r.command; },
    (s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "extrude", parts: hex, params: { depth: d.thickness.max, ...figureParams([{ outer: hex, holes: circle ? [[circle]] : [] }]) } } }),
  ];
}
export const makeNut = (size: string): Result<PartSteps> => (isFastenerSize(size) ? ok(nutSteps(size)) : err(`${size} is not a size this family has`));

/** A countersunk screw at the origin, the top of its head on the ground plane and the shank going down (-Z) the length given: the side view turned a full turn about the Z axis, then the hexagon socket cut down from the top of the head. */
function countersunkSteps(size: FastenerSize, length: number): PartSteps {
  const d = COUNTERSUNK[size];
  const side: Ref = worldRef("XZ");
  let outline: Ref[] = [];
  let hex: Ref[] = [];
  return [
    (s) => { const r = drawChain(s, side, countersunkProfile(size, length).map(([x, z]) => [x, 0, z] as [number, number, number]), true); outline = r.lines; return r.command; },
    (s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "revolve", parts: outline, params: { ...figureParams([{ outer: outline, holes: [] }]), angle: 360, advance: 0, ax: 0, ay: 0, az: 0, dx: 0, dy: 0, dz: 1 } } }),
    (s) => { const r = drawChain(s, ground, hexagon(d.socket.acrossFlats).map(([x, y]) => [x, y, 0] as [number, number, number]), true); hex = r.lines; return r.command; },
    (s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "extrude", parts: hex, params: { depth: -d.socket.depthMin, mode: "cut", ...figureParams([{ outer: hex, holes: [] }]) } } }),
  ];
}
export function makeCountersunk(size: string, length: number): Result<PartSteps> {
  if (!isFastenerSize(size)) return err(`${size} is not a size this family has`);
  const bad = lengthProblem(size, length);
  return bad ? err(bad) : ok(countersunkSteps(size, length));
}

// ---- the receivers cut into a body ----
export type ReceiverKind = "clearance" | "countersunk" | "counterbore" | "tapped" | "nutPocket" | "drillTap";
export const RECEIVER_KINDS: readonly { id: ReceiverKind; label: string; /** a short name for a card */ short: string }[] = [
  { id: "clearance", label: "Clearance hole", short: "Clearance hole" },
  { id: "countersunk", label: "Countersunk clearance hole (for a countersunk screw)", short: "Countersunk" },
  { id: "counterbore", label: "Counterbored clearance hole (for a socket head screw)", short: "Counterbored" },
  { id: "tapped", label: "Hole to tap (the tap drill)", short: "Hole to tap" },
  { id: "nutPocket", label: "Nut pocket with its clearance hole", short: "Nut pocket" },
  { id: "drillTap", label: "Clearance hole to a depth, tapped past it (the tap drill)", short: "Drill + tap" }, // (`in_910`, `in_911`)
];
/** Where a receiver goes: a flat face of a body, as the plane the face lies on (`at` a point on it, `u` and `v` across it, the normal `u` x `v` pointing out of the body), and the point on it the hole is centred on. */
export interface FaceSpot { plane: Ref; centre: Vec3; u: Vec3; v: Vec3; /** on a curved surface (`in_929`): `plane` is not the plane of the spot, so a plane touching the surface at `centre` (`u`, `v` across it, the normal `u` x `v` out of the body) is made for what has to be drawn on it */ own?: boolean }
const cross3 = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const along = (p: readonly number[], d: readonly number[], t: number): [number, number, number] => [p[0]! + d[0]! * t, p[1]! + d[1]! * t, p[2]! + d[2]! * t];
const BIT = 0.5; // (a cut starts this far outside the face, so it never ends exactly on it)
/** The side view of a round receiver as a closed outline about its axis (x out from it, y along the outward normal, the face at 0): a plain hole, or one with the 90 degree countersink at its mouth. Null for a countersink wider than the hole it opens (never for the sizes here). */
export function receiverProfile(kind: ReceiverKind, size: FastenerSize, fit: ClearanceFit, depth: number, engagement?: number, drill?: number, washer = false): [number, number][] {
  if (kind === "drillTap") { const rc = clearanceHole(size, fit) / 2, rt = tapHole(size, engagement) / 2, d = drill ?? depth / 2; return [[0, BIT], [rc, BIT], [rc, -d], [rt, -d], [rt, -depth], [0, -depth]]; }
  const r = (kind === "tapped" ? tapHole(size, engagement) : clearanceHole(size, fit)) / 2;
  if (kind === "countersunk") {
    const big = countersink(size).diameter / 2;
    return [[0, BIT], [big, BIT], [big, 0], [r, -(big - r)], [r, -depth], [0, -depth]];
  }
  if (kind === "counterbore") {
    const c = counterbore(size, washer);
    return [[0, BIT], [c.diameter / 2, BIT], [c.diameter / 2, -c.depth], [r, -c.depth], [r, -depth], [0, -depth]];
  }
  return [[0, BIT], [r, BIT], [r, -depth], [0, -depth]];
}
/** Why this receiver cannot be cut with these numbers, or null. A countersink has to be shallower than the hole. */
export function receiverProblem(kind: ReceiverKind, size: FastenerSize, fit: ClearanceFit, depth: number, engagement?: number, drill?: number, washer = false): string | null {
  if (!(depth > 0) || !Number.isFinite(depth)) return "the depth must be a number above zero";
  if (kind === "drillTap" && !(drill !== undefined && drill > 0 && drill < depth)) return "the drilled part must be above zero and less deep than the whole hole";
  if ((kind === "tapped" || kind === "drillTap") && engagement !== undefined && !(engagement >= ENGAGEMENT_RANGE[0] && engagement <= ENGAGEMENT_RANGE[1])) return `the thread engagement is between ${ENGAGEMENT_RANGE[0] * 100}% and ${ENGAGEMENT_RANGE[1] * 100}%`;
  const hole = kind === "tapped" ? tapHole(size, engagement) : clearanceHole(size, fit);
  const cone = kind === "countersunk" ? countersink(size).diameter / 2 - hole / 2 : 0;
  if (cone >= depth) return `the countersink goes ${round3(cone)} mm deep: the hole must be deeper than that`;
  if (kind === "counterbore" && depth <= counterbore(size, washer).depth) return `the counterbore is ${counterbore(size, washer).depth} mm deep: the hole must be deeper than that`;
  if (kind === "nutPocket" && depth <= nutTrap(size).depth) return `the nut pocket is ${nutTrap(size).depth} mm deep: the hole through must be deeper than that`;
  return null;
}
/** The steps that cut a receiver into a body at a spot on a face; `depth` is how far the hole goes (a pocket's own depth is the nut's thickness). */
export function receiverSteps(kind: ReceiverKind, size: FastenerSize, fit: ClearanceFit, depth: number, spot: FaceSpot, engagement?: number, drill?: number, washer = false): PartSteps {
  const n = cross3(spot.u, spot.v);
  const len = Math.hypot(...n) || 1;
  const out: [number, number, number] = [n[0] / len, n[1] / len, n[2] / len];
  const t = spot.u;
  const steps: PartSteps = [];
  let axisPlane: Ref | null = null;
  let outline: Ref[] = [];
  steps.push((s) => { // (a plane through the axis, across the face: x along the face, y along the normal)
    const ref: Ref = `d/${nextId(s, "e")}.pl` as Ref;
    axisPlane = ref;
    return { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: false, at: spot.centre, u: t, v: out } }; // (not an infinite plane: that is a world plane, hit anywhere and drawn across the whole view; this one only holds the hole's side view)
  });
  steps.push((s) => { const r = drawChain(s, axisPlane!, receiverProfile(kind, size, fit, depth, engagement, drill, washer).map(([x, y]) => along(along(spot.centre, t, x), out, y)), true); outline = r.lines; return r.command; });
  steps.push((s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "revolve", parts: outline, params: { ...figureParams([{ outer: outline, holes: [] }]), mode: "cut", angle: 360, advance: 0, ax: spot.centre[0], ay: spot.centre[1], az: spot.centre[2], dx: out[0], dy: out[1], dz: out[2] } } }));
  if (kind === "nutPocket") {
    const trap = nutTrap(size);
    let hex: Ref[] = [];
    let hexPlane: Ref = spot.plane;
    if (spot.own) steps.push((s) => { const ref: Ref = `d/${nextId(s, "e")}.pl` as Ref; hexPlane = ref; return { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: false, at: spot.centre, u: spot.u, v: spot.v } }; });
    steps.push((s) => { const r = drawChain(s, hexPlane, hexagon(trap.acrossFlats).map(([x, y]) => along(along(spot.centre, spot.u, x), spot.v, y)), true); hex = r.lines; return r.command; });
    steps.push((s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "extrude", parts: hex, params: { depth: -trap.depth, mode: "cut", ...figureParams([{ outer: hex, holes: [] }]) } } }));
  }
  return steps;
}

// ---- the washer and the socket head cap screw ----
/** A flat washer at the origin on the ground plane, standing up from it: a ring, extruded its thickness. */
function washerSteps(size: FastenerSize): PartSteps {
  const d = WASHERS[size];
  let outer: Ref | null = null;
  let inner: Ref | null = null;
  return [
    (s) => { const r = drawCircle(s, ground, [0, 0, 0], d.outside.nom / 2); outer = r.circle; return r.command; },
    (s) => { const r = drawCircle(s, ground, [0, 0, 0], d.inside.nom / 2); inner = r.circle; return r.command; },
    (s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "extrude", parts: [outer!], params: { depth: d.thickness.nom, ...figureParams([{ outer: [outer!], holes: [[inner!]] }]) } } }),
  ];
}
export const makeWasher = (size: string): Result<PartSteps> => (isFastenerSize(size) ? ok(washerSteps(size)) : err(`${size} is not a size this family has`));
/** The side view of a socket head cap screw as a closed outline (x out from the axis, y along it, the top of the head at 0): the cylindrical head, the shank, the axis. The length is counted from under the head; `smooth` draws the head at the largest smooth-head diameter, else at the largest knurled one. */
export function socketHeadProfile(size: FastenerSize, length: number, smooth = false): [number, number][] {
  const d = SOCKET_HEAD[size];
  const [R, r, k] = [(smooth ? d.head.smooth : d.head.max) / 2, d.shank.max / 2, d.headHeight.max];
  return [[0, 0], [R, 0], [R, -k], [r, -k], [r, -k - length], [0, -k - length]];
}
/** Why a socket head screw of this length cannot be made, or null: the length (under the head) must be longer than the head is high. */
export function socketLengthProblem(size: FastenerSize, length: number): string | null {
  if (!Number.isFinite(length)) return "the length is not a number";
  return length > 0.5 ? null : "the length, counted under the head, must be more than 0.5 mm";
}
/** A socket head cap screw at the origin, the top of its head on the ground plane and the shank going down (-Z): the side view turned a full turn about Z, then the hexagon socket cut down from the top. */
function socketHeadSteps(size: FastenerSize, length: number, smooth: boolean): PartSteps {
  const d = SOCKET_HEAD[size];
  const side: Ref = worldRef("XZ");
  let outline: Ref[] = [];
  let hex: Ref[] = [];
  return [
    (s) => { const r = drawChain(s, side, socketHeadProfile(size, length, smooth).map(([x, z]) => [x, 0, z] as [number, number, number]), true); outline = r.lines; return r.command; },
    (s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "revolve", parts: outline, params: { ...figureParams([{ outer: outline, holes: [] }]), angle: 360, advance: 0, ax: 0, ay: 0, az: 0, dx: 0, dy: 0, dz: 1 } } }),
    (s) => { const r = drawChain(s, ground, hexagon(d.socket.acrossFlats).map(([x, y]) => [x, y, 0] as [number, number, number]), true); hex = r.lines; return r.command; },
    (s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "extrude", parts: hex, params: { depth: -d.socket.depthMin, mode: "cut", ...figureParams([{ outer: hex, holes: [] }]) } } }),
  ];
}
export function makeSocketHead(size: string, length: number, smooth = false): Result<PartSteps> {
  if (!isFastenerSize(size)) return err(`${size} is not a size this family has`);
  const bad = socketLengthProblem(size, length);
  return bad ? err(bad) : ok(socketHeadSteps(size, length, smooth));
}

/**
 * The nut pocket on the other side of a body (`in_909`): the hexagon of the nut cut into the far face of the body round the same axis, as deep as the nut is thick. `spot.centre` is where the hole is on the near face, `reach` how far
 * the body goes from that face to the far one along the hole. The pocket's plane stands on the far face, facing out of the body, so the cut goes into it as one made from the near face does.
 */
export function farNutSteps(size: FastenerSize, spot: FaceSpot, reach: number): PartSteps {
  const trap = nutTrap(size);
  const n0 = cross3(spot.u, spot.v);
  const l = Math.hypot(...n0) || 1;
  const n: Vec3 = [n0[0] / l, n0[1] / l, n0[2] / l];
  const lu = Math.hypot(...spot.u) || 1;
  const e1: Vec3 = [spot.u[0] / lu, spot.u[1] / lu, spot.u[2] / lu];
  const v = cross3(e1, n); // (e1 x v = -n: the plane faces out of the far side)
  const far = along(spot.centre, n, -reach);
  let plane: Ref | null = null;
  let hex: Ref[] = [];
  return [
    (s) => { const ref: Ref = `d/${nextId(s, "e")}.pl` as Ref; plane = ref; return { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: false, at: far, u: e1, v } }; },
    (s) => { const r = drawChain(s, plane!, hexagon(trap.acrossFlats).map(([x, y]) => along(along(far, e1, x), v, y)), true); hex = r.lines; return r.command; },
    (s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "extrude", parts: hex, params: { depth: -trap.depth, mode: "cut", ...figureParams([{ outer: hex, holes: [] }]) } } }),
  ];
}

// ---- the hardware inserted into the holes (`in_910`, `in_911`) ----
/** The longest standard length that fits in `room` mm, or null when none does. */
/** The shortest standard length that is at least `room` mm (a screw that reaches through a hole whose far end is open), or null when none is. */
export const shortestStandard = (room: number): number | null => { const l = STANDARD_LENGTHS.filter((x) => x >= room - 1e-9); return l.length ? l[0]! : null; };
export const longestStandard = (room: number): number | null => { const l = STANDARD_LENGTHS.filter((x) => x <= room + 1e-9); return l.length ? l[l.length - 1]! : null; };
/** How far under the face the head of the screw sits: a countersunk head is flush (0), a socket head sits in its counterbore, or on the face (and stands above it). */
export const seatDepth = (kind: ReceiverKind, size: FastenerSize, washer = false): number => (kind === "counterbore" ? counterbore(size).depth : washer && washerable(kind) ? -WASHERS[size].thickness.nom : 0); // (a washer on the surface lifts the head: the seat is above it)
/** The receivers a washer goes under the head in: a countersunk head sits in its cone and a nut pocket has no head. */
export const washerable = (kind: ReceiverKind): boolean => kind === "clearance" || kind === "tapped" || kind === "drillTap" || kind === "counterbore";
/** How far the washer top stands from the face (negative: below it, on the counterbore's floor). */
export const washerTop = (kind: ReceiverKind, size: FastenerSize): number => (kind === "counterbore" ? -counterbore(size).depth : WASHERS[size].thickness.nom);
/** A flat washer as its own body at a place: a ring (the outside and the hole of ISO 7089) extruded its thickness down from `top` above the face (`in_1013`). */
export function washerInPlace(size: FastenerSize, spot: FaceSpot, top: number): PartSteps {
  const d = WASHERS[size];
  const out = unit(cross3(spot.u, spot.v));
  const at = along(spot.centre, out, top);
  let plane: Ref | null = null;
  let outer: Ref | null = null;
  let inner: Ref | null = null;
  return [
    (s) => { const ref: Ref = `d/${nextId(s, "e")}.pl` as Ref; plane = ref; return { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: false, at, u: spot.u, v: spot.v } }; },
    (s) => { const r = drawCircle(s, plane!, at, d.outside.nom / 2); outer = r.circle; return r.command; },
    (s) => { const r = drawCircle(s, plane!, at, d.inside.nom / 2); inner = r.circle; return r.command; },
    (s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "extrude", parts: [outer!], params: { depth: -d.thickness.nom, mode: "new", ...figureParams([{ outer: [outer!], holes: [[inner!]] }]) } } }),
  ];
}
/** The screw a receiver takes: countersunk for a countersunk hole, else the socket head; none for a nut pocket (its screw comes from the other side). */
export const screwFor = (kind: ReceiverKind): "countersunk" | "socketHead" | null => (kind === "countersunk" ? "countersunk" : kind === "nutPocket" ? null : "socketHead");
/** A drawn plane facing `n` through `at` (u along `e1`), for a figure that is not on a face. */
const standingPlane = (at: Vec3, e1: Vec3, n: Vec3): { ref: (s: Scene) => Ref; command: (ref: Ref) => Command } => ({
  ref: (s) => `d/${nextId(s, "e")}.pl` as Ref,
  command: (ref) => ({ type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: false, at, u: e1, v: cross3(n, e1) } }),
});
const unit = (a: readonly number[]): Vec3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l]; };
/** A screw as its own body in a hole: its side view turned about the hole's axis, and the hexagon socket cut down from the top of its head. `length` counts as the screw's own (from the top of a countersunk head, under the head of a socket head). */
export function screwInPlace(family: "countersunk" | "socketHead", size: FastenerSize, length: number, spot: FaceSpot, seat: number, smooth = false): PartSteps {
  const out = unit(cross3(spot.u, spot.v));
  const t = unit(spot.u);
  const d = family === "countersunk" ? COUNTERSUNK[size] : SOCKET_HEAD[size];
  const k = family === "countersunk" ? COUNTERSUNK[size].headHeight : SOCKET_HEAD[size].headHeight.max;
  const lift = family === "countersunk" ? 0 : k - seat; // (the profile has the top of the head at 0, the socket head's under-side at -k)
  const profile = family === "countersunk" ? countersunkProfile(size, length) : socketHeadProfile(size, length, smooth);
  const socket = family === "countersunk" ? COUNTERSUNK[size].socket : SOCKET_HEAD[size].socket;
  void d;
  let axis: Ref | null = null;
  let outline: Ref[] = [];
  let top: Ref | null = null;
  let hex: Ref[] = [];
  const topAt = along(spot.centre, out, lift);
  const flat = standingPlane(topAt, t, out);
  return [
    (s) => { const ref = `d/${nextId(s, "e")}.pl` as Ref; axis = ref; return { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: false, at: spot.centre, u: t, v: out } }; },
    (s) => { const r = drawChain(s, axis!, profile.map(([x, y]) => along(along(spot.centre, t, x), out, y + lift)), true); outline = r.lines; return r.command; },
    (s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "revolve", parts: outline, params: { ...figureParams([{ outer: outline, holes: [] }]), mode: "new", angle: 360, advance: 0, ax: spot.centre[0], ay: spot.centre[1], az: spot.centre[2], dx: out[0], dy: out[1], dz: out[2] } } }),
    (s) => { const ref = flat.ref(s); top = ref; return flat.command(ref); },
    (s) => { const r = drawChain(s, top!, hexagon(socket.acrossFlats).map(([x, y]) => along(along(topAt, t, x), cross3(out, t), y)), true); hex = r.lines; return r.command; },
    (s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "extrude", parts: hex, params: { depth: -socket.depthMin, mode: "cut", ...figureParams([{ outer: hex, holes: [] }]) } } }),
  ];
}
/** A hex nut as its own body standing in its pocket: the plane is the face the pocket is cut from (facing out of the body), `centre` the hole's axis on it. */
export function nutInPlace(size: FastenerSize, plane0: Ref, centre: Vec3, u: Vec3, v: Vec3, own = false): PartSteps {
  const d = NUTS[size];
  let circle: Ref | null = null;
  let hex: Ref[] = [];
  let plane: Ref = plane0;
  return [
    ...(own ? [(s: Scene): Command => { const ref: Ref = `d/${nextId(s, "e")}.pl` as Ref; plane = ref; return { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: false, at: centre, u, v } }; }] : []),
    (s) => { const r = drawChain(s, plane, hexagon(d.acrossFlats.max).map(([x, y]) => along(along(centre, u, x), v, y)), true); hex = r.lines; return r.command; },
    (s) => { const r = drawCircle(s, plane, centre, nominalDiameter(size) / 2); circle = r.circle; return r.command; },
    (s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "extrude", parts: hex, params: { depth: -d.thickness.max, mode: "new", ...figureParams([{ outer: hex, holes: circle ? [[circle]] : [] }]) } } }),
  ];
}
/** The nut as its own body in the pocket on the far side (`farNutSteps` cuts the pocket). */
export function farNutInPlace(size: FastenerSize, spot: FaceSpot, reach: number): PartSteps {
  const d = NUTS[size];
  const n = unit(cross3(spot.u, spot.v));
  const e1 = unit(spot.u);
  const v = cross3(e1, n);
  const far = along(spot.centre, n, -reach);
  let plane: Ref | null = null;
  let hex: Ref[] = [];
  let circle: Ref | null = null;
  return [
    (s) => { const ref: Ref = `d/${nextId(s, "e")}.pl` as Ref; plane = ref; return { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: false, at: far, u: e1, v } }; },
    (s) => { const r = drawChain(s, plane!, hexagon(d.acrossFlats.max).map(([x, y]) => along(along(far, e1, x), v, y)), true); hex = r.lines; return r.command; },
    (s) => { const r = drawCircle(s, plane!, far, nominalDiameter(size) / 2); circle = r.circle; return r.command; },
    (s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "extrude", parts: hex, params: { depth: -d.thickness.max, mode: "new", ...figureParams([{ outer: hex, holes: circle ? [[circle]] : [] }]) } } }),
  ];
}

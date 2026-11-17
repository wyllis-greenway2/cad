// Metric fasteners and the receivers that match them (`dec_parts_fastener_pilot`, `dec_parts_library`, `dec_parts_tolerance`): the hex nut (ISO 4032) and the hexagon socket countersunk head screw (ISO 10642), M3 to M8, coarse thread. Pure: tables
// of numbers, what is calculated from them, and the steps that draw a part. Every number is written down only where two sources read in full agree (`docs/decisions/dec_parts_fastener_pilot.md`, "Data status"); a part is made at
// its nominal size, and the printer's offset is left to the manufacturing version (`dec_parts_tolerance`).
import type { Ref } from "../shared/ref.ts";
import { worldRef } from "../shared/ref.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene } from "./scene.ts";
import { nextId, figureParams } from "./scene.ts";
import type { Command } from "./commands.ts";
import { drawChain, drawCircle } from "./build.ts";

export type FastenerSize = "M3" | "M4" | "M5" | "M6" | "M8";
export const FASTENER_SIZES: readonly FastenerSize[] = ["M3", "M4", "M5", "M6", "M8"];
export type FastenerFamily = "nut" | "countersunk";
export const FASTENER_FAMILIES: readonly { id: FastenerFamily; label: string; standard: string }[] = [
  { id: "nut", label: "Hex nut", standard: "ISO 4032" },
  { id: "countersunk", label: "Countersunk socket screw", standard: "ISO 10642 (1997 figures)" },
];
/** Where the numbers come from, shown to the person and kept with the entry. */
export const FASTENER_SOURCES = {
  clearance: "ISO 273 clearance holes: Albany County Fasteners chart and Optimas tapping sizes (the two agree)",
  nut: "ISO 4032 hexagon nut, style 1: H&B metric hex nut sheet and the omdl ISO 4032 table (the two agree)",
  countersunk: "ISO 10642 countersunk head screw, the 1997 edition's figures: Westfield Fasteners sheet and the 1997 ISO 10642 sample (the two agree); the 2019 edition was not read",
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
/** Hexagon socket countersunk head screw, ISO 10642, 1997 figures (mm). `head`: the theoretical head diameter (the diameter of the cone at the top, 90 degrees) and the smallest the real head may be; `shank`: the body's diameter limits; `headHeight`: the cone's height; `socket`: across flats (nominal and smallest) and the smallest depth; `threadLength`: the reference thread length b. */
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
/** Clearance holes, ISO 273 (mm): the fine, medium and coarse series (tolerance classes H12, H13 and H14). */
export type ClearanceFit = "fine" | "medium" | "coarse";
const CLEARANCE: Record<FastenerSize, Record<ClearanceFit, number>> = {
  M3: { fine: 3.2, medium: 3.4, coarse: 3.6 },
  M4: { fine: 4.3, medium: 4.5, coarse: 4.8 },
  M5: { fine: 5.3, medium: 5.5, coarse: 5.8 },
  M6: { fine: 6.4, medium: 6.6, coarse: 7 },
  M8: { fine: 8.4, medium: 9, coarse: 10 },
};
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export const isFastenerSize = (s: string): s is FastenerSize => (FASTENER_SIZES as readonly string[]).includes(s);
const nominalDiameter = (size: FastenerSize): number => Number(size.slice(1));
export const nutDims = (size: FastenerSize): NutDims => NUTS[size];
export const countersunkDims = (size: FastenerSize): CountersunkDims => COUNTERSUNK[size];

// ---- the receivers: the hole a fastener goes into ----
/** The clearance hole for the shank (mm), in the fit chosen. */
export const clearanceHole = (size: FastenerSize, fit: ClearanceFit): number => CLEARANCE[size][fit];
/** The drill for a threaded hole (mm): the nominal diameter less the pitch (`Optimas` coarse thread chart). Engagement as a setting is not built yet. */
export const tapDrill = (size: FastenerSize): number => round3(nominalDiameter(size) - COUNTERSUNK[size].pitch);
/** The countersink for a countersunk screw: the diameter at the surface (the head's theoretical diameter), the angle (90 degrees) and the depth the cone goes (the head's height). */
export const countersink = (size: FastenerSize): { diameter: number; angle: number; depth: number } => ({ diameter: COUNTERSUNK[size].head.theoretical, angle: 90, depth: COUNTERSUNK[size].headHeight });
/** The pocket for a hex nut, at the nut's own size (the printer's offset is added in the manufacturing version, `dec_parts_tolerance`): across flats, across corners and depth. */
export const nutTrap = (size: FastenerSize): { acrossFlats: number; acrossCorners: number; depth: number } => ({ acrossFlats: NUTS[size].acrossFlats.max, acrossCorners: round3(NUTS[size].acrossFlats.max / Math.cos(Math.PI / 6)), depth: NUTS[size].thickness.max });
/** What the receivers of a size are, in words: the numbers a person drills or draws. */
export function receiversText(size: FastenerSize, family: FastenerFamily): string {
  const c = clearanceHole(size, "fine"), m = clearanceHole(size, "medium"), l = clearanceHole(size, "coarse");
  const base = `clearance hole ${c} / ${m} / ${l} mm (fine / medium / coarse), tap drill ${tapDrill(size)} mm`;
  if (family === "countersunk") { const k = countersink(size); return `${base}, countersink ${k.diameter} mm across at ${k.angle}°, ${k.depth} mm deep`; }
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

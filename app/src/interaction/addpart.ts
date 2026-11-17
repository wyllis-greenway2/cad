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
import { FASTENER_FAMILIES, FASTENER_SIZES, FASTENER_SOURCES, CLEARANCE_FIT_LIST as CLEARANCE_FITS, RECEIVER_KINDS, isFastenerSize, receiversText, makeNut, makeCountersunk, makeWasher, makeSocketHead, countersunkDims, socketHeadDims, clearanceHole, tapHole, chartEngagement, nutTrap, receiverProblem, receiverSteps } from "../operation/fasteners.ts";
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
      { id: "family", label: "Family", type: "choice", value: family, choices: FASTENER_FAMILIES.map((f) => ({ value: f.id, label: `${f.label} (${f.standard})` })), note: `numbers from: ${FASTENER_SOURCES[family]}; placed at the origin, drawn at its nominal size` },
      { id: "size", label: "Size (coarse thread)", type: "choice", value: size, choices: FASTENER_SIZES.map((s) => ({ value: s, label: s })), note: `matches: ${receiversText(size, family)}` },
      ...(family === "countersunk" || family === "socketHead" ? [{ id: "length", label: family === "socketHead" ? "Length under the head (mm)" : "Length from the top of the head (mm)", type: "text" as const, value: v.length, note: family === "socketHead" ? "the standard's length list was not read: any length over 0.5 mm; the part is made at the largest body size" : `the standard's length list was not read: any length over ${Math.round((countersunkDims(size).headHeight + 0.5) * 1000) / 1000} mm; the part is made at nominal size` }] : []),
      ...(family === "socketHead" ? [{ id: "head", label: "Head", type: "choice" as const, value: v.head === "smooth" ? "smooth" : "knurled", choices: [{ value: "knurled", label: `knurled, largest ${socketHeadDims(size).head.max} mm across` }, { value: "smooth", label: `smooth, largest ${socketHeadDims(size).head.smooth} mm across` }], note: "both are in ISO 4762; the counterbore is cut for the wider (knurled) head" }] : []),
    ],
  };
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
export interface ReceiverValues { kind: string; size: string; fit: string; depth: string; dx: string; dy: string; /** a hole to tap: the thread engagement in percent; empty is the chart's tap drill */ engagement?: string }
export const receiverStart = (): ReceiverValues => ({ kind: "clearance", size: "M3", fit: "medium", depth: "", dx: "0", dy: "0", engagement: "" });
const kindOf = (s: string): ReceiverKind => (RECEIVER_KINDS.find((k) => k.id === s)?.id ?? "clearance");
const fitOf = (s: string): ClearanceFit => (s === "fine" || s === "coarse" ? s : "medium");

/** The flat face selected, as a plane with the point the hole is centred on (the middle of the face's box across it) and how far the body reaches through, or why there is none. */
export function selectedFace(session: Session): Result<{ spot: FaceSpot; through: number }> {
  const sc = scene(session);
  const sel = selection(session).map((r) => sc.parts[r]).filter((p): p is NonNullable<typeof p> => !!p);
  const face = sel.length === 1 && sel[0]!.kind === "plane" && sel[0]!.origin === "body" ? sel[0]! : null;
  if (!face || face.kind !== "plane" || face.rounded || face.round || face.curved || !face.mesh?.length) return err("select one flat face of a body first");
  let lo: [number, number] = [Infinity, Infinity], hi: [number, number] = [-Infinity, -Infinity];
  for (let i = 0; i + 2 < face.mesh.length; i += 3) {
    const d: Vec3 = [face.mesh[i]! - face.at[0], face.mesh[i + 1]! - face.at[1], face.mesh[i + 2]! - face.at[2]];
    const [x, y] = [dot(d, face.u), dot(d, face.v)];
    lo = [Math.min(lo[0], x), Math.min(lo[1], y)]; hi = [Math.max(hi[0], x), Math.max(hi[1], y)];
  }
  const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2;
  const centre: Vec3 = [face.at[0] + face.u[0] * cx + face.v[0] * cy, face.at[1] + face.u[1] * cx + face.v[1] * cy, face.at[2] + face.u[2] * cx + face.v[2] * cy];
  const body = Object.values(sc.parts).find((p) => p.kind === "body" && p.ref === face.ref.replace(/\/f@.*$/, "/o"));
  const box = body?.kind === "body" ? body.bbox : undefined;
  const through = box ? Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) : 1000;
  return ok({ spot: { plane: face.ref, centre, u: face.u, v: face.v }, through });
}
export const whyNoReceiver = (session: Session): string | null => { const f = selectedFace(session); return f.ok ? null : f.error; };

export function receiverDialog(v: ReceiverValues): Dialog {
  const kind = kindOf(v.kind);
  const size = isFastenerSize(v.size) ? v.size : "M3";
  const fit = fitOf(v.fit);
  const family: FastenerFamily = kind === "countersunk" ? "countersunk" : kind === "counterbore" ? "socketHead" : "nut";
  return {
    title: "Fastener hole",
    ok: "Cut",
    fields: [
      { id: "kind", label: "Receiver", type: "choice", value: kind, choices: RECEIVER_KINDS.map((k) => ({ value: k.id, label: k.label })) },
      { id: "size", label: "Size (coarse thread)", type: "choice", value: size, choices: FASTENER_SIZES.map((s) => ({ value: s, label: s })), note: `all the receivers: ${receiversText(size, family)}` },
      ...(kind === "tapped" ? [] : [{ id: "fit", label: "Clearance (ISO 273)", type: "choice" as const, value: fit, choices: CLEARANCE_FITS.map((f) => ({ value: f, label: `${f} (${clearanceHole(size, f)} mm)` })) }]),
      ...(kind === "tapped" ? [{ id: "engagement", label: "Thread engagement (%), empty is the chart's drill", type: "text" as const, value: v.engagement ?? "", note: engagementNote(size, v.engagement ?? "") }] : []),
      { id: "depth", label: "Depth (mm), empty goes right through", type: "text", value: v.depth, note: kind === "nutPocket" ? `the pocket is ${nutTrap(size).depth} mm deep, the hole goes on through` : "" },
      { id: "dx", label: "Across the face from its middle (mm)", type: "text", value: v.dx },
      { id: "dy", label: "Up the face from its middle (mm)", type: "text", value: v.dy, note: "the face's own two directions; the sizes are the standard's own, and the printer's offset is added when the part is made for printing" },
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

/** Cut the receiver into the body whose flat face is selected: the steps, one after another from the scene each leaves. */
export function cutReceiver(session: Session, v: ReceiverValues): Result<Session> {
  const face = selectedFace(session);
  if (!face.ok) return face;
  if (!isFastenerSize(v.size)) return err(`${v.size} is not a size this family has`);
  const kind = kindOf(v.kind);
  const depth = v.depth.trim() === "" ? face.value.through : typedLength(v.depth);
  const [dx, dy] = [typedLength(v.dx.trim() === "" ? "0" : v.dx), typedLength(v.dy.trim() === "" ? "0" : v.dy)];
  if (depth === null || dx === null || dy === null) return err("type the depth and the distances as numbers");
  const engagement = engagementOf(v.engagement ?? "");
  if (engagement === null) return err("type the thread engagement as a number of percent");
  const bad = receiverProblem(kind, v.size, fitOf(v.fit), depth, engagement);
  if (bad) return err(bad);
  const sp = face.value.spot;
  const spot: FaceSpot = { ...sp, centre: [sp.centre[0] + sp.u[0] * dx + sp.v[0] * dy, sp.centre[1] + sp.u[1] * dx + sp.v[1] * dy, sp.centre[2] + sp.u[2] * dx + sp.v[2] * dy] };
  const c = oneCommand(scene(session), receiverSteps(kind, v.size, fitOf(v.fit), depth, spot, engagement));
  if (!c.ok) return c;
  const s = run(session, c.value);
  return s.message ? err(s.message) : ok(s);
}

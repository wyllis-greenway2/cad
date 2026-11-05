// The operations that take a number (`dec_interaction_spec`): extrude a closed figure, round or bevel lines of the body, move, rotate or scale the body.
// An operation starts from the selection (the menu or a key), shows its number, and is finished by Enter or a click: that adds ONE step to the scene, so it undoes in one go.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup, nextId } from "../operation/scene.ts";
import type { Part, Plane, PointerView } from "../operation/part.ts";
import { normalOfPlane, pointOf } from "../operation/part.ts";
import type { Command } from "../operation/commands.ts";
import { objectOf } from "./objects.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import { settings } from "../shared/settings.ts";

export type OpKind = "extrude" | "round" | "bevel" | "move" | "rotate" | "scale";
export interface Op {
  kind: OpKind;
  /** the parts it works on: the lines or circle of a figure, the lines of the body, or the body */
  parts: Ref[];
  /** the value typed so far (a string, so "1." and "-" can be typed); empty = use `value` */
  typed: string;
  /** the value from the pointer (extrude) or the default (round, bevel) */
  value: number | null;
  /** move and rotate: 0 = X, 1 = Y, 2 = Z */
  axis: 0 | 1 | 2;
  /** extrude: the figure's middle and the direction along which the distance is measured */
  origin: Vec3 | null;
  normal: Vec3 | null;
}

export const OP_LABEL: Record<OpKind, string> = { extrude: "Extrude", round: "Round", bevel: "Bevel", move: "Move", rotate: "Rotate", scale: "Scale" };
export const OP_UNIT: Record<OpKind, string> = { extrude: "mm", round: "mm", bevel: "mm", move: "mm", rotate: "deg", scale: "x" };
export const OP_FIELD: Record<OpKind, string> = { extrude: "Distance", round: "Size", bevel: "Size", move: "Move", rotate: "Angle", scale: "Factor" };

export type StartResult = { ok: true; op: Op } | { ok: false; why: string };

const centroid = (pts: Vec3[]): Vec3 => scale(pts.reduce((a, p) => add(a, p), [0, 0, 0] as Vec3), 1 / Math.max(1, pts.length));

/** Can this operation start from this selection? Returns the operation, or why not. */
export function startOp(scene: Scene, selection: readonly Ref[], kind: OpKind): StartResult {
  const get = lookup(scene);
  const parts = selection.map((r) => get(r)).filter((p): p is Part => !!p);
  const base: Omit<Op, "parts"> = { kind, typed: "", value: null, axis: kind === "rotate" ? 2 : 0, origin: null, normal: null };
  if (kind === "extrude") {
    const first = parts[0];
    const face = first && (first.kind === "face" ? first : (() => { const o = scene.parts[objectOf(scene, first.ref)]; return o?.kind === "face" ? o : undefined; })());
    if (!face || face.kind !== "face") return { ok: false, why: "select a closed figure first" };
    const pl = face.plane ? get(face.plane) : undefined;
    if (!pl || pl.kind !== "plane") return { ok: false, why: "the figure is not on a plane" };
    const pts = face.corners.map((c) => pointOf(get, c)).filter((p): p is Vec3 => !!p);
    return { ok: true, op: { ...base, parts: face.disk ? [face.disk] : face.loop, origin: centroid(pts), normal: normalOfPlane(pl) } };
  }
  if (kind === "round" || kind === "bevel") {
    const lines = parts.filter((p) => p.kind === "line" && p.origin === "body");
    if (!lines.length || lines.length !== parts.length) return { ok: false, why: "select lines of the body first" };
    return { ok: true, op: { ...base, parts: lines.map((p) => p.ref), value: settings.op.defaultSize } };
  }
  // move, rotate, scale: the whole body
  const body = parts.some((p) => p.kind === "body" || p.origin === "body");
  if (!body) return { ok: false, why: "select the body first (click it three times)" };
  return { ok: true, op: { ...base, parts: [BODY_OBJECT] } };
}

const num = (s: string): number | null => {
  const v = Number(s);
  return s !== "" && s !== "-" && s !== "." && Number.isFinite(v) ? v : null;
};
/** The number the operation will use: what was typed, else the pointer's or default value. */
export const valueOf = (op: Op): number | null => num(op.typed) ?? op.value;

export function typeOp(op: Op, key: string): Op {
  let t = op.typed;
  if (key === "Backspace") t = t.slice(0, -1);
  else if (/^[0-9]$/.test(key)) t += key;
  else if (key === "." && !t.includes(".")) t += t === "" ? "0." : ".";
  else if (key === "-" && t === "") t = "-";
  else if (key === "ArrowUp" || key === "ArrowDown") {
    const step = (op.kind === "round" || op.kind === "bevel" ? settings.op.sizeStep : settings.op.distanceStep) * (key === "ArrowUp" ? 1 : -1);
    const v = Math.round(((valueOf(op) ?? 0) + step) * 1e6) / 1e6;
    return { ...op, typed: "", value: op.kind === "round" || op.kind === "bevel" ? Math.max(step > 0 ? 0 : 0.1, v) : v };
  } else return op;
  return { ...op, typed: t };
}

/** Extrude: the distance along the figure's normal that the pointer's ray comes closest to (the pointer pulls the figure out or pushes it in). */
export function distanceFromPointer(op: Op, pv: PointerView): number | null {
  if (op.kind !== "extrude" || !op.origin || !op.normal || !pv.ray) return null;
  const { o, d } = pv.ray;
  const n = op.normal;
  const w = sub(op.origin, o);
  const b = dot(n, d);
  const den = 1 - b * b;
  if (den < 1e-6) return null; // looking along the normal: the pointer cannot choose a distance
  const t = (b * dot(d, w) - dot(n, w)) / den; // where on origin + t n the line comes closest to the ray
  const step = settings.op.distanceStep;
  const v = Math.round(t / step) * step;
  return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null;
}

/** The step that does it (one command, one undo). Null while there is no number yet. */
export function opCommand(scene: Scene, op: Op): Command | null {
  const v = valueOf(op);
  if (v === null) return null;
  const id = nextId(scene, "s");
  if (op.kind === "extrude") return v === 0 ? null : { type: "addStep", step: { id, type: "extrude", parts: op.parts, params: { depth: v } } };
  if (op.kind === "round" || op.kind === "bevel") return v <= 0 ? null : { type: "addStep", step: { id, type: "edgeMod", parts: op.parts, params: { mode: op.kind === "round" ? "fillet" : "chamfer", value: v } } };
  if (op.kind === "scale") return v <= 0 ? null : { type: "addStep", step: { id, type: "scale", parts: op.parts, params: { axis: 0, value: v } } };
  return v === 0 ? null : { type: "addStep", step: { id, type: op.kind, parts: op.parts, params: { axis: op.axis, value: v } } };
}

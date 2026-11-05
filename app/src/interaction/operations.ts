// The operations that take a number (`dec_interaction_spec`): extrude a closed figure, fillet or chamfer lines of the body (one operation: one way is a fillet, the other a chamfer), move, rotate or scale the body.
// An operation starts from the selection (the menu or a key), shows its number, and is finished by Enter or a click: that adds ONE step to the scene, so it undoes in one go.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup, nextId } from "../operation/scene.ts";
import type { Part, Plane, PointerView } from "../operation/part.ts";
import { normalOfPlane, pointOf } from "../operation/part.ts";
import type { Command } from "../operation/commands.ts";
import { actionsFor } from "./actions.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import { objectOf, bodyCentre } from "./objects.ts";
import { settings } from "../shared/settings.ts";

export type OpKind = "extrude" | "pushpull" | "edge" | "move" | "rotate" | "scale" | "dimension";
export interface Op {
  kind: OpKind;
  /** the parts it works on: the lines or circle of a figure, a face of the body, the lines of the body, the body, or the corners of a drawn figure */
  parts: Ref[];
  /** the value typed so far (a string, so "1." and "-" can be typed); empty = use `value` */
  typed: string;
  /** the value from a handle that is being dragged */
  value: number | null;
  /** move and rotate: 0 = X, 1 = Y, 2 = Z (for a drawn shape: 0 = along the plane's first axis, 1 = along its second) */
  axis: 0 | 1 | 2;
  /** extrude and push / pull: the figure's or face's middle and the direction along which the distance is measured */
  origin: Vec3 | null;
  normal: Vec3 | null;
  /** rotate: the point it turns about (the rotator's centre; you can move it) */
  pivot: Vec3 | null;
  /** move and rotate: the body, or a drawn shape (its corners are `parts`, its plane is `plane`) */
  target: "body" | "shape";
  plane: Ref | null;
  /** the operation came from selecting something (its handle showed up by itself): it ends when the drag does, instead of staying open */
  auto: boolean;
  /** dimension: what the number is called and its unit */
  field?: string;
  unit?: string;
}

export const OP_LABEL: Record<OpKind, string> = { extrude: "Extrude", pushpull: "Push / pull", edge: "Fillet / chamfer", move: "Move", rotate: "Rotate", scale: "Scale", dimension: "Dimension" };
export const OP_UNIT: Record<OpKind, string> = { extrude: "mm", pushpull: "mm", edge: "mm", move: "mm", rotate: "deg", scale: "x", dimension: "mm" };
export const OP_FIELD: Record<OpKind, string> = { extrude: "Distance", pushpull: "Distance", edge: "Fillet", move: "Move", rotate: "Angle", scale: "Factor", dimension: "Value" };

export type StartResult = { ok: true; op: Op } | { ok: false; why: string };

const centroid = (pts: Vec3[]): Vec3 => scale(pts.reduce((a, p) => add(a, p), [0, 0, 0] as Vec3), 1 / Math.max(1, pts.length));

/** The drawn closed figure in this selection (its face), if the selection is exactly that. */
function drawnFace(scene: Scene, parts: Part[]): Extract<Part, { kind: "face" }> | null {
  const first = parts[0];
  if (!first || parts.length !== 1) return null;
  const f = first.kind === "face" ? first : scene.parts[objectOf(scene, first.ref)];
  return f?.kind === "face" && f.origin === "drawn" ? f : null;
}

/** Can this operation start from this selection? Returns the operation, or why not. */
export function startOp(scene: Scene, selection: readonly Ref[], kind: OpKind): StartResult {
  const get = lookup(scene);
  const parts = selection.map((r) => get(r)).filter((p): p is Part => !!p);
  const base: Omit<Op, "parts"> = { kind, typed: "", value: null, axis: kind === "rotate" ? 2 : 0, origin: null, normal: null, pivot: null, target: "body", plane: null, auto: false };
  if (kind === "extrude") {
    const face = drawnFace(scene, parts);
    if (!face) return { ok: false, why: "select a closed figure first" };
    const pl = face.plane ? get(face.plane) : undefined;
    if (!pl || pl.kind !== "plane") return { ok: false, why: "the figure is not on a plane" };
    const pts = face.corners.map((c) => pointOf(get, c)).filter((p): p is Vec3 => !!p);
    return { ok: true, op: { ...base, parts: face.disk ? [face.disk] : face.loop, origin: centroid(pts), normal: normalOfPlane(pl) } };
  }
  if (kind === "pushpull") {
    const f = parts.length === 1 ? parts[0] : undefined;
    if (!f || f.kind !== "plane" || f.origin !== "body" || !f.mesh || f.mesh.length < 9) return { ok: false, why: "select a flat face of the body first" };
    const m = f.mesh;
    const pts: Vec3[] = [];
    for (let i = 0; i + 2 < m.length; i += 3) pts.push([m[i]!, m[i + 1]!, m[i + 2]!]);
    return { ok: true, op: { ...base, parts: [f.ref], origin: centroid(pts), normal: normalOfPlane(f) } };
  }
  if (kind === "edge") {
    const lines = parts.filter((p) => p.kind === "line" && p.origin === "body");
    if (!lines.length || lines.length !== parts.length) return { ok: false, why: "select lines of the body first" };
    return { ok: true, op: { ...base, parts: lines.map((p) => p.ref) } }; // no size yet: drag the double arrow, or type one
  }
  if (kind === "dimension") {
    // measure, then lock: the chip shows the current value of the pair; typing a number locks it (`dec_relations_standard`)
    const a = actionsFor(scene, selection).find((x) => x.dimensional && x.enabled);
    if (!a || !a.unit) return { ok: false, why: "select two parts that can be measured (two corners, a corner and a line, two lines)" };
    return { ok: true, op: { ...base, parts: a.parts, value: a.measure(), field: a.label, unit: a.unit } };
  }
  // move, rotate, scale: the whole body, or (move and rotate) a drawn closed figure
  const body = parts.some((p) => p.kind === "body" || p.origin === "body");
  if (body) return { ok: true, op: { ...base, parts: [BODY_OBJECT], pivot: kind === "rotate" ? bodyCentre(scene) : null } };
  const face = drawnFace(scene, parts);
  if (face && kind !== "scale") {
    const pts = face.corners.map((c) => pointOf(get, c)).filter((p): p is Vec3 => !!p);
    return { ok: true, op: { ...base, parts: face.corners, target: "shape", plane: face.plane, axis: kind === "rotate" ? 2 : 0, pivot: kind === "rotate" ? centroid(pts) : null } };
  }
  return { ok: false, why: kind === "scale" ? "select the body first (click it three times): scale works on the body" : "select the body or a closed figure first" };
}

/**
 * The operation whose handle shows up by itself for this selection, so the common things need no menu: a closed figure shows its arrow to pull it out, a flat face of the body
 * the arrow to push or pull it, the whole body its X Y Z arrows (lines of the body offer fillet / chamfer as a bubble instead, see `modesFor`). Null for anything else.
 */
export function autoOp(scene: Scene, selection: readonly Ref[]): Op | null {
  if (!selection.length) return null;
  const parts = selection.map((r) => scene.parts[r]).filter((p): p is Part => !!p);
  if (parts.length !== selection.length) return null;
  const kind: OpKind | null =
    parts.length === 1 && drawnFace(scene, parts) ? "extrude"
    : parts.length === 1 && parts[0]!.kind === "plane" && parts[0]!.origin === "body" ? "pushpull"
    : parts.length === 1 && parts[0]!.kind === "body" ? "move"
    : null;
  if (!kind) return null;
  const r = startOp(scene, selection, kind);
  return r.ok ? { ...r.op, auto: true } : null;
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
    const step = (op.kind === "edge" ? settings.op.sizeStep : settings.op.distanceStep) * (key === "ArrowUp" ? 1 : -1);
    return { ...op, typed: "", value: Math.round(((valueOf(op) ?? 0) + step) * 1e6) / 1e6 };
  } else return op;
  return { ...op, typed: t };
}

/** The step that does it (one command, one undo). Null while there is no number yet. */
export function opCommand(scene: Scene, op: Op): Command | null {
  const v = valueOf(op);
  if (v === null) return null;
  const id = nextId(scene, "s");
  if (op.kind === "dimension") {
    const a = actionsFor(scene, op.parts).find((x) => x.dimensional && x.enabled);
    return a && v > 0 ? a.run(v) : null;
  }
  if (op.kind === "extrude") return v === 0 ? null : { type: "addStep", step: { id, type: "extrude", parts: op.parts, params: { depth: v } } };
  if (op.kind === "pushpull") return v === 0 ? null : { type: "addStep", step: { id, type: "pushPull", parts: op.parts, params: { depth: v } } };
  // one operation, two results: a positive size is a fillet, a negative one a chamfer of that size (drag the double arrow one way or the other, or type a minus)
  if (op.kind === "edge") return v === 0 ? null : { type: "addStep", step: { id, type: "edgeMod", parts: op.parts, params: { mode: v > 0 ? "fillet" : "chamfer", value: Math.abs(v) } } };
  if (op.kind === "scale") return v <= 0 ? null : { type: "addStep", step: { id, type: "scale", parts: op.parts, params: { axis: 0, value: v } } };
  if (op.target === "shape") return v === 0 ? null : shapeCommand(scene, op, v);
  const pivot: Record<string, number> = op.kind === "rotate" && op.pivot ? { px: op.pivot[0], py: op.pivot[1], pz: op.pivot[2] } : {};
  return v === 0 ? null : { type: "addStep", step: { id, type: op.kind, parts: op.parts, params: { axis: op.axis, value: v, ...pivot } } };
}

/** Moving or turning a drawn figure: its corners go to their new places (one command, so one undo). The solver keeps the relations that still hold. */
function shapeCommand(scene: Scene, op: Op, v: number): Command | null {
  const pl = op.plane ? scene.parts[op.plane] : undefined;
  if (!pl || pl.kind !== "plane") return null;
  const n = normalOfPlane(pl);
  const commands: Command[] = [];
  for (const ref of op.parts) {
    const p = scene.parts[ref];
    if (!p || p.kind !== "corner") continue;
    let to: Vec3;
    if (op.kind === "move") to = add(p.at, scale(op.axis === 1 ? pl.v : pl.u, v));
    else {
      const piv = op.pivot ?? p.at;
      const r = sub(p.at, piv);
      const c = Math.cos((v * Math.PI) / 180);
      const sn = Math.sin((v * Math.PI) / 180);
      const k = [n[1] * r[2] - n[2] * r[1], n[2] * r[0] - n[0] * r[2], n[0] * r[1] - n[1] * r[0]] as Vec3; // n x r
      to = add(piv, add(add(scale(r, c), scale(k, sn)), scale(n, dot(n, r) * (1 - c))));
    }
    commands.push({ type: "movePart", ref, to });
  }
  if (!commands.length) return null;
  // a figure that is moved or turned lets go of what pins it in place: a corner fixed where it was, and (turning) sides held level with the plane's axes
  const corners = new Set(op.parts);
  const sides = new Set(Object.values(scene.parts).filter((p) => p.kind === "line" && corners.has(p.a) && corners.has(p.b)).map((p) => p.ref));
  const pins = op.kind === "rotate" ? ["fixed", "horizontal", "vertical", "sameHeight", "sameAcross"] : ["fixed"];
  const released = scene.relations.filter((r) => pins.includes(r.kind) && r.parts.every((q) => corners.has(q) || sides.has(q)));
  return { type: "batch", commands: [...released.map((r): Command => ({ type: "removeRelation", id: r.id })), ...commands] };
}

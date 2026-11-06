// The operations that take a number (`dec_interaction_spec`): extrude a closed figure, fillet or chamfer lines of the body (one operation: one way is a fillet, the other a chamfer), move, rotate or scale the body.
// An operation starts from the selection (the menu or a key), shows its number, and is finished by Enter or a click: that adds ONE step to the scene, so it undoes in one go.
import type { Ref } from "../shared/ref.ts";
import { edgeDirection } from "./gizmo.ts";
import { patternStart, patternCommand } from "./pattern.ts";
import type { Mat3, Angles } from "../math/rotation.ts";
import { IDENTITY, about, then, anglesOf, stepsBetween } from "../math/rotation.ts";
import type { Curved } from "../operation/part.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup, nextId } from "../operation/scene.ts";
import type { Part, Plane, PointerView } from "../operation/part.ts";
import { normalOfPlane, pointOf } from "../operation/part.ts";
import type { Command } from "../operation/commands.ts";
import { actionsFor } from "./actions.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import { drawnRef } from "../shared/ref.ts";
import { objectOf, bodyCentre, figurePartsOf } from "./objects.ts";
import { settings } from "../shared/settings.ts";

export type OpKind = "extrude" | "pushpull" | "edge" | "move" | "rotate" | "scale" | "dimension" | "linear" | "circular";
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
  /** push / pull, extrude, fillet / chamfer: a step has been made for this operation (more drags and typed numbers replace it, so the value is the total since the operation began) */
  made: boolean;
  /** push / pull and extrude: the size the bubble shows and takes is `base + scale * value` (the thickness of the body along the face and typing the size you want; a round face shows its diameter) */
  dim?: { base: number; scale: number };
  /** push / pull of several flat faces at once: each face's own direction and middle (the first is `normal` and `origin`) */
  faces?: { normal: Vec3; origin: Vec3 }[];
  /** fillet / chamfer: where each edge's arrow stands (the edges themselves are gone once the step is made) */
  edges?: { mid: Vec3; dir: Vec3 }[];
  /** linear and circular repeat: what each field starts as, and what has been typed in it (empty = as it starts); `axis` is the field typing goes to */
  pat: string[];
  patStart?: number[];
  /** rotate the body: the three angles typed so far (X, Y, Z) as the body is to be turned (empty = as it is now) */
  rot: [string, string, string];
  /** push / pull of a round face: the face (the radius changes by the distance) */
  curved?: Curved;
  /** rotate: the point it turns about (the rotator's centre; you can move it) */
  pivot: Vec3 | null;
  /** move and rotate: the body, or a drawn shape (its corners are `parts`, its plane is `plane`) */
  target: "body" | "shape" | "plane";
  plane: Ref | null;
  /** the operation came from selecting something (its handle showed up by itself): it ends when the drag does, instead of staying open */
  auto: boolean;
  /** dimension: what the number is called and its unit */
  field?: string;
  unit?: string;
}

export const OP_UNIT: Record<OpKind, string> = { extrude: "mm", pushpull: "mm", edge: "mm", move: "mm", rotate: "deg", scale: "x", dimension: "mm", linear: "mm", circular: "mm" };
export const OP_FIELD: Record<OpKind, string> = { extrude: "Distance", pushpull: "Distance", edge: "Fillet", move: "Move", rotate: "Angle", scale: "Factor", linear: "Repeat", circular: "Repeat", dimension: "Value" };

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
  const base: Omit<Op, "parts"> = { kind, typed: "", value: null, axis: kind === "rotate" ? 2 : 0, origin: null, normal: null, pivot: null, target: "body", plane: null, auto: false, made: false, rot: ["", "", ""], pat: [] };
  if (kind === "extrude") {
    const face = drawnFace(scene, parts);
    if (!face) return { ok: false, why: "select a closed figure first" };
    const pl = face.plane ? get(face.plane) : undefined;
    if (!pl || pl.kind !== "plane") return { ok: false, why: "the figure is not on a plane" };
    const pts = face.corners.map((c) => pointOf(get, c)).filter((p): p is Vec3 => !!p);
    return { ok: true, op: { ...base, parts: face.disk ? [face.disk] : face.loop, origin: centroid(pts), normal: normalOfPlane(pl), dim: { base: 0, scale: 1 } } };
  }
  if (kind === "pushpull" && drawnFace(scene, parts)) return startOp(scene, selection, "extrude"); // a sketch plane is pushed or pulled by extruding it: the same operation
  if (kind === "pushpull" && parts.length > 1) {
    // several flat faces of the body: each moves along its own normal by the same distance
    const flat = parts.filter((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !p.curved && !p.rounded && !!p.mesh && p.mesh.length >= 9);
    if (flat.length !== parts.length) return { ok: false, why: "select flat faces of the body" };
    const faces = flat.map((f) => {
      const m = f.mesh!;
      const pts: Vec3[] = [];
      for (let i = 0; i + 2 < m.length; i += 3) pts.push([m[i]!, m[i + 1]!, m[i + 2]!]);
      return { normal: normalOfPlane(f), origin: centroid(pts) };
    });
    return { ok: true, op: { ...base, parts: flat.map((f) => f.ref), origin: faces[0]!.origin, normal: faces[0]!.normal, faces } };
  }
  if (kind === "pushpull") {
    const f = parts.length === 1 ? parts[0] : undefined;
    if (!f || f.kind !== "plane" || f.origin !== "body" || !f.mesh || f.mesh.length < 9) return { ok: false, why: "select a flat face of the body first" };
    if (f.rounded) return { ok: false, why: "this curved face can be selected but not pushed or pulled yet (only round posts and holes along an axis)" };
    if (f.curved) {
      // a round face: the arrow stands out of its surface (a post) or into the hole, in the middle of its height; pulling adds material, which changes the radius
      const c = f.curved;
      const e = [0, 1, 2].filter((i) => i !== c.axis);
      const radial: [number, number, number] = [0, 0, 0];
      radial[e[0]!] = c.convex ? 1 : -1;
      const at: [number, number, number] = [...c.center];
      at[c.axis] = (c.lo + c.hi) / 2;
      at[e[0]!] = at[e[0]!]! + c.radius; // the surface point on the +e side; the arrow points out of it for a post and into the hole's axis for a hole
      return { ok: true, op: { ...base, parts: [f.ref], origin: at, normal: radial, curved: c, dim: { base: 2 * c.radius, scale: c.convex ? 2 : -2 } } };
    }
    const m = f.mesh;
    const pts: Vec3[] = [];
    for (let i = 0; i + 2 < m.length; i += 3) pts.push([m[i]!, m[i + 1]!, m[i + 2]!]);
    const n = normalOfPlane(f);
    // the size across the body along the face's normal: from its far side to this face (typing 20 makes a 20 mm block however far the face is now)
    const along = Object.values(scene.parts).filter((p) => p.kind === "corner" && p.origin === "body").map((p) => dot(n, (p as { at: Vec3 }).at));
    const thickness = along.length ? Math.max(...along) - Math.min(...along) : 0;
    return { ok: true, op: { ...base, parts: [f.ref], origin: centroid(pts), normal: n, dim: { base: Math.round(thickness * 1e6) / 1e6, scale: 1 } } };
  }
  if (kind === "edge") {
    const lines = parts.filter((p) => p.kind === "line" && p.origin === "body");
    if (!lines.length || lines.length !== parts.length) return { ok: false, why: "select lines of the body first" };
    const edges = lines.flatMap((l) => {
      if (l.kind !== "line") return [];
      const [pa, pb] = [get(l.a), get(l.b)];
      return pa?.kind === "corner" && pb?.kind === "corner" ? [{ mid: add(pa.at, scale(sub(pb.at, pa.at), 0.25)), dir: edgeDirection(scene, pa.at, pb.at) }] : [];
    });
    return { ok: true, op: { ...base, parts: lines.map((p) => p.ref), edges } }; // no size yet: drag the double arrow, or type one
  }
  if (kind === "linear" || kind === "circular") {
    // what is selected is repeated: a drawn figure (its parts and the plane's), else the body; the numbers start as a first try and the result shows at once
    const face = drawnFace(scene, parts);
    const circle = face?.disk ? get(face.disk) : undefined;
    const figure: Ref[] | null = face ? figurePartsOf(scene, face) : null;
    const st = patternStart(scene, kind, figure);
    if (!st) return { ok: false, why: "select the body or a closed figure first" };
    return { ok: true, op: { ...base, parts: st.parts, target: st.target, plane: face?.plane ?? null, patStart: st.start, pat: st.start.map(() => "") } };
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
  if (face && kind === "scale") {
    // a drawn figure is made bigger or smaller about its middle: its corners go in or out, a circle's radius changes
    const pl = face.plane ? get(face.plane) : undefined;
    if (!pl || pl.kind !== "plane") return { ok: false, why: "the figure is not on a plane" };
    const circle = face.disk ? get(face.disk) : undefined;
    const centre = circle?.kind === "circle" ? pointOf(get, circle.center) : centroid(face.corners.map((c) => pointOf(get, c)).filter((p): p is Vec3 => !!p));
    return { ok: true, op: { ...base, parts: face.disk ? [face.disk] : face.corners, target: "shape", plane: face.plane, pivot: centre } };
  }
  if (face) {
    // a drawn figure moves and turns like an object (`in_135`): X Y Z arrows, X Y Z rings, with its plane (the figure's parts and the plane they lie on)
    const circle = face.disk ? get(face.disk) : undefined;
    const figure: Ref[] = figurePartsOf(scene, face);
    const pts = figure.map((c) => pointOf(get, c)).filter((p): p is Vec3 => !!p);
    return { ok: true, op: { ...base, parts: figure, target: "plane", plane: face.plane, axis: kind === "rotate" ? 2 : 0, pivot: kind === "rotate" ? centroid(pts) : null } };
  }
  return { ok: false, why: kind === "scale" ? "select the body first (click it three times): scale works on the body" : "select the body or a closed figure first" };
}

/**
 * The operation whose handle shows up by itself for this selection, so the common things need no menu (`in_135`): a closed figure shows its arrow to pull it out, a face of the body
 * the arrow to push or pull it, lines of the body the double arrow of a fillet or chamfer, the whole body its X Y Z arrows. Null for anything else.
 */
export function autoOp(scene: Scene, selection: readonly Ref[]): Op | null {
  if (!selection.length) return null;
  const parts = selection.map((r) => scene.parts[r]).filter((p): p is Part => !!p);
  if (parts.length !== selection.length) return null;
  const flatBody = parts.every((p) => p.kind === "plane" && p.origin === "body" && !p.rounded);
  const kind: OpKind | null =
    parts.length === 1 && drawnFace(scene, parts) ? "extrude"
    : flatBody ? "pushpull"
    : parts.every((p) => p.kind === "line" && p.origin === "body") ? "edge"
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
export const valueOf = (op: Op): number | null => {
  const t = num(op.typed);
  // a typed size is the size you want: how far to move is what is missing from the size now
  return t !== null && op.dim ? (t - op.dim.base) / op.dim.scale : t ?? op.value;
};
/** The size the bubble shows for a push / pull or an extrude: what the body measures now along the face (or the diameter), with the distance so far. */
export const sizeShown = (op: Op): number | null => (op.dim ? op.dim.base + op.dim.scale * (valueOf(op) ?? 0) : null);

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
/** The face a push / pull works on, as numbers kept in the step: the body is changed by later steps (another push, a turn) so its named faces move, but this step always meant the face as it was. */
const faceParams = (op: Op): Record<string, number> => {
  const n = op.normal;
  const p = op.origin;
  const c = op.curved;
  if (c && n && p) return { cax: c.axis, ccx: c.center[0], ccy: c.center[1], ccz: c.center[2], cr: c.radius, clo: c.lo, chi: c.hi, cconvex: c.convex ? 1 : 0 };
  return n && p ? { nx: n[0], ny: n[1], nz: n[2], fd: n[0] * p[0] + n[1] * p[1] + n[2] * p[2], px: p[0], py: p[1], pz: p[2] } : {};
};

/** How the body is turned now: every rotate step so far, one after another (a move or a push does not change it). */
function bodyTurn(scene: Scene): Mat3 {
  let m: Mat3 = IDENTITY;
  for (const st of scene.steps) if (st.type === "rotate") m = then(m, about(Number(st.params.axis ?? 0) as 0 | 1 | 2, Number(st.params.value ?? 0)));
  return m;
}
/** The three angles of the body's turn, with the turn being dragged or typed on top of it (what the bubble shows and sets). */
export function turnAngles(scene: Scene, op: Op): Angles {
  const live = valueOf(op);
  const now = op.target === "plane" ? planeTurn(scene, op) : bodyTurn(scene);
  return anglesOf(live !== null && (op.target === "body" || op.target === "plane") ? then(now, about(op.axis, live)) : now);
}
/** How a drawn figure's plane is turned: the turn that takes the world axes onto its directions (its first, its second and its normal). */
function planeTurn(scene: Scene, op: Op): Mat3 {
  const first = op.parts.map((r) => scene.parts[r]).find((p) => p?.kind === "corner");
  const pl = first?.plane ? scene.parts[first.plane] : undefined;
  if (!pl || pl.kind !== "plane") return IDENTITY;
  const [u, v, n] = [pl.u, pl.v, normalOfPlane(pl)];
  return [u[0], v[0], n[0], u[1], v[1], n[1], u[2], v[2], n[2]];
}
/** Moving or turning a drawn figure with its plane: `transformFigure`, and the corners it pinned in place let go (one command, so one undo). */
function figureCommand(scene: Scene, op: Op, turns: { axis: 0 | 1 | 2; angle: number }[], translate: Vec3): Command | null {
  const first = op.parts.map((r) => scene.parts[r]).find((p) => p?.kind === "corner");
  if (!first?.plane) return null;
  const corners = new Set(op.parts.filter((r) => scene.parts[r]?.kind === "corner"));
  const pivot = op.pivot ?? centroid(op.parts.map((r) => scene.parts[r]).filter((p): p is Extract<Part, { kind: "corner" }> => p?.kind === "corner").map((p) => p.at));
  const released = scene.relations.filter((r) => r.kind === "fixed" && r.parts.every((q) => corners.has(q)));
  return { type: "batch", commands: [...released.map((r): Command => ({ type: "removeRelation", id: r.id })), { type: "transformFigure", parts: op.parts, plane: first.plane, newPlane: drawnRef(nextId(scene, "p")), turns, pivot, translate }] };
}
const rotTarget = (scene: Scene, op: Op): Angles => { const cur = turnAngles(scene, op); return cur.map((c, i) => (num(op.rot[i]!) ?? c)) as Angles; };

export function opCommand(scene: Scene, op: Op): Command | null {
  if (op.kind === "linear" || op.kind === "circular") return patternCommand(scene, op);
  if (op.kind === "rotate" && op.target === "plane" && op.rot.some((t) => num(t) !== null)) {
    // angles typed for a figure: it is turned to exactly those, about its pivot
    const steps = stepsBetween(planeTurn(scene, op), rotTarget(scene, { ...op, value: null, typed: "" }));
    return steps.length ? figureCommand(scene, op, steps.map((t) => ({ axis: t.axis, angle: t.angle })), [0, 0, 0]) : null;
  }
  if (op.kind === "rotate" && op.target === "body" && op.rot.some((t) => num(t) !== null)) {
    // angles typed in the bubble: the body is turned to exactly those (as three turns about X, Y, Z that go from how it is turned now), one command
    const id = nextId(scene, "s");
    const pivot: Record<string, number> = op.pivot ? { px: op.pivot[0], py: op.pivot[1], pz: op.pivot[2] } : {};
    const steps = stepsBetween(bodyTurn(scene), rotTarget(scene, { ...op, value: null, typed: "" }));
    if (!steps.length) return null;
    return { type: "batch", commands: steps.map((t, k): Command => ({ type: "addStep", step: { id: `${id}${"xyz"[t.axis]}${k}`, type: "rotate", parts: op.parts, params: { axis: t.axis, value: t.angle, ...pivot } } })) };
  }
  const v = valueOf(op);
  if (v === null) return null;
  const id = nextId(scene, "s");
  if (op.kind === "dimension") {
    const a = actionsFor(scene, op.parts).find((x) => x.dimensional && x.enabled);
    return a && v > 0 ? a.run(v) : null;
  }
  if (op.kind === "extrude") return v === 0 ? null : { type: "addStep", step: { id, type: "extrude", parts: op.parts, params: { depth: v } } };
  if (op.kind === "pushpull" && op.faces && op.faces.length > 1) {
    if (v === 0) return null;
    return { type: "batch", commands: op.faces.map((f, k): Command => ({ type: "addStep", step: { id: `${id}f${k}`, type: "pushPull", parts: [op.parts[k]!], params: { depth: v, ...faceParams({ ...op, normal: f.normal, origin: f.origin }) } } })) };
  }
  if (op.kind === "pushpull") return v === 0 ? null : { type: "addStep", step: { id, type: "pushPull", parts: op.parts, params: { depth: v, ...faceParams(op) } } };
  // one operation, two results: a positive size is a fillet, a negative one a chamfer of that size (drag the double arrow one way or the other, or type a minus)
  if (op.kind === "edge") return v === 0 ? null : { type: "addStep", step: { id, type: "edgeMod", parts: op.parts, params: { mode: v > 0 ? "fillet" : "chamfer", value: Math.abs(v) } } };
  if (op.kind === "scale" && op.target === "shape") return v <= 0 ? null : scaleShapeCommand(scene, op, v);
  if (op.kind === "scale") return v <= 0 ? null : { type: "addStep", step: { id, type: "scale", parts: op.parts, params: { axis: 0, value: v } } };
  if (op.target === "plane") {
    if (v === 0) return null;
    return op.kind === "rotate" ? figureCommand(scene, op, [{ axis: op.axis, angle: v }], [0, 0, 0]) : figureCommand(scene, op, [], scale(([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[])[op.axis]!, v));
  }
  const pivot: Record<string, number> = op.kind === "rotate" && op.pivot ? { px: op.pivot[0], py: op.pivot[1], pz: op.pivot[2] } : {};
  return v === 0 ? null : { type: "addStep", step: { id, type: op.kind, parts: op.parts, params: { axis: op.axis, value: v, ...pivot } } };
}

/** Scaling a drawn figure by a factor about its middle: corners move to scaled places, a circle gets a scaled radius. What fixes a size (fixed corners, lengths, diameters) is let go, as for moving. */
function scaleShapeCommand(scene: Scene, op: Op, f: number): Command | null {
  const centre = op.pivot;
  if (!centre) return null;
  const commands: Command[] = [];
  const held = new Set<string>(op.parts);
  for (const ref of op.parts) {
    const p = scene.parts[ref];
    if (p?.kind === "corner") commands.push({ type: "movePart", ref, to: add(centre, scale(sub(p.at, centre), f)) });
    else if (p?.kind === "circle") { commands.push({ type: "setRadius", ref, radius: Math.round(p.radius * f * 1e6) / 1e6 }); held.add(p.center); }
  }
  if (!commands.length) return null;
  const sides = new Set(Object.values(scene.parts).filter((p) => p.kind === "line" && held.has(p.a) && held.has(p.b)).map((p) => p.ref));
  const sizes = ["fixed", "length", "distance", "diameter", "equalRadius", "angle"];
  const released = scene.relations.filter((r) => sizes.includes(r.kind) && r.parts.every((q) => held.has(q) || sides.has(q)));
  return { type: "batch", commands: [...released.map((r): Command => ({ type: "removeRelation", id: r.id })), ...commands] };
}

/** Operations that make one step and then change it as you drag or type again, until you click away: the value is the total since the operation began. */
export const isLive = (op: Op): boolean => !op.auto && (op.kind === "extrude" || op.kind === "pushpull" || op.kind === "edge");

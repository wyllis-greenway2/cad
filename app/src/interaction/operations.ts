// The operations that take a number (`dec_interaction_spec`): extrude a closed figure, fillet or chamfer lines of the body (one operation: one way is a fillet, the other a chamfer), move, rotate or scale the body.
// An operation starts from the selection (the menu or a key), shows its number, and is finished by Enter or a click: that adds ONE step to the scene, so it undoes in one go.
import { typedNumber } from "../shared/numbers.ts";
import type { Ref } from "../shared/ref.ts";
import { edgeDirection, moveCentre, moveOffset } from "./gizmo.ts";
import { patternStart, patternCommand } from "./pattern.ts";
import type { Mat3, Angles } from "../math/rotation.ts";
import { IDENTITY, about, then, anglesOf, stepsBetween } from "../math/rotation.ts";
import { motionOf, laterMotion, applyPoint } from "../operation/frames.ts";
import { sharpOfPoints, chainOf, roundingFaces, circleOfRim } from "../operation/roundings.ts";
import type { Sharp, SharpEdge } from "../operation/roundings.ts";
import type { Rigid } from "../operation/frames.ts";
import type { Curved } from "../operation/part.ts";
import type { FaceEdit } from "./faceedit.ts";
import type { OffsetSource } from "./offset.ts";
import { offsetSource, offsetCommand } from "./offset.ts";
import { faceEdit, editCommand, arcRadiusCommand } from "./faceedit.ts";
import { faceEdges } from "./offsetbody.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup, nextId, figureParams, figureRefs } from "../operation/scene.ts";
import { rimRanks, edgeSignatures } from "../operation/rims.ts";
import { consumed } from "../operation/ownership.ts";
import type { Figure } from "../operation/scene.ts";
import type { Part, Plane, PointerView } from "../operation/part.ts";
import { normalOfPlane, pointOf, curveMid, circumcentre } from "../operation/part.ts";
import type { Command } from "../operation/commands.ts";
import { apply } from "../operation/commands.ts";
import { solveScene } from "../compiler/solve.ts";
import { actionsFor, measureAction } from "./actions.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import { drawnRef } from "../shared/ref.ts";
import { objectOf, bodyCentre, figurePartsOf } from "./objects.ts";
import { settings } from "../shared/settings.ts";

export type OpKind = "extrude" | "pushpull" | "offset" | "edge" | "move" | "rotate" | "scale" | "dimension" | "linear" | "circular" | "copy";
export interface Op {
  kind: OpKind;
  /** the parts it works on: the lines or circle of a figure, a face of the body, the lines of the body, the body, or the corners of a drawn figure */
  parts: Ref[];
  /** the value typed so far (a string, so "1." and "-" can be typed); empty = use `value` */
  typed: string;
  /** the value from a handle that is being dragged */
  value: number | null;
  /** move: where the arrows stood as it began, and how many steps there were (`moveOffset`): the position the bubble shows is how far it has gone since, over all its drags (`in_230`) */
  from?: Vec3;
  stepsAt?: number;
  /** move: how far it had gone along the axis when a number began to be typed (what is typed is the position, so the step is what is missing) */
  typedBase?: number;
  /** move and rotate: 0 = X, 1 = Y, 2 = Z (for a drawn shape: 0 = along the plane's first axis, 1 = along its second) */
  axis: 0 | 1 | 2;
  /** fillet / chamfer: which of the round rims sharing a centre each edge is (`rimRanks`), so that the step finds it again when sizes change */
  ranks?: string;
  /** fillet / chamfer: the two flat faces each straight edge lies between (`edgeSignatures`) */
  sigs?: string;
  /** extrude: the step's params for the figures drawn inside the one extruded (holes in it) and for sibling figures extruded with it */
  figs?: Record<string, string>;
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
  /** a repeat reopened: the record (a repeat of a drawn figure) or the step (a repeat of the body) whose numbers it sets again (`in_257`) */
  editPattern?: string;
  /** a move of the whole body by a vector, from dragging the body free (`in_291`): one step that moves it all the way; the arrows' single axis is not used */
  free?: Vec3;
  /** a move, turn or scale of one body of several: whose sketches go with it (its name; "-": none) */
  carryOnly?: string;
  editStep?: string;
  patStart?: number[];
  /** linear repeat: the direction the helper bubbles stand on (`in_236`) */
  along?: 0 | 1 | 2;
  /** rotate the body: the three angles typed so far (X, Y, Z) as the body is to be turned (empty = as it is now) */
  rot: [string, string, string];
  /** push / pull of a round face: the face (the radius changes by the distance) */
  curved?: Curved;
  /** a round wall turned about a tilted axis (a turned body): where the axis is (`in_224`) */
  roundAxis?: { center: Vec3; dir: Vec3 };
  /** offset: the drawn figure the copy is made from */
  off?: OffsetSource;
  /** push / pull of a face the body already has: the step to change instead of adding a prism (`faceedit.ts`) */
  edit?: FaceEdit;
  /** a fillet or chamfer face: there is no prism to fall back on */
  rounded?: boolean;
  /** this time make the prism instead (the step that made the face could not take the size) */
  noEdit?: boolean;
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

export const OP_UNIT: Record<OpKind, string> = { extrude: "mm", pushpull: "mm", offset: "mm", edge: "mm", move: "mm", rotate: "deg", scale: "x", dimension: "mm", linear: "mm", circular: "mm", copy: "mm" };
export const OP_FIELD: Record<OpKind, string> = { extrude: "Distance", pushpull: "Distance", offset: "Offset", edge: "Fillet", move: "Move", rotate: "Angle", scale: "Factor", linear: "Repeat", circular: "Repeat", copy: "Repeat", dimension: "Value" };

export type StartResult = { ok: true; op: Op } | { ok: false; why: string };

const centroid = (pts: Vec3[]): Vec3 => scale(pts.reduce((a, p) => add(a, p), [0, 0, 0] as Vec3), 1 / Math.max(1, pts.length));

/** The drawn closed figure in this selection (its face), if the selection is exactly that. */
/** The drawn closed figures selected, when they are all on one plane (a sibling figure, or one inside another, is extruded together with it). */
function drawnFaces(scene: Scene, parts: Part[]): Extract<Part, { kind: "face" }>[] {
  const faces = parts.map((p) => drawnFace(scene, [p]));
  const all = faces.filter((f): f is Extract<Part, { kind: "face" }> => !!f);
  return all.length === parts.length && all.length > 0 && all.every((f) => f.plane === all[0]!.plane) ? all : [];
}

function drawnFace(scene: Scene, parts: Part[]): Extract<Part, { kind: "face" }> | null {
  const first = parts[0];
  if (!first || parts.length !== 1) return null;
  const f = first.kind === "face" ? first : scene.parts[objectOf(scene, first.ref)];
  return f?.kind === "face" && f.origin === "drawn" ? f : null;
}

/** Whatever drawn things are selected, as the parts that move and repeat together: a figure's corners, lines and circle, a selected line with its ends (and an arc's centre), a circle with its centre, a corner. Empty if anything selected is not drawn. */
function drawnFigure(scene: Scene, parts: Part[]): Ref[] {
  const out = new Set<Ref>();
  for (const p of parts) {
    if (p.origin !== "drawn") return [];
    if (p.kind === "face") figurePartsOf(scene, p).forEach((r) => out.add(r));
    else if (p.kind === "line") { out.add(p.ref); out.add(p.a); out.add(p.b); if (p.center) out.add(p.center); }
    else if (p.kind === "circle") { out.add(p.ref); out.add(p.center); }
    else if (p.kind === "corner") out.add(p.ref);
    else return [];
  }
  return [...out].filter((r) => scene.parts[r]);
}

/** Can this operation start from this selection? Returns the operation, or why not. */
/** The axes the view is straight along and across (`viewAxes`): a body's move starts along the one across the screen, its turn and a circular repeat about the one at the eye, a linear repeat along the one across (`in_244`). */
export interface ViewAxes { normal: 0 | 1 | 2; right: 0 | 1 | 2 }
export function startOp(scene: Scene, selection: readonly Ref[], kind: OpKind, view: ViewAxes | null = null): StartResult {
  const r = startOpBare(scene, selection, kind, view);
  if (!r.ok || r.op.kind !== "move" || (r.op.target !== "body" && r.op.target !== "plane")) return r;
  const from = moveCentre(scene, r.op);
  return from ? { ...r, op: { ...r.op, from, stepsAt: scene.steps.length } } : r;
}
function startOpBare(scene: Scene, selection: readonly Ref[], kind: OpKind, view: ViewAxes | null): StartResult {
  const get = lookup(scene);
  const parts = selection.map((r) => get(r)).filter((p): p is Part => !!p);
  // a piece of a figure that lines cut up shares its sides with the other pieces: it can be extruded (or offset nowhere), but moved, turned, scaled or repeated only by selecting the lines and points themselves
  // (an offset only reads the piece's outline and draws a new figure beside it, so a piece can be offset, `in_232`)
  if (["move", "rotate", "scale", "linear", "circular", "copy"].includes(kind) && parts.some((p) => p.kind === "face" && p.pieces)) return { ok: false, why: "this is one piece of a shape cut by lines, and it shares its sides with the other pieces: select the lines and points to move, turn, scale or repeat them (or extrude the piece)" };
  const base: Omit<Op, "parts"> = { kind, typed: "", value: null, axis: kind === "rotate" ? view?.normal ?? 2 : kind === "move" ? view?.right ?? 0 : 0, origin: null, normal: null, pivot: null, target: "body", plane: null, auto: false, made: false, rot: ["", "", ""], pat: [] };
  if (kind === "offset") {
    const off = offsetSource(scene, parts);
    if (!off) return { ok: false, why: "select a closed figure (straight sides or arcs), a circle, a line or a chain of sides, or the edges (or the face) of a flat face of the body, to offset" };
    return { ok: true, op: { ...base, parts: parts.map((p) => p.ref), origin: off.origin, normal: off.normal, off } };
  }
  if (kind === "extrude") {
    const faces = drawnFaces(scene, parts);
    const face = faces[0];
    if (!face) return { ok: false, why: "select a closed figure first" };
    const pl = face.plane ? get(face.plane) : undefined;
    if (!pl || pl.kind !== "plane") return { ok: false, why: "the figure is not on a plane" };
    const pts = face.corners.map((c) => pointOf(get, c)).filter((p): p is Vec3 => !!p);
    return { ok: true, op: { ...base, parts: face.disk ? [face.disk] : face.loop, figs: { ...figureParams(faces.map((f) => figureOf(scene, f))), ...(faces.some((f) => f.pieces) ? { cut: "1" } : {}) }, origin: centroid(pts), normal: normalOfPlane(pl), dim: { base: 0, scale: 1 } } };
  }
  if (kind === "pushpull" && drawnFaces(scene, parts).length) return startOp(scene, selection, "extrude"); // a sketch plane is pushed or pulled by extruding it: the same operation
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
    if (f.rounded && f.round && f.radius && faceEdit(scene, f.ref)?.kind === "radius") {
      // a piece of a round wall (cut from a circle): the arrow stands on it, out of a post or into a hole, and pulling changes the circle's radius
      const m = f.mesh;
      const tris: Vec3[] = [];
      for (let i = 0; i + 8 < m.length; i += 9) tris.push(scale(add(add([m[i]!, m[i + 1]!, m[i + 2]!], [m[i + 3]!, m[i + 4]!, m[i + 5]!]), [m[i + 6]!, m[i + 7]!, m[i + 8]!]), 1 / 3));
      const mid = centroid(tris);
      const rd = f.round!;
      const axisDir: Vec3 = rd.dir ?? (rd.axis === 0 ? [1, 0, 0] : rd.axis === 1 ? [0, 1, 0] : [0, 0, 1]);
      const radial = (q: Vec3): Vec3 => { const o = sub(q, rd.center); const d = sub(o, scale(axisDir, dot(o, axisDir))); const l = Math.hypot(...d); return l < 1e-9 ? [1, 0, 0] : scale(d, (rd.convex ? 1 : -1) / l); };
      const at = tris.reduce((b, q) => (Math.hypot(...sub(q, mid)) < Math.hypot(...sub(b, mid)) ? q : b), tris[0]!);
      const edit = faceEdit(scene, f.ref)!;
      return { ok: true, op: { ...base, parts: [f.ref], origin: at, normal: radial(at), ...(rd.dir ? { rounded: true, roundAxis: { center: rd.center, dir: rd.dir } } : { curved: { axis: rd.axis, center: rd.center, radius: f.radius, lo: 0, hi: 0, convex: rd.convex } }), edit, dim: { base: 2 * f.radius, scale: f.round.convex ? 2 : -2 } } };
    }
    if (f.rounded) {
      // a fillet or chamfer face: pulling it (out, towards the sharp corner) makes the rounding smaller, pushing it makes it bigger: the size of the step that made it
      const edit = faceEdit(scene, f.ref);
      if (!edit || edit.kind !== "edgeSize") return { ok: false, why: "this curved face can be selected but not pushed or pulled yet (only round posts and holes along an axis, and fillets and chamfers)" };
      const m = f.mesh;
      const pts: Vec3[] = [];
      for (let i = 0; i + 2 < m.length; i += 3) pts.push([m[i]!, m[i + 1]!, m[i + 2]!]);
      const mid = centroid(pts);
      const body = Object.values(scene.parts).filter((p): p is Extract<Part, { kind: "corner" }> => p.kind === "corner" && p.origin === "body").map((p) => p.at);
      const middle = body.length ? centroid(body) : ([0, 0, 0] as Vec3);
      // the arrow stands ON the face (the middle of a ring-shaped chamfer round a post is in the air, on the axis): at the triangle nearest the face's middle, pointing along that triangle's normal, turned away from the middle of the body
      let best: { at: Vec3; n: Vec3; d: number } | null = null;
      for (let i = 0; i + 8 < m.length; i += 9) {
        const a: Vec3 = [m[i]!, m[i + 1]!, m[i + 2]!];
        const b: Vec3 = [m[i + 3]!, m[i + 4]!, m[i + 5]!];
        const c: Vec3 = [m[i + 6]!, m[i + 7]!, m[i + 8]!];
        const t = cross(sub(b, a), sub(c, a));
        const g = scale(add(add(a, b), c), 1 / 3);
        const d = Math.hypot(...sub(g, mid));
        if (Math.hypot(...t) < 1e-12 || (best && d >= best.d)) continue;
        best = { at: g, n: dot(t, sub(g, middle)) < 0 ? scale(t, -1) : t, d };
      }
      if (!best) return { ok: false, why: "this curved face has no direction to push along" };
      const at = best.at, nsum = best.n;
      const len = Math.hypot(...nsum);
      return { ok: true, op: { ...base, parts: [f.ref], origin: at, normal: scale(nsum, 1 / len), edit, rounded: true, dim: { base: edit.value, scale: -1 } } };
    }
    if (f.curved) {
      // a round face: the arrow stands out of its surface (a post) or into the hole, in the middle of its height; pulling adds material, which changes the radius
      const c = f.curved;
      const e = [0, 1, 2].filter((i) => i !== c.axis);
      const radial: [number, number, number] = [0, 0, 0];
      radial[e[0]!] = c.convex ? 1 : -1;
      const at: [number, number, number] = [...c.center];
      at[c.axis] = (c.lo + c.hi) / 2;
      at[e[0]!] = at[e[0]!]! + c.radius; // the surface point on the +e side; the arrow points out of it for a post and into the hole's axis for a hole
      return { ok: true, op: { ...base, parts: [f.ref], origin: at, normal: radial, curved: c, edit: faceEdit(scene, f.ref) ?? undefined, dim: { base: 2 * c.radius, scale: c.convex ? 2 : -2 } } };
    }
    const m = f.mesh;
    const pts: Vec3[] = [];
    for (let i = 0; i + 2 < m.length; i += 3) pts.push([m[i]!, m[i + 1]!, m[i + 2]!]);
    const n = normalOfPlane(f);
    const edit = faceEdit(scene, f.ref) ?? undefined;
    // the size across the body along the face's normal: from its far side to this face (typing 20 makes a 20 mm block however far the face is now)
    const along = Object.values(scene.parts).filter((p) => p.kind === "corner" && p.origin === "body").map((p) => dot(n, (p as { at: Vec3 }).at));
    const thickness = along.length ? Math.max(...along) - Math.min(...along) : 0;
    return { ok: true, op: { ...base, parts: [f.ref], origin: centroid(pts), normal: n, edit, ...(edit?.kind === "edgeSize" ? { rounded: true } : {}), dim: edit?.kind === "edgeSize" ? { base: edit.value, scale: -1 } : { base: Math.round(thickness * 1e6) / 1e6, scale: 1 } } };
  }
  if (kind === "edge") {
    // faces of the body stand for their edges (`in_257`, `dec_selection_tools`): every edge on the boundary of a selected face is rounded or bevelled, as if the edges had been selected one by one
    const faces = parts.filter((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !!p.mesh && p.mesh.length >= 9 && !p.rounded);
    const own = parts.filter((p) => p.kind === "line" && p.origin === "body");
    if (!own.length && !faces.length) return { ok: false, why: "select lines or flat faces of the body first" };
    if (own.length + faces.length !== parts.length) return { ok: false, why: "select lines or flat faces of the body first" };
    const seen = new Set<Ref>(own.map((l) => l.ref));
    const lines: Part[] = [...own];
    for (const f of faces) for (const r of faceEdges(scene, f)) { const l = get(r); if (l && !seen.has(r)) { seen.add(r); lines.push(l); } }
    if (!lines.length) return { ok: false, why: "that face has no edges to round or bevel" };
    const edges = lines.flatMap((l) => {
      if (l.kind !== "line") return [];
      if (l.twin && l.ref > l.twin && lines.some((x) => x.ref === l.twin)) return []; // (one arrow for a rim of two halves)
      const [pa, pb] = [get(l.a), get(l.b)];
      if (pa?.kind !== "corner" || pb?.kind !== "corner") return [];
      // a curved edge (the rim of a post or a hole): the arrow stands on the curve, in the middle of it, and points out across it; a straight one is a quarter of the way along
      const m = curveMid(get, l);
      const centre = l.circle ? l.circle.center : m ? circumcentre(pa.at, m, pb.at) : null; // (a whole rim is one closed edge: its ends are the same point, so the circle itself says where the middle is)
      if (m && centre) {
        // out of the corner is away from the axis for a post and towards it for a hole (the air is inside a hole)
        const wall = l.circle ? Object.values(scene.parts).find((q) => q.kind === "plane" && q.origin === "body" && !!q.curved && Math.abs(q.curved.radius - l.circle!.radius) < 1e-3 && [0, 1, 2].every((i) => i === q.curved!.axis || Math.abs(q.curved!.center[i]! - l.circle!.center[i]!) < 1e-3)) : undefined;
        const out = normalize(sub(m, centre));
        return [{ mid: m, dir: edgeDirection(scene, pa.at, pb.at, wall && wall.kind === "plane" && wall.curved && !wall.curved.convex ? scale(out, -1) : out) }];
      }
      return [{ mid: add(pa.at, scale(sub(pb.at, pa.at), 0.25)), dir: edgeDirection(scene, pa.at, pb.at) }];
    });
    return { ok: true, op: { ...base, parts: lines.map((p) => p.ref), edges, ranks: rimRanks(scene, lines.map((p) => p.ref)), sigs: edgeSignatures(scene, lines.map((p) => p.ref)) } }; // no size yet: drag the double arrow, or type one
  }
  if (kind === "copy") {
    // a copy is a repeat of two (the thing and one more beside it): the same arrows and numbers, to place the copy
    const r = startOp(scene, selection, "linear", view);
    if (!r.ok || !r.op.patStart) return r;
    const start = r.op.patStart.map((v, i) => (i === 2 * (r.op.along ?? 0) ? 2 : v));
    return { ok: true, op: { ...r.op, patStart: start, pat: start.map(() => "") } };
  }
  if (kind === "linear" || kind === "circular") {
    // what is selected is repeated: a drawn figure (its parts and the plane's), else the body; the numbers start as a first try and the result shows at once
    const drawn = drawnFigure(scene, parts);
    const figure: Ref[] | null = drawn.length ? drawn : null;
    const planes = new Set(drawn.map((r) => scene.parts[r]?.plane).filter(Boolean));
    if (planes.size > 1) return { ok: false, why: "select things that lie on one plane" };
    const bodyPart = figure ? undefined : parts.find((p) => p.kind === "body" || p.origin === "body");
    const st = patternStart(scene, kind, figure, view, bodyPart ? objectOf(scene, bodyPart.ref) : null); // (the body that is selected, or the one a selected face is in)
    if (!st) return { ok: false, why: "select the body or something drawn first" };
    return { ok: true, op: { ...base, parts: st.parts, target: st.target, plane: [...planes][0] ?? null, patStart: st.start, pat: st.start.map(() => ""), along: st.along } };
  }
  if (kind === "dimension") {
    // measure, then lock: the chip shows the current value of the pair; typing a number locks it (`dec_relations_standard`)
    const a = measureAction(actionsFor(scene, selection), (x) => x.enabled); // (the same number the bubble offers: an arc's radius before its chord, `in_235`)
    if (!a || !a.unit) return { ok: false, why: "select two parts that can be measured (two corners, a corner and a line, two lines)" };
    return { ok: true, op: { ...base, parts: a.parts, value: a.measure(), field: a.label, unit: a.unit } };
  }
  // move, rotate, scale: the whole body, or (move and rotate) a drawn closed figure
  const body = parts.find((p) => p.kind === "body" || p.origin === "body");
  if (body) {
    const which = objectOf(scene, body.ref); // (the body it is, or the body the face or edge is in: one of several, `dec_independent_bodies`)
    const mine = scene.parts[which]?.kind === "body" ? which : BODY_OBJECT;
    return { ok: true, op: { ...base, parts: [mine], pivot: kind === "rotate" ? bodyCentre(scene, mine) : null } };
  }
  const face = drawnFace(scene, parts);
  if (face && kind === "scale") {
    // a drawn figure is made bigger or smaller about its middle: its corners go in or out, a circle's radius changes
    const pl = face.plane ? get(face.plane) : undefined;
    if (!pl || pl.kind !== "plane") return { ok: false, why: "the figure is not on a plane" };
    const circle = face.disk ? get(face.disk) : undefined;
    const centre = circle?.kind === "circle" ? pointOf(get, circle.center) : centroid(face.corners.map((c) => pointOf(get, c)).filter((p): p is Vec3 => !!p));
    return { ok: true, op: { ...base, parts: face.disk ? [face.disk] : face.corners, target: "shape", plane: face.plane, pivot: centre } };
  }
  const figure = drawnFigure(scene, parts);
  if (figure.length) {
    // drawn things move and turn like an object (`in_135`): X Y Z arrows, X Y Z rings, with their planes; several selected together move and turn together about their common middle
    const pts = figure.map((c) => pointOf(get, c)).filter((p): p is Vec3 => !!p);
    return { ok: true, op: { ...base, parts: figure, target: "plane", plane: scene.parts[figure[0]!]?.plane ?? null, axis: kind === "rotate" ? 2 : 0, pivot: kind === "rotate" ? centroid(pts) : null } };
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
  const flatBody = parts.every((p) => p.kind === "plane" && p.origin === "body" && (!p.rounded || faceEdit(scene, p.ref)?.kind === "edgeSize" || (!!p.round && faceEdit(scene, p.ref)?.kind === "radius"))); // (a fillet or chamfer face gets its arrow back: its size)
  const kind: OpKind | null =
    parts.every((p) => p.kind === "face") && drawnFaces(scene, parts).length ? "extrude" // (the figure itself, not a side or a corner of it: those have numbers of their own, `in_235`)
    : flatBody ? "pushpull"
    : parts.every((p) => p.kind === "line" && p.origin === "body") ? "edge"
    : parts.length === 1 && parts[0]!.kind === "body" ? "move"
    : null;
  if (!kind) return null;
  const r = startOp(scene, selection, kind);
  return r.ok ? { ...r.op, auto: true } : null;
}

/** The number the operation will use: what was typed, else the pointer's or default value. */
export const valueOf = (op: Op): number | null => {
  const t = typedNumber(op.typed);
  if (t !== null && op.kind === "move" && op.typedBase !== undefined) return t - op.typedBase; // (a typed position along the axis: the step is how far that is from where it is)
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
  const corners = new Set(op.parts.filter((r) => scene.parts[r]?.kind === "corner"));
  const pts = op.parts.map((r) => scene.parts[r]).filter((p): p is Extract<Part, { kind: "corner" }> => p?.kind === "corner").map((p) => p.at);
  if (!pts.length) return null;
  const pivot = op.pivot ?? centroid(pts);
  const released = scene.relations.filter((r) => r.kind === "fixed" && r.parts.every((q) => corners.has(q)));
  // the figures may lie on different planes: each plane's figures are moved with that plane (all with the same turn about the same point)
  const byPlane = new Map<Ref, Ref[]>();
  for (const r of op.parts) {
    const p = scene.parts[r];
    if (p?.plane) byPlane.set(p.plane, [...(byPlane.get(p.plane) ?? []), r]);
  }
  const base = nextId(scene, "p");
  const moves = [...byPlane.entries()].map(([plane, parts], k): Command => ({ type: "transformFigure", parts, plane, newPlane: drawnRef(`${base}.c${k}`), turns, pivot, translate }));
  return { type: "batch", commands: [...released.map((r): Command => ({ type: "removeRelation", id: r.id })), ...moves] };
}
const rotTarget = (scene: Scene, op: Op): Angles => { const cur = turnAngles(scene, op); return cur.map((c, i) => (typedNumber(op.rot[i]!) ?? c)) as Angles; };

/** A step of the move, turn or scale of one body of several: it names the body (`body`); the sketches of the step that made the body go with it (`carries`), the others stay. */
function forBody(cmd: Command | null, id: string, carries: boolean): Command | null {
  if (!cmd) return cmd;
  if (cmd.type === "batch") { const kept = cmd.commands.filter((c) => carries || c.type === "addStep").map((c) => forBody(c, id, carries)!); return kept.length ? { type: "batch", commands: kept } : null; }
  if (cmd.type !== "addStep") return cmd;
  const { follow: _f, ...rest } = cmd.step.params;
  return { ...cmd, step: { ...cmd.step, params: { ...rest, ...(carries && _f !== undefined ? { follow: _f } : {}), body: id } } };
}
export function opCommand(scene: Scene, op: Op, opts: { preview?: boolean } = {}): Command | null {
  const which = op.target === "body" && (op.kind === "move" || op.kind === "rotate" || op.kind === "scale") ? scene.parts[op.parts[0]!] : undefined;
  if (which?.kind !== "body" || which.ref === BODY_OBJECT || !which.id) return opCommandOf(scene, op, opts);
  // the sketches that made a body go with it, and what is drawn on its faces; the other bodies' stay
  return forBody(opCommandOf(scene, { ...op, carryOnly: which.id }, opts), which.id, true);
}
function opCommandOf(scene: Scene, op: Op, opts: { preview?: boolean } = {}): Command | null {
  // the body dragged free: one move by a vector, with the sketches of the body carried by the same (`in_291`)
  if (op.kind === "move" && op.target === "body" && op.free) {
    const [x, y, z] = op.free;
    if (!x && !y && !z) return null;
    const id = nextId(scene, "s");
    const step: Command = { type: "addStep", step: { id, type: "move", parts: op.parts, params: { axis: 0, value: 0, vx: x, vy: y, vz: z, follow: 1 } } };
    const carry = carrySketches(scene, [], op.free, [0, 0, 0], 1, op.carryOnly);
    return carry.length ? { type: "batch", commands: [step, ...carry] } : step;
  }
  // a preview (what is shown while a number is dragged) is only the step: the sketches are carried when it is made for good. Carrying them changes what the earlier steps read, so every step would be made again at every move of the pointer (`in_206`)
  if (opts.preview && op.target === "body" && (op.kind === "move" || op.kind === "rotate" || op.kind === "scale")) return stripFollow(opCommand(scene, op));
  if (op.kind === "linear" || op.kind === "circular") return patternCommand(scene, op);
  if (op.kind === "rotate" && op.target === "plane" && op.rot.some((t) => typedNumber(t) !== null)) {
    // angles typed for a figure: it is turned to exactly those, about its pivot
    const steps = stepsBetween(planeTurn(scene, op), rotTarget(scene, { ...op, value: null, typed: "" }));
    return steps.length ? figureCommand(scene, op, steps.map((t) => ({ axis: t.axis, angle: t.angle })), [0, 0, 0]) : null;
  }
  if (op.kind === "rotate" && op.target === "body" && op.rot.some((t) => typedNumber(t) !== null)) {
    // angles typed in the bubble: the body is turned to exactly those (as three turns about X, Y, Z that go from how it is turned now), one command
    const id = nextId(scene, "s");
    const pivot: Record<string, number> = op.pivot ? { px: op.pivot[0], py: op.pivot[1], pz: op.pivot[2] } : {};
    const steps = stepsBetween(bodyTurn(scene), rotTarget(scene, { ...op, value: null, typed: "" }));
    if (!steps.length) return null;
    const follow: Record<string, number> = op.pivot ? { follow: 1 } : {};
    return { type: "batch", commands: [...steps.map((t, k): Command => ({ type: "addStep", step: { id: `${id}${"xyz"[t.axis]}${k}`, type: "rotate", parts: op.parts, params: { axis: t.axis, value: t.angle, ...pivot, ...follow } } })), ...(op.pivot ? carrySketches(scene, steps.map((t) => ({ axis: t.axis, angle: t.angle })), [0, 0, 0], op.pivot, 1, op.carryOnly) : [])] };
  }
  const v = valueOf(op);
  if (v === null) return null;
  if (op.kind === "offset") return op.off ? offsetCommand(scene, op.off, v) : null;
  const id = nextId(scene, "s");
  if (op.kind === "dimension") {
    const a = measureAction(actionsFor(scene, op.parts), (x) => x.enabled);
    return a && v > 0 ? a.run(v) : null;
  }
  if (op.kind === "extrude") return v === 0 ? null : { type: "addStep", step: { id, type: "extrude", parts: op.parts, params: { depth: v, ...(op.figs ?? {}) } } };
  if (op.kind === "pushpull" && op.faces && op.faces.length > 1) {
    if (v === 0) return null;
    return { type: "batch", commands: op.faces.map((f, k): Command => ({ type: "addStep", step: { id: `${id}f${k}`, type: "pushPull", parts: [op.parts[k]!], params: { depth: v, ...faceParams({ ...op, normal: f.normal, origin: f.origin }) } } })) };
  }
  if (op.kind === "pushpull" && op.edit && !op.noEdit) return v === 0 ? null : editCommand(scene, op.edit, v);
  if (op.kind === "pushpull") return v === 0 ? null : { type: "addStep", step: { id, type: "pushPull", parts: op.parts, params: { depth: v, ...faceParams(op) } } };
  // one operation, two results: a positive size is a fillet, a negative one a chamfer of that size (drag the double arrow one way or the other, or type a minus)
  if (op.kind === "edge") return v === 0 ? null : { type: "addStep", step: { id, type: "edgeMod", parts: op.parts, params: { mode: v > 0 ? "fillet" : "chamfer", value: Math.abs(v), ...(op.ranks ? { ranks: op.ranks } : {}), ...(op.sigs ? { sigs: op.sigs } : {}) } } };
  if (op.kind === "scale" && op.target === "shape") return v <= 0 ? null : scaleShapeCommand(scene, op, v);
  if (op.kind === "scale") {
    if (v <= 0) return null;
    // the whole body: about the middle of its box, and the sketches that made it carried along, made as many times bigger (`in_204`, `in_205`)
    const pivot = op.pivot ?? bodyCentre(scene, op.parts[0]);
    if (!pivot) return { type: "addStep", step: { id, type: "scale", parts: op.parts, params: { axis: 0, value: v } } };
    const step: Command = { type: "addStep", step: { id, type: "scale", parts: op.parts, params: { axis: 0, value: v, px: pivot[0], py: pivot[1], pz: pivot[2], follow: 1 } } };
    const carry = carrySketches(scene, [], [0, 0, 0], pivot, v, op.carryOnly);
    return carry.length ? { type: "batch", commands: [step, ...carry] } : step;
  }
  if (op.target === "plane") {
    if (v === 0) return null;
    return op.kind === "rotate" ? figureCommand(scene, op, [{ axis: op.axis, angle: v }], [0, 0, 0]) : figureCommand(scene, op, [], scale(([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[])[op.axis]!, v));
  }
  const pivot: Record<string, number> = op.kind === "rotate" && op.pivot ? { px: op.pivot[0], py: op.pivot[1], pz: op.pivot[2] } : {};
  if (v === 0) return null;
  // the whole body: the step, and the sketches that made it carried along with it (`in_204`)
  const carried = op.kind === "move" || (op.kind === "rotate" && !!op.pivot);
  const step: Command = { type: "addStep", step: { id, type: op.kind as "move" | "rotate", parts: op.parts, params: { axis: op.axis, value: v, ...pivot, ...(carried ? { follow: 1 } : {}) } as Record<string, number> } };
  if (!carried || op.target !== "body") return step;
  const carry = op.kind === "move" ? carrySketches(scene, [], scale(([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[])[op.axis]!, v), [0, 0, 0], 1, op.carryOnly) : carrySketches(scene, [{ axis: op.axis, angle: v }], [0, 0, 0], op.pivot!, 1, op.carryOnly);
  return carry.length ? { type: "batch", commands: [step, ...carry] } : step;
}

/**
 * The motion of the whole body that this move, turn or scale makes, as numbers (`in_216`): while it is dragged the body is only drawn moved (a matrix on the graphics card), the kernel works it out
 * once when it is let go. Null when the operation is not one of those, has nothing to show yet, or is one the kernel has to work out (angles typed for the three axes).
 */
export function bodyMotion(scene: Scene, op: Op): Rigid | null {
  if (op.target !== "body" || (op.kind !== "move" && op.kind !== "rotate" && op.kind !== "scale")) return null;
  if (op.kind === "rotate" && op.rot.some((t) => typedNumber(t) !== null)) {
    // angles typed for the axes: the body is turned to exactly those, as up to three turns one after another about the same point; about the middle of the body that is only known for one turn (after it the middle
    // of its box is somewhere else), so several turns need a pivot set, else the kernel works them out (`in_228`)
    const cmd = opCommand(scene, op, { preview: true });
    const adds = (cmd?.type === "batch" ? cmd.commands : cmd ? [cmd] : []).filter((c): c is Extract<Command, { type: "addStep" }> => c.type === "addStep" && c.step.type === "rotate");
    const pivot0 = op.pivot ?? bodyCentre(scene, op.parts[0]);
    if (!adds.length || !pivot0 || (adds.length > 1 && !op.pivot)) return null;
    return laterMotion(adds.map((a) => ({ ...a.step, params: { ...a.step.params, follow: 1, px: pivot0[0], py: pivot0[1], pz: pivot0[2] } })), -1);
  }
  if (op.kind === "move" && op.free) return motionOf({ id: "s_x", type: "move", parts: op.parts, params: { axis: 0, value: 0, vx: op.free[0], vy: op.free[1], vz: op.free[2] } });
  const v = valueOf(op);
  if (v === null) return null;
  if (op.kind === "scale" && v <= 0) return null;
  if (op.kind === "move") return motionOf({ id: "s_x", type: "move", parts: op.parts, params: { axis: op.axis, value: v } });
  const pivot = op.pivot ?? bodyCentre(scene, op.parts[0]);
  if (!pivot) return null;
  return motionOf({ id: "s_x", type: op.kind, parts: op.parts, params: { axis: op.kind === "scale" ? 0 : op.axis, value: v, px: pivot[0], py: pivot[1], pz: pivot[2] } });
}

/** What the steps after step number `index` do to the body, if they are all moves or turns of the whole body (the picture of such an edit is the same shape, moved): their motion; null if any is something else. (`in_224`) */
function motionsAfter(scene: Scene, index: number): Rigid | null {
  for (let i = index + 1; i < scene.steps.length; i++) { const st = scene.steps[i]!; if (st.type === "scale" || Number(st.params.follow) !== 1 || !motionOf(st)) return null; }
  return laterMotion(scene.steps, index);
}
/**
 * For pulling an end of a prism along `n`: the steps after the edited one may also round edges that run the same way (a fillet or chamfer of a vertical edge of an extrusion): the rounding is a prism too, so it
 * stretches with the end (`in_227`). True if every step after `index` is a move or turn, or such a rounding (its edges, from the names the step keeps, mapped through the motions after it, are parallel to `n`).
 */
function prismaticAfter(scene: Scene, index: number, n: Vec3): boolean {
  for (let i = index + 1; i < scene.steps.length; i++) {
    const st = scene.steps[i]!;
    if (st.type !== "scale" && Number(st.params.follow) === 1 && motionOf(st)) continue;
    if (st.type !== "edgeMod" || !st.parts.length) return false;
    const later = laterMotion(scene.steps, i);
    for (const r of st.parts) {
      const pts = String(r).split("@")[1]?.split("~").map((t) => t.split(",").map(Number));
      if (!pts || pts.length !== 3 || pts.some((q) => q.length !== 3 || q.some((x) => !Number.isFinite(x)))) return false;
      const [a, b, m] = pts as unknown as [Vec3, Vec3, Vec3];
      if (Math.hypot(...sub(m, scale(add(a, b), 0.5))) > 1e-3 * Math.max(1, Math.hypot(...sub(b, a)))) return false; // (a curved edge is not a vertical one)
      const d = normalize(sub(applyPoint(later, b), applyPoint(later, a)));
      if (Math.abs(Math.abs(dot(d, n)) - 1) > 1e-4) return false;
    }
  }
  return true;
}
/** The index of the last step that is an extrusion with one of these lines or circles. */
const extrudeIndexOf = (scene: Scene, uses: (r: Ref) => boolean): number => { for (let i = scene.steps.length - 1; i >= 0; i--) { const st = scene.steps[i]!; if (st.type === "extrude" && figureRefs(st).some(uses)) return i; } return -1; };

/**
 * A face pulled or pushed along its normal that only changes the depth of the last step (the end of an extrusion, or of a push / pull): the face just moves, and the walls beside it stretch, so it can be drawn
 * at once without the kernel while it is dragged (`in_217`). `depth` is what the step's depth will be. Null for anything the kernel has to work out (a step that comes after it would change too).
 */
export function faceDrag(scene: Scene, op: Op): { face: Ref; by: Vec3; step: string; depth: number } | null {
  if (op.kind !== "pushpull" || op.noEdit || !op.edit || op.parts.length !== 1 || !op.normal) return null;
  const e = op.edit;
  if (e.kind !== "depth" && e.kind !== "stepDepth") return null;
  const at = scene.steps.findIndex((x) => x.id === e.step);
  if (at < 0 || !prismaticAfter(scene, at, normalize(op.normal))) return null; // (only moves and turns, or roundings of edges that run the same way, come after it: the same edit of the same shape)
  const v = valueOf(op);
  if (v === null || v === 0) return null;
  return { face: op.parts[0]!, by: scale(op.normal, v), step: e.step, depth: e.depth + v * (e.kind === "depth" ? e.along : 1) };
}

/**
 * The wall of an extruded circle made wider or narrower while the last step is the one that extruded it: the wall's points just move out from (or in towards) the axis, so it can be drawn at once without the
 * kernel (`in_218`). `circle` is the sketch circle and `radius` what its radius will be. Null for anything else (an arc whose circle is gone, a wall turned about a tilted axis, a later step).
 */
export function radiusDrag(scene: Scene, op: Op): { face: Ref; radial: { center: Vec3; axis: Vec3; dr: number; r0: number }; circle: Ref; radius: number } | null {
  const e = op.edit;
  const c = op.curved ?? (op.roundAxis ? { axis: 2 as const, center: op.roundAxis.center, dir: op.roundAxis.dir } : null);
  if (op.kind !== "pushpull" || op.noEdit || !e || e.kind !== "radius" || e.arc || !c || op.parts.length !== 1) return null;
  const at = extrudeIndexOf(scene, (r) => r === e.circle);
  if (at < 0 || !motionsAfter(scene, at)) return null;
  const v = valueOf(op);
  if (v === null || v === 0) return null;
  const dr = e.convex ? v : -v;
  if (!(e.radius + dr > 1e-3)) return null;
  const axis: Vec3 = "dir" in c && c.dir ? c.dir : c.axis === 0 ? [1, 0, 0] : c.axis === 1 ? [0, 1, 0] : [0, 0, 1];
  return { face: op.parts[0]!, radial: { center: c.center, axis, dr, r0: e.radius }, circle: e.circle, radius: e.radius + dr };
}

/** How the wall of an arc goes from the arc it was to the one it is: out from the middle by `dr`, along from where it began (`th0`, over `span`, turning `dir`) to where it begins now (`th0n`, over `spanN`), about the new middle. */
export interface ArcMap { center: Vec3; centerN: Vec3; axis: Vec3; u: Vec3; v: Vec3; th0: number; span: number; th0n: number; spanN: number; dir: 1 | -1; dr: number }

/** The map of one arc of the sketch, from the scene as it is and as the solver would have it; null if it cannot be told. */
function arcMapOf(scene: Scene, solved: Scene, arc: Extract<Part, { kind: "line" }>): ArcMap | null {
  if (!arc.center || !arc.plane) return null;
  const [ca, cb, cc, pl] = [scene.parts[arc.a], scene.parts[arc.b], scene.parts[arc.center], scene.parts[arc.plane]];
  const [na, nb, nc] = [solved.parts[arc.a], solved.parts[arc.b], solved.parts[arc.center]];
  if (ca?.kind !== "corner" || cb?.kind !== "corner" || cc?.kind !== "corner" || pl?.kind !== "plane" || na?.kind !== "corner" || nb?.kind !== "corner" || nc?.kind !== "corner") return null;
  // an arc whose two ends are not the same distance from its middle is no arc the picture can follow
  const [r1, r2, r1n, r2n] = [Math.hypot(...sub(ca.at, cc.at)), Math.hypot(...sub(cb.at, cc.at)), Math.hypot(...sub(na.at, nc.at)), Math.hypot(...sub(nb.at, nc.at))];
  if (Math.abs(r1 - r2) > 1e-3 || Math.abs(r1n - r2n) > 1e-3) return null;
  const TAU = 2 * Math.PI;
  const mod = (x: number) => ((x % TAU) + TAU) % TAU;
  const ang = (p: Vec3, c: Vec3) => { const d = sub(p, c); return Math.atan2(dot(d, pl.v), dot(d, pl.u)); };
  const mid = curveMid(lookup(scene), arc);
  if (!mid) return null;
  const [ta, tb, tm] = [ang(ca.at, cc.at), ang(cb.at, cc.at), ang(mid, cc.at)];
  const dir: 1 | -1 = mod(tm - ta) < mod(tb - ta) ? 1 : -1;
  const span = dir === 1 ? mod(tb - ta) : mod(ta - tb);
  const [tan, tbn] = [ang(na.at, nc.at), ang(nb.at, nc.at)];
  const spanN = dir === 1 ? mod(tbn - tan) : mod(tan - tbn);
  if (span < 1e-6 || spanN < 1e-6) return null;
  return { center: cc.at, centerN: nc.at, axis: normalOfPlane(pl), u: pl.u, v: pl.v, th0: ta, span, th0n: tan, spanN, dir, dr: Math.hypot(...sub(na.at, nc.at)) - Math.hypot(...sub(ca.at, cc.at)) };
}

/** The scene after a command, with its relations solved, or null when the command cannot be done or the solver finds a conflict: the first step of every drag that is drawn without the kernel (`in_282`: one copy). */
function solvedAfter(scene: Scene, cmd: Command): ReturnType<typeof solveScene> | null {
  const moved = apply(scene, cmd);
  if (!moved.ok) return null;
  const solved = solveScene(moved.value);
  return solved.planes.some((p) => p.status === "conflict") ? null : solved;
}

/**
 * The wall of an arc of an extruded sketch (its circle was cut into arcs by lines and is gone) made wider or narrower (`in_225`): the arc keeps its middle, its two ends slide along their lines to the new radius (the
 * same corners the edit moves, checked with the solver), so the wall's points go out from the middle by the change and along the arc to where its ends are now, and every point over a moved corner moves with it.
 * Null for anything the kernel has to work out: a line that does not reach the new radius, a wall that is only part of the arc, a corner the solver will not move there.
 */
export function arcDrag(scene: Scene, op: Op): { face: Ref; arc: ArcMap; items: { ref: Ref; at: Vec3; by: Vec3 }[] } | null {
  const e = op.edit;
  if (op.kind !== "pushpull" || op.noEdit || !e || e.kind !== "radius" || !e.arc || op.parts.length !== 1) return null;
  const arc = scene.parts[e.circle];
  if (arc?.kind !== "line" || !arc.center || !arc.plane) return null;
  const at = extrudeIndexOf(scene, (r) => r === e.circle || (r.startsWith("d/arc@") && r.split("@")[1] === e.circle.slice(2)));
  if (at < 0 || !motionsAfter(scene, at)) return null;
  const v = valueOf(op);
  if (v === null || v === 0) return null;
  const dr = e.convex ? v : -v;
  const radius = e.radius + dr;
  if (!(radius > 1e-3)) return null;
  // the wall is the whole arc: the piece the extrusion uses ends where the arc does
  const piece = figureRefs(scene.steps[at]!).map((r) => scene.parts[r]).find((l) => l?.kind === "line" && l.derived && l.ref.split("@")[1] === e.circle.slice(2));
  const [ca, cb] = [scene.parts[arc.a], scene.parts[arc.b]];
  const [cc, pl] = [scene.parts[arc.center], scene.parts[arc.plane]];
  if (ca?.kind !== "corner" || cb?.kind !== "corner" || cc?.kind !== "corner" || pl?.kind !== "plane") return null;
  if (piece?.kind === "line") { const [pa, pb] = [scene.parts[piece.a], scene.parts[piece.b]]; if (pa?.kind !== "corner" || pb?.kind !== "corner") return null; const same = (x: Vec3, y: Vec3) => Math.hypot(...sub(x, y)) < 1e-3; if (!((same(pa.at, ca.at) && same(pb.at, cb.at)) || (same(pa.at, cb.at) && same(pb.at, ca.at)))) return null; }
  const cmd = arcRadiusCommand(scene, e.circle, radius);
  if (!cmd) return null;
  const solved = solvedAfter(scene, cmd);
  if (!solved) return null;
  const items: { ref: Ref; at: Vec3; by: Vec3 }[] = [];
  for (const q of Object.values(scene.parts)) {
    if (q.kind !== "corner" || q.origin !== "drawn" || q.plane !== arc.plane) continue;
    const w = solved.scene.parts[q.ref];
    if (w?.kind !== "corner") return null;
    const by = sub(w.at, q.at);
    if (Math.hypot(...by) > 1e-9) items.push({ ref: q.ref, at: q.at, by });
  }
  // the ends went where the edit wanted (a constraint that holds one would make the kernel decide)
  const [na, nb] = [solved.scene.parts[arc.a], solved.scene.parts[arc.b]];
  if (na?.kind !== "corner" || nb?.kind !== "corner") return null;
  const want = (cmd.type === "batch" ? cmd.commands : [cmd]).filter((x): x is Extract<Command, { type: "movePart" }> => x.type === "movePart");
  for (const m of want) { const got = solved.scene.parts[m.ref]; if (got?.kind === "corner" && Math.hypot(...sub(got.at, m.to)) > 1e-6) return null; }
  const arcMap = arcMapOf(scene, solved.scene, arc);
  if (!arcMap) return null;
  return { face: op.parts[0]!, arc: arcMap, items };
}

/**
 * A side of an extruded sketch pulled or pushed while that extrusion is the last step (`in_219`): the sketch's corners move (found with the solver, so what constraints do is in it) and every point of the
 * body that stands over a moved corner moves with it, so it can be drawn at once without the kernel. Null for anything the kernel has to work out: a sketch with arcs, a corner that cannot go where the edit
 * wants it, corners on different planes. `items` are the moved corners (where they are and how far they go), `axis` the way the sketch was extruded.
 */
export function sideDrag(scene: Scene, op: Op): { face: Ref; axis: Vec3; items: { ref: Ref; at: Vec3; by: Vec3 }[]; edge: { a: Vec3; da: Vec3; b: Vec3; db: Vec3 } | null; arcWalls: { face: Ref; arc: ArcMap }[] } | null {
  const e = op.edit;
  if (op.kind !== "pushpull" || op.noEdit || !e || e.kind !== "side" || op.parts.length !== 1) return null;
  const corners = new Set<Ref>(e.corners);
  const at = extrudeIndexOf(scene, (r) => { const l = scene.parts[r]; return l?.kind === "line" && (corners.has(l.a) || corners.has(l.b)); });
  if (at < 0 || !motionsAfter(scene, at)) return null;
  const last = scene.steps[at]!;
  const v = valueOf(op);
  if (v === null || v === 0) return null;
  // every line of the extrusion is straight, and the edited corners are its own
  const lines = figureRefs(last).map((r) => scene.parts[r]);
  if (lines.some((l) => l?.kind !== "line" || l.bulge)) return null;
  const own = new Set<Ref>(lines.flatMap((l) => (l?.kind === "line" ? [l.a, l.b] : [])));
  if (!e.corners.every((c) => own.has(c))) return null;
  const cmd = editCommand(scene, e, v);
  if (!cmd) return null;
  const solved = solvedAfter(scene, cmd);
  if (!solved) return null;
  const items: { ref: Ref; at: Vec3; by: Vec3 }[] = [];
  const plane = (scene.parts[e.corners[0]!] as { plane?: Ref | null }).plane;
  for (const c of own) {
    const [a, b] = [scene.parts[c], solved.scene.parts[c]];
    if (a?.kind !== "corner" || b?.kind !== "corner") return null;
    const by = sub(b.at, a.at);
    if (Math.hypot(...by) < 1e-9) continue;
    if (a.plane !== plane) return null;
    items.push({ ref: c, at: a.at, by });
  }
  // the edit must have gone where it wanted to (a locked length would put the corner back)
  for (const c of e.corners) { const w = (cmd.type === "batch" ? cmd.commands : [cmd]).find((x) => x.type === "movePart" && x.ref === c); const got = solved.scene.parts[c]; if (w?.type === "movePart" && got?.kind === "corner" && Math.hypot(...sub(got.at, w.to)) > 1e-6) return null; }
  const pl = plane ? scene.parts[plane] : undefined;
  if (!items.length || pl?.kind !== "plane") return null;
  // the arcs of the sketch (their circles are gone or they were drawn as arcs): each whole arc that changed has its wall mapped from the old arc to the new one (`in_226`)
  const arcWalls: { face: Ref; arc: ArcMap }[] = [];
  const seen = new Set<Ref>();
  for (const l of lines) {
    if (l?.kind !== "line" || !l.center) continue;
    const src = l.derived ? scene.parts[`d/${l.ref.split("@")[1] ?? ""}`] : l;
    if (src?.kind !== "line" || !src.center || seen.has(src.ref)) continue;
    seen.add(src.ref);
    const [pa, pb] = [scene.parts[l.a], scene.parts[l.b]];
    const [sa, sb] = [scene.parts[src.a], scene.parts[src.b]];
    if (pa?.kind !== "corner" || pb?.kind !== "corner" || sa?.kind !== "corner" || sb?.kind !== "corner") return null;
    const same = (x: Vec3, y: Vec3) => Math.hypot(...sub(x, y)) < 1e-3;
    if (!((same(pa.at, sa.at) && same(pb.at, sb.at)) || (same(pa.at, sb.at) && same(pb.at, sa.at)))) return null; // (only a whole arc has its wall mapped)
    const map = arcMapOf(scene, solved.scene, src);
    if (!map) return null;
    if (Math.hypot(...sub(map.center, map.centerN)) < 1e-9 && Math.abs(map.th0 - map.th0n) < 1e-9 && Math.abs(map.span - map.spanN) < 1e-9 && Math.abs(map.dr) < 1e-9) continue; // (this arc does not change)
    const r0 = Math.hypot(...sub(sa.at, (scene.parts[src.center] as { at: Vec3 }).at));
    const walls = Object.values(scene.parts).filter((q) => q.kind === "plane" && q.origin === "body" && q.rounded === "CYLINDRE" && !!q.round && !!q.radius && Math.abs((q.radius ?? 0) - r0) < 2e-3 && Math.abs(Math.abs(dot(q.round.dir ?? (q.round.axis === 0 ? [1, 0, 0] : q.round.axis === 1 ? [0, 1, 0] : [0, 0, 1]), map.axis)) - 1) < 1e-5 && Math.hypot(...sub(sub(q.round.center, map.center), scale(map.axis, dot(sub(q.round.center, map.center), map.axis)))) < 2e-3);
    if (!walls.length) return null;
    for (const w of walls) arcWalls.push({ face: w.ref, arc: map });
  }
  // the two ends of the face's own edge, to move what is selected exactly with it
  const ends = e.corners.length === 2 ? e.corners.map((c) => ({ at: (scene.parts[c] as { at: Vec3 }).at, by: items.find((i) => i.ref === c)?.by ?? ([0, 0, 0] as Vec3) })) : null;
  return { face: op.parts[0]!, axis: normalOfPlane(pl), items, arcWalls, edge: ends ? { a: ends[0]!.at, da: ends[0]!.by, b: ends[1]!.at, db: ends[1]!.by } : null };
}

/**
 * A fillet or chamfer made smaller or bigger while it is the last step (`in_220`, `in_222`): its cross-section is the same shape at any size, only scaled about the sharp edge (a line, or a circle), so the
 * points of the rounding (and where it meets the faces beside it) move by that scale, and it can be drawn at once without the kernel. The edges are read from the names the step keeps, and may be several if they
 * meet smoothly (no corner: a corner has a patch of its own that does not scale this way). `groups` are the rounding faces, each with its sharp edge, `k` the scale. Null for anything else (a whole circle, whose
 * plane the name does not say, a corner, a step that comes after it).
 */
export function edgeDrag(scene: Scene, op: Op): { face: Ref; groups: { face: Ref; sharp: Sharp }[]; k: number; step: string; value: number } | null {
  const e = op.edit;
  if (op.kind !== "pushpull" || op.noEdit || !e || e.kind !== "edgeSize" || op.parts.length !== 1) return null;
  const at = scene.steps.findIndex((x) => x.id === e.step);
  const st = scene.steps[at];
  const later = at >= 0 ? motionsAfter(scene, at) : null;
  if (st?.type !== "edgeMod" || !later) return null;
  const v = valueOf(op);
  if (v === null || v === 0) return null;
  const value = e.value - v;
  if (!(value > 1e-3)) return null;
  const edges: SharpEdge[] = [];
  for (const r of st.parts) {
    const pts = String(r).split("@")[1]?.split("~").map((t) => t.split(",").map(Number));
    if (!pts || pts.length !== 3 || pts.some((q) => q.length !== 3 || q.some((x) => !Number.isFinite(x)))) return null;
    const [a0, b0, m0] = pts as unknown as [Vec3, Vec3, Vec3];
    const [a, b, m] = [applyPoint(later, a0), applyPoint(later, b0), applyPoint(later, m0)]; // (the names are from when the step was made: where the body has been moved or turned since)
    // a whole circle: the name does not say which way it faces; a torus or a cone about it does
    const se = Math.hypot(...sub(a, b)) < 1e-6 ? circleOfRim(scene, a, m) : sharpOfPoints(a, b, m);
    if (!se) return null;
    edges.push(se);
  }
  const chain = chainOf(edges, Math.max(e.value, value), st.params.mode === "chamfer" ? 4 : 2.2);
  if (!chain) return null;
  const faces = roundingFaces(scene, chain.edges, 3 * e.value, () => false, chain.corners);
  if (!faces.some((f) => f.face === op.parts[0])) return null;
  return { face: op.parts[0]!, groups: faces.map((f) => ({ face: f.face, sharp: f.corner ? { kind: "point" as const, center: f.corner } : chain.edges[f.edge]!.sharp })), k: value / e.value, step: e.step, value };
}

/** A command as it is without carrying the sketches: only the steps, and not marked `follow`. */
function stripFollow(c: Command | null): Command | null {
  if (!c) return null;
  if (c.type === "batch") { const keep = c.commands.filter((x) => x.type !== "transformFigure" && x.type !== "setRelationValue" && x.type !== "removeRelation"); return { type: "batch", commands: keep.map((x) => stripFollow(x)!) }; }
  if (c.type === "addStep" && c.step.params.follow !== undefined) { const { follow: _f, ...rest } = c.step.params; return { type: "addStep", step: { ...c.step, params: rest } }; }
  return c;
}

/**
 * The sketches that made the body go with it when it is moved or turned (`in_204`): every drawn part an extrude used is moved or turned the same way with its plane (`transformFigure`), so they stay attached to the body
 * as a continuation of the recipe, and the extrude reads them back through the step (`compiler/graph.ts`). A constraint that ties one of them to something that is not carried (a free drawing, the world, the body) stays: it is
 * a constraint of the whole body to that thing, and the solver holds the body's sketch (`compiler/solve.ts`), so a move that would break it is refused and the constraint flashes (`in_205`).
 */
export function carrySketches(scene: Scene, turns: { axis: 0 | 1 | 2; angle: number }[], translate: Vec3, pivot: Vec3, bigger = 1, only?: string): Command[] {
  // one body of several: the sketches of the step that made it (its sides and circles, and their corners), not the others' (`in_271`)
  const birth = only ? scene.steps.find((st) => `x_${st.id}` === only) : undefined;
  const own = new Set<Ref>();
  if (birth) for (const r of figureRefs(birth)) {
    own.add(r);
    const l = scene.parts[r];
    if (l?.kind === "line") { own.add(l.a); own.add(l.b); if (l.center) own.add(l.center); } else if (l?.kind === "circle") own.add(l.center);
    // a piece of a cut shape (an arc or a side cut from a circle or a line) is named after what it was cut from and where it ends ("d/arc@e_001.k@e_012.p0@x@..."): those curves and corners are the body's sketch too, or the piece loses them and the step breaks (the body is gone)
    if (r.includes("@")) for (const t of r.split("@")) {
      const q = /^e_\d+\.[a-z0-9]+$/.test(t) ? scene.parts[`d/${t}` as Ref] : undefined;
      if (!q) continue;
      own.add(q.ref);
      if (q.kind === "circle") own.add(q.center);
      else if (q.kind === "line") { own.add(q.a); own.add(q.b); if (q.center) own.add(q.center); }
    }
  }
  const used = only ? own : consumed(scene);
  // what is drawn on a face of the body belongs to the body too and goes with it (`in_234`); what merely lies where a face is does not (it has no link)
  // what is drawn on a face of the body goes with it; with one body of several, only what is drawn on a face of that body (`in_277`)
  // (a plane made while there was one body has no owner: it belongs to the body whose box holds what is drawn on it, `inBox`)
  const box = only ? Object.values(scene.parts).find((b): b is Extract<Part, { kind: "body" }> => b.kind === "body" && b.id === only)?.bbox : undefined;
  const inBox = (p: Part): boolean => !!box && p.kind === "corner" && p.at.every((v, i) => v >= box.min[i]! - 1e-3 && v <= box.max[i]! + 1e-3);
  const unowned = new Set<Ref>();
  if (only && box) {
    const centres = (pl: Ref) => Object.values(scene.parts).filter((q) => q.origin === "drawn" && q.plane === pl && q.kind === "corner");
    for (const pl of Object.values(scene.parts)) if (pl.kind === "plane" && pl.onBody === true && !pl.body && centres(pl.ref).length && centres(pl.ref).every(inBox)) unowned.add(pl.ref);
  }
  const onFace = Object.values(scene.parts).filter((p) => { const pl = p.origin === "drawn" && p.plane ? (scene.parts[p.plane] as { onBody?: boolean; body?: string } | undefined) : undefined; return pl?.onBody === true && (!only || pl.body === only || unowned.has(p.plane!)); }).map((p) => p.ref);
  const parts = [...new Set([...used, ...onFace])].filter((r) => { const p = scene.parts[r]; return p && p.origin === "drawn" && p.movable && (p.kind === "corner" || p.kind === "line" || p.kind === "circle") && !("derived" in p && p.derived) && !!p.plane; });
  if (!parts.length) return [];
  const byPlane = new Map<Ref, Ref[]>();
  for (const r of parts) { const pl = scene.parts[r]!.plane!; byPlane.set(pl, [...(byPlane.get(pl) ?? []), r]); }
  const base = nextId(scene, "p");
  const moves = [...byPlane.entries()].map(([plane, ps], k): Command => ({ type: "transformFigure", parts: ps, plane, newPlane: drawnRef(`${base}.k${k}`), turns, pivot, translate, ...(bigger !== 1 ? { scale: bigger } : {}), ...(only && unowned.has(plane) ? { body: only } : {}) }));
  // a scale makes the numbers locked on the carried sketch (a length, a distance, a diameter, a radius) as many times bigger too, or they would hold the sketch at its old size
  const carried = new Set<Ref>(parts);
  const sized = bigger === 1 ? [] : scene.relations.filter((r) => r.value !== undefined && ["length", "distance", "diameter", "radius"].includes(r.kind) && r.parts.every((q) => carried.has(q) || (scene.parts[q]?.kind === "line" && carried.has((scene.parts[q] as { a: Ref }).a))));
  return [...moves, ...sized.map((r): Command => ({ type: "setRelationValue", id: r.id, value: r.value! * bigger, ...(r.locked !== undefined ? { locked: r.locked } : {}) }))];
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
export const isLive = (op: Op): boolean => !op.auto && (op.kind === "extrude" || op.kind === "pushpull" || op.kind === "edge" || op.kind === "offset");

/** A face as the figure an extrude uses: its sides (or circle) and those of each figure drawn inside it. */
function figureOf(scene: Scene, face: Extract<Part, { kind: "face" }>): Figure {
  const refs = (f: Extract<Part, { kind: "face" }>): Ref[] => (f.disk ? [f.disk] : f.loop);
  return { outer: refs(face), holes: (face.holes ?? []).flatMap((h) => { const f = scene.parts[h]; return f?.kind === "face" ? [refs(f)] : []; }) };
}

// The operations that take a number (`dec_interaction_spec`): extrude a closed figure, fillet or chamfer lines of the body (one operation: one way is a fillet, the other a chamfer), move, rotate or scale the body.
// An operation starts from the selection (the menu or a key), shows its number, and is finished by Enter or a click: that adds ONE step to the scene, so it undoes in one go.
import { typedNumber } from "../shared/numbers.ts";
import { typedLength, units } from "../shared/units.ts";
import type { Ref } from "../shared/ref.ts";
import { edgeDirection, moveCentre, moveOffset } from "./gizmo.ts";
import { patternStart, patternCommand } from "./pattern.ts";
import type { Mat3, Angles } from "../math/rotation.ts";
import { IDENTITY, about, aboutDir, then, anglesOf, stepsBetween } from "../math/rotation.ts";
import { motionOf, laterMotion, applyPoint } from "../operation/frames.ts";
import type { Rigid } from "../operation/frames.ts";
import type { Curved } from "../operation/part.ts";
import type { FaceEdit } from "./faceedit.ts";
import type { OffsetSource } from "./offset.ts";
import { offsetSource, offsetCommand } from "./offset.ts";
import { faceEdit, editCommand, arcRadiusCommand, figureBehindFace } from "./faceedit.ts";
import { faceEdges } from "./offsetbody.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross, normalize } from "../math/vec.ts";
import { gearOfPart } from "../operation/gearscene.ts";
import { planetaryOfGear } from "../operation/planetary.ts";
import type { GearRecord } from "../operation/gearscene.ts";
import type { Scene } from "../operation/scene.ts";
import { surfaceTriangles } from "./surfaces.ts";
import { lookup, nextId, figureParams, figureRefs, figuresOf } from "../operation/scene.ts";
import { rimRanks, edgeSignatures, facesOfEdge } from "../operation/rims.ts";
import { consumed } from "../operation/ownership.ts";
import type { Figure } from "../operation/scene.ts";
import type { Part, Plane, PointerView } from "../operation/part.ts";
import { normalOfPlane, pointOf, curveMid } from "../operation/part.ts";
import type { Command } from "../operation/commands.ts";
import { apply } from "../operation/commands.ts";
import { solveScene } from "../compiler/solve.ts";
import { actionsFor, measureAction } from "./actions.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import { drawnRef, formatId } from "../shared/ref.ts";
import { objectOf, bodyCentre, figurePartsOf } from "./objects.ts";
import { revolveStart, revolveCommand, middleOf } from "./revolve.ts";
import { loftCommand } from "./loft.ts";
import { sweepCommand } from "./sweep.ts";
import { walkPath } from "../operation/path.ts";
import { mirrorStart, mirrorCommand } from "./mirror.ts";
import { partCorners, reshapeCommand, bodyIdOf } from "./reshape.ts";
import { settings } from "../shared/settings.ts";

export type OpKind = "extrude" | "pushpull" | "offset" | "edge" | "move" | "rotate" | "scale" | "dimension" | "linear" | "circular" | "copy" | "hollow" | "revolve" | "loft" | "sweep" | "mirror";
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
  /** the point of the body that was pressed, in a free drag (`in_346`): when the mates hold the body back, it is this point that is brought as near the pointer as they allow, by turning as well as moving */
  grab?: Vec3;
  /** a move, turn or scale of one body of several: whose sketches go with it (its name; "-": none) */
  carryOnly?: string;
  editStep?: string;
  patStart?: number[];
  /** linear repeat: the direction the helper bubbles stand on (`in_236`) */
  along?: 0 | 1 | 2;
  /** rotate the body: the three angles typed so far (X, Y, Z) as the body is to be turned (empty = as it is now) */
  rot: [string, string, string];
  /** a scale of a body: the factor along each axis when an axis arrow has been pulled (`dec_scale_axes`); absent for the same factor every way */
  axes?: [number, number, number];
  /** revolve: each figure selected (its outer sides or circle and the figures inside it) and its middle */
  revFigs?: { fig: Figure; middle: Vec3 }[];
  /** loft (`dec_loft_sketches`): the sketches in the order picked (each its outer sides or circle and the figures inside it), how they are joined, and for each its start point (corners moved on) and direction */
  /** mirror (`in_433`, `in_437`): the box of what is mirrored, where the plane stands along each axis (the arrows end there) and which axis is in force */
  mirrorBox?: { lo: Vec3; hi: Vec3 };
  mirrorAt?: Vec3;
  mirrorAxis?: 0 | 1 | 2;
  /** mirror: the box is flat (a figure): no arrow across its own plane */
  mirrorFlat?: boolean;
  /** sweep (`dec_sweep`): the shape carried (its outer sides or circle and the figures inside it) and the path it is carried along, as the step stores it */
  sweepFig?: Figure;
  sweepLines?: Ref[];
  /** "path": a copy of the shape stands square on the path (`dec_sweep_modes`, the default of a new sweep); "sketch": it is carried from where it is drawn. */
  sweepPlace?: "path" | "sketch";
  loftFigs?: Figure[];
  loftRuled?: boolean;
  loftSplit?: boolean;
  loftShift?: number[];
  /** the distance typed between sketch i and i + 1, as text (`in_535`) */
  loftGaps?: string[];
  /** the distances between sketches are along the straight line between their middles, not along the normal of the earlier sketch's plane (`in_537`) */
  loftStraight?: boolean;
  loftRev?: boolean[];
  advTyped?: string;
  advValue?: number | null;
  revField?: 0 | 1;
  /** hollow: the faces left open, each as `nx,ny,nz,d,px,py,pz`, joined by `;` (`in_391`) */
  openFaces?: string;
  /** a move or a turn: the axes of the mover when it has been turned (`in_417`): the arrows pull along them and the rings turn about them; absent for the world axes */
  frame?: [Vec3, Vec3, Vec3];
  /** the turned axes put aside by a click on the sphere (back to true x, y, z): a second click brings them back, the sphere has not moved (`in_419`) */
  frameKept?: [Vec3, Vec3, Vec3];
  /** hollow: the faces named are kept as the walls (the others open), or are the open ones, or nothing is open (`in_393`) */
  hollowMode?: "keep" | "open" | "closed";
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
  /** what pushing or pulling a flat face does (`in_405`): `move` (the default: the step that made the face changes), `extrude` (a prism of the face's outline is added or taken), `extend` (the face moves and its neighbours are carried on until they meet) */
  faceKind?: "move" | "extrude" | "extend";
  /** a fillet of one edge whose size changes along it (`in_406`): `value` is the size at the start of the edge and `endTyped` (empty: the same) the size at its other end */
  /** the edges chosen can have a size at each end: none of them is a rim (`in_406`, `in_410`) */
  vary?: boolean;
  /** the edges chosen are rims (a circle): the size changes round the rim, with no end of its own (`in_410`) */
  rimVary?: boolean;
  variable?: boolean;
  endTyped?: string;
  /** a chamfer with a distance along each face (`dec_chamfer_two_distances`): `typed` is the distance along the face that is highlighted, `endTyped` the one along the other; `dfaceIx` is which of the faces the edges share it is */
  twoDist?: boolean;
  dfaceIx?: number;
  /** the number being typed is the end one (Tab switches) */
  /** a size at the middle of the edge too, and which of the three numbers is being typed: 0 the start, 1 the end, 2 the middle (Tab goes round, `in_410`) */
  midTyped?: string;
  /** and at a quarter and three quarters of the way along (`in_410`) */
  q1Typed?: string;
  q3Typed?: string;
  varField?: 0 | 1 | 2 | 3 | 4;
  /** rotate: the point it turns about (the rotator's centre; you can move it) */
  pivot: Vec3 | null;
  /** move and rotate: the body, or a drawn shape (its corners are `parts`, its plane is `plane`) */
  target: "body" | "shape" | "plane" | "part";
  /** a corner, an edge or a face of the body moved or turned (`target` "part", `dec_direct_shape_editing`): the corners it is made of as it began, the body they are in (its name when there are several) and where the steps made since began */
  sub?: Vec3[];
  bodyId?: string;
  plane: Ref | null;
  /** the operation came from selecting something (its handle showed up by itself): it ends when the drag does, instead of staying open */
  auto: boolean;
  /** dimension: what the number is called and its unit */
  field?: string;
  unit?: string;
}

export const OP_UNIT: Record<OpKind, string> = { mirror: "", loft: "", sweep: "", revolve: "deg", hollow: "mm", extrude: "mm", pushpull: "mm", offset: "mm", edge: "mm", move: "mm", rotate: "deg", scale: "x", dimension: "mm", linear: "mm", circular: "mm", copy: "mm" };
export const OP_FIELD: Record<OpKind, string> = { mirror: "Mirror", loft: "Loft", sweep: "Sweep", revolve: "Angle", hollow: "Wall", extrude: "Distance", pushpull: "Distance", offset: "Offset", edge: "Fillet", move: "Move", rotate: "Angle", scale: "Factor", linear: "Repeat", circular: "Repeat", copy: "Repeat", dimension: "Value" };

export type StartResult = { ok: true; op: Op } | { ok: false; why: string };

const centroid = (pts: Vec3[]): Vec3 => scale(pts.reduce((a, p) => add(a, p), [0, 0, 0] as Vec3), 1 / Math.max(1, pts.length));

/** The drawn closed figure in this selection (its face), if the selection is exactly that. */
/** The drawn closed figures selected, when they are all on one plane (a sibling figure, or one inside another, is extruded together with it). */
function drawnFaces(scene: Scene, parts: Part[]): Extract<Part, { kind: "face" }>[] {
  const faces = parts.map((p) => drawnFace(scene, [p]));
  const all = faces.filter((f): f is Extract<Part, { kind: "face" }> => !!f);
  return all.length === parts.length && all.length > 0 && all.every((f) => f.plane === all[0]!.plane) ? all : [];
}

/** The triangles of the closed sketches an extrude or a revolve is made from, and the way a positive depth goes (`in_481`, `in_482`): null for any other operation. */
export function extrudeCap(scene: Scene, op: Op): { tris: number[]; normal: Vec3 } | null {
  if (op.kind !== "extrude" && op.kind !== "revolve" && op.kind !== "sweep") return null;
  if (op.kind !== "sweep" && !op.normal) return null;
  const refs = op.kind === "revolve" && op.revFigs?.length ? op.revFigs.flatMap((f) => f.fig.outer) : op.kind === "sweep" && op.sweepFig ? op.sweepFig.outer : op.parts;
  const parts = refs.map((r) => scene.parts[r]).filter((p): p is Part => !!p);
  const get = lookup(scene);
  const faces = drawnFaces(scene, parts);
  const tris = faces.filter((f, i) => faces.indexOf(f) === i).flatMap((f) => surfaceTriangles(get, f) ?? []);
  if (!tris.length) return null;
  const [a, b, c] = [0, 1, 2].map((k) => [tris[3 * k]!, tris[3 * k + 1]!, tris[3 * k + 2]!] as Vec3);
  const n = cross(sub(b!, a!), sub(c!, a!));
  return { tris, normal: op.normal ?? (Math.hypot(...n) > 1e-12 ? ([n[0] / Math.hypot(...n), n[1] / Math.hypot(...n), n[2] / Math.hypot(...n)] as Vec3) : ([0, 0, 1] as Vec3)) };
}

/** Can this thing be one of what an operation that is waiting is given (`in_465`)? A sweep takes a closed sketch (its shape) or a line that is no part of one (its path), a loft closed sketches; any other operation, what it can start from alone. */
export function canPickFor(scene: Scene, kind: OpKind, ref: Ref): boolean {
  const p = scene.parts[ref];
  if (!p) return false;
  if (kind === "sweep") return !!drawnFace(scene, [p]) || (p.kind === "line" && p.origin === "drawn");
  if (kind === "loft") return !!drawnFace(scene, [p]);
  return startOp(scene, [ref], kind).ok;
}

function drawnFace(scene: Scene, parts: Part[]): Extract<Part, { kind: "face" }> | null {
  const first = parts[0];
  if (!first || parts.length !== 1) return null;
  const f = first.kind === "face" ? first : scene.parts[objectOf(scene, first.ref)];
  return f?.kind === "face" && f.origin === "drawn" ? f : null;
}

/** Whatever drawn things are selected, as the parts that move and repeat together: a figure's corners, lines and circle, a selected line with its ends (and an arc's centre), a circle with its centre, a corner. Empty if anything selected is not drawn. */
export function drawnFigure(scene: Scene, parts: Part[]): Ref[] {
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
/** The mover's axes on a flat face or plane (`in_417`, `in_419`): Z is the face's outward normal, X and Y lie across it. Null for anything that is not one flat surface. */
export function surfaceAxes(scene: Scene, part: Part | undefined): [Vec3, Vec3, Vec3] | null {
  if (!part) return null;
  const pl = part.kind === "face" && part.plane ? scene.parts[part.plane] : part;
  if (!pl || pl.kind !== "plane" || pl.curved || pl.rounded || (pl.origin === "body" && !pl.mesh)) return null;
  const n = normalOfPlane(pl);
  const u = normalize(cross(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n));
  return [u, cross(n, u), n];
}
/** The mover put on one flat face or plane has an arrow normal to it (`in_419`). */
export function startOp(scene: Scene, selection: readonly Ref[], kind: OpKind, view: ViewAxes | null = null): StartResult {
  // the cut face of a sheet is a face of the cut view (`in_681`): it is looked at, picked and sketched on; the body is changed through its own faces
  if (selection.some((r) => { const p = scene.parts[r]; return p?.kind === "plane" && !!p.cap; })) return { ok: false, why: "the cut face is only a view of the cut: sketch on it or look at it; put the cutting sheet away to work on the body" };
  const r = startOpMoved(scene, selection, kind, view);
  if (!r.ok || (kind !== "move" && kind !== "rotate") || selection.length !== 1 || (r.op.target !== "body" && r.op.target !== "plane" && r.op.target !== "part")) return r;
  const f = surfaceAxes(scene, scene.parts[selection[0]!]);
  if (f && f[2].filter((c) => Math.abs(c) > 1 - 1e-6).length === 1) return r; // (a face across a world axis: the arrows are already along it)
  return f ? { ...r, op: { ...r.op, frame: f, axis: 2 } } : r;
}
function startOpMoved(scene: Scene, selection: readonly Ref[], kind: OpKind, view: ViewAxes | null = null): StartResult {
  const r = startOpBare(scene, selection, kind, view);
  if (!r.ok || r.op.kind !== "move" || (r.op.target !== "body" && r.op.target !== "plane")) return r; // (a part of the body has its own start)
  const from = moveCentre(scene, r.op);
  return from ? { ...r, op: { ...r.op, from, stepsAt: scene.steps.length } } : r;
}
function startOpBare(scene: Scene, selection: readonly Ref[], kind: OpKind, view: ViewAxes | null): StartResult {
  // the wall of a hole or a post is moved or turned by moving or turning the circle that made it (`in_405`)
  const behind = kind === "move" || kind === "rotate" ? figureBehindFace(scene, selection) : null;
  if (behind) {
    const r = startOpBare(scene, behind, kind, view);
    // a hole is moved along its own axis to begin with (that is the move that takes it through the part): the world axis its circle's plane faces along, if it is one
    const circle = scene.parts[behind[0]!];
    const pl = circle?.kind === "circle" && circle.plane ? scene.parts[circle.plane] : undefined;
    if (r.ok && kind === "move" && pl?.kind === "plane") {
      const n = normalOfPlane(pl);
      const k = [0, 1, 2].reduce((b, i) => (Math.abs(n[i]!) > Math.abs(n[b]!) ? i : b), 0) as 0 | 1 | 2;
      if (Math.abs(n[k]!) > 0.999) return { ...r, op: { ...r.op, axis: k } };
    }
    return r;
  }
  const get = lookup(scene);
  const parts = selection.map((r) => get(r)).filter((p): p is Part => !!p);
  // a piece of a figure that lines cut up shares its sides with the other pieces: it can be extruded (or offset nowhere), but moved, turned, scaled or repeated only by selecting the lines and points themselves
  // (an offset only reads the piece's outline and draws a new figure beside it, so a piece can be offset, `in_232`)
  if (["move", "rotate", "scale", "linear", "circular", "copy"].includes(kind) && parts.some((p) => p.kind === "face" && p.pieces)) return { ok: false, why: "this is one piece of a shape cut by lines, and it shares its sides with the other pieces: select the lines and points to move, turn, scale or repeat them (or extrude the piece)" };
  const base: Omit<Op, "parts"> = { kind, typed: "", value: null, axis: kind === "rotate" ? view?.normal ?? 2 : kind === "move" ? view?.right ?? 0 : 0, origin: null, normal: null, pivot: null, target: "body", plane: null, auto: false, made: false, rot: ["", "", ""], pat: [] };
  if (kind === "hollow") {
    // the body made hollow (`in_391`, `in_393`): the faces selected are the open ones (`in_394`: as first made) and every other face is a wall; a body selected with no face is hollowed with no opening; the arrow goes into the body for a wall
    // inside and the other way for a wall outside; the switch by the handles makes the selected faces the open ones instead
    const bodyPart = parts.find((p) => p.kind === "body");
    if (bodyPart && bodyPart.kind === "body") {
      const lo = bodyPart.bbox?.min;
      const hi = bodyPart.bbox?.max;
      if (!lo || !hi) return { ok: false, why: "there is no body to make hollow" };
      return { ok: true, op: { ...base, parts: [bodyPart.ref], origin: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[2]], normal: [0, 0, -1], hollowMode: "closed", openFaces: "" } };
    }
    const flats = parts.filter((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !!p.mesh && p.mesh.length >= 9 && !p.rounded && !p.curved);
    if (!flats.length || flats.length !== parts.length) return { ok: false, why: "select the whole body to hollow it closed, or the flat faces to leave open (the others are the walls)" };
    const info = flats.map((f) => {
      const pts: Vec3[] = [];
      for (let i = 0; i + 2 < f.mesh!.length; i += 3) pts.push([f.mesh![i]!, f.mesh![i + 1]!, f.mesh![i + 2]!]);
      const n = normalOfPlane(f);
      const c = centroid(pts);
      return { f, n, c };
    });
    const first = info[0]!;
    const openFaces = info.map((x) => [...x.n, x.n[0] * x.c[0] + x.n[1] * x.c[1] + x.n[2] * x.c[2], ...x.c].map((v) => Math.round(v * 1e6) / 1e6).join(",")).join(";");
    return { ok: true, op: { ...base, parts: flats.map((f) => f.ref), origin: first.c, normal: scale(first.n, -1), openFaces, hollowMode: "open" } };
  }
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
  if (kind === "mirror") {
    // a drawn figure or a body copied as its reflection in a plane (`in_433`); with a body, a flat face selected too is the plane
    const drawn = drawnFigure(scene, parts);
    const figure: Ref[] | null = drawn.length ? drawn : null;
    const planes = new Set(drawn.map((r) => scene.parts[r]?.plane).filter(Boolean));
    if (planes.size > 1) return { ok: false, why: "select things that lie on one plane" };
    const faceParts = figure ? [] : parts.filter((p) => p.kind === "plane" && p.origin === "body");
    const face = faceParts.length === 1 ? surfaceAxes(scene, faceParts[0]) : null;
    const bodyPart = figure ? undefined : parts.find((p) => p.kind === "body" || p.origin === "body");
    const body = bodyPart ? objectOf(scene, bodyPart.ref) : null;
    let box: { lo: Vec3; hi: Vec3 } | null = null;
    let targetParts: Ref[];
    if (figure) {
      const pts: Vec3[] = [];
      for (const r of figure) { const p = scene.parts[r]; if (p?.kind === "corner") pts.push(p.at); if (p?.kind === "circle") { const c = scene.parts[p.center]; if (c?.kind === "corner") for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const q: Vec3 = [...c.at] as unknown as Vec3; (q as unknown as number[])[i] = c.at[i]! + s * p.radius; pts.push(q); } } }
      if (pts.length) box = { lo: [0, 1, 2].map((i) => Math.min(...pts.map((q) => q[i]!))) as unknown as Vec3, hi: [0, 1, 2].map((i) => Math.max(...pts.map((q) => q[i]!))) as unknown as Vec3 };
      targetParts = figure;
    } else {
      const one = body ? scene.parts[body] : undefined;
      const bb = one?.kind === "body" && one.bbox ? one.bbox : null;
      if (bb) box = { lo: bb.min, hi: bb.max };
      else { const pts = Object.values(scene.parts).filter((p) => p.kind === "corner" && p.origin === "body").map((p) => (p as { at: Vec3 }).at); if (pts.length) box = { lo: [0, 1, 2].map((i) => Math.min(...pts.map((q) => q[i]!))) as unknown as Vec3, hi: [0, 1, 2].map((i) => Math.max(...pts.map((q) => q[i]!))) as unknown as Vec3 }; }
      targetParts = [one?.kind === "body" ? body! : BODY_OBJECT];
    }
    if (!box) return { ok: false, why: "select the body or something drawn to mirror" };
    let facePlane: { p: Vec3; n: Vec3 } | null = null;
    if (face && faceParts[0]?.kind === "plane" && faceParts[0].mesh && faceParts[0].mesh.length >= 9) { const m = faceParts[0].mesh; facePlane = { p: [(m[0]! + m[3]! + m[6]!) / 3, (m[1]! + m[4]! + m[7]!) / 3, (m[2]! + m[5]! + m[8]!) / 3], n: face[2] }; }
    const st0 = mirrorStart(box, facePlane, (view?.right ?? 0) as 0 | 1 | 2);
    const flat = !!figure;
    const axis = flat && box.hi[st0.axis]! - box.lo[st0.axis]! < 1e-6 ? ([0, 1, 2].find((i) => box!.hi[i]! - box!.lo[i]! > 1e-6) as 0 | 1 | 2 | undefined) ?? st0.axis : st0.axis; // (across a flat figure's own plane the copy would lie on it)
    return { ok: true, op: { ...base, parts: targetParts, target: figure ? "plane" : "body", plane: [...planes][0] ?? null, mirrorBox: box, mirrorAt: st0.at, mirrorAxis: axis, mirrorFlat: flat } };
  }
  if (kind === "loft") {
    // two or more closed sketches, on planes of their own, joined side to side in the order picked (`dec_loft_sketches`)
    const faces = parts.map((p) => drawnFace(scene, [p]));
    if (parts.length < 2 || faces.some((f) => !f)) return { ok: false, why: "select two or more closed sketches (figures drawn on planes) to loft through, in the order they are to be joined" };
    const figs = (faces as Extract<Part, { kind: "face" }>[]).filter((f, i, all) => all.indexOf(f) === i && !all.some((g) => g !== f && (g.holes ?? []).includes(f.ref))).map((f) => figureOf(scene, f));
    if (figs.length < 2) return { ok: false, why: "select two or more closed sketches to loft through" };
    return { ok: true, op: { ...base, parts: figs[0]!.outer, loftFigs: figs, loftShift: figs.map(() => 0), loftRev: figs.map(() => false) } };
  }
  if (kind === "sweep") {
    // one closed sketch and, with it, the lines and arcs of the path it is carried along (`dec_sweep`)
    const shapes = parts.filter((p) => !!drawnFace(scene, [p]));
    const lines = parts.filter((p) => p.kind === "line" && !drawnFace(scene, [p]));
    if (shapes.length !== 1 || !lines.length || shapes.length + lines.length !== parts.length) return { ok: false, why: "select one closed sketch and the lines and arcs of the path to carry it along" };
    const path = walkPath(lookup(scene), lines.map((l) => l.ref));
    if (!path.ok) return { ok: false, why: path.why };
    const fig = figureOf(scene, drawnFace(scene, [shapes[0]!])!);
    return { ok: true, op: { ...base, parts: fig.outer, sweepFig: fig, sweepLines: lines.map((l) => l.ref), sweepPlace: "path" } };
  }
  if (kind === "revolve") {
    // closed figures turned about a line in their plane, any angle, with an advance for a spiral (`dec_spiral_extrude`): the line selected with them, a world axis in their plane, or one of their own sides; a figure
    // drawn inside another is a hole in it; several figures are a step each
    const lines = parts.filter((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "drawn");
    const all = drawnFaces(scene, parts.filter((p) => p.kind !== "line"));
    const faces = all.filter((f) => !all.some((g) => g !== f && (g.holes ?? []).includes(f.ref)));
    const face = faces[0];
    if (!face) return { ok: false, why: "select a closed figure first (and a line in its plane to turn it about, if you like)" };
    const pl = face.plane ? get(face.plane) : undefined;
    if (!pl || pl.kind !== "plane") return { ok: false, why: "the figure is not on a plane" };
    const start = revolveStart(scene, faces, lines);
    if (!start) return { ok: false, why: "the figure is not on a plane" };
    const revFigs = faces.map((f) => ({ fig: figureOf(scene, f), middle: middleOf(scene, f) ?? [0, 0, 0] as Vec3 }));
    return { ok: true, op: { ...base, parts: revFigs[0]!.fig.outer, origin: revFigs[0]!.middle, normal: normalOfPlane(pl), plane: face.plane, revFigs, pivot: start.pivot, frame: start.frame, axis: 0, value: 90, advTyped: "", advValue: null, revField: 0 } };
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
      const centre = l.circle ? l.circle.center : null; // (only a circle has a centre to point out from: another curve is pointed across where it is, below, `in_375`) // (a whole rim is one closed edge: its ends are the same point, so the circle itself says where the middle is)
      if (m && centre) {
        // out of the corner is away from the axis for a post and towards it for a hole (the air is inside a hole)
        const wall = l.circle ? Object.values(scene.parts).find((q) => q.kind === "plane" && q.origin === "body" && !!q.curved && Math.abs(q.curved.radius - l.circle!.radius) < 1e-3 && [0, 1, 2].every((i) => i === q.curved!.axis || Math.abs(q.curved!.center[i]! - l.circle!.center[i]!) < 1e-3)) : undefined;
        const out = normalize(sub(m, centre));
        return [{ mid: m, dir: edgeDirection(scene, pa.at, pb.at, wall && wall.kind === "plane" && wall.curved && !wall.curved.convex ? scale(out, -1) : out) }];
      }
      if (m) return [{ mid: m, dir: edgeDirection(scene, pa.at, pb.at) }]; // (a curve that is not a circle: the arrow stands on the curve, in the middle of it)
      return [{ mid: add(pa.at, scale(sub(pb.at, pa.at), 0.25)), dir: edgeDirection(scene, pa.at, pb.at) }];
    });
    return { ok: true, op: { ...base, vary: lines.length > 0 && (lines.every((l) => l.kind === "line" && !l.circle && l.a !== l.b) || lines.every((l) => l.kind === "line" && !!l.circle && l.a === l.b)), rimVary: lines.length > 0 && lines.every((l) => l.kind === "line" && !!l.circle && l.a === l.b), parts: lines.map((p) => p.ref), edges, ranks: rimRanks(scene, lines.map((p) => p.ref)), sigs: edgeSignatures(scene, lines.map((p) => p.ref)) } }; // no size yet: drag the double arrow, or type one
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
  // a corner, an edge or a face of the body (not the whole body): it takes the corners it is made of with it and the body is shaped (`dec_direct_shape_editing`)
  if ((kind === "move" || kind === "rotate") && parts.length && !parts.some((p) => p.kind === "body") && parts.every((p) => p.origin === "body")) {
    const got = partCorners(scene, parts);
    if (!got.ok) return got;
    const mid = [0, 1, 2].map((i) => got.corners.reduce((a, q) => a + q[i]!, 0) / got.corners.length) as unknown as Vec3;
    const id = bodyIdOf(scene, got.body);
    return { ok: true, op: { ...base, parts: parts.map((p) => p.ref), target: "part", sub: got.corners, ...(id ? { bodyId: id } : {}), pivot: kind === "rotate" ? mid : null, from: mid, stepsAt: scene.steps.length } };
  }
  // move, rotate, scale: the whole body, or (move and rotate) a drawn closed figure
  const body = parts.find((p) => p.kind === "body" || p.origin === "body");
  if (body) {
    // several bodies selected move together (`in_345`): each is moved by the same
    if (kind === "move") {
      const all = [...new Set(parts.filter((p) => p.kind === "body" || p.origin === "body").map((p) => objectOf(scene, p.ref)).filter((r) => scene.parts[r]?.kind === "body" && r !== BODY_OBJECT))];
      if (all.length > 1) return { ok: true, op: { ...base, parts: all, pivot: null } };
    }
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

/** The size at the other end of a fillet or chamfer that changes along its edges (each edge from its own first end, `in_406`, `in_410`), or null when it is the same all along. */
/** The size at the middle of the edge, when one is given (the round then goes through the start, the middle and the end sizes, `in_410`), else null. */
function variableMid(op: Op, v: number): number | null {
  if (!op.variable || !op.vary || op.kind !== "edge" || v === 0 || variableEnd(op, v) === null) return null;
  const t = typedLength(op.midTyped ?? "");
  return t !== null && t > 0 ? t : null;
}
/** The sizes typed at a quarter and at three quarters of the way along the edges (`in_410`), as the step's `q1` and `q3` (only when the size at the other end is given too). */
function variableQuarters(op: Op, v: number): { q1?: number; q3?: number } {
  if (!op.variable || !op.vary || op.kind !== "edge" || v === 0 || variableEnd(op, v) === null) return {};
  const [a, b] = [typedLength(op.q1Typed ?? ""), typedLength(op.q3Typed ?? "")];
  return { ...(a !== null && a > 0 ? { q1: a } : {}), ...(b !== null && b > 0 ? { q3: b } : {}) };
}
/** The flat faces all of an operation's straight edges lie on: the ones a chamfer's first distance can be measured along, each as a part and as the kernel names it (`n,d,point`). */
export function chamferFaces(scene: Scene, op: Op): { ref: Ref; spec: string }[] {
  if (op.kind !== "edge" || !op.parts.length) return [];
  const per = op.parts.map((r) => facesOfEdge(scene, r));
  const common = (per[0] ?? []).filter((f) => per.every((list) => list.some((g) => g.ref === f.ref)));
  return common.map((f) => {
    const n = normalOfPlane(f);
    const m = f.mesh!;
    const point = [(m[0]! + m[3]! + m[6]!) / 3, (m[1]! + m[4]! + m[7]!) / 3, (m[2]! + m[5]! + m[8]!) / 3];
    return { ref: f.ref, spec: [...n, dot(n, f.at), ...point].join(",") };
  }).sort((a, b) => (a.ref < b.ref ? -1 : 1)); // (a fixed order, so the swap goes between the same two faces)
}
/** The face the first distance is measured along: the one chosen (the swap goes round them), else the first. */
export const chosenFace = (scene: Scene, op: Op): { ref: Ref; spec: string } | null => {
  const faces = chamferFaces(scene, op);
  return faces.length ? faces[(op.dfaceIx ?? 0) % faces.length]! : null;
};
function variableEnd(op: Op, v: number): number | null {
  if (!op.variable || !op.vary || op.kind !== "edge" || v === 0) return null;
  // round a rim there is no end: the size comes back to where it began, so the end is the start, and the rim changes only if a size is given somewhere round it
  if (op.rimVary) return [op.midTyped, op.q1Typed, op.q3Typed].some((x) => typedNumber(x ?? "") !== null) ? Math.abs(v) : null;
  const t = typedLength(op.endTyped ?? "");
  return t !== null && t > 0 && Math.abs(t - Math.abs(v)) > 1e-9 ? t : null;
}
/** The number the operation will use: what was typed, else the pointer's or default value. */
export const valueOf = (op: Op): number | null => {
  const t = (op.unit ?? OP_UNIT[op.kind]) === "mm" ? typedLength(op.typed) : typedNumber(op.typed); // (a length is typed in the number system in use: the model keeps millimetres, `in_661`)
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
    const inches = units.system === "in" && (op.unit ?? OP_UNIT[op.kind]) === "mm"; // (the same small step, in the system in use: a tenth of a millimetre, a hundredth of an inch, `in_661`)
    const step = (op.kind === "edge" ? settings.op.sizeStep : settings.op.distanceStep) * (inches ? 2.54 : 1) * (key === "ArrowUp" ? 1 : -1);
    return { ...op, typed: "", value: Math.round(((valueOf(op) ?? 0) + step) * 1e6) / 1e6 };
  } else return op;
  return { ...op, typed: t };
}

/** The step that does it (one command, one undo). Null while there is no number yet. */
/** The face a push / pull works on, as numbers kept in the step: the body is changed by later steps (another push, a turn) so its named faces move, but this step always meant the face as it was. */
/** The lasting name of a flat face of the body, kept in a push or pull so it finds the face again after an earlier step is changed or another is put before it (`dec_stable_reference_mechanism`). */
const stableName = (scene: Scene, ref: Ref | undefined): Record<string, string> => { const p = ref ? scene.parts[ref] : undefined; return p?.kind === "plane" && p.stable ? { fname: p.stable } : {}; };
/** The lasting names of the edges of a fillet or chamfer, joined by `;` and in the order of its parts (empty where an edge has none): kept in the step so it finds its edges after an earlier step is changed. */
const stableEdges = (scene: Scene, refs: readonly Ref[]): Record<string, string> => { const names = refs.map((r) => { const p = scene.parts[r]; return p?.kind === "line" && p.stable ? p.stable : ""; }); return names.some(Boolean) ? { enames: names.join(";") } : {}; };
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
  for (const st of scene.steps) if (st.type === "rotate") m = then(m, st.params.dx !== undefined ? aboutDir([Number(st.params.dx), Number(st.params.dy), Number(st.params.dz)], Number(st.params.value ?? 0)) : about(Number(st.params.axis ?? 0) as 0 | 1 | 2, Number(st.params.value ?? 0)));
  return m;
}
/** The three angles of the body's turn, with the turn being dragged or typed on top of it (what the bubble shows and sets). */
export function turnAngles(scene: Scene, op: Op): Angles {
  const live = valueOf(op);
  const now = op.target === "plane" ? planeTurn(scene, op) : bodyTurn(scene);
  return anglesOf(live !== null && (op.target === "body" || op.target === "plane") ? then(now, op.frame ? aboutDir(axisVec(op), live) : about(op.axis, live)) : now);
}
/** How a drawn figure's plane is turned: the turn that takes the world axes onto its directions (its first, its second and its normal). */
function planeTurn(scene: Scene, op: Op): Mat3 {
  const first = op.parts.map((r) => scene.parts[r]).find((p) => p?.kind === "corner");
  const pl = first?.plane ? scene.parts[first.plane] : undefined;
  if (!pl || pl.kind !== "plane") return IDENTITY;
  const [u, v, n] = [pl.u, pl.v, normalOfPlane(pl)];
  return [u[0], v[0], n[0], u[1], v[1], n[1], u[2], v[2], n[2]];
}
/**
 * A gear moved or turned (`in_578`): its parts are made from its record, so the move changes the record: the centre goes where the move takes it and the gear turns by what the turns turn it about its plane's
 * axis. A gear stays in its plane: a move across the plane, or a turn about another axis, is not made (null).
 */
function gearCommand(scene: Scene, op: Op, rec: GearRecord, turns: { axis: 0 | 1 | 2; angle: number }[], translate: Vec3, pivot: Vec3): Command | null {
  const pl = scene.parts[rec.plane];
  const set = planetaryOfGear(scene, rec.id); // (a gear of a planetary set moves and turns with the whole set, `dec_planetary_gears`)
  if (!pl || pl.kind !== "plane" || op.parts.some((r) => { const g = gearOfPart(scene, r); return set ? !g || planetaryOfGear(scene, g.id)?.id !== set.id : g?.id !== rec.id; })) return null;
  const anchor: { at: Vec3; turn?: number } = set ?? rec;
  const n = normalOfPlane(pl);
  const rot = (m: Mat3, v: Vec3): Vec3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  let [c, u, nn]: [Vec3, Vec3, Vec3] = [anchor.at, pl.u, n];
  for (const t of turns) { const m = about(t.axis, t.angle); c = add(pivot, rot(m, sub(c, pivot))); u = rot(m, u); nn = rot(m, nn); }
  c = add(c, translate);
  if (Math.abs(dot(sub(c, anchor.at), n)) > 1e-6 || Math.abs(dot(nn, n) - 1) > 1e-9) return null;
  const delta = Math.atan2(dot(u, pl.v), dot(u, pl.u));
  const corners = new Set(op.parts.filter((r) => scene.parts[r]?.kind === "corner"));
  const released = scene.relations.filter((r) => r.kind === "fixed" && r.parts.every((q) => corners.has(q)));
  const turn = (anchor.turn ?? 0) + delta;
  const place = { at: c, turn: Math.abs(turn) < 1e-12 ? 0 : turn };
  return { type: "batch", commands: [...released.map((r): Command => ({ type: "removeRelation", id: r.id })), set ? { type: "setPlanetary", id: set.id, spec: set.spec, ...place } : { type: "setGear", id: rec.id, spec: rec.spec, ...place }] };
}
/** Moving or turning a drawn figure with its plane: `transformFigure`, and the corners it pinned in place let go (one command, so one undo). */
function figureCommand(scene: Scene, op: Op, turns: { axis: 0 | 1 | 2; angle: number }[], translate: Vec3): Command | null {
  const corners = new Set(op.parts.filter((r) => scene.parts[r]?.kind === "corner"));
  const pts = op.parts.map((r) => scene.parts[r]).filter((p): p is Extract<Part, { kind: "corner" }> => p?.kind === "corner").map((p) => p.at);
  if (!pts.length) return null;
  const pivot = op.pivot ?? centroid(pts);
  const gear = op.parts.length ? gearOfPart(scene, op.parts[0]!) : undefined;
  if (gear) return gearCommand(scene, op, gear, turns, translate, pivot);
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
  // several bodies dragged together (`in_345`): each is moved by the same, one after another, so each step has its own number and its own sketches carried
  if (op.target === "body" && op.kind === "move" && op.free && op.parts.length > 1 && op.parts.every((r) => scene.parts[r]?.kind === "body")) {
    let sc = scene;
    const all: Command[] = [];
    for (const b of op.parts) {
      const c = opCommand(sc, { ...op, parts: [b] }, opts);
      if (!c) continue;
      all.push(c);
      const next = apply(sc, c);
      if (next.ok) sc = next.value;
    }
    return all.length ? { type: "batch", commands: all } : null;
  }
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
  if (op.kind === "mirror") return mirrorCommand(scene, op);
  if (op.kind === "sweep") return sweepCommand(scene, op); // (no number: the shape and its path)
  if (op.kind === "loft") return loftCommand(scene, op); // (no number: the sketches, and how they are joined)
  const v = valueOf(op);
  if (v === null) return null;
  if (op.kind === "offset") return op.off ? offsetCommand(scene, op.off, v) : null;
  const id = nextId(scene, "s");
  if (op.kind === "hollow") return v !== 0 && (op.hollowMode === "closed" || op.openFaces) ? { type: "addStep", step: { id, type: "hollow", parts: [], params: { thickness: v, mode: op.hollowMode ?? "open", faces: op.openFaces ?? "" } } } : null; // (a wall inward is positive, outward negative)
  if (op.kind === "dimension") {
    const a = measureAction(actionsFor(scene, op.parts), (x) => x.enabled);
    return a && v > 0 ? a.run(v) : null;
  }
  if (op.kind === "revolve") return revolveCommand(scene, op, v);
  if (op.kind === "extrude") {
    if (v === 0) return null;
    // separate figures selected together are extruded in one go but each is a step, and so a body, of its own, with its own height (`in_353`); a hole inside a figure stays with it
    const figs = figuresOf({ id, type: "extrude", parts: op.parts, params: op.figs ?? {} });
    if (figs.length < 2) return { type: "addStep", step: { id, type: "extrude", parts: op.parts, params: { depth: v, ...(op.figs ?? {}) } } };
    const { holes: _h, also: _a, ...rest } = op.figs ?? {};
    const first = Number(id.slice(id.lastIndexOf("_") + 1));
    return { type: "batch", commands: figs.map((f, i): Command => ({ type: "addStep", step: { id: formatId("s", first + i), type: "extrude", parts: f.outer, params: { depth: v, ...figureParams([f]), ...rest } } })) };
  }
  if (op.kind === "pushpull" && op.faces && op.faces.length > 1) {
    if (v === 0) return null;
    return { type: "batch", commands: op.faces.map((f, k): Command => ({ type: "addStep", step: { id: `${id}f${k}`, type: "pushPull", parts: [op.parts[k]!], params: { depth: v, ...faceParams({ ...op, normal: f.normal, origin: f.origin }), ...stableName(scene, op.parts[k]), ...(op.faceKind === "extend" ? { extend: 1 } : {}) } } })) };
  }
  if (op.kind === "pushpull" && op.edit && !op.noEdit && (op.faceKind ?? "move") === "move") return v === 0 ? null : editCommand(scene, op.edit, v);
  if (op.kind === "pushpull") return v === 0 ? null : { type: "addStep", step: { id, type: "pushPull", parts: op.parts, params: { depth: v, ...faceParams(op), ...stableName(scene, op.parts[0]), ...(op.faceKind === "extend" ? { extend: 1 } : {}) } } };
  // one operation, two results: a positive size is a fillet, a negative one a chamfer of that size (drag the double arrow one way or the other, or type a minus)
  if (op.kind === "edge" && op.twoDist && v !== 0) { // a chamfer with a distance along each face (`dec_chamfer_two_distances`)
    const face = chosenFace(scene, op);
    if (!face) return null;
    const second = typedLength(op.endTyped ?? "");
    return { type: "addStep", step: { id, type: "edgeMod", parts: op.parts, params: { mode: "chamfer", value: Math.abs(v), d2: second !== null && second > 0 ? second : Math.abs(v), face: face.spec, ...(op.ranks ? { ranks: op.ranks } : {}), ...(op.sigs ? { sigs: op.sigs } : {}) , ...stableEdges(scene, op.parts) } } };
  }
  if (op.kind === "edge") return v === 0 ? null : { type: "addStep", step: { id, type: "edgeMod", parts: op.parts, params: { mode: v > 0 ? "fillet" : "chamfer", value: Math.abs(v), ...(variableEnd(op, v) !== null ? { end: variableEnd(op, v)! } : {}), ...(variableMid(op, v) !== null ? { mid: variableMid(op, v)! } : {}), ...variableQuarters(op, v), ...(op.ranks ? { ranks: op.ranks } : {}), ...(op.sigs ? { sigs: op.sigs } : {}), ...stableEdges(scene, op.parts) } } };
  if (op.kind === "scale" && op.target === "shape" && !op.axes) return v <= 0 ? null : scaleShapeCommand(scene, op, v);
  if (op.kind === "scale" && op.axes) {
    // factors along the axes alone (`dec_scale_axes`): the recipe is stretched, about the middle of the body
    const f: [number, number, number] = [...op.axes] as [number, number, number];
    if (op.typed !== "") f[op.axis] = v;
    if (f.some((k) => !(k > 0))) return null;
    if (f.every((k) => Math.abs(k - 1) < 1e-9)) return null;
    const bp = scene.parts[op.parts[0]!];
    if (op.target === "shape") return op.pivot ? { type: "stretch", factors: f, pivot: op.pivot, parts: op.parts } : null; // (a drawn figure alone)
    const pivot = op.pivot ?? bodyCentre(scene, op.parts[0]);
    const body = bp?.kind === "body" && bp.ref !== BODY_OBJECT && bp.id ? { body: bp.id } : {}; // (one body of several: only it is stretched)
    return pivot ? { type: "stretch", factors: f, pivot, ...body } : null;
  }
  if (op.kind === "scale") {
    if (v <= 0) return null;
    // the whole body: about the middle of its box, and the sketches that made it carried along, made as many times bigger (`in_204`, `in_205`)
    const pivot = op.pivot ?? bodyCentre(scene, op.parts[0]);
    if (!pivot) return { type: "addStep", step: { id, type: "scale", parts: op.parts, params: { axis: 0, value: v } } };
    const step: Command = { type: "addStep", step: { id, type: "scale", parts: op.parts, params: { axis: 0, value: v, px: pivot[0], py: pivot[1], pz: pivot[2], follow: 1 } } };
    const carry = carrySketches(scene, [], [0, 0, 0], pivot, v, op.carryOnly);
    return carry.length ? { type: "batch", commands: [step, ...carry] } : step;
  }
  if (op.target === "part") return reshapeCommand(scene, op, v, axisVec(op));
  if (op.target === "plane") {
    if (v === 0) return null;
    return op.kind === "rotate" ? figureCommand(scene, op, op.frame ? eulerTurns(axisVec(op), v) : [{ axis: op.axis, angle: v }], [0, 0, 0]) : figureCommand(scene, op, [], scale(axisVec(op), v));
  }
  const pivotAt = op.kind === "rotate" ? (op.pivot ?? (op.frame && op.target === "body" ? bodyCentre(scene, op.parts[0]) : null)) : null; // (a turn about the mover's own axes needs its place, the middle of the body unless it has been put elsewhere)
  const pivot: Record<string, number> = pivotAt ? { px: pivotAt[0], py: pivotAt[1], pz: pivotAt[2] } : {};
  if (v === 0) return null;
  // the whole body: the step, and the sketches that made it carried along with it (`in_204`)
  const carried = op.kind === "move" || (op.kind === "rotate" && !!pivotAt);
  const dir = axisVec(op);
  // the mover turned: a move is by a vector, a turn is about an axis that is given (`in_417`)
  const along: Record<string, number> = !op.frame ? { axis: op.axis, value: v } : op.kind === "move" ? { axis: 0, value: 0, vx: dir[0] * v, vy: dir[1] * v, vz: dir[2] * v } : { axis: op.axis, value: v, dx: dir[0], dy: dir[1], dz: dir[2] };
  const step: Command = { type: "addStep", step: { id, type: op.kind as "move" | "rotate", parts: op.parts, params: { ...along, ...pivot, ...(carried ? { follow: 1 } : {}) } as Record<string, number> } };
  if (!carried || op.target !== "body") return step;
  const carry = op.kind === "move" ? carrySketches(scene, [], scale(dir, v), [0, 0, 0], 1, op.carryOnly) : carrySketches(scene, op.frame ? eulerTurns(dir, v) : [{ axis: op.axis, angle: v }], [0, 0, 0], pivotAt!, 1, op.carryOnly);
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
  if (op.kind === "scale" && op.axes) return null; // (a stretch along axes is not a matrix of the graphics card: the kernel shows it)
  if (op.kind === "move" && op.free) return motionOf({ id: "s_x", type: "move", parts: op.parts, params: { axis: 0, value: 0, vx: op.free[0], vy: op.free[1], vz: op.free[2] } });
  const v = valueOf(op);
  if (v === null) return null;
  if (op.kind === "scale" && v <= 0) return null;
  const dir = axisVec(op);
  if (op.kind === "move") return motionOf({ id: "s_x", type: "move", parts: op.parts, params: op.frame ? { axis: 0, value: 0, vx: dir[0] * v, vy: dir[1] * v, vz: dir[2] * v } : { axis: op.axis, value: v } });
  const pivot = op.pivot ?? bodyCentre(scene, op.parts[0]);
  if (!pivot) return null;
  return motionOf({ id: "s_x", type: op.kind, parts: op.parts, params: { axis: op.kind === "scale" ? 0 : op.axis, value: v, px: pivot[0], py: pivot[1], pz: pivot[2], ...(op.frame && op.kind === "rotate" ? { dx: dir[0], dy: dir[1], dz: dir[2] } : {}) } });
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
/** The direction of the axis the operation works along or about: the mover's own axis when it has been turned, else the world's (`in_417`). */
const axisVec = (op: Op): Vec3 => op.frame ? op.frame[op.axis] : ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[])[op.axis]!;
/** A turn about any axis as the turns about X, Y, Z one after another that make it (what a drawn figure is turned by). */
const eulerTurns = (dir: Vec3, angle: number): { axis: 0 | 1 | 2; angle: number }[] => anglesOf(aboutDir(dir, angle)).map((a, k) => ({ axis: k as 0 | 1 | 2, angle: a })).filter((t) => Math.abs(t.angle) > 1e-9);

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
export const isLive = (op: Op): boolean => !op.auto && (op.kind === "extrude" || op.kind === "pushpull" || op.kind === "edge" || op.kind === "offset" || op.kind === "hollow" || op.kind === "revolve" || (op.kind === "scale" && !!op.axes)); // (a stretch along axes: the factors are totals, so a later pull takes the earlier one out and makes it again, not on top of it)

/** A face as the figure an extrude uses: its sides (or circle) and those of each figure drawn inside it. */
function figureOf(scene: Scene, face: Extract<Part, { kind: "face" }>): Figure {
  const refs = (f: Extract<Part, { kind: "face" }>): Ref[] => (f.disk ? [f.disk] : f.loop);
  return { outer: refs(face), holes: (face.holes ?? []).flatMap((h) => { const f = scene.parts[h]; return f?.kind === "face" ? [refs(f)] : []; }) };
}

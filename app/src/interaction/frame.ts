// What to draw for the current state: one plain description the view, the chip, the badges and the controls draw from. All the decisions about what is shown
// (the big axes or the compass, which plane's grid, whether badges give way to a tool or operation) are made here, so the UI only draws.
import type { Ref } from "../shared/ref.ts";
import type { Gizmo } from "./gizmo.ts";
import { panelOf } from "./panels.ts";
import { patternCentre, liveRepeat } from "./pattern.ts";
import type { Panel } from "./panels.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import { normalOfPlane } from "../operation/part.ts";
import { planeOf } from "./objects.ts";
import type { Plane } from "../operation/part.ts";
import type { Camera } from "./camera.ts";
import { offsetOf, sideOf } from "./camera.ts";
import { dot, cross, normalize, add, sub } from "../math/vec.ts";
import { apply } from "../operation/commands.ts";
import { outlineOf } from "../operation/part.ts";
import type { KernelResult } from "../compiler/kernel/adapter.ts";
import { scene as sceneOf, selection as selectionOf, previewCommand, undoLast } from "./session.ts";
import type { Session } from "./session.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import { SIMILAR_RULES } from "./similar.ts";
import type { ArcMap } from "./operations.ts";
import { opCommand, bodyMotion, faceDrag, radiusDrag, sideDrag, edgeDrag, arcDrag, valueOf } from "./operations.ts";
import { matrixOf } from "../operation/frames.ts";
import { sharpOfPoints, chainOf, cornerOk, adjacentOk, roundingFaces, tangentChain } from "../operation/roundings.ts";
import type { Sharp, SharpEdge } from "../operation/roundings.ts";
import type { Command } from "../operation/commands.ts";
import type { CompileOutcome } from "../compiler/compile.ts";
import type { AppState } from "./control/state.ts";
import { sketchPlaneOf } from "./control/state.ts";
import { gridPlaneOf } from "./control/viewing.ts";
import { gridFor } from "./grid.ts";
import { WORLD_NAMES, paneCorners } from "./panes.ts";
import type { WorldName } from "./panes.ts";
import { settings } from "../shared/settings.ts";
import type { Grid } from "./grid.ts";
import { annotationsFor, annotationsOf, focusParts } from "./annotations.ts";
import { suggestionsFor } from "./suggest.ts";
import type { Suggestions } from "./suggest.ts";
import type { Annotation } from "./annotations.ts";
import { entryOf, previewFor, repeatEntries, moveEntries } from "./entry.ts";
import { helperOf } from "./pattern.ts";
import type { Entry } from "./entry.ts";
import type { Preview } from "./tools.ts";
import { gizmoOf, activeOp } from "./control/handles.ts";
import type { Op } from "./operations.ts";
import { followed, moveOffset, hasGizmo } from "./gizmo.ts";
import { crossing } from "./boxselect.ts";
import type { Handle } from "./gizmo.ts";

/** A refused change, while it flashes: how far through it is (0 to 1), the constraints it would have broken (red, fading), the ones that tried (they shake), and the parts of the broken ones. */
export interface FlashFrame { t: number; victims: string[]; culprits: string[]; parts: Ref[] }

export interface GizmoFrame { handles: Handle[]; hover: string | null; active: string | null; chosen?: string | null }

export interface Frame {
  scene: Scene;
  mesh: KernelResult["mesh"];
  /** the body is drawn moved by this matrix (16 numbers, column by column) while its move, turn or scale is dragged or waits for the kernel (`in_216`) */
  bodyMatrix: number[] | null;
  /** when the matrix moves one body of several: the triangles (ranges of the mesh's index list) and the box of that body, so only it is moved (`in_273`) */
  bodySplit: { tris: [number, number][]; box: { min: Vec3; max: Vec3 } } | null;
  /** the face (with the walls beside it) drawn moved by this much while it is dragged or waits for the kernel (`in_217`) */
  faceShift: FaceShift | null;
  /** what is selected is the body, so its highlight is moved by the same matrix */
  selectionMoves: boolean;
  highlight: { hover: Ref | undefined; hoverPoint: Vec3 | null; selection: readonly Ref[]; amber: readonly Ref[]; /** the parts of constraints a refused change would have broken, and how red they still are */ red: { refs: readonly Ref[]; alpha: number }; /** the copies a repeat that is open would make, drawn pulsing (`in_244`) */ temp: readonly Ref[]; spread: AppState["spread"]; };
  preview: Preview | null;
  entry: Entry | null;
  /** the several value bubbles of a repeat being set up (one on each axis, or one by the rings) */
  entries: Entry[];
  /** a little bubble of help on an arrow (`in_236`) */
  helper: { at: Vec3; text: string } | null;
  /** the kernel is still working the model out (a picture of it may be a moment old): a "working" sign shows if it takes a while */
  busy: boolean;
  /** the world axis the selected plane or face lies across and which end of it the camera must be at to see it (so that X Y Z button is lit, as + or −) */
  lookHint: { axis: "X" | "Y" | "Z"; sign: 1 | -1 } | null;
  /** where the cursor of a figure being drawn is (a finger uses it: it has a handle to drag it) */
  touchCursor: Vec3 | null;
  /** whether there is something to undo / redo (the undo and redo buttons of a touch screen, `in_283`) */
  undoRedo: { undo: boolean; redo: boolean };
  /** the rectangle of a drag select being drawn, in pixels (`in_230`); `touching`: it was dragged from the right, so what it only touches is picked too */
  box: { x0: number; y0: number; x: number; y: number; touching: boolean } | null;
  /** what the constraint bubbles keep off: the drawn lines and curves (as line pieces) and corners */
  avoid: { segs: [Vec3, Vec3][]; pts: Vec3[] };
  /** the constraints the end of the line being drawn is close to, and where it is */
  hint: { kinds: string[]; at: Vec3 } | null;
  /** the open list (bodies, history) */
  panel: Panel | null;
  /** the constraints of the selected parts, each with the spot it is shown at (on the line, at the vertex, between the lines, at the angle) */
  annotations: Annotation[];
  flash: FlashFrame | null;
  grid: Grid | null;
  /** the body goes see-through while a plane is sketched on, looked at straight, and the body lies between it and the camera (`in_194`) */
  fadeBody: boolean;
  /** the constraints that could be put on the selected parts, as buttons by them (`in_195`) */
  suggest: Suggestions | null;
  /** a little icon by the move arrows of a body (or a drawn figure) that switches to turning it, and by its rings one that switches back (`in_206`) */
  /** the chip that follows "select similar": its rules and how many were selected; there only while the selection is still what it chose (`in_257`) */
  similar: { rules: { id: string; label: string; title: string; on: boolean }[]; count: number; noun: string } | null;
  modeSwitch: { at: Vec3; /** every point of the handles, so the icon can stand at the upper left of them (`in_215`) */ pts: Vec3[]; to: "move" | "rotate"; label: string } | null;
  /** the sketching tool that is on, for the pill at the top (`in_193`) */
  tool: { kind: "rect" | "circle" | "line" | "arc" | "trim"; label: string; /** figures made while it has been on (the chip flashes at each) */ made: number; /** a figure is half drawn (the chip's cross then cancels it) */ drawing: boolean; /** something is made and nothing is half drawn: the chip shows a check that puts the tool away, in place of the cross (`in_283`) */ done: boolean } | null;
  /** a repeat or an operation that is open: the tick (Enter, a right click) and the cross (Esc) are shown for it (`in_244`) */
  confirm: { kind: string; label: string } | null;
  /** the little panes of the world planes beside the axes (`in_190`) */
  panes: { name: WorldName; corners: Vec3[]; active: boolean; hover: boolean }[];
  /** the helper handles of the running operation (arrows, a double arrow, curved arrows), or null */
  gizmo: GizmoFrame | null;
  cursor: "crosshair" | "grab" | "";
  /** the message to show: a refusal, or the first step that failed to build */
  message: string;
}

/** While an operation's number is being set, the scene as it would be after it: the real result (a gray body, a cut, a round) and not a sketch of it. Remembered for the same command. */
let previewProblem: string | null = null;
/**
 * The session as it was before the step the open operation made (the operation's value is the whole of what it did, so it is shown on that). Taking the step back can mean solving the sketch's constraints again,
 * so it is done once for a session and not once for every picture while the view is turned with the arrow still open (`in_247`: 100 ms a picture on a sketch of a hundred constraints).
 */
const undoneMemo = new WeakMap<Session, Session>();
function undone(session: Session): Session {
  let u = undoneMemo.get(session);
  if (!u) { u = undoLast(session); undoneMemo.set(session, u); }
  return u;
}
let memo: { history: Session["history"]; outcome: Session["outcome"]; key: string; value: { scene: Scene; outcome: CompileOutcome } | null } | null = null;
let gpuBase: { history: Session["history"]; outcome: Session["outcome"]; made: boolean; value: { scene: Scene; outcome: CompileOutcome } } | null = null;
/** The step the last drag of a whole-body motion was (its matrix and how many steps came before it): while the kernel is still working its result out, that is what the stale picture is moved by (`in_216`). */
let lastDrag: { split?: Frame["bodySplit"]; matrix: number[] | null; face: FaceShift | null; step: string | null; depth: number; param: "depth" | "value"; circle: { ref: Ref; radius: number } | null; corners: { ref: Ref; to: Vec3 }[] | null; steps: number } | null = null;
/** A face drawn moved: the whole face by `by`, or a round wall's points out from (in towards) its axis by `radial.dr` (`in_217`, `in_218`). */
export type FaceShift = { face: Ref; by?: Vec3; radial?: { center: Vec3; axis: Vec3; dr: number; r0: number }; /** the body's points that stand over moved corners of the sketch (along `axis`) move with them (`in_219`); `edge` is the face's own edge, to move what is selected with it */ arcs?: { arcWall: ArcMap; items: { at: Vec3; by: Vec3 }[] }; rounds?: { k: number; groups: { face: Ref; sharp: Sharp }[] }; columns?: { axis: Vec3; items: { at: Vec3; by: Vec3 }[]; arcWalls: { face: Ref; arc: ArcMap }[]; edge: { a: Vec3; da: Vec3; b: Vec3; db: Vec3 } | null } };
/** The preview of a command, kept while the model, the kernel's answer and the command stay the same (the reference a rounding or a cut is measured from is asked for once, not on every frame). One memo for both (`in_282`). */
function memoPreview(s: AppState, base: Session, cmd: Command, made: unknown): { scene: Scene; outcome: CompileOutcome } | null {
  const key = JSON.stringify([cmd, made]);
  if (refMemo && refMemo.history === s.session.history && refMemo.outcome === s.session.outcome && refMemo.key === key) return refMemo.value;
  const value = previewCommand(base, cmd);
  refMemo = { history: s.session.history, outcome: s.session.outcome, key, value };
  return value;
}

/**
 * A new fillet or chamfer on one straight edge (`in_221`): its cross-section is the same shape at every size, scaled about the sharp edge, so the kernel makes it once at a size (the reference) and
 * every size the pointer goes to after that is that result scaled, on the graphics card. Asked again for a new reference only when the size has grown a lot (so the arc keeps enough points).
 */
let edgeRef: { key: string; want: number; ready: { R0: number; res: { scene: Scene; outcome: CompileOutcome }; groups: { face: Ref; sharp: Sharp }[] } | null; failed: number | null } | null = null;
let refMemo: { history: Session["history"]; outcome: Session["outcome"]; key: string; value: { scene: Scene; outcome: CompileOutcome } | null } | null = null;
function edgeNew(s: AppState, op: Op, base: Session): { wait: true } | { face: FaceShift; shown: { scene: Scene; outcome: CompileOutcome } } | null {
  const sc = sceneOf(base);
  const v = op.kind === "edge" ? valueOf(op) : null;
  if (op.kind !== "edge" || v === null || v === 0 || !op.parts.length) return null;
  // the sharp edges: lines and circles of the body, that meet smoothly if they meet, between faces for which the rounding is the same shape at any size (`in_222`)
  const edges: SharpEdge[] = [];
  // (the kernel rounds along the edges that run on smoothly from the chosen one: they are drawn with it, or they would stay as they were while it changes, `in_231`)
  for (const r of tangentChain(sc, op.parts)) {
    const l = sc.parts[r];
    if (l?.kind !== "line" || l.origin !== "body") return null;
    const [pa, pb] = [sc.parts[l.a], sc.parts[l.b]];
    if (pa?.kind !== "corner" || pb?.kind !== "corner") return null;
    const e = sharpOfPoints(pa.at, pb.at, l.mid ?? null, l.circle);
    if (!e || !adjacentOk(sc, e, l.mid ?? null)) return null;
    // (the two halves of one rim are one circle: it is rounded once)
    const [c, d] = [e.sharp, edges.find((o) => o.sharp.kind === "circle" && e.sharp.kind === "circle" && Math.hypot(...sub(o.sharp.center, e.sharp.center)) < 1e-6 && Math.abs(o.sharp.radius - e.sharp.radius) < 1e-6)];
    if (c.kind === "circle" && d) continue;
    edges.push(e);
  }
  // edges that meet smoothly, or in corners of straight edges between flat faces; the edges between corners longer than the roundings (`in_223`)
  const chain = chainOf(edges, Math.max(Math.abs(v), edgeRef?.want ?? 0), v > 0 ? 2.2 : 4);
  if (!chain || !chain.corners.every((c) => cornerOk(sc, c))) return null;
  const key = JSON.stringify([op.parts, op.ranks ?? null, op.sigs ?? null, v > 0]);
  if (!edgeRef || edgeRef.key !== key) edgeRef = { key, want: Math.abs(v), ready: null, failed: null };
  if (edgeRef.ready && Math.abs(v) > 1.6 * edgeRef.ready.R0 && edgeRef.want !== Math.abs(v)) edgeRef.want = Math.abs(v); // (grown a lot: a new reference, the old one stands in until it is there)
  if (edgeRef.failed === edgeRef.want && !edgeRef.ready) return null;
  const R = edgeRef.want;
  const cmd = opCommand(sc, { ...op, typed: "", value: v > 0 ? R : -R }, { preview: true });
  if (!cmd) return null;
  const res = memoPreview(s, base, cmd, op.made);
  if (res && !res.outcome.kernel?.stale) {
    if (Object.keys(res.outcome.errors).length) { edgeRef.failed = Math.min(edgeRef.failed ?? Infinity, R); if (!edgeRef.ready) return null; }
    else if (!edgeRef.ready || edgeRef.ready.R0 !== R) {
      // the faces the rounding made are small ones the body did not have (a wall that was cut shorter has a new name too, but it runs on far past the rounding); each is the rounding of the nearest edge, and
      // every edge has one (else something else was made)
      const faces = roundingFaces(res.scene, chain.edges, 3 * R, (r) => r in sc.parts, chain.corners);
      if (!chain.edges.every((_, i) => faces.some((f) => f.edge === i))) { edgeRef.failed = Math.min(edgeRef.failed ?? Infinity, R); if (!edgeRef.ready) return null; }
      else edgeRef.ready = { R0: R, res, groups: faces.map((f) => ({ face: f.face, sharp: f.corner ? { kind: "point" as const, center: f.corner } : chain.edges[f.edge]!.sharp })) };
    }
  }
  // a size the kernel could not make is not drawn by stretching a smaller one: the faces would cross and fold into a spike. The kernel's own answer (its message, the body as it was) is shown instead (`in_233`)
  if (edgeRef.failed !== null && Math.abs(v) >= edgeRef.failed - 1e-9) return null;
  if (!edgeRef.ready) return { wait: true };
  return { face: { face: edgeRef.ready.groups[0]!.face, rounds: { k: Math.abs(v) / edgeRef.ready.R0, groups: edgeRef.ready.groups } }, shown: edgeRef.ready.res };
}

/**
 * A new prism (an extrusion, or a push / pull that adds or cuts one) (`in_224`): the same shape at every depth, stretched along its normal about the plane it stands on. The kernel makes it once at a depth (the
 * reference) and every depth after is that result stretched. Only a prism that ends inside what it is made in (a cap at the depth, walls between it and the plane): a cut that goes right through is the kernel's.
 */
let prismRef: { key: string; ready: { D0: number; res: { scene: Scene; outcome: CompileOutcome }; faces: { face: Ref; plane: { origin: Vec3; normal: Vec3 } }[] } | null; failed: boolean } | null = null;
function prismNew(s: AppState, op: Op, base: Session): { wait: true } | { face: FaceShift; shown: { scene: Scene; outcome: CompileOutcome } } | null {
  const sc = sceneOf(base);
  const v = valueOf(op);
  // one face (or one sketch), or several flat faces of the body that each move along their own normal by the same distance (`in_228`)
  const planes: { origin: Vec3; normal: Vec3 }[] = op.kind === "pushpull" && op.faces && op.faces.length > 1 && !op.edit ? op.faces.map((f) => ({ origin: f.origin, normal: normalize(f.normal) })) : op.normal && op.origin ? [{ origin: op.origin, normal: normalize(op.normal) }] : [];
  const single = op.kind === "extrude" || (op.kind === "pushpull" && (!op.edit || op.noEdit));
  if (!single || v === null || Math.abs(v) < 1e-6 || !planes.length) return null;
  const sign = v > 0 ? 1 : -1;
  const key = JSON.stringify([op.kind, op.parts, op.figs ?? null, planes, sign, op.made]);
  if (!prismRef || prismRef.key !== key) prismRef = { key, ready: null, failed: false };
  if (prismRef.failed) return null;
  const D0 = prismRef.ready ? prismRef.ready.D0 : Math.abs(v);
  const cmd = opCommand(sc, { ...op, typed: "", value: sign * D0, dim: undefined }, { preview: true });
  if (!cmd) return null;
  const res = memoPreview(s, base, cmd, op.made);
  if (res && !res.outcome.kernel?.stale && !prismRef.ready) {
    if (Object.keys(res.outcome.errors).length) { prismRef.failed = true; return null; }
    // the faces that are new: a cap at the depth, walls between it and the plane it stands on; nothing outside that (a cut right through leaves a face on the far side, and stops changing once it is through).
    // With several faces each new face belongs to exactly one of them (all its points between that plane and the depth).
    const fresh = Object.values(res.scene.parts).filter((p): p is Plane => p.kind === "plane" && p.origin === "body" && !(p.ref in sc.parts) && !!p.mesh);
    const eps = 2e-3 * Math.max(1, D0);
    const offsets = (f: Plane, pl: { origin: Vec3; normal: Vec3 }) => { const o: number[] = []; for (let i = 0; i + 2 < f.mesh!.length; i += 3) o.push(sign * dot(sub([f.mesh![i]!, f.mesh![i + 1]!, f.mesh![i + 2]!], pl.origin), pl.normal)); return o; };
    const owner = fresh.map((f) => planes.findIndex((pl) => { const o = offsets(f, pl); return o.every((t) => t > -eps && t < D0 + eps) && (o.some((t) => Math.abs(t) < eps) || o.every((t) => Math.abs(t - D0) < eps)); }));
    // (a face that fits two planes is told by being at the depth on one and on the plane on the other: first fit is kept, a cap must be a cap of its own)
    const caps = planes.map((pl, i) => fresh.some((f, j) => owner[j] === i && offsets(f, pl).every((t) => Math.abs(t - D0) < eps)));
    if (!fresh.length || owner.some((o) => o < 0) || !caps.every(Boolean)) { prismRef.failed = true; return null; }
    prismRef.ready = { D0, res, faces: fresh.map((f, j) => ({ face: f.ref, plane: planes[owner[j]!]! })) };
  }
  if (!prismRef.ready) return { wait: true };
  const k = Math.abs(v) / prismRef.ready.D0;
  const groups = prismRef.ready.faces.map((f) => ({ face: f.face, sharp: { kind: "plane" as const, point: f.plane.origin, normal: f.plane.normal } }));
  return { face: { face: groups[0]!.face, rounds: { k, groups } }, shown: prismRef.ready.res };
}

/** The body moved only on the graphics card (`in_216`): the matrix, and the scene and result as they are without this step. Null when the kernel has to work it out. */
function gpuMotion(s: AppState): { split?: Frame["bodySplit"]; matrix: number[] | null; face: FaceShift | null; shown: { scene: Scene; outcome: CompileOutcome } } | null {
  const op = s.op;
  if (!op) return null;
  const base = op.made ? undone(s.session) : s.session;
  const en = edgeNew(s, op, base) ?? prismNew(s, op, base);
  if (en) {
    if (!(gpuBase && gpuBase.history === s.session.history && gpuBase.outcome === s.session.outcome && gpuBase.made === !!op.made)) gpuBase = { history: s.session.history, outcome: s.session.outcome, made: !!op.made, value: { scene: sceneOf(base), outcome: base.outcome } };
    if ("wait" in en) return { matrix: null, face: null, shown: gpuBase.value };
    lastDrag = { matrix: null, face: en.face, step: "__last__", depth: op.kind === "edge" ? Math.abs(valueOf(op) ?? 0) : valueOf(op) ?? 0, param: op.kind === "edge" ? "value" : "depth", circle: null, corners: null, steps: sceneOf(base).steps.length };
    return { matrix: null, face: en.face, shown: en.shown };
  }
  const m = bodyMotion(sceneOf(base), op);
  const fd = m ? null : faceDrag(sceneOf(base), op);
  const rd = m || fd ? null : radiusDrag(sceneOf(base), op);
  const sd = m || fd || rd ? null : sideDrag(sceneOf(base), op);
  const ed = m || fd || rd || sd ? null : edgeDrag(sceneOf(base), op);
  const ad = m || fd || rd || sd || ed ? null : arcDrag(sceneOf(base), op);
  if (!m && !fd && !rd && !sd && !ed && !ad) return null;
  if (!(gpuBase && gpuBase.history === s.session.history && gpuBase.outcome === s.session.outcome && gpuBase.made === !!op.made)) gpuBase = { history: s.session.history, outcome: s.session.outcome, made: !!op.made, value: { scene: sceneOf(base), outcome: base.outcome } };
  const matrix = m ? matrixOf(m) : null;
  const face: FaceShift | null = fd ? { face: fd.face, by: fd.by } : rd ? { face: rd.face, radial: rd.radial } : ad ? { face: ad.face, arcs: { arcWall: ad.arc, items: ad.items.map((i) => ({ at: i.at, by: i.by })) } } : ed ? { face: ed.face, rounds: { k: ed.k, groups: ed.groups } } : sd ? { face: sd.face, columns: { axis: sd.axis, items: sd.items.map((i) => ({ at: i.at, by: i.by })), arcWalls: sd.arcWalls, edge: sd.edge } } : null;
  lastDrag = { split: m ? bodySplitOf(sceneOf(base), gpuBase.value.outcome, op) : null, matrix, face, step: fd?.step ?? ed?.step ?? null, depth: fd?.depth ?? ed?.value ?? 0, param: ed ? "value" : "depth", circle: rd ? { ref: rd.circle, radius: rd.radius } : null, corners: sd ? sd.items.map((i) => ({ ref: i.ref, to: add(i.at, i.by) })) : ad ? ad.items.map((i) => ({ ref: i.ref, to: add(i.at, i.by) })) : null, steps: sceneOf(base).steps.length };
  // what is drawn on a face of the body goes with it while it is dragged (it is carried when it is let go): the picture of the sketches is moved by the same numbers, no kernel (`in_234`)
  let shown = gpuBase.value;
  if (m) {
    const full = opCommand(sceneOf(base), op);
    const carry = full?.type === "batch" ? full.commands.filter((c) => c.type !== "addStep") : [];
    if (carry.length) { const moved = apply(sceneOf(base), { type: "batch", commands: carry }); if (moved.ok) shown = { scene: moved.value, outcome: gpuBase.value.outcome }; }
  }
  return { matrix, face, shown, split: lastDrag.split };
}

function operationResult(s: AppState): { scene: Scene; outcome: CompileOutcome } | null {
  // the operation being set up, else the repeat being set up (what it would make shows while its numbers are set)
  const op = s.op ?? (s.repeat ? liveRepeat(sceneOf(s.session), s.repeat) : null);
  if (!op) return null;
  const base = op.made ? undone(s.session) : s.session; // a step already made for this operation is replaced by what is being dragged
  const cmd: Command | null = opCommand(sceneOf(base), op, { preview: true });
  if (!cmd) return null;
  const key = JSON.stringify([cmd, op.made]);
  if (memo && memo.history === s.session.history && memo.outcome === s.session.outcome && memo.key === key) return memo.value;
  let value = previewCommand(base, cmd);
  // a size that breaks a step is not shown as the broken body (it collapses into a weird shape): what is there stays, and why it cannot be made is said (`in_229`)
  const bad = value && !value.outcome.kernel?.stale ? Object.entries(value.outcome.errors).find(([id]) => !(id in base.outcome.errors)) : undefined;
  if (bad) { previewProblem = bad[1]; value = null; } else previewProblem = null;
  memo = { history: s.session.history, outcome: s.session.outcome, key, value };
  return value;
}

function helperAt(s: AppState, g: { handles: Handle[] } | null): { at: Vec3; text: string } | null {
  if (!s.repeat || s.op || !g) return null;
  const h = helperOf(s.repeat);
  const arrow = h ? g.handles.find((x) => x.id === h.handle) : undefined;
  return h && arrow ? { at: arrow.points.at(-1)!, text: h.text } : null;
}

export function frameOf(s: AppState, size: { w: number; h: number }, now = 0): Frame {
  const gpu = gpuMotion(s);
  const shown = gpu ? gpu.shown : operationResult(s);
  const sc = shown?.scene ?? sceneOf(s.session);
  const sel = selectionOf(s.session);
  const outcome = shown?.outcome ?? s.session.outcome;
  // a whole-body drag is drawn by a matrix; when it is let go the picture stays moved until the kernel's answer for the new step comes (it would jump back otherwise)
  const faceStep = lastDrag?.step === "__last__" ? (sc.steps.length === lastDrag.steps + 1 ? sc.steps.at(-1) : undefined) : lastDrag?.step ? sc.steps.find((x) => x.id === lastDrag!.step) : undefined;
  const settling = !gpu && !!outcome.kernel?.stale && !!lastDrag && (lastDrag.matrix ? sc.steps.length === lastDrag.steps + 1 : lastDrag.corners ? lastDrag.corners.every((c) => { const q = sc.parts[c.ref]; return q?.kind === "corner" && Math.hypot(q.at[0] - c.to[0], q.at[1] - c.to[1], q.at[2] - c.to[2]) < 1e-6; }) : lastDrag.circle ? (sc.parts[lastDrag.circle.ref] as { radius?: number } | undefined)?.radius !== undefined && Math.abs((sc.parts[lastDrag.circle.ref] as { radius: number }).radius - lastDrag.circle.radius) < 1e-6 : !!faceStep && Math.abs(Number(faceStep.params[lastDrag.param]) - lastDrag.depth) < 1e-6);
  if (!gpu && !settling && !outcome.kernel?.stale) lastDrag = null;
  const bodyMatrix = gpu ? gpu.matrix : settling ? lastDrag!.matrix : null;
  const bodySplit = bodyMatrix ? (gpu ? gpu.split ?? null : lastDrag?.split ?? null) : null;
  const faceShift = gpu ? gpu.face : settling ? lastDrag!.face : null; // (a face pulled or pushed, drawn at once: `in_217`)
  const hasBody = Object.values(sc.parts).some((p) => p.kind === "body");
  // the handles follow what they drag, live (a body being moved takes its arrows with it)
  const raw = gizmoOf(s);
  const live = s.op?.kind === "pushpull" || s.op?.kind === "extrude"; // (their arrows follow inside `gizmoOf`)
  const followedGizmo = raw && !live ? followed(raw, s.drag && "handle" in s.drag ? s.drag.handle : null, s.op?.value ?? null) : raw;
  // the arrows of a body's move that stood up by themselves come back at the kernel's box, which is still the old one for a moment after the drag: they stay where the body was drawn (`in_230`)
  const m = settling && !s.op && lastDrag?.matrix && activeOp(s)?.kind === "move" ? lastDrag.matrix : null;
  const gizmo = followedGizmo && m ? { centre: add(followedGizmo.centre, [m[12]!, m[13]!, m[14]!]), handles: followedGizmo.handles.map((h) => ({ ...h, points: h.points.map((q) => add(q, [m[12]!, m[13]!, m[14]!])) })) } : followedGizmo;
  // the arrow of a push / pull, an extrude or a fillet / chamfer that showed up by itself has its bubble too, ready for a typed size
  const auto = s.op ? null : activeOp(s);
  const shownOp = s.op ?? (auto && !(s.cam.straight && auto.kind !== "edge") && (auto.kind === "pushpull" || auto.kind === "extrude" || auto.kind === "edge") ? auto : null);
  // the arrows of a move have a number bubble on each, there as long as the arrows are (`in_215`)
  const mo = !s.tool && !s.repeat ? (s.op ?? auto) : null;
  const movingOp = mo && mo.kind === "move" && (mo.target === "body" || mo.target === "plane") ? mo : null;
  // the number of an operation's arrow shows only when that arrow is selected (clicked or taken), or a number is being typed for it: the arrows alone stay clean (`in_238`)
  const armed = !!s.handleSel && !!gizmo && gizmo.handles.some((h) => h.id === s.handleSel);
  const typing = !!shownOp && (shownOp.typed !== "" || shownOp.rot.some((t) => t !== ""));
  const numberShown = armed || typing || !!(s.drag && "handle" in s.drag);
  const flash = flashOf(s, sc, now);
  const busy = !!(s.tool || s.op); // while a tool or operation is running its number chip is shown, not the constraints
  const gp = gridPlaneOf(s);
  const annotationsPresent = !busy; // (the bubbles are the only user of `avoid`: none are shown while a tool or operation runs)
  return {
    scene: sc,
    mesh: outcome.kernel?.mesh ?? null,
    bodyMatrix,
    bodySplit,
    faceShift,
    selectionMoves: !!bodyMatrix && sel.length > 0 && sel.every((r) => { const p = sc.parts[r]; return !!p && (p.kind === "body" || p.origin === "body"); }),
    highlight: { hover: s.session.hover, hoverPoint: s.hoverPoint, selection: sel,
    amber: [...new Set([...focusParts(sc, sel, s.focus), ...[...(s.tool?.hints ?? []), ...(s.tool && s.tool.points.length === 2 ? (s.tool.ends ?? []).flat() : [])].flatMap((h) => h.ref ? [h.ref] : [])])], red: { refs: flash?.parts ?? [], alpha: flash ? 1 - flash.t : 0 }, temp: s.repeat && !s.op ? temporaryParts(sceneOf(s.session), sc) : [], spread: s.spread },
    preview: faceShift ? previewFor(sc, s.tool) : withGhost(previewFor(sc, s.tool), s), // (the picture itself moves now: the thin rings that stood in for it are not needed)
    entry: movingOp || (shownOp && !s.tool && hasGizmo(shownOp.kind) && !numberShown) ? null : entryWhere(entryOf(sc, s.tool, shownOp), s, gizmo, shownOp),
    entries: s.repeat && !s.op ? repeatEntries(liveRepeat(sceneOf(s.session), s.repeat), gizmo, s.cam, s.repeat.chosen ?? null) : movingOp && numberShown ? moveEntries(s.handleSel?.startsWith("move:") ? { ...movingOp, axis: "xyz".indexOf(s.handleSel[5]!) as 0 | 1 | 2 } : movingOp, gizmo, moveOffset(sceneOf(s.session), movingOp)) : [],
    helper: helperAt(s, gizmo),
    busy: !!s.session.outcome.kernel?.stale,
    lookHint: lookOf(sc, sel, s.cam).lookHint,
    touchCursor: s.tool && s.tool.points.length && s.tool.cursor ? s.tool.cursor : null,
    undoRedo: { undo: s.session.history.cursor > 0, redo: s.session.history.cursor < s.session.history.commands.length },
    box: s.box ? { ...s.box, touching: crossing(s.box) } : null,
    avoid: busy || !annotationsPresent ? { segs: [], pts: [] } : avoidOf(sc),
    hint: s.tool?.hints?.length && s.tool.cursor ? { kinds: s.tool.hints.map((h) => h.kind), at: s.tool.cursor } : null,
    panel: panelOf(s.panel, sceneOf(s.session), sel, s.session.outcome.errors, s.showSketch),
    annotations: busy ? [] : [...withFlashed(annotationsFor(sc, sel, s.focus, s.showAllConstraints || !!s.showSketch), sc, flash)],
    flash,
    grid: gp && settings.grid.show ? gridFor(s.cam, gp, size.w, size.h) : null, // on: the world plane that is on always has its grid (`in_190`)
    suggest: busy ? null : suggestionsFor(sc, sel),
    confirm: s.tool ? null : s.repeat && !s.op ? { kind: s.repeat.op.kind, label: OPEN_LABELS[s.repeat.op.kind] ?? s.repeat.op.kind } : s.op && s.op.kind !== "dimension" ? { kind: s.op.kind, label: OPEN_LABELS[s.op.kind] ?? s.op.kind } : null,
    tool: s.tool ? { kind: s.tool.kind, label: ({ rect: "Rectangle", circle: "Circle", line: "Line", arc: "Curve", trim: "Trim" } as const)[s.tool.kind], made: s.tool.made ?? 0, drawing: s.tool.points.length > 0, done: (s.tool.made ?? 0) > 0 && s.tool.points.length === 0 } : null,
    fadeBody: fadeBodyOf(s, outcome.kernel?.mesh ?? null),
    panes: WORLD_NAMES.map((name) => ({ name, corners: paneCorners(name), active: name === s.world, hover: name === s.paneHover })),
    gizmo: gizmo ? { handles: gizmo.handles, hover: s.gizmoHover, active: s.drag && "handle" in s.drag ? s.drag.handle.id : null, chosen: armed ? s.handleSel! : s.op?.kind === "rotate" ? `rot:${"xyz"[s.op.axis]}` : s.op?.kind === "move" ? `move:${"xyz"[s.op.axis]}` : null } : null,
    similar: similarChip(s),
    modeSwitch: gizmo && !s.repeat ? modeSwitchOf(s.op ?? activeOp(s), gizmo.centre, gizmo.handles.flatMap((h) => h.points)) : null,
    cursor: s.tool || s.box ? "crosshair" : s.gizmoHover ? "grab" : "", // (held for a drag select: the cursor changes, `in_235`)
    message: s.session.message ?? (s.op && previewProblem ? `that size cannot be made: ${previewProblem}` : null) ?? Object.values(outcome.errors)[0] ?? "",
  };
}

/** What a repeat that is open would make (the lines, circles and corners of the copies): in the picture of the result, not yet in the drawing. */
function temporaryParts(now: Scene, shown: Scene): Ref[] {
  return Object.values(shown.parts).filter((p) => p.origin === "drawn" && !now.parts[p.ref] && !(p.kind === "corner" && p.derived) && !(p.kind === "line" && p.derived) && (p.kind === "line" || p.kind === "circle" || p.kind === "corner")).map((p) => p.ref);
}
const OPEN_LABELS: Record<string, string> = { linear: "Linear repeat", circular: "Circular repeat", copy: "Copy", move: "Move", rotate: "Rotate", scale: "Scale", pushpull: "Push / pull", extrude: "Extrude", edge: "Fillet / chamfer", offset: "Offset" };
const withFlashed = (list: Annotation[], sc: Scene, flash: FlashFrame | null): Annotation[] => {
  if (!flash) return list;
  const have = new Set(list.map((a) => a.id));
  return [...list, ...annotationsOf(sc, [...flash.victims, ...flash.culprits]).filter((a) => !have.has(a.id))];
};
function flashOf(s: AppState, sc: Scene, now: number): FlashFrame | null {
  if (!s.flash) return null;
  const t = (now - s.flash.at) / settings.flash.ms;
  if (t < 0 || t >= 1) return null;
  const parts = [...sc.relations.filter((r) => s.flash!.victims.includes(r.id)).flatMap((r) => r.parts), ...((s.flash.parts ?? []) as Ref[])];
  return { t, victims: s.flash.victims, culprits: s.flash.culprits, parts };
}

/** Where the value bubble sits: at the tip of the arrow for a push / pull or an extrude and at the edge for a fillet or chamfer (so it is by what it sets), else at the middle of the handles, or by the figure being drawn. */
function entryWhere(e: Entry | null, s: AppState, g: Gizmo | null, op: Op | null): Entry | null {
  if (!e) return null;
  let at: Vec3 | null = null;
  let from: Vec3 | null = null;
  if (op && g) {
    const k = op.kind;
    const arrow = k === "extrude" || k === "pushpull" || k === "edge" ? g.handles[0] : undefined;
    at = arrow ? arrow.points.at(-1) ?? g.centre : g.centre;
    from = arrow ? arrow.points[0] ?? null : null;
  } else if (op && (op.kind === "linear" || op.kind === "circular")) at = patternCentre(s.session.history.scene, op);
  else if (s.tool) at = s.tool.cursor ?? s.tool.points.at(-1) ?? null;
  return { ...e, at, from };
}

/** A single selected plane or face: if it lies across a world axis, that axis's button is lit, + or − by the end the camera is at (the side that shows the face). */
function lookOf(sc: Scene, sel: readonly Ref[], cam: Camera): { lookHint: Frame["lookHint"] } {
  const pl = sel.length === 1 ? planeOf(lookup(sc), sel[0]!) : null;
  if (!pl) return { lookHint: null };
  const n = normalOfPlane(pl);
  const k = ([0, 1, 2] as const).find((i) => Math.abs(Math.abs(n[i]) - 1) < 1e-6);
  const sign = dot(offsetOf(cam), n) >= 0 ? 1 : -1;
  return { lookHint: k === undefined ? null : { axis: (["X", "Y", "Z"] as const)[k], sign: n[k]! * sign > 0 ? 1 : -1 } };
}

/** The drawn lines, arcs and circles as short straight pieces, and the drawn corners: the places a bubble should not sit on. */
function avoidOf(sc: Scene): Frame["avoid"] {
  const get = lookup(sc);
  const segs: [Vec3, Vec3][] = [];
  const pts: Vec3[] = [];
  for (const p of Object.values(sc.parts)) {
    if (p.origin !== "drawn") continue;
    if (p.kind === "corner") { pts.push(p.at); continue; }
    if (p.kind !== "line" && p.kind !== "circle") continue;
    const o = outlineOf(get, p);
    if (o.shape === "segment") segs.push([o.a, o.b]);
    else if (o.shape === "polyline") for (let i = 0; i + 1 < o.pts.length; i++) segs.push([o.pts[i]!, o.pts[i + 1]!]);
    else if (o.shape === "circle") {
      const n = o.normal;
      const u = normalize(cross(n, Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]));
      const v = cross(n, u);
      const ring = Array.from({ length: 25 }, (_, k): Vec3 => { const t = (k / 24) * Math.PI * 2; return [0, 1, 2].map((i) => o.center[i]! + (u[i]! * Math.cos(t) + v[i]! * Math.sin(t)) * o.radius) as unknown as Vec3; });
      for (let i = 0; i < 24; i++) segs.push([ring[i]!, ring[i + 1]!]);
    }
  }
  return { segs, pts };
}

/**
 * While the arrow of a round face (a post or a hole) is being dragged the kernel takes a moment to build each size, so the picture of the body lags the pointer in jumps. This shows the size
 * the pointer is at right now, at once, as thin rings at the two ends of the round face and a few lines between them; the body catches up (`in_165`).
 */
function withGhost(base: Preview | null, s: AppState): Preview | null {
  const op = s.op;
  const c = op?.curved;
  if (!op || !c || !s.drag || !("handle" in s.drag) || op.value === null || op.value === undefined) return base;
  const r = Math.max(0.01, c.radius + (c.convex ? op.value : -op.value));
  const [u, v] = [0, 1, 2].filter((i) => i !== c.axis) as [number, number, number];
  const at = (t: number, h: number): Vec3 => { const p = [0, 0, 0]; p[u] = c.center[u]! + Math.cos(t) * r; p[v] = c.center[v]! + Math.sin(t) * r; p[c.axis] = h; return p as unknown as Vec3; };
  const segments: [Vec3, Vec3][] = [];
  const N = 64;
  for (let k = 0; k < N; k++) for (const h of [c.lo, c.hi]) segments.push([at((k / N) * Math.PI * 2, h), at(((k + 1) / N) * Math.PI * 2, h)]);
  for (let k = 0; k < 12; k++) segments.push([at((k / 12) * Math.PI * 2, c.lo), at((k / 12) * Math.PI * 2, c.hi)]);
  return { segments: [...(base?.segments ?? []), ...segments], circle: base?.circle ?? null, cursor: base?.cursor ?? null };
}

/** Does any of the body lie between the camera and the plane being sketched on? (Only when looking straight at that plane: in 3D it is all as it was.) */
function fadeBodyOf(s: AppState, mesh: { vertices: Float32Array } | null): boolean {
  const pl = sketchPlaneOf(s);
  if (!pl || !mesh) return false;
  const n = normalOfPlane(pl);
  const side = sideOf(s.cam, n);
  if (!side) return false;
  for (let i = 0; i + 2 < mesh.vertices.length; i += 3) if (((mesh.vertices[i]! - pl.at[0]) * n[0] + (mesh.vertices[i + 1]! - pl.at[1]) * n[1] + (mesh.vertices[i + 2]! - pl.at[2]) * n[2]) * side > 1e-3) return true;
  return false;
}

/** Which way the switch by the handles of a move or a turn goes: to turning from moving, to moving from turning. */
function modeSwitchOf(op: AppState["op"], at: Vec3, pts: Vec3[]): Frame["modeSwitch"] {
  if (!op || (op.target !== "body" && op.target !== "plane")) return null;
  if (op.kind === "move") return { at, pts, to: "rotate", label: "Rotate" };
  if (op.kind === "rotate") return { at, pts, to: "move", label: "Move" };
  return null;
}

function similarChip(s: AppState): Frame["similar"] {
  const sim = s.similar;
  if (!sim) return null;
  const sel = selectionOf(s.session);
  if (sel.length !== sim.refs.length || !sim.refs.every((r) => sel.includes(r))) return null;
  return { rules: SIMILAR_RULES.map((r) => ({ ...r, on: sim.rules.includes(r.id) })), count: sim.refs.length, noun: sim.noun };
}

/** The part of the mesh that is one body of several, for a move, turn or scale of that body (null for the whole body): its triangles, from the faces the kernel says are its, and its box (`in_273`). */
function bodySplitOf(sc: Scene, outcome: CompileOutcome, op: Op): Frame["bodySplit"] {
  const body = sc.parts[op.parts[0]!];
  const k = outcome.kernel;
  if (body?.kind !== "body" || body.ref === BODY_OBJECT || !body.id || !body.bbox || !k?.bodies || k.bodies.length < 2) return null;
  const index = k.bodies.findIndex((b) => b.id === body.id);
  if (index < 0) return null;
  const tris: [number, number][] = [];
  for (const f of k.faces ?? []) {
    if (f.body !== index) continue;
    const ranges = (f.ranges as { start: number; count: number }[] | undefined) ?? [{ start: f.start, count: f.count }];
    for (const r of ranges) tris.push([r.start, r.count]);
  }
  return tris.length ? { tris, box: { min: body.bbox.min, max: body.bbox.max } } : null;
}

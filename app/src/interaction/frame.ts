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
import { dot, cross, normalize } from "../math/vec.ts";
import { outlineOf } from "../operation/part.ts";
import type { KernelResult } from "../compiler/kernel/adapter.ts";
import { scene as sceneOf, selection as selectionOf, previewCommand, undoLast } from "./session.ts";
import type { Session } from "./session.ts";
import { opCommand } from "./operations.ts";
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
import { entryOf, previewFor, repeatEntries } from "./entry.ts";
import type { Entry } from "./entry.ts";
import type { Preview } from "./tools.ts";
import { gizmoOf, activeOp } from "./control/handles.ts";
import type { Op } from "./operations.ts";
import { followed } from "./gizmo.ts";
import type { Handle } from "./gizmo.ts";

/** A refused change, while it flashes: how far through it is (0 to 1), the constraints it would have broken (red, fading), the ones that tried (they shake), and the parts of the broken ones. */
export interface FlashFrame { t: number; victims: string[]; culprits: string[]; parts: Ref[] }

export interface GizmoFrame { handles: Handle[]; hover: string | null; active: string | null; chosen?: string | null }

export interface Frame {
  scene: Scene;
  mesh: KernelResult["mesh"];
  highlight: { hover: Ref | undefined; hoverPoint: Vec3 | null; selection: readonly Ref[]; amber: readonly Ref[]; /** the parts of constraints a refused change would have broken, and how red they still are */ red: { refs: readonly Ref[]; alpha: number }; spread: AppState["spread"]; };
  preview: Preview | null;
  entry: Entry | null;
  /** the several value bubbles of a repeat being set up (one on each axis, or one by the rings) */
  entries: Entry[];
  /** the Apply and Cancel buttons are up (a repeat is being set up) */
  bar: boolean;
  /** the world axis the selected plane or face lies across and which end of it the camera must be at to see it (so that X Y Z button is lit, as + or −) */
  lookHint: { axis: "X" | "Y" | "Z"; sign: 1 | -1 } | null;
  /** where the cursor of a figure being drawn is (a finger uses it: it has a handle to drag it) */
  touchCursor: Vec3 | null;
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
  modeSwitch: { at: Vec3; to: "move" | "rotate"; label: string } | null;
  /** the sketching tool that is on, for the pill at the top (`in_193`) */
  tool: { kind: "rect" | "circle" | "line" | "arc" | "trim"; label: string } | null;
  /** the little panes of the world planes beside the axes (`in_190`) */
  panes: { name: WorldName; corners: Vec3[]; active: boolean; hover: boolean }[];
  /** the helper handles of the running operation (arrows, a double arrow, curved arrows), or null */
  gizmo: GizmoFrame | null;
  cursor: "crosshair" | "grab" | "";
  /** the message to show: a refusal, or the first step that failed to build */
  message: string;
}

/** While an operation's number is being set, the scene as it would be after it: the real result (a gray body, a cut, a round) and not a sketch of it. Remembered for the same command. */
let memo: { history: Session["history"]; outcome: Session["outcome"]; key: string; value: { scene: Scene; outcome: CompileOutcome } | null } | null = null;
function operationResult(s: AppState): { scene: Scene; outcome: CompileOutcome } | null {
  // the operation being set up, else the repeat being set up (what it would make shows while its numbers are set)
  const op = s.op ?? (s.repeat ? liveRepeat(sceneOf(s.session), s.repeat) : null);
  if (!op) return null;
  const base = op.made ? undoLast(s.session) : s.session; // a step already made for this operation is replaced by what is being dragged
  const cmd: Command | null = opCommand(sceneOf(base), op, { preview: true });
  if (!cmd) return null;
  const key = JSON.stringify([cmd, op.made]);
  if (memo && memo.history === s.session.history && memo.outcome === s.session.outcome && memo.key === key) return memo.value;
  const value = previewCommand(base, cmd);
  memo = { history: s.session.history, outcome: s.session.outcome, key, value };
  return value;
}

export function frameOf(s: AppState, size: { w: number; h: number }, now = 0): Frame {
  const shown = operationResult(s);
  const sc = shown?.scene ?? sceneOf(s.session);
  const sel = selectionOf(s.session);
  const outcome = shown?.outcome ?? s.session.outcome;
  const hasBody = Object.values(sc.parts).some((p) => p.kind === "body");
  // the handles follow what they drag, live (a body being moved takes its arrows with it)
  const raw = gizmoOf(s);
  const live = s.op?.kind === "pushpull" || s.op?.kind === "extrude"; // (their arrows follow inside `gizmoOf`)
  const gizmo = raw && !live ? followed(raw, s.drag && "handle" in s.drag ? s.drag.handle : null, s.op?.value ?? null) : raw;
  // the arrow of a push / pull, an extrude or a fillet / chamfer that showed up by itself has its bubble too, ready for a typed size
  const auto = s.op ? null : activeOp(s);
  const shownOp = s.op ?? (auto && !(s.cam.straight && auto.kind !== "edge") && (auto.kind === "pushpull" || auto.kind === "extrude" || auto.kind === "edge") ? auto : null);
  const flash = flashOf(s, sc, now);
  const busy = !!(s.tool || s.op); // while a tool or operation is running its number chip is shown, not the constraints
  const gp = gridPlaneOf(s);
  const annotationsPresent = !busy; // (the bubbles are the only user of `avoid`: none are shown while a tool or operation runs)
  return {
    scene: sc,
    mesh: outcome.kernel?.mesh ?? null,
    highlight: { hover: s.session.hover, hoverPoint: s.hoverPoint, selection: sel,
    amber: [...focusParts(sc, sel, s.focus), ...(s.tool?.hints ?? []).flatMap((h) => h.ref ? [h.ref] : [])], red: { refs: flash?.parts ?? [], alpha: flash ? 1 - flash.t : 0 }, spread: s.spread },
    preview: withGhost(previewFor(sc, s.tool), s),
    entry: entryWhere(entryOf(sc, s.tool, shownOp), s, gizmo, shownOp),
    entries: s.repeat && !s.op ? repeatEntries(liveRepeat(sceneOf(s.session), s.repeat), gizmo, s.cam) : [],
    bar: !!s.repeat,
    lookHint: lookOf(sc, sel, s.cam).lookHint,
    touchCursor: s.tool && s.tool.points.length && s.tool.cursor ? s.tool.cursor : null,
    avoid: busy || !annotationsPresent ? { segs: [], pts: [] } : avoidOf(sc),
    hint: s.tool?.hints?.length && s.tool.cursor ? { kinds: s.tool.hints.map((h) => h.kind), at: s.tool.cursor } : null,
    panel: panelOf(s.panel, sceneOf(s.session), sel, s.session.outcome.errors),
    annotations: busy ? [] : [...withFlashed(annotationsFor(sc, sel, s.focus), sc, flash)],
    flash,
    grid: gp && settings.grid.show ? gridFor(s.cam, gp, size.w, size.h) : null, // on: the world plane that is on always has its grid (`in_190`)
    suggest: busy ? null : suggestionsFor(sc, sel),
    tool: s.tool ? { kind: s.tool.kind, label: ({ rect: "Rectangle", circle: "Circle", line: "Line", arc: "Curve", trim: "Trim" } as const)[s.tool.kind] } : null,
    fadeBody: fadeBodyOf(s, outcome.kernel?.mesh ?? null),
    panes: WORLD_NAMES.map((name) => ({ name, corners: paneCorners(name), active: name === s.world, hover: name === s.paneHover })),
    gizmo: gizmo ? { handles: gizmo.handles, hover: s.gizmoHover, active: s.drag && "handle" in s.drag ? s.drag.handle.id : null, chosen: s.op?.kind === "rotate" ? `rot:${"xyz"[s.op.axis]}` : null } : null,
    modeSwitch: gizmo && !s.repeat ? modeSwitchOf(s.op ?? activeOp(s), gizmo.centre) : null,
    cursor: s.tool ? "crosshair" : s.gizmoHover ? "grab" : "",
    message: s.session.message ?? Object.values(outcome.errors)[0] ?? "",
  };
}

const withFlashed = (list: Annotation[], sc: Scene, flash: FlashFrame | null): Annotation[] => {
  if (!flash) return list;
  const have = new Set(list.map((a) => a.id));
  return [...list, ...annotationsOf(sc, [...flash.victims, ...flash.culprits]).filter((a) => !have.has(a.id))];
};
function flashOf(s: AppState, sc: Scene, now: number): FlashFrame | null {
  if (!s.flash) return null;
  const t = (now - s.flash.at) / settings.flash.ms;
  if (t < 0 || t >= 1) return null;
  const parts = sc.relations.filter((r) => s.flash!.victims.includes(r.id)).flatMap((r) => r.parts);
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
function modeSwitchOf(op: AppState["op"], at: Vec3): Frame["modeSwitch"] {
  if (!op || (op.target !== "body" && op.target !== "plane")) return null;
  if (op.kind === "move") return { at, to: "rotate", label: "Rotate" };
  if (op.kind === "rotate") return { at, to: "move", label: "Move" };
  return null;
}

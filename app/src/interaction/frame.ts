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
import type { KernelResult } from "../compiler/kernel/adapter.ts";
import { scene as sceneOf, selection as selectionOf, previewCommand, undoLast } from "./session.ts";
import type { Session } from "./session.ts";
import { opCommand } from "./operations.ts";
import type { Command } from "../operation/commands.ts";
import type { CompileOutcome } from "../compiler/compile.ts";
import type { AppState } from "./control/state.ts";
import { gridPlaneOf } from "./control/viewing.ts";
import { gridFor } from "./grid.ts";
import { settings } from "../shared/settings.ts";
import type { Grid } from "./grid.ts";
import { annotationsFor, annotationsOf, focusParts } from "./annotations.ts";
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

export interface GizmoFrame { handles: Handle[]; hover: string | null; active: string | null }

export interface Frame {
  scene: Scene;
  mesh: KernelResult["mesh"];
  highlight: { hover: Ref | undefined; hoverPoint: Vec3 | null; selection: readonly Ref[]; amber: readonly Ref[]; /** the parts of constraints a refused change would have broken, and how red they still are */ red: { refs: readonly Ref[]; alpha: number }; spread: AppState["spread"] };
  preview: Preview | null;
  entry: Entry | null;
  /** the several value bubbles of a repeat being set up (one on each axis, or one by the rings) */
  entries: Entry[];
  /** the Apply and Cancel buttons are up (a repeat is being set up) */
  bar: boolean;
  /** the world axis the selected plane or face lies across (so its X Y Z button is lit), and whether the eye button (look straight at it) shows */
  lookHint: "X" | "Y" | "Z" | null;
  eye: boolean;
  /** the open list (bodies, history) */
  panel: Panel | null;
  /** the constraints of the selected parts, each with the spot it is shown at (on the line, at the vertex, between the lines, at the angle) */
  annotations: Annotation[];
  flash: FlashFrame | null;
  grid: Grid | null;
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
  const cmd: Command | null = opCommand(sceneOf(base), op);
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
  return {
    scene: sc,
    mesh: outcome.kernel?.mesh ?? null,
    highlight: { hover: s.session.hover, hoverPoint: s.hoverPoint, selection: sel,
    amber: focusParts(sc, sel, s.focus), red: { refs: flash?.parts ?? [], alpha: flash ? 1 - flash.t : 0 }, spread: s.spread },
    preview: previewFor(sc, s.tool),
    entry: entryWhere(entryOf(sc, s.tool, shownOp), s, gizmo, shownOp),
    entries: s.repeat && !s.op ? repeatEntries(liveRepeat(sceneOf(s.session), s.repeat), gizmo, s.cam) : [],
    bar: !!s.repeat,
    ...lookOf(sc, sel),
    panel: panelOf(s.panel, sceneOf(s.session), sel, s.session.outcome.errors),
    annotations: busy ? [] : [...withFlashed(annotationsFor(sc, sel, s.focus), sc, flash)],
    flash,
    grid: gp && settings.grid.show ? gridFor(s.cam, gp, size.w, size.h) : null, // off by default (`in_117`)
    gizmo: gizmo ? { handles: gizmo.handles, hover: s.gizmoHover, active: s.drag && "handle" in s.drag ? s.drag.handle.id : null } : null,
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

/** A single selected plane or face: the eye button shows, and if it lies across a world axis, that axis's button is lit. */
function lookOf(sc: Scene, sel: readonly Ref[]): { lookHint: "X" | "Y" | "Z" | null; eye: boolean } {
  const pl = sel.length === 1 ? planeOf(lookup(sc), sel[0]!) : null;
  if (!pl) return { lookHint: null, eye: false };
  const n = normalOfPlane(pl);
  const axis = ([0, 1, 2] as const).find((k) => Math.abs(Math.abs(n[k]) - 1) < 1e-6);
  return { lookHint: axis === undefined ? null : (["X", "Y", "Z"] as const)[axis], eye: true };
}

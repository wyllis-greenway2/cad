// What to draw for the current state: one plain description the view, the chip, the badges and the controls draw from. All the decisions about what is shown
// (the big axes or the compass, which plane's grid, whether badges give way to a tool or operation) are made here, so the UI only draws.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { KernelResult } from "../compiler/kernel/adapter.ts";
import { scene as sceneOf, selection as selectionOf, previewCommand } from "./session.ts";
import type { Session } from "./session.ts";
import { opCommand } from "./operations.ts";
import type { Command } from "../operation/commands.ts";
import type { CompileOutcome } from "../compiler/compile.ts";
import type { AppState } from "./control/state.ts";
import { gridPlaneOf } from "./control/viewing.ts";
import { gridFor } from "./grid.ts";
import { settings } from "../shared/settings.ts";
import type { Grid } from "./grid.ts";
import { annotationsFor, focusParts } from "./annotations.ts";
import type { Annotation } from "./annotations.ts";
import { entryOf, previewFor } from "./entry.ts";
import type { Entry } from "./entry.ts";
import type { Preview } from "./tools.ts";
import { gizmoOf } from "./control/handles.ts";
import { hasGizmo } from "./gizmo.ts";
import type { Handle } from "./gizmo.ts";

export interface GizmoFrame { handles: Handle[]; hover: string | null; active: string | null }

export interface Frame {
  scene: Scene;
  mesh: KernelResult["mesh"];
  highlight: { hover: Ref | undefined; hoverPoint: Vec3 | null; selection: readonly Ref[]; amber: readonly Ref[]; spread: AppState["spread"] };
  preview: Preview | null;
  entry: Entry | null;
  /** the constraints of the selected parts, each with the spot it is shown at (on the line, at the vertex, between the lines, at the angle) */
  annotations: Annotation[];
  world: { big: boolean; panes: boolean; lit: Ref[]; corner: boolean };
  grid: Grid | null;
  /** the helper handles of the running operation (arrows, a double arrow, curved arrows), or null */
  gizmo: GizmoFrame | null;
  cursor: "crosshair" | "grab" | "";
  /** the message to show: a refusal, or the first step that failed to build */
  message: string;
}

/** While an operation's number is being set, the scene as it would be after it: the real result (a gray body, a cut, a round) and not a sketch of it. Remembered for the same command. */
let memo: { history: Session["history"]; key: string; value: { scene: Scene; outcome: CompileOutcome } | null } | null = null;
function operationResult(s: AppState): { scene: Scene; outcome: CompileOutcome } | null {
  if (!s.op) return null;
  const cmd: Command | null = opCommand(sceneOf(s.session), s.op);
  if (!cmd) return null;
  const key = JSON.stringify(cmd);
  if (memo && memo.history === s.session.history && memo.key === key) return memo.value;
  const value = previewCommand(s.session, cmd);
  memo = { history: s.session.history, key, value };
  return value;
}

export function frameOf(s: AppState, size: { w: number; h: number }): Frame {
  const shown = operationResult(s);
  const sc = shown?.scene ?? sceneOf(s.session);
  const sel = selectionOf(s.session);
  const outcome = shown?.outcome ?? s.session.outcome;
  const hasBody = Object.values(sc.parts).some((p) => p.kind === "body");
  const busy = !!(s.tool || s.op); // while a tool or operation is running its number chip is shown, not the constraints
  const gp = gridPlaneOf(s);
  return {
    scene: sc,
    mesh: outcome.kernel?.mesh ?? null,
    highlight: { hover: s.session.hover, hoverPoint: s.hoverPoint, selection: s.op && hasGizmo(s.op.kind) ? sel.filter((r) => s.session.history.scene.parts[r]?.kind !== "body") : sel, // the handles show what is being worked on: the body is not tinted while they are up
    amber: focusParts(sc, sel, s.focus), spread: s.spread },
    preview: previewFor(sc, s.tool),
    entry: entryOf(sc, s.tool, s.op),
    annotations: busy ? [] : annotationsFor(sc, sel, s.focus),
    world: { big: !hasBody || s.axesBig, panes: !hasBody, lit: [...(s.session.hover ? [s.session.hover] : []), ...sel], corner: hasBody },
    grid: gp && settings.grid.show ? gridFor(s.cam, gp, size.w, size.h) : null, // off by default (`in_117`)
    gizmo: ((g) => (g ? { handles: g.handles, hover: s.gizmoHover, active: s.drag && "handle" in s.drag ? s.drag.handle.id : null } : null))(gizmoOf(s)),
    cursor: s.tool ? "crosshair" : s.gizmoHover ? "grab" : "",
    message: s.session.message ?? Object.values(outcome.errors)[0] ?? "",
  };
}

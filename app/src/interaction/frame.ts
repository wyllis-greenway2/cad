// What to draw for the current state: one plain description the view, the chip, the badges and the controls draw from. All the decisions about what is shown
// (the big axes or the compass, which plane's grid, whether badges give way to a tool or operation) are made here, so the UI only draws.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { KernelResult } from "../compiler/kernel/adapter.ts";
import { scene as sceneOf, selection as selectionOf } from "./session.ts";
import type { AppState } from "./control/state.ts";
import { gridPlaneOf } from "./control/viewing.ts";
import { projector } from "./camera.ts";
import { gridFor } from "./grid.ts";
import type { Grid } from "./grid.ts";
import { badgesFor, focusParts, suggestMeasure, anchorOf } from "./badges.ts";
import type { Badge, Suggestion } from "./badges.ts";
import { entryOf, previewFor } from "./entry.ts";
import type { Entry } from "./entry.ts";
import type { Preview } from "./tools.ts";

export interface Frame {
  scene: Scene;
  mesh: KernelResult["mesh"];
  highlight: { hover: Ref | undefined; hoverPoint: Vec3 | null; selection: readonly Ref[]; amber: readonly Ref[]; spread: AppState["spread"] };
  preview: Preview | null;
  entry: Entry | null;
  badges: Badge[];
  suggestion: Suggestion | null;
  /** where the badges go on the screen (pixels in the view), or null for the corner of the page */
  badgeAt: [number, number] | null;
  world: { big: boolean; panes: boolean; hover: Ref | undefined; corner: boolean };
  grid: Grid | null;
  cursor: "crosshair" | "";
  /** the message to show: a refusal, or the first step that failed to build */
  message: string;
}

export function frameOf(s: AppState, size: { w: number; h: number }): Frame {
  const sc = sceneOf(s.session);
  const sel = selectionOf(s.session);
  const outcome = s.session.outcome;
  const hasBody = Object.values(sc.parts).some((p) => p.kind === "body");
  const busy = !!(s.tool || s.op); // while a tool or operation is running its number chip is shown, not the badges
  const anchor = anchorOf(sc, sel);
  const gp = gridPlaneOf(s);
  return {
    scene: sc,
    mesh: outcome.kernel?.mesh ?? null,
    highlight: { hover: s.session.hover, hoverPoint: s.hoverPoint, selection: sel, amber: focusParts(sc, sel, s.focus), spread: s.spread },
    preview: previewFor(sc, s.tool, s.op),
    entry: entryOf(sc, s.tool, s.op),
    badges: busy ? [] : badgesFor(sc, sel, s.focus),
    suggestion: busy ? null : suggestMeasure(sc, sel),
    badgeAt: anchor ? projector(s.cam, size.w, size.h).project(anchor) : null,
    world: { big: !hasBody || s.axesBig, panes: !hasBody, hover: s.session.hover, corner: hasBody },
    grid: gp ? gridFor(s.cam, gp, size.w, size.h) : null,
    cursor: s.tool ? "crosshair" : "",
    message: s.session.message ?? Object.values(outcome.errors)[0] ?? "",
  };
}

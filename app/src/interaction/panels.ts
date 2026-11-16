// The two lists the ⋯ menu opens (`in_132`): the bodies (with their names) and the history of building steps. Pure: derived from the scene; the UI draws them.
import type { Ref } from "../shared/ref.ts";
import type { Scene, Step } from "../operation/scene.ts";
import { figuresOf, usesFigures } from "../operation/scene.ts";
import type { History } from "../operation/history.ts";
import type { Group } from "../operation/groups.ts";
import { groupsOf, membersOf, parentOf } from "../operation/groups.ts";
import { hardOverlaps, overlapBlame, hardNames } from "./hard.ts";

export type PanelKind = "bodies" | "history" | "groups" | "sketches";
/** The lists that are the parts of the one Model panel, in the order of its tabs (`dec_model_panel`). */
export const MODEL_TABS: readonly { id: PanelKind; label: string }[] = [{ id: "history", label: "Steps" }, { id: "bodies", label: "Bodies" }, { id: "sketches", label: "Sketches" }];
export interface PanelRow { id: string; label: string; /** selected (a body) */ active: boolean; /** can be taken out (a step) */ removable: boolean; /** a repeat of the body: it can be opened again to change its numbers (`in_257`) */ edit?: boolean; /** why this step could not be made, when it could not (it is shown in red) */ error?: string; /** an extrusion: its hidden sketch can be shown (`in_228`); true while it is shown */ sketch?: boolean; /** a body: the eye (`dec_hidden_bodies`): true when it is hidden, false when it is shown */ hidden?: boolean; /** a step that comes after the cursor (`dec_history_navigation`): faded, gone back to by choosing it */ future?: boolean; /** the step the cursor is at */ current?: boolean; /** the numbers of the step that can be changed (only at the last step), and whether they are open */ fields?: { key: string; label: string; value: number }[]; open?: boolean; /** a second, smaller line under the label (a sketch: its step, its body and its status) */ detail?: string }
export interface Panel { kind: PanelKind; title: string; rows: PanelRow[]; /** the History: the cursor is at the last step (the numbers can be changed); else a line says where it is */ note?: string; /** buttons for the whole list (the Bodies list: select all and none, hide all and show all) */ actions?: { id: string; label: string; title: string }[]; /** the Model panel's tabs; the one that is open is `on` */ tabs?: { id: PanelKind; label: string; on: boolean }[] }

const n = (v: unknown): string => String(Math.round(Number(v) * 100) / 100);
/** What a step says, in a few words. */
function stepLabel(st: Step): string {
  const p = st.params;
  switch (st.type) {
    case "extrude": return `Extrude ${n(p.depth)} mm`;
    case "hollow": return `Hollow, ${n(p.thickness)} mm walls`;
    case "pattern": return p.mode === "mirror" ? "Mirror copy" : p.mode === "circular" ? `Circular repeat ${n(p.count)}` : `Linear repeat ${n(p.nx)} × ${n(p.ny)} × ${n(p.nz)}`;
    case "sweep": return "Sweep along a path";
    case "importMesh": return `Import ${String(p.name ?? "mesh")} (mesh)`;
    case "import": return `Import ${String(p.name ?? "STEP file")}`;
    case "loft": return `Loft through ${1 + String(p.also ?? "").split("|").filter(Boolean).length} sketches${p.ruled ? " (ruled)" : ""}`;
    case "revolve": return Number(p.advance ?? 0) ? `Spiral ${n(p.angle)}°, ${n(p.advance)} mm along the axis` : `Revolve ${n(p.angle)}°`;
    case "pushPull": return `Push / pull ${n(p.depth)} mm`;
    case "edgeMod": return `${p.mode === "chamfer" ? "Chamfer" : "Fillet"} ${n(p.value)} mm`;
    case "combine": return `${p.mode === "subtract" ? "Subtract" : p.mode === "intersect" ? "Intersect" : "Add"} bodies${Number(p.keep) === 1 ? " (tools kept)" : ""}`;
    case "rotate": return `Rotate ${"XYZ"[Number(p.axis ?? 0)]} ${n(p.value)}°`;
    case "move": return `Move ${"XYZ"[Number(p.axis ?? 0)]} ${n(p.value)} mm`;
    case "scale": return `Scale ×${n(p.value)}`;
    case "reshape": return `Reshape by ${String(p.moves ?? "").split(";").filter(Boolean).length} corner(s)`;
    default: return st.type;
  }
}

/** The bodies of the scene, each with its name (there is one body for now, named Body 1). */
/** A body as the Bodies list names it (`in_335`: the messages say the same). */
export const bodyLabel = (scene: Scene, ref: Ref): string => `Body ${Object.values(scene.parts).filter((p) => p.kind === "body").findIndex((b) => b.ref === ref) + 1}`;
function bodiesPanel(scene: Scene, selection: readonly Ref[]): Panel {
  const bodies = Object.values(scene.parts).filter((p) => p.kind === "body");
  const hidden = new Set(scene.hiddenBodies ?? []);
  return {
    kind: "bodies",
    title: "Bodies",
    rows: bodies.map((b, i) => ({ id: b.ref, label: `Body ${i + 1}`, active: selection.includes(b.ref), removable: true, hidden: hidden.has(b.ref) })),
    actions: [
      { id: "bodies:all", label: "Select all", title: "Select every body that is shown" },
      { id: "bodies:none", label: "Select none", title: "Select nothing" },
      { id: "bodies:hide", label: "Hide all", title: "Hide every body" },
      { id: "bodies:show", label: "Show all", title: "Show every body" },
    ],
  };
}
/**
 * The sketches (`dec_model_panel`, `dec_sketch_recipe_synced`): one row for each figure a step made a body from, named in the order of the steps ("Sketch 1", ...), with the step that took it, the body it made and a status:
 * as drawn, or the last later step that carried it (a move, a turn, a scale), changed it (a push or pull) or changed the body it made (a fillet, a hollow, a cut, a reshape).
 */
export function sketchRows(scene: Scene, shown: string | null): PanelRow[] {
  const rows: PanelRow[] = [];
  let k = 0;
  const bodyOf = (r: string): string => (r.startsWith("b/") ? r.split("/")[1]! : "");
  scene.steps.forEach((st, i) => {
    if (!usesFigures(st)) return;
    const body = `x_${st.id}`;
    const figs = figuresOf(st).filter((f) => f.outer.length);
    const later = scene.steps.slice(i + 1).filter((x) => x.params.body === body || x.parts.some((r) => bodyOf(r) === body));
    const last = later[later.length - 1];
    const status = !last ? "as drawn" : last.type === "move" || last.type === "rotate" || last.type === "scale" ? `carried by ${stepLabel(last)}` : last.type === "pushPull" ? `changed by ${stepLabel(last)}` : `the body has changed since: ${stepLabel(last)}`;
    for (let f = 0; f < figs.length; f++) {
      k++;
      rows.push({ id: st.id, label: `Sketch ${k}`, active: shown === st.id, removable: false, ...(st.type === "extrude" ? { sketch: shown === st.id } : {}), detail: `${stepLabel(st)} · ${status}` });
    }
  });
  return rows;
}
function sketchesPanel(scene: Scene, shown: string | null): Panel {
  return { kind: "sketches", title: "Sketches", rows: sketchRows(scene, shown), note: "Each is the recipe of the step that took it, kept as drawn. The pencil shows the sketch of an extrusion in the picture." };
}
/** The selection groups as a tree (`in_257`): a row for each group, the ones inside it under it, so any group (the outer one or one inside) can be selected or broken without picking it in the picture. */
function groupsPanel(scene: Scene, selection: readonly Ref[]): Panel {
  const rows: PanelRow[] = [];
  const names = new Map(groupsOf(scene).map((g, i) => [g.id, `Group ${i + 1}`]));
  const walk = (g: Group, depth: number) => {
    const members = membersOf(scene, g.id);
    rows.push({ id: g.id, label: `${"\u2003".repeat(depth)}${names.get(g.id)} · ${members.length} ${members.length === 1 ? "part" : "parts"}`, active: members.length === selection.length && members.every((m) => selection.includes(m)), removable: true });
    for (const x of g.items) { const sub = groupsOf(scene).find((q) => q.id === x); if (sub) walk(sub, depth + 1); }
  };
  for (const g of groupsOf(scene)) if (!parentOf(scene, g.id)) walk(g, 0);
  return { kind: "groups", title: "Groups", rows };
}
/** The steps of building, oldest first. */
/** The numbers of a step that the panel lets be changed (`dec_history_navigation`): the keys of its params, with what each is. */
function stepFields(st: Step): { key: string; label: string; value: number }[] {
  const p = st.params;
  const one = (key: string, label: string) => (p[key] !== undefined && Number.isFinite(Number(p[key])) ? [{ key, label, value: Number(p[key]) }] : []);
  switch (st.type) {
    case "extrude": return one("depth", "Depth (mm)");
    case "pushPull": return one("depth", "Distance (mm)");
    case "edgeMod": return one("value", "Size (mm)");
    case "hollow": return one("thickness", "Wall (mm)");
    case "move": return p.vx !== undefined ? [...one("vx", "X (mm)"), ...one("vy", "Y (mm)"), ...one("vz", "Z (mm)")] : one("value", "Distance (mm)");
    case "rotate": return one("value", "Angle (°)");
    case "scale": return one("value", "Factor");
    case "revolve": return [...one("angle", "Angle (°)"), ...one("advance", "Advance (mm)")];
    default: return [];
  }
}
/**
 * The steps of the History (`dec_history_navigation`): those of the model at the cursor, then those that come after it (faded), each with its numbers when the cursor is at the last step; the step the cursor is at is
 * marked.
 */
const historyPanel = (history: History, errors0: Record<string, string>, shown: string | null, editing: string | null): Panel => {
  const scene = history.scene;
  // the hard bodies that overlap after the history is replayed: the step to look at is marked (`in_478`)
  const errors: Record<string, string> = { ...errors0 };
  for (const o of hardOverlaps(scene)) { const id = overlapBlame(scene, o); if (id && !errors[id]) errors[id] = `the hard bodies ${hardNames(scene, [o.a, o.b])} overlap here: move one of them clear`; }
  const end = history.snapshots[history.commands.length] ?? scene;
  const atEnd = history.cursor >= history.commands.length;
  const done = new Set(scene.steps.map((x) => x.id));
  const later = end.steps.filter((x) => !done.has(x.id));
  const rows: PanelRow[] = [
    ...scene.steps.map((st, i): PanelRow => {
      const fields = atEnd ? stepFields(st) : [];
      return { id: st.id, label: stepLabel(st), active: false, removable: atEnd, current: !atEnd && i === scene.steps.length - 1, ...(st.type === "pattern" ? { edit: true } : {}), ...(st.type === "extrude" ? { sketch: shown === st.id } : {}), ...(errors[st.id] ? { error: errors[st.id] } : {}), ...(fields.length ? { fields, open: editing === st.id } : {}) };
    }),
    ...later.map((st): PanelRow => ({ id: st.id, label: stepLabel(st), active: false, removable: false, future: true })),
  ];
  return { kind: "history", title: "History", rows, ...(atEnd ? {} : { note: "Looking at an earlier step. Doing something here drops the faded steps; choose the last step to change numbers." }) };
};
const panelOf0 = (kind: PanelKind | null, scene: Scene, selection: readonly Ref[], errors: Record<string, string> = {}, shownSketch: string | null = null, history?: History, editing: string | null = null): Panel | null => (kind === "bodies" ? bodiesPanel(scene, selection) : kind === "history" ? historyPanel(history ?? ({ commands: [], cursor: 0, snapshots: [scene], scene } as unknown as History), errors, shownSketch, editing) : kind === "groups" ? groupsPanel(scene, selection) : null);
/** The panel for a kind, the three lists of the Model panel with its tabs (`dec_model_panel`). */
export const panelOf = (kind: PanelKind | null, scene: Scene, selection: readonly Ref[], errors: Record<string, string> = {}, shownSketch: string | null = null, history?: History, editing: string | null = null): Panel | null => {
  const p = kind === "sketches" ? sketchesPanel(scene, shownSketch) : panelOf0(kind, scene, selection, errors, shownSketch, history, editing);
  return p && p.kind !== "groups" ? { ...p, title: "Model", tabs: MODEL_TABS.map((t) => ({ ...t, on: t.id === p.kind })) } : p;
};


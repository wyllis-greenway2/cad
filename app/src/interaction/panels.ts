// The two lists the ⋯ menu opens (`in_132`): the bodies (with their names) and the history of building steps. Pure: derived from the scene; the UI draws them.
import type { Ref } from "../shared/ref.ts";
import type { Scene, Step } from "../operation/scene.ts";
import type { Group } from "../operation/groups.ts";
import { groupsOf, membersOf, parentOf } from "../operation/groups.ts";

export type PanelKind = "bodies" | "history" | "groups";
export interface PanelRow { id: string; label: string; /** selected (a body) */ active: boolean; /** can be taken out (a step) */ removable: boolean; /** a repeat of the body: it can be opened again to change its numbers (`in_257`) */ edit?: boolean; /** why this step could not be made, when it could not (it is shown in red) */ error?: string; /** an extrusion: its hidden sketch can be shown (`in_228`); true while it is shown */ sketch?: boolean }
export interface Panel { kind: PanelKind; title: string; rows: PanelRow[] }

const n = (v: unknown): string => String(Math.round(Number(v) * 100) / 100);
/** What a step says, in a few words. */
function stepLabel(st: Step): string {
  const p = st.params;
  switch (st.type) {
    case "extrude": return `Extrude ${n(p.depth)} mm`;
    case "pushPull": return `Push / pull ${n(p.depth)} mm`;
    case "edgeMod": return `${p.mode === "chamfer" ? "Chamfer" : "Fillet"} ${n(p.value)} mm`;
    case "rotate": return `Rotate ${"XYZ"[Number(p.axis ?? 0)]} ${n(p.value)}°`;
    case "move": return `Move ${"XYZ"[Number(p.axis ?? 0)]} ${n(p.value)} mm`;
    case "scale": return `Scale ×${n(p.value)}`;
    case "pattern": return p.mode === "circular" ? `Circular repeat ${n(p.count)}` : `Linear repeat ${n(p.nx)} × ${n(p.ny)} × ${n(p.nz)}`;
    default: return st.type;
  }
}

/** The bodies of the scene, each with its name (there is one body for now, named Body 1). */
function bodiesPanel(scene: Scene, selection: readonly Ref[]): Panel {
  const bodies = Object.values(scene.parts).filter((p) => p.kind === "body");
  return { kind: "bodies", title: "Bodies", rows: bodies.map((b, i) => ({ id: b.ref, label: `Body ${i + 1}`, active: selection.includes(b.ref), removable: false })) };
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
const historyPanel = (scene: Scene, errors: Record<string, string>, shown: string | null): Panel => ({ kind: "history", title: "History", rows: scene.steps.map((s) => ({ id: s.id, label: stepLabel(s), active: false, removable: true, ...(s.type === "pattern" ? { edit: true } : {}), ...(s.type === "extrude" ? { sketch: shown === s.id } : {}), ...(errors[s.id] ? { error: errors[s.id] } : {}) })) });
export const panelOf = (kind: PanelKind | null, scene: Scene, selection: readonly Ref[], errors: Record<string, string> = {}, shownSketch: string | null = null): Panel | null => (kind === "bodies" ? bodiesPanel(scene, selection) : kind === "history" ? historyPanel(scene, errors, shownSketch) : kind === "groups" ? groupsPanel(scene, selection) : null);


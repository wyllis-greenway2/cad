// The two lists the ⋯ menu opens (`in_132`): the bodies (with their names) and the history of building steps. Pure: derived from the scene; the UI draws them.
import type { Ref } from "../shared/ref.ts";
import type { Scene, Step } from "../operation/scene.ts";

export type PanelKind = "bodies" | "history";
export interface PanelRow { id: string; label: string; /** selected (a body) */ active: boolean; /** can be taken out (a step) */ removable: boolean }
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
/** The steps of building, oldest first. */
const historyPanel = (scene: Scene): Panel => ({ kind: "history", title: "History", rows: scene.steps.map((s) => ({ id: s.id, label: stepLabel(s), active: false, removable: true })) });
export const panelOf = (kind: PanelKind | null, scene: Scene, selection: readonly Ref[]): Panel | null => (kind === "bodies" ? bodiesPanel(scene, selection) : kind === "history" ? historyPanel(scene) : null);


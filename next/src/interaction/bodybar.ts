// The helper bar of what is picked on a body (`in_1568`, `q_lean_ui`): the same bar as the sketch's (`helperbar.ts`), with what can be done with the face or the edges picked. Pure: what is picked in, the bar's descriptions out.
//   a face: Sketch on it, Push / pull it       edges: Round them, Chamfer them
import type { BarItem } from "./infobar.ts";

export interface Picked { faces: number; edges: number }
export function barForBody(p: Picked): BarItem[] {
  if (!p.faces && !p.edges) return [];
  return p.faces ? [
    { id: "body:sketch", icon: "sketch", label: "Sketch on this face", tone: "free" },
    { id: "body:pull", icon: "pushpull", label: "Push / pull this face", tone: "free" },
  ] : [
    { id: "body:round", icon: "round", label: p.edges > 1 ? `Round these ${p.edges} edges` : "Round this edge", tone: "free" },
    { id: "body:chamfer", icon: "chamfer", label: p.edges > 1 ? `Chamfer these ${p.edges} edges` : "Chamfer this edge", tone: "free" },
  ];
}

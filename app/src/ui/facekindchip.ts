// A chip of choices beside an operation's number (`in_386`: what a push / pull of a flat face does; `in_387`: a fillet the same size all along or a size at each end). It only draws and reports a click.
import { PILL, choiceRow } from "./look.ts";
export interface FaceKindView { id: string; label: string; title: string; on: boolean }

export function createFaceKindChip(host: HTMLElement, pick: (id: string) => void, name = "Face:") {
  const chip = document.createElement("div");
  chip.style.cssText = PILL + ";bottom:108px;left:50%;transform:translateX(-50%)";
  const label = document.createElement("span");
  label.textContent = name;
  const choices = document.createElement("span");
  choices.style.cssText = "display:inline-flex;gap:6px";
  chip.append(label, choices);
  host.appendChild(chip);
  let shown = "";
  return {
    update(v: FaceKindView[] | null) {
      if (!v) { chip.style.display = "none"; shown = ""; return; }
      const sig = JSON.stringify(v);
      if (sig === shown) return;
      shown = sig;
      chip.style.display = "flex";
      choiceRow(choices, v.map((k) => ({ id: k.id, text: k.label, title: k.title, on: k.on })), pick);
    },
  };
}

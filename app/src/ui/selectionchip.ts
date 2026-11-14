// The chip that stands over the view while several things are selected (`in_300`): what can be done with them as a set (Group, Ungroup). It only draws and reports a click; what is offered is the interaction layer's.
import { PILL, choiceRow } from "./look.ts";
export interface SelectionView { count: number; actions: { id: string; label: string; title: string }[] }

export function createSelectionChip(host: HTMLElement, run: (id: string) => void) {
  const chip = document.createElement("div");
  chip.style.cssText = PILL + ";bottom:108px;left:50%;transform:translateX(-50%)";
  const label = document.createElement("span");
  const choices = document.createElement("span");
  choices.style.cssText = "display:inline-flex;gap:6px";
  chip.append(label, choices);
  host.appendChild(chip);
  let shown = "";
  return {
    update(v: SelectionView | null) {
      if (!v) { chip.style.display = "none"; shown = ""; return; }
      const sig = JSON.stringify(v);
      if (sig === shown) return;
      shown = sig;
      chip.style.display = "flex";
      label.textContent = `${v.count} selected:`;
      choiceRow(choices, v.actions.map((a) => ({ id: a.id, text: a.label, title: a.title, on: false })), run);
    },
  };
}

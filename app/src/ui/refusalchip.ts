// The chip that offers a way through a refused change (`in_335`): what stopped it flashes, and this says so with "Delete constraint to proceed". It stays while the refusal flashes, and while the pointer is on it. It only draws and reports a click.
import { PILL, choiceRow } from "./look.ts";
export interface RefusalView { text: string; button: string }

export function createRefusalChip(host: HTMLElement, go: () => void, hold: () => void) {
  const chip = document.createElement("div");
  chip.style.cssText = PILL + ";top:64px;left:50%;transform:translateX(-50%);max-width:92vw";
  const label = document.createElement("span");
  label.style.cssText = "overflow:hidden;text-overflow:ellipsis";
  const choices = document.createElement("span");
  chip.append(label, choices);
  chip.addEventListener("pointerenter", hold);
  chip.addEventListener("pointermove", hold);
  chip.addEventListener("pointerdown", (e) => e.stopPropagation());
  host.appendChild(chip);
  let shown = "";
  return {
    update(v: RefusalView | null) {
      if (!v) { chip.style.display = "none"; shown = ""; return; }
      const sig = JSON.stringify(v);
      if (sig === shown) return;
      shown = sig;
      chip.style.display = "flex";
      label.textContent = v.text;
      choiceRow(choices, [{ id: "go", text: v.button, title: "Delete the constraints that stopped it, and make the change (one undo takes both back)", on: true }], go);
    },
  };
}

// The chip that offers a way through a refused change (`in_335`): what stopped it flashes, and this says so with "Delete constraint to proceed". It stays while the refusal flashes, and while the pointer is on it. It only draws and reports a click.
import { PILL, choiceRow } from "./look.ts";
export interface RefusalView { text: string; button: string; beside: string }

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
    /** `bubble`: the box of the constraint's bubble on the page: the chip stands to its right (to its left at the edge of the page); without it, at the top centre. */
    update(v: RefusalView | null, bubble: DOMRect | null = null) {
      if (v) {
        if (bubble) {
          const w = chip.offsetWidth || 260;
          const left = bubble.right + 8 + w > window.innerWidth ? Math.max(4, bubble.left - 8 - w) : bubble.right + 8;
          Object.assign(chip.style, { top: `${Math.max(4, Math.round(bubble.top + bubble.height / 2 - 18))}px`, left: `${Math.round(left)}px`, transform: "none" });
        } else Object.assign(chip.style, { top: "64px", left: "50%", transform: "translateX(-50%)" });
      }
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

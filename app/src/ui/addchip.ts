// The pill that says adding to the selection is on (`in_539`): "Adding: tap to add or remove" and Done. It is not offered: a finger starts adding from its menu (`in_545`).
import { PILL } from "./look.ts";

export function createAddChip(host: HTMLElement, toggle: () => void) {
  const chip = document.createElement("div");
  chip.style.cssText = PILL + ";bottom:60px;left:12px;cursor:pointer;pointer-events:auto";
  host.appendChild(chip);
  chip.addEventListener("pointerup", (e) => { e.stopPropagation(); toggle(); });
  let shown = "";
  return {
    update(mode: "on" | null) {
      if (mode === (shown || null)) return;
      shown = mode ?? "";
      if (!mode) { chip.style.display = "none"; return; }
      chip.style.display = "flex";
      chip.textContent = "Adding: tap to add or remove \u00b7 Done";
      chip.title = "Done";
    },
  };
}

// The pill that says adding to the selection is on (`in_539`): "Adding: tap to add or remove" and Done. It is not offered: a finger starts adding from its menu (`in_556`).
import { PILL } from "./look.ts";

export function createAddChip(host: HTMLElement, toggle: () => void) {
  const chip = document.createElement("div");
  chip.style.cssText = PILL + ";top:12px;left:12px;max-width:calc(100vw - 80px);height:auto;min-height:36px;padding:6px 12px;white-space:normal;cursor:pointer;pointer-events:auto"; // (at the top, clear of the operation bar at the bottom, `in_567`)
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

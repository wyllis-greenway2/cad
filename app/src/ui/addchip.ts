// The pill of adding to the selection (`in_539`), the way to select several with a finger: offered while something is selected ("Add more"), and while it is on ("Adding: tap to add or remove" and Done).
import { PILL } from "./look.ts";

export function createAddChip(host: HTMLElement, toggle: () => void) {
  const chip = document.createElement("div");
  chip.style.cssText = PILL + ";bottom:60px;left:12px;cursor:pointer;pointer-events:auto";
  host.appendChild(chip);
  chip.addEventListener("pointerup", (e) => { e.stopPropagation(); toggle(); });
  let shown = "";
  return {
    update(mode: "on" | "offer" | null) {
      if (mode === (shown || null)) return;
      shown = mode ?? "";
      if (!mode) { chip.style.display = "none"; return; }
      chip.style.display = "flex";
      chip.textContent = mode === "on" ? "Adding: tap to add or remove \u00b7 Done" : "+ Add more";
      chip.title = mode === "on" ? "Done" : "Add";
    },
  };
}

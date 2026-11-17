// The scrubber under a toolpath preview (`in_570`): a slider that moves the head along the toolpath, how far it is, and a cross that ends the preview. It only shows what it is given and says what the person did.
import { PILL } from "./look.ts";

export function createPreviewBar(host: HTMLElement, at: (t: number) => void, close: () => void) {
  const bar = document.createElement("div");
  bar.style.cssText = PILL + ";bottom:60px;left:50%;transform:translateX(-50%);pointer-events:auto;gap:10px";
  const slider = document.createElement("input");
  slider.type = "range"; slider.min = "0"; slider.max = "1000"; slider.step = "1";
  slider.style.cssText = "width:min(36vw,260px);accent-color:#e03131";
  slider.title = "Move along the toolpath";
  const label = document.createElement("span");
  label.style.cssText = "min-width:64px;text-align:right";
  const x = document.createElement("span");
  x.textContent = "✕"; x.title = "Close the preview"; x.style.cssText = "cursor:pointer;padding:0 2px;opacity:.8";
  bar.append(slider, label, x);
  host.appendChild(bar);
  slider.addEventListener("input", () => at(Number(slider.value) / 1000));
  slider.addEventListener("pointerup", () => slider.blur()); // (keys go to the page again: Esc ends the preview)
  x.addEventListener("pointerup", (e) => { e.stopPropagation(); close(); });
  for (const ev of ["pointerdown", "pointerup", "pointermove", "wheel"]) bar.addEventListener(ev, (e) => e.stopPropagation()); // (the page behind does not take them)
  let shown = false;
  return {
    update(v: { at: number; label: string } | null) {
      if (!v) { if (shown) { bar.style.display = "none"; shown = false; } return; }
      if (!shown) { bar.style.display = "flex"; shown = true; }
      if (document.activeElement !== slider) slider.value = String(Math.round(v.at * 1000));
      label.textContent = v.label;
    },
  };
}

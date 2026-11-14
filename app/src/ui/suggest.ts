// The suggested constraints (`in_195`): a little row of round buttons by the selected parts, each an icon with its name as a tooltip; a click applies that constraint.
import { iconKey, iconSvg } from "./icons.ts";
import { placeBubbles } from "../interaction/bubbleplace.ts";
import type { Memory } from "../interaction/bubbleplace.ts";

export function createSuggest(host: HTMLElement, run: (id: string) => void) {
  const row = document.createElement("div");
  row.style.cssText = "position:fixed;left:0;top:0;z-index:8;display:none;gap:5px;padding:4px;border-radius:18px;background:rgba(255,255,255,.92);border:1px dashed #1ab8b3;box-shadow:0 1px 6px rgba(0,0,0,.12);user-select:none;-webkit-user-select:none;touch-action:manipulation;transform:translate(-50%,0)";
  host.appendChild(row);
  let sig = "";
  const memory: Memory = new Map();
  return {
    /** The constraints on offer and where (a screen point) to put the row, or null to hide it. */
    /** `inFront`: boxes of what comes before the row (the ring, the number bubbles, the constraint bubbles): it slides out of their way, or fades if there is no room (`in_264`). */
    update(items: { id: string; label: string }[] | null, at: [number, number] | null, inFront: [number, number, number, number][] = []) {
      if (!items || !items.length || !at) { row.style.display = "none"; sig = ""; return; }
      const now = items.map((i) => i.id).join(",");
      if (now !== sig) {
        sig = now;
        row.replaceChildren(...items.map((it) => {
          const b = document.createElement("div");
          b.title = it.label;
          b.style.cssText = "width:28px;height:28px;border-radius:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#2b2b2d;background:#fff;border:1px solid #cfd0d4";
          b.innerHTML = iconSvg(it.id === "fixed" ? "unlock" : iconKey(it.id)); // (Fix in place offered: an open padlock to close; once it is made its bubble shows the closed one, `in_292`)
          b.addEventListener("mouseenter", () => { b.style.background = "#e8f7f6"; b.style.borderColor = "#1ab8b3"; });
          b.addEventListener("mouseleave", () => { b.style.background = "#fff"; b.style.borderColor = "#cfd0d4"; });
          b.addEventListener("click", (e) => { e.stopPropagation(); run(it.id); });
          return b;
        }));
      }
      row.style.display = "flex";
      // below the number bubble that sits on the part, unless something in front is there: placed like a bubble whose own place is that one
      const w = row.offsetWidth || 40;
      const p = placeBubbles([{ id: "row", x: at[0] + w / 2 - 20, y: at[1] + 77, w }], { lines: [], dots: [], rects: inFront }, memory)[0]!;
      row.style.left = `${Math.round(p.left)}px`;
      row.style.top = `${Math.round(p.top)}px`;
      row.style.opacity = p.faded ? "0.3" : "";
      row.style.pointerEvents = p.faded ? "none" : "";
    },
  };
}

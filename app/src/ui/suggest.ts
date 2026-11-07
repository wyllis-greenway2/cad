// The suggested constraints (`in_195`): a little row of round buttons by the selected parts, each an icon with its name as a tooltip; a click applies that constraint.
import { iconKey, iconSvg } from "./icons.ts";

export function createSuggest(host: HTMLElement, run: (id: string) => void) {
  const row = document.createElement("div");
  row.style.cssText = "position:fixed;left:0;top:0;z-index:8;display:none;gap:5px;padding:4px;border-radius:18px;background:rgba(255,255,255,.92);border:1px dashed #1ab8b3;box-shadow:0 1px 6px rgba(0,0,0,.12);user-select:none;-webkit-user-select:none;touch-action:manipulation;transform:translate(-50%,0)";
  host.appendChild(row);
  let sig = "";
  return {
    /** The constraints on offer and where (a screen point) to put the row, or null to hide it. */
    update(items: { id: string; label: string }[] | null, at: [number, number] | null) {
      if (!items || !items.length || !at) { row.style.display = "none"; sig = ""; return; }
      const now = items.map((i) => i.id).join(",");
      if (now !== sig) {
        sig = now;
        row.replaceChildren(...items.map((it) => {
          const b = document.createElement("div");
          b.title = it.label;
          b.style.cssText = "width:28px;height:28px;border-radius:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#2b2b2d;background:#fff;border:1px solid #cfd0d4";
          b.innerHTML = iconSvg(iconKey(it.id));
          b.addEventListener("mouseenter", () => { b.style.background = "#e8f7f6"; b.style.borderColor = "#1ab8b3"; });
          b.addEventListener("mouseleave", () => { b.style.background = "#fff"; b.style.borderColor = "#cfd0d4"; });
          b.addEventListener("click", (e) => { e.stopPropagation(); run(it.id); });
          return b;
        }));
      }
      row.style.display = "flex";
      row.style.left = `${at[0]}px`;
      row.style.top = `${at[1] + 44}px`; // (below the number bubble that sits on the part)
    },
  };
}

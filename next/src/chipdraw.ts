// The chip by the pointer while a figure is drawn (the old app's: a small white pill with the figure's numbers, each with a padlock; `dec_dimensions_measure_then_lock`, slice b). It only draws what `interaction/typing.ts` `chipFields` says and takes no clicks
// (typing goes through the keys, so it can never stand between the pointer and a click). A number typed is as typed with a closed teal padlock; the others are as measured with an open one; the active one is underlined.
import type { ChipField } from "./interaction/typing.ts";
import { iconSvg } from "./icons.ts";
import { settings } from "./settings.ts";

export function createChip(host: HTMLElement) {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:0;top:0;z-index:9;display:none;align-items:center;gap:10px;height:26px;padding:0 10px;border-radius:13px;background:#fff;border:1px solid #d6d7db;box-shadow:0 1px 3px rgba(0,0,0,.18);font:13px ${settings.ui.font};color:${settings.ui.text};pointer-events:none;user-select:none;-webkit-user-select:none;white-space:nowrap`;
  el.dataset.chip = "";
  host.append(el);
  let sig = "";
  return {
    /** show the chip at a place on the page (null: none) */
    show(c: { fields: ChipField[]; at: [number, number] } | null): void {
      if (!c) { if (el.style.display !== "none") { el.style.display = "none"; el.replaceChildren(); sig = ""; } return; }
      const s = c.fields.map((f) => `${f.label}|${f.text}|${f.typed}|${f.active}`).join(";");
      if (s !== sig) {
        sig = s; el.replaceChildren();
        for (const f of c.fields) {
          const n = document.createElement("span"); n.textContent = f.text; n.title = f.label; n.dataset.field = f.label; n.style.cssText = `font-weight:600;${f.active ? "text-decoration:underline;text-underline-offset:3px;" : ""}${f.typed ? "" : "opacity:.8;"}`;
          const l = document.createElement("span"); l.innerHTML = iconSvg(f.typed ? "lock" : "unlock"); l.dataset.padlock = f.typed ? "closed" : "open"; l.style.cssText = `display:flex;opacity:${f.typed ? 1 : 0.6};color:${f.typed ? "#1ab8b3" : "inherit"}`;
          const g = document.createElement("span"); g.style.cssText = "display:flex;align-items:center;gap:4px"; g.append(n, l); el.append(g);
        }
      }
      el.style.display = "flex"; el.style.transform = `translate(${Math.round(c.at[0] + 16)}px,${Math.round(c.at[1] - 34)}px)`;
    },
  };
}

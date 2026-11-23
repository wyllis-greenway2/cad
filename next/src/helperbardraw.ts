// The helper bar on the page (`q_lean_ui`): one row of round buttons (the prototype's look: white, a light edge, teal when pointed at) standing beside what is selected, a little up and to the right so it is not in the way; the actions on the
// selection on the left, the relations that fit it on the right, a thin line between. Words are in tooltips. It only draws `interaction/helperbar.ts`'s descriptions and says which button was pressed.
import type { Bar, BarItem } from "./interaction/helperbar.ts";
import { iconSvg } from "./icons.ts";
import { settings } from "./settings.ts";

const EDGE = { free: "#d6d7db", holds: "#3fae6a", refused: "#e46a6a", plain: "#d6d7db" } as const;
export function createHelperBar(host: HTMLElement, press: (id: string) => void) {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:0;top:0;display:none;z-index:8;align-items:center;gap:4px;padding:4px;border-radius:20px;background:rgba(255,255,255,.92);box-shadow:0 1px 4px rgba(0,0,0,.2);font:12px ${settings.ui.font};color:${settings.ui.text};user-select:none;-webkit-user-select:none;max-width:calc(100vw - 16px);flex-wrap:wrap`;
  el.addEventListener("pointerdown", (e) => e.stopPropagation()); el.addEventListener("click", (e) => e.stopPropagation()); el.addEventListener("contextmenu", (e) => e.preventDefault());
  host.appendChild(el);
  let sig = "";
  const button = (b: BarItem): HTMLElement => {
    const d = document.createElement("div"), svg = iconSvg(b.icon);
    d.title = b.note ? `${b.label}: ${b.note}` : b.label; d.dataset.bar = b.id;
    d.innerHTML = svg || `<span style="font-weight:600">${b.label.slice(0, 2)}</span>`;
    d.style.cssText = `box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:${settings.buttons.sizePx - 4}px;height:${settings.buttons.sizePx - 4}px;border-radius:50%;background:#fff;border:1.5px solid ${EDGE[b.tone]};cursor:pointer;${b.tone === "refused" ? "opacity:.75;" : ""}`;
    d.addEventListener("pointerenter", () => { d.style.background = "#e8f7f6"; d.style.borderColor = "#1ab8b3"; });
    d.addEventListener("pointerleave", () => { d.style.background = "#fff"; d.style.borderColor = EDGE[b.tone]; });
    d.addEventListener("click", (e) => { e.stopPropagation(); press(b.id); });
    return d;
  };
  return {
    /** Each picture: the bar, and where on the page it stands from (the thing it belongs to); null hides it. Returns the box it takes (for what must keep clear of it). */
    show(bar: Bar | null, at: [number, number] | null, vw: number, vh: number): [number, number, number, number] | null {
      if (!bar || !at || (!bar.left.length && !bar.right.length)) { el.style.display = "none"; sig = ""; return null; }
      const s = JSON.stringify(bar);
      if (s !== sig) {
        sig = s; el.replaceChildren(...bar.left.map(button));
        if (bar.left.length && bar.right.length) { const l = document.createElement("div"); l.style.cssText = "width:1px;align-self:stretch;background:#d6d7db;margin:2px 3px"; el.append(l); }
        el.append(...bar.right.map(button));
      }
      el.style.display = "flex";
      const r = el.getBoundingClientRect(), w = r.width, h = r.height;
      // up and to the right of what it belongs to, kept inside the page, and under it when there is no room above
      let x = at[0] + 22, y = at[1] - h - 26;
      if (y < 8) y = at[1] + 30;
      x = Math.max(8, Math.min(x, vw - w - 8)); y = Math.max(8, Math.min(y, vh - h - 8));
      el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      return [x, y, x + w, y + h];
    },
    rect: (): [number, number, number, number] | null => { if (el.style.display === "none") return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; },
  };
}

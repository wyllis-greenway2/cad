// The helper bar on the page (`q_lean_ui`, `in_1574`, `in_1575`): the old app's row, in its look and at its place: a rounded white row with a teal edge standing below what is selected and a little to its left; the actions on the selection on the left, what is suggested on the right
// in a dashed teal outline of its own, a thin line between. Words are in tooltips. It only draws `interaction/helperbar.ts`'s descriptions and says which button was pressed.
import type { Bar, BarItem } from "./interaction/helperbar.ts";
import { iconSvg } from "./icons.ts";
import { settings } from "./settings.ts";

const EDGE = { free: "#d6d7db", holds: "#3fae6a", refused: "#e46a6a", plain: "#d6d7db" } as const;
export function createHelperBar(host: HTMLElement, press: (id: string) => void) {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:0;top:0;display:none;z-index:8;align-items:center;gap:5px;padding:4px;border-radius:18px;background:rgba(255,255,255,.92);border:1px solid #1ab8b3;box-shadow:0 1px 6px rgba(0,0,0,.12);font:12px ${settings.ui.font};color:${settings.ui.text};user-select:none;-webkit-user-select:none;max-width:calc(100vw - 16px)`; // (the old app's row: `ui/suggest.ts`)
  el.addEventListener("pointerdown", (e) => e.stopPropagation()); el.addEventListener("click", (e) => e.stopPropagation()); el.addEventListener("contextmenu", (e) => e.preventDefault());
  host.appendChild(el);
  let sig = "";
  const button = (b: BarItem): HTMLElement => {
    const d = document.createElement("div"), svg = iconSvg(b.icon);
    d.title = b.note ? `${b.label}: ${b.note}` : b.label; d.dataset.bar = b.id;
    d.innerHTML = svg || `<span style="font-weight:600">${b.label.slice(0, 2)}</span>`;
    d.style.cssText = `box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#fff;border:1.5px solid ${EDGE[b.tone]};cursor:pointer;${b.tone === "refused" ? "opacity:.75;" : ""}`;
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
        sig = s;
        const seg = document.createElement("div"); // (what is suggested, on the right, in a dashed outline of its own, `in_1177`)
        seg.style.cssText = "display:flex;align-items:center;gap:5px;padding:2px;border-radius:16px;border:1px dashed #1ab8b3";
        seg.append(...bar.right.map(button));
        const kids: HTMLElement[] = [...bar.left.map(button)];
        if (bar.left.length && bar.right.length) { const l = document.createElement("div"); l.style.cssText = "width:1px;align-self:stretch;margin:3px 1px;background:#cfd0d4"; kids.push(l); }
        if (bar.right.length) kids.push(seg);
        el.replaceChildren(...kids);
      }
      el.style.display = "flex";
      const r = el.getBoundingClientRect(), w = r.width, h = r.height;
      // below the thing it belongs to, a little to its left, where the old app puts it: its top 67 px under the place, its left 6 px before it (`ui/suggest.ts` through `bubbleplace.ts`); above it when there is no room below
      let x = at[0] - 6, y = at[1] + 67;
      if (y + h > vh - 8) y = at[1] - h - 40;
      x = Math.max(8, Math.min(x, vw - w - 8)); y = Math.max(8, Math.min(y, vh - h - 8));
      el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      return [x, y, x + w, y + h];
    },
    rect: (): [number, number, number, number] | null => { if (el.style.display === "none") return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; },
  };
}

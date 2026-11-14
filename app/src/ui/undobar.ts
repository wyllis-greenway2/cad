// Undo and redo kept on the screen for a finger (`in_283`): a pill at the middle of the bottom, where a thumb reaches (`in_301`) with two round buttons. A mouse has the keys and the menu; a finger has neither, so on a touch screen they are always there.
import { iconSvg } from "./icons.ts";

export function createUndoBar(host: HTMLElement, undo: () => void, redo: () => void) {
  const bar = document.createElement("div");
  bar.style.cssText = "position:fixed;z-index:7;left:50%;transform:translateX(-50%);bottom:40px;display:none;gap:8px;padding:6px;border-radius:28px;background:#34363b;box-shadow:0 2px 8px rgba(0,0,0,.3);user-select:none;-webkit-user-select:none;touch-action:manipulation";
  const button = (icon: string, title: string, fire: () => void) => {
    const b = document.createElement("div");
    b.innerHTML = iconSvg(icon);
    b.title = title;
    b.style.cssText = "display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:22px;background:rgba(255,255,255,.14);color:#fff;cursor:pointer";
    (b.firstElementChild as SVGElement).setAttribute("width", "24");
    (b.firstElementChild as SVGElement).setAttribute("height", "24");
    b.addEventListener("click", (e) => { e.stopPropagation(); fire(); });
    b.addEventListener("pointerdown", (e) => e.stopPropagation()); // (the page's input must not take the press as a tap or a drag of its own)
    return b;
  };
  const u = button("undo", "Undo", undo);
  const r = button("redo", "Redo", redo);
  bar.append(u, r);
  host.appendChild(bar);
  return {
    /** `on`: shown (a touch screen); `can`: what there is to undo and redo (the others are dimmed). */
    update(on: boolean, can: { undo: boolean; redo: boolean }) {
      bar.style.display = on ? "flex" : "none";
      u.style.opacity = can.undo ? "1" : "0.35";
      r.style.opacity = can.redo ? "1" : "0.35";
    },
  };
}

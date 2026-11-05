// The right-click menu (`in_133`): the operations as little round bubbles in the style of the constraint bubbles, laid in a ring around the click point. Each shows its icon, the words are in
// the tooltip; one that cannot start from what is selected is dimmed. It displays what the interaction layer says and reports which was chosen.
import { iconSvg } from "./icons.ts";

export interface RingItem { id: string; label: string; icon: string; enabled: boolean; why: string | null }
const SIZE = 36;
const GAP = 8;

export function createRing(host: HTMLElement, onChoose: (id: string) => void) {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;display:none;z-index:10;user-select:none;-webkit-user-select:none";
  host.appendChild(root);
  root.addEventListener("contextmenu", (e) => e.preventDefault());
  return {
    show(x: number, y: number, items: RingItem[]) {
      root.replaceChildren();
      const n = items.length;
      if (!n) return;
      const R = Math.max(SIZE + 14, ((SIZE + GAP) * n) / (2 * Math.PI)); // far enough out that neighbours do not touch
      // the whole ring is kept on the screen: the centre moves in from an edge
      const m = R + SIZE / 2 + 6;
      const cx = Math.max(m, Math.min(window.innerWidth - m, x));
      const cy = Math.max(m, Math.min(window.innerHeight - m, y));
      items.forEach((it, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const b = document.createElement("div");
        b.innerHTML = iconSvg(it.icon);
        b.title = it.enabled || !it.why ? it.label : `${it.label}: ${it.why}`;
        b.style.cssText = `position:absolute;left:${Math.round(cx + Math.cos(a) * R - SIZE / 2)}px;top:${Math.round(cy + Math.sin(a) * R - SIZE / 2)}px;width:${SIZE}px;height:${SIZE}px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#fff;border:1px solid #d6d7db;box-shadow:0 1px 6px rgba(0,0,0,.14);cursor:${it.enabled ? "pointer" : "default"};opacity:${it.enabled ? 1 : 0.38}`;
        if (it.enabled) {
          b.addEventListener("pointerenter", () => { b.style.borderColor = "#1ab8b3"; });
          b.addEventListener("pointerleave", () => { b.style.borderColor = "#d6d7db"; });
          b.addEventListener("pointerup", (e) => { e.stopPropagation(); onChoose(it.id); });
        }
        root.appendChild(b);
      });
      root.style.display = "block";
    },
    hide() { root.style.display = "none"; },
    get open() { return root.style.display !== "none"; },
  };
}

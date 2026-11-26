// The badge of the tool that is armed (`dec_three_surfaces`): its icon in a small dark circle that follows the pointer, so the tool in hand is always seen. It takes no clicks.
import { iconSvg } from "./icons.ts";

export function createBadge(host: HTMLElement) {
  const el = document.createElement("div"); el.dataset.badge = "";
  el.style.cssText = "position:fixed;left:0;top:0;z-index:12;display:none;width:26px;height:26px;border-radius:50%;background:#34363b;color:#fff;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.3)";
  host.appendChild(el);
  let icon = "";
  return {
    /** each picture: the tool's icon (null: none armed) and where the pointer is (null: it is off the page) */
    show(key: string | null, at: { x: number; y: number } | null): void {
      if (!key || !at) { el.style.display = "none"; return; }
      if (key !== icon) { icon = key; el.innerHTML = `<span style="display:flex;width:16px;height:16px">${iconSvg(key)}</span>`; el.dataset.badge = key; }
      el.style.display = "flex"; el.style.transform = `translate(${Math.round(at.x + 14)}px,${Math.round(at.y + 14)}px)`;
    },
  };
}

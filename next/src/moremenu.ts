// The "..." button and its list on the page (`q_lean_ui`): a round button at the top right (the prototype's look) that opens a short list under it; a click elsewhere or Esc closes it; a choice that cannot be made is dimmed with its reason in the tooltip.
import { iconSvg } from "./icons.ts";
import { settings } from "./settings.ts";
import type { MoreItem } from "./interaction/moremenu.ts";

export function createMoreMenu(host: HTMLElement, choose: (id: MoreItem["id"]) => void) {
  // the old app's button (`app/src/ui/controls.ts`): a dark filled circle, 40 px, with white dots, at the top right
  const b = document.createElement("div"); b.textContent = "⋯"; b.title = "More"; b.dataset.more = "button";
  b.style.cssText = "position:fixed;z-index:11;top:12px;right:12px;width:40px;height:40px;border-radius:20px;background:#34363b;color:#fff;font:700 22px/38px system-ui,sans-serif;text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);user-select:none;-webkit-user-select:none";
  const list = document.createElement("div");
  list.style.cssText = `position:fixed;right:12px;top:60px;display:none;flex-direction:column;min-width:230px;padding:6px;border-radius:14px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);z-index:9;font:13px ${settings.ui.font};color:${settings.ui.text};user-select:none;-webkit-user-select:none`;
  list.dataset.more = "list";
  for (const el of [b, list]) { el.addEventListener("pointerdown", (e) => e.stopPropagation()); el.addEventListener("contextmenu", (e) => e.preventDefault()); }
  host.append(b, list);
  let open = false;
  const close = () => { open = false; list.style.display = "none"; };
  b.addEventListener("click", (e) => { e.stopPropagation(); if (open) { close(); return; } open = true; list.style.display = "flex"; });
  addEventListener("pointerdown", (e) => { if (open && !list.contains(e.target as Node) && e.target !== b) close(); }, true);
  return {
    isOpen: () => open, close,
    /** The list as it is now (drawn again when it opens or the choices change). */
    show(items: MoreItem[]): void {
      const sig = JSON.stringify(items); if (list.dataset.sig === sig) return; list.dataset.sig = sig;
      list.replaceChildren(...items.map((it) => {
        const r = document.createElement("div"); r.dataset.item = it.id; r.title = it.enabled ? it.label : it.why ?? "";
        r.style.cssText = `display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;${it.enabled ? "cursor:pointer" : "opacity:.4"}`;
        r.innerHTML = `<span style="display:flex">${iconSvg(it.icon)}</span><span>${it.label}</span>`;
        if (it.enabled) { r.addEventListener("pointerenter", () => (r.style.background = "#e8f7f6")); r.addEventListener("pointerleave", () => (r.style.background = "")); r.addEventListener("click", (e) => { e.stopPropagation(); close(); choose(it.id); }); }
        return r;
      }));
    },
  };
}
